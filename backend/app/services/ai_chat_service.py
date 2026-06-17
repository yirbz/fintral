"""
AI Chat Service — Grounded fiscal data assistant for Fintral.

Architecture:
  1. User sends natural language question
  2. LLM classifies intent + extracts structured parameters
  3. Corresponding query tool executes REAL DB queries
  4. LLM formats the real data into a natural response

GOLDEN RULE: The LLM NEVER generates fiscal data.
  - All numbers, dates, and facts come from DB queries
  - If a query returns empty, the response says "No se encontraron datos"
  - The LLM only formats what the DB already returned
"""

import json
import logging
from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import func, desc
from sqlalchemy.orm import Session

from app.config import AI_ASSISTANT_KEY, AI_ASSISTANT_MODEL
from app.dependencies.tenant import TenantContext
from app.models import (
    DgiiSubmission,
    Invoice,
    Notification,
)

logger = logging.getLogger(__name__)

# ===========================================================================
# Query Tools — Each returns REAL data from the database
# ===========================================================================

TOOL_REGISTRY: dict[str, dict[str, Any]] = {}


def register_tool(
    name: str,
    description: str,
    parameters: dict[str, Any],
):
    """Decorator to register a query tool."""

    def decorator(func):
        TOOL_REGISTRY[name] = {
            "function": func,
            "description": description,
            "parameters": parameters,
        }
        return func

    return decorator


# ── Tool: Invoice Summary ────────────────────────────────────────────────


