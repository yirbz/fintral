"""UserSubscription — per-user Fintral Hub subscription, managed via Lago billing engine."""

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from uuid_utils import uuid7

from app.database import Base, GUID
from app.utils.dates import utc_now


class UserSubscription(Base):
    """Per-user Fintral Hub subscription.

    Each user who signs up gets a free trial. When the trial ends, the user
    must subscribe to continue using Fintral Hub (contabilidad.*).
    Hub subscriptions are per-user; each user manages their own billing.

    Fintral Factura (factura.*) is always free — only e-CF documents are
    pre-paid per organization, gated by org membership + billing permission.
    """
    __tablename__ = "user_subscriptions"

    id = Column(GUID, primary_key=True, default=uuid7)
    user_id = Column(GUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    plan_id = Column(GUID, ForeignKey("subscription_plans.id", ondelete="SET NULL"), nullable=True)

    status = Column(String(32), nullable=False, default="trialing")
    # trialing | active | past_due | canceled | expired

    trial_ends_at = Column(DateTime(timezone=True), nullable=True)

    # Addon capacity
    addon_entity_slots = Column(Integer, default=0)
    pending_cancel_entity_slots = Column(Integer, default=0, nullable=False)

    # Lago billing engine fields
    lago_subscription_id = Column(String(64), nullable=True, index=True)
    lago_customer_id = Column(String(64), nullable=True, index=True)
    lago_plan_code = Column(String(100), nullable=True)
    payment_method = Column(String(50), nullable=True)
    auto_renew = Column(Boolean, default=True, nullable=False)

    billing_cycle_start = Column(DateTime(timezone=True), nullable=True)
    billing_cycle_end = Column(DateTime(timezone=True), nullable=True)
    canceled_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    user = relationship("User", backref="user_subscriptions", lazy="select")
    plan = relationship("SubscriptionPlan", lazy="select")
