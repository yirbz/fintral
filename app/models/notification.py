from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text

from app.database import Base


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String, index=True)  # 'info', 'success', 'warning', 'error'
    title = Column(String)
    message = Column(String)
    data = Column(Text, nullable=True)  # JSON string with extra data
    read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    organization_id = Column(Integer, ForeignKey("organizations.id"), index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "type": self.type,
            "title": self.title,
            "message": self.message,
            "data": self.data,
            "read": self.read,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "time_ago": self.time_ago(),
        }

    def time_ago(self):
        now = datetime.utcnow()
        diff = now - self.created_at

        if diff.days > 0:
            return f"hace {diff.days}d"
        elif diff.seconds > 3600:
            return f"hace {diff.seconds // 3600}h"
        elif diff.seconds > 60:
            return f"hace {diff.seconds // 60}m"
        else:
            return "ahora"
