from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

from app.core.container import webhook_sender
from app.dependencies.tenant import TenantContext, require_tenant
from app.repositories import WebhookRepository
from app.services.audit_logger import record as audit_record
from app.schemas import WebhookCreate

router = APIRouter()
repo = WebhookRepository()


@router.get("/api/webhooks")
async def get_webhooks(
    ctx: TenantContext = Depends(require_tenant),
):
    webhooks = repo.list_for_org(ctx.db, ctx.tenant_id, ctx.org_id)
    return [wh.to_dict() for wh in webhooks]


@router.post("/api/webhooks")
async def create_webhook(
    webhook: WebhookCreate,
    ctx: TenantContext = Depends(require_tenant),
):
    created = repo.create(
        ctx.db, ctx.tenant_id, ctx.org_id, webhook.url, webhook.description, webhook.events,
    )
    name = created.description or created.url
    audit_record(
        ctx.db,
        tenant_id=ctx.tenant_id,
        organization_id=ctx.org_id,
        organization_name=ctx.organization.name,
        actor_id=str(ctx.user.id),
        actor_name=getattr(ctx.user, 'full_name', None) or getattr(ctx.user, 'name', None) or ctx.user.email,
        actor_email=ctx.user.email,
        action="webhook.created",
        resource_type="webhook",
        resource_id=str(created.id),
        summary=f"Webhook '{name}' creado",
    )
    return created.to_dict()


@router.delete("/api/webhooks/{webhook_id}")
async def delete_webhook(
    webhook_id: str,
    ctx: TenantContext = Depends(require_tenant),
):
    webhook = repo.get(ctx.db, webhook_id, ctx.tenant_id, ctx.org_id)
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook no encontrado")

    name = webhook.description or webhook.url
    wh_id = str(webhook.id)
    ctx.db.delete(webhook)
    ctx.db.commit()
    audit_record(
        ctx.db,
        tenant_id=ctx.tenant_id,
        organization_id=ctx.org_id,
        organization_name=ctx.organization.name,
        actor_id=str(ctx.user.id),
        actor_name=getattr(ctx.user, 'full_name', None) or getattr(ctx.user, 'name', None) or ctx.user.email,
        actor_email=ctx.user.email,
        action="webhook.deleted",
        resource_type="webhook",
        resource_id=wh_id,
        summary=f"Webhook '{name}' eliminado",
    )
    return {"message": "Webhook eliminado"}


@router.post("/api/webhooks/{webhook_id}/test")
async def test_webhook(
    webhook_id: str,
    ctx: TenantContext = Depends(require_tenant),
):
    webhook = repo.get(ctx.db, webhook_id, ctx.tenant_id, ctx.org_id)
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook no encontrado")

    test_data = {
        "message": "Este es un evento de prueba desde InvoiceFlow",
        "webhook_id": str(webhook.id),
        "timestamp": datetime.utcnow().isoformat(),
    }
    result = webhook_sender.trigger_event(
        ctx.db, "ping", test_data, tenant_id=ctx.tenant_id, org_id=ctx.org_id,
    )
    return {"status": "success", "delivery_result": result}
