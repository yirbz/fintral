import base64
import csv
import io
import json
import logging
import os
import shutil
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, StreamingResponse
from PIL import Image
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Invoice, User

from app.core.container import export_service, openai_processor, webhook_sender
from app.dependencies.tenant import TenantContext, require_tenant
from app.repositories import InvoiceRepository
from app.schemas import BulkActionRequest, ExportRequest, WebhookPushRequest
from app.services import InvoiceProcessingService

logger = logging.getLogger(__name__)
router = APIRouter()
invoice_repo = InvoiceRepository()
processing_service = InvoiceProcessingService(
    invoice_repo=invoice_repo,
    openai_processor=openai_processor,
    webhook_sender=webhook_sender,
)

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff"}
ALLOWED_PDF_EXTENSIONS = {".pdf"}
ALLOWED_EXTENSIONS = ALLOWED_IMAGE_EXTENSIONS | ALLOWED_PDF_EXTENSIONS


def get_file_type(filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    if ext in ALLOWED_IMAGE_EXTENSIONS:
        return "image"
    if ext in ALLOWED_PDF_EXTENSIONS:
        return "pdf"
    raise ValueError(f"Tipo de archivo no permitido: {ext}")


def optimize_image(image_path: str, max_width: int = 800, quality: int = 85) -> Optional[str]:
    try:
        with Image.open(image_path) as img:
            if img.mode in ("RGBA", "LA", "P"):
                img = img.convert("RGB")

            if img.width > max_width:
                ratio = max_width / img.width
                img = img.resize((max_width, int(img.height * ratio)), Image.Resampling.LANCZOS)

            buffer = io.BytesIO()
            img.save(buffer, format="JPEG", quality=quality, optimize=True)
            img_data = base64.b64encode(buffer.getvalue()).decode()
            return f"data:image/jpeg;base64,{img_data}"
    except Exception as exc:  # noqa: BLE001
        logger.error("Error optimizando imagen: %s", exc)
        return None


@router.get("/test-invoice/{invoice_id}")
async def test_invoice(invoice_id: str):
    return {"test": "working", "invoice_id": invoice_id}


@router.get("/invoice/{invoice_id}")
async def invoice_detail_json(
    invoice_id: str,
    ctx: TenantContext = Depends(require_tenant),
):
    invoice = invoice_repo.get(ctx.db, invoice_id, ctx.tenant_id, ctx.org_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    return {"invoice": invoice.to_dict(), "status": "success"}


@router.get("/invoice/{invoice_id}/view", response_class=HTMLResponse)
async def invoice_detail_view(
    invoice_id: str,
    ctx: TenantContext = Depends(require_tenant),
):
    invoice = invoice_repo.get(ctx.db, invoice_id, ctx.tenant_id, ctx.org_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    return RedirectResponse(url=f"/app/invoices/{invoice_id}", status_code=307)


@router.post("/upload")
async def upload_files(
    files: list[UploadFile] = File(...),
    category: Optional[str] = Form(None),
    transaction_type: Optional[str] = Form(None),
    ctx: TenantContext = Depends(require_tenant),
):
    from app.services.websocket import websocket_manager

    results: list[dict] = []

    for file in files:
        try:
            file_ext = os.path.splitext(file.filename)[1].lower()
            if file_ext not in ALLOWED_EXTENSIONS:
                results.append(
                    {
                        "filename": file.filename,
                        "success": False,
                        "error": f"Tipo de archivo no permitido: {file_ext}",
                    }
                )
                continue

            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            safe_filename = f"{timestamp}_{file.filename}"
            file_path = os.path.join("uploads", safe_filename)

            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            invoice = Invoice(
                tenant_id=ctx.tenant_id,
                organization_id=ctx.org_id,
                filename=file.filename,
                file_path=file_path,
                file_type=get_file_type(file.filename),
                category=category or None,
                transaction_type=transaction_type or None,
                processed=False,
            )
            invoice_repo.create(ctx.db, invoice)

            results.append(
                {
                    "filename": file.filename,
                    "success": True,
                    "invoice_id": str(invoice.id),
                    "message": "Archivo subido correctamente",
                }
            )

            await websocket_manager.notify_new_invoice_upload(str(invoice.id), file.filename, str(ctx.org_id))

        except Exception as exc:  # noqa: BLE001
            results.append({"filename": file.filename, "success": False, "error": str(exc)})

    return {"results": results}


@router.post("/process/{invoice_id}")
async def process_invoice(
    invoice_id: str,
    ctx: TenantContext = Depends(require_tenant),
):
    invoice = invoice_repo.get_with_lock(ctx.db, invoice_id, ctx.tenant_id, ctx.org_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    result = await processing_service.process_invoice_record(
        ctx.db, invoice, ctx.tenant_id, ctx.org_id, user_id=ctx.user.id,
    )

    if result["status"] == "already_processed":
        return {"message": "Factura ya procesada", "invoice": invoice.to_dict()}

    if result["status"] == "error":
        return JSONResponse(
            status_code=400,
            content={
                "message": "Error al procesar la factura",
                "error": result["error"],
            },
        )

    return {
        "message": "Factura procesada exitosamente",
        "invoice": result["invoice"].to_dict(),
        "extracted_data": result["extracted_data"],
    }


@router.get("/invoices")
async def get_invoices(
    skip: int = 0,
    limit: int = 100,
    transaction_type: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    processed: Optional[str] = None,
    ctx: TenantContext = Depends(require_tenant),
):
    processed_bool = None
    if processed is not None:
        processed_bool = str(processed).lower() == "true"

    invoices, total = invoice_repo.list_for_org(
        ctx.db,
        tenant_id=ctx.tenant_id,
        org_id=ctx.org_id,
        skip=skip,
        limit=limit,
        transaction_type=transaction_type,
        category=category,
        search=search,
        processed=processed_bool,
    )

    return {
        "invoices": [invoice.to_dict() for invoice in invoices],
        "total": total,
    }


@router.get("/invoices/{invoice_id}")
async def get_invoice(
    invoice_id: str,
    ctx: TenantContext = Depends(require_tenant),
):
    invoice = invoice_repo.get(ctx.db, invoice_id, ctx.tenant_id, ctx.org_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    return invoice.to_dict()


@router.get("/invoice/{invoice_id}/optimized-image")
async def get_optimized_image(
    invoice_id: str,
    ctx: TenantContext = Depends(require_tenant),
):
    invoice = invoice_repo.get(ctx.db, invoice_id, ctx.tenant_id, ctx.org_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    if invoice.file_type != "image":
        raise HTTPException(status_code=400, detail="La factura no es una imagen")
    if not os.path.exists(invoice.file_path):
        raise HTTPException(status_code=404, detail="Archivo de imagen no encontrado")

    optimized_data = optimize_image(invoice.file_path)
    if not optimized_data:
        raise HTTPException(status_code=500, detail="Error al optimizar imagen")

    return {"optimized_image": optimized_data}


@router.put("/invoices/{invoice_id}")
async def update_invoice(
    invoice_id: str,
    invoice_data: dict,
    ctx: TenantContext = Depends(require_tenant),
):
    invoice = invoice_repo.get(ctx.db, invoice_id, ctx.tenant_id, ctx.org_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    updateable_fields = [
        "vendor_name",
        "invoice_number",
        "total_amount",
        "tax_amount",
        "currency",
        "transaction_type",
        "category",
        "description",
        "vendor_country",
        "vendor_tax_id",
        "vendor_fiscal_address",
        "goods_services_type",
    ]
    for field in updateable_fields:
        if field in invoice_data:
            setattr(invoice, field, invoice_data[field])

    if "invoice_date" in invoice_data:
        try:
            invoice.invoice_date = datetime.strptime(invoice_data["invoice_date"], "%Y-%m-%d")
        except Exception:  # noqa: BLE001
            pass

    invoice.updated_at = datetime.utcnow()
    ctx.db.commit()
    ctx.db.refresh(invoice)
    return invoice.to_dict()


@router.delete("/invoices/{invoice_id}")
async def delete_invoice(
    invoice_id: str,
    ctx: TenantContext = Depends(require_tenant),
):
    invoice = invoice_repo.get(ctx.db, invoice_id, ctx.tenant_id, ctx.org_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    if invoice.file_path and os.path.exists(invoice.file_path):
        os.remove(invoice.file_path)

    ctx.db.delete(invoice)
    ctx.db.commit()
    return {"message": "Factura eliminada exitosamente"}


@router.post("/api/invoices/bulk-delete")
async def bulk_delete_invoices(
    action: BulkActionRequest,
    ctx: TenantContext = Depends(require_tenant),
):
    if not action.invoice_ids:
        return {"message": "No se seleccionaron facturas", "count": 0}

    invoices = invoice_repo.list_by_ids(ctx.db, action.invoice_ids, ctx.tenant_id, ctx.org_id)

    count = 0
    for invoice in invoices:
        try:
            if invoice.file_path and os.path.exists(invoice.file_path):
                os.remove(invoice.file_path)
            ctx.db.delete(invoice)
            count += 1
        except Exception as exc:  # noqa: BLE001
            logger.warning("Error eliminando factura %s: %s", invoice.id, exc)

    ctx.db.commit()
    return {"message": "Facturas eliminadas exitosamente", "count": count}


@router.post("/api/invoices/bulk-process")
async def bulk_process_invoices(
    action: BulkActionRequest,
    ctx: TenantContext = Depends(require_tenant),
):
    if not action.invoice_ids:
        return {"message": "No se seleccionaron facturas", "count": 0}

    invoices = invoice_repo.list_pending_by_ids(ctx.db, action.invoice_ids, ctx.tenant_id, ctx.org_id)
    success_count, errors = await processing_service.bulk_process(
        ctx.db, invoices, ctx.tenant_id, ctx.org_id, user_id=ctx.user.id,
    )

    return {
        "message": f"Procesamiento completado. {success_count} exitosos.",
        "success_count": success_count,
        "errors": errors,
    }


@router.post("/api/invoices/export")
async def export_invoices(
    action: ExportRequest,
    ctx: TenantContext = Depends(require_tenant),
):
    if not action.invoice_ids:
        raise HTTPException(status_code=400, detail="No se seleccionaron facturas")

    invoices = invoice_repo.list_by_ids(ctx.db, action.invoice_ids, ctx.tenant_id, ctx.org_id)
    if not invoices:
        raise HTTPException(status_code=404, detail="No se encontraron facturas")

    output = ""
    timestamp = datetime.now().strftime("%Y%m%d%H%M")
    filename = f"export_{action.format}_{timestamp}"
    media_type = "text/csv"

    try:
        if action.format == "quickbooks":
            output = export_service.export_quickbooks(invoices)
            filename += ".csv"
        elif action.format == "quickbooks_bills":
            output = export_service.export_quickbooks_bills(invoices)
            filename += ".csv"
        elif action.format == "xero":
            output = export_service.export_xero_bills(invoices)
            filename += ".csv"
        elif action.format == "odoo":
            output = export_service.export_odoo_vendor_bills(invoices)
            filename += ".csv"
        elif action.format == "contaplus":
            output = export_service.export_contaplus(invoices)
            filename += ".csv"
        elif action.format == "json":
            output = export_service.export_json(invoices)
            media_type = "application/json"
            filename += ".json"
        elif action.format == "dgii_606":
            report_rnc = ctx.organization.tax_id or None
            output = export_service.export_dgii_606(invoices, report_rnc=report_rnc)
            media_type = "application/vnd.ms-excel"
            filename += ".xls"
        elif action.format == "excel":
            output = export_service.export_excel_generic(invoices)
            media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            filename += ".xlsx"
        else:
            output = export_service.export_csv_generic(invoices)
            filename += ".csv"

        if media_type in [
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel",
        ]:
            return StreamingResponse(
                io.BytesIO(output),
                media_type=media_type,
                headers={"Content-Disposition": f"attachment; filename={filename}"},
            )

        return StreamingResponse(
            io.StringIO(output),
            media_type=media_type,
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )

    except Exception as exc:  # noqa: BLE001
        logger.error("Error exporting: %s", exc)
        raise HTTPException(status_code=500, detail=f"Error generando exportación: {exc}") from exc


@router.post("/api/invoices/push-webhook")
async def push_invoices_webhook(
    payload: WebhookPushRequest,
    ctx: TenantContext = Depends(require_tenant),
):
    if not payload.invoice_ids:
        raise HTTPException(status_code=400, detail="No se seleccionaron facturas")

    invoices = invoice_repo.list_by_ids(ctx.db, payload.invoice_ids, ctx.tenant_id, ctx.org_id)
    if not invoices:
        raise HTTPException(status_code=404, detail="No se encontraron facturas")

    data = {
        "count": len(invoices),
        "invoices": [inv.to_dict() for inv in invoices],
    }
    result = webhook_sender.trigger_event(
        ctx.db, payload.event, data, tenant_id=ctx.tenant_id, org_id=ctx.org_id,
    )
    return {"status": "sent", "result": result}


@router.get("/export/csv")
async def export_invoices_csv(
    transaction_type: Optional[str] = None,
    category: Optional[str] = None,
    format: Optional[str] = None,
    invoice_ids: Optional[str] = None,
    ctx: TenantContext = Depends(require_tenant),
):
    query = ctx.db.query(Invoice).filter(
        Invoice.tenant_id == ctx.tenant_id,
        Invoice.organization_id == ctx.org_id,
    )

    if transaction_type:
        query = query.filter(Invoice.transaction_type == transaction_type)
    if category:
        query = query.filter(Invoice.category == category)
    if invoice_ids:
        ids = [x.strip() for x in invoice_ids.split(",") if x.strip()]
        if ids:
            query = query.filter(Invoice.id.in_(ids))

    invoices = query.order_by(desc(Invoice.created_at)).all()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    if format == "dgii_606":
        report_rnc = ctx.organization.tax_id or None
        output = export_service.export_dgii_606(invoices, report_rnc=report_rnc)
        filename = f"dgii_606_{timestamp}.xls"
        return StreamingResponse(
            io.BytesIO(output),
            media_type="application/vnd.ms-excel",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )

    if format == "quickbooks_bills":
        output = export_service.export_quickbooks_bills(invoices)
        filename = f"quickbooks_bills_{timestamp}.csv"
        return StreamingResponse(
            io.StringIO(output),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )

    if format == "xero":
        output = export_service.export_xero_bills(invoices)
        filename = f"xero_bills_{timestamp}.csv"
        return StreamingResponse(
            io.StringIO(output),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )

    if format == "odoo":
        output = export_service.export_odoo_vendor_bills(invoices)
        filename = f"odoo_vendor_bills_{timestamp}.csv"
        return StreamingResponse(
            io.StringIO(output),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )

    if format == "excel":
        output = export_service.export_excel_generic(invoices)
        filename = f"facturas_export_{timestamp}.xlsx"
        return StreamingResponse(
            io.BytesIO(output),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )

    output = io.StringIO()
    writer = csv.writer(output)

    headers = [
        "ID",
        "Archivo",
        "Proveedor",
        "Número de Factura",
        "Fecha de Factura",
        "Monto Total",
        "Monto de Impuestos",
        "Moneda",
        "Tipo de Transacción",
        "Categoría",
        "Descripción",
        "Procesado",
        "Confianza IA (%)",
        "Tipo de Archivo",
        "Fecha de Creación",
        "Última Actualización",
    ]
    writer.writerow(headers)

    for invoice in invoices:
        writer.writerow(
            [
                str(invoice.id),
                invoice.filename or "",
                invoice.vendor_name or "",
                invoice.invoice_number or "",
                invoice.invoice_date.strftime("%Y-%m-%d") if invoice.invoice_date else "",
                invoice.total_amount or "",
                invoice.tax_amount or "",
                invoice.currency or "",
                "Ingreso" if invoice.transaction_type == "income" else "Gasto" if invoice.transaction_type == "expense" else "",
                invoice.category or "",
                invoice.description or "",
                "Sí" if invoice.processed else "No",
                f"{round((invoice.confidence_score or 0) * 100, 2)}" if invoice.confidence_score else "",
                invoice.file_type or "",
                invoice.created_at.strftime("%Y-%m-%d %H:%M:%S") if invoice.created_at else "",
                invoice.updated_at.strftime("%Y-%m-%d %H:%M:%S") if invoice.updated_at else "",
            ]
        )

    output.seek(0)
    filename = f"facturas_export_{timestamp}.csv"

    def iter_csv():
        yield output.getvalue().encode("utf-8-sig")

    return StreamingResponse(
        iter_csv(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
