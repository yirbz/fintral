"""Lago Webhook Router — handles webhook events dispatched by self-hosted Lago billing engine."""

import hashlib
import hmac
import logging
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app import config as settings
from app.services.lago_webhook_handler import LagoWebhookHandler

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/lago", tags=["lago"])


def verify_lago_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    """Verify Lago webhook signature using HMAC-SHA256."""
    if not secret:
        # If no secret is configured locally, skip verification (useful for dev testing)
        return True
    if not signature:
        return False
        
    expected_signature = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(expected_signature, signature)


@router.post("/webhook")
async def lago_webhook(
    request: Request,
    signature: str | None = Header(None, alias="Signature"),
    db: Session = Depends(get_db)
):
    """Receive and process webhooks from Lago billing engine.

    Parses subscription state changes and marks invoices paid.
    """
    raw_body = await request.body()
    
    # Verify signature if configured
    if settings.LAGO_WEBHOOK_SECRET and not verify_lago_signature(
        raw_body, signature or "", settings.LAGO_WEBHOOK_SECRET
    ):
        logger.warning("Lago webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        payload = await request.json()
    except Exception:
        logger.error("Failed to parse JSON body from Lago webhook")
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    logger.info(f"Received Lago webhook payload: {payload}")

    # Lago webhooks wrap the event details in a top-level key:
    # { "webhook_type": "invoice.created", "invoice": { ... } }
    event_type = payload.get("webhook_type")
    
    # Event ID is sometimes in payload, or we can build one dynamically from type + nested resource ID
    # e.g., 'invoice.created' + invoice_id
    nested_obj = payload.get("invoice") or payload.get("subscription") or payload.get("customer") or {}
    resource_id = nested_obj.get("lago_id") or nested_obj.get("external_id") or "event"
    
    # Generates a unique event_id for idempotency check if Lago doesn't provide one
    event_id = payload.get("id") or f"lago_{event_type}_{resource_id}"

    if not event_type:
        logger.error("Lago webhook payload missing webhook_type")
        raise HTTPException(status_code=400, detail="Missing webhook_type")

    # Process Lago webhook event
    handler = LagoWebhookHandler(db)
    try:
        await handler.process(
            event_type=event_type,
            event_id=event_id,
            payload=payload,
        )
        return {"status": "success", "message": "Webhook processed successfully"}
    except Exception as e:
        logger.error(f"Error handling Lago webhook: {e}")
        raise HTTPException(status_code=400, detail=str(e))
