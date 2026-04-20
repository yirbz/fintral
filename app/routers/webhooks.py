from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User

from app.core.container import webhook_sender
from app.dependencies.auth import get_current_user_from_cookie
from app.dependencies.tenancy import get_org_id
from app.repositories import WebhookRepository
from app.schemas import WebhookCreate

router = APIRouter()
repo = WebhookRepository()


@router.get("/api/webhooks")
async def get_webhooks(
    user: Optional[User] = Depends(get_current_user_from_cookie),
    db: Session = Depends(get_db),
):
    if not user:
        raise HTTPException(status_code=401, detail="No autorizado")

    org_id = get_org_id(user, db)
    webhooks = repo.list_for_org(db, org_id)
    return [wh.to_dict() for wh in webhooks]


@router.post("/api/webhooks")
async def create_webhook(
    webhook: WebhookCreate,
    user: Optional[User] = Depends(get_current_user_from_cookie),
    db: Session = Depends(get_db),
):
    if not user:
        raise HTTPException(status_code=401, detail="No autorizado")

    org_id = get_org_id(user, db)
    created = repo.create(db, org_id, webhook.url, webhook.description, webhook.events)
    return created.to_dict()


@router.delete("/api/webhooks/{webhook_id}")
async def delete_webhook(
    webhook_id: int,
    user: Optional[User] = Depends(get_current_user_from_cookie),
    db: Session = Depends(get_db),
):
    if not user:
        raise HTTPException(status_code=401, detail="No autorizado")

    org_id = get_org_id(user, db)
    webhook = repo.get_for_org(db, webhook_id, org_id)
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook no encontrado")

    db.delete(webhook)
    db.commit()
    return {"message": "Webhook eliminado"}


@router.post("/api/webhooks/{webhook_id}/test")
async def test_webhook(
    webhook_id: int,
    user: Optional[User] = Depends(get_current_user_from_cookie),
    db: Session = Depends(get_db),
):
    if not user:
        raise HTTPException(status_code=401, detail="No autorizado")

    org_id = get_org_id(user, db)
    webhook = repo.get_for_org(db, webhook_id, org_id)
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook no encontrado")

    test_data = {
        "message": "Este es un evento de prueba desde InvoiceFlow",
        "webhook_id": webhook.id,
        "timestamp": datetime.utcnow().isoformat(),
    }
    result = webhook_sender.trigger_event(db, "ping", test_data, org_id=org_id)
    return {"status": "success", "delivery_result": result}
