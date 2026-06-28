"""MioPaymentOrder — Model to track card checkout orders created in MIO."""

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, JSON
from sqlalchemy.orm import relationship

from app.database import Base, GUID
from app.utils.dates import utc_now


class MioPaymentOrder(Base):
    """Tracks status of hosted checkouts created in MIO payment gateway."""
    __tablename__ = "mio_payment_orders"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_uuid = Column(String(255), unique=True, nullable=False, index=True)
    lago_invoice_id = Column(String(255), nullable=True, index=True)
    organization_id = Column(GUID, ForeignKey("organizations.id"), nullable=True)
    user_id = Column(GUID, ForeignKey("users.id"), nullable=True)
    plan_id = Column(GUID, ForeignKey("subscription_plans.id"), nullable=True)
    
    amount_cents = Column(Integer, nullable=False)
    currency = Column(String(10), default="DOP", nullable=False)
    status = Column(String(50), default="PENDING", nullable=False)  # PENDING | SUCCESS | FAILED | EXPIRED
    checkout_url = Column(Text, nullable=True)

    # Post-checkout payment fields populated via Webhook
    payment_id = Column(String(255), nullable=True)
    authorization_code = Column(String(255), nullable=True)
    reference_number = Column(String(255), nullable=True)
    webhook_payload = Column(JSON, nullable=True)

    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    # Relationships
    organization = relationship("Organization")
    user = relationship("User")
    plan = relationship("SubscriptionPlan")
