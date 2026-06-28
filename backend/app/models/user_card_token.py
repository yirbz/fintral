"""UserCardToken — Model to track customer payment tokens (Card-on-File) for MIO."""

from sqlalchemy import Column, DateTime, ForeignKey, String, Integer, Boolean
from sqlalchemy.orm import relationship
from uuid_utils import uuid7

from app.database import Base, GUID
from app.utils.dates import utc_now


class UserCardToken(Base):
    """Tracks tokenized payment cards for users to process recurring billing."""
    __tablename__ = "user_card_tokens"

    id = Column(GUID, primary_key=True, default=uuid7)
    user_id = Column(GUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    gateway = Column(String(50), default="mio", nullable=False)
    
    card_token = Column(String(255), nullable=False, unique=True, index=True)
    card_brand = Column(String(50), nullable=True)
    last_four = Column(String(10), nullable=True)
    expiry_month = Column(Integer, nullable=True)
    expiry_year = Column(Integer, nullable=True)
    
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    user = relationship("User", backref="card_tokens")
