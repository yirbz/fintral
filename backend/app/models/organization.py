from app.utils.dates import utc_now

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import relationship
from uuid_utils import uuid7

from app.database import Base, GUID


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(GUID, primary_key=True, default=uuid7)
    tenant_id = Column(GUID, ForeignKey("tenants.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    tax_id = Column(String)
    country = Column(String(3))  # ISO 3166-1 alpha-3
    is_active = Column(Boolean, default=True)
    settings_json = Column(Text, default="{}")
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    # Relationships
    tenant = relationship("Tenant", back_populates="organizations")
    invoices = relationship("Invoice", back_populates="organization", lazy="select")
    notifications = relationship("Notification", back_populates="organization", lazy="select")
    webhooks = relationship("WebhookEndpoint", back_populates="organization", lazy="select")
