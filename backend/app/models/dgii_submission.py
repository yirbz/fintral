from uuid_utils import uuid7

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base, GUID
from app.utils.dates import utc_now


class DgiiSubmission(Base):
    __tablename__ = "dgii_submissions"
    __table_args__ = (
        Index("ix_dgii_submissions_lookup", "tenant_id", "organization_id", "format", "period"),
    )

    id = Column(GUID, primary_key=True, default=uuid7)
    tenant_id = Column(GUID, ForeignKey("tenants.id"), nullable=False, index=True)
    organization_id = Column(GUID, ForeignKey("organizations.id"), nullable=False, index=True)
    format = Column(String(3), nullable=False)             # "606" | "607" | "608"
    period = Column(String(6), nullable=False, index=True)  # "202605"
    invoice_ids = Column(JSON, nullable=False, default=list)
    invoice_count = Column(Integer, nullable=False, default=0)
    notes = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="pending_confirm")
    created_by = Column(GUID, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    organization = relationship("Organization", lazy="select")
