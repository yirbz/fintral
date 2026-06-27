"""Paddle Billing router — webhooks, checkout helpers, customer portal."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app import config as settings
from app.database import get_db
from app.dependencies.tenant import require_admin, require_tenant, TenantContext
from app.models.organization_subscription import OrganizationSubscription
from app.services.paddle_service import PaddleService
from app.services.paddle_webhook_handler import PaddleWebhookHandler

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/paddle", tags=["paddle"])
paddle_service = PaddleService()


# ── Webhook (no auth — protected by HMAC signature) ──────────────────


@router.post("/webhook")
async def paddle_webhook(request: Request, db: Session = Depends(get_db)):
    """Receive and process Paddle webhook events.

    Protected by HMAC-SHA256 signature verification, not JWT auth.
    Responds quickly (200) after persisting; processing is sync but fast.
    """
    raw_body = await request.body()
    raw_text = raw_body.decode("utf-8")
    signature = request.headers.get("paddle-signature", "")

    if not signature:
        logger.warning("Webhook missing paddle-signature header")
        return {"error": "missing signature"}, 400

    valid = paddle_service.verify_webhook_signature(raw_text, signature)
    if not valid:
        logger.warning("Webhook invalid signature")
        return {"error": "invalid signature"}, 403

    import json
    try:
        payload = json.loads(raw_text)
    except json.JSONDecodeError:
        return {"error": "invalid JSON"}, 400

    event_type = payload.get("event_type", "")
    event_id = payload.get("event_id", "")

    if not event_type or not event_id:
        return {"error": "missing event_type or event_id"}, 400

    handler = PaddleWebhookHandler(db)
    event = handler.process(event_type, event_id, payload)

    return {
        "status": 200,
        "event_id": event_id,
        "event_type": event_type,
        "processed": event.processed,
    }


# ── Checkout Helpers (JWT-protected) ─────────────────────────────────


@router.get("/checkout-settings")
async def checkout_settings(
    plan_name: str | None = None,
    org_id: str | None = None,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_tenant),
):
    """Return Paddle client_token and price_id for the requested plan.

    Used by Paddle.js frontend to open a checkout overlay.
    """
    if not settings.PADDLE_CLIENT_TOKEN:
        raise HTTPException(status_code=503, detail="Paddle not configured")

    price_id = None
    price_usd = None
    if plan_name:
        from app.models.subscription_plan import SubscriptionPlan

        plan = (
            db.query(SubscriptionPlan)
            .filter(SubscriptionPlan.name == plan_name)
            .first()
        )
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found")
        price_id = plan.paddle_price_id_monthly
        price_usd = float(plan.price_usd) if plan.price_usd is not None else None

    customer_id = None
    if org_id:
        sub = (
            db.query(OrganizationSubscription)
            .filter(OrganizationSubscription.organization_id == org_id)
            .order_by(OrganizationSubscription.created_at.desc())
            .first()
        )
        if sub and sub.paddle_customer_id:
            customer_id = sub.paddle_customer_id

    return {
        "client_token": settings.PADDLE_CLIENT_TOKEN,
        "environment": settings.PADDLE_ENVIRONMENT,
        "price_id": price_id,
        "customer_id": customer_id,
        "price_usd": price_usd,
    }


@router.post("/customer-portal")
async def customer_portal(
    org_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_tenant),
):
    """Generate a Paddle Customer Portal URL for self-service."""
    sub = (
        db.query(OrganizationSubscription)
        .filter(OrganizationSubscription.organization_id == org_id)
        .order_by(OrganizationSubscription.created_at.desc())
        .first()
    )
    if not sub or not sub.paddle_customer_id:
        raise HTTPException(status_code=404, detail="No Paddle subscription found")

    sub_ids = []
    if sub.paddle_subscription_id:
        sub_ids.append(sub.paddle_subscription_id)

    try:
        session = paddle_service.create_portal_session(
            sub.paddle_customer_id,
            subscription_ids=sub_ids,
        )
        return session
    except Exception as exc:
        logger.exception("Failed to create portal session")
        raise HTTPException(status_code=502, detail=str(exc))


# ── Admin: Force sync ────────────────────────────────────────────────


@router.post("/sync/{org_id}")
async def force_sync(
    org_id: str,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Force reconciliation of a single organization's subscription."""
    from app.services.paddle_sync_service import PaddleSyncService

    sub = (
        db.query(OrganizationSubscription)
        .filter(OrganizationSubscription.organization_id == org_id)
        .order_by(OrganizationSubscription.created_at.desc())
        .first()
    )
    if not sub:
        raise HTTPException(status_code=404, detail="No subscription found")

    sync = PaddleSyncService(db)
    result = sync.reconcile_one(str(sub.id))
    return result or {"error": "no paddle_subscription_id"}
