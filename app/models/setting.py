from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint

from app.database import Base


class Setting(Base):
    __tablename__ = "settings"

    key = Column(String, primary_key=True, index=True)
    value = Column(String)
    type = Column(String)  # 'string', 'int', 'float', 'boolean', 'json'
    category = Column(String)  # 'general', 'openai', 'whatsapp'
    description = Column(String)
    organization_id = Column(Integer, ForeignKey("organizations.id"), index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class UserSetting(Base):
    __tablename__ = "user_settings"
    __table_args__ = (UniqueConstraint("user_id", "key", name="uq_user_settings_user_key"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    key = Column(String, index=True)
    value = Column(String)
    type = Column(String)  # 'string', 'int', 'float', 'boolean', 'json'
    category = Column(String)  # 'general', 'openai', 'whatsapp'
    description = Column(String)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
