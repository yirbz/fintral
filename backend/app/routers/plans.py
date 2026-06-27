"""
Plans & Subscription router — manage plans, usage, and subscription lifecycle.
"""
import json
import logging
import os
import tempfile
import uuid
from datetime import date, datetime
from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy import case, func

from app.dependencies.tenant import TenantContext, require_tenant
from app.models import Invoice, PendingUpload, SubscriptionPlan, PaymentProof
from app.services.plan_service import PlanService
from app.services.usage_tracker import _current_cycle
from app.services.exchange_rate_service import get_bpd_usd_rate

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/plans", tags=["plans"])


# ── Schemas ─────────────────────────────────────────────────────────

# Discount tiers for multi-month commitments
DISCOUNT_TIERS = {1: 0.0, 3: 0.03, 6: 0.05, 12: 0.10}


class PlanSummary(BaseModel):
    id: str
    name: str
    display_name: str
    description: str | None
    price_monthly: float
    price_usd: float | None = None
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


class DailyUsageBreakdown(BaseModel):
    date: str
    ecf_count: int
    ai_query_count: int
    ocr_doc_count: int

class StorageBreakdownItem(BaseModel):
    file_type: str
    count: int
    total_bytes: int

class StorageItem(BaseModel):
    filename: str
    file_type: str
    file_size: int
    created_at: datetime

class UsageDailyResponse(BaseModel):
    cycle: int
    daily: list[DailyUsageBreakdown]
    storage_by_type: list[StorageBreakdownItem]
    storage_items: list[StorageItem]
    total_storage_bytes: int
    total_storage_mb: float


class ChangePlanRequest(BaseModel):
    plan_name: str


class AddonPurchaseRequest(BaseModel):
    addon_type: str  # ecf_blocks | ai | storage | entity_slot | user_slot
    quantity: int = 1


# ── Endpoints ───────────────────────────────────────────────────────

@router.get("", response_model=List[PlanSummary], include_in_schema=False)
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
            price_usd=d.get("price_usd"),
            limits=d["limits"],
            features=d["features"],
            is_enterprise=d["is_enterprise"],
            sort_order=d["sort_order"],
            soft_limit_enabled=d["soft_limit_enabled"],
        ))
    return result


@router.get("/exchange-rate")
async def get_current_exchange_rate():
    """Retrieve the current USD/DOP exchange rate."""
    rate = await get_bpd_usd_rate()
    return {"rate": rate, "currency": "DOP"}


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
            price_usd=plan_data.get("price_usd"),
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


