from app.utils.dates import utc_now

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String
from uuid_utils import uuid7

from app.database import Base, GUID


class MonthlyCharge(Base):
    __tablename__ = "monthly_charges"
    __table_args__ = (
        Index("ix_monthly_charges_org_cycle", "organization_id", "cycle"),
    )

    id = Column(GUID, primary_key=True, default=uuid7)
    organization_id = Column(GUID, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    cycle = Column(Integer, nullable=False)
    charge_type = Column(String, nullable=False)  # ai_blocks | storage_blocks | entity_slot | user_slot
    quantity = Column(Integer, nullable=False, default=1)
    unit_price_cents = Column(Integer, nullable=False)
    total_price_cents = Column(Integer, nullable=False)
    label = Column(String, nullable=False)
    paid = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    paid_at = Column(DateTime(timezone=True), nullable=True)
    payment_proof_id = Column(GUID, ForeignKey("payment_proofs.id", ondelete="SET NULL"), nullable=True)
