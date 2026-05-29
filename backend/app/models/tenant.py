from app.utils.dates import utc_now

from sqlalchemy import Boolean, Column, DateTime, String, Text
from sqlalchemy.orm import relationship
from uuid_utils import uuid7

from app.database import Base, GUID


class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(GUID, primary_key=True, default=uuid7)
    name = Column(String, nullable=False)
    slug = Column(String(63), unique=True, nullable=False, index=True)
    plan = Column(String, default="free")
    is_active = Column(Boolean, default=True)
    settings_json = Column(Text, default="{}")
    deleted_at = Column(DateTime(timezone=True), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    # Relationships
    organizations = relationship("Organization", back_populates="tenant", lazy="select")
    users = relationship("User", back_populates="tenant", lazy="select")
