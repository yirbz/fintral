from uuid_utils import uuid7

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import relationship

from app.database import Base, GUID
from app.utils.dates import utc_now


class InvoiceDgiiStatus(Base):
    __tablename__ = "invoice_dgii_statuses"
    __table_args__ = (
        Index("ix_inv_dgii_status_lookup", "invoice_id", "format", "status"),
        Index("ix_inv_dgii_status_format_period", "format", "period"),
    )

    id = Column(GUID, primary_key=True, default=uuid7)
    invoice_id = Column(GUID, ForeignKey("invoices.id"), nullable=False, index=True)
    format = Column(String(3), nullable=False)
    period = Column(String(6), nullable=False, index=True)
    status = Column(String(20), nullable=False, default="reported")
    submission_id = Column(GUID, ForeignKey("dgii_submissions.id"), nullable=True, index=True)
    error_detail = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    report_snapshot = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    invoice = relationship("Invoice", lazy="select")
    submission = relationship("DgiiSubmission", lazy="select")
