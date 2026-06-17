from sqlalchemy import Column, Integer, JSON, DateTime, Date
from app.database import Base
from app.utils.dates import utc_now

class MetricsSnapshot(Base):
    __tablename__ = "metrics_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    snapshot_date = Column(Date, unique=True, nullable=False, index=True)
    mrr_cents = Column(Integer, nullable=False, default=0)
    active_subscriptions_count = Column(Integer, nullable=False, default=0)
    plan_distribution = Column(JSON, nullable=False, default=dict)
    status_distribution = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "snapshot_date": self.snapshot_date.isoformat() if self.snapshot_date else None,
            "mrr_cents": self.mrr_cents,
            "active_subscriptions_count": self.active_subscriptions_count,
            "plan_distribution": self.plan_distribution,
            "status_distribution": self.status_distribution,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
