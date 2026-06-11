"""
PlanService — domain logic for plan enforcement, subscriptions, addons.

Coordinates between:
  - SubscriptionPlan (static definitions)
  - OrganizationSubscription (per-org state)
  - UsageTracker (per-cycle counters)
  - Redis (rate-limit windows)

All endpoints that consume plan-limited resources go through this service.
"""
import json
import logging
from datetime import date, datetime, timedelta
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.models import (
    SubscriptionPlan,
    OrganizationSubscription,
    Organization,
    UsageRecord,
    UsageAlert,
)
from app.services.usage_tracker import UsageTracker, _current_cycle

logger = logging.getLogger(__name__)

# Number of days for free trial
TRIAL_DAYS = 15


class PlanLimitExceeded(Exception):
    """Raised when a hard limit prevents the operation."""
    def __init__(self, reason: str, usage: dict):
        self.reason = reason
        self.usage = usage
        super().__init__(reason)


class PlanService:
    """Subscription plan enforcement and management."""

    def __init__(self, db: Session):
        self.db = db
        self.tracker = UsageTracker(db)

    # ── Plan resolution ─────────────────────────────────────────────

    def get_plan_for_org(self, org_id) -> tuple[Optional[OrganizationSubscription], Optional[SubscriptionPlan]]:
        """Get active subscription + plan for an org.

        Returns (subscription, plan) or (None, free_plan) if no subscription.
        Creates a trial subscription on first access if none exists.
        """
        today = date.today()
        sub = (
            self.db.query(OrganizationSubscription)
            .filter(
                OrganizationSubscription.organization_id == org_id,
                OrganizationSubscription.status.in_(["active", "trialing"]),
                OrganizationSubscription.billing_cycle_start <= today,
                OrganizationSubscription.billing_cycle_end >= today,
            )
            .first()
        )

        if sub:
            return sub, sub.plan

        # Auto-create trial subscription with Esencial plan
        default_plan = (
            self.db.query(SubscriptionPlan)
            .filter(SubscriptionPlan.name == "esencial")
            .first()
        )
        if not default_plan:
            logger.error("No 'esencial' plan found in DB — run seed_plans first")
            return None, None

        trial_end = datetime.utcnow() + timedelta(days=TRIAL_DAYS)
        cycle_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if cycle_start.month == 12:
            cycle_end = cycle_start.replace(year=cycle_start.year + 1, month=1)
        else:
            cycle_end = cycle_start.replace(month=cycle_start.month + 1)

        new_sub = OrganizationSubscription(
            organization_id=org_id,
            plan_id=default_plan.id,
            status="trialing",
            billing_cycle_start=cycle_start,
            billing_cycle_end=cycle_end,
            trial_ends_at=trial_end,
        )
        self.db.add(new_sub)
        self.db.commit()
        self.db.refresh(new_sub)

        logger.info("🆕 Auto-created trial subscription for org %s", org_id)
        return new_sub, default_plan

    def effective_limits(self, org_id) -> dict:
        """Return the effective resource limits for an org."""
        sub, plan = self.get_plan_for_org(org_id)
        if not sub or not plan:
            return {}
        return sub.effective_limits()

    def get_usage_summary(self, org_id) -> dict:
        """Return full usage + plan info for an org."""
        sub, plan = self.get_plan_for_org(org_id)
        if not plan:
            return {"error": "No active plan"}

        limits = sub.effective_limits()
        usage = self.tracker.get_current_usage(org_id, limits)

        return {
            "plan": plan.to_dict(),
            "subscription": sub.to_dict() if sub else None,
            "usage": usage,
            "trial_remaining_days": (
                (sub.trial_ends_at.date() - date.today()).days
                if sub and sub.trial_ends_at and sub.status == "trialing"
                else 0
            ),
        }

    # ── Limit checks (throw PlanLimitExceeded on hard block) ─────────

    def check_ecf_limit(self, org_id, amount: int = 1):
        """Check if org can emit N e-CF documents this cycle."""
        sub, plan = self.get_plan_for_org(org_id)
        if not plan:
            raise PlanLimitExceeded("no_active_plan", {})

        limits = sub.effective_limits()
        max_ecf = limits.get("max_ecf_monthly", 0)
        if max_ecf <= 0:
            raise PlanLimitExceeded("ecf_not_available", {"limit": 0})

        record = self._get_usage(org_id)
        current = record.ecf_count if record else 0

        if current + amount > max_ecf:
            # Soft limit: if enabled and org has auto-renew, purchase a block
            if plan.soft_limit_enabled and sub.auto_renew_addons and plan.addon_ecf_block_size > 0:
                sub.addon_ecf_blocks += 1
                new_limit = limits["max_ecf_monthly"] + plan.addon_ecf_block_size
                limits["max_ecf_monthly"] = new_limit
                self.db.commit()
                logger.info(
                    "🔄 Auto-purchased e-CF addon block for org %s. New limit: %s",
                    org_id, new_limit,
                )
                return self._limit_ok(new_limit, current, amount)

            # Overage: detect and allow (soft limit)
            record.overage_detected = True
            record.overage_units = current + amount - max_ecf
            self.db.commit()

            return self._limit_ok(max_ecf, current, amount, overage=True)

        return self._limit_ok(max_ecf, current, amount)

    def check_ai_query_limit(self, org_id, amount: int = 1):
        """Check if org can make N AI queries."""
        sub, plan = self.get_plan_for_org(org_id)
        if not plan:
            raise PlanLimitExceeded("no_active_plan", {})

        limits = sub.effective_limits()
        max_ai = limits.get("max_ai_queries_monthly", 0)
        if max_ai <= 0:
            raise PlanLimitExceeded("ai_not_available", {"limit": 0})

        record = self._get_usage(org_id)
        current = record.ai_query_count if record else 0

        if current + amount > max_ai:
            if plan.soft_limit_enabled and sub.auto_renew_addons and plan.addon_ai_block_size > 0:
                sub.addon_ai_blocks += 1
                new_limit = limits["max_ai_queries_monthly"] + plan.addon_ai_block_size
                limits["max_ai_queries_monthly"] = new_limit
                self.db.commit()
                logger.info("🔄 Auto-purchased AI addon block for org %s", org_id)
                return self._limit_ok(new_limit, current, amount)

            raise PlanLimitExceeded(
                "ai_query_limit_exceeded",
                {"used": current, "limit": max_ai, "type": "ai_queries"},
            )

        return self._limit_ok(max_ai, current, amount)

    def check_storage_limit(self, org_id, additional_bytes: int = 0):
        """Check if org has room for additional storage."""
        limits = self.effective_limits(org_id)
        max_mb = limits.get("max_storage_mb", 0)
        if max_mb <= 0:
            raise PlanLimitExceeded("storage_not_available", {"limit": 0})

        record = self._get_usage(org_id)
        current_bytes = record.storage_bytes if record else 0
        current_mb = current_bytes / (1024 * 1024)

        # Estimate new total
        new_total_mb = (current_bytes + additional_bytes) / (1024 * 1024)
        if new_total_mb > max_mb:
            raise PlanLimitExceeded(
                "storage_limit_exceeded",
                {"used_mb": round(current_mb, 1), "limit_mb": max_mb, "type": "storage"},
            )

    def check_rate_limit(self, org_id, limit_type: str):
        """Check per-minute rate limit.

        limit_type: 'ai' | 'api' | 'ocr'
        Raises PlanLimitExceeded if exceeded.
        """
        limits = self.effective_limits(org_id)
        key_map = {"ai": "max_ai_rate_per_minute", "api": "max_api_rate_per_minute", "ocr": "max_ocr_rate_per_minute"}
        limit_key = key_map.get(limit_type, "max_ai_rate_per_minute")
        max_rate = limits.get(limit_key, 0)

        result = self.tracker.check_rate_limit(org_id, limit_type, max_rate)
        if not result["allowed"]:
            raise PlanLimitExceeded(
                f"rate_limit_{limit_type}",
                {"current": result["current"], "limit": result["limit"], "retry_after": result.get("retry_after_seconds", 60)},
            )

        return result

    # ── Usage recording ─────────────────────────────────────────────

    def record_ecf(self, org_id, amount: int = 1):
        self.tracker.increment_ecf(org_id, amount)
        self._post_check(org_id)

    def record_ai_query(self, org_id, amount: int = 1):
        self.tracker.increment_ai_query(org_id, amount)
        self._post_check(org_id)

    def record_ocr_doc(self, org_id, amount: int = 1):
        self.tracker.increment_ocr_doc(org_id, amount)
        self._post_check(org_id)

    def record_api_call(self, org_id, amount: int = 1):
        self.tracker.increment_api_call(org_id, amount)

    def _post_check(self, org_id):
        """Check soft limits and generate alerts after recording usage."""
        sub, plan = self.get_plan_for_org(org_id)
        if not plan:
            return
        limits = sub.effective_limits()
        alerts = self.tracker.check_and_notify(org_id, {}, limits)

        # Persist alerts
        for alert_data in alerts:
            alert = UsageAlert(
                organization_id=org_id,
                alert_type=alert_data["alert_type"],
                cycle=_current_cycle(),
                message=alert_data["message"],
                pct_used=alert_data.get("pct_used"),
                current_usage=alert_data.get("current_usage"),
                limit_value=alert_data.get("limit_value"),
            )
            self.db.add(alert)

        if alerts:
            self.db.commit()

    # ── Subscription management ─────────────────────────────────────

    def change_plan(self, org_id, plan_name: str) -> OrganizationSubscription:
        """Upgrade/downgrade an org's subscription."""
        plan = (
            self.db.query(SubscriptionPlan)
            .filter(SubscriptionPlan.name == plan_name, SubscriptionPlan.is_active.is_(True))
            .first()
        )
        if not plan:
            raise ValueError(f"Plan '{plan_name}' not found or inactive")

        sub, _ = self.get_plan_for_org(org_id)
        if sub:
            sub.plan_id = plan.id
            sub.status = "active"
            sub.trial_ends_at = None
        else:
            cycle_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            if cycle_start.month == 12:
                cycle_end = cycle_start.replace(year=cycle_start.year + 1, month=1)
            else:
                cycle_end = cycle_start.replace(month=cycle_start.month + 1)
            sub = OrganizationSubscription(
                organization_id=org_id,
                plan_id=plan.id,
                status="active",
                billing_cycle_start=cycle_start,
                billing_cycle_end=cycle_end,
            )
            self.db.add(sub)

        self.db.commit()
        self.db.refresh(sub)
        return sub

    def cancel_subscription(self, org_id):
        """Cancel at end of billing cycle."""
        sub, _ = self.get_plan_for_org(org_id)
        if sub:
            sub.status = "canceled"
            sub.canceled_at = datetime.utcnow()
            self.db.commit()

    def purchase_addon(self, org_id, addon_type: str, quantity: int = 1) -> OrganizationSubscription:
        """Purchase addon blocks for the current cycle."""
        sub, plan = self.get_plan_for_org(org_id)
        if not sub or not plan:
            raise ValueError("No active subscription")

        if addon_type == "ecf":
            sub.addon_ecf_blocks = (sub.addon_ecf_blocks or 0) + quantity
        elif addon_type == "ai":
            sub.addon_ai_blocks = (sub.addon_ai_blocks or 0) + quantity
        elif addon_type == "storage":
            sub.addon_storage_blocks = (sub.addon_storage_blocks or 0) + quantity
        elif addon_type == "entity":
            sub.addon_extra_entities = (sub.addon_extra_entities or 0) + quantity
        else:
            raise ValueError(f"Unknown addon type: {addon_type}")

        self.db.commit()
        self.db.refresh(sub)
        return sub

    # ── Internal helpers ────────────────────────────────────────────

    def _get_usage(self, org_id) -> Optional[UsageRecord]:
        cycle = _current_cycle()
        return (
            self.db.query(UsageRecord)
            .filter(
                UsageRecord.organization_id == org_id,
                UsageRecord.cycle == cycle,
            )
            .first()
        )

    @staticmethod
    def _limit_ok(limit_val, current, amount, overage=False) -> dict:
        return {
            "allowed": True,
            "remaining": max(0, limit_val - current - amount),
            "limit": limit_val,
            "used": current + amount,
            "overage": overage,
        }
