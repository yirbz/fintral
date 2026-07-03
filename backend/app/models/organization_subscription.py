"""OrganizationSubscription — links an org to its active plan + addons."""

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from uuid_utils import uuid7

from app.database import Base, GUID
from app.utils.dates import utc_now


class OrganizationSubscription(Base):
    """Current or historical subscription record for an organization."""
    __tablename__ = "organization_subscriptions"

    id = Column(GUID, primary_key=True, default=uuid7)
    organization_id = Column(GUID, ForeignKey("organizations.id"), nullable=False, index=True)
    plan_id = Column(GUID, ForeignKey("subscription_plans.id"), nullable=False)

    # ── Status ───────────────────────────────────────────────────────
    status = Column(
        String(32),
        nullable=False,
        default="trialing",
        # active | trialing | past_due | canceled | expired
    )

    # ── Billing cycle ────────────────────────────────────────────────
    billing_cycle_start = Column(DateTime(timezone=True), nullable=False)
    billing_cycle_end = Column(DateTime(timezone=True), nullable=False)
    trial_ends_at = Column(DateTime(timezone=True), nullable=True)
    canceled_at = Column(DateTime(timezone=True), nullable=True)

    # ── Addons purchased this cycle ──────────────────────────────────
    addon_ecf_blocks = Column(Integer, default=0)        # extra 100-doc blocks
    addon_ai_blocks = Column(Integer, default=0)         # extra 500-query blocks
    addon_storage_blocks = Column(Integer, default=0)    # extra 10GB blocks
    addon_extra_entities = Column(Integer, default=0)    # DEPRECATED — always 0
    addon_billing_entities = Column(Integer, default=0)  # DEPRECATED — always 0
    addon_entity_slots = Column(Integer, default=0)      # extra entity slots beyond plan limit
    addon_user_slots = Column(Integer, default=0)        # extra user slots beyond plan limit
    auto_renew_addons = Column(Boolean, default=False)   # auto-purchase on soft limit

    # ── Override (for Enterprise custom plans) ───────────────────────
    custom_limits_json = Column(String, nullable=True)   # JSON override of plan limits
    custom_price_cents = Column(Integer, nullable=True)  # negotiated price

    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    # Relationships
    organization = relationship("Organization", backref="subscriptions", lazy="select")
    plan = relationship("SubscriptionPlan", lazy="select")

    def to_dict(self) -> dict:
        limits = self.effective_limits()
        return {
            "id": str(self.id),
            "organization_id": str(self.organization_id),
            "plan_id": str(self.plan_id),
            "plan_name": self.plan.display_name if self.plan else None,
            "status": self.status,
            "billing_cycle_start": self.billing_cycle_start.isoformat() if self.billing_cycle_start else None,
            "billing_cycle_end": self.billing_cycle_end.isoformat() if self.billing_cycle_end else None,
            "trial_ends_at": self.trial_ends_at.isoformat() if self.trial_ends_at else None,
            "canceled_at": self.canceled_at.isoformat() if self.canceled_at else None,
            "addons": {
                "ecf_blocks": self.addon_ecf_blocks,
                "ai_blocks": self.addon_ai_blocks,
                "storage_blocks": self.addon_storage_blocks,
                "extra_entities": 0,  # DEPRECATED
                "billing_entities": 0,  # DEPRECATED
                "entity_slots": self.addon_entity_slots,
                "user_slots": self.addon_user_slots,
            },
            "auto_renew_addons": self.auto_renew_addons,
            "limits": limits,
            "is_trialing": self.status == "trialing",
        }

    def effective_limits(self) -> dict:
        """Return the actual limits combining plan base + addons."""
        if not self.plan:
            return {}

        plan = self.plan
        base = {
            "max_users": plan.max_users + self.addon_user_slots,
            "max_entities": plan.max_entities + self.addon_entity_slots,
            "max_ecf_monthly": plan.max_ecf_monthly
                + (self.addon_ecf_blocks * plan.addon_ecf_block_size),
            "max_ai_queries_monthly": plan.max_ai_queries_monthly
                + (self.addon_ai_blocks * plan.addon_ai_block_size),
            "max_ocr_docs_monthly": plan.max_ocr_docs_monthly,
            "max_storage_mb": plan.max_storage_mb
                + (self.addon_storage_blocks * plan.addon_storage_block_mb),
            "max_api_calls_monthly": plan.max_api_calls_monthly,
            "max_ai_rate_per_minute": plan.max_ai_rate_per_minute,
            "max_api_rate_per_minute": plan.max_api_rate_per_minute,
            "max_ocr_rate_per_minute": plan.max_ocr_rate_per_minute,
        }

        # Apply custom overrides if present
        if self.custom_limits_json:
            import json
            try:
                overrides = json.loads(self.custom_limits_json)
                for k, v in overrides.items():
                    if k in base and v is not None:
                        base[k] = v
            except (json.JSONDecodeError, TypeError):
                pass

        return base
