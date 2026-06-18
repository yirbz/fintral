from app.utils.dates import utc_now

from sqlalchemy import Column, DateTime, ForeignKey, String, Numeric, Text, JSON
from sqlalchemy.orm import relationship
from uuid_utils import uuid7

from app.database import Base, GUID


class MioPayment(Base):
    __tablename__ = "mio_payments"

    id = Column(GUID, primary_key=True, default=uuid7)
    tenant_id = Column(GUID, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id = Column(GUID, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    invoice_id = Column(GUID, ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True, index=True)

    mio_order_uuid = Column(String(100), nullable=False, index=True, unique=True)
    checkout_url = Column(Text, nullable=True)
    status = Column(String(50), default="PENDING", nullable=False, index=True)  # PENDING, SUCCESS, FAILED
    currency = Column(String(3), nullable=False)  # "032" (USD), "214" (DOP)
    amount = Column(Numeric(12, 2), nullable=False)
    
    items = Column(JSON, nullable=True)
    payment_id = Column(String(100), nullable=True)
    authorization_code = Column(String(50), nullable=True)
    reference_number = Column(String(100), nullable=True)
    webhook_payload = Column(JSON, nullable=True)

    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    # Relationships
    tenant = relationship("Tenant", lazy="select")
    organization = relationship("Organization", lazy="select")
    invoice = relationship("Invoice", lazy="select")

    def to_dict(self):
        return {
            "id": str(self.id),
            "tenant_id": str(self.tenant_id),
            "organization_id": str(self.organization_id),
            "invoice_id": str(self.invoice_id) if self.invoice_id else None,
            "mio_order_uuid": self.mio_order_uuid,
            "checkout_url": self.checkout_url,
            "status": self.status,
            "currency": self.currency,
            "amount": float(self.amount),
            "items": self.items,
            "payment_id": self.payment_id,
            "authorization_code": self.authorization_code,
            "reference_number": self.reference_number,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
