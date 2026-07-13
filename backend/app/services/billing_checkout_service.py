"""BillingCheckoutService — orchestrates checkouts for Hub subscriptions and Factura prepaid e-CFs."""

from __future__ import annotations

import logging
import uuid
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

        price_cents = plan.price_monthly_cents

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
                billing_time="anniversary",
            )
        except LagoAPIError as exc:
            logger.error(f"Lago subscription creation failed: {exc.response_body}")
            raise ValueError(f"Error al crear suscripción en Lago: {exc}")

        # If paying by card, create MIO payment order using PaymentIntentService
        if payment_method == "card" and price_cents > 0:
            from app.services.payment_intent_service import PaymentIntentService
            intent_svc = PaymentIntentService(self.db)
            context_id = f"org_sub:{org.id}"

            db_order = await intent_svc.create_or_replace(
                amount_cents=price_cents,
                description=f"Fintral Hub: Plan {plan.display_name} - 1er Mes",
                context_type="subscription",
                context_id=context_id,
                user_id=None,
                organization_id=org.id,
                webhook_url=settings.MIO_WEBHOOK_URL,
                success_url=settings.MIO_SUCCESS_REDIRECT,
                failed_url=settings.MIO_FAILED_REDIRECT,
            )
            self.db.commit()

            return {
                "subscription_id": str(sub_obj.id),
                "payment_method": "card",
                "checkout_url": db_order.checkout_url,
                "order_uuid": db_order.order_uuid,
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

        # 3. Create MIO order for card payment using PaymentIntentService
        if payment_method == "card":
            from app.services.payment_intent_service import PaymentIntentService
            intent_svc = PaymentIntentService(self.db)
            context_id = f"ecf:{org.id}:{block_type}"

            # Add 5% card processing fee to MIO order amount
            fee_cents = int(price_cents * 0.05)
            total_cents = price_cents + fee_cents

            db_order = await intent_svc.create_or_replace(
                amount_cents=total_cents,
                description=f"Fintral Factura: {units_count} Comprobantes Electrónicos (e-CF)",
                context_type="ecf_blocks",
                context_id=context_id,
                user_id=None,
                organization_id=org.id,
                webhook_url=settings.MIO_WEBHOOK_URL,
                success_url=settings.MIO_SUCCESS_REDIRECT,
                failed_url=settings.MIO_FAILED_REDIRECT,
            )
            db_order.lago_invoice_id = lago_invoice_id
            self.db.commit()

            return {
                "lago_invoice_id": lago_invoice_id,
                "checkout_url": db_order.checkout_url,
                "order_uuid": db_order.order_uuid,
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

        # Create MIO order using PaymentIntentService
        from app.services.payment_intent_service import PaymentIntentService
        intent_svc = PaymentIntentService(self.db)
        context_id = f"user_sub:{user.id}"

        db_order = await intent_svc.create_or_replace(
            amount_cents=total_cents,
            description=f"Fintral Hub: Plan {plan.display_name} - Suscripción",
            context_type="user_subscription",
            context_id=context_id,
            user_id=user.id,
            plan_id=plan.id,
            webhook_url=settings.MIO_WEBHOOK_URL,
            success_url=settings.MIO_SUCCESS_REDIRECT,
            failed_url=settings.MIO_FAILED_REDIRECT,
        )
        self.db.commit()

        return {
            "payment_method": "card",
            "checkout_url": db_order.checkout_url,
            "order_uuid": db_order.order_uuid,
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
        lago_customer_id = None
        try:
            lago_customer = await self.lago.create_or_update_customer(
                external_id=str(user.id),
                name=user.full_name or user.email,
                email=user.email,
                rnc=None,
            )
            lago_customer_id = lago_customer.get("customer", {}).get("lago_id")
        except Exception as exc:
            logger.warning(f"Lago customer upsert failed: {exc}. Proceeding with local DB provisioning.")

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
        except Exception as exc:
            logger.warning(f"Lago subscription creation failed: {exc}. Proceeding with local DB provisioning.")

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

    def _compute_proration_cents(self, org_id: str, unit_price_cents: int, active_sub: OrganizationSubscription | None = None) -> tuple[int, int, int]:
        """Calculate prorated price for a slot addon based on remaining days in current billing cycle.

        Returns (prorated_cents, days_remaining, cycle_days).
        If no active subscription found, returns (unit_price_cents, 30, 30).
        """
        from math import ceil
        sub = active_sub
        if not sub:
            sub = (
                self.db.query(OrganizationSubscription)
                .filter(
                    OrganizationSubscription.organization_id == org_id,
                    OrganizationSubscription.status.in_(["active", "trialing"]),
                )
                .order_by(OrganizationSubscription.created_at.desc())
                .first()
            )
        if not sub or not sub.billing_cycle_end or not sub.billing_cycle_start:
            return unit_price_cents, 30, 30

        now = utc_now()
        cycle_end = sub.billing_cycle_end
        cycle_start = sub.billing_cycle_start

        # If already past cycle end, no proration (full charge for new cycle)
        if now >= cycle_end:
            return unit_price_cents, 30, 30

        total_cycle_days = max((cycle_end - cycle_start).days, 1)
        days_remaining = max((cycle_end - now).days, 1)  # at least 1 day

        # Prorate: ceil to avoid undercharging by fractions
        prorated_cents = ceil(unit_price_cents * days_remaining / total_cycle_days)
        return prorated_cents, days_remaining, total_cycle_days

    async def process_complete_cart(
        self,
        org_id: str,
        user_id: str,
        items: list[Dict[str, Any]],
        payment_method: str = "card",
    ) -> Dict[str, Any]:
        """Process a mixed cart (plan + addons + ecf blocks) in a single Lago transaction.

        Supports:
        - plan_change: upgrade/downgrade with automatic Lago proration
        - ecf_blocks: prepaid one-off invoice
        - entity_slot / user_slot: recurring addon as separate Lago subscription
        - renewal: extends billing cycle (legacy)

        Returns MIO checkout URL for card payments or success message for transfer.
        """
        from datetime import timedelta

        org = self.db.query(Organization).filter(Organization.id == org_id).first()
        if not org:
            raise ValueError("Organización no encontrada")

        # Get active subscription before any status updates
        current_sub = (
            self.db.query(OrganizationSubscription)
            .filter(
                OrganizationSubscription.organization_id == org.id,
                OrganizationSubscription.status.in_(["active", "trialing"]),
            )
            .order_by(OrganizationSubscription.created_at.desc())
            .first()
        )

        if not items:
            raise ValueError("El carrito está vacío")

        # 1. Separate items by type
        plan_items = [i for i in items if i.get("type") == "plan_change"]
        ecf_items = [i for i in items if i.get("type") == "ecf_blocks"]
        slot_items = [i for i in items if i.get("type") in ("entity_slot", "user_slot")]
        renewal_items = [i for i in items if i.get("type") == "renewal"]

        # 2. Idempotent customer registration in Lago
        lago_customer = await self.lago.create_or_update_customer(
            external_id=str(org.id),
            name=org.name,
            email=org.email_contact or "administracion@fintral.com",
            rnc=org.tax_id,
        )
        lago_customer_id = lago_customer.get("customer", {}).get("lago_id")

        # 3. Handle plan change (with Lago proration)
        subscription_id = None
        if plan_items:
            plan_name = plan_items[0]["plan_name"]
            commitment_months = plan_items[0].get("commitment_months", 1)

            plan = self.db.query(SubscriptionPlan).filter(SubscriptionPlan.name == plan_name).first()
            if not plan:
                raise ValueError(f"Plan '{plan_name}' no encontrado")

            # Determine plan code based on commitment
            plan_code = plan.lago_plan_code or plan_name
            if commitment_months >= 12:
                plan_code = f"{plan_code}_12m"

            # Cancel existing active subscriptions
            existing_subs = (
                self.db.query(OrganizationSubscription)
                .filter(
                    OrganizationSubscription.organization_id == org.id,
                    OrganizationSubscription.status.in_(["active", "trialing"]),
                )
                .all()
            )
            for s in existing_subs:
                s.status = "canceled"
                s.canceled_at = utc_now()

            # For mid-cycle upgrades, keep the existing billing cycle end date
            # The user pays only the prorated difference for the remaining days
            now = utc_now()
            if current_sub and current_sub.billing_cycle_end and now < current_sub.billing_cycle_end:
                cycle_start = current_sub.billing_cycle_start
                cycle_end = current_sub.billing_cycle_end
            else:
                cycle_start = now
                cycle_end = cycle_start + timedelta(days=30 * commitment_months)

            sub_id = f"sub_{str(org.id)[:8]}_{plan_name}"
            sub_obj = OrganizationSubscription(
                organization_id=org.id,
                plan_id=plan.id,
                status="active" if payment_method == "transfer" else "trialing",
                payment_method=payment_method,
                lago_customer_id=lago_customer_id,
                lago_plan_code=plan_code,
                lago_subscription_id=sub_id,
                billing_cycle_start=cycle_start,
                billing_cycle_end=cycle_end,
                billing_time="anniversary",
            )
            self.db.add(sub_obj)
            self.db.flush()
            subscription_id = str(sub_obj.id)

            # Create subscription in Lago
            try:
                await self.lago.create_subscription(
                    customer_external_id=str(org.id),
                    plan_code=plan_code,
                    external_id=sub_id,
                    billing_time="anniversary",
                )
            except LagoAPIError as exc:
                logger.error(f"Lago subscription creation failed: {exc.response_body}")
                raise ValueError(f"Error al crear suscripción en Lago: {exc}")

        # 4. Handle recurring addons (entity_slot, user_slot)
        lago_subscription_ids = [subscription_id] if subscription_id else []
        for slot in slot_items:
            slot_type = slot["type"]
            target_org_id = slot.get("target_org_id", org_id)

            if slot_type == "entity_slot":
                # entity_slot is user-level capacity — provision on UserSubscription
                # Don't create a Lago subscription (it's a DB counter only)
                user_sub = (
                    self.db.query(UserSubscription)
                    .filter(
                        UserSubscription.user_id == user_id,
                        UserSubscription.status.in_(["active", "trialing"]),
                    )
                    .order_by(UserSubscription.created_at.desc())
                    .first()
                )
                if user_sub:
                    qty = slot.get("quantity", 1)
                    user_sub.addon_entity_slots = (user_sub.addon_entity_slots or 0) + qty
                    logger.info(f"Provisioned {qty} entity_slot(s) on user {user_id}")
                continue

            if slot_type == "user_slot":
                # user_slot is per-org — requires target_org_id
                slot_plan_code = "user_slot"
                slot_name = "Slot de Usuario"
            else:
                continue  # unknown slot type

            slot_sub_id = f"sub_{str(target_org_id)[:8]}_{slot_type}_{uuid.uuid4().hex[:8]}"

            try:
                await self.lago.create_subscription(
                    customer_external_id=str(target_org_id),
                    plan_code=slot_plan_code,
                    external_id=slot_sub_id,
                    name=f"{slot_name} ({org.name})",
                    billing_time="anniversary",
                )
            except LagoAPIError as exc:
                logger.error(f"Lago slot subscription failed: {exc.response_body}")
                raise ValueError(f"Error al crear suscripción de {slot_name}: {exc}")

            lago_subscription_ids.append(slot_sub_id)

        # 5. Handle prepaid e-CF blocks (one-off invoice)
        lago_invoice_id = None
        if ecf_items:
            fees = []
            # Use target_org_id if provided, otherwise default to current org
            target_ecf_org_id = None
            for ecf in ecf_items:
                target_ecf_org_id = ecf.get("target_org_id") or org_id
                block_type = ecf.get("block_type") or "ecf_block_100"
                quantity = ecf.get("quantity", 1)
                price_cents = ecf.get("price_cents", 50000)

                units_per_block = {
                    "ecf_block_100": 100,
                    "ecf_block_500": 500,
                    "ecf_block_1000": 1000,
                }
                units = units_per_block.get(block_type, 100)

                fees.append({
                    "add_on_code": block_type,
                    "units": quantity,
                    "unit_amount_cents": price_cents,
                    "description": f"Bloque prepagado de {units * quantity} e-CFs",
                })

            # Create one-off invoice under the target org's customer
            customer_id = target_ecf_org_id or org_id
            try:
                lago_invoice = await self.lago.create_one_off_invoice(
                    customer_external_id=customer_id,
                    fees=fees,
                )
                lago_invoice_id = lago_invoice.get("invoice", {}).get("lago_id")
            except LagoAPIError as exc:
                logger.error(f"Lago one-off invoice failed: {exc.response_body}")
                raise ValueError(f"Error al crear factura de e-CF: {exc}")

        # 6. Handle renewal items (legacy)
        if renewal_items and subscription_id:
            sub = (
                self.db.query(OrganizationSubscription)
                .filter(OrganizationSubscription.id == subscription_id)
                .first()
            )
            if sub:
                sub.billing_cycle_end = sub.billing_cycle_end + timedelta(days=30 * renewal_items[0].get("months", 1))

        # 7. Calculate total for MIO order
        months = max((i.get("months", 1) for i in items), default=1)
        discount_tiers = {1: 0.0, 3: 0.03, 6: 0.05, 12: 0.10}
        discount = discount_tiers.get(months, 0.0)

        total_cents = 0
        for i in items:
            itype = i.get("type")
            qty = i.get("quantity", 1)
            item_months = i.get("months", 1)

            if itype == "plan_change":
                plan_name = i.get("plan_name")
                plan = self.db.query(SubscriptionPlan).filter(SubscriptionPlan.name == plan_name).first()
                if plan:
                    new_price_cents = plan.price_monthly_cents or (int(plan.price_dop * 100) if plan.price_dop else 0)
                else:
                    new_price_cents = i.get("price_cents", 0)

                # Prorate net upgrade cost (new plan price minus unused portion of old plan)
                if current_sub and current_sub.plan and current_sub.billing_cycle_start and current_sub.billing_cycle_end:
                    from math import ceil
                    now = utc_now()
                    cycle_end = current_sub.billing_cycle_end
                    cycle_start = current_sub.billing_cycle_start
                    if now < cycle_end:
                        total_cycle_days = max((cycle_end - cycle_start).days, 1)
                        days_remaining = max((cycle_end - now).days, 1)
                        
                        old_plan_price_cents = current_sub.plan.price_monthly_cents or (int(current_sub.plan.price_dop * 100) if current_sub.plan.price_dop else 0)
                        credit_cents = ceil(old_plan_price_cents * days_remaining / total_cycle_days)
                        
                        item_unit_cents = max(new_price_cents - credit_cents, 0)
                        logger.info(
                            "Plan upgrade proration: %d cents new plan, %d cents credit for %d/%d days left -> %d cents net",
                            new_price_cents, credit_cents, days_remaining, total_cycle_days, item_unit_cents
                        )
                        # Save proration details to item dict for payment proof
                        i["prorated"] = True
                        i["days_remaining"] = days_remaining
                        i["cycle_days"] = total_cycle_days
                        i["original_price_cents"] = new_price_cents
                        i["credit_cents"] = credit_cents
                        i["old_plan_name"] = current_sub.plan.name if current_sub.plan else None
                        i["old_plan_price_cents"] = old_plan_price_cents
                        i["price_cents"] = item_unit_cents
                    else:
                        item_unit_cents = new_price_cents
                else:
                    item_unit_cents = new_price_cents

            elif itype == "ecf_blocks":
                item_unit_cents = i.get("price_cents", 0)
            elif itype in ("entity_slot", "user_slot", "ai", "storage"):
                if itype == "entity_slot":
                    default_cents = 60000
                elif itype == "user_slot":
                    default_cents = 30000
                elif itype == "ai":
                    default_cents = 60000
                elif itype == "storage":
                    default_cents = 30000
                else:
                    default_cents = 0
                
                raw_unit_cents = i.get("price_cents", default_cents)
                prorated_cents, days_rem, cycle_days = self._compute_proration_cents(org_id, raw_unit_cents, active_sub=current_sub)
                item_unit_cents = prorated_cents
                
                # Save prorated details to the item dict so they persist in cart JSON
                i["price_cents"] = prorated_cents
                i["prorated"] = True
                i["days_remaining"] = days_rem
                i["cycle_days"] = cycle_days
                i["original_price_cents"] = raw_unit_cents
                
                logger.info(
                    "Proration for %s: %d/%d days remaining → %d cents (full: %d cents)",
                    itype, days_rem, cycle_days, prorated_cents, raw_unit_cents,
                )
            else:
                item_unit_cents = i.get("price_cents", 0)

            if itype in ("entity_slot", "user_slot", "ai", "storage"):
                # Prorated price covers the current partial period only — don't multiply by months
                line_total_cents = item_unit_cents * qty
            else:
                line_total_cents = item_unit_cents * qty * item_months
            discounted_cents = int(round(line_total_cents * (1 - discount)))
            total_cents += discounted_cents

        # 8. Create MIO order for card payments using PaymentIntentService
        if payment_method == "card" and total_cents > 0:
            fee_cents = int(total_cents * 0.05)
            total_with_fee = total_cents + fee_cents

            from app.services.payment_intent_service import PaymentIntentService
            intent_svc = PaymentIntentService(self.db)
            context_id = f"cart:{org_id}:{user_id}"

            db_order = await intent_svc.create_or_replace(
                amount_cents=total_with_fee,
                description=f"Fintral: Compra de {len(items)} artículo(s)",
                context_type="cart",
                context_id=context_id,
                user_id=user_id,
                organization_id=org.id,
                plan_id=plan.id if plan_items and plan else None,
                metadata=items,
                webhook_url=settings.MIO_WEBHOOK_URL,
                success_url=settings.MIO_SUCCESS_REDIRECT,
                failed_url=settings.MIO_FAILED_REDIRECT,
            )
            db_order.lago_invoice_id = lago_invoice_id
            self.db.commit()

            return {
                "subscription_id": subscription_id,
                "payment_method": "card",
                "checkout_url": db_order.checkout_url,
                "order_uuid": db_order.order_uuid,
                "total_cents": total_cents,
                "fee_cents": fee_cents,
                "total_with_fee": total_with_fee,
            }

        self.db.commit()
        return {
            "subscription_id": subscription_id,
            "payment_method": payment_method,
            "status": "active" if payment_method == "transfer" else "trialing",
            "total_cents": total_cents,
            "items_count": len(items),
        }

    async def provision_completed_cart(
        self,
        org_id: str,
        user_id: str,
        items: list[Dict[str, Any]],
    ) -> None:
        """Provision all items in the cart to the Fintral DB after successful card payment."""
        from app.services.plan_service import PlanService
        from app.models import MonthlyCharge
        from app.services.usage_tracker import _current_cycle

        plan_svc = PlanService(self.db)
        cycle = _current_cycle()

        for item in items:
            itype = item.get("type")
            qty = item.get("quantity", 1)
            price_cents = item.get("price_cents", 0)

            # Record a paid MonthlyCharge ledger entry
            label = item.get("label", itype)
            if item.get("prorated"):
                days_rem = item.get("days_remaining", 30)
                if itype == "plan_change":
                    label = f"{label} (proporcional por {days_rem} días restantes)"
                elif itype in ("entity_slot", "user_slot", "ai", "storage", "ocr"):
                    label = f"{label} (proporcional por {days_rem} días restantes)"

            charge = MonthlyCharge(
                organization_id=org_id,
                cycle=cycle,
                charge_type=itype,
                quantity=qty,
                unit_price_cents=price_cents,
                total_price_cents=price_cents * qty,
                label=label,
                paid=True,
                paid_at=utc_now(),
            )
            self.db.add(charge)

            if itype == "plan_change":
                # Mark organization subscription as active
                sub = (
                    self.db.query(OrganizationSubscription)
                    .filter(
                        OrganizationSubscription.organization_id == org_id,
                        OrganizationSubscription.status.in_(["active", "trialing"]),
                    )
                    .order_by(OrganizationSubscription.created_at.desc())
                    .first()
                )
                if sub:
                    sub.status = "active"
                    logger.info(f"Activated org subscription {sub.id} for org {org_id}")

            elif itype == "ecf_blocks":
                # Add e-CF credits to the organization
                target_org_id = item.get("target_org_id") or org_id
                qty = item.get("quantity", 1)
                block_size = 100
                org = self.db.query(Organization).filter(Organization.id == target_org_id).first()
                if org:
                    org.e_cf_balance = (org.e_cf_balance or 0) + (block_size * qty)
                    logger.info(f"📄 Credited {block_size * qty} e-CF to org {target_org_id}")

            elif itype == "entity_slot":
                qty = item.get("quantity", 1)
                plan_svc.purchase_addon(org_id, "entity_slot", qty, user_id=user_id)
                logger.info(f"Provisioned {qty} entity slots for user {user_id}")
                # Activate the pre-created target organization if one was bound to this slot
                target_org_id = item.get("target_org_id")
                if target_org_id:
                    target_org = self.db.query(Organization).filter(Organization.id == target_org_id).first()
                    if target_org and not target_org.is_active:
                        target_org.is_active = True
                        logger.info(f"✅ Activated pre-created org {target_org_id} after entity_slot payment")

            elif itype == "user_slot":
                qty = item.get("quantity", 1)
                plan_svc.purchase_addon(org_id, "user_slot", qty)
                logger.info(f"Provisioned {qty} user slots for org {org_id}")

            elif itype == "ai":
                qty = item.get("quantity", 1)
                plan_svc.purchase_addon(org_id, "ai", qty)
                logger.info(f"Provisioned {qty} AI block(s) for org {org_id}")

            elif itype == "storage":
                qty = item.get("quantity", 1)
                plan_svc.purchase_addon(org_id, "storage", qty)
                logger.info(f"Provisioned {qty} storage block(s) for org {org_id}")

            elif itype == "ocr":
                qty = item.get("quantity", 1)
                plan_svc.purchase_addon(org_id, "ocr", qty)
                logger.info(f"Provisioned {qty} OCR block(s) for org {org_id}")

            elif itype == "addon":
                addon_type = item.get("addon_type")
                qty = item.get("quantity", 1)
                if addon_type:
                    plan_svc.purchase_addon(
                        org_id,
                        addon_type,
                        qty,
                        user_id=user_id if addon_type == "entity_slot" else None,
                    )
                    logger.info(f"Provisioned addon {addon_type} qty {qty} for org {org_id}")
        
        self.db.commit()

    async def preview_plan_change(
        self,
        org_id: str,
        new_plan_name: str,
        commitment_months: int = 1,
    ) -> Dict[str, Any]:
        """Preview the cost of changing plans mid-cycle using Lago's proration."""
        org = self.db.query(Organization).filter(Organization.id == org_id).first()
        if not org:
            raise ValueError("Organización no encontrada")

        plan = self.db.query(SubscriptionPlan).filter(SubscriptionPlan.name == new_plan_name).first()
        if not plan:
            raise ValueError(f"Plan '{new_plan_name}' no encontrado")

        # Get current active subscription
        current_sub = (
            self.db.query(OrganizationSubscription)
            .filter(
                OrganizationSubscription.organization_id == org.id,
                OrganizationSubscription.status.in_(["active", "trialing"]),
            )
            .order_by(OrganizationSubscription.created_at.desc())
            .first()
        )

        if not current_sub or not current_sub.lago_subscription_id:
            # No active subscription — this is a new purchase, not a change
            price_dop = plan.price_dop or 999.0
            return {
                "is_new": True,
                "plan_name": new_plan_name,
                "price_cents": int(price_dop * 100),
                "price_dop": float(price_dop),
                "commitment_months": commitment_months,
            }

        # Preview via Lago
        plan_code = plan.lago_plan_code or new_plan_name
        if commitment_months >= 12:
            plan_code = f"{plan_code}_12m"

        try:
            preview = await self.lago.preview_subscription_change(
                customer_external_id=str(org.id),
                plan_code=plan_code,
                subscription_external_id=current_sub.lago_subscription_id,
            )
            return {
                "is_new": False,
                "current_plan": current_sub.lago_plan_code,
                "new_plan": plan_code,
                "preview": preview,
            }
        except LagoAPIError:
            # Fallback: calculate mathematical proration locally
            from math import ceil
            from app.utils.dates import utc_now

            now = utc_now()
            cycle_end = current_sub.billing_cycle_end
            cycle_start = current_sub.billing_cycle_start
            current_plan = current_sub.plan
            new_plan = plan

            if cycle_end and cycle_start and now < cycle_end and current_plan and new_plan:
                total_cycle_days = max((cycle_end - cycle_start).days, 1)
                days_remaining = max((cycle_end - now).days, 1)

                current_price_cents = current_plan.price_monthly_cents or (int(current_plan.price_dop * 100) if current_plan.price_dop else 0)
                new_price_cents = new_plan.price_monthly_cents or (int(new_plan.price_dop * 100) if new_plan.price_dop else 0)

                difference_cents = new_price_cents - current_price_cents
                if difference_cents > 0:
                    prorated_upgrade_cents = ceil(difference_cents * days_remaining / total_cycle_days)
                else:
                    prorated_upgrade_cents = 0

                return {
                    "is_new": False,
                    "current_plan": current_sub.lago_plan_code,
                    "new_plan": plan_code,
                    "price_cents": prorated_upgrade_cents,
                    "price_dop": float(prorated_upgrade_cents / 100.0),
                    "prorated": True,
                    "days_remaining": days_remaining,
                    "cycle_days": total_cycle_days,
                }

            price_dop = plan.price_dop or 999.0
            return {
                "is_new": False,
                "current_plan": current_sub.lago_plan_code,
                "new_plan": plan_code,
                "price_cents": int(price_dop * 100),
                "price_dop": float(price_dop),
                "note": "No se pudo obtener prorrateo de Lago ni calcularlo localmente",
            }

    async def get_next_billing_info(self, org_id: str) -> Dict[str, Any]:
        """Get the next billing date and estimated amount for an organization."""
        org = self.db.query(Organization).filter(Organization.id == org_id).first()
        if not org:
            raise ValueError("Organización no encontrada")

        sub = (
            self.db.query(OrganizationSubscription)
            .filter(
                OrganizationSubscription.organization_id == org.id,
                OrganizationSubscription.status.in_(["active", "trialing"]),
            )
            .order_by(OrganizationSubscription.created_at.desc())
            .first()
        )

        if not sub:
            return {
                "has_subscription": False,
                "next_billing_date": None,
                "estimated_amount_cents": 0,
            }

        # Try to get upcoming charges from Lago
        if sub.lago_subscription_id:
            try:
                upcoming = await self.lago.get_subscription_upcoming_charges(
                    subscription_external_id=sub.lago_subscription_id,
                )
                return {
                    "has_subscription": True,
                    "next_billing_date": sub.billing_cycle_end.isoformat() if sub.billing_cycle_end else None,
                    "estimated_amount_cents": upcoming.get("amount_cents", 0),
                    "subscription_id": str(sub.id),
                    "plan_name": sub.lago_plan_code,
                }
            except LagoAPIError:
                pass

        return {
            "has_subscription": True,
            "next_billing_date": sub.billing_cycle_end.isoformat() if sub.billing_cycle_end else None,
            "estimated_amount_cents": sub.plan.price_dop * 100 if sub.plan else 0,
            "subscription_id": str(sub.id),
            "plan_name": sub.lago_plan_code,
        }

    async def provision_bank_transfer(
        self,
        proof_id: str,
        org_id: str,
        user_id: str,
    ) -> Dict[str, Any]:
        """Provision all items from a verified bank transfer payment proof."""
        from app.models.payment_proof import PaymentProof

        proof = self.db.query(PaymentProof).filter(PaymentProof.id == proof_id).first()
        if not proof:
            raise ValueError(f"Comprobante {proof_id} no encontrado")

        if proof.status != "verified":
            raise ValueError(f"El comprobante {proof_id} no está verificado")

        items = proof.items_json
        if not items:
            logger.info(f"Payment proof {proof_id} has no items JSON, skipping provisioning")
            return {"provisioned": False, "reason": "no_items"}

        # Process items using process_complete_cart logic
        result = await self.process_complete_cart(
            org_id=org_id,
            user_id=user_id,
            items=items if isinstance(items, list) else [],
            payment_method="transfer",
        )
        return result
