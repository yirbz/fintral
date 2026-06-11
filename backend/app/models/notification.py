from app.utils.dates import utc_now

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import relationship
from uuid_utils import uuid7

from app.database import Base, GUID


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        Index("ix_notifications_tenant_org", "tenant_id", "organization_id"),
    )

    id = Column(GUID, primary_key=True, default=uuid7)
    tenant_id = Column(GUID, ForeignKey("tenants.id"), nullable=False, index=True)
    organization_id = Column(GUID, ForeignKey("organizations.id"), nullable=False, index=True)

    type = Column(String, index=True)  # 'info', 'success', 'warning', 'error'
    title = Column(String)
    message = Column(String)
    data = Column(Text, nullable=True)  # JSON string with extra data
    read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    # Relationships
    organization = relationship("Organization", back_populates="notifications")

    def to_dict(self):
        return {
            "id": str(self.id),
            "type": self.type,
            "title": self.title,
            "message": self.message,
            "data": self.data,
            "read": self.read,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "time_ago": self.time_ago(),
        }

    def time_ago(self):
        now = utc_now()
        diff = now - self.created_at

        if diff.days > 0:
            return f"hace {diff.days}d"
        elif diff.seconds > 3600:
            return f"hace {diff.seconds // 3600}h"
        elif diff.seconds > 60:
            return f"hace {diff.seconds // 60}m"
        else:
            return "ahora"
