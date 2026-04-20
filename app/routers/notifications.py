from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User

from app.dependencies.auth import get_current_user_from_cookie
from app.dependencies.tenancy import get_org_id
from app.repositories import NotificationRepository

router = APIRouter()
repo = NotificationRepository()


@router.get("/api/notifications")
async def get_notifications(
    limit: int = 20,
    unread_only: bool = False,
    user: Optional[User] = Depends(get_current_user_from_cookie),
    db: Session = Depends(get_db),
):
    if not user:
        raise HTTPException(status_code=401, detail="No autorizado")

    org_id = get_org_id(user, db)
    notifications = repo.list_notifications(db, org_id, limit=limit, unread_only=unread_only)
    return [n.to_dict() for n in notifications]


@router.post("/api/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: int,
    user: Optional[User] = Depends(get_current_user_from_cookie),
    db: Session = Depends(get_db),
):
    if not user:
        raise HTTPException(status_code=401, detail="No autorizado")

    org_id = get_org_id(user, db)
    notification = repo.get_for_org(db, notification_id, org_id)
    if not notification:
        raise HTTPException(status_code=404, detail="Notificación no encontrada")

    notification.read = True
    db.commit()
    return {"status": "success"}


@router.post("/api/notifications/read-all")
async def mark_all_notifications_read(
    user: Optional[User] = Depends(get_current_user_from_cookie),
    db: Session = Depends(get_db),
):
    if not user:
        raise HTTPException(status_code=401, detail="No autorizado")

    org_id = get_org_id(user, db)
    repo.mark_all_read(db, org_id)
    db.commit()
    return {"status": "success"}
