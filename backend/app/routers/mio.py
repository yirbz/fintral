import logging
from typing import Optional, List
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.tenant import TenantContext, require_tenant
from app.services import MioService, SettingsService

logger = logging.getLogger(__name__)
router = APIRouter()
settings_service = SettingsService()
mio_service = MioService(settings_service=settings_service)


class OrderItemSchema(BaseModel):
    id: Optional[int] = None
    name: str
    amount: float
    quantity: Optional[int] = 1


class CreateOrderRequest(BaseModel):
    amount: float
    currency: Optional[str] = "DOP"
    invoice_id: Optional[str] = None
    items: Optional[List[OrderItemSchema]] = None
    redirect_urls: Optional[dict] = None
    webhook_url: Optional[str] = None
    expire_minutes: Optional[int] = 14400


@router.post("/api/mio/token")
async def get_mio_token(ctx: TenantContext = Depends(require_tenant)):
    return mio_service.get_token(ctx.db, ctx.org_id)


@router.post("/api/mio/token/refresh")
async def refresh_mio_token(ctx: TenantContext = Depends(require_tenant)):
    return mio_service.get_token(ctx.db, ctx.org_id, force_refresh=True)


@router.post("/api/mio/create-order")
async def create_mio_order(body: CreateOrderRequest, ctx: TenantContext = Depends(require_tenant)):
    invoice_uuid = None
    if body.invoice_id:
        from uuid import UUID
        try:
            invoice_uuid = UUID(body.invoice_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="invoice_id no es un UUID válido")

    items_list = None
    if body.items:
        items_list = [item.dict() for item in body.items]

    res = mio_service.create_order(
        db=ctx.db,
        tenant_id=ctx.tenant_id,
        org_id=ctx.org_id,
        amount=body.amount,
        currency=body.currency,
        invoice_id=invoice_uuid,
        items=items_list,
        redirect_urls=body.redirect_urls,
        webhook_url=body.webhook_url,
        expire_minutes=body.expire_minutes
    )
    if res.get("status") == "error":
        raise HTTPException(status_code=400, detail=res.get("message"))
    return res


@router.get("/api/mio/order-status/{order_uuid}")
async def get_mio_order_status(order_uuid: str, ctx: TenantContext = Depends(require_tenant)):
    res = mio_service.get_order_status(ctx.db, ctx.org_id, order_uuid)
    if res.get("status") == "error":
        raise HTTPException(status_code=400, detail=res.get("message"))
    return res


@router.post("/api/mio/webhook")
async def mio_webhook(payload: dict, db: Session = Depends(get_db)):
    logger.info("Received MIO Webhook: %s", payload)
    res = mio_service.process_webhook(db, payload)
    if res.get("status") == "error":
        raise HTTPException(status_code=400, detail=res.get("message"))
    return res
