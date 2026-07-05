"""MIO Webhook Router — handles webhook events dispatched by MIO payment gateway."""

import hashlib
import hmac
import logging
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import HTMLResponse
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


@router.get("/mock-checkout", response_class=HTMLResponse)
async def mock_checkout(order_uuid: str):
    html_content = f"""
    <html>
        <head>
            <title>MIO Mock Checkout</title>
            <style>
                body {{
                    font-family: Arial, sans-serif;
                    background-color: #f4f5f7;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                }}
                .card {{
                    background: white;
                    padding: 40px;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                    text-align: center;
                    max-width: 400px;
                    width: 100%;
                }}
                h2 {{ color: #533afd; margin-bottom: 20px; }}
                p {{ color: #666; margin-bottom: 30px; }}
                button {{
                    background-color: #533afd;
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    font-size: 16px;
                    border-radius: 4px;
                    cursor: pointer;
                    width: 100%;
                    margin-bottom: 10px;
                    font-weight: bold;
                }}
                button.fail {{
                    background-color: #ef4444;
                }}
            </style>
            <script>
                async function simulatePayment(success) {{
                    const url = '/api/mio/webhook';
                    const payload = {{
                        "event": success ? "TRANSACTION_COMPLETED" : "TRANSACTION_FAILED",
                        "order_uuid": "{order_uuid}",
                        "payment": {{
                            "id": "pay_mock_" + Math.random().toString(36).substring(7),
                            "authorization_code": "auth_" + Math.floor(100000 + Math.random() * 900000),
                            "reference_number": "ref_" + Math.floor(10000000 + Math.random() * 90000000)
                        }}
                    }};
                    try {{
                        const resp = await fetch(url, {{
                            method: 'POST',
                            headers: {{ 'Content-Type': 'application/json' }},
                            body: JSON.stringify(payload)
                        }});
                        if (resp.ok) {{
                            alert(success ? "Pago simulado con éxito!" : "Pago simulado como fallido.");
                            window.location.href = success ? "https://app.fintral.com/billing/success" : "https://app.fintral.com/billing/failed";
                        }} else {{
                            alert("Error al simular el webhook: " + await resp.text());
                        }}
                    }} catch (e) {{
                        alert("Error de conexión: " + e);
                    }}
                }}
            </script>
        </head>
        <body>
            <div class="card">
                <h2>Pasarela de Pago MIO (Simulada)</h2>
                <p>Estás pagando tu suscripción de Fintral Hub.</p>
                <p><strong>ID de Orden:</strong> {order_uuid}</p>
                <button onclick="simulatePayment(true)">Simular Pago Exitoso</button>
                <button class="fail" onclick="simulatePayment(false)">Simular Pago Fallido</button>
            </div>
        </body>
    </html>
    """
    return html_content
