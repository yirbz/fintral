"""PaddleWebhookHandler — processes Paddle webhook events idempotently.

Every incoming webhook is persisted to PaddleWebhookEvent BEFORE processing.
If event_id already exists, processing is skipped.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models.organization_subscription import OrganizationSubscription
from app.models.billing_webhook_event import BillingWebhookEvent
from app.models.subscription_plan import SubscriptionPlan
from app.utils.dates import utc_now

logger = logging.getLogger(__name__)

SUBSCRIPTION_STATUS_MAP = {
    "active": "active",
    "trialing": "trialing",
    "paused": "suspended",
    "past_due": "past_due",
    "canceled": "canceled",
    "expired": "expired",
}


class PaddleWebhookHandler:
    """Process Paddle webhook events idempotently."""

    def __init__(self, db: Session):
        self.db = db

    def process(self, event_type: str, event_id: str, payload: dict[str, Any]) -> BillingWebhookEvent:
        """Persist and process a webhook event.

        Returns the BillingWebhookEvent with processed=True/False.
        If event_id was already processed, skips and returns existing.
        """
        existing = (
            self.db.query(BillingWebhookEvent)
            .filter(BillingWebhookEvent.event_id == event_id)
            .first()
        )
        if existing:
            logger.info("Webhook %s already processed, skipping", event_id)
            self.db.expunge(existing)
            existing.processed = False
            return existing

        event = BillingWebhookEvent(
            event_id=event_id,
            event_type=event_type,
            source="paddle",
            payload=payload,
        )
        self.db.add(event)
        self.db.flush()

        try:
            self._dispatch(event_type, payload.get("data", {}))
            event.processed = True
            event.processed_at = utc_now()
            logger.info("Processed webhook %s: %s", event_id, event_type)
        except Exception as exc:
            event.error = str(exc)
            logger.exception("Failed to process webhook %s: %s", event_id, exc)
        finally:
            event.attempts += 1
            self.db.commit()

        return event

    def _dispatch(self, event_type: str, data: dict[str, Any]) -> None:
        handler = self._get_handler(event_type)
        if handler is None:
            logger.warning("No handler for event type: %s", event_type)
            return
        handler(data)

    def _get_handler(self, event_type: str) -> Any:
        handlers = {
            "subscription.created": self._handle_subscription_created,
            "subscription.activated": self._handle_subscription_activated,
            "subscription.updated": self._handle_subscription_updated,
            "subscription.canceled": self._handle_subscription_canceled,
            "subscription.past_due": self._handle_subscription_past_due,
            "subscription.paused": self._handle_subscription_paused,
            "subscription.resumed": self._handle_subscription_resumed,
            "transaction.completed": self._handle_transaction_completed,
            "transaction.payment_failed": self._handle_transaction_payment_failed,
        }
        return handlers.get(event_type)

    # ── Subscription Events ──────────────────────────────────────────

    def _find_subscription(self, paddle_sub_id: str) -> OrganizationSubscription | None:
        return (
            self.db.query(OrganizationSubscription)
            .filter(
                OrganizationSubscription.paddle_subscription_id == paddle_sub_id
            )
            .first()
        )

    def _find_plan_by_price_id(self, price_id: str) -> SubscriptionPlan | None:
        return (
            self.db.query(SubscriptionPlan)
            .filter(
                (SubscriptionPlan.paddle_price_id_monthly == price_id)
                | (SubscriptionPlan.paddle_price_id_annual == price_id)
            )
            .first()
        )

    def _update_billing_period(
        self,
        sub: OrganizationSubscription,
        data: dict[str, Any],
    ) -> None:
        period = data.get("current_billing_period") or {}
        starts_at = period.get("starts_at") or period.get("startsAt")
        ends_at = period.get("ends_at") or period.get("endsAt")

        if starts_at:
            try:
                sub.current_billing_period_start = datetime.fromisoformat(
                    starts_at.replace("Z", "+00:00")
                )
            except (ValueError, AttributeError):
                pass
        if ends_at:
            try:
                sub.current_billing_period_end = datetime.fromisoformat(
                    ends_at.replace("Z", "+00:00")
                )
            except (ValueError, AttributeError):
                pass

    def _handle_subscription_created(self, data: dict[str, Any]) -> None:
        sub = self._find_subscription(data["id"])
        if sub:
            logger.info("Subscription %s already exists locally", data["id"])
            return

        items = data.get("items", [])
        price_id = items[0]["price"]["id"] if items else None
        plan = self._find_plan_by_price_id(price_id) if price_id else None

        sub = OrganizationSubscription(
            paddle_subscription_id=data["id"],
            paddle_customer_id=data.get("customer_id") or data.get("customerId"),
            paddle_price_id=price_id,
            paddle_collection_mode=data.get("collection_mode") or data.get("collectionMode"),
            status=SUBSCRIPTION_STATUS_MAP.get(data.get("status", ""), "active"),
            plan_id=plan.id if plan else None,
        )
        self._update_billing_period(sub, data)
        self.db.add(sub)

    def _handle_subscription_activated(self, data: dict[str, Any]) -> None:
        sub = self._find_subscription(data["id"])
        if not sub:
            logger.warning("Subscription %s not found locally, creating", data["id"])
            self._handle_subscription_created(data)
            sub = self._find_subscription(data["id"])

        if sub:
            sub.status = "active"
            self._update_billing_period(sub, data)

    def _handle_subscription_updated(self, data: dict[str, Any]) -> None:
        sub = self._find_subscription(data["id"])
        if not sub:
            logger.warning("Subscription %s not found locally", data["id"])
            return

        items = data.get("items", [])
        if items:
            price_id = items[0]["price"]["id"] if items[0].get("price") else None
            sub.paddle_price_id = price_id
            plan = self._find_plan_by_price_id(price_id) if price_id else None
            if plan:
                sub.plan_id = plan.id

        new_status = SUBSCRIPTION_STATUS_MAP.get(data.get("status", ""))
        if new_status:
            sub.status = new_status

        self._update_billing_period(sub, data)
        sub.paddle_scheduled_change = data.get("scheduled_change")

    def _handle_subscription_canceled(self, data: dict[str, Any]) -> None:
        sub = self._find_subscription(data["id"])
        if sub:
            sub.status = "canceled"
            sub.canceled_at = utc_now()

    def _handle_subscription_past_due(self, data: dict[str, Any]) -> None:
        sub = self._find_subscription(data["id"])
        if sub:
            sub.status = "past_due"

    def _handle_subscription_paused(self, data: dict[str, Any]) -> None:
        sub = self._find_subscription(data["id"])
        if sub:
            sub.status = "suspended"

    def _handle_subscription_resumed(self, data: dict[str, Any]) -> None:
        sub = self._find_subscription(data["id"])
        if sub:
            sub.status = "active"

    # ── Transaction Events ───────────────────────────────────────────

    def _handle_transaction_completed(self, data: dict[str, Any]) -> None:
        sub_id = data.get("subscription_id") or data.get("subscriptionId")
        if sub_id:
            sub = self._find_subscription(sub_id)
            if sub and data.get("billing_period"):
                self._update_billing_period(sub, {"current_billing_period": data["billing_period"]})
        logger.info("Transaction completed: %s", data.get("id"))

    def _handle_transaction_payment_failed(self, data: dict[str, Any]) -> None:
        logger.warning("Payment failed for transaction: %s", data.get("id"))