@router.get("/usage-daily", response_model=UsageDailyResponse)
async def usage_daily_breakdown(ctx: TenantContext = Depends(require_tenant)):
    """Daily usage breakdown for the current billing cycle.

    Returns per-day counts of ECF, AI queries, and OCR docs from the
    invoices table, plus a storage breakdown by file type from pending
    uploads.
    """
    cycle = _current_cycle()
    year = cycle // 100
    month = cycle % 100
    cycle_start = date(year, month, 1)
    if month == 12:
        cycle_end = date(year + 1, 1, 1)
    else:
        cycle_end = date(year, month + 1, 1)

    # ── Daily invoice counts ──────────────────────────────────────
    rows = (
        ctx.db.query(
            func.date(Invoice.created_at).label("day"),
            func.sum(
                case((Invoice.is_electronic.is_(True), 1), else_=0)
            ).label("ecf_count"),
            func.sum(
                case((Invoice.openai_tokens_used > 0, 1), else_=0)
            ).label("ai_query_count"),
            func.sum(
                case(
                    (Invoice.source_type.in_(["image_ocr", "image_ai", "pdf_image"]), 1),
                    else_=0,
                )
            ).label("ocr_doc_count"),
        )
        .filter(
            Invoice.organization_id == ctx.org_id,
            Invoice.is_deleted.is_(False),
            Invoice.created_at >= cycle_start,
            Invoice.created_at < cycle_end,
        )
        .group_by(func.date(Invoice.created_at))
        .order_by(func.date(Invoice.created_at))
        .all()
    )

    daily = [
        DailyUsageBreakdown(
            date=str(r.day),
            ecf_count=r.ecf_count or 0,
            ai_query_count=r.ai_query_count or 0,
            ocr_doc_count=r.ocr_doc_count or 0,
        )
        for r in rows
    ]

    # ── Storage breakdown from invoices + pending uploads ─────────
    storage_by_filetype: dict[str, dict] = {}

    # Query file sizes from invoices (include rows with NULL file_size)
    invoice_storage = (
        ctx.db.query(
            Invoice.file_type,
            func.count(Invoice.id).label("count"),
            func.coalesce(func.sum(Invoice.file_size), 0).label("total_bytes"),
        )
        .filter(
            Invoice.organization_id == ctx.org_id,
            Invoice.is_deleted.is_(False),
            Invoice.created_at >= cycle_start,
            Invoice.created_at < cycle_end,
        )
        .group_by(Invoice.file_type)
        .all()
    )
    for r in invoice_storage:
        ft = r.file_type or "unknown"
        storage_by_filetype.setdefault(ft, {"count": 0, "total_bytes": 0})
        storage_by_filetype[ft]["count"] += r.count or 0
        storage_by_filetype[ft]["total_bytes"] += r.total_bytes or 0

    # Query file sizes from pending uploads
    pending_storage = (
        ctx.db.query(
            PendingUpload.file_type,
            func.count(PendingUpload.id).label("count"),
            func.coalesce(func.sum(PendingUpload.file_size), 0).label("total_bytes"),
        )
        .filter(
            PendingUpload.organization_id == ctx.org_id,
            PendingUpload.created_at >= cycle_start,
            PendingUpload.created_at < cycle_end,
        )
        .group_by(PendingUpload.file_type)
        .all()
    )
    for r in pending_storage:
        ft = r.file_type or "unknown"
        storage_by_filetype.setdefault(ft, {"count": 0, "total_bytes": 0})
        storage_by_filetype[ft]["count"] += r.count or 0
        storage_by_filetype[ft]["total_bytes"] += r.total_bytes or 0

    total_storage = 0
    storage_by_type = []
    for ft, vals in storage_by_filetype.items():
        total_storage += vals["total_bytes"]
        storage_by_type.append(
            StorageBreakdownItem(
                file_type=ft,
                count=vals["count"],
                total_bytes=vals["total_bytes"],
            )
        )

    # ── Individual storage items (per-file breakdown) ────────────
    invoice_items = (
        ctx.db.query(
            Invoice.filename,
            Invoice.file_type,
            func.coalesce(Invoice.file_size, 0).label("file_size"),
            Invoice.created_at,
        )
        .filter(
            Invoice.organization_id == ctx.org_id,
            Invoice.is_deleted.is_(False),
            Invoice.created_at >= cycle_start,
            Invoice.created_at < cycle_end,
        )
        .order_by(Invoice.created_at.desc())
        .all()
    )

    pending_items = (
        ctx.db.query(
            PendingUpload.filename,
            PendingUpload.file_type,
            PendingUpload.file_size,
            PendingUpload.created_at,
        )
        .filter(
            PendingUpload.organization_id == ctx.org_id,
            PendingUpload.created_at >= cycle_start,
            PendingUpload.created_at < cycle_end,
        )
        .order_by(PendingUpload.created_at.desc())
        .all()
    )

    storage_items = [
        StorageItem(
            filename=r.filename or "sin-nombre",
            file_type=r.file_type or "unknown",
            file_size=r.file_size or 0,
            created_at=r.created_at,
        )
        for r in invoice_items
    ] + [
        StorageItem(
            filename=r.filename or "sin-nombre",
            file_type=r.file_type or "unknown",
            file_size=r.file_size or 0,
            created_at=r.created_at,
        )
        for r in pending_items
    ]

    return UsageDailyResponse(
        cycle=cycle,
        daily=daily,
        storage_by_type=storage_by_type,
        storage_items=storage_items,
        total_storage_bytes=total_storage,
        total_storage_mb=round(total_storage / (1024 * 1024), 2),
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


# ── Cart (Shopping Cart) ────────────────────────────────────────────


class CartItem(BaseModel):
    type: str  # plan_change | addon | renewal | overage | ecf_blocks | entity_slot | user_slot
    plan_name: str | None = None
    addon_type: str | None = None
    quantity: int = 1
    months: int | None = None
    price_cents: int = 0
    label: str | None = None
    organization_id: str | None = None  # for entity-level purchases


class CalculateCartRequest(BaseModel):
    items: list[CartItem]


class CartBreakdownItem(BaseModel):
    type: str
    label: str
    quantity: int
    unit_price: float
    total: float


class CalculateCartResponse(BaseModel):
    items: list[CartBreakdownItem]
    total: float
    currency: str
    item_count: int
    months: int = 1
    discount: float = 0.0
    monthly_total: float = 0.0


@router.post("/calculate-cart")
async def calculate_cart(
    payload: CalculateCartRequest,
    ctx: TenantContext = Depends(require_tenant),
):
    """Calculate total price for a cart of items in USD."""
    breakdowm: list[CartBreakdownItem] = []
    total = 0.0
    currency = "USD"

    months = max((item.months or 1) for item in payload.items) if payload.items else 1
    discount = DISCOUNT_TIERS.get(months, 0.0)

    for item in payload.items:
        unit_price = item.price_cents / 100.0
        months = item.months or 1
        line_total = unit_price * item.quantity * months

        if item.type == "plan_change" and item.plan_name:
            plan = (
                ctx.db.query(SubscriptionPlan)
                .filter(SubscriptionPlan.name == item.plan_name)
                .first()
            )
            if plan:
                usd_price = float(plan.price_usd) if plan.price_usd is not None else None
                if usd_price is None:
                    fallbacks = {"inicial": 16.49, "profesional": 47.99, "despacho": 127.99}
                    usd_price = fallbacks.get(plan.name.lower(), plan.price_monthly_cents / 6000.0)
                unit_price = usd_price
                line_total = unit_price * item.quantity * months
                label = item.label or f"Plan {plan.display_name}"
            else:
                label = item.label or f"Plan {item.plan_name}"
        elif item.type == "addon":
            label = item.label or f"Addon {item.addon_type} x{item.quantity}"
        elif item.type == "renewal":
            label = item.label or f"Renovación ({months} mes{'es' if months > 1 else ''})"
        elif item.type == "overage":
            label = item.label or f"Pago por uso ({item.addon_type})"
        elif item.type == "ecf_blocks":
            label = item.label or f"Bloque de {item.quantity} documentos ECF"
        elif item.type == "entity_slot":
            label = item.label or f"Slot de entidad adicional ({months} mes{'es' if months > 1 else ''})"
        elif item.type == "user_slot":
            label = item.label or f"Slot de usuario adicional ({months} mes{'es' if months > 1 else ''})"
        else:
            label = item.label or item.type

        discounted = round(line_total * (1 - discount), 2)
        total += discounted
        breakdowm.append(CartBreakdownItem(
            type=item.type,
            label=label,
            quantity=item.quantity * months,
            unit_price=round(unit_price * (1 - discount), 2),
            total=discounted,
        ))

    monthly_total = round(total / months, 2) if months > 0 else 0

    return CalculateCartResponse(
        items=breakdowm,
        total=round(total, 2),
        currency=currency,
        item_count=len(payload.items),
        months=months,
        discount=discount,
        monthly_total=monthly_total,
    )


# ── Bank Details ───────────────────────────────────────────────────


class BankDetailsResponse(BaseModel):
    bank_name: str
    account_holder: str
    account_number: str


@router.get("/bank-details", response_model=BankDetailsResponse)
async def get_bank_details():
    """Return bank transfer details for the checkout page."""
    from app.config import BANK_NAME, BANK_ACCOUNT_HOLDER, BANK_ACCOUNT_NUMBER
    return BankDetailsResponse(
        bank_name=BANK_NAME,
        account_holder=BANK_ACCOUNT_HOLDER,
        account_number=BANK_ACCOUNT_NUMBER,
    )


# ── Payment Proof (Bank Transfer) ──────────────────────────────────


class CartItemResponse(BaseModel):
    type: str
    plan_name: str | None = None
    addon_type: str | None = None
    quantity: int = 1
    months: int | None = None
    price_cents: int = 0
    label: str | None = None
    organization_id: str | None = None


class PaymentProofResponse(BaseModel):
    id: str
    plan_name: str
    amount: float
    currency: str
    exchange_rate: float | None = None
    usd_amount: float | None = None
    addons: str | None
    items: list[CartItemResponse] | None = None
    status: str
    file_url: str
    notes: str | None
    admin_notes: str | None
    created_at: str | None


@router.post("/payment-proof")
async def upload_payment_proof(
    plan_name: str = Form(...),
    amount: float = Form(...),
    currency: str = Form("DOP"),
    exchange_rate: float | None = Form(None),
    usd_amount: float | None = Form(None),
    notes: str | None = Form(None),
    items: str | None = Form(None),
    file: UploadFile = File(...),
    ctx: TenantContext = Depends(require_tenant),
):
    """Upload a bank transfer payment proof.

    Optionally accepts `items` (JSON string) — an array of cart items
    describing what is being paid for (plan change, addons, renewal, overage).
    """
    from app.config import SUPABASE_URL
    from app.services.supabase_storage import (
        build_payment_proof_path,
        upload_file,
    )

    content = await file.read()
    ext = os.path.splitext(file.filename or "proof.png")[1] or ".png"

    # Parse items if provided
    parsed_items = None
    if items:
        try:
            parsed_items = json.loads(items)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="El campo items no es un JSON válido")

    # Create proof record first to get its ID
    proof = PaymentProof(
        tenant_id=ctx.tenant_id,
        organization_id=ctx.org_id,
        user_id=ctx.user.id,
        plan_name=plan_name,
        amount=amount,
        currency=currency,
        exchange_rate=exchange_rate,
        usd_amount=usd_amount,
        file_path="",  # placeholder, updated after upload
        notes=notes,
        items_json=json.dumps(parsed_items) if parsed_items else None,
    )
    ctx.db.add(proof)
    ctx.db.flush()

    if SUPABASE_URL:
        # ── Upload to Supabase Storage ──────────────────────────
        storage_path = build_payment_proof_path(
            ctx.tenant_id, ctx.org_id, proof.id, ext,
        )
        result = upload_file(content, storage_path, content_type=file.content_type)
        if not result:
            ctx.db.rollback()
            raise HTTPException(status_code=500, detail="Error al subir el comprobante a storage")
        proof.file_path = result
    else:
        # ── Local dev fallback ──────────────────────────────────
        local_dir = os.path.join(tempfile.gettempdir(), "fintral", "payment-proofs")
        os.makedirs(local_dir, exist_ok=True)
        file_id = f"{uuid.uuid4().hex}{ext}"
        with open(os.path.join(local_dir, file_id), "wb") as f:
            f.write(content)
        proof.file_path = file_id

    ctx.db.commit()
    ctx.db.refresh(proof)

    d = proof.to_dict()

    # ── Notify admin via Telegram & email ──────────────────────────
    try:
        from app.services.alert_hooks import alert_manager, Alert

        user_display = ctx.user.full_name or ctx.user.email or "Alguien"
        await alert_manager.dispatch(Alert(
            title="💰 Nuevo comprobante de pago",
            message=(
                f"{user_display} ha subido un comprobante de "
                f"*{d['plan_name']}* por *{d['amount']:,.2f} {d['currency']}* "
                f"para {ctx.organization.name}."
            ),
            severity="info",
            source="plans",
            metadata={
                "Organización": ctx.organization.name,
                "Usuario": user_display,
                "Plan": d["plan_name"],
                "Monto": f"{d['amount']:,.2f} {d['currency']}",
                "Notas": d.get("notes") or "—",
                "Estado": d["status"],
                "ID": d["id"][:8] + "...",
            },
        ))
    except Exception:
        logger.exception("Error al enviar alerta de comprobante de pago")

    items_list = None
    if d.get("items"):
        try:
            items_list = [CartItemResponse(**i) for i in d["items"]]
        except Exception:
            items_list = None

    return PaymentProofResponse(
        id=d["id"],
        plan_name=d["plan_name"],
        amount=d["amount"],
        currency=d["currency"],
        addons=d["addons"],
        items=items_list,
        status=d["status"],
        file_url=d["file_url"],
        notes=d["notes"],
        admin_notes=d["admin_notes"],
        created_at=d["created_at"],
    )