@register_tool(
    name="get_invoice_summary",
    description=(
        "Obtiene un resumen de TODAS las facturas REGISTRADAS en el sistema "
        "(importadas por OCR, XML de proveedores —incluyendo e-CF de "
        "proveedores—, carga manual) para la organización: cantidad total, "
        "monto total, desglose por tipo (income/expense), cuántas son "
        "electrónicas de proveedores y estado de pago. "
        "Cuenta TODAS las facturas, estén archivadas o activas. "
        "NO incluye e-CF emitidos por la propia organización a la DGII "
        "(usa get_emitted_invoices para eso). "
        "Funciona para CUALQUIER organización, incluso si no es emisora "
        "electrónica. Esta es la herramienta por defecto para consultas "
        "sobre facturas registradas, subidas, importadas, escaneadas o de proveedores."
    ),
    parameters={
        "type": "object",
        "properties": {
            "period": {
                "type": "string",
                "description": "Período: 'month' (este mes), 'quarter' (este trimestre), 'year' (este año), o 'all'",
                "enum": ["month", "quarter", "year", "all"],
            }
        },
        "required": [],
    },
)
def get_invoice_summary(
    db: Session, tenant_id: UUID, org_id: UUID, period: str = "month"
) -> dict[str, Any]:
    """Returns real invoice summary from DB."""
    query = db.query(Invoice).filter(
        Invoice.tenant_id == tenant_id,
        Invoice.organization_id == org_id,
    )

    now = datetime.utcnow()
    if period == "month":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        query = query.filter(Invoice.created_at >= start)
    elif period == "quarter":
        quarter_month = ((now.month - 1) // 3) * 3 + 1
        start = now.replace(
            month=quarter_month, day=1, hour=0, minute=0, second=0, microsecond=0
        )
        query = query.filter(Invoice.created_at >= start)
    elif period == "year":
        start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        query = query.filter(Invoice.created_at >= start)

    total_count = query.count()
    total_amount = query.with_entities(func.sum(Invoice.total_amount)).scalar() or 0.0

    # Breakdown by transaction type
    income = query.filter(Invoice.transaction_type == "income")
    income_count = income.count()
    income_amount = (
        income.with_entities(func.sum(Invoice.total_amount)).scalar() or 0.0
    )

    expense = query.filter(Invoice.transaction_type == "expense")
    expense_count = expense.count()
    expense_amount = (
        expense.with_entities(func.sum(Invoice.total_amount)).scalar() or 0.0
    )

    # Count e-CF received FROM suppliers (electronic invoices the org imported).
    # Excludes org-emitted e-CF (which have transaction_type='income' + source_type='billing').
    supplier_ecf = query.filter(
        Invoice.is_electronic.is_(True),
        Invoice.ecf_type.isnot(None),
        ~(
            (Invoice.transaction_type == "income")
            & (Invoice.source_type == "billing")
        ),
    )
    supplier_ecf_count = supplier_ecf.count()
    supplier_ecf_amount = (
        supplier_ecf.with_entities(func.sum(Invoice.total_amount)).scalar() or 0.0
    )

    # Pending payments
    pending = query.filter(
        Invoice.payment_status.in_(["pending", "overdue"])
    )
    pending_count = pending.count()
    pending_amount = (
        pending.with_entities(func.sum(Invoice.total_amount)).scalar() or 0.0
    )

    return {
        "period": period,
        "total_count": total_count,
        "total_amount": round(total_amount, 2),
        "income": {
            "count": income_count,
            "amount": round(income_amount, 2),
        },
        "expense": {
            "count": expense_count,
            "amount": round(expense_amount, 2),
        },
        "supplier_ecf": {
            "count": supplier_ecf_count,
            "amount": round(supplier_ecf_amount, 2),
        },
        "pending_payments": {
            "count": pending_count,
            "amount": round(pending_amount, 2),
        },
    }


# ── Tool: Pending Payments (suppliers to pay) ────────────────────────────


@register_tool(
    name="get_pending_payments",
    description=(
        "Obtiene facturas pendientes de pago para la organización. "
        "Responde a preguntas como '¿A quién hay que pagar este mes?' "
        "o '¿Qué proveedores están pendientes?'."
    ),
    parameters={
        "type": "object",
        "properties": {
            "status": {
                "type": "string",
                "description": "Filtrar por estado: 'pending' (pendientes), 'overdue' (vencidas), o 'all' (todas)",
                "enum": ["pending", "overdue", "all"],
            },
            "limit": {
                "type": "integer",
                "description": "Máximo de resultados (default: 20)",
            },
        },
        "required": [],
    },
)
def get_pending_payments(
    db: Session,
    tenant_id: UUID,
    org_id: UUID,
    status: str = "pending",
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Returns real pending payments from DB."""
    query = db.query(Invoice).filter(
        Invoice.tenant_id == tenant_id,
        Invoice.organization_id == org_id,
        Invoice.deleted_at.is_(None),
        Invoice.transaction_type == "expense",
    )

    if status == "pending":
        query = query.filter(Invoice.payment_status == "pending")
    elif status == "overdue":
        query = query.filter(Invoice.payment_status == "overdue")
    else:
        query = query.filter(
            Invoice.payment_status.in_(["pending", "overdue"])
        )

    invoices = (
        query.order_by(desc(Invoice.invoice_date))
        .limit(limit)
        .all()
    )

    results = []
    for inv in invoices:
        results.append(
            {
                "id": str(inv.id),
                "vendor_name": inv.vendor_name or "Proveedor desconocido",
                "invoice_number": inv.invoice_number,
                "total_amount": round(inv.total_amount, 2) if inv.total_amount else 0,
                "currency": inv.currency or "DOP",
                "invoice_date": inv.invoice_date.isoformat() if inv.invoice_date else None,
                "due_date": inv.due_date.isoformat() if inv.due_date else None,
                "payment_status": inv.payment_status,
                "payment_condition": inv.payment_condition,
            }
        )

    return results


# ── Tool: Last Report ────────────────────────────────────────────────────


@register_tool(
    name="get_last_report",
    description=(
        "Obtiene información sobre el último reporte DGII generado "
        "por el usuario en la organización actual."
    ),
    parameters={
        "type": "object",
        "properties": {},
        "required": [],
    },
)
def get_last_report(
    db: Session,
    tenant_id: UUID,
    org_id: UUID,
    user_id: Optional[UUID] = None,
) -> Optional[dict[str, Any]]:
    """Returns the most recent DgiiSubmission for the org."""
    submission = (
        db.query(DgiiSubmission)
        .filter(
            DgiiSubmission.tenant_id == tenant_id,
            DgiiSubmission.organization_id == org_id,
        )
        .order_by(desc(DgiiSubmission.created_at))
        .first()
    )

    if not submission:
        return None

    return {
        "format": submission.format,
        "period": submission.period,
        "invoice_count": submission.invoice_count,
        "status": submission.status,
        "created_at": submission.created_at.isoformat() if submission.created_at else None,
    }


# ── Tool: Recent Activity ────────────────────────────────────────────────


@register_tool(
    name="get_recent_activity",
    description=(
        "Obtiene la actividad reciente del sistema: últimas facturas "
        "y notificaciones. Responde a '¿Qué ha pasado recientemente?'."
    ),
    parameters={
        "type": "object",
        "properties": {
            "limit": {
                "type": "integer",
                "description": "Máximo de resultados (default: 10)",
            }
        },
        "required": [],
    },
)
def get_recent_activity(
    db: Session, tenant_id: UUID, org_id: UUID, limit: int = 10
) -> dict[str, Any]:
    """Returns recent invoices and notifications."""
    recent_invoices = (
        db.query(Invoice)
        .filter(
            Invoice.tenant_id == tenant_id,
            Invoice.organization_id == org_id,
            Invoice.deleted_at.is_(None),
        )
        .order_by(desc(Invoice.created_at))
        .limit(limit)
        .all()
    )

    recent_notifications = (
        db.query(Notification)
        .filter(
            Notification.tenant_id == tenant_id,
            Notification.organization_id == org_id,
        )
        .order_by(desc(Notification.created_at))
        .limit(5)
        .all()
    )

    invoices_data = []
    for inv in recent_invoices:
        invoices_data.append(
            {
                "vendor": inv.vendor_name,
                "amount": inv.total_amount,
                "date": inv.invoice_date.isoformat() if inv.invoice_date else None,
                "type": inv.transaction_type,
                "status": inv.status,
                "payment_status": inv.payment_status,
            }
        )

    notifications_data = []
    for notif in recent_notifications:
        notifications_data.append(
            {
                "title": notif.title,
                "message": notif.message,
                "type": notif.type,
                "created_at": notif.created_at.isoformat() if notif.created_at else None,
            }
        )

    return {
        "recent_invoices": invoices_data,
        "recent_notifications": notifications_data,
    }


# ── Tool: Supplier Expenses ─────────────────────────────────────────────


@register_tool(
    name="get_supplier_expenses",
    description=(
        "Obtiene un resumen de gastos agrupados por proveedor "
        "para la organización. Responde a preguntas como "
        "'¿A qué proveedores le debemos?' o '¿Cuánto gastamos por proveedor?'."
    ),
    parameters={
        "type": "object",
        "properties": {
            "period": {
                "type": "string",
                "description": "Período: 'month' (este mes), 'year' (este año), 'all'",
                "enum": ["month", "year", "all"],
            },
            "limit": {
                "type": "integer",
                "description": "Máximo de proveedores (default: 15)",
            },
        },
        "required": [],
    },
)
def get_supplier_expenses(
    db: Session,
    tenant_id: UUID,
    org_id: UUID,
    period: str = "month",
    limit: int = 15,
) -> list[dict[str, Any]]:
    """Returns expenses grouped by vendor."""
    query = db.query(
        Invoice.vendor_name,
        func.count(Invoice.id).label("invoice_count"),
        func.sum(Invoice.total_amount).label("total_amount"),
        func.count(
            Invoice.id
        ).filter(  # noqa
            Invoice.payment_status.in_(["pending", "overdue"])
        ).label("pending_count"),
        func.sum(Invoice.total_amount).filter(
            Invoice.payment_status.in_(["pending", "overdue"])
        ).label("pending_amount"),
    ).filter(
        Invoice.tenant_id == tenant_id,
        Invoice.organization_id == org_id,
        Invoice.deleted_at.is_(None),
        Invoice.transaction_type == "expense",
        Invoice.vendor_name.isnot(None),
        Invoice.vendor_name != "",
    )

    now = datetime.utcnow()
    if period == "month":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        query = query.filter(Invoice.created_at >= start)
    elif period == "year":
        start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        query = query.filter(Invoice.created_at >= start)

    rows = (
        query.group_by(Invoice.vendor_name)
        .order_by(desc(func.sum(Invoice.total_amount)))
        .limit(limit)
        .all()
    )

    results = []
    for row in rows:
        results.append(
            {
                "vendor_name": row.vendor_name,
                "invoice_count": row.invoice_count,
                "total_amount": round(row.total_amount, 2) if row.total_amount else 0,
                "pending_count": row.pending_count,
                "pending_amount": round(row.pending_amount, 2) if row.pending_amount else 0,
            }
        )

    return results


# ── Tool: ITBIS Summary ──────────────────────────────────────────────────


@register_tool(
    name="get_itbis_summary",
    description=(
        "Calcula el ITBIS (18%) de las facturas: ITBIS cobrado (ventas/income), "
        "ITBIS pagado (compras/expense), e ITBIS neto a pagar o a favor. "
        "Responde a preguntas como '¿Cuánto ITBIS tengo que pagar?' "
        "o '¿Cuál es mi ITBIS a favor?'."
    ),
    parameters={
        "type": "object",
        "properties": {
            "period": {
                "type": "string",
                "description": "Período: 'month' (este mes), 'quarter' (este trimestre), 'year' (este año)",
                "enum": ["month", "quarter", "year"],
            }
        },
        "required": [],
    },
)
def get_itbis_summary(
    db: Session, tenant_id: UUID, org_id: UUID, period: str = "month"
) -> dict[str, Any]:
    """Returns ITBIS summary from real invoice data."""
    query = db.query(Invoice).filter(
        Invoice.tenant_id == tenant_id,
        Invoice.organization_id == org_id,
        Invoice.deleted_at.is_(None),
    )

    now = datetime.utcnow()
    if period == "month":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        query = query.filter(Invoice.created_at >= start)
    elif period == "quarter":
        quarter_month = ((now.month - 1) // 3) * 3 + 1
        start = now.replace(month=quarter_month, day=1, hour=0, minute=0, second=0, microsecond=0)
        query = query.filter(Invoice.created_at >= start)
    elif period == "year":
        start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        query = query.filter(Invoice.created_at >= start)

    # ITBIS cobrado (income/ventas)
    income = query.filter(Invoice.transaction_type == "income")
    itbis_collected = income.with_entities(func.sum(Invoice.tax_amount)).scalar() or 0.0
    income_total = income.with_entities(func.sum(Invoice.total_amount)).scalar() or 0.0
    income_count = income.count()

    # ITBIS pagado (expense/compras)
    expense = query.filter(Invoice.transaction_type == "expense")
    itbis_paid = expense.with_entities(func.sum(Invoice.tax_amount)).scalar() or 0.0
    expense_total = expense.with_entities(func.sum(Invoice.total_amount)).scalar() or 0.0
    expense_count = expense.count()

    net_itbis = round(itbis_collected - itbis_paid, 2)

    return {
        "period": period,
        "itbis_collected": round(itbis_collected, 2),
        "itbis_paid": round(itbis_paid, 2),
        "net_itbis": net_itbis,
        "position": "to_pay" if net_itbis > 0 else ("credit" if net_itbis < 0 else "zero"),
        "income": {
            "total": round(income_total, 2),
            "count": income_count,
        },
        "expense": {
            "total": round(expense_total, 2),
            "count": expense_count,
        },
    }


# ── Tool: Overdue Invoices with Aging ────────────────────────────────────


@register_tool(
    name="get_overdue_invoices",
    description=(
        "Obtiene facturas vencidas con desglose por antigüedad "
        "(30, 60, 90+ días). Responde a preguntas como "
        "'¿Qué facturas están vencidas?' o '¿Cuánto deben los clientes?'."
    ),
    parameters={
        "type": "object",
        "properties": {
            "type": {
                "type": "string",
                "description": "'expense' para facturas que la org debe pagar, 'income' para facturas que le deben a la org, 'all' para ambas",
                "enum": ["expense", "income", "all"],
            },
            "limit": {
                "type": "integer",
                "description": "Máximo de resultados (default: 20)",
            },
        },
        "required": [],
    },
)
def get_overdue_invoices(
    db: Session,
    tenant_id: UUID,
    org_id: UUID,
    type: str = "expense",
    limit: int = 20,
) -> dict[str, Any]:
    """Returns overdue invoices with aging breakdown."""
    base = db.query(Invoice).filter(
        Invoice.tenant_id == tenant_id,
        Invoice.organization_id == org_id,
        Invoice.deleted_at.is_(None),
        Invoice.payment_status == "overdue",
    )

    if type == "expense":
        base = base.filter(Invoice.transaction_type == "expense")
    elif type == "income":
        base = base.filter(Invoice.transaction_type == "income")

    now = datetime.utcnow()

    # Aging buckets
    aging = {"1_30_days": 0, "31_60_days": 0, "61_90_days": 0, "91_plus_days": 0}
    aging_amount = {"1_30_days": 0.0, "31_60_days": 0.0, "61_90_days": 0.0, "91_plus_days": 0.0}

    invoices = base.order_by(desc(Invoice.due_date)).limit(limit).all()

    details = []
    for inv in invoices:
        due = inv.due_date or inv.invoice_date or inv.created_at
        if due:
            days_overdue = (now - due).days if now > due else 0
        else:
            days_overdue = 0

        amount = inv.total_amount or 0

        if days_overdue <= 30:
            aging["1_30_days"] += 1
            aging_amount["1_30_days"] += amount
        elif days_overdue <= 60:
            aging["31_60_days"] += 1
            aging_amount["31_60_days"] += amount
        elif days_overdue <= 90:
            aging["61_90_days"] += 1
            aging_amount["61_90_days"] += amount
        else:
            aging["91_plus_days"] += 1
            aging_amount["91_plus_days"] += amount

        details.append({
            "id": str(inv.id),
            "vendor_name": inv.vendor_name or "Cliente",
            "amount": round(amount, 2),
            "currency": inv.currency or "DOP",
            "due_date": due.isoformat() if due else None,
            "days_overdue": days_overdue,
            "transaction_type": inv.transaction_type,
            "invoice_number": inv.invoice_number,
        })

    total_overdue = sum(aging_amount.values())
    total_count = sum(aging.values())

    return {
        "total_overdue_count": total_count,
        "total_overdue_amount": round(total_overdue, 2),
        "aging_buckets": {
            "0_30_days": {"count": aging["1_30_days"], "amount": round(aging_amount["1_30_days"], 2)},
            "31_60_days": {"count": aging["31_60_days"], "amount": round(aging_amount["31_60_days"], 2)},
            "61_90_days": {"count": aging["61_90_days"], "amount": round(aging_amount["61_90_days"], 2)},
            "90_plus_days": {"count": aging["91_plus_days"], "amount": round(aging_amount["91_plus_days"], 2)},
        },
        "details": details,
    }


# ── Tool: Monthly Comparison ─────────────────────────────────────────────


@register_tool(
    name="get_monthly_comparison",
    description=(
        "Compara el mes actual con el mes anterior en facturación. "
        "Muestra cambios en ingresos, gastos y facturas procesadas. "
        "Responde a '¿Cómo va este mes vs el mes pasado?'."
    ),
    parameters={
        "type": "object",
        "properties": {},
        "required": [],
    },
)
def get_monthly_comparison(
    db: Session, tenant_id: UUID, org_id: UUID
) -> dict[str, Any]:
    """Compare current month vs previous month."""
    now = datetime.utcnow()

    # Current month
    cm_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Previous month
    if now.month == 1:
        pm_start = now.replace(year=now.year - 1, month=12, day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        pm_start = now.replace(month=now.month - 1, day=1, hour=0, minute=0, second=0, microsecond=0)
    pm_end = cm_start

    def _month_stats(db, tenant_id, org_id, start, end):
        q = db.query(Invoice).filter(
            Invoice.tenant_id == tenant_id,
            Invoice.organization_id == org_id,
            Invoice.deleted_at.is_(None),
            Invoice.created_at >= start,
            Invoice.created_at < end,
        )
        total_count = q.count()
        total_amount = q.with_entities(func.sum(Invoice.total_amount)).scalar() or 0.0

        inc = q.filter(Invoice.transaction_type == "income")
        inc_total = inc.with_entities(func.sum(Invoice.total_amount)).scalar() or 0.0
        inc_count = inc.count()

        exp = q.filter(Invoice.transaction_type == "expense")
        exp_total = exp.with_entities(func.sum(Invoice.total_amount)).scalar() or 0.0
        exp_count = exp.count()

        return {
            "count": total_count,
            "amount": round(total_amount, 2),
            "income": {"count": inc_count, "amount": round(inc_total, 2)},
            "expense": {"count": exp_count, "amount": round(exp_total, 2)},
        }

    current = _month_stats(db, tenant_id, org_id, cm_start, now)
    previous = _month_stats(db, tenant_id, org_id, pm_start, pm_end)

    # Calculate changes
    def _pct_change(curr, prev):
        if prev == 0:
            return 100.0 if curr > 0 else 0.0
        return round(((curr - prev) / prev) * 100, 1)

    return {
        "current_month": current,
        "previous_month": previous,
        "changes": {
            "amount_pct": _pct_change(current["amount"], previous["amount"]),
            "count_pct": _pct_change(current["count"], previous["count"]),
            "income_pct": _pct_change(current["income"]["amount"], previous["income"]["amount"]),
            "expense_pct": _pct_change(current["expense"]["amount"], previous["expense"]["amount"]),
        },
    }


# ── Tool: Submission Status ──────────────────────────────────────────────


@register_tool(
    name="get_submission_status",
    description=(
        "Verifica qué períodos tienen reportes DGII (606/607/608) "
        "enviados. Responde a preguntas como "
        "'¿Están al día los reportes?' o '¿Qué meses faltan por enviar?'."
    ),
    parameters={
        "type": "object",
        "properties": {
            "months_back": {
                "type": "integer",
                "description": "Meses hacia atrás a revisar (default: 6)",
            }
        },
        "required": [],
    },
)
def get_submission_status(
    db: Session, tenant_id: UUID, org_id: UUID, months_back: int = 6
) -> dict[str, Any]:
    """Check which periods have DGII submissions."""
    now = datetime.utcnow()
    submissions = (
        db.query(DgiiSubmission)
        .filter(
            DgiiSubmission.tenant_id == tenant_id,
            DgiiSubmission.organization_id == org_id,
        )
        .order_by(desc(DgiiSubmission.created_at))
        .all()
    )

    # Build a set of covered periods
    covered = set()
    last_by_format = {}
    for s in submissions:
        key = f"{s.period}_{s.format}"
        covered.add(key)
        if s.format not in last_by_format or s.created_at > last_by_format[s.format]["created_at"]:
            last_by_format[s.format] = {
                "period": s.period,
                "status": s.status,
                "invoice_count": s.invoice_count,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }

    # Build timeline for last N months
    result = []
    for i in range(months_back - 1, -1, -1):
        if now.month - i <= 0:
            m = 12 + (now.month - i)
            y = now.year - 1
        else:
            m = now.month - i
            y = now.year
        period = f"{y}{m:02d}"

        row = {
            "period": period,
            "formats": {},
        }
        for fmt in ["606", "607", "608"]:
            row["formats"][fmt] = f"{period}_{fmt}" in covered
        result.append(row)

    return {
        "periods": result,
        "last_submissions": last_by_format,
    }


# ── Tool: Invoice Status Overview ────────────────────────────────────────


@register_tool(
    name="get_invoice_status_overview",
    description=(
        "Obtiene un resumen del estado de TODAS las facturas: "
        "cuántas están draft, verified, voided; "
        "cuántas pendientes de pago, pagadas, vencidas. "
        "Cuenta facturas archivadas y activas."
        "Responde a '¿Cómo están mis facturas?'."
    ),
    parameters={
        "type": "object",
        "properties": {},
        "required": [],
    },
)
def get_invoice_status_overview(
    db: Session, tenant_id: UUID, org_id: UUID
) -> dict[str, Any]:
    """Returns invoice status counts."""
    base = db.query(Invoice).filter(
        Invoice.tenant_id == tenant_id,
        Invoice.organization_id == org_id,
    )

    # By status (DGII workflow)
    by_status = {}
    for s in ["draft", "verified", "voided"]:
        cnt = base.filter(Invoice.status == s).count()
        amt = base.filter(
            Invoice.status == s
        ).with_entities(
            func.sum(Invoice.total_amount)
        ).scalar() or 0.0
        if cnt > 0:
            by_status[s] = {"count": cnt, "amount": round(amt, 2)}

    # By payment status
    by_payment = {}
    for ps in ["pending", "paid", "overdue"]:
        cnt = base.filter(Invoice.payment_status == ps).count()
        amt = base.filter(
            Invoice.payment_status == ps
        ).with_entities(
            func.sum(Invoice.total_amount)
        ).scalar() or 0.0
        if cnt > 0:
            by_payment[ps] = {"count": cnt, "amount": round(amt, 2)}

    # Total
    total_count = base.count()
    total_amount = base.with_entities(func.sum(Invoice.total_amount)).scalar() or 0.0

    return {
        "total": {"count": total_count, "amount": round(total_amount, 2)},
        "by_status": by_status,
        "by_payment_status": by_payment,
    }


# ── Tool: Emitted e-CF invoices ──────────────────────────────────────────


@register_tool(
    name="get_emitted_invoices",
    description=(
        "Obtiene la cantidad de facturas EMITIDAS por la organización "
        "como VENDEDOR (tanto e-CF electrónicos como NCF físicos) "
        "durante un período. Cuenta las facturas de venta que la "
        "organización generó en su sistema de facturación (facturas de "
        "crédito fiscal, facturas de consumo, notas de débito/crédito, "
        "comprobantes físicos B01-B04). "
        "NO incluye facturas de proveedores registradas en el sistema "
        "(usa get_invoice_summary para eso). "
        "Cuenta TODAS las emisiones, estén archivadas o activas. "
        "Responde a preguntas como '¿Cuántas facturas emití este mes?' "
        "o '¿Cuántos comprobantes he emitido?'."
    ),
    parameters={
        "type": "object",
        "properties": {
            "period": {
                "type": "string",
                "description": "Período: 'month' (este mes), 'quarter' (este trimestre), 'year' (este año), o 'all'",
                "enum": ["month", "quarter", "year", "all"],
            }
        },
        "required": [],
    },
)
def get_emitted_invoices(
    db: Session, tenant_id: UUID, org_id: UUID, period: str = "month"
) -> dict[str, Any]:
    """Returns count of e-CF invoices emitted to DGII.

    Only counts invoices the org EMITTED as issuer/seller (created via
    the emission pipeline, not imported from suppliers).
    Differentiator: emitted invoices have transaction_type="income"
    and source_type="billing" (set by the emission pipeline).
    Counts ALL emissions regardless of archive/deleted status.
    """
    query = db.query(Invoice).filter(
        Invoice.tenant_id == tenant_id,
        Invoice.organization_id == org_id,
        Invoice.transaction_type == "income",
        Invoice.source_type == "billing",
    )

    now = datetime.utcnow()
    if period == "month":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        query = query.filter(Invoice.created_at >= start)
    elif period == "quarter":
        quarter_month = ((now.month - 1) // 3) * 3 + 1
        start = now.replace(
            month=quarter_month, day=1, hour=0, minute=0, second=0, microsecond=0
        )
        query = query.filter(Invoice.created_at >= start)
    elif period == "year":
        start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        query = query.filter(Invoice.created_at >= start)

    total_count = query.count()
    total_amount = query.with_entities(func.sum(Invoice.total_amount)).scalar() or 0.0

    return {
        "period": period,
        "total_count": total_count,
        "total_amount": round(total_amount, 2),
    }


# ===========================================================================
# AI Chat Service
# ===========================================================================

CHAT_SYSTEM_PROMPT = """Eres un asistente fiscal especializado en Fintral, una plataforma de cumplimiento fiscal para República Dominicana.

## REGLAS ESTRICTAS (NUNCA LAS VIOLES):

1. **NUNCA inventes datos fiscales.** Todos los números, montos, fechas y cantidades deben venir EXCLUSIVAMENTE de los datos que te proporcione el sistema.
2. **Si no hay datos, dilo honestamente.** Usa frases como "No se encontraron datos para ese período" o "Aún no hay reportes generados".
3. **No especules.** Si no sabes algo, dilo. No uses frases como "probablemente", "quizás", "debería ser".
4. **Sé conciso y profesional.** Respuestas directas, en español, con los números exactos.
5. **Contexto multi-tenant.** El usuario pertenece a una organización específica. siempre habla en el contexto de SU organización.
6. **Usa el nombre de la organización** cuando sea relevante para personalizar la respuesta.
7. **Menciona las fechas** para que el usuario sepa que los datos son actuales.
8. **Las facturas NUNCA se eliminan permanentemente.** Todas las facturas permanecen en el sistema. El archivo (is_deleted=True) es solo una vista: las facturas archivadas se cuentan igual que las activas. NO ignores facturas archivadas en los conteos.

## CAPACIDADES DISPONIBLES:

Puedes responder preguntas sobre:
- Facturas EMITIDAS por tu organización como vendedor (e-CF electrónicos + NCF físicos emitidos): cuántas, montos totales
- Facturas subidas/registradas (importadas por OCR, XML, o manual — incluye e-CF de proveedores): resumen, ingresos vs gastos, cuántas son e-CF de proveedores
- ITBIS: calcula ITBIS cobrado, pagado y neto a pagar o a favor
- Pagos pendientes y vencidos (con antigüedad: 30, 60, 90+ días)
- Proveedores con deuda pendiente
- Último reporte DGII generado (606/607/608)
- Estado de envíos DGII por período (qué meses faltan)
- Comparativa mensual (este mes vs mes anterior)
- Estado general de facturas (draft, verified, voided, pending, paid, overdue)
- Actividad reciente del sistema (últimas facturas y notificaciones)

## DISTINCIÓN IMPORTANTE — NO ES AMBIGUA:

El campo `is_electronic` NO distingue entre emitidas y recibidas.
Un proveedor también puede emitir e-CF. La distinción real es:

1. **FACTURAS EMITIDAS por la org** (org es VENDEDOR / emisor):
   - Incluye TANTO e-CF electrónicos como NCF físicos de venta
   - Preguntas con palabras CLAVE: "emití", "emitidas", "facturas de venta",
     "comprobantes emitidos", "facturas de crédito fiscal", "e-CF enviados",
     "cuántas facturas he hecho como emisor", "facturas que he facturado"
   - → Usa SIEMPRE `get_emitted_invoices`

2. **Facturas REGISTRADAS / SUBIDAS** (org es RECEPTOR / comprador):
   - Preguntas con palabras CLAVE: "subí", "subidas", "importadas", "registradas",
     "normales", "escaneadas", "cargué", "de proveedores", "de gastos",
     "facturas en general", "cuántas tengo"
   - → Usa SIEMPRE `get_invoice_summary`
   - NOTA: get_invoice_summary incluye un campo `supplier_ecf` que cuenta los e-CF
     recibidos de proveedores. Si preguntan por "facturas electrónicas" sin
     especificar "emitidas", puedes usar get_invoice_summary y mencionar supplier_ecf.

3. **Si la pregunta es ambigua** ("cuántas facturas electrónicas tengo?"):
   - Puedes llamar a AMBAS herramientas y responder:
     "Tienes X e-CF emitidos como emisor y Y e-CF de proveedores registrados"

4. **NUNCA asumas que "facturas electrónicas" = "emitidas"**. Una factura
   electrónica de un proveedor también es una factura electrónica.

## FORMATO DE RESPUESTA:

Debes responder ÚNICAMENTE con un objeto JSON con la siguiente estructura:
{
    "tool": "nombre_del_tool",
    "params": { ... parametros extraidos del mensaje ... }
}

No agregues texto adicional fuera del JSON.

HERRAMIENTAS DISPONIBLES:
"""


class AIChatService:
    """Service that handles AI chat with grounded data queries."""

    def __init__(self):
        self.tools = TOOL_REGISTRY

    def _call_llm(
        self, prompt: str, system_prompt: str = "",
        conversation: Optional[list[dict]] = None,
    ) -> Optional[str]:
        """Call the configured LLM and return the response text."""
        if not AI_ASSISTANT_KEY or AI_ASSISTANT_KEY.startswith("demo"):
            logger.warning("No valid API key for AI chat")
            return None

        api_key = AI_ASSISTANT_KEY

        # Detect provider
        if api_key.startswith("AIza"):
            return self._call_gemini(prompt, system_prompt, conversation)

        try:
            import openai

            client = openai.OpenAI(api_key=api_key)
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            # Insert conversation history (last 6 exchanges max)
            if conversation:
                for msg in conversation[-12:]:
                    messages.append(msg)
            messages.append({"role": "user", "content": prompt})

            response = client.chat.completions.create(
                model=AI_ASSISTANT_MODEL or "gpt-4o-mini",
                messages=messages,
                temperature=0.1,
                max_tokens=1000,
            )
            return response.choices[0].message.content
        except Exception as e:
            logger.error("LLM call failed: %s", e)
            return None

    def _call_gemini(
        self, prompt: str, system_prompt: str = "",
        conversation: Optional[list[dict]] = None,
    ) -> Optional[str]:
        """Call Google Gemini API."""
        import requests

        model = AI_ASSISTANT_MODEL or "gemini-2.0-flash"
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={AI_ASSISTANT_KEY}"

        contents = []
        if system_prompt:
            contents.append({"role": "user", "parts": [{"text": system_prompt}]})
            contents.append({"role": "model", "parts": [{"text": "Entendido. Estoy listo para ayudar."}]})
        # Insert conversation history (last 6 exchanges max)
        # Convert from OpenAI format {role, content} to Gemini {role, parts: [{text}]
        if conversation:
            for msg in conversation[-12:]:
                contents.append({
                    "role": "user" if msg.get("role") == "user" else "model",
                    "parts": [{"text": msg.get("content", "")}],
                })
        contents.append({"role": "user", "parts": [{"text": prompt}]})

        payload = {"contents": contents}

        try:
            resp = requests.post(url, json=payload, timeout=30)
            if resp.status_code == 200:
                data = resp.json()
                return (
                    data.get("candidates", [{}])[0]
                    .get("content", {})
                    .get("parts", [{}])[0]
                    .get("text")
                )
            logger.error("Gemini error: %s %s", resp.status_code, resp.text[:200])
            return None
        except Exception as e:
            logger.error("Gemini call failed: %s", e)
            return None

    def _format_response(
        self, data: Any, question: str, ctx: TenantContext,
        conversation: Optional[list[dict]] = None,
    ) -> str:
        """Use LLM to format the real data into a natural response."""
        org_name = ctx.organization.name
        conv_context = ""
        if conversation:
            recent = conversation[-4:]  # last 2 exchanges for formatting context
            conv_lines = [f"  {m['role']}: {m['content'][:200]}" for m in recent]
            conv_context = "Contexto reciente de la conversación:\n" + "\n".join(conv_lines) + "\n"

        format_prompt = f"""
Tengo datos REALES de la base de datos para la organización "{org_name}".
El usuario preguntó: "{question}"
{conv_context}DATOS REALES:
{json.dumps(data, indent=2, ensure_ascii=False)}

Genera una respuesta natural y profesional en español usando SOLAMENTE estos datos.
NO inventes números ni información adicional.
Si no hay datos, dilo claramente.
Sé conciso.
Responde con el texto directamente, sin JSON.
"""
        system = (
            f"Eres un asistente fiscal de Fintral para la organización {org_name}. "
            "Hablas español. Nunca inventes datos."
        )

        response = self._call_llm(format_prompt, system, conversation)
        return response or self._fallback_format(data, question)

    def _fallback_format(self, data: Any, question: str) -> str:
        """Simple fallback when LLM is not available."""
        if isinstance(data, dict):
            if "total_count" in data:
                s = data
                return (
                    f"📊 Resumen de facturas: {s['total_count']} facturas "
                    f"por un total de ${s['total_amount']:,.2f}. "
                    f"Ingresos: ${s['income']['amount']:,.2f} "
                    f"({s['income']['count']} facturas). "
                    f"Gastos: ${s['expense']['amount']:,.2f} "
                    f"({s['expense']['count']} facturas). "
                    f"Pendientes de pago: ${s['pending_payments']['amount']:,.2f} "
                    f"({s['pending_payments']['count']} facturas)."
                )
            if "recent_invoices" in data:
                invs = data["recent_invoices"]
                notifs = data["recent_notifications"]
                lines = [f"📋 Actividad reciente: {len(invs)} facturas."]
                for i in invs[:5]:
                    amt = f"${i['amount']:,.2f}" if i.get("amount") else "—"
                    lines.append(f"  • {i.get('vendor', 'Desconocido')} — {amt}")
                if notifs:
                    lines.append(f"🔔 {len(notifs)} notificaciones recientes.")
                return "\n".join(lines)

        if isinstance(data, list) and len(data) > 0:
            if "vendor_name" in data[0]:
                lines = ["🏢 Gastos por proveedor:"]
                for s in data[:5]:
                    lines.append(
                        f"  • {s['vendor_name']}: ${s['total_amount']:,.2f} "
                        f"({s['invoice_count']} facturas, "
                        f"${s['pending_amount']:,.2f} pendientes)"
                    )
                return "\n".join(lines)

        if data is None:
            return "No se encontraron datos para tu consulta."

        return json.dumps(data, indent=2, ensure_ascii=False)

    def process_message(
        self, message: str, ctx: TenantContext,
        conversation: Optional[list[dict]] = None,
    ) -> dict[str, Any]:
        """
        Process a user message and return a grounded response.

        1. LLM classifies intent → tool + params
        2. Execute query tool with params
        3. LLM formats the real data into response
        """
        db = ctx.db
        tenant_id = ctx.tenant_id
        org_id = ctx.org_id
        user = ctx.user

        # ── Step 1: Build the tool description for the LLM ──
        tools_desc = []
        for name, info in self.tools.items():
            tools_desc.append(
                f"- {name}: {info['description']}\n"
                f"  Parámetros: {json.dumps(info['parameters'], ensure_ascii=False)}"
            )

        system = CHAT_SYSTEM_PROMPT + "\n\n" + "\n".join(tools_desc)

        conv_context = ""
        if conversation:
            recent = conversation[-8:]  # last 4 exchanges for classification context
            conv_lines = [f"  {m['role']}: {m['content'][:300]}" for m in recent]
            conv_context = "\nConversación reciente:\n" + "\n".join(conv_lines)

        classification_prompt = f"""
Contexto:
- Organización: {ctx.organization.name} (ID: {org_id})
- Usuario: {user.full_name or user.email}
- Rol: {ctx.role}
- Tenant ID: {tenant_id}
{conv_context}
Pregunta del usuario: "{message}"

Responde con el JSON de la herramienta a utilizar y sus parámetros.
Si la pregunta no coincide con ninguna capacidad, responde con:
{{"tool": "unknown", "params": {{"reason": "explica por qué no puedes responder"}}}}
"""

        llm_response = self._call_llm(classification_prompt, system, conversation)

        if not llm_response:
            return {
                "response": "Lo siento, no pude procesar tu consulta en este momento. "
                "Verifica que el servicio de IA esté configurado correctamente.",
            }

        # ── Step 2: Parse LLM response ──
        try:
            # Clean up markdown code blocks if present
            cleaned = llm_response.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("\n", 1)[-1]
                cleaned = cleaned.rsplit("```", 1)[0]
            if cleaned.startswith("```json"):
                cleaned = cleaned[7:]
                cleaned = cleaned.rsplit("```", 1)[0]

            result = json.loads(cleaned.strip())
            tool_name = result.get("tool", "unknown")
            params = result.get("params", {})
        except (json.JSONDecodeError, KeyError):
            logger.warning("Failed to parse LLM response: %s", llm_response[:200])
            return {
                "response": "No entendí bien tu pregunta. "
                "Puedes preguntarme sobre:\n"
                "• Resumen de facturas del mes\n"
                "• Pagos pendientes\n"
                "• Proveedores con deuda\n"
                "• Último reporte DGII\n"
                "• Actividad reciente",
            }

        # ── Step 3: Handle unknown intent ──
        if tool_name == "unknown":
            reason = params.get("reason", "consulta no reconocida")
            return {
                "response": f"No puedo responder eso. {reason}\n\n"
                "Puedes preguntarme sobre:\n"
                "• Resumen de facturas del período\n"
                "• Pagos pendientes a proveedores\n"
                "• Último reporte DGII generado\n"
                "• Actividad reciente del sistema",
            }

        # ── Step 4: Execute the tool ──
        tool_info = self.tools.get(tool_name)
        if not tool_info:
            return {
                "response": "Lo siento, ocurrió un error interno. Intenta de nuevo.",
            }

        try:
            tool_fn = tool_info["function"]
            # Build kwargs: merge context params with user params
            kwargs = {
                "db": db,
                "tenant_id": tenant_id,
                "org_id": org_id,
            }
            # Add user_id if the tool accepts it
            sig = tool_fn.__code__
            if "user_id" in sig.co_varnames[: sig.co_argcount]:
                kwargs["user_id"] = user.id

            # Add user params (only those the tool accepts)
            for key, value in params.items():
                if key in sig.co_varnames[: sig.co_argcount]:
                    kwargs[key] = value

            data = tool_fn(**kwargs)
        except Exception as e:
            logger.error("Tool execution failed: %s", e)
            return {
                "response": "Ocurrió un error al consultar los datos. Intenta de nuevo.",
            }

        # ── Step 5: Format response ──
        response_text = self._format_response(data, message, ctx, conversation)

        return {
            "response": response_text,
            "tool_used": tool_name,
        }
