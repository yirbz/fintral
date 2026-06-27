"""MioWebhookHandler — processes MIO payment gateway webhook events."""

from __future__ import annotations

import logging

from typing import Any, Dict
from sqlalchemy.orm import Session

from app.models.billing_webhook_event import BillingWebhookEvent
from app.models.organization_subscription import OrganizationSubscription
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

        # Import dynamically to avoid circular import issues
        from app.models.organization_subscription import OrganizationSubscription
        # We need to query the order from our new table: 'mio_payment_orders'
        # Since we haven't created the SQLAlchemy model class for MioPaymentOrder yet,
        # we can execute a raw SQL query or check if we should create it.
        # Let's write the MioPaymentOrder model class right after this file.
        # For now, let's query via SQLAlchemy dynamic metadata or write the model first.
        # Let's create the model first in app/models/mio_payment_order.py to keep SQLAlchemy clean.
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
            logger.warning(f"No lago_invoice_id associated with MIO order {order_uuid}")

        # Trigger websocket notification or user update
        self.db.flush()
