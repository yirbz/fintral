import secrets

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String
from uuid_utils import uuid7

from app.database import Base, GUID
from app.utils.dates import utc_now


class Invitation(Base):
    __tablename__ = "invitations"

    id = Column(GUID, primary_key=True, default=uuid7)
    organization_id = Column(GUID, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    invited_by_user_id = Column(GUID, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    email = Column(String, nullable=False, index=True)
    role = Column(String, nullable=False, default="member")
    permissions = Column(String, nullable=True)
    token = Column(String, unique=True, nullable=False, index=True, default=lambda: secrets.token_urlsafe(32))
    accepted = Column(Boolean, default=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)
