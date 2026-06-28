"""BillingCheckoutService — orchestrates checkouts for Hub subscriptions and Factura prepaid e-CFs."""

from __future__ import annotations

import logging
from typing import Any, Dict
from sqlalchemy.orm import Session

from app.models.organization import Organization
from app.models.organization_subscription import OrganizationSubscription
from app.models.subscription_plan import SubscriptionPlan
from app.models.user import User
from app.models.user_subscription import UserSubscription
from app import config as settings
from app.services.lago_service import LagoService, LagoAPIError
from app.services.mio_service import MioService
from app.models.mio_payment_order import MioPaymentOrder
from app.utils.dates import utc_now

logger = logging.getLogger(__name__)


class BillingCheckoutService:
    """Service to coordinate between Lago (billing engine) and MIO (payment gateway)."""

    def __init__(self, db: Session):
        self.db = db
        self.lago = LagoService()
        self.mio = MioService()

    async def subscribe_organization(
        self,
        org_id: str,
        plan_name: str,
        payment_method: str = "card",
    ) -> Dict[str, Any]:
        """Subscribe an organization to a Hub subscription plan (Inicial, Profesional, Despacho)."""
        # 1. Resolve organization and plan
        org = self.db.query(Organization).filter(Organization.id == org_id).first()
        if not org:
            raise ValueError("Organización no encontrada")

        plan = self.db.query(SubscriptionPlan).filter(SubscriptionPlan.name == plan_name).first()
        if not plan:
            raise ValueError(f"Plan '{plan_name}' no encontrado")

        # Fallback price mapping if price_dop is not set
        price_dop = plan.price_dop
        if not price_dop:
            fallbacks = {
                "inicial": 999.00,
                "profesional": 2999.00,
                "despacho": 7999.00,
            }
            price_dop = fallbacks.get(plan_name.lower(), 999.00)

        price_cents = int(price_dop * 100)

        # 2. Idempotent customer registration in Lago
        logger.info(f"Upserting customer in Lago for org: {org.name} ({org.id})")
        # In a real DR app, we map the tax ID (RNC) as legal number
        lago_customer = await self.lago.create_or_update_customer(
            external_id=str(org.id),
            name=org.name,
            email=org.email_contact or "administracion@fintral.com",
            rnc=org.tax_id,
        )

        lago_customer_id = lago_customer.get("customer", {}).get("lago_id")

        # 3. Create active subscription record in Fintral DB
        # Cancel any previous active subscriptions to avoid overlap
        existing_subs = (
            self.db.query(OrganizationSubscription)
            .filter(
                OrganizationSubscription.organization_id == org.id,
                OrganizationSubscription.status.in_(["active", "trialing"])
            )
            .all()
        )
        for s in existing_subs:
            s.status = "canceled"
            s.canceled_at = utc_now()

        # Build subscription dates
        # One month from now
        from datetime import timedelta
        cycle_start = utc_now()
        cycle_end = cycle_start + timedelta(days=30)

        sub_id = f"sub_{str(org.id)[:8]}_{plan_name}"
        sub_obj = OrganizationSubscription(
            organization_id=org.id,
            plan_id=plan.id,
            status="active" if payment_method == "transfer" else "trialing",  # trialing until paid if card
            payment_method=payment_method,
            lago_customer_id=lago_customer_id,
            lago_plan_code=plan.lago_plan_code or plan_name,
            lago_subscription_id=sub_id,
            billing_cycle_start=cycle_start,
            billing_cycle_end=cycle_end,
        )
        self.db.add(sub_obj)
        self.db.flush()

        # 4. Create subscription in Lago
        logger.info(f"Subscribing customer in Lago to plan: {plan_name}")
        try:
            # Plan code in Lago must match the subscription plan configuration code
            await self.lago.create_subscription(
                customer_external_id=str(org.id),
                plan_code=plan.lago_plan_code or plan_name,
                external_id=sub_id,
            )
        except LagoAPIError as exc:
            logger.error(f"Lago subscription creation failed: {exc.response_body}")
            raise ValueError(f"Error al crear suscripción en Lago: {exc}")

        # If paying by card, create MIO payment order immediately for the first month
        if payment_method == "card" and price_cents > 0:
            webhook_url = settings.MIO_WEBHOOK_URL or "https://api.fintral.com/api/mio/webhook"
            success_url = settings.MIO_SUCCESS_REDIRECT or "https://app.fintral.com/billing/success"
            failed_url = settings.MIO_FAILED_REDIRECT or "https://app.fintral.com/billing/failed"

            # Create order in MIO
            logger.info(f"Creating MIO checkout order for first month of Hub {plan_name}")
            mio_order = await self.mio.create_order(
                amount_cents=price_cents,
                description=f"Fintral Hub: Plan {plan.display_name} - 1er Mes",
                webhook_url=webhook_url,
                success_url=success_url,
                failed_url=failed_url,
            )

            # Persist MIO checkout order
            db_order = MioPaymentOrder(
                order_uuid=mio_order["order_uuid"],
                organization_id=org.id,
                amount_cents=price_cents,
                status="PENDING",
                checkout_url=mio_order["checkout_url"],
            )
            self.db.add(db_order)
            self.db.commit()

            return {
                "subscription_id": str(sub_obj.id),
                "payment_method": "card",
                "checkout_url": mio_order["checkout_url"],
                "order_uuid": mio_order["order_uuid"],
            }
        
        self.db.commit()
        return {
            "subscription_id": str(sub_obj.id),
            "payment_method": payment_method,
            "status": "active" if payment_method == "transfer" else "trialing",
        }

    async def purchase_prepaid_ecf(
        self,
        org_id: str,
        block_type: str = "ecf_block_100",
        payment_method: str = "card",
    ) -> Dict[str, Any]:
        """Purchase a prepaid block of e-CF documents for Fintral Factura (completely free platform access)."""
        org = self.db.query(Organization).filter(Organization.id == org_id).first()
        if not org:
            raise ValueError("Organización no encontrada")

        # Map block type to prices and credit sizes
        # E.g. 'ecf_block_100' costs RD$500
        block_prices = {
            "ecf_block_100": 500.00,
            "ecf_block_500": 2000.00,
            "ecf_block_1000": 3500.00,
        }
        
        block_sizes = {
            "ecf_block_100": 100,
            "ecf_block_500": 500,
            "ecf_block_1000": 1000,
        }

        price_dop = block_prices.get(block_type)
        if not price_dop:
            raise ValueError(f"Tipo de bloque e-CF desconocido: {block_type}")

        price_cents = int(price_dop * 100)
        units_count = block_sizes.get(block_type, 100)

        # 1. Idempotent customer registration in Lago
        logger.info(f"Upserting customer in Lago for prepaid e-CF: {org.id}")
        await self.lago.create_or_update_customer(
            external_id=str(org.id),
            name=org.name,
            email=org.email_contact or "administracion@fintral.com",
            rnc=org.tax_id,
        )

        # 2. Create a one-off invoice in Lago
        fees = [
            {
                "add_on_code": block_type,
                "units": 1,
                "unit_amount_cents": price_cents,
                "description": f"Bloque prepagado de {units_count} e-CFs"
            }
        ]

        logger.info(f"Creating one-off invoice in Lago for prepaid e-CF block {block_type}")
        lago_invoice = await self.lago.create_one_off_invoice(
            customer_external_id=str(org.id),
            fees=fees,
        )

        lago_invoice_id = lago_invoice.get("invoice", {}).get("lago_id")

        # 3. Create checkout order on MIO if payment method is card
        if payment_method == "card":
            webhook_url = settings.MIO_WEBHOOK_URL or "https://api.fintral.com/api/mio/webhook"
            success_url = settings.MIO_SUCCESS_REDIRECT or "https://app.fintral.com/billing/success"
            failed_url = settings.MIO_FAILED_REDIRECT or "https://app.fintral.com/billing/failed"

            # Add 5% card processing fee to MIO order amount
            fee_cents = int(price_cents * 0.05)
            total_cents = price_cents + fee_cents

            logger.info(f"Creating MIO checkout order for one-off invoice {lago_invoice_id} with 5% fee")
            mio_order = await self.mio.create_order(
                amount_cents=total_cents,
                description=f"Fintral Factura: {units_count} Comprobantes Electrónicos (e-CF)",
                webhook_url=webhook_url,
                success_url=success_url,
                failed_url=failed_url,
            )

            # Persist MIO checkout order
            db_order = MioPaymentOrder(
                order_uuid=mio_order["order_uuid"],
                lago_invoice_id=lago_invoice_id,
                organization_id=org.id,
                amount_cents=total_cents,
                status="PENDING",
                checkout_url=mio_order["checkout_url"],
            )
            self.db.add(db_order)
            self.db.commit()

            return {
                "lago_invoice_id": lago_invoice_id,
                "checkout_url": mio_order["checkout_url"],
                "order_uuid": mio_order["order_uuid"],
                "amount": price_dop,
            }
            
        self.db.commit()
        return {
            "lago_invoice_id": lago_invoice_id,
            "payment_method": "transfer",
            "amount": price_dop,
        }

    async def initiate_user_subscription_checkout(
        self,
        user_id: str,
        plan_name: str,
    ) -> Dict[str, Any]:
        """Create a pending MIO checkout order for a user's subscription."""
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            raise ValueError("Usuario no encontrado")

        plan = self.db.query(SubscriptionPlan).filter(SubscriptionPlan.name == plan_name).first()
        if not plan:
            raise ValueError(f"Plan '{plan_name}' no encontrado")

        price_dop = plan.price_dop
        if not price_dop:
            fallbacks = {
                "inicial": 999.00,
                "profesional": 2999.00,
                "despacho": 7999.00,
            }
            price_dop = fallbacks.get(plan_name.lower(), 999.00)

        price_cents = int(price_dop * 100)
        
        # Add 5% card processing fee to MIO order amount
        fee_cents = int(price_cents * 0.05)
        total_cents = price_cents + fee_cents

        # Create order in MIO
        webhook_url = settings.MIO_WEBHOOK_URL or "https://api.fintral.com/api/mio/webhook"
        success_url = settings.MIO_SUCCESS_REDIRECT or "https://app.fintral.com/billing/success"
        failed_url = settings.MIO_FAILED_REDIRECT or "https://app.fintral.com/billing/failed"

        logger.info(f"Creating MIO checkout order for user subscription: {plan_name} with 5% fee")
        mio_order = await self.mio.create_order(
            amount_cents=total_cents,
            description=f"Fintral Hub: Plan {plan.display_name} - Suscripción",
            webhook_url=webhook_url,
            success_url=success_url,
            failed_url=failed_url,
        )

        db_order = MioPaymentOrder(
            order_uuid=mio_order["order_uuid"],
            user_id=user.id,
            plan_id=plan.id,
            amount_cents=total_cents,
            status="PENDING",
            checkout_url=mio_order["checkout_url"],
        )
        self.db.add(db_order)
        self.db.commit()

        return {
            "payment_method": "card",
            "checkout_url": mio_order["checkout_url"],
            "order_uuid": mio_order["order_uuid"],
        }

    async def provision_user_subscription(
        self,
        user_id: str,
        plan_name: str,
        payment_method: str,
    ) -> UserSubscription:
        """Create or activate a UserSubscription in the DB and register the user in Lago."""
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            raise ValueError("Usuario no encontrado")

        plan = self.db.query(SubscriptionPlan).filter(SubscriptionPlan.name == plan_name).first()
        if not plan:
            raise ValueError(f"Plan '{plan_name}' no encontrado")

        # 1. Register/Update customer in Lago
        logger.info(f"Upserting customer in Lago for user: {user.email} ({user.id})")
        lago_customer = await self.lago.create_or_update_customer(
            external_id=str(user.id),
            name=user.full_name or user.email,
            email=user.email,
            rnc=None,
        )

        lago_customer_id = lago_customer.get("customer", {}).get("lago_id")

        # 2. Cancel any previous active subscriptions to avoid overlap
        existing_subs = (
            self.db.query(UserSubscription)
            .filter(
                UserSubscription.user_id == user.id,
                UserSubscription.status.in_(["active", "trialing"])
            )
            .all()
        )
        for s in existing_subs:
            s.status = "canceled"
            s.canceled_at = utc_now()

        # 3. Create active subscription in Lago
        sub_id = f"sub_{str(user.id)[:8]}_{plan_name}"
        logger.info(f"Subscribing user in Lago to plan: {plan_name}")
        try:
            await self.lago.create_subscription(
                customer_external_id=str(user.id),
                plan_code=plan.lago_plan_code or plan_name,
                external_id=sub_id,
            )
        except LagoAPIError as exc:
            logger.error(f"Lago subscription creation failed: {exc.response_body}")
            raise ValueError(f"Error al crear suscripción en Lago: {exc}")

        # 4. Create UserSubscription record in Fintral DB
        from datetime import timedelta
        cycle_start = utc_now()
        cycle_end = cycle_start + timedelta(days=30)

        sub_obj = UserSubscription(
            user_id=user.id,
            plan_id=plan.id,
            status="active",
            payment_method=payment_method,
            lago_customer_id=lago_customer_id,
            lago_plan_code=plan.lago_plan_code or plan_name,
            lago_subscription_id=sub_id,
            billing_cycle_start=cycle_start,
            billing_cycle_end=cycle_end,
        )
        self.db.add(sub_obj)
        self.db.commit()
        return sub_obj