@router.get("/payment-proofs", response_model=List[PaymentProofResponse])
async def list_payment_proofs(ctx: TenantContext = Depends(require_tenant)):
    """List payment proofs for the current organization."""
    proofs = (
        ctx.db.query(PaymentProof)
        .filter(PaymentProof.organization_id == ctx.org_id)
        .order_by(PaymentProof.created_at.desc())
        .all()
    )
    results = []
    for p in proofs:
        d = p.to_dict()
        items_list = None
        if d.get("items"):
            try:
                items_list = [CartItemResponse(**i) for i in d["items"]]
            except Exception:
                items_list = None
        results.append(PaymentProofResponse(
            id=d["id"],
            plan_name=d["plan_name"],
            amount=d["amount"],
            currency=d["currency"],
            addons=d["addons"],
            items=items_list,
            status=d["status"],
            file_url=d["file_url"],
            notes=d["notes"],
            admin_notes=d["admin_notes"],
            created_at=d["created_at"],
        ))
    return results


# ── Statement (post-pay addon charges) ─────────────────────────────

@router.post("/addon-direct")
async def purchase_addon_direct(
    addon_type: str = Form(...),
    quantity: int = Form(1),
    label: str = Form(""),
    ctx: TenantContext = Depends(require_tenant),
):
    """Purchase addon blocks directly (post-pay, added to monthly statement)."""
    svc = PlanService(ctx.db)
    try:
        result = svc.purchase_addon_direct(ctx.org_id, addon_type, quantity, label)
        return {"success": True, **result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/statement")
async def get_statement(
    cycle: int = Query(None),
    ctx: TenantContext = Depends(require_tenant),
):
    """Get the monthly statement for a given cycle."""
    svc = PlanService(ctx.db)
    return svc.get_statement(ctx.org_id, cycle)


@router.post("/pay-statement")
async def pay_statement(
    cycle: int = Form(...),
    payment_proof_id: str = Form(...),
    ctx: TenantContext = Depends(require_tenant),
):
    """Mark all charges for a cycle as paid."""
    svc = PlanService(ctx.db)
    return svc.pay_statement(ctx.org_id, cycle, payment_proof_id)


@router.get("/unpaid-previous")
async def has_unpaid_previous_cycle(
    ctx: TenantContext = Depends(require_tenant),
):
    """Check if the previous billing cycle has unpaid charges."""
    svc = PlanService(ctx.db)
    return {"unpaid": svc.has_unpaid_previous_cycle(ctx.org_id)}


@router.get("/payment-proof/{proof_id}/file")
async def get_payment_proof_file(
    proof_id: str,
    ctx: TenantContext = Depends(require_tenant),
):
    """Serve a payment proof file from Supabase Storage or local fallback."""
    from app.services.supabase_storage import is_structured_path, download_file

    proof = (
        ctx.db.query(PaymentProof)
        .filter(
            PaymentProof.id == proof_id,
            PaymentProof.organization_id == ctx.org_id,
        )
        .first()
    )
    if not proof:
        raise HTTPException(status_code=404, detail="Comprobante no encontrado")

    if proof.file_path and is_structured_path(proof.file_path):
        file_data = download_file(proof.file_path)
        if not file_data:
            raise HTTPException(status_code=404, detail="No se pudo descargar el archivo del storage")
    else:
        local_dir = os.path.join(tempfile.gettempdir(), "fintral", "payment-proofs")
        local_path = os.path.join(local_dir, proof.file_path)
        try:
            with open(local_path, "rb") as f:
                file_data = f.read()
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail="Archivo no encontrado")

    ext = os.path.splitext(proof.file_path)[1].lower() if proof.file_path else ".png"
    content_types = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".pdf": "application/pdf",
        ".webp": "image/webp",
    }
    content_type = content_types.get(ext, "application/octet-stream")

    from fastapi.responses import StreamingResponse
    import io

    return StreamingResponse(
        io.BytesIO(file_data),
        media_type=content_type,
        headers={"Content-Disposition": f"inline; filename=comprobante{ext}"},
    )


