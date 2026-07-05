"""RefundRequest — Model to track refund requests for billing transactions."""

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from uuid_utils import uuid7

from app.database import Base, GUID
from app.utils.dates import utc_now


class RefundRequest(Base):
    """Tracks customer-submitted refund requests for verification and processing."""
    __tablename__ = "refund_requests"

    id = Column(GUID, primary_key=True, default=uuid7)
    user_id = Column(GUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    payment_order_id = Column(Integer, ForeignKey("mio_payment_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    
    amount_cents = Column(Integer, nullable=False)
    reason = Column(String(255), nullable=False)
    notes = Column(Text, nullable=True)
    
    status = Column(String(50), default="pending", nullable=False)  # pending | approved | rejected
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    user = relationship("User", backref="refund_requests")
    payment_order = relationship("MioPaymentOrder", backref="refund_requests")
