"""AlanubeTelemetry model — stores logs and metrics for Alanube API calls."""

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text
from uuid_utils import uuid7

from app.database import Base, GUID
from app.utils.dates import utc_now


class AlanubeTelemetry(Base):
    __tablename__ = "alanube_telemetry"

    id = Column(GUID, primary_key=True, default=uuid7)
    tenant_id = Column(GUID, nullable=False, index=True)
    organization_id = Column(GUID, nullable=False, index=True)

    action = Column(String(50), nullable=False, index=True)  # e.g., 'emit_document', 'verify_connection'
    ecf_type = Column(String(2), nullable=True, index=True)  # e.g., '31', '32', '33', '34'
    success = Column(Boolean, nullable=False, index=True)
    latency_ms = Column(Integer, nullable=False)
    error_message = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)

    def to_dict(self) -> dict:
        return {
            "id": str(self.id),
            "tenant_id": str(self.tenant_id),
            "organization_id": str(self.organization_id),
            "action": self.action,
            "ecf_type": self.ecf_type,
            "success": self.success,
            "latency_ms": self.latency_ms,
            "error_message": self.error_message,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
