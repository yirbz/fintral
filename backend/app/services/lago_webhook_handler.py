"""LagoWebhookHandler — processes Lago webhook events."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any, Dict
from sqlalchemy.orm import Session

from app import config as settings
from app.models.billing_webhook_event import BillingWebhookEvent
from app.models.mio_payment_order import MioPaymentOrder
from app.models.organization import Organization
from app.models.organization_subscription import OrganizationSubscription
from app.models.user_subscription import UserSubscription
from app.services.lago_service import LagoService
from app.services.mio_service import MioService
from app.utils.dates import utc_now

logger = logging.getLogger(__name__)


def _is_uuid(s: str) -> bool:
    try:
        uuid.UUID(s)
        return True
    except ValueError:
        return False


class LagoWebhookHandler:
    """Processes Lago webhook events idempotently."""

    def __init__(self, db: Session):
        self.db = db
        self.mio = MioService()
        self.lago = LagoService()

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

        If the organization/user chooses card payment, we automatically create a MIO hosted checkout order or charge the token.
        """
        lago_invoice_id = invoice.get("lago_id")
        total_cents = invoice.get("total_amount_cents", 0)
        customer = invoice.get("customer", {})
        ext_id_str = customer.get("external_id")

        if not ext_id_str:
            raise ValueError("No customer external_id in Lago invoice payload")

        # Resolve organization or user
        org = self.db.query(Organization).filter(Organization.id == ext_id_str).first()
        user = None
        if not org:
            from app.models.user import User
            user = self.db.query(User).filter(User.id == ext_id_str).first()

        if not org and not user:
            logger.warning(f"Neither Organization nor User found with ID {ext_id_str} for Lago invoice {lago_invoice_id}")
            return

        # Determine payment method
        payment_method = "card"
        sub = None
        if org:
            sub = (
                self.db.query(OrganizationSubscription)
                .filter(OrganizationSubscription.organization_id == org.id)
                .order_by(OrganizationSubscription.created_at.desc())
                .first()
            )
            payment_method = sub.payment_method if sub else "card"
        else:
            sub = (
                self.db.query(UserSubscription)
                .filter(UserSubscription.user_id == user.id)
                .order_by(UserSubscription.created_at.desc())
                .first()
            )
            payment_method = sub.payment_method if sub else "card"

        # Build order description
        description = "Fintral - Pago de Facturación / Suscripción"
        fees = invoice.get("fees", [])
        if fees:
            item_names = []
            for fee in fees:
                fee_name = fee.get("item", {}).get("name") or fee.get("add_on_code") or "Servicio"
                units = fee.get("units", 1)
                item_names.append(f"{units}x {fee_name}")
            description = "Fintral: " + ", ".join(item_names)

        # Process card payments
        if payment_method == "card" and total_cents > 0:
            # If user has a saved active card token, charge it directly!
            if user:
                from app.models.user_card_token import UserCardToken
                card_token_obj = (
                    self.db.query(UserCardToken)
                    .filter(UserCardToken.user_id == user.id, UserCardToken.is_active)
                    .first()
                )
                
                if card_token_obj:
                    # Token found: Direct server-to-server payment
                    logger.info(f"Attempting direct charge for user {user.id} using saved token...")
                    try:
                        # MIO card charges carry a 5% transaction fee
                        charge_cents = int(total_cents * 1.05)
                        charge_res = await self.mio.charge_token(
                            amount_cents=charge_cents,
                            card_token=card_token_obj.card_token,
                            description=description
                        )
                        
                        if charge_res.get("status") == "SUCCESS":
                            logger.info(f"Direct charge SUCCESS for user {user.id}. Recording payment in Lago...")
                            # Save successful payment order
                            db_order = MioPaymentOrder(
                                order_uuid=f"mio-direct-{uuid.uuid4().hex[:12]}",
                                lago_invoice_id=lago_invoice_id,
                                user_id=user.id,
                                plan_id=sub.plan_id if sub else None,
                                amount_cents=charge_cents,
                                status="SUCCESS",
                                payment_id=charge_res.get("payment_id"),
                                authorization_code=charge_res.get("authorization_code"),
                                reference_number=charge_res.get("reference_number")
                            )
                            self.db.add(db_order)
                            
                            # Record in Lago
                            paid_at = utc_now().strftime("%Y-%m-%d")
                            await self.lago.record_payment(
                                invoice_id=lago_invoice_id,
                                amount_cents=total_cents,
                                reference=charge_res.get("reference_number") or charge_res.get("payment_id") or "direct-token-charge",
                                paid_at=paid_at
                            )
                            
                            # Activate subscription locally
                            if sub:
                                sub.status = "active"
                                sub.updated_at = utc_now()
                            
                            self.db.commit()
                            
                            # Send receipt email
                            try:
                                from app.services.email_service import send_purchase_invoice_email
                                amount_dop = float(charge_cents) / 100.0
                                fee_amount = amount_dop * 0.05 / 1.05
                                subtotal_dop = amount_dop - fee_amount
                                items_list = [{
                                    "label": description,
                                    "quantity": 1,
                                    "total": subtotal_dop
                                }]
                                send_purchase_invoice_email(
                                    customer_email=user.email,
                                    customer_name=user.full_name or user.email,
                                    items=items_list,
                                    total=amount_dop,
                                    currency="DOP",
                                    payment_method="card",
                                    fee_amount=fee_amount
                                )
                            except Exception as e:
                                logger.error(f"Failed to send success receipt email: {e}")
                            return
                        else:
                            logger.warning(f"Direct charge DECLINED for user {user.id}. Fallback to dunning...")
                    except Exception as charge_err:
                        logger.error(f"Error during direct token charge for user {user.id}: {charge_err}. Fallback to dunning...")
                    
                    # Direct charge failed: set status to past_due
                    if sub:
                        sub.status = "past_due"
                        sub.updated_at = utc_now()
                        self.db.commit()
                        
                    # Send dunning email notification
                    try:
                        from app.services.email_service import send_dunning_email
                        send_dunning_email(
                            customer_email=user.email,
                            customer_name=user.full_name or user.email,
                            amount_dop=float(total_cents * 1.05) / 100.0,
                            reason="La tarjeta guardada fue declinada o no pudo procesar el cargo."
                        )
                    except Exception as email_err:
                        logger.error(f"Failed to send dunning email alert: {email_err}")
                    return

            # Fallback to hosted order generation (no token or organization payment)
            webhook_url = settings.MIO_WEBHOOK_URL or "https://api.fintral.com/api/mio/webhook"
            success_url = settings.MIO_SUCCESS_REDIRECT or "https://app.fintral.com/billing/success"
            failed_url = settings.MIO_FAILED_REDIRECT or "https://app.fintral.com/billing/failed"

            try:
                charge_cents = int(total_cents * 1.05)
                mio_order = await self.mio.create_order(
                    amount_cents=charge_cents,
                    description=description[:100],
                    webhook_url=webhook_url,
                    success_url=success_url,
                    failed_url=failed_url,
                )

                # Persist order details
                db_order = MioPaymentOrder(
                    order_uuid=mio_order["order_uuid"],
                    lago_invoice_id=lago_invoice_id,
                    organization_id=org.id if org else None,
                    user_id=user.id if user else None,
                    plan_id=sub.plan_id if (sub and user) else None,
                    amount_cents=charge_cents,
                    status="PENDING",
                    checkout_url=mio_order["checkout_url"],
                )
                self.db.add(db_order)
                self.db.flush()
                
                logger.info(f"Created MIO payment order {mio_order['order_uuid']} for Lago invoice {lago_invoice_id}")
                
                # Send email with payment link if user subscription
                if user:
                    try:
                        from app.services.email_service import send_payment_link_email
                        send_payment_link_email(
                            customer_email=user.email,
                            customer_name=user.full_name or user.email,
                            amount_dop=float(charge_cents) / 100.0,
                            checkout_url=mio_order["checkout_url"]
                        )
                    except Exception as email_err:
                        logger.error(f"Failed to send checkout link email to user: {email_err}")
            except Exception as e:
                logger.error(f"Failed to generate MIO payment order for Lago invoice {lago_invoice_id}: {e}")

    async def _handle_invoice_paid(self, invoice: dict[str, Any]) -> None:
        """Fired when an invoice is fully paid in Lago.

        Provisions e-CF credits if it contains prepaid block purchases, or updates subscription to active.
        """
        lago_invoice_id = invoice.get("lago_id")
        customer = invoice.get("customer", {})
        ext_id_str = customer.get("external_id")

        if not ext_id_str:
            raise ValueError("No customer external_id in Lago invoice paid payload")

        # Resolve organization or user
        org = self.db.query(Organization).filter(Organization.id == ext_id_str).first()
        user = None
        if not org:
            from app.models.user import User
            user = self.db.query(User).filter(User.id == ext_id_str).first()

        if not org and not user:
            logger.warning(f"Neither Organization nor User found with ID {ext_id_str} for paid Lago invoice {lago_invoice_id}")
            return

        # 1. If it's an organization, handle prepaid e-CF block purchases
        if org:
            fees = invoice.get("fees", [])
            ecf_credits_to_add = 0

            for fee in fees:
                add_on_code = fee.get("add_on_code")
                units = int(fee.get("units", 1))
                
                if add_on_code == "ecf_block_100":
                    ecf_credits_to_add += (100 * units)
                elif add_on_code == "ecf_block_500":
                    ecf_credits_to_add += (500 * units)
                elif add_on_code == "ecf_block_1000":
                    ecf_credits_to_add += (1000 * units)
                elif add_on_code and "ecf_block" in add_on_code:
                    try:
                        parts = add_on_code.split("_")
                        val = int(parts[-1])
                        ecf_credits_to_add += (val * units)
                    except ValueError:
                        ecf_credits_to_add += (100 * units)

            if ecf_credits_to_add > 0:
                org.e_cf_balance = (org.e_cf_balance or 0) + ecf_credits_to_add
                logger.info(f"➕ Credited {ecf_credits_to_add} e-CFs to Org {org.id}. New balance: {org.e_cf_balance}")

        # 2. Update subscription status
        sub = None
        if org:
            sub = (
                self.db.query(OrganizationSubscription)
                .filter(OrganizationSubscription.organization_id == org.id)
                .order_by(OrganizationSubscription.created_at.desc())
                .first()
            )
        else:
            sub = (
                self.db.query(UserSubscription)
                .filter(UserSubscription.user_id == user.id)
                .order_by(UserSubscription.created_at.desc())
                .first()
            )
        
        if sub:
            sub.status = "active"
            
            # Parse dates if present in payload
            subscriptions = invoice.get("subscriptions", [])
            if subscriptions:
                sub_detail = subscriptions[0]
                start_str = sub_detail.get("trial_start") or invoice.get("issuing_date")
                if start_str:
                    try:
                        sub.billing_cycle_start = datetime.strptime(start_str, "%Y-%m-%d")
                    except ValueError:
                        pass
            
            self.db.flush()

    async def _handle_subscription_started(self, subscription: dict[str, Any]) -> None:
        """Fired when a new subscription starts in Lago.

        Supports both OrganizationSubscription (org-level Factura plans)
        and UserSubscription (user-level Hub plans).
        """
        external_id = subscription.get("external_id")
        lago_customer_id = subscription.get("customer_id")
        plan_code = subscription.get("plan_code")
        lago_sub_id = subscription.get("lago_id")

        def _lookup_org_sub(eid: str) -> OrganizationSubscription | None:
            sub = (
                self.db.query(OrganizationSubscription)
                .filter(OrganizationSubscription.lago_subscription_id == eid)
                .first()
            )
            if not sub and _is_uuid(eid):
                sub = (
                    self.db.query(OrganizationSubscription)
                    .filter(OrganizationSubscription.id == eid)
                    .first()
                )
            return sub

        def _lookup_user_sub(eid: str) -> UserSubscription | None:
            sub = (
                self.db.query(UserSubscription)
                .filter(UserSubscription.lago_subscription_id == eid)
                .first()
            )
            if not sub and _is_uuid(eid):
                sub = (
                    self.db.query(UserSubscription)
                    .filter(UserSubscription.id == eid)
                    .first()
                )
            return sub

        org_sub = _lookup_org_sub(external_id) if external_id else None
        if org_sub:
            org_sub.status = "active"
            org_sub.lago_subscription_id = external_id
            org_sub.lago_customer_id = lago_customer_id
            org_sub.lago_plan_code = plan_code
            self.db.flush()
            logger.info(f"Lago subscription {lago_sub_id} started locally for org {org_sub.organization_id}")
            return

        # Fallback: look up UserSubscription (user-level Hub plans)
        user_sub = _lookup_user_sub(external_id) if external_id else None
        if user_sub:
            user_sub.status = "active"
            user_sub.lago_subscription_id = external_id
            user_sub.lago_customer_id = lago_customer_id
            user_sub.lago_plan_code = plan_code
            self.db.flush()
            logger.info(f"Lago subscription {lago_sub_id} started locally for user {user_sub.user_id}")

    async def _handle_subscription_terminated(self, subscription: dict[str, Any]) -> None:
        """Fired when a subscription is canceled/terminated in Lago.

        Supports both OrganizationSubscription (org-level Factura plans)
        and UserSubscription (user-level Hub plans).
        """
        external_id = subscription.get("external_id")

        def _lookup_org_sub(eid: str) -> OrganizationSubscription | None:
            sub = (
                self.db.query(OrganizationSubscription)
                .filter(OrganizationSubscription.lago_subscription_id == eid)
                .first()
            )
            if not sub and _is_uuid(eid):
                sub = (
                    self.db.query(OrganizationSubscription)
                    .filter(OrganizationSubscription.id == eid)
                    .first()
                )
            return sub

        def _lookup_user_sub(eid: str) -> UserSubscription | None:
            sub = (
                self.db.query(UserSubscription)
                .filter(UserSubscription.lago_subscription_id == eid)
                .first()
            )
            if not sub and _is_uuid(eid):
                sub = (
                    self.db.query(UserSubscription)
                    .filter(UserSubscription.id == eid)
                    .first()
                )
            return sub

        org_sub = _lookup_org_sub(external_id) if external_id else None
        if org_sub:
            org_sub.status = "canceled"
            org_sub.canceled_at = utc_now()
            self.db.flush()
            logger.info(f"Lago subscription terminated locally for org {org_sub.organization_id}")
            return

        user_sub = _lookup_user_sub(external_id) if external_id else None
        if user_sub:
            user_sub.status = "canceled"
            user_sub.canceled_at = utc_now()
            self.db.flush()
            logger.info(f"Lago subscription terminated locally for user {user_sub.user_id}")
