import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Invoice
from app.services.websocket import websocket_manager

from app.core.container import cost_control, whatsapp_service
from app.dependencies.tenancy import get_default_org
from app.services import EvolutionService, SettingsService

logger = logging.getLogger(__name__)
router = APIRouter()
settings_service = SettingsService()
evolution_service = EvolutionService(settings_service=settings_service, whatsapp_service=whatsapp_service)


@router.post("/evolution/webhook")
async def evolution_webhook(request: Request, db: Session = Depends(get_db)):
    try:
        payload = await request.json()
        logger.info("📥 Payload recibido en /evolution/webhook: %s...", json.dumps(payload)[:500])

        result = await evolution_service.process_webhook(payload, db)

        if result.get("status") == "success" and result.get("result"):
            invoice_result = result["result"]
            if invoice_result.get("status") == "success":
                invoice_id = invoice_result.get("invoice_id")
                org_id = None
                if invoice_id:
                    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
                    org_id = inv.organization_id if inv else None

                await websocket_manager.notify_new_whatsapp_image(
                    sender_info=invoice_result.get("sender_info", {}),
                    invoice_id=invoice_id,
                    org_id=org_id,
                )

                openai_result = invoice_result.get("openai_result", {})
                notification_result = {
                    "success": openai_result.get("success", False),
                    "data": openai_result.get("data") if openai_result.get("success") else None,
                    "error": openai_result.get("error") if not openai_result.get("success") else None,
                }
                await websocket_manager.notify_processing_complete(
                    invoice_id=invoice_id,
                    result=notification_result,
                    org_id=org_id,
                )

                alerts = cost_control.get_cost_alerts(db, org_id=org_id)
                if alerts.get("has_alerts"):
                    for alert in alerts.get("alerts", []):
                        await websocket_manager.notify_cost_alert(alert, org_id=org_id)

        return result

    except Exception as exc:  # noqa: BLE001
        logger.exception("Error en webhook Evolution")
        return {"status": "error", "error": str(exc)}


@router.post("/evolution/send-message")
async def send_evolution_message(
    instance_name: str,
    phone: str,
    message: str,
    evolution_api_url: Optional[str] = None,
):
    return await evolution_service.send_message(
        instance_name=instance_name,
        phone=phone,
        message=message,
        evolution_api_url=evolution_api_url,
    )


@router.get("/evolution/instance-status/{instance_name}")
async def get_evolution_instance_status(
    instance_name: str,
    evolution_api_url: Optional[str] = None,
):
    return await evolution_service.get_instance_status(instance_name, evolution_api_url=evolution_api_url)


@router.get("/evolution/security-config")
async def get_security_config(db: Session = Depends(get_db)):
    org_id = get_default_org(db).id
    cfg = evolution_service._resolve_config(db, org_id)
    return evolution_service.security_config(cfg["authorized_number"])


@router.get("/evolution/proxy/status")
async def get_evolution_status(db: Session = Depends(get_db)):
    org_id = get_default_org(db).id
    return evolution_service.proxy_status(db, org_id)


@router.get("/evolution/proxy/qr")
async def get_evolution_qr(db: Session = Depends(get_db)):
    org_id = get_default_org(db).id
    return evolution_service.proxy_qr(db, org_id)


@router.post("/evolution/proxy/create")
async def create_evolution_instance(db: Session = Depends(get_db)):
    org_id = get_default_org(db).id
    return evolution_service.proxy_create(db, org_id)


@router.post("/evolution/test-get-base64")
async def test_evolution_get_base64(
    request: Request,
    message_id: Optional[str] = None,
    instance_name: Optional[str] = None,
):
    msg_id = message_id
    inst = instance_name

    if not msg_id:
        try:
            body = await request.json()
            msg_id = body.get("message_id")
            inst = body.get("instance_name", inst)
        except Exception:  # noqa: BLE001
            pass

    if not msg_id:
        return {
            "status": "error",
            "message": "message_id es requerido",
        }

    return evolution_service.build_test_get_base64_response(msg_id, instance_name=inst)