# ── Billing & MIO/Lago Checkout endpoints ──────────────────────────────

class SubscribeRequest(BaseModel):
    plan_name: str
    payment_method: str = "card"

class PrepaidEcfRequest(BaseModel):
    block_type: str = "ecf_block_100"
    payment_method: str = "card"

@router.post("/checkout/subscribe")
async def checkout_subscribe(
    payload: SubscribeRequest,
    ctx: TenantContext = Depends(require_tenant),
):
    """Subscribe an organization to a Hub subscription plan (Inicial, Profesional, Despacho)."""
    from app.services.billing_checkout_service import BillingCheckoutService
    checkout_svc = BillingCheckoutService(ctx.db)
    try:
        result = await checkout_svc.subscribe_organization(
            org_id=str(ctx.org_id),
            plan_name=payload.plan_name,
            payment_method=payload.payment_method,
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception:
        logger.exception("Error initiating plan checkout")
        raise HTTPException(status_code=500, detail="Error interno al iniciar suscripción")

@router.post("/checkout/prepaid-ecf")
async def checkout_prepaid_ecf(
    payload: PrepaidEcfRequest,
    ctx: TenantContext = Depends(require_tenant),
):
    """Purchase prepaid e-CF block package for Fintral Factura (pay-as-you-go)."""
    from app.services.billing_checkout_service import BillingCheckoutService
    checkout_svc = BillingCheckoutService(ctx.db)
    try:
        result = await checkout_svc.purchase_prepaid_ecf(
            org_id=str(ctx.org_id),
            block_type=payload.block_type,
            payment_method=payload.payment_method,
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception:
        logger.exception("Error initiating prepaid e-CF block checkout")
        raise HTTPException(status_code=500, detail="Error interno al procesar compra prepago")
