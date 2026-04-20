import json
from typing import Optional

from sqlalchemy.orm import Session

from app.models import WebhookEndpoint


class WebhookRepository:
    def list_for_org(self, db: Session, org_id: int) -> list[WebhookEndpoint]:
        return db.query(WebhookEndpoint).filter(WebhookEndpoint.organization_id == org_id).all()

    def get_for_org(self, db: Session, webhook_id: int, org_id: int) -> Optional[WebhookEndpoint]:
        return (
            db.query(WebhookEndpoint)
            .filter(WebhookEndpoint.id == webhook_id, WebhookEndpoint.organization_id == org_id)
            .first()
        )

    def create(self, db: Session, org_id: int, url: str, description: Optional[str], events: list[str]) -> WebhookEndpoint:
        webhook = WebhookEndpoint(
            url=url,
            description=description,
            events=json.dumps(events),
            is_active=True,
            organization_id=org_id,
        )
        db.add(webhook)
        db.commit()
        db.refresh(webhook)
        return webhook
