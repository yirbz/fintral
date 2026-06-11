import json

from sqlalchemy import JSON, Column, DateTime, Index, String, Text
from uuid_utils import uuid7

from app.database import Base, GUID
from app.utils.dates import utc_now


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_auditlog_org_tenant", "organization_id", "tenant_id"),
        Index("ix_auditlog_actor", "actor_id"),
        Index("ix_auditlog_action", "action"),
        Index("ix_auditlog_created", "created_at"),
        Index("ix_auditlog_visibility", "visibility"),
    )

    id = Column(GUID, primary_key=True, default=uuid7)
    tenant_id = Column(GUID, nullable=False, index=True)
    organization_id = Column(GUID, nullable=False, index=True)
    organization_name = Column(String(200), nullable=True)

    actor_id = Column(String(100), nullable=False, index=True)
    actor_name = Column(String(200), nullable=True)
    actor_email = Column(String(200), nullable=True)

    action = Column(String(100), nullable=False, index=True)
    resource_type = Column(String(50), nullable=True)
    resource_id = Column(String(100), nullable=True)
    summary = Column(String(500), nullable=False)
    details = Column(Text, nullable=True)
    ip_address = Column(String(45), nullable=True)

    visibility = Column(String(10), nullable=False, default="client", server_default="'client'", index=True)
    snapshot_before = Column(JSON, nullable=True)
    snapshot_after = Column(JSON, nullable=True)
    request_id = Column(String(36), nullable=True, index=True)

    metadata_json = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": str(self.id),
            "tenant_id": str(self.tenant_id),
            "organization_id": str(self.organization_id),
            "organization_name": self.organization_name,
            "actor_id": self.actor_id,
            "actor_name": self.actor_name,
            "actor_email": self.actor_email,
            "action": self.action,
            "resource_type": self.resource_type,
            "resource_id": self.resource_id,
            "summary": self.summary,
            "details": self.details,
            "ip_address": self.ip_address,
            "visibility": self.visibility,
            "snapshot_before": self.snapshot_before,
            "snapshot_after": self.snapshot_after,
            "request_id": self.request_id,
            "metadata": json.loads(self.metadata_json) if self.metadata_json else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
