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
from datetime import date, datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.models import (
    Organization,
    SubscriptionPlan,
    OrganizationSubscription,
    UsageRecord,
    UsageAlert,
    UserOrganization,
)
from app.models.user_subscription import UserSubscription
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

        Returns (subscription, plan) or (None, None) if no subscription.
        Org-level subscriptions are only created when the org purchases
        prepaid e-CF blocks or sets up billing. Hub subscription is
        per-user via UserSubscription.
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
            .order_by(OrganizationSubscription.created_at.desc())
            .first()
        )

        if sub:
            return sub, sub.plan

        return None, None

    def effective_limits(self, org_id) -> dict:
        """Return the effective resource limits for an org."""
        sub, plan = self.get_plan_for_org(org_id)
        if not sub or not plan:
            return {}
        return sub.effective_limits()

    def get_usage_summary(self, org_id) -> dict:
        """Return full usage + plan info for an org.

        Returns empty/Nones for plan/subscription when none exists —
        orgs may be on the free Factura tier without any active plan.
        Callers should handle None plan as "no plan" (free tier).
        """
        sub, plan = self.get_plan_for_org(org_id)
        if not plan:
            return {"plan": None, "subscription": None, "usage": None, "trial_remaining_days": 0}

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

    def get_user_subscription(self, user_id) -> tuple[Optional['UserSubscription'], Optional['SubscriptionPlan']]:
        """Get active subscription + plan for a user."""
        sub = (
            self.db.query(UserSubscription)
            .filter(
                UserSubscription.user_id == user_id,
                UserSubscription.status.in_(["active", "trialing"]),
            )
            .order_by(UserSubscription.created_at.desc())
            .first()
        )
        if sub:
            return sub, sub.plan
        return None, None

    def get_user_entity_limits(self, user_id) -> dict:
        """Return max entities for a user based on their plan + entity_slot addons."""
        sub, plan = self.get_user_subscription(user_id)
        if not plan:
            return {"max_entities": 0, "current_entity_count": 0, "allowed": False}

        max_entities = plan.max_entities + (sub.addon_entity_slots or 0)

        from app.models.organization import Organization
        current_count = (
            self.db.query(UserOrganization)
            .join(Organization)
            .filter(
                UserOrganization.user_id == user_id,
                Organization.is_active.is_(True),
                Organization.is_deleted.is_(False)
            )
            .count()
        )

        return {
            "max_entities": max_entities,
            "current_entity_count": current_count,
            "remaining": max_entities - current_count,
            "allowed": current_count < max_entities,
        }

    def check_entity_limit(self, user_id) -> None:
        """Raise PlanLimitExceeded if user has reached their entity limit."""
        limits = self.get_user_entity_limits(user_id)
        if not limits["allowed"]:
            raise PlanLimitExceeded(
                "max_entities_reached",
                {
                    "max_entities": limits["max_entities"],
                    "current_count": limits["current_entity_count"],
                    "remaining": limits["remaining"],
                },
            )

    def purchase_addon(self, org_id, addon_type: str, quantity: int = 1, user_id: str | None = None) -> OrganizationSubscription:
        """Purchase addon blocks for the current cycle.

        entity_slot targets UserSubscription (user-level capacity).
        Other addons target OrganizationSubscription (org-level).
        """
        sub, plan = self.get_plan_for_org(org_id)
        if not sub or not plan:
            raise ValueError("No active subscription")

        if addon_type == "entity_slot":
            if not user_id:
                raise ValueError("user_id required for entity_slot addon")
            user_sub = (
                self.db.query(UserSubscription)
                .filter(
                    UserSubscription.user_id == user_id,
                    UserSubscription.status.in_(["active", "trialing"]),
                )
                .order_by(UserSubscription.created_at.desc())
                .first()
            )
            if not user_sub:
                raise ValueError("No active user subscription")
            user_sub.addon_entity_slots = (user_sub.addon_entity_slots or 0) + quantity
            self.db.commit()
            self.db.refresh(user_sub)
            return sub

        if addon_type == "ecf":
            sub.addon_ecf_blocks = (sub.addon_ecf_blocks or 0) + quantity
        elif addon_type == "ai":
            sub.addon_ai_blocks = (sub.addon_ai_blocks or 0) + quantity
        elif addon_type == "storage":
            sub.addon_storage_blocks = (sub.addon_storage_blocks or 0) + quantity
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

    def purchase_addon_direct(self, org_id, addon_type: str, quantity: int = 1, label: str = "", user_id: str | None = None) -> dict:
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
        # Calculate proration for slot-based addons
        from math import ceil
        from app.utils.dates import utc_now
        
        final_unit_price_cents = unit_price_cents
        proration_label = ""
        
        if addon_type in ("entity_slot", "user_slot", "ai", "storage") and sub.billing_cycle_start and sub.billing_cycle_end:
            now = utc_now()
            cycle_end = sub.billing_cycle_end
            cycle_start = sub.billing_cycle_start
            if now < cycle_end:
                total_cycle_days = max((cycle_end - cycle_start).days, 1)
                days_remaining = max((cycle_end - now).days, 1)
                final_unit_price_cents = ceil(unit_price_cents * days_remaining / total_cycle_days)
                proration_label = f" (proporcional por {days_remaining} días restantes)"
                
        total_price_cents = final_unit_price_cents * quantity

        self.purchase_addon(org_id, addon_type, quantity, user_id=user_id)

        cycle = _current_cycle()
        charge = MonthlyCharge(
            organization_id=org_id,
            cycle=cycle,
            charge_type=addon_type,
            quantity=quantity,
            unit_price_cents=final_unit_price_cents,
            total_price_cents=total_price_cents,
            label=(label or default_label) + proration_label,
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

    def get_statement(self, org_id, cycle: int = None, user_id: str = None) -> dict:
        """Get the monthly statement for a given cycle.

        The statement is always user-scoped: if the currently active org has
        no plan, we fall back to the user's primary org (the one with an active
        OrganizationSubscription), so the statement is visible regardless of
        which org is selected in the session.
        """
        from app.models import MonthlyCharge
        from app.models.user_subscription import UserSubscription
        from app.models.user_organization import UserOrganization
        from datetime import date as _date

        if cycle is None:
            cycle = _current_cycle()

        sub, plan = self.get_plan_for_org(org_id)

        # If the active org has no plan, search the user's other orgs
        billing_org_id = org_id
        if not plan and user_id:
            today = _date.today()
            user_org_ids = (
                self.db.query(UserOrganization.organization_id)
                .filter(UserOrganization.user_id == user_id)
                .subquery()
            )
            fallback_sub = (
                self.db.query(OrganizationSubscription)
                .filter(
                    OrganizationSubscription.organization_id.in_(user_org_ids),
                    OrganizationSubscription.status.in_(["active", "trialing"]),
                    OrganizationSubscription.billing_cycle_start <= today,
                    OrganizationSubscription.billing_cycle_end >= today,
                )
                .order_by(OrganizationSubscription.created_at.desc())
                .first()
            )
            if fallback_sub:
                sub = fallback_sub
                plan = fallback_sub.plan
                billing_org_id = fallback_sub.organization_id

        # User subscription for account-level recurring info
        user_sub = None
        user_plan = None
        if user_id:
            user_sub = (
                self.db.query(UserSubscription)
                .filter(UserSubscription.user_id == user_id)
                .order_by(UserSubscription.created_at.desc())
                .first()
            )
            user_plan = user_sub.plan if user_sub else None

        if not plan:
            return {"error": "No active plan"}

        charges = (
            self.db.query(MonthlyCharge)
            .filter(
                MonthlyCharge.organization_id == billing_org_id,
                MonthlyCharge.cycle == cycle,
            )
            .all()
        )

        recurring_charges = []
        if sub:
            from sqlalchemy import func
            
            # Count paid slots for the current cycle to avoid double charging
            paid_entity_slots = (
                self.db.query(func.sum(MonthlyCharge.quantity))
                .filter(
                    MonthlyCharge.organization_id == billing_org_id,
                    MonthlyCharge.cycle == cycle,
                    MonthlyCharge.charge_type == "entity_slot",
                    MonthlyCharge.paid.is_(True),
                )
                .scalar()
            ) or 0

            paid_user_slots = (
                self.db.query(func.sum(MonthlyCharge.quantity))
                .filter(
                    MonthlyCharge.organization_id == billing_org_id,
                    MonthlyCharge.cycle == cycle,
                    MonthlyCharge.charge_type == "user_slot",
                    MonthlyCharge.paid.is_(True),
                )
                .scalar()
            ) or 0

            paid_ai_blocks = (
                self.db.query(func.sum(MonthlyCharge.quantity))
                .filter(
                    MonthlyCharge.organization_id == billing_org_id,
                    MonthlyCharge.cycle == cycle,
                    MonthlyCharge.charge_type == "ai",
                    MonthlyCharge.paid.is_(True),
                )
                .scalar()
            ) or 0

            paid_storage_blocks = (
                self.db.query(func.sum(MonthlyCharge.quantity))
                .filter(
                    MonthlyCharge.organization_id == billing_org_id,
                    MonthlyCharge.cycle == cycle,
                    MonthlyCharge.charge_type == "storage",
                    MonthlyCharge.paid.is_(True),
                )
                .scalar()
            ) or 0

            unpaid_entity_slots = max(sub.addon_entity_slots - paid_entity_slots, 0)
            unpaid_user_slots = max(sub.addon_user_slots - paid_user_slots, 0)
            unpaid_ai_blocks = max(sub.addon_ai_blocks - paid_ai_blocks, 0)
            unpaid_storage_blocks = max(sub.addon_storage_blocks - paid_storage_blocks, 0)

            if unpaid_entity_slots > 0 and plan.entity_slot_price_cents:
                recurring_charges.append({
                    "type": "entity_slot_recurring",
                    "label": f"{unpaid_entity_slots} espacio{'s' if unpaid_entity_slots > 1 else ''} de entidad",
                    "unit_price_cents": plan.entity_slot_price_cents,
                    "quantity": unpaid_entity_slots,
                    "total_price_cents": plan.entity_slot_price_cents * unpaid_entity_slots,
                })
            if unpaid_user_slots > 0 and plan.user_slot_price_cents:
                recurring_charges.append({
                    "type": "user_slot_recurring",
                    "label": f"{unpaid_user_slots} espacio{'s' if unpaid_user_slots > 1 else ''} de usuario",
                    "unit_price_cents": plan.user_slot_price_cents,
                    "quantity": unpaid_user_slots,
                    "total_price_cents": plan.user_slot_price_cents * unpaid_user_slots,
                })
            if unpaid_ai_blocks > 0 and plan.addon_ai_block_price_cents:
                recurring_charges.append({
                    "type": "ai_block_recurring",
                    "label": f"{unpaid_ai_blocks} bloque{'s' if unpaid_ai_blocks > 1 else ''} de IA",
                    "unit_price_cents": plan.addon_ai_block_price_cents,
                    "quantity": unpaid_ai_blocks,
                    "total_price_cents": plan.addon_ai_block_price_cents * unpaid_ai_blocks,
                })
            if unpaid_storage_blocks > 0 and plan.addon_storage_block_price_cents:
                recurring_charges.append({
                    "type": "storage_block_recurring",
                    "label": f"{unpaid_storage_blocks} bloque{'s' if unpaid_storage_blocks > 1 else ''} de almacenamiento",
                    "unit_price_cents": plan.addon_storage_block_price_cents,
                    "quantity": unpaid_storage_blocks,
                    "total_price_cents": plan.addon_storage_block_price_cents * unpaid_storage_blocks,
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
                "paid_at": c.paid_at.isoformat() if getattr(c, "paid_at", None) else None,
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "is_recurring": False,
            }
            for c in charges
        ] + [
            {**r, "id": None, "paid": False, "paid_at": None, "created_at": None, "is_recurring": True}
            for r in recurring_charges
        ]

        # total_cents = only unpaid charges (what the client still owes)
        # paid_total_cents = what has already been paid this cycle
        total_cents = sum(c["total_price_cents"] for c in charge_list if not c["paid"])
        paid_total_cents = sum(c["total_price_cents"] for c in charge_list if c["paid"])

        # Build recurring summary for upcoming cycle
        next_billing = None
        recurring_source = user_sub or sub
        recurring_plan = user_plan or plan
        if recurring_source and recurring_source.billing_cycle_end:
            next_billing = recurring_source.billing_cycle_end.isoformat()

        recurring_items = []
        recurring_total_cents = 0

        # Plan subscription
        if recurring_source and getattr(recurring_source, "status", None) in ("active", "trialing"):
            plan_price = recurring_plan.price_monthly_cents if recurring_plan else 0
            recurring_items.append({
                "type": "plan",
                "label": f"Plan {recurring_plan.display_name if recurring_plan else plan.display_name}",
                "price_cents": plan_price,
                "quantity": 1,
            })
            recurring_total_cents += plan_price

        # Recurring addons — entity_slot is per-user, others are per-org
        # Recurring addons — entity_slot is per-user, others are per-org
        entity_slots = user_sub.addon_entity_slots if user_sub else (sub.addon_entity_slots if sub else 0)
        pending_cancel_entity_slots = user_sub.pending_cancel_entity_slots if user_sub else (sub.pending_cancel_entity_slots if sub else 0)
        net_entity_slots = max(entity_slots - pending_cancel_entity_slots, 0)
        if entity_slots > 0 and recurring_plan and recurring_plan.entity_slot_price_cents:
            recurring_items.append({
                "type": "entity_slot",
                "label": "Espacio de entidad adicional",
                "price_cents": recurring_plan.entity_slot_price_cents,
                "quantity": net_entity_slots,
                "original_quantity": entity_slots,
                "pending_cancel": pending_cancel_entity_slots,
            })
            recurring_total_cents += recurring_plan.entity_slot_price_cents * net_entity_slots

        # Org-level addons (shown when same as billing org)
        if sub and sub.organization_id == billing_org_id:
            addon_map = {
                "user_slot": (
                    sub.addon_user_slots,
                    sub.pending_cancel_user_slots,
                    plan.user_slot_price_cents if plan else 0,
                    "Espacio de usuario adicional"
                ),
                "ai": (
                    sub.addon_ai_blocks,
                    sub.pending_cancel_ai_blocks,
                    plan.addon_ai_block_price_cents if plan else 0,
                    "Bloque de consultas IA"
                ),
                "storage": (
                    sub.addon_storage_blocks,
                    sub.pending_cancel_storage_blocks,
                    plan.addon_storage_block_price_cents if plan else 0,
                    "Bloque de almacenamiento"
                ),
            }
            for addon_type, (count, pending_cancel, price_cents, label) in addon_map.items():
                net_count = max(count - pending_cancel, 0)
                if count > 0 and price_cents > 0:
                    recurring_items.append({
                        "type": addon_type,
                        "label": label,
                        "price_cents": price_cents,
                        "quantity": net_count,
                        "original_quantity": count,
                        "pending_cancel": pending_cancel,
                    })
                    recurring_total_cents += price_cents * net_count

        # Build addon_detail: for each addon type, show which orgs/users it applies to
        addon_detail: dict = {}
        if user_id:
            from app.models.user_organization import UserOrganization
            from app.models.organization import Organization

            user_org_rows = (
                self.db.query(UserOrganization, Organization)
                .join(Organization, Organization.id == UserOrganization.organization_id)
                .filter(UserOrganization.user_id == user_id)
                .all()
            )

            # entity_slot: per org — how many extra entities allowed and how many used
            entity_slot_orgs = []
            user_slot_orgs = []

            for uo, org in user_org_rows:
                org_sub = (
                    self.db.query(OrganizationSubscription)
                    .filter(
                        OrganizationSubscription.organization_id == org.id,
                        OrganizationSubscription.status.in_(["active", "trialing"]),
                    )
                    .order_by(OrganizationSubscription.created_at.desc())
                    .first()
                )
                if not org_sub:
                    continue
                if org_sub.addon_entity_slots > 0:
                    entity_slot_orgs.append({
                        "org_id": str(org.id),
                        "org_name": org.name,
                        "tax_id": org.tax_id,
                        "role": uo.role,
                        "slots": org_sub.addon_entity_slots,
                    })
                if org_sub.addon_user_slots > 0:
                    user_slot_orgs.append({
                        "org_id": str(org.id),
                        "org_name": org.name,
                        "tax_id": org.tax_id,
                        "role": uo.role,
                        "slots": org_sub.addon_user_slots,
                    })

            # entity_slot from UserSubscription (user-level capacity)
            user_entity_slots = user_sub.addon_entity_slots if user_sub else 0

            # ai/storage — org-level on billing_org_id sub
            ai_blocks = sub.addon_ai_blocks if sub else 0
            storage_blocks = sub.addon_storage_blocks if sub else 0

            addon_detail = {
                "entity_slot": {
                    "total": sum(o["slots"] for o in entity_slot_orgs) + user_entity_slots,
                    "user_level_slots": user_entity_slots,
                    "orgs": entity_slot_orgs,
                    "pending_cancel": user_sub.pending_cancel_entity_slots if user_sub else 0,
                },
                "user_slot": {
                    "total": sum(o["slots"] for o in user_slot_orgs),
                    "orgs": user_slot_orgs,
                    "pending_cancel": sub.pending_cancel_user_slots if sub else 0,
                },
                "ai": {
                    "total_blocks": ai_blocks,
                    "org_id": str(billing_org_id) if billing_org_id else None,
                    "pending_cancel": sub.pending_cancel_ai_blocks if sub else 0,
                },
                "storage": {
                    "total_blocks": storage_blocks,
                    "org_id": str(billing_org_id) if billing_org_id else None,
                    "pending_cancel": sub.pending_cancel_storage_blocks if sub else 0,
                },
            }

        return {
            "cycle": cycle,
            "plan_name": plan.display_name,
            "plan_price_cents": plan.price_monthly_cents if sub and sub.status == "active" else 0,
            "next_billing_date": next_billing,
            "billing_org_id": str(billing_org_id),
            "recurring": {
                "items": recurring_items,
                "total_cents": recurring_total_cents,
            },
            "charges": charge_list,
            "total_cents": total_cents,
            "paid_total_cents": paid_total_cents,
            "addon_detail": addon_detail,
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

    def cancel_addon(
        self,
        org_id,
        addon_type: str,
        quantity: int = 1,
        user_id: str | None = None,
    ) -> dict:
        """Cancel (reduce) active addon slots, effective next billing cycle.

        Increments the pending_cancel counter on the active OrganizationSubscription (or
        UserSubscription for entity_slot). The resource remains available
        for the remainder of the current cycle.
        """
        if addon_type not in ("entity_slot", "user_slot", "ai", "storage"):
            raise ValueError(f"Addon type '{addon_type}' cannot be cancelled")

        if quantity < 1:
            raise ValueError("La cantidad a cancelar debe ser al menos 1")

        sub, plan = self.get_plan_for_org(org_id)

        if addon_type == "entity_slot":
            if not user_id:
                raise ValueError("Se requiere user_id para cancelar entity_slot")
            from app.models.user_subscription import UserSubscription
            user_sub = (
                self.db.query(UserSubscription)
                .filter(UserSubscription.user_id == user_id)
                .order_by(UserSubscription.created_at.desc())
                .first()
            )
            if not user_sub:
                raise ValueError("No hay suscripción de usuario activa")
            current_active = user_sub.addon_entity_slots or 0
            current_pending = user_sub.pending_cancel_entity_slots or 0
            if current_pending + quantity > current_active:
                raise ValueError(
                    f"No puedes cancelar {quantity} empresa(s) — ya tienes {current_pending} marcadas para cancelación de un total de {current_active}"
                )
            user_sub.pending_cancel_entity_slots = current_pending + quantity
            self.db.commit()
            return {
                "addon_type": addon_type,
                "cancelled": quantity,
                "pending_cancel": user_sub.pending_cancel_entity_slots,
                "remaining_active": current_active,
                "remaining": current_active - (current_pending + quantity),
            }

        # For org-level addons (user_slot, ai, storage)
        if not sub:
            raise ValueError("No hay suscripción organizacional activa")

        field_map = {
            "user_slot": "pending_cancel_user_slots",
            "ai": "pending_cancel_ai_blocks",
            "storage": "pending_cancel_storage_blocks",
        }
        active_field_map = {
            "user_slot": "addon_user_slots",
            "ai": "addon_ai_blocks",
            "storage": "addon_storage_blocks",
        }
        field = field_map[addon_type]
        active_field = active_field_map[addon_type]
        current_active = getattr(sub, active_field) or 0
        current_pending = getattr(sub, field) or 0

        if current_pending + quantity > current_active:
            label_map = {
                "user_slot": "usuario(s) adicional(es)",
                "ai": "bloque(s) de IA",
                "storage": "bloque(s) de almacenamiento",
            }
            raise ValueError(
                f"No puedes cancelar {quantity} {label_map[addon_type]} — ya tienes {current_pending} marcados para cancelación de un total de {current_active}"
            )
        setattr(sub, field, current_pending + quantity)
        self.db.commit()
        return {
            "addon_type": addon_type,
            "cancelled": quantity,
            "pending_cancel": getattr(sub, field),
            "remaining_active": current_active,
            "remaining": current_active - (current_pending + quantity),
        }

    def reactivate_addon(
        self,
        org_id,
        addon_type: str,
        quantity: int = 1,
        user_id: str | None = None,
    ) -> dict:
        """Undo a pending cancellation, restoring slot counts for the next cycle."""
        if addon_type not in ("entity_slot", "user_slot", "ai", "storage"):
            raise ValueError(f"Addon type '{addon_type}' cannot be reactivated")

        if quantity < 1:
            raise ValueError("La cantidad a reactivar debe ser al menos 1")

        sub, plan = self.get_plan_for_org(org_id)

        if addon_type == "entity_slot":
            if not user_id:
                raise ValueError("Se requiere user_id para reactivar entity_slot")
            from app.models.user_subscription import UserSubscription
            user_sub = (
                self.db.query(UserSubscription)
                .filter(UserSubscription.user_id == user_id)
                .order_by(UserSubscription.created_at.desc())
                .first()
            )
            if not user_sub:
                raise ValueError("No hay suscripción de usuario activa")
            current_pending = user_sub.pending_cancel_entity_slots or 0
            user_sub.pending_cancel_entity_slots = max(0, current_pending - quantity)
            self.db.commit()
            return {
                "addon_type": addon_type,
                "reactivated": quantity,
                "pending_cancel": user_sub.pending_cancel_entity_slots,
            }

        # For org-level addons (user_slot, ai, storage)
        if not sub:
            raise ValueError("No hay suscripción organizacional activa")

        field_map = {
            "user_slot": "pending_cancel_user_slots",
            "ai": "pending_cancel_ai_blocks",
            "storage": "pending_cancel_storage_blocks",
        }
        field = field_map[addon_type]
        current_pending = getattr(sub, field) or 0
        setattr(sub, field, max(0, current_pending - quantity))
        self.db.commit()
        return {
            "addon_type": addon_type,
            "reactivated": quantity,
            "pending_cancel": getattr(sub, field),
        }


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
