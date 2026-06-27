"""MIO Webhook Router — handles webhook events dispatched by MIO payment gateway."""

import logging
from typing import Any, Dict
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.mio_webhook_handler import MioWebhookHandler

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/mio", tags=["mio"])


@router.post("/webhook")
async def mio_webhook(request: Request, db: Session = Depends(get_db)):
    """Receive and process webhooks from MIO payment gateway.

    Parses transaction completion details and records them in Lago.
    """
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
