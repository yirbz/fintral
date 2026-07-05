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
    organization_id = Column(GUID, ForeignKey("organizations.id"), nullable=True, index=True)
    plan_id = Column(GUID, ForeignKey("subscription_plans.id"), nullable=True)

    # ── Status ───────────────────────────────────────────────────────
    status = Column(
        String(32),
        nullable=False,
        default="trialing",
        # active | trialing | past_due | canceled | expired | suspended
    )

    current_billing_period_start = Column(DateTime(timezone=True), nullable=True)
    current_billing_period_end = Column(DateTime(timezone=True), nullable=True)

    # ── Lago Billing fields ──────────────────────────────────────────
    lago_subscription_id = Column(String(64), nullable=True, index=True)
    lago_customer_id = Column(String(64), nullable=True, index=True)
    lago_plan_code = Column(String(100), nullable=True)
    payment_method = Column(String(50), nullable=True)  # card | transfer
    billing_time = Column(String(20), default="anniversary")  # anniversary | calendar

    # ── MIO Payment fields ───────────────────────────────────────────
    mio_customer_token = Column(String(255), nullable=True)  # card-on-file token

    # ── Billing cycle ────────────────────────────────────────────────
    billing_cycle_start = Column(DateTime(timezone=True), nullable=True)
    billing_cycle_end = Column(DateTime(timezone=True), nullable=True)
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
    addon_ocr_blocks = Column(Integer, default=0)        # extra OCR doc blocks
    auto_renew_addons = Column(Boolean, default=False)   # auto-purchase on soft limit
    pending_cancel_entity_slots = Column(Integer, default=0, nullable=False)
    pending_cancel_user_slots = Column(Integer, default=0, nullable=False)
    pending_cancel_ai_blocks = Column(Integer, default=0, nullable=False)
    pending_cancel_storage_blocks = Column(Integer, default=0, nullable=False)
    pending_cancel_ocr_blocks = Column(Integer, default=0, nullable=False)

    # ── Pending plan change (set from statement page) ────────────────
    pending_plan_change_id = Column(GUID, ForeignKey("subscription_plans.id"), nullable=True)

    # ── Override (for Enterprise custom plans) ───────────────────────
    custom_limits_json = Column(String, nullable=True)   # JSON override of plan limits
    custom_price_cents = Column(Integer, nullable=True)  # negotiated price

    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    # Relationships
    organization = relationship("Organization", backref="subscriptions", lazy="select")
    plan = relationship("SubscriptionPlan", foreign_keys=[plan_id], lazy="select")
    pending_plan_change = relationship("SubscriptionPlan", foreign_keys=[pending_plan_change_id], lazy="select")

    def to_dict(self) -> dict:
        limits = self.effective_limits()
        return {
            "id": str(self.id),
            "organization_id": str(self.organization_id),
            "plan_id": str(self.plan_id),
            "plan_name": self.plan.display_name if self.plan else None,
            "status": self.status,
            "lago_subscription_id": self.lago_subscription_id,
            "lago_customer_id": self.lago_customer_id,
            "lago_plan_code": self.lago_plan_code,
            "payment_method": self.payment_method,
            "billing_time": self.billing_time,
            "mio_customer_token": self.mio_customer_token,
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
                "ocr_blocks": self.addon_ocr_blocks,
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
            "max_users": plan.max_users + (self.addon_user_slots or 0),
            "max_entities": plan.max_entities + (self.addon_entity_slots or 0),
            "max_products": plan.max_products,
            "max_ecf_monthly": plan.max_ecf_monthly
                + ((self.addon_ecf_blocks or 0) * plan.addon_ecf_block_size),
            "max_ai_queries_monthly": plan.max_ai_queries_monthly
                + ((self.addon_ai_blocks or 0) * plan.addon_ai_block_size),
            "max_ocr_docs_monthly": plan.max_ocr_docs_monthly
                + ((self.addon_ocr_blocks or 0) * plan.addon_ocr_block_size),
            "max_storage_mb": plan.max_storage_mb
                + ((self.addon_storage_blocks or 0) * plan.addon_storage_block_mb),
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
