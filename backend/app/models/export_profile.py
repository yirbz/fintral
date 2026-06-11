from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, String, Text
from uuid_utils import uuid7

from app.database import Base, GUID
from app.utils.dates import utc_now





class AccountMapping(Base):
    __tablename__ = "account_mappings"
    __table_args__ = (
        Index("ix_account_mappings_org_provider", "tenant_id", "organization_id", "provider"),
    )

    id = Column(GUID, primary_key=True, default=uuid7)
    tenant_id = Column(GUID, ForeignKey("tenants.id"), nullable=False, index=True)
    organization_id = Column(GUID, ForeignKey("organizations.id"), nullable=False, index=True)

    provider = Column(String(50), nullable=False, index=True)
    category = Column(String(100), nullable=False)
    account_code = Column(String(50), nullable=False)
    account_label = Column(String(200), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    def to_dict(self):
        return {
            "id": str(self.id),
            "provider": self.provider,
            "category": self.category,
            "account_code": self.account_code,
            "account_label": self.account_label,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ExportProfile(Base):
    __tablename__ = "export_profiles"
    __table_args__ = (
        Index("ix_export_profiles_org", "tenant_id", "organization_id"),
    )

    id = Column(GUID, primary_key=True, default=uuid7)
    tenant_id = Column(GUID, ForeignKey("tenants.id"), nullable=False, index=True)
    organization_id = Column(GUID, ForeignKey("organizations.id"), nullable=False, index=True)

    name = Column(String(100), nullable=False)
    provider = Column(String(50), nullable=False)
    config = Column(Text, nullable=True)
    is_preset = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    def to_dict(self):
        import json
        return {
            "id": str(self.id),
            "name": self.name,
            "provider": self.provider,
            "config": json.loads(self.config) if self.config else {},
            "is_preset": self.is_preset,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
