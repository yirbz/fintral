"""UsageRecord — tracks resource consumption per org per billing cycle."""

from sqlalchemy import BigInteger, Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from uuid_utils import uuid7

from app.database import Base, GUID
from app.utils.dates import utc_now


class UsageRecord(Base):
    """Monthly usage counters for an organization.

    One record per org per billing cycle (month). Rate-limit windows
    are tracked ephemerally in Redis; the monthly totals here drive
    soft-limit decisions and overage billing.
    """
    __tablename__ = "usage_records"

    id = Column(GUID, primary_key=True, default=uuid7)
    organization_id = Column(GUID, ForeignKey("organizations.id"), nullable=False, index=True)

    # ── Cycle identifier (YYYYMM integer, e.g. 202606) ──────────────
    cycle = Column(Integer, nullable=False, index=True)

    # ── Cumulative counters ──────────────────────────────────────────
    ecf_count = Column(Integer, default=0, nullable=False)
    ai_query_count = Column(Integer, default=0, nullable=False)
    ocr_doc_count = Column(Integer, default=0, nullable=False)
    storage_bytes = Column(BigInteger, default=0, nullable=False)
    api_call_count = Column(Integer, default=0, nullable=False)

    # ── Soft-limit tracking ──────────────────────────────────────────
    soft_limit_80pct_notified = Column(Boolean, default=False)
    soft_limit_100pct_notified = Column(Boolean, default=False)
    overage_detected = Column(Boolean, default=False)
    overage_units = Column(Integer, default=0)        # docs exceeded beyond addons
    overage_amount_cents = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), default=utc_now)
    last_updated = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    # Relationships
    organization = relationship("Organization", backref="usage_records", lazy="select")

    def to_dict(self) -> dict:
        return {
            "id": str(self.id),
            "organization_id": str(self.organization_id),
            "cycle": self.cycle,
            "usage": {
                "ecf_count": self.ecf_count,
                "ai_query_count": self.ai_query_count,
                "ocr_doc_count": self.ocr_doc_count,
                "storage_mb": round(self.storage_bytes / (1024 * 1024), 2),
                "api_call_count": self.api_call_count,
            },
            "soft_limits": {
                "80pct_notified": self.soft_limit_80pct_notified,
                "100pct_notified": self.soft_limit_100pct_notified,
            },
            "overage": {
                "detected": self.overage_detected,
                "units": self.overage_units,
                "amount_cents": self.overage_amount_cents,
            },
        }


class UsageAlert(Base):
    """Persistent log of soft-limit notifications sent to org members."""
    __tablename__ = "usage_alerts"

    id = Column(GUID, primary_key=True, default=uuid7)
    organization_id = Column(GUID, ForeignKey("organizations.id"), nullable=False, index=True)

    alert_type = Column(String(64), nullable=False)
    # 80pct_ecf | 100pct_ecf | 80pct_ai | 100pct_ai
    # 80pct_storage | 100pct_storage | 80pct_ocr | 100pct_ocr
    # overage_charged | addon_auto_purchased

    cycle = Column(Integer, nullable=False)
    message = Column(String(512), nullable=False)
    pct_used = Column(Integer, nullable=True)   # 80, 100, etc.
    current_usage = Column(Integer, nullable=True)
    limit_value = Column(Integer, nullable=True)
    sent_at = Column(DateTime(timezone=True), default=utc_now)
    acknowledged = Column(Boolean, default=False)

    created_at = Column(DateTime(timezone=True), default=utc_now)

    organization = relationship("Organization", backref="usage_alerts", lazy="select")
