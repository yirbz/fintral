"""BillingWebhookEvent — idempotent event log for billing webhooks (Lago/MIO)."""

from sqlalchemy import Boolean, Column, DateTime, Integer, String, JSON

from app.database import Base
from app.utils.dates import utc_now


class BillingWebhookEvent(Base):
    """Persisted webhook event for idempotency and debugging.

    Every incoming webhook from Lago or MIO is persisted BEFORE processing.
    If event_id already exists, processing is skipped (idempotency).
    """
    __tablename__ = "billing_webhook_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_id = Column(String(128), unique=True, nullable=False, index=True)
    event_type = Column(String(64), nullable=False, index=True)
    source = Column(String(20), default="lago")  # "lago" | "mio"
    payload = Column(JSON, nullable=False)
    processed = Column(Boolean, default=False, nullable=False)
    processed_at = Column(DateTime(timezone=True), nullable=True)
    error = Column(String, nullable=True)
    attempts = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)
