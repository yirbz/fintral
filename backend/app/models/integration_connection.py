import base64
import hashlib
import json

from cryptography.fernet import Fernet
from sqlalchemy import Boolean, Column, DateTime, Index, String, Text
from uuid_utils import uuid7

from app.config import SECRET_KEY
from app.database import Base, GUID
from app.utils.dates import utc_now


def _get_fernet() -> Fernet:
    raw = SECRET_KEY.encode("utf-8") if SECRET_KEY else b"fintral-dev-fallback-key-2026!"
    key = base64.urlsafe_b64encode(hashlib.sha256(raw).digest())
    return Fernet(key)


class IntegrationConnection(Base):
    __tablename__ = "integration_connections"
    __table_args__ = (
        Index("ix_intconn_org_provider", "tenant_id", "organization_id", "provider"),
    )

    id = Column(GUID, primary_key=True, default=uuid7)
    tenant_id = Column(GUID, nullable=False, index=True)
    organization_id = Column(GUID, nullable=False, index=True)

    provider = Column(String(50), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    config_encrypted = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    last_sync_at = Column(DateTime(timezone=True), nullable=True)
    last_error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    def set_config(self, config: dict) -> None:
        self.config_encrypted = _get_fernet().encrypt(json.dumps(config).encode("utf-8")).decode("utf-8")

    def get_config(self) -> dict:
        if not self.config_encrypted:
            return {}
        try:
            raw = _get_fernet().decrypt(self.config_encrypted.encode("utf-8"))
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return {}

    def to_dict(self) -> dict:
        return {
            "id": str(self.id),
            "provider": self.provider,
            "name": self.name,
            "is_active": self.is_active,
            "last_sync_at": self.last_sync_at.isoformat() if self.last_sync_at else None,
            "last_error": self.last_error,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
