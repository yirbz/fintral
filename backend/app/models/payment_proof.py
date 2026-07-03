import json

from app.utils.dates import utc_now

from sqlalchemy import Column, DateTime, ForeignKey, String, Numeric, Text
from sqlalchemy.orm import relationship
from uuid_utils import uuid7

from app.database import Base, GUID


class PaymentProof(Base):
    __tablename__ = "payment_proofs"

    id = Column(GUID, primary_key=True, default=uuid7)
    tenant_id = Column(GUID, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id = Column(GUID, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(GUID, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    # What they're paying for
    plan_name = Column(String(64), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(3), default="DOP", nullable=False)
    addons_json = Column(Text, nullable=True)
    items_json = Column(Text, nullable=True)  # JSON array of cart items

    # Status
    status = Column(String(20), default="pending", nullable=False, index=True)
    # pending | verified | rejected

    # File
    file_path = Column(String(512), nullable=False)

    # Notes
    notes = Column(Text, nullable=True)
    admin_notes = Column(Text, nullable=True)
    verified_by = Column(GUID, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Timestamps
    verified_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    # Relationships
    tenant = relationship("Tenant", lazy="select")
    organization = relationship("Organization", lazy="select")
    user = relationship("User", lazy="select", foreign_keys=[user_id])
    verifier = relationship("User", lazy="select", foreign_keys=[verified_by])

    def to_dict(self):
        file_path = self.file_path or ""
        if file_path.startswith("payment_receipts/"):
            file_url = f"/api/plans/payment-proof/{self.id}/file"
        else:
            file_url = f"/uploads/payment-proofs/{file_path}"

        return {
            "id": str(self.id),
            "tenant_id": str(self.tenant_id),
            "organization_id": str(self.organization_id),
            "user_id": str(self.user_id) if self.user_id else None,
            "plan_name": self.plan_name,
            "amount": float(self.amount),
            "currency": self.currency,
            "addons": self.addons_json,
            "items": json.loads(self.items_json) if self.items_json else None,
            "status": self.status,
            "file_url": file_url,
            "notes": self.notes,
            "admin_notes": self.admin_notes,
            "verified_by": str(self.verified_by) if self.verified_by else None,
            "verified_at": self.verified_at.isoformat() if self.verified_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
