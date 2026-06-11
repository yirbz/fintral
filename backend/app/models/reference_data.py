import json

from app.utils.dates import utc_now

from sqlalchemy import Boolean, Column, DateTime, Index, Integer, String, Text
from uuid_utils import uuid7

from app.database import Base, GUID


class ReferenceData(Base):
    __tablename__ = "reference_data"
    __table_args__ = (
        Index("ix_refdata_domain_code", "domain", "code", unique=True),
        Index("ix_refdata_domain", "domain"),
    )

    id = Column(GUID, primary_key=True, default=uuid7)
    domain = Column(String(50), nullable=False)
    code = Column(String(50), nullable=False)
    label_es = Column(String(300), nullable=False)
    description = Column(Text, nullable=True)
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    def to_dict(self):
        meta = None
        if self.metadata_json:
            try:
                meta = json.loads(self.metadata_json)
            except Exception:
                meta = self.metadata_json
        return {
            "id": str(self.id),
            "domain": self.domain,
            "code": self.code,
            "label_es": self.label_es,
            "description": self.description,
            "sort_order": self.sort_order,
            "is_active": self.is_active,
            "metadata": meta,
        }
