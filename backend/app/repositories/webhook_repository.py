import json
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.models import WebhookEndpoint


class WebhookRepository:
    def list_for_org(self, db: Session, tenant_id: UUID, org_id: UUID) -> list[WebhookEndpoint]:
        return (
            db.query(WebhookEndpoint)
            .filter(
                WebhookEndpoint.tenant_id == tenant_id,
                WebhookEndpoint.organization_id == org_id,
            )
            .all()
        )

    def get(self, db: Session, webhook_id: UUID, tenant_id: UUID, org_id: UUID) -> Optional[WebhookEndpoint]:
        return (
            db.query(WebhookEndpoint)
            .filter(
                WebhookEndpoint.id == webhook_id,
                WebhookEndpoint.tenant_id == tenant_id,
                WebhookEndpoint.organization_id == org_id,
            )
            .first()
        )

    def create(
        self,
        db: Session,
        tenant_id: UUID,
        org_id: UUID,
        url: str,
        description: Optional[str],
        events: list[str],
    ) -> WebhookEndpoint:
        webhook = WebhookEndpoint(
            tenant_id=tenant_id,
            organization_id=org_id,
            url=url,
            description=description,
            events=json.dumps(events),
            is_active=True,
        )
        db.add(webhook)
        db.commit()
        db.refresh(webhook)
        return webhook
