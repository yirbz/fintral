from decimal import Decimal

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import relationship
from uuid_utils import uuid7

from app.database import Base, GUID
from app.utils.dates import utc_now


class LedgerEntry(Base):
    __tablename__ = "ledger_entries"

    id = Column(GUID, primary_key=True, default=uuid7)
    tenant_id = Column(GUID, ForeignKey("tenants.id"), nullable=False, index=True)
    organization_id = Column(GUID, ForeignKey("organizations.id"), nullable=False, index=True)
    invoice_id = Column(GUID, ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True, index=True)
    modificatory_invoice_id = Column(GUID, ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True, index=True)

    entry_type = Column(String(20), nullable=False, default="credit")
    amount = Column(Numeric(14, 2), nullable=False, default=Decimal("0.00"))
    currency = Column(String(3), nullable=False, default="DOP")
    description = Column(Text, nullable=True)

    reversal_of = Column(GUID, ForeignKey("ledger_entries.id", ondelete="SET NULL"), nullable=True, index=True)
    is_reversal = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime(timezone=True), default=utc_now)
    created_by = Column(GUID, nullable=True)

    invoice = relationship("Invoice", lazy="select", foreign_keys=[invoice_id])
    modificatory_invoice = relationship("Invoice", lazy="select", foreign_keys=[modificatory_invoice_id])
    reversed_entry = relationship("LedgerEntry", remote_side=[id], lazy="select")

    def to_dict(self) -> dict:
        return {
            "id": str(self.id),
            "tenant_id": str(self.tenant_id),
            "organization_id": str(self.organization_id),
            "invoice_id": str(self.invoice_id) if self.invoice_id else None,
            "modificatory_invoice_id": str(self.modificatory_invoice_id) if self.modificatory_invoice_id else None,
            "entry_type": self.entry_type,
            "amount": float(self.amount),
            "currency": self.currency,
            "description": self.description,
            "reversal_of": str(self.reversal_of) if self.reversal_of else None,
            "is_reversal": self.is_reversal,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "created_by": str(self.created_by) if self.created_by else None,
        }
