from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import desc
import io
from datetime import datetime

from app.core.container import export_service
from app.dependencies.tenant import TenantContext, require_tenant
from app.models import Invoice

router = APIRouter(prefix="/api/reports", tags=["reports"])

@router.get("/ap-ar/preview")
async def get_ap_ar_preview(
    report_type: str = Query(..., pattern="^(ap|ar)$"),
    ctx: TenantContext = Depends(require_tenant),
):
    """
    Retorna un JSON estructurado para mostrar una vista previa estilo hoja de cálculo
    de las cuentas por pagar (ap) o por cobrar (ar).
    """
    transaction_type = "expense" if report_type == "ap" else "income"

    invoices = (
        ctx.db.query(Invoice)
        .filter(
            Invoice.tenant_id == ctx.tenant_id,
            Invoice.organization_id == ctx.org_id,
            Invoice.transaction_type == transaction_type,
            Invoice.payment_condition == "credito",
            Invoice.payment_status != "paid",
            Invoice.is_deleted.is_(False),
            Invoice.cancelled_at.is_(None),
            Invoice.status != "voided",
        )
        .order_by(desc(Invoice.due_date), desc(Invoice.invoice_date))
        .all()
    )

    from app.utils.dates import utc_now
    now_date = utc_now().date()
    now_str = utc_now().strftime("%Y-%m-%d %I:%M:%S %p")

    rows = []
    total_base = 0.0
    total_tax = 0.0
    total_amount = 0.0

    for inv in invoices:
        days_overdue = 0
        if inv.due_date:
            due_date_only = inv.due_date.date()
            if due_date_only < now_date:
                days_overdue = (now_date - due_date_only).days

        status_text = "Pendiente"
        if inv.due_date and inv.due_date.date() < now_date:
            status_text = "Vencido"
        if inv.payment_status == "paid":
            status_text = "Pagado"
        if inv.status == "voided" or inv.cancelled_at:
            status_text = "Anulada"

        tax = inv.tax_amount or 0.0
        total = inv.total_amount or 0.0
        base = total - tax

        total_base += base
        total_tax += tax
        total_amount += total

        rows.append({
            "id": str(inv.id),
            "invoice_number": inv.invoice_number or "S/N",
            "entity_name": inv.vendor_name or "Desconocido",
            "tax_id": inv.vendor_tax_id or "N/A",
            "invoice_date": inv.invoice_date.strftime("%Y-%m-%d") if inv.invoice_date else "N/A",
            "due_date": inv.due_date.strftime("%Y-%m-%d") if inv.due_date else "N/A",
            "days_overdue": days_overdue,
            "status": status_text,
            "base_amount": round(base, 2),
            "tax_amount": round(tax, 2),
            "total_amount": round(total, 2)
        })

    org_name = ctx.organization.name if ctx.organization else "N/A"
    org_tax_id = ctx.organization.tax_id if ctx.organization else "N/A"

    return {
        "report_type": report_type,
        "report_name": "Cuentas por Pagar (CXP)" if report_type == "ap" else "Cuentas por Cobrar (CXC)",
        "org_name": org_name,
        "org_tax_id": org_tax_id,
        "generated_at": now_str,
        "headers": [
            "NCF / Número",
            "Proveedor" if report_type == "ap" else "Cliente",
            "RNC / Identificación",
            "Fecha Emisión",
            "Fecha Vencimiento",
            "Días Vencidos",
            "Estado",
            "Monto Facturado",
            "ITBIS",
            "Total Pendiente"
        ],
        "rows": rows,
        "totals": {
            "base_amount": round(total_base, 2),
            "tax_amount": round(total_tax, 2),
            "total_amount": round(total_amount, 2)
        }
    }


@router.get("/ap-ar/export")
async def export_ap_ar(
    report_type: str = Query(..., pattern="^(ap|ar)$"),
    format: str = Query(..., pattern="^(xlsx|csv|txt)$"),
    ctx: TenantContext = Depends(require_tenant),
):
    """
    Genera y descarga el reporte de cuentas por pagar (ap) o por cobrar (ar)
    en el formato indicado (xlsx, csv, txt).
    """
    transaction_type = "expense" if report_type == "ap" else "income"

    invoices = (
        ctx.db.query(Invoice)
        .filter(
            Invoice.tenant_id == ctx.tenant_id,
            Invoice.organization_id == ctx.org_id,
            Invoice.transaction_type == transaction_type,
            Invoice.payment_condition == "credito",
            Invoice.payment_status != "paid",
            Invoice.is_deleted.is_(False),
            Invoice.cancelled_at.is_(None),
            Invoice.status != "voided",
        )
        .order_by(desc(Invoice.due_date), desc(Invoice.invoice_date))
        .all()
    )

    try:
        output_bytes = export_service.export_ap_ar(
            invoices=invoices,
            organization=ctx.organization,
            report_type=report_type,
            format_type=format
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando reporte: {str(e)}")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_slug = "cxp" if report_type == "ap" else "cxc"

    if format == "xlsx":
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = f"reporte_{report_slug}_{timestamp}.xlsx"
    elif format == "csv":
        media_type = "text/csv"
        filename = f"reporte_{report_slug}_{timestamp}.csv"
    else:  # txt
        media_type = "text/plain"
        filename = f"reporte_{report_slug}_{timestamp}.txt"

    return StreamingResponse(
        io.BytesIO(output_bytes),
        media_type=media_type,
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )
