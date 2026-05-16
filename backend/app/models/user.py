from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String
from sqlalchemy.orm import relationship
from uuid_utils import uuid7

from app.database import Base, GUID


class User(Base):
    __tablename__ = "users"

    id = Column(GUID, primary_key=True, default=uuid7)
    tenant_id = Column(GUID, ForeignKey("tenants.id"), nullable=False, index=True)
    email = Column(String, unique=True, index=True)
    supabase_uid = Column(String, unique=True, nullable=True, index=True)
    hashed_password = Column(String, nullable=True)
    full_name = Column(String)
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    tenant = relationship("Tenant", back_populates="users")
    user_organizations = relationship("UserOrganization", lazy="select")
    organizations = relationship(
        "Organization",
        secondary="user_organizations",
        viewonly=True,
        lazy="select",
    )
