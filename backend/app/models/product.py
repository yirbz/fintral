from app.utils.dates import utc_now

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Index, String, Text
from uuid_utils import uuid7

from app.database import Base, GUID


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (
        Index("ix_products_tenant_org", "tenant_id", "organization_id"),
        Index("ix_products_code", "tenant_id", "organization_id", "internal_code"),
    )

    id = Column(GUID, primary_key=True, default=uuid7)
    tenant_id = Column(GUID, ForeignKey("tenants.id"), nullable=False, index=True)
    organization_id = Column(GUID, ForeignKey("organizations.id"), nullable=False, index=True)

    name = Column(String, nullable=False, index=True)
    internal_code = Column(String, nullable=True, index=True)
    description = Column(Text, nullable=True)
    price = Column(Float, nullable=False, default=0.0)
    tax_rate = Column(Float, nullable=False, default=18.0) # Percentage (e.g. 18.0, 16.0, 0.0)
    is_active = Column(Boolean, default=True, index=True)

    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    def to_dict(self):
        return {
            "id": str(self.id),
            "tenant_id": str(self.tenant_id),
            "organization_id": str(self.organization_id),
            "name": self.name,
            "internal_code": self.internal_code,
            "description": self.description,
            "price": self.price,
            "tax_rate": self.tax_rate,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "deleted_at": self.deleted_at.isoformat() if self.deleted_at else None,
        }
