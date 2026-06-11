import secrets
from datetime import timedelta
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from uuid_utils import uuid7

from app.database import Base, GUID
from app.utils.dates import utc_now


class UploadLink(Base):
    __tablename__ = "upload_links"

    id = Column(GUID, primary_key=True, default=uuid7)
    tenant_id = Column(GUID, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id = Column(GUID, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by_user_id = Column(GUID, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    client_email = Column(String(255), nullable=False)
    token = Column(String(100), unique=True, nullable=False, index=True, default=lambda: secrets.token_urlsafe(32))
    max_files = Column(Integer, nullable=False, default=10)
    uploaded_count = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    expires_at = Column(DateTime(timezone=True), nullable=False)

    tenant = relationship("Tenant", lazy="joined")
    organization = relationship("Organization", lazy="joined")
    created_by = relationship("User", lazy="joined")

    def __init__(self, **kwargs):
        if "expires_at" not in kwargs:
            # default 24h expiration
            kwargs["expires_at"] = utc_now() + timedelta(hours=24)
        super().__init__(**kwargs)

    def to_dict(self) -> dict:
        return {
            "id": str(self.id),
            "tenant_id": str(self.tenant_id),
            "organization_id": str(self.organization_id),
            "created_by_user_id": str(self.created_by_user_id) if self.created_by_user_id else None,
            "client_email": self.client_email,
            "token": self.token,
            "max_files": self.max_files,
            "uploaded_count": self.uploaded_count,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
        }
