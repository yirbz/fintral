from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, String, UniqueConstraint
from uuid_utils import uuid7

from app.database import Base, GUID


class UserOrganization(Base):
    """Join table mapping users to the organizations they can access, with a role."""

    __tablename__ = "user_organizations"
    __table_args__ = (
        UniqueConstraint("user_id", "organization_id", name="uq_user_org"),
    )

    id = Column(GUID, primary_key=True, default=uuid7)
    user_id = Column(GUID, ForeignKey("users.id"), nullable=False, index=True)
    organization_id = Column(GUID, ForeignKey("organizations.id"), nullable=False, index=True)
    role = Column(String, nullable=False, default="member")  # owner / admin / member / viewer
    created_at = Column(DateTime, default=datetime.utcnow)
