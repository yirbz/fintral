from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.models import Notification


class NotificationRepository:
    def list_notifications(self, db: Session, org_id: int, limit: int = 20, unread_only: bool = False) -> list[Notification]:
        query = db.query(Notification).filter(Notification.organization_id == org_id)
        if unread_only:
            query = query.filter(Notification.read.is_(False))
        return query.order_by(desc(Notification.created_at)).limit(limit).all()

    def get_for_org(self, db: Session, notification_id: int, org_id: int) -> Notification | None:
        return (
            db.query(Notification)
            .filter(Notification.id == notification_id, Notification.organization_id == org_id)
            .first()
        )

    def mark_all_read(self, db: Session, org_id: int) -> None:
        db.query(Notification).filter(
            Notification.organization_id == org_id,
            Notification.read.is_(False),
        ).update({"read": True})
