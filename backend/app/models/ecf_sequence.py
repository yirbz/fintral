from app.utils.dates import utc_now

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Index, Integer, String
from uuid_utils import uuid7

from app.database import Base, GUID


class EcfSequence(Base):
    __tablename__ = "ecf_sequences"
    __table_args__ = (
        Index("ix_ecf_sequences_tenant_org", "tenant_id", "organization_id"),
        Index("ix_ecf_sequences_type", "tenant_id", "organization_id", "ecf_type"),
    )

    id = Column(GUID, primary_key=True, default=uuid7)
    tenant_id = Column(GUID, ForeignKey("tenants.id"), nullable=False, index=True)
    organization_id = Column(GUID, ForeignKey("organizations.id"), nullable=False, index=True)

    ecf_type = Column(Integer, nullable=False) # e.g. 31, 32, 34, 43
    prefix = Column(String, default="E", nullable=False)
    start_number = Column(Integer, nullable=False)
    end_number = Column(Integer, nullable=False)
    current_number = Column(Integer, nullable=False)
    expiry_date = Column(Date, nullable=True)
    is_active = Column(Boolean, default=True, index=True)

    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    def to_dict(self):
        return {
            "id": str(self.id),
            "tenant_id": str(self.tenant_id),
            "organization_id": str(self.organization_id),
            "ecf_type": self.ecf_type,
            "prefix": self.prefix,
            "start_number": self.start_number,
            "end_number": self.end_number,
            "current_number": self.current_number,
            "expiry_date": self.expiry_date.isoformat() if self.expiry_date else None,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
