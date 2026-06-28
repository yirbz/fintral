"""MioWebhookHandler — processes MIO payment gateway webhook events."""

from __future__ import annotations

import logging

from typing import Any, Dict
from sqlalchemy.orm import Session

from app.models.billing_webhook_event import BillingWebhookEvent
from app.services.lago_service import LagoService
from app.utils.dates import utc_now

logger = logging.getLogger(__name__)


class MioWebhookHandler:
    """Processes MIO webhook events idempotently."""

    def __init__(self, db: Session):
        self.db = db
        self.lago = LagoService()

    async def process(self, event_type: str, event_id: str, payload: Dict[str, Any]) -> BillingWebhookEvent:
        """Persist and process a MIO webhook event idempotently."""
        # Check if already processed
        existing = (
            self.db.query(BillingWebhookEvent)
            .filter(BillingWebhookEvent.event_id == event_id)
            .first()
        )
        if existing:
            logger.info(f"MIO Webhook {event_id} already processed, skipping")
            return existing

        # Create event log
        event = BillingWebhookEvent(
            event_id=event_id,
            event_type=event_type,
            source="mio",
            payload=payload,
        )
        self.db.add(event)
        self.db.flush()

        try:
            if event_type == "TRANSACTION_COMPLETED":
                await self._handle_transaction_completed(payload)
            else:
                logger.info(f"Unhandled MIO webhook event type: {event_type}")

            event.processed = True
            event.processed_at = utc_now()
            self.db.commit()
            logger.info(f"Successfully processed MIO webhook {event_id}")
        except Exception as e:
            self.db.rollback()
            event.error = str(e)
            event.attempts += 1
            self.db.commit()
            logger.exception(f"Failed to process MIO webhook {event_id}")
            raise e

        return event

    async def _handle_transaction_completed(self, payload: Dict[str, Any]) -> None:
        """Process TRANSACTION_COMPLETED from MIO.

        Locates the original payment order, marks it succeeded, and records the payment in Lago.
        """
        # MIO webhook payload format is evolving, but we look for order UUID
        order_uuid = payload.get("order_uuid") or payload.get("data", {}).get("attributes", {}).get("uuid")
        if not order_uuid:
            logger.warning("MIO webhook TRANSACTION_COMPLETED missing order UUID, checking nested data...")
            # Look inside alternative keys
            order_uuid = payload.get("uuid")
            
        if not order_uuid:
            raise ValueError("No order UUID found in MIO webhook payload")

        from app.models.mio_payment_order import MioPaymentOrder

        order = self.db.query(MioPaymentOrder).filter(MioPaymentOrder.order_uuid == order_uuid).first()
        if not order:
            logger.error(f"MIO payment order with UUID {order_uuid} not found in database")
            raise ValueError(f"Order not found: {order_uuid}")

        if order.status == "SUCCESS":
            logger.info(f"MIO order {order_uuid} is already marked as SUCCESS, skipping")
            return

        payment_data = payload.get("payment", {}) or payload.get("data", {}).get("attributes", {}).get("payment", {})
        
        # Update order in DB
        order.status = "SUCCESS"
        order.payment_id = str(payment_data.get("id", ""))
        order.authorization_code = str(payment_data.get("authorization_code", ""))
        order.reference_number = str(payment_data.get("reference_number", ""))
        order.webhook_payload = payload
        order.updated_at = utc_now()
        
        logger.info(f"MIO Order {order_uuid} successfully paid. Recording payment in Lago...")

        # Register card token for recurring payments if present
        card_token = (
            payment_data.get("card_token")
            or payment_data.get("token")
            or payment_data.get("card", {}).get("token")
            or payload.get("card_token")
        )

        if card_token and order.user_id:
            try:
                from app.models.user_card_token import UserCardToken

                card_brand = payment_data.get("card_brand") or payment_data.get("brand") or payment_data.get("card", {}).get("brand") or "Visa"
                last_four = payment_data.get("last_four") or payment_data.get("last4") or payment_data.get("card", {}).get("last_four") or "4242"
                expiry_month = payment_data.get("expiry_month") or payment_data.get("card", {}).get("expiry_month")
                expiry_year = payment_data.get("expiry_year") or payment_data.get("card", {}).get("expiry_year")

                # Deactivate previous active card tokens for this user
                self.db.query(UserCardToken).filter(
                    UserCardToken.user_id == order.user_id,
                    UserCardToken.is_active
                ).update({"is_active": False, "updated_at": utc_now()})

                # Insert the new card token
                new_token = UserCardToken(
                    user_id=order.user_id,
                    card_token=card_token,
                    card_brand=card_brand,
                    last_four=last_four,
                    expiry_month=expiry_month,
                    expiry_year=expiry_year,
                    is_active=True
                )
                self.db.add(new_token)
                logger.info(f"Registered new payment card token {card_token} for user {order.user_id}")
            except Exception as e:
                logger.error(f"Failed to persist user card token in DB: {e}")

        # Provision user subscription if it's a user subscription payment order
        if order.user_id and order.plan_id:
            try:
                from app.services.billing_checkout_service import BillingCheckoutService
                from app.models.subscription_plan import SubscriptionPlan
                
                plan = self.db.query(SubscriptionPlan).filter(SubscriptionPlan.id == order.plan_id).first()
                if plan:
                    checkout_svc = BillingCheckoutService(self.db)
                    await checkout_svc.provision_user_subscription(
                        user_id=str(order.user_id),
                        plan_name=plan.name,
                        payment_method="card"
                    )
                    logger.info(f"Provisioned subscription for user {order.user_id} to plan {plan.name}")
            except Exception as e:
                logger.error(f"Failed to provision user subscription after MIO payment: {e}")
                # Do not raise to prevent rolling back the payment status update

        # Record payment in Lago so the invoice is marked paid
        if order.lago_invoice_id:
            try:
                # Lago expects paid_at in ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ)
                paid_at = utc_now().strftime("%Y-%m-%d")
                await self.lago.record_payment(
                    invoice_id=order.lago_invoice_id,
                    amount_cents=order.amount_cents,
                    reference=order.reference_number or order.payment_id or order_uuid,
                    paid_at=paid_at
                )
                logger.info(f"Recorded payment for Lago invoice {order.lago_invoice_id} successfully.")
            except Exception as e:
                logger.error(f"Failed to record payment in Lago for invoice {order.lago_invoice_id}: {e}")
                # We do NOT raise here to prevent rolling back Fintral DB state,
                # as the credit card has already been charged. We'll reconcile it later.
        else:
            logger.info(f"No lago_invoice_id associated with MIO order {order_uuid}")

        # Send provisional invoice/receipt email using Resend
        try:
            from app.services.email_service import send_purchase_invoice_email
            from app.models.user import User
            from app.models.organization import Organization

            email_sent = False
            amount_dop = float(order.amount_cents) / 100.0
            
            # MIO card payments carry a 5% transaction fee included in the total charged
            fee_amount = amount_dop * 0.05 / 1.05
            subtotal_dop = amount_dop - fee_amount

            if order.user_id:
                user = self.db.query(User).filter(User.id == order.user_id).first()
                if user:
                    from app.models.subscription_plan import SubscriptionPlan
                    plan = self.db.query(SubscriptionPlan).filter(SubscriptionPlan.id == order.plan_id).first()
                    plan_name = plan.display_name if plan and plan.display_name else (plan.name if plan else "Suscripción")
                    items_list = [{
                        "label": f"Fintral Hub: Suscripción Plan {plan_name}",
                        "quantity": 1,
                        "total": subtotal_dop
                    }]
                    email_sent = send_purchase_invoice_email(
                        customer_email=user.email,
                        customer_name=user.full_name or user.email,
                        items=items_list,
                        total=amount_dop,
                        currency="DOP",
                        payment_method="card",
                        fee_amount=fee_amount
                    )
            elif order.organization_id:
                org = self.db.query(Organization).filter(Organization.id == order.organization_id).first()
                if org:
                    if amount_dop == 525.0:  # 500 + 5% fee
                        label = "Fintral Factura: Bloque prepagado de 100 e-CFs"
                    elif amount_dop == 2100.0:  # 2000 + 5% fee
                        label = "Fintral Factura: Bloque prepagado de 500 e-CFs"
                    elif amount_dop == 3675.0:  # 3500 + 5% fee
                        label = "Fintral Factura: Bloque prepagado de 1000 e-CFs"
                    else:
                        label = "Fintral Factura: Bloque prepagado e-CF"

                    items_list = [{
                        "label": label,
                        "quantity": 1,
                        "total": subtotal_dop
                    }]
                    email_sent = send_purchase_invoice_email(
                        customer_email=org.email_contact or "administracion@fintral.com",
                        customer_name=org.name,
                        items=items_list,
                        total=amount_dop,
                        currency="DOP",
                        payment_method="card",
                        fee_amount=fee_amount
                    )

            if email_sent:
                logger.info(f"Provisional invoice email sent successfully for MIO order {order_uuid}")
            else:
                logger.warning(f"Could not send provisional invoice email for MIO order {order_uuid}")
        except Exception as e:
            logger.error(f"Error sending provisional invoice email for MIO order {order_uuid}: {e}")

        # Trigger websocket notification or user update
        self.db.flush()
