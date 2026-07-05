"""MioPaymentOrder — Model to track card checkout orders created in MIO."""

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, JSON
from sqlalchemy.orm import relationship

from app.database import Base, GUID
from app.utils.dates import utc_now


VALID_STATUSES = frozenset({"PENDING", "SUCCESS", "FAILED", "EXPIRED", "REPLACED", "RETRYING"})

STATE_MACHINE: dict[str, frozenset[str]] = {
    "PENDING": frozenset({"SUCCESS", "FAILED", "EXPIRED", "REPLACED", "RETRYING"}),
    "RETRYING": frozenset({"SUCCESS", "FAILED", "EXPIRED", "REPLACED"}),
    "SUCCESS": frozenset(),  # terminal
    "FAILED": frozenset({"PENDING", "RETRYING"}),  # can retry
    "EXPIRED": frozenset({"PENDING", "RETRYING"}),  # can regenerate
    "REPLACED": frozenset(),  # terminal
}


def valid_transition(from_status: str, to_status: str) -> bool:
    return to_status in STATE_MACHINE.get(from_status, frozenset())


class MioPaymentOrder(Base):
    """Tracks status of hosted checkouts created in MIO payment gateway."""
    __tablename__ = "mio_payment_orders"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_uuid = Column(String(255), unique=True, nullable=False, index=True)
    lago_invoice_id = Column(String(255), nullable=True, index=True)
    organization_id = Column(GUID, ForeignKey("organizations.id"), nullable=True)
    user_id = Column(GUID, ForeignKey("users.id"), nullable=True)
    plan_id = Column(GUID, ForeignKey("subscription_plans.id"), nullable=True)
    cart_items_json = Column(JSON, nullable=True)

    context_type = Column(String(50), nullable=True, index=True)
    context_id = Column(String(255), nullable=True, index=True)
    idempotency_key = Column(String(128), nullable=True, unique=True, index=True)
    replaced_by_id = Column(Integer, ForeignKey("mio_payment_orders.id"), nullable=True)
    replaced_at = Column(DateTime(timezone=True), nullable=True)

    amount_cents = Column(Integer, nullable=False)
    currency = Column(String(10), default="DOP", nullable=False)
    status = Column(String(50), default="PENDING", nullable=False, index=True)
    checkout_url = Column(Text, nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)

    payment_id = Column(String(255), nullable=True)
    authorization_code = Column(String(255), nullable=True)
    reference_number = Column(String(255), nullable=True)
    webhook_payload = Column(JSON, nullable=True)

    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    organization = relationship("Organization")
    user = relationship("User")
    plan = relationship("SubscriptionPlan")
    replaced_by = relationship("MioPaymentOrder", remote_side="MioPaymentOrder.id", foreign_keys=[replaced_by_id])
