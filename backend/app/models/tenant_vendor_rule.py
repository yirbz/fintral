from sqlalchemy import Column, DateTime, ForeignKey, Index, String, UniqueConstraint
from uuid_utils import uuid7

from app.database import Base, GUID
from app.utils.dates import utc_now


class TenantVendorRule(Base):
    __tablename__ = "tenant_vendor_rules"
    __table_args__ = (
        UniqueConstraint("tenant_id", "emisor_rnc", name="uq_tenant_vendor_rule"),
        Index("ix_tvr_emisor_rnc", "emisor_rnc"),
    )

    id = Column(GUID, primary_key=True, default=uuid7)
    tenant_id = Column(GUID, ForeignKey("tenants.id"), nullable=False, index=True)
    emisor_rnc = Column(String, nullable=False)
    dgii_category_code = Column(String(2), nullable=False)  # 01-11
    source = Column(String(20), nullable=False, default="ai_suggestion")  # ai_suggestion | accountant_override
    vendor_name = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)
