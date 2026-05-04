from fastapi import APIRouter, Depends, HTTPException

from app.dependencies.tenant import TenantContext, require_tenant
from app.repositories import NotificationRepository

router = APIRouter()
repo = NotificationRepository()


@router.get("/api/notifications")
async def get_notifications(
    limit: int = 20,
    unread_only: bool = False,
    ctx: TenantContext = Depends(require_tenant),
):
    notifications = repo.list_notifications(
        ctx.db, ctx.tenant_id, ctx.org_id, limit=limit, unread_only=unread_only,
    )
    return [n.to_dict() for n in notifications]


@router.post("/api/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    ctx: TenantContext = Depends(require_tenant),
):
    notification = repo.get(ctx.db, notification_id, ctx.tenant_id, ctx.org_id)
    if not notification:
        raise HTTPException(status_code=404, detail="Notificación no encontrada")

    notification.read = True
    ctx.db.commit()
    return {"status": "success"}


@router.post("/api/notifications/read-all")
async def mark_all_notifications_read(
    ctx: TenantContext = Depends(require_tenant),
):
    repo.mark_all_read(ctx.db, ctx.tenant_id, ctx.org_id)
    ctx.db.commit()
    return {"status": "success"}
