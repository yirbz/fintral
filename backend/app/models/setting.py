from app.utils.dates import utc_now

from sqlalchemy import Column, DateTime, ForeignKey, Index, String, UniqueConstraint
from uuid_utils import uuid7

from app.database import Base, GUID


class Setting(Base):
    __tablename__ = "settings"
    __table_args__ = (
        UniqueConstraint("tenant_id", "organization_id", "key", name="uq_settings_tenant_org_key"),
        Index("ix_settings_tenant_org", "tenant_id", "organization_id"),
    )

    id = Column(GUID, primary_key=True, default=uuid7)
    tenant_id = Column(GUID, ForeignKey("tenants.id"), nullable=False)
    organization_id = Column(GUID, ForeignKey("organizations.id"), nullable=False)
    key = Column(String, nullable=False, index=True)
    value = Column(String)
    type = Column(String)  # 'string', 'int', 'float', 'boolean', 'json'
    category = Column(String)  # 'general', 'openai', 'whatsapp'
    description = Column(String)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class UserSetting(Base):
    __tablename__ = "user_settings"
    __table_args__ = (UniqueConstraint("user_id", "key", name="uq_user_settings_user_key"),)

    id = Column(GUID, primary_key=True, default=uuid7)
    user_id = Column(GUID, ForeignKey("users.id"), nullable=False, index=True)
    key = Column(String, nullable=False, index=True)
    value = Column(String)
    type = Column(String)  # 'string', 'int', 'float', 'boolean', 'json'
    category = Column(String)  # 'general', 'openai', 'whatsapp'
    description = Column(String)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)
