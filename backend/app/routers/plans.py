"""
Plans & Subscription router — manage plans, usage, and subscription lifecycle.
"""
import logging
from datetime import date
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from app.dependencies.tenant import TenantContext, require_tenant
from app.models import SubscriptionPlan, OrganizationSubscription
from app.services.plan_service import PlanService, PlanLimitExceeded
from app.services.usage_tracker import UsageTracker

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/plans", tags=["plans"])


# ── Schemas ─────────────────────────────────────────────────────────

from pydantic import BaseModel


class PlanSummary(BaseModel):
    id: str
    name: str
    display_name: str
    description: str | None
    price_monthly: float
    limits: dict
    features: dict
    is_enterprise: bool
    sort_order: int
    soft_limit_enabled: bool


class UsageSummary(BaseModel):
    cycle: int
    ecf: dict
    ai_queries: dict
    ocr_docs: dict
    storage_mb: dict
    api_calls: dict


class SubscriptionSummary(BaseModel):
    id: str
    organization_id: str
    plan_id: str
    plan_name: str | None
    status: str
    trial_remaining_days: int
    billing_cycle_start: str | None
    billing_cycle_end: str | None
    limits: dict
    addons: dict
    auto_renew_addons: bool


class FullUsageResponse(BaseModel):
    plan: PlanSummary | None
    subscription: SubscriptionSummary | None
    usage: UsageSummary | None
    trial_remaining_days: int


class ChangePlanRequest(BaseModel):
    plan_name: str


class AddonPurchaseRequest(BaseModel):
    addon_type: str  # ecf | ai | storage | entity
    quantity: int = 1


# ── Endpoints ───────────────────────────────────────────────────────

@router.get("/", response_model=List[PlanSummary])
async def list_public_plans(ctx: TenantContext = Depends(require_tenant)):
    """List all public plans for the pricing page."""
    plans = (
        ctx.db.query(SubscriptionPlan)
        .filter(SubscriptionPlan.is_public.is_(True), SubscriptionPlan.is_active.is_(True))
        .order_by(SubscriptionPlan.sort_order)
        .all()
    )
    result = []
    for p in plans:
        d = p.to_dict()
        result.append(PlanSummary(
            id=d["id"],
            name=d["name"],
            display_name=d["display_name"],
            description=d["description"],
            price_monthly=d["price_monthly"],
            limits=d["limits"],
            features=d["features"],
            is_enterprise=d["is_enterprise"],
            sort_order=d["sort_order"],
            soft_limit_enabled=d["soft_limit_enabled"],
        ))
    return result


@router.get("/my", response_model=FullUsageResponse)
async def my_plan_and_usage(ctx: TenantContext = Depends(require_tenant)):
    """Get current org's plan, subscription, and usage stats."""
    svc = PlanService(ctx.db)
    summary = svc.get_usage_summary(ctx.org_id)
    if "error" in summary:
        raise HTTPException(status_code=404, detail=summary["error"])

    plan_data = summary.get("plan")
    sub_data = summary.get("subscription")
    usage_data = summary.get("usage")

    return FullUsageResponse(
        plan=PlanSummary(
            id=plan_data["id"],
            name=plan_data["name"],
            display_name=plan_data["display_name"],
            description=plan_data.get("description"),
            price_monthly=plan_data.get("price_monthly", 0),
            limits=plan_data["limits"],
            features=plan_data["features"],
            is_enterprise=plan_data.get("is_enterprise", False),
            sort_order=plan_data.get("sort_order", 0),
            soft_limit_enabled=plan_data.get("soft_limit_enabled", True),
        ) if plan_data else None,
        subscription=SubscriptionSummary(
            id=sub_data["id"],
            organization_id=sub_data["organization_id"],
            plan_id=sub_data["plan_id"],
            plan_name=sub_data.get("plan_name"),
            status=sub_data["status"],
            trial_remaining_days=summary.get("trial_remaining_days", 0),
            billing_cycle_start=sub_data.get("billing_cycle_start"),
            billing_cycle_end=sub_data.get("billing_cycle_end"),
            limits=sub_data["limits"],
            addons=sub_data["addons"],
            auto_renew_addons=sub_data.get("auto_renew_addons", False),
        ) if sub_data else None,
        usage=UsageSummary(
            cycle=usage_data["cycle"],
            ecf=usage_data["ecf"],
            ai_queries=usage_data["ai_queries"],
            ocr_docs=usage_data["ocr_docs"],
            storage_mb=usage_data["storage_mb"],
            api_calls=usage_data["api_calls"],
        ) if usage_data else None,
        trial_remaining_days=summary.get("trial_remaining_days", 0),
    )


@router.post("/change")
async def change_plan(payload: ChangePlanRequest, ctx: TenantContext = Depends(require_tenant)):
    """Upgrade or downgrade the org's subscription plan."""
    svc = PlanService(ctx.db)
    try:
        sub = svc.change_plan(ctx.org_id, payload.plan_name)
        return {"message": f"Plan cambiado a {sub.plan.display_name}", "subscription_id": str(sub.id)}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/cancel")
async def cancel_subscription(ctx: TenantContext = Depends(require_tenant)):
    """Cancel subscription at end of current billing cycle."""
    svc = PlanService(ctx.db)
    svc.cancel_subscription(ctx.org_id)
    return {"message": "Suscripción cancelada. Seguirás activo hasta el fin del ciclo de facturación."}


@router.post("/addon")
async def purchase_addon(payload: AddonPurchaseRequest, ctx: TenantContext = Depends(require_tenant)):
    """Purchase addon blocks for current cycle."""
    svc = PlanService(ctx.db)
    try:
        sub = svc.purchase_addon(ctx.org_id, payload.addon_type, payload.quantity)
        return {"message": f"Add-on {payload.addon_type} adquirido", "subscription_id": str(sub.id)}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/auto-renew-addons")
async def toggle_auto_renew(enabled: bool = Query(...), ctx: TenantContext = Depends(require_tenant)):
    """Toggle automatic addon purchase when hitting limits."""
    sub, _ = PlanService(ctx.db).get_plan_for_org(ctx.org_id)
    if not sub:
        raise HTTPException(status_code=404, detail="No active subscription")
    sub.auto_renew_addons = enabled
    ctx.db.commit()
    return {"auto_renew_addons": enabled}
