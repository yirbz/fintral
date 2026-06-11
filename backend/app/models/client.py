from app.utils.dates import utc_now

from sqlalchemy import Column, DateTime, ForeignKey, Index, String, Text
from uuid_utils import uuid7

from app.database import Base, GUID


class Client(Base):
    __tablename__ = "clients"
    __table_args__ = (
        Index("ix_clients_tenant_org", "tenant_id", "organization_id"),
        Index("ix_clients_tenant_org_tax_id", "tenant_id", "organization_id", "tax_id"),
    )

    id = Column(GUID, primary_key=True, default=uuid7)
    tenant_id = Column(GUID, ForeignKey("tenants.id"), nullable=False, index=True)
    organization_id = Column(GUID, ForeignKey("organizations.id"), nullable=False, index=True)

    name = Column(String, nullable=False, index=True)
    tax_id = Column(String, index=True)  # RNC or Cedula
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    address = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    def to_dict(self):
        return {
            "id": str(self.id),
            "tenant_id": str(self.tenant_id),
            "organization_id": str(self.organization_id),
            "name": self.name,
            "tax_id": self.tax_id,
            "phone": self.phone,
            "email": self.email,
            "address": self.address,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "deleted_at": self.deleted_at.isoformat() if self.deleted_at else None,
        }
