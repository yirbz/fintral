"""LagoWebhookHandler — processes Lago webhook events."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict
from sqlalchemy.orm import Session

from app.models.billing_webhook_event import BillingWebhookEvent
from app.models.organization import Organization
from app.models.organization_subscription import OrganizationSubscription
from app.models.subscription_plan import SubscriptionPlan
from app.services.mio_service import MioService
from app.utils.dates import utc_now

logger = logging.getLogger(__name__)


class LagoWebhookHandler:
    """Processes Lago webhook events idempotently."""

    def __init__(self, db: Session):
        self.db = db
        self.mio = MioService()

    async def process(self, event_type: str, event_id: str, payload: Dict[str, Any]) -> BillingWebhookEvent:
        """Persist and process a Lago webhook event idempotently."""
        # Check if already processed
        existing = (
            self.db.query(BillingWebhookEvent)
            .filter(BillingWebhookEvent.event_id == event_id)
            .first()
        )
        if existing:
            logger.info(f"Lago Webhook {event_id} already processed, skipping")
            return existing

        # Create event log
        event = BillingWebhookEvent(
            event_id=event_id,
            event_type=event_type,
            source="lago",
            payload=payload,
        )
        self.db.add(event)
        self.db.flush()

        try:
            # Dispatch event to specific handler
            if event_type == "invoice.created":
                await self._handle_invoice_created(payload.get("invoice", {}))
            elif event_type == "invoice.paid":
                await self._handle_invoice_paid(payload.get("invoice", {}))
            elif event_type == "subscription.started":
                await self._handle_subscription_started(payload.get("subscription", {}))
            elif event_type == "subscription.terminated":
                await self._handle_subscription_terminated(payload.get("subscription", {}))
            else:
                logger.info(f"Unhandled Lago webhook event type: {event_type}")

            event.processed = True
            event.processed_at = utc_now()
            self.db.commit()
            logger.info(f"Successfully processed Lago webhook {event_id}")
        except Exception as e:
            self.db.rollback()
            event.error = str(e)
            event.attempts += 1
            self.db.commit()
            logger.exception(f"Failed to process Lago webhook {event_id}")
            raise e

        return event

    async def _handle_invoice_created(self, invoice: dict[str, Any]) -> None:
        """Fired when Lago generates an invoice (subscription renewal or one-off e-CF blocks purchase).

        If the organization chooses card payment, we automatically create a MIO hosted checkout order.
        """
        lago_invoice_id = invoice.get("lago_id")
        total_cents = invoice.get("total_amount_cents", 0)
        customer = invoice.get("customer", {})
        org_id_str = customer.get("external_id")

        if not org_id_str:
            raise ValueError("No customer external_id in Lago invoice payload")

        # Check if the organization is registered
        org = self.db.query(Organization).filter(Organization.id == org_id_str).first()
        if not org:
            logger.warning(f"Organization {org_id_str} not found for Lago invoice {lago_invoice_id}")
            return

        # Check current subscription payment method
        sub = (
            self.db.query(OrganizationSubscription)
            .filter(OrganizationSubscription.organization_id == org.id)
            .order_by(OrganizationSubscription.created_at.desc())
            .first()
        )
        
        payment_method = sub.payment_method if sub else "card"

        # Only automate checkout creation if payment method is card
        if payment_method == "card" and total_cents > 0:
            # Setup redirect URLs
            # Webhook URL for MIO is our own endpoint: /api/mio/webhook
            from app import config as settings
            webhook_url = settings.MIO_WEBHOOK_URL or "https://api.fintral.com/api/mio/webhook"
            success_url = settings.MIO_SUCCESS_REDIRECT or "https://app.fintral.com/billing/success"
            failed_url = settings.MIO_FAILED_REDIRECT or "https://app.fintral.com/billing/failed"

            # Describe order items
            description = "Fintral - Pago de Facturación / Suscripción"
            fees = invoice.get("fees", [])
            if fees:
                # Build descriptive label from fees
                item_names = []
                for fee in fees:
                    fee_name = fee.get("item", {}).get("name") or fee.get("add_on_code") or "Servicio"
                    units = fee.get("units", 1)
                    item_names.append(f"{units}x {fee_name}")
                description = f"Fintral: " + ", ".join(item_names)

            # Create checkout order on MIO
            try:
                mio_order = await self.mio.create_order(
                    amount_cents=total_cents,
                    description=description[:100],  # truncate to safety
                    webhook_url=webhook_url,
                    success_url=success_url,
                    failed_url=failed_url,
                )

                # Persist order details in our database
                from app.models.mio_payment_order import MioPaymentOrder
                db_order = MioPaymentOrder(
                    order_uuid=mio_order["order_uuid"],
                    lago_invoice_id=lago_invoice_id,
                    organization_id=org.id,
                    amount_cents=total_cents,
                    status="PENDING",
                    checkout_url=mio_order["checkout_url"],
                )
                self.db.add(db_order)
                self.db.flush()
                
                logger.info(f"Created MIO payment order {mio_order['order_uuid']} for Lago invoice {lago_invoice_id}")
            except Exception as e:
                logger.error(f"Failed to generate MIO payment order for Lago invoice {lago_invoice_id}: {e}")

    async def _handle_invoice_paid(self, invoice: dict[str, Any]) -> None:
        """Fired when an invoice is fully paid in Lago.

        Provisions e-CF credits if it contains prepaid block purchases, or updates subscription to active.
        """
        lago_invoice_id = invoice.get("lago_id")
        customer = invoice.get("customer", {})
        org_id_str = customer.get("external_id")

        if not org_id_str:
            raise ValueError("No customer external_id in Lago invoice paid payload")

        org = self.db.query(Organization).filter(Organization.id == org_id_str).first()
        if not org:
            logger.warning(f"Organization {org_id_str} not found for paid Lago invoice {lago_invoice_id}")
            return

        # Check invoice fees/items for prepaid e-CF block purchases
        fees = invoice.get("fees", [])
        ecf_credits_to_add = 0

        for fee in fees:
            add_on_code = fee.get("add_on_code")
            units = int(fee.get("units", 1))
            
            # Map add-on codes to credit amounts
            # e.g., 'ecf_block_100' gives 100 e-CFs
            if add_on_code == "ecf_block_100":
                ecf_credits_to_add += (100 * units)
            elif add_on_code == "ecf_block_500":
                ecf_credits_to_add += (500 * units)
            elif add_on_code == "ecf_block_1000":
                ecf_credits_to_add += (1000 * units)
            # Support legacy or custom codes as fallback
            elif add_on_code and "ecf_block" in add_on_code:
                try:
                    # extract number if present, e.g. ecf_block_250 -> 250
                    parts = add_on_code.split("_")
                    val = int(parts[-1])
                    ecf_credits_to_add += (val * units)
                except ValueError:
                    ecf_credits_to_add += (100 * units)  # fallback default block size

        if ecf_credits_to_add > 0:
            org.e_cf_balance = (org.e_cf_balance or 0) + ecf_credits_to_add
            logger.info(f"➕ Credited {ecf_credits_to_add} e-CFs to Org {org.id}. New balance: {org.e_cf_balance}")

        # Re-fetch active subscription to update cycle dates
        sub = (
            self.db.query(OrganizationSubscription)
            .filter(OrganizationSubscription.organization_id == org.id)
            .order_by(OrganizationSubscription.created_at.desc())
            .first()
        )
        
        if sub:
            # Mark active and update cycles
            sub.status = "active"
            
            # Parse dates if present in payload
            # Lago sends dates in ISO format, e.g. "2026-06-01"
            subscriptions = invoice.get("subscriptions", [])
            if subscriptions:
                # Update billing periods from invoice subscription detail
                sub_detail = subscriptions[0]
                start_str = sub_detail.get("trial_start") or invoice.get("issuing_date")
                # Lago cycles map to next cycle
                if start_str:
                    try:
                        sub.current_billing_period_start = datetime.strptime(start_str, "%Y-%m-%d")
                    except ValueError:
                        pass
            
            self.db.flush()

    async def _handle_subscription_started(self, subscription: dict[str, Any]) -> None:
        """Fired when a new subscription starts in Lago."""
        external_id = subscription.get("external_id")
        lago_customer_id = subscription.get("customer_id")
        plan_code = subscription.get("plan_code")
        
        # Lago subscription UUID
        lago_sub_id = subscription.get("lago_id")

        sub = (
            self.db.query(OrganizationSubscription)
            .filter(OrganizationSubscription.lago_subscription_id == external_id)
            .first()
        )
        if not sub and external_id:
            # Lookup by organization (if subscription external ID matches subscription id or organization id)
            # In our implementation plans, external_id is the subscription UUID
            sub = (
                self.db.query(OrganizationSubscription)
                .filter(OrganizationSubscription.id == external_id)
                .first()
            )

        if sub:
            sub.status = "active"
            sub.lago_subscription_id = external_id
            sub.lago_customer_id = lago_customer_id
            sub.lago_plan_code = plan_code
            self.db.flush()
            logger.info(f"Lago subscription {lago_sub_id} started locally for org {sub.organization_id}")

    async def _handle_subscription_terminated(self, subscription: dict[str, Any]) -> None:
        """Fired when a subscription is canceled/terminated in Lago."""
        external_id = subscription.get("external_id")
        
        sub = (
            self.db.query(OrganizationSubscription)
            .filter(
                (OrganizationSubscription.lago_subscription_id == external_id) |
                (OrganizationSubscription.id == external_id)
            )
            .first()
        )
        if sub:
            sub.status = "canceled"
            sub.canceled_at = utc_now()
            self.db.flush()
            logger.info(f"Lago subscription terminated locally for org {sub.organization_id}")
