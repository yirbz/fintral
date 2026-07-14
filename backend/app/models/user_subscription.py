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

    # Compatibility properties for org-level subscription interface
    @property
    def auto_renew_addons(self) -> bool:
        return False

    @property
    def addon_ecf_blocks(self) -> int:
        return 0

    @property
    def addon_ai_blocks(self) -> int:
        return 0

    @property
    def addon_storage_blocks(self) -> int:
        return 0

    @property
    def addon_ocr_blocks(self) -> int:
        return 0

    @property
    def addon_user_slots(self) -> int:
        return 0

    @property
    def pending_cancel_user_slots(self) -> int:
        return 0

    @property
    def pending_cancel_ai_blocks(self) -> int:
        return 0

    @property
    def pending_cancel_storage_blocks(self) -> int:
        return 0

    @property
    def pending_cancel_ocr_blocks(self) -> int:
        return 0

    def effective_limits(self) -> dict:
        """Return the actual limits combining plan base + addons."""
        if not self.plan:
            return {}

        plan = self.plan
        return {
            "max_users": plan.max_users,
            "max_entities": plan.max_entities + (self.addon_entity_slots or 0),
            "max_products": plan.max_products,
            "max_ecf_monthly": plan.max_ecf_monthly,
            "max_ai_queries_monthly": plan.max_ai_queries_monthly,
            "max_ocr_docs_monthly": plan.max_ocr_docs_monthly,
            "max_storage_mb": plan.max_storage_mb,
            "max_api_calls_monthly": plan.max_api_calls_monthly,
            "max_ai_rate_per_minute": plan.max_ai_rate_per_minute,
            "max_api_rate_per_minute": plan.max_api_rate_per_minute,
            "max_ocr_rate_per_minute": plan.max_ocr_rate_per_minute,
        }

    @property
    def organization_id(self) -> str:
        if hasattr(self, "_temp_organization_id") and self._temp_organization_id:
            return str(self._temp_organization_id)
        if self.user and self.user.user_organizations:
            return str(self.user.user_organizations[0].organization_id)
        return ""

    def to_dict(self) -> dict:
        limits = self.effective_limits()
        return {
            "id": str(self.id),
            "organization_id": self.organization_id,
            "user_id": str(self.user_id),
            "plan_id": str(self.plan_id),
            "plan_name": self.plan.display_name if self.plan else None,
            "status": self.status,
            "lago_subscription_id": self.lago_subscription_id,
            "lago_customer_id": self.lago_customer_id,
            "lago_plan_code": self.lago_plan_code,
            "payment_method": self.payment_method,
            "billing_cycle_start": self.billing_cycle_start.isoformat() if self.billing_cycle_start else None,
            "billing_cycle_end": self.billing_cycle_end.isoformat() if self.billing_cycle_end else None,
            "trial_ends_at": self.trial_ends_at.isoformat() if self.trial_ends_at else None,
            "canceled_at": self.canceled_at.isoformat() if self.canceled_at else None,
            "addons": {
                "ecf_blocks": 0,
                "ai_blocks": 0,
                "storage_blocks": 0,
                "extra_entities": 0,
                "billing_entities": 0,
                "entity_slots": self.addon_entity_slots,
                "user_slots": 0,
                "ocr_blocks": 0,
            },
            "auto_renew_addons": self.auto_renew_addons,
            "limits": limits,
            "is_trialing": self.status == "trialing",
        }
