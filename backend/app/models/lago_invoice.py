"""LagoInvoice — cache of Lago invoices for quick reference."""

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, JSON
from sqlalchemy.orm import relationship
from uuid_utils import uuid7

from app.database import Base, GUID
from app.utils.dates import utc_now


class LagoInvoice(Base):
    """Caches Lago invoices locally for fast admin queries and reporting."""
    __tablename__ = "lago_invoices"

    id = Column(GUID, primary_key=True, default=uuid7)
    lago_invoice_id = Column(String(64), unique=True, nullable=False, index=True)
    organization_id = Column(GUID, ForeignKey("organizations.id"), nullable=True, index=True)
    user_id = Column(GUID, ForeignKey("users.id"), nullable=True, index=True)
    amount_cents = Column(Integer, nullable=False)
    currency = Column(String(3), default="DOP", nullable=False)
    payment_status = Column(String(32), default="pending")  # pending | succeeded | failed
    invoice_type = Column(String(32))  # subscription | one_off | credit | progressive_billing
    status = Column(String(32), default="draft")  # draft | finalized | voided | failed | pending
    issuing_date = Column(DateTime(timezone=True), nullable=True)
    metadata_json = Column(JSON, nullable=True)
    
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    # Relationships
    organization = relationship("Organization")
    user = relationship("User")
