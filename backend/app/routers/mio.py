"""MIO Webhook Router — handles webhook events dispatched by MIO payment gateway."""

import hashlib
import hmac
import logging
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from app import config as settings
from app.database import get_db
from app.services.mio_webhook_handler import MioWebhookHandler

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/mio", tags=["mio"])


def verify_mio_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    """Verify MIO webhook signature using HMAC-SHA256.

    MIO/GeoPagos signs webhooks with a shared secret.
    Falls back to True if no secret configured (dev-safe).
    """
    if not secret:
        return True
    if not signature:
        return False
    expected = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


@router.post("/webhook")
async def mio_webhook(
    request: Request,
    x_signature: str | None = Header(None, alias="X-Signature"),
    db: Session = Depends(get_db),
):
    """Receive and process webhooks from MIO payment gateway.

    Parses transaction completion details and records them in Lago.
    Verifies HMAC-SHA256 signature when MIO_WEBHOOK_SECRET is configured.
    """
    raw_body = await request.body()

    if settings.MIO_WEBHOOK_SECRET and not verify_mio_signature(
        raw_body, x_signature or "", settings.MIO_WEBHOOK_SECRET
    ):
        logger.warning("MIO webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")
    try:
        payload = await request.json()
    except Exception:
        logger.error("Failed to parse JSON body from MIO webhook")
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    logger.info(f"Received MIO webhook payload: {payload}")

    # Extract transaction event type
    # Typical GeoPagos payload event name is 'TRANSACTION_COMPLETED' in payload.get('event')
    event_type = payload.get("event") or "TRANSACTION_COMPLETED"
    
    # Extract unique transaction ID for idempotency check
    # Can use the checkout order UUID, reference number, or payment ID
    payment_data = payload.get("payment", {}) or payload.get("data", {}).get("attributes", {}).get("payment", {})
    event_id = (
        payment_data.get("reference_number") or
        payment_data.get("id") or
        payload.get("order_uuid") or
        payload.get("uuid") or
        payload.get("id")
    )
    
    if not event_id:
        logger.error("MIO webhook payload missing unique reference transaction ID")
        raise HTTPException(status_code=400, detail="Missing transaction reference ID")

    # Stringify ID
    event_id = f"mio_{event_id}"

    # Process webhook event
    handler = MioWebhookHandler(db)
    try:
        await handler.process(
            event_type=event_type,
            event_id=event_id,
            payload=payload,
        )
        return {"status": "success", "message": "Webhook processed successfully"}
    except Exception as e:
        logger.error(f"Error handling MIO webhook: {e}")
        # Return 200/202 to avoid retries if we can't find the order, or 400 depending on case
        # For MIO, returning 200 is safer to avoid endless retries on invalid payloads,
        # but we raise 400 for structural invalid errors.
        raise HTTPException(status_code=400, detail=str(e))
