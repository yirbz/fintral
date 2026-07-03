"""PaymentIntentService — lifecycle management for MIO payment intents.

Enforces a formal state machine (PENDING → SUCCESS|FAILED|EXPIRED|REPLACED|RETRYING),
ensures one active intent per *context* at any time, and verifies amounts on webhook
processing.
"""

from __future__ import annotations

import logging
from datetime import timedelta

from sqlalchemy.orm import Session

from app.models.mio_payment_order import MioPaymentOrder, valid_transition, VALID_STATUSES
from app.services.mio_service import MioService
from app.utils.dates import utc_now

logger = logging.getLogger(__name__)

MIO_ORDER_TTL_MINUTES = 10


class PaymentIntentError(Exception):
    """Raised for payment intent lifecycle violations."""


class PaymentIntentService:
    """Manages the lifecycle of MIO payment intents within a single DB session."""

    def __init__(self, db: Session):
        self.db = db
        self.mio = MioService()

    # ── Public API ──────────────────────────────────────────────────────────

    async def create_or_replace(
        self,
        *,
        amount_cents: int,
        description: str,
        context_type: str,
        context_id: str,
        user_id: str | None = None,
        organization_id: str | None = None,
        plan_id: str | None = None,
        metadata: dict | None = None,
        idempotency_key: str | None = None,
        success_url: str | None = None,
        failed_url: str | None = None,
        webhook_url: str | None = None,
    ) -> MioPaymentOrder:
        """Create a new payment intent, atomically replacing any prior PENDING intent
        for the same (context_type, context_id).

        Replaces old intents by:
          1. Marking them REPLACED locally (with replaced_by link)
          2. Calling MIO API to cancel the remote order (best-effort)

        No two PENDING intents can exist for the same context.
        """
        # 1. Idempotency check
        if idempotency_key:
            existing = (
                self.db.query(MioPaymentOrder)
                .filter(MioPaymentOrder.idempotency_key == idempotency_key)
                .first()
            )
            if existing:
                logger.info(
                    "Idempotency key %s already used by order %s (status=%s), returning existing",
                    idempotency_key, existing.order_uuid, existing.status,
                )
                if existing.status in ("SUCCESS", "PENDING", "RETRYING"):
                    return existing
                # FAILED/EXPIRED: transfer idempotency key to new intent
                existing.idempotency_key = None

        # 2. Replace any existing PENDING intent for the same context
        await self._replace_pending_for_context(context_type, context_id, user_id=user_id)

        # 3. Create MIO order
        from app import config as app_config
        mio_order = await self.mio.create_order(
            amount_cents=amount_cents,
            description=description,
            webhook_url=webhook_url or (app_config.MIO_WEBHOOK_URL or "https://api.fintral.com/api/mio/webhook"),
            success_url=success_url or (app_config.MIO_SUCCESS_REDIRECT or "https://app.fintral.com/billing/success"),
            failed_url=failed_url or (app_config.MIO_FAILED_REDIRECT or "https://app.fintral.com/billing/failed"),
        )

        expires_at = utc_now() + timedelta(minutes=MIO_ORDER_TTL_MINUTES)

        # 4. Persist
        db_order = MioPaymentOrder(
            order_uuid=mio_order["order_uuid"],
            organization_id=organization_id,
            user_id=user_id,
            plan_id=plan_id,
            amount_cents=amount_cents,
            status="PENDING",
            checkout_url=mio_order["checkout_url"],
            context_type=context_type,
            context_id=context_id,
            idempotency_key=idempotency_key,
            expires_at=expires_at,
            cart_items_json=metadata if isinstance(metadata, list) else None,
        )
        self.db.add(db_order)
        self.db.flush()

        logger.info(
            "Created payment intent %d (order=%s, ctx=%s/%s, amount=%d)",
            db_order.id, db_order.order_uuid, context_type, context_id, amount_cents,
        )
        return db_order

    def get_active_for_context(self, context_type: str, context_id: str, user_id: str | None = None) -> MioPaymentOrder | None:
        """Return the single PENDING or RETRYING intent for a given context, if any."""
        q = self.db.query(MioPaymentOrder).filter(
            MioPaymentOrder.context_type == context_type,
            MioPaymentOrder.context_id == context_id,
            MioPaymentOrder.status.in_(["PENDING", "RETRYING"]),
        )
        if user_id:
            q = q.filter(MioPaymentOrder.user_id == user_id)
        return q.order_by(MioPaymentOrder.created_at.desc()).first()

    def verify_and_expire_stale(self, order_id: int) -> MioPaymentOrder:
        """Lazy expiry check: if a PENDING intent's MIO TTL has elapsed, mark it EXPIRED.

        Called just before any user interaction with the checkout link.
        """
        order = self.db.query(MioPaymentOrder).filter(MioPaymentOrder.id == order_id).first()
        if not order:
            raise PaymentIntentError(f"Payment intent {order_id} not found")
        if order.status != "PENDING":
            return order
        if order.expires_at and utc_now().replace(tzinfo=None) > order.expires_at:
            self._transition(order, "EXPIRED")
            logger.info("Lazy-expired stale payment intent %d (order=%s)", order.id, order.order_uuid)
        return order

    def expire_all_stale(self) -> int:
        """Batch-expire all PENDING intents past their expires_at. Returns count expired."""
        now = utc_now().replace(tzinfo=None)
        stale = (
            self.db.query(MioPaymentOrder)
            .filter(
                MioPaymentOrder.status == "PENDING",
                MioPaymentOrder.expires_at.isnot(None),
                MioPaymentOrder.expires_at < now,
            )
            .all()
        )
        for order in stale:
            self._transition(order, "EXPIRED")
        if stale:
            self.db.commit()
            logger.info("Batch-expired %d stale payment intents", len(stale))
        return len(stale)

    # ── Webhook processing ───────────────────────────────────────────────────

    def process_webhook_event(
        self,
        event_type: str,
        order_uuid: str,
        new_status: str,
        amount_cents: int | None = None,
        payment_data: dict | None = None,
        raw_payload: dict | None = None,
    ) -> MioPaymentOrder:
        """Process a webhook event from MIO with full state machine enforcement.

        Args:
            event_type: Human-readable label for logging (e.g. "TRANSACTION_COMPLETED").
            order_uuid: MIO order UUID.
            new_status: Canonical status string (SUCCESS, FAILED, EXPIRED, CANCELLED).
            amount_cents: Expected amount from the webhook (verified when provided).
            payment_data: Dict with payment details (id, authorization_code, reference_number).
            raw_payload: Full webhook payload to store for audit/debugging.

        Returns:
            The updated MioPaymentOrder.

        Raises:
            PaymentIntentError: On amount mismatch or invalid state transition.
        """
        from app.models.mio_payment_order import MioPaymentOrder as MPO

        order: MioPaymentOrder | None = (
            self.db.query(MPO)
            .filter(MPO.order_uuid == order_uuid)
            .first()
        )
        if not order:
            raise PaymentIntentError(f"Payment intent with MIO order {order_uuid} not found")

        if order.status == "SUCCESS":
            if new_status == "SUCCESS":
                logger.info("MIO order %s already SUCCESS, ignoring duplicate %s webhook", order_uuid, event_type)
                return order
            raise PaymentIntentError(
                f"Invalid state transition: {order.status} → {new_status} "
                f"for order {order.order_uuid}"
            )

        # Amount verification
        if amount_cents is not None and order.amount_cents != amount_cents:
            self._transition(order, "FAILED")
            raise PaymentIntentError(
                f"Amount mismatch for MIO order {order_uuid}: "
                f"expected {order.amount_cents}, got {amount_cents} from webhook"
            )

        map_status = {
            "TRANSACTION_COMPLETED": "SUCCESS",
            "TRANSACTION_FAILED": "FAILED",
            "PAYMENT_FAILED": "FAILED",
            "CHECKOUT_EXPIRED": "EXPIRED",
            "ORDER_EXPIRED": "EXPIRED",
            "TRANSACTION_CANCELLED": "EXPIRED",
            "PAYMENT_CANCELLED": "EXPIRED",
        }
        canonical = map_status.get(event_type, new_status)

        if canonical not in VALID_STATUSES:
            logger.warning("Unknown MIO event status %s for order %s (%s)", canonical, order_uuid, event_type)
            return order

        if canonical == "SUCCESS" and payment_data:
            order.payment_id = str(payment_data.get("id", ""))
            order.authorization_code = str(payment_data.get("authorization_code", ""))
            order.reference_number = str(payment_data.get("reference_number", ""))

        self._transition(order, canonical)

        if raw_payload:
            order.webhook_payload = raw_payload
        elif payment_data:
            order.webhook_payload = payment_data

        logger.info("MIO order %s transitioned to %s via webhook (%s)", order_uuid, canonical, event_type)
        return order

    # ── Internal helpers ──────────────────────────────────────────────────────

    async def _replace_pending_for_context(
        self,
        context_type: str,
        context_id: str,
        user_id: str | None = None,
        exclude_intent_id: int | None = None,
    ) -> None:
        """Find and atomically replace any PENDING intents for the same context."""
        stale_intents = (
            self.db.query(MioPaymentOrder)
            .filter(
                MioPaymentOrder.context_type == context_type,
                MioPaymentOrder.context_id == context_id,
                MioPaymentOrder.status.in_(["PENDING", "RETRYING"]),
            )
        )
        if exclude_intent_id:
            stale_intents = stale_intents.filter(MioPaymentOrder.id != exclude_intent_id)

        for old in stale_intents.all():
            old.replaced_by_id = exclude_intent_id
            old.replaced_at = utc_now()
            self._transition(old, "REPLACED")
            # Best-effort remote cancel (non-blocking, logs warnings on failure)
            try:
                await self.mio.cancel_order(old.order_uuid)
            except Exception:
                logger.warning("Failed to cancel MIO order %s during replace", old.order_uuid, exc_info=True)

    def _transition(self, order: MioPaymentOrder, new_status: str) -> None:
        """Enforce state machine and update status.

        Raises PaymentIntentError if the transition is invalid.
        """
        if not valid_transition(order.status, new_status):
            raise PaymentIntentError(
                f"Invalid state transition: {order.status} → {new_status} "
                f"for order {order.order_uuid}"
            )
        order.status = new_status
        order.updated_at = utc_now()
