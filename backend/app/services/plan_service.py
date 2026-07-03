"""
PlanService — domain logic for plan enforcement, subscriptions, addons.

Coordinates between:
  - SubscriptionPlan (static definitions)
  - OrganizationSubscription (per-org state)
  - UsageTracker (per-cycle counters)
  - Redis (rate-limit windows)

All endpoints that consume plan-limited resources go through this service.
"""
import logging
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.models import (
    Organization,
    SubscriptionPlan,
    OrganizationSubscription,
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
            .filter(SubscriptionPlan.name == "inicial")
            .first()
        )
        if not default_plan:
            logger.error("No 'inicial' plan found in DB — run seed_plans first")
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
        """Check if org can emit N e-CF documents — deducts from e_cf_balance."""
        org = self.db.query(Organization).filter(Organization.id == org_id).first()
        if not org:
            raise PlanLimitExceeded("org_not_found", {})

        if org.e_cf_balance < amount:
            raise PlanLimitExceeded(
                "insufficient_ecf_balance",
                {"balance": org.e_cf_balance, "requested": amount},
            )

        # Deduct from balance
        org.e_cf_balance -= amount
        self.db.flush()

        return {
            "allowed": True,
            "remaining": org.e_cf_balance,
            "deducted": amount,
        }

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
        elif addon_type == "entity_slot":
            sub.addon_entity_slots = (sub.addon_entity_slots or 0) + quantity
        elif addon_type == "user_slot":
            sub.addon_user_slots = (sub.addon_user_slots or 0) + quantity
        elif addon_type == "entity":
            pass  # DEPRECATED — ignored
        elif addon_type == "billing_entity":
            pass  # DEPRECATED — ignored
        else:
            raise ValueError(f"Unknown addon type: {addon_type}")

        self.db.commit()
        self.db.refresh(sub)
        return sub

    # ── Direct addon purchase (post-pay, charged to monthly statement) ─

    def purchase_addon_direct(self, org_id, addon_type: str, quantity: int = 1, label: str = "") -> dict:
        """Purchase addon blocks directly (post-pay, added to monthly statement).

        Activates the addon immediately and creates a MonthlyCharge.
        The org pays at end of cycle via the statement.
        """
        from app.models import MonthlyCharge

        if self.has_unpaid_previous_cycle(org_id):
            raise ValueError("Tienes pagos pendientes del per\u00edodo anterior. Paga tu estado de cuenta primero.")

        sub, plan = self.get_plan_for_org(org_id)
        if not sub or not plan:
            raise ValueError("No active subscription")

        price_map = {
            "ai": ("addon_ai_block_price_cents", f"{quantity} bloque{'s' if quantity > 1 else ''} IA"),
            "storage": ("addon_storage_block_price_cents", f"{quantity} bloque{'s' if quantity > 1 else ''} de almacenamiento"),
            "entity_slot": ("entity_slot_price_cents", f"{quantity} espacio{'s' if quantity > 1 else ''} de entidad adicional"),
            "user_slot": ("user_slot_price_cents", f"{quantity} espacio{'s' if quantity > 1 else ''} de usuario adicional"),
        }

        if addon_type not in price_map:
            raise ValueError(f"Addon type '{addon_type}' cannot be purchased directly")

        price_field, default_label = price_map[addon_type]
        unit_price_cents = getattr(plan, price_field, 0)
        if not unit_price_cents:
            raise ValueError(f"Addon type '{addon_type}' has no price configured")
        total_price_cents = unit_price_cents * quantity

        self.purchase_addon(org_id, addon_type, quantity)

        cycle = _current_cycle()
        charge = MonthlyCharge(
            organization_id=org_id,
            cycle=cycle,
            charge_type=addon_type,
            quantity=quantity,
            unit_price_cents=unit_price_cents,
            total_price_cents=total_price_cents,
            label=label or default_label,
            paid=False,
        )
        self.db.add(charge)
        self.db.commit()

        return {"charge_id": str(charge.id), "total_price_cents": total_price_cents}

    def has_unpaid_previous_cycle(self, org_id) -> bool:
        """Check if the previous billing cycle has unpaid charges."""
        from app.models import MonthlyCharge

        cycle = _current_cycle()
        year = cycle // 100
        month = cycle % 100
        if month == 1:
            prev_cycle = (year - 1) * 100 + 12
        else:
            prev_cycle = year * 100 + (month - 1)

        unpaid = (
            self.db.query(MonthlyCharge)
            .filter(
                MonthlyCharge.organization_id == org_id,
                MonthlyCharge.cycle == prev_cycle,
                MonthlyCharge.paid == False,  # noqa: E712
            )
            .count()
        )
        return unpaid > 0

    def get_statement(self, org_id, cycle: int = None) -> dict:
        """Get the monthly statement for a given cycle."""
        from app.models import MonthlyCharge

        if cycle is None:
            cycle = _current_cycle()

        sub, plan = self.get_plan_for_org(org_id)
        if not plan:
            return {"error": "No active plan"}

        charges = (
            self.db.query(MonthlyCharge)
            .filter(
                MonthlyCharge.organization_id == org_id,
                MonthlyCharge.cycle == cycle,
            )
            .all()
        )

        recurring_charges = []
        if sub:
            if sub.addon_entity_slots and plan.entity_slot_price_cents:
                recurring_charges.append({
                    "type": "entity_slot_recurring",
                    "label": f"{sub.addon_entity_slots} espacio{'s' if sub.addon_entity_slots > 1 else ''} de entidad",
                    "unit_price_cents": plan.entity_slot_price_cents,
                    "quantity": sub.addon_entity_slots,
                    "total_price_cents": plan.entity_slot_price_cents * sub.addon_entity_slots,
                })
            if sub.addon_user_slots and plan.user_slot_price_cents:
                recurring_charges.append({
                    "type": "user_slot_recurring",
                    "label": f"{sub.addon_user_slots} espacio{'s' if sub.addon_user_slots > 1 else ''} de usuario",
                    "unit_price_cents": plan.user_slot_price_cents,
                    "quantity": sub.addon_user_slots,
                    "total_price_cents": plan.user_slot_price_cents * sub.addon_user_slots,
                })

        charge_list = [
            {
                "id": str(c.id),
                "charge_type": c.charge_type,
                "label": c.label,
                "quantity": c.quantity,
                "unit_price_cents": c.unit_price_cents,
                "total_price_cents": c.total_price_cents,
                "paid": c.paid,
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "is_recurring": False,
            }
            for c in charges
        ] + [
            {**r, "id": None, "paid": False, "created_at": None, "is_recurring": True}
            for r in recurring_charges
        ]

        total_cents = sum(c["total_price_cents"] for c in charge_list)

        return {
            "cycle": cycle,
            "plan_name": plan.display_name,
            "plan_price_cents": plan.price_monthly_cents if sub and sub.status == "active" else 0,
            "charges": charge_list,
            "total_cents": total_cents,
        }

    def pay_statement(self, org_id, cycle: int, payment_proof_id: str) -> dict:
        """Mark all charges for a cycle as paid."""
        from app.models import MonthlyCharge

        charges = (
            self.db.query(MonthlyCharge)
            .filter(
                MonthlyCharge.organization_id == org_id,
                MonthlyCharge.cycle == cycle,
                MonthlyCharge.paid == False,  # noqa: E712
            )
            .all()
        )

        now = datetime.utcnow()
        for c in charges:
            c.paid = True
            c.paid_at = now
            c.payment_proof_id = payment_proof_id

        self.db.commit()
        return {"message": f"Estado de cuenta del ciclo {cycle} pagado", "count": len(charges)}

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
