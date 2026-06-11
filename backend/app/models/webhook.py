import json

from app.utils.dates import utc_now

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import relationship
from uuid_utils import uuid7

from app.database import Base, GUID


class WebhookEndpoint(Base):
    __tablename__ = "webhook_endpoints"
    __table_args__ = (
        Index("ix_webhooks_tenant_org", "tenant_id", "organization_id"),
    )

    id = Column(GUID, primary_key=True, default=uuid7)
    tenant_id = Column(GUID, ForeignKey("tenants.id"), nullable=False, index=True)
    organization_id = Column(GUID, ForeignKey("organizations.id"), nullable=False, index=True)

    url = Column(String, nullable=False)
    description = Column(String)
    events = Column(Text)  # JSON list of events
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    # Relationships
    organization = relationship("Organization", back_populates="webhooks")

    def to_dict(self):
        return {
            "id": str(self.id),
            "url": self.url,
            "description": self.description,
            "events": json.loads(self.events) if self.events else [],
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
