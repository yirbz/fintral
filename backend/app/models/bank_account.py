from app.utils.dates import utc_now

from sqlalchemy import Column, DateTime, ForeignKey, String, Numeric
from sqlalchemy.orm import relationship
from uuid_utils import uuid7

from app.database import Base, GUID


class BankAccount(Base):
    __tablename__ = "bank_accounts"

    id = Column(GUID, primary_key=True, default=uuid7)
    organization_id = Column(GUID, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    tenant_id = Column(GUID, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    balance = Column(Numeric(12, 2), default=0.00, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    # Relationships
    organization = relationship("Organization", lazy="select")
    tenant = relationship("Tenant", lazy="select")

    def to_dict(self):
        return {
            "id": str(self.id),
            "organization_id": str(self.organization_id),
            "tenant_id": str(self.tenant_id),
            "name": self.name,
            "balance": float(self.balance),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
