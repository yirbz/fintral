from datetime import timedelta

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from uuid_utils import uuid7

from app.config import IS_DEVELOPMENT, SUPABASE_URL, SUPABASE_STORAGE_BUCKET
from app.database import Base, GUID
from app.utils.dates import utc_now


class PendingUpload(Base):
    __tablename__ = "pending_uploads"

    id = Column(GUID, primary_key=True, default=uuid7)
    tenant_id = Column(GUID, ForeignKey("tenants.id"), nullable=False, index=True)
    organization_id = Column(GUID, ForeignKey("organizations.id"), nullable=False, index=True)
    user_id = Column(GUID, ForeignKey("users.id"), nullable=False, index=True)
    upload_link_id = Column(GUID, ForeignKey("upload_links.id", ondelete="CASCADE"), nullable=True, index=True)

    filename = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_type = Column(String(20), nullable=False)  # image | pdf | xml
    file_size = Column(Integer, nullable=False, default=0)

    processed = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    expires_at = Column(DateTime(timezone=True), nullable=False)

    tenant = relationship("Tenant", lazy="joined")
    organization = relationship("Organization", lazy="joined")
    user = relationship("User", lazy="joined")
    upload_link = relationship("UploadLink", lazy="joined")

    def __init__(self, **kwargs):
        if "expires_at" not in kwargs:
            kwargs["expires_at"] = utc_now() + timedelta(hours=48)
        super().__init__(**kwargs)

    def to_dict(self) -> dict:
        file_url = None
        if self.file_path:
            if IS_DEVELOPMENT:
                file_url = f"/pending-uploads/{self.id}/file"
            elif SUPABASE_URL:
                file_url = f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_STORAGE_BUCKET}/{self.file_path.lstrip('/')}"
        return {
            "id": str(self.id),
            "tenant_id": str(self.tenant_id),
            "organization_id": str(self.organization_id),
            "user_id": str(self.user_id),
            "upload_link_id": str(self.upload_link_id) if self.upload_link_id else None,
            "filename": self.filename,
            "file_path": self.file_path,
            "file_url": file_url,
            "file_type": self.file_type,
            "file_size": self.file_size,
            "processed": self.processed,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
        }
