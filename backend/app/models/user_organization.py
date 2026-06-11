from sqlalchemy import Column, DateTime, ForeignKey, String, Text, UniqueConstraint
from uuid_utils import uuid7

from app.database import Base, GUID
from app.utils.dates import utc_now


class UserOrganization(Base):
    """Join table mapping users to the organizations they can access, with a role."""

    __tablename__ = "user_organizations"
    __table_args__ = (
        UniqueConstraint("user_id", "organization_id", name="uq_user_org"),
    )

    id = Column(GUID, primary_key=True, default=uuid7)
    user_id = Column(GUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id = Column(GUID, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String, nullable=False, default="member")  # owner / admin / member / viewer
    permissions = Column(Text, nullable=True)  # JSON array of explicit permissions; null = use role defaults
    created_at = Column(DateTime(timezone=True), default=utc_now)
