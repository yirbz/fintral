import csv
import json
import logging
import os
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
import io
from sqlalchemy import desc

from app.models import DgiiSubmission, Invoice, InvoiceDgiiStatus

from app.config import SUPABASE_URL
from app.core.container import export_service, openai_processor, webhook_sender
from app.dependencies.tenant import TenantContext, require_tenant
from app.repositories import InvoiceRepository
from app.schemas import BulkActionRequest, CancelInvoiceRequest, ExportRequest, ManualInvoiceCreate, WebhookPushRequest
from app.services import InvoiceProcessingService
from app.services.pipeline.image_preprocessor import image_preprocessor
from app.services.supabase_storage import (
    INVOICES_PREFIX,
    delete_file as supabase_delete,
    delete_invoice_folder,
    resolve_invoice_path,
    upload_invoice_file,
)

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
ALLOWED_XML_EXTENSIONS = {".xml"}
ALLOWED_XLSX_EXTENSIONS = {".xlsx", ".xls"}
ALLOWED_EXTENSIONS = ALLOWED_IMAGE_EXTENSIONS | ALLOWED_PDF_EXTENSIONS | ALLOWED_XML_EXTENSIONS | ALLOWED_XLSX_EXTENSIONS


def get_file_type(filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    if ext in ALLOWED_IMAGE_EXTENSIONS:
        return "image"
    if ext in ALLOWED_PDF_EXTENSIONS:
        return "pdf"
    if ext in ALLOWED_XML_EXTENSIONS:
        return "xml"
    if ext in ALLOWED_XLSX_EXTENSIONS:
        return "xlsx"
    raise ValueError(f"Tipo de archivo no permitido: {ext}")


def _normalize_ncf(value: Optional[str]) -> str:
    return (value or "").strip().upper()


def _expected_dgii_format(invoice: Invoice) -> Optional[str]:
    if invoice.cancelled_at:
        return "608"
    if invoice.transaction_type == "income":
        return "607"
    if invoice.transaction_type == "expense":
        return "606"
    return None


def _snapshot_ncf(snapshot: Any) -> str:
    payload = snapshot
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except (json.JSONDecodeError, TypeError):
            payload = None
    if isinstance(payload, dict):
        return _normalize_ncf(payload.get("ncf"))
    return ""


def _load_confirmed_ncf_sets(ctx: TenantContext) -> dict[str, set[str]]:
    rows = (
        ctx.db.query(
            InvoiceDgiiStatus.format,
            InvoiceDgiiStatus.report_snapshot,
            Invoice.invoice_number,
        )
        .join(DgiiSubmission, DgiiSubmission.id == InvoiceDgiiStatus.submission_id)
        .outerjoin(Invoice, Invoice.id == InvoiceDgiiStatus.invoice_id)
        .filter(
            DgiiSubmission.tenant_id == ctx.tenant_id,
            DgiiSubmission.organization_id == ctx.org_id,
            InvoiceDgiiStatus.status == "reported",
            DgiiSubmission.status.in_(["confirmed", "partial_error"]),
        )
        .all()
    )

    confirmed_by_format: dict[str, set[str]] = {
        "606": set(),
        "607": set(),
        "608": set(),
    }
    for fmt, snapshot, invoice_number in rows:
        if fmt not in confirmed_by_format:
            continue
        ncf = _snapshot_ncf(snapshot) or _normalize_ncf(invoice_number)
        if ncf:
            confirmed_by_format[fmt].add(ncf)
    return confirmed_by_format


def _load_latest_invoice_statuses(
    ctx: TenantContext,
    invoice_ids: list[Any],
) -> dict[str, dict[str, dict[str, Optional[str]]]]:
    if not invoice_ids:
        return {}

    rows = (
        ctx.db.query(
            InvoiceDgiiStatus.invoice_id,
            InvoiceDgiiStatus.format,
            InvoiceDgiiStatus.status,
            DgiiSubmission.status.label("submission_status"),
            InvoiceDgiiStatus.updated_at,
            InvoiceDgiiStatus.created_at,
        )
        .outerjoin(DgiiSubmission, DgiiSubmission.id == InvoiceDgiiStatus.submission_id)
        .filter(InvoiceDgiiStatus.invoice_id.in_(invoice_ids))
        .order_by(InvoiceDgiiStatus.updated_at.desc(), InvoiceDgiiStatus.created_at.desc())
        .all()
    )

    by_invoice: dict[str, dict[str, dict[str, Optional[str]]]] = {}
    for row in rows:
        invoice_id = str(row.invoice_id)
        fmt = row.format
        fmt_map = by_invoice.setdefault(invoice_id, {})
        if fmt in fmt_map:
            continue
        fmt_map[fmt] = {
            "status": row.status,
            "submission_status": row.submission_status,
        }
    return by_invoice


def _build_invoice_dgii_status(
    invoice: Invoice,
    latest_statuses: dict[str, dict[str, dict[str, Optional[str]]]],
    confirmed_ncfs_by_format: dict[str, set[str]],
) -> dict[str, Any]:
    fmt = _expected_dgii_format(invoice)
    if not fmt:
        return {
            "format": None,
            "status": "not_applicable",
            "label": "Sin formato DGII",
            "tone": "slate",
            "locked": False,
        }

    ncf = _normalize_ncf(invoice.invoice_number)
    if ncf and ncf in confirmed_ncfs_by_format.get(fmt, set()):
        return {
            "format": fmt,
            "status": "confirmed_ncf",
            "label": "Confirmada DGII",
            "tone": "indigo",
            "locked": True,
        }

    status_payload = (latest_statuses.get(str(invoice.id)) or {}).get(fmt)
    if status_payload:
        sub_status = status_payload.get("submission_status")
        inv_status = status_payload.get("status")
        if sub_status == "pending_upload":
            return {
                "format": fmt,
                "status": "pending_upload",
                "label": "Pendiente envío DGII",
                "tone": "sky",
                "locked": False,
            }
        if sub_status == "pending_confirm":
            return {
                "format": fmt,
                "status": "pending_confirm",
                "label": "Pendiente confirmación DGII",
                "tone": "amber",
                "locked": False,
            }
        if inv_status == "error":
            return {
                "format": fmt,
                "status": "error",
                "label": "Error DGII",
                "tone": "red",
                "locked": False,
            }
        if inv_status == "excluded":
            return {
                "format": fmt,
                "status": "excluded",
                "label": "Excluida DGII",
                "tone": "slate",
                "locked": False,
            }
        if inv_status == "reported":
            return {
                "format": fmt,
                "status": "reported",
                "label": "Reportada DGII",
                "tone": "emerald",
                "locked": False,
            }

    if not invoice.processed:
        return {
            "format": fmt,
            "status": "pending_processing",
            "label": "Pendiente procesamiento",
            "tone": "slate",
            "locked": False,
        }

    return {
        "format": fmt,
        "status": "unreported",
        "label": "Pendiente reporte DGII",
        "tone": "amber",
        "locked": False,
    }


def _serialize_invoices_with_dgii_status(ctx: TenantContext, invoices: list[Invoice]) -> list[dict[str, Any]]:
    invoice_ids = [invoice.id for invoice in invoices]
    latest_statuses = _load_latest_invoice_statuses(ctx, invoice_ids)
    confirmed_ncfs_by_format = _load_confirmed_ncf_sets(ctx)

    payload: list[dict[str, Any]] = []
    for invoice in invoices:
        data = invoice.to_dict()
        data["dgii_status"] = _build_invoice_dgii_status(
            invoice=invoice,
            latest_statuses=latest_statuses,
            confirmed_ncfs_by_format=confirmed_ncfs_by_format,
        )
        payload.append(data)
    return payload


@router.get("/test-invoice/{invoice_id}")
async def test_invoice(invoice_id: str):
    return {"test": "working", "invoice_id": invoice_id}


@router.get("/invoice/{invoice_id}")
async def invoice_detail_json(
    invoice_id: str,
    ctx: TenantContext = Depends(require_tenant),
):
    invoice = invoice_repo.get_including_trashed(ctx.db, invoice_id, ctx.tenant_id, ctx.org_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    payload = _serialize_invoices_with_dgii_status(ctx, [invoice])[0]
    return {"invoice": payload, "status": "success"}


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

    logger.info("Upload request: %d file(s), org=%s, tenant=%s, category=%s, transaction_type=%s",
                len(files), ctx.org_id, ctx.tenant_id, category, transaction_type)

    results: list[dict] = []

    for file in files:
        try:
            file_ext = os.path.splitext(file.filename)[1].lower()
            logger.info("Processing file: %s (ext=%s)", file.filename, file_ext)

            if file_ext not in ALLOWED_EXTENSIONS:
                logger.warning("File rejected: %s — extension '%s' not allowed", file.filename, file_ext)
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
            file_data = file.file.read()
            file_type = get_file_type(file.filename)
            logger.info("File read: %s (type=%s, size=%d bytes)", file.filename, file_type, len(file_data))

            invoice = Invoice(
                tenant_id=ctx.tenant_id,
                organization_id=ctx.org_id,
                filename=safe_filename,
                file_path=safe_filename,
                file_type=file_type,
                category=category or None,
                transaction_type=transaction_type or None,
                processed=False,
            )
            invoice_repo.create(ctx.db, invoice)
            ctx.db.flush()

            if SUPABASE_URL:
                original_ext = file_ext.lstrip(".")
                original_path = upload_invoice_file(
                    file_data,
                    ctx.tenant_id,
                    ctx.org_id,
                    invoice.id,
                    "original",
                    original_ext,
                    content_type=file.content_type,
                )
                if not original_path:
                    logger.error("Upload failed for %s — storage upload returned None (check Supabase config/permissions)", file.filename)
                    results.append({
                        "filename": file.filename,
                        "success": False,
                        "error": "Error al subir a storage",
                    })
                    ctx.db.rollback()
                    continue

                if file_type == "image":
                    processed_path = None
                    try:
                        processed_pil, quality = image_preprocessor.preprocess_bytes(
                            file_data,
                        )
                        processed_buffer = io.BytesIO()
                        processed_pil.save(processed_buffer, format="JPEG", quality=95)
                        processed_data = processed_buffer.getvalue()
                        processed_path = upload_invoice_file(
                            processed_data,
                            ctx.tenant_id,
                            ctx.org_id,
                            invoice.id,
                            "processed",
                            "jpg",
                            content_type="image/jpeg",
                        )
                        invoice.quality_report = json.dumps({
                            "blur_score": quality.blur_score,
                            "brightness": quality.brightness,
                            "contrast": quality.contrast,
                            "text_density": quality.text_density,
                            "has_glare": quality.has_glare,
                            "is_too_dark": quality.is_too_dark,
                            "is_too_bright": quality.is_too_bright,
                            "ocr_readiness": quality.readiness_label,
                            "warnings": quality.warnings,
                        })
                    except Exception as exc:
                        logger.warning("Could not preprocess image at upload: %s", exc)

                    invoice.file_path = original_path
                    invoice.processed_path = processed_path
                else:
                    invoice.file_path = original_path

            ctx.db.commit()

            logger.info("Invoice created: id=%s, filename=%s, file_type=%s, category=%s, storage_path=%s",
                        invoice.id, safe_filename, file_type, category, invoice.file_path)

            results.append(
                {
                    "filename": file.filename,
                    "success": True,
                    "invoice_id": str(invoice.id),
                    "message": "Archivo subido correctamente",
                }
            )

            await websocket_manager.notify_new_invoice_upload(
                str(invoice.id), file.filename,
                org_id=str(ctx.org_id), tenant_id=str(ctx.tenant_id),
            )

        except Exception as exc:  # noqa: BLE001
            logger.error("Upload error: %s", exc)
            results.append({"filename": file.filename, "success": False, "error": str(exc)})

    return {"results": results}


@router.post("/process/{invoice_id}")
async def process_invoice(
    invoice_id: str,
    ctx: TenantContext = Depends(require_tenant),
):
    try:
        invoice = invoice_repo.get_with_lock(ctx.db, invoice_id, ctx.tenant_id, ctx.org_id)
        if not invoice:
            raise HTTPException(status_code=404, detail="Factura no encontrada")

        result = await processing_service.process_invoice_record(
            ctx.db, invoice, ctx.tenant_id, ctx.org_id, user_id=ctx.user.id,
        )

        if result["status"] == "already_processed":
            return {"message": "Factura ya procesada", "invoice": invoice.to_dict()}

        if result["status"] == "error":
            # Return 200 with error details in body instead of 400.
            # The invoice record already exists and data may have been
            # partially extracted — a hard HTTP error causes the frontend
            # to discard everything.
            invoice_dict = invoice.to_dict()
            return {
                "message": "Procesamiento completado con advertencias",
                "status": "partial",
                "error": result.get("error"),
                "invoice": invoice_dict,
                "extracted_data": result.get("extracted_data", {}),
            }

        return {
            "message": "Factura procesada exitosamente",
            "invoice": result["invoice"].to_dict(),
            "extracted_data": result["extracted_data"],
            "duplicate_ncf": result.get("duplicate_ncf"),
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error inesperado procesando factura %s", invoice_id)
        raise HTTPException(
            status_code=500,
            detail="Ocurrió un error inesperado al procesar la factura. Intenta de nuevo en unos minutos.",
        )


@router.get("/invoices")
async def get_invoices(
    skip: int = 0,
    limit: int = 100,
    transaction_type: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    processed: Optional[str] = None,
    quality: Optional[str] = None,
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
        quality=quality,
    )

    return {
        "invoices": _serialize_invoices_with_dgii_status(ctx, invoices),
        "total": total,
    }


@router.get("/invoices/trash")
async def list_trashed_invoices(
    skip: int = 0,
    limit: int = 100,
    ctx: TenantContext = Depends(require_tenant),
):
    invoices, total = invoice_repo.list_trashed(
        ctx.db,
        tenant_id=ctx.tenant_id,
        org_id=ctx.org_id,
        skip=skip,
        limit=limit,
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
    invoice = invoice_repo.get_including_trashed(ctx.db, invoice_id, ctx.tenant_id, ctx.org_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    return _serialize_invoices_with_dgii_status(ctx, [invoice])[0]


@router.get("/invoice/{invoice_id}/optimized-image")
async def get_optimized_image(
    invoice_id: str,
    processed: bool = False,
    ctx: TenantContext = Depends(require_tenant),
):
    invoice = invoice_repo.get_including_trashed(ctx.db, invoice_id, ctx.tenant_id, ctx.org_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    if invoice.file_type != "image":
        raise HTTPException(status_code=400, detail="La factura no es una imagen")

    from app.services.supabase_storage import optimize_image_from_storage
    target_path = resolve_invoice_path(invoice, variant="processed" if processed else "original")
    if not target_path:
        target_path = resolve_invoice_path(invoice, variant="original")
    optimized_data = optimize_image_from_storage(target_path)

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


@router.post("/invoices")
async def create_manual_invoice(
    payload: ManualInvoiceCreate,
    ctx: TenantContext = Depends(require_tenant),
):
    invoice_date = None
    if payload.invoice_date:
        try:
            invoice_date = datetime.strptime(payload.invoice_date, "%Y-%m-%d")
        except Exception:  # noqa: BLE001
            pass

    line_items_data = None
    if payload.line_items:
        line_items_data = json.dumps(
            [item.model_dump() for item in payload.line_items]
        )

    invoice = Invoice(
        tenant_id=ctx.tenant_id,
        organization_id=ctx.org_id,
        filename=f"manual_{payload.invoice_number}_{datetime.now().strftime('%Y%m%d%H%M%S')}",
        file_type="manual",
        vendor_name=payload.vendor_name,
        invoice_number=payload.invoice_number,
        invoice_date=invoice_date,
        total_amount=payload.total_amount,
        tax_amount=payload.tax_amount,
        currency=payload.currency,
        transaction_type=payload.transaction_type,
        category=payload.category,
        description=payload.description,
        vendor_tax_id=payload.vendor_tax_id,
        vendor_country=payload.vendor_country,
        goods_services_type=payload.goods_services_type,
        line_items_data=line_items_data,
        source_type="manual",
        processed=True,
        confidence_score=1.0,
    )
    invoice_repo.create(ctx.db, invoice)
    return invoice.to_dict()


@router.delete("/invoices/{invoice_id}")
async def delete_invoice(
    invoice_id: str,
    ctx: TenantContext = Depends(require_tenant),
):
    invoice = invoice_repo.get(ctx.db, invoice_id, ctx.tenant_id, ctx.org_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    invoice.deleted_at = datetime.utcnow()
    invoice.deleted_by = ctx.user.id
    ctx.db.commit()
    logger.info("Invoice moved to trash: id=%s, filename=%s, user=%s", invoice_id, invoice.filename, ctx.user.id)
    return {"message": "Factura movida a la papelera"}


@router.post("/api/invoices/bulk-delete")
async def bulk_delete_invoices(
    action: BulkActionRequest,
    ctx: TenantContext = Depends(require_tenant),
):
    if not action.invoice_ids:
        return {"message": "No se seleccionaron facturas", "count": 0}

    invoices = invoice_repo.list_by_ids(ctx.db, action.invoice_ids, ctx.tenant_id, ctx.org_id)

    now = datetime.utcnow()
    count = 0
    for invoice in invoices:
        invoice.deleted_at = now
        invoice.deleted_by = ctx.user.id
        count += 1

    ctx.db.commit()
    return {"message": "Facturas movidas a la papelera", "count": count}


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


@router.post("/invoices/{invoice_id}/restore")
async def restore_invoice(
    invoice_id: str,
    ctx: TenantContext = Depends(require_tenant),
):
    invoice = invoice_repo.get_including_trashed(ctx.db, invoice_id, ctx.tenant_id, ctx.org_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    if not invoice.deleted_at:
        raise HTTPException(status_code=400, detail="La factura no está en la papelera")

    invoice.deleted_at = None
    invoice.deleted_by = None
    ctx.db.commit()
    ctx.db.refresh(invoice)
    return {"message": "Factura restaurada exitosamente", "invoice": invoice.to_dict()}


@router.delete("/invoices/{invoice_id}/permanent")
async def permanent_delete_invoice(
    invoice_id: str,
    ctx: TenantContext = Depends(require_tenant),
):
    invoice = invoice_repo.get_including_trashed(ctx.db, invoice_id, ctx.tenant_id, ctx.org_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    logger.info("Permanent delete requested: id=%s, filename=%s, file_path=%s, processed_path=%s",
                invoice_id, invoice.filename, invoice.file_path, invoice.processed_path)

    storage_ok = True
    if invoice.file_path and INVOICES_PREFIX in invoice.file_path:
        logger.info("Deleting storage folder for invoice %s (tenant=%s, org=%s)",
                    invoice.id, ctx.tenant_id, ctx.org_id)
        if not delete_invoice_folder(ctx.tenant_id, ctx.org_id, invoice.id):
            logger.error("Storage folder deletion FAILED for invoice %s", invoice.id)
            storage_ok = False
    elif invoice.file_path:
        logger.info("Deleting individual storage file: %s", invoice.file_path)
        if not supabase_delete(invoice.file_path):
            logger.error("File deletion FAILED: %s", invoice.file_path)
            storage_ok = False
        if invoice.processed_path:
            logger.info("Deleting processed file: %s", invoice.processed_path)
            if not supabase_delete(invoice.processed_path):
                logger.error("Processed file deletion FAILED: %s", invoice.processed_path)
                storage_ok = False

    if not storage_ok and (invoice.file_path or invoice.processed_path):
        logger.error("Aborting permanent delete for invoice %s — storage cleanup failed", invoice_id)
        raise HTTPException(status_code=500, detail="Error al eliminar archivos del storage")

    invoice_repo.hard_delete(ctx.db, invoice)
    logger.info("Invoice permanently deleted: id=%s, filename=%s", invoice_id, invoice.filename)
    return {"message": "Factura eliminada permanentemente"}


@router.post("/invoices/{invoice_id}/cancel")
async def cancel_invoice(
    invoice_id: str,
    body: CancelInvoiceRequest,
    ctx: TenantContext = Depends(require_tenant),
):
    invoice = invoice_repo.get(ctx.db, invoice_id, ctx.tenant_id, ctx.org_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    if invoice.cancelled_at:
        raise HTTPException(status_code=400, detail="La factura ya está anulada")

    invoice.cancelled_at = datetime.utcnow()
    invoice.cancellation_type = body.cancellation_type or "01"
    ctx.db.commit()
    ctx.db.refresh(invoice)
    return {"message": "Factura anulada exitosamente", "invoice": invoice.to_dict()}


@router.post("/invoices/{invoice_id}/uncancel")
async def uncancel_invoice(
    invoice_id: str,
    ctx: TenantContext = Depends(require_tenant),
):
    invoice = invoice_repo.get(ctx.db, invoice_id, ctx.tenant_id, ctx.org_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    if not invoice.cancelled_at:
        raise HTTPException(status_code=400, detail="La factura no está anulada")

    invoice.cancelled_at = None
    invoice.cancellation_type = None
    ctx.db.commit()
    ctx.db.refresh(invoice)
    return {"message": "Anulación revertida exitosamente", "invoice": invoice.to_dict()}


@router.post("/api/invoices/bulk-cancel")
async def bulk_cancel_invoices(
    action: BulkActionRequest,
    ctx: TenantContext = Depends(require_tenant),
):
    if not action.invoice_ids:
        return {"message": "No se seleccionaron facturas", "count": 0}

    invoices = invoice_repo.list_by_ids(ctx.db, action.invoice_ids, ctx.tenant_id, ctx.org_id)

    now = datetime.utcnow()
    count = 0
    for invoice in invoices:
        if invoice.cancelled_at:
            continue
        invoice.cancelled_at = now
        invoice.cancellation_type = "01"
        count += 1

    ctx.db.commit()
    return {"message": f"{count} factura(s) anuladas exitosamente", "count": count}


@router.post("/api/invoices/bulk-restore")
async def bulk_restore_invoices(
    action: BulkActionRequest,
    ctx: TenantContext = Depends(require_tenant),
):
    if not action.invoice_ids:
        return {"message": "No se seleccionaron facturas", "count": 0}

    invoices = (
        ctx.db.query(Invoice)
        .filter(
            Invoice.id.in_(action.invoice_ids),
            Invoice.tenant_id == ctx.tenant_id,
            Invoice.organization_id == ctx.org_id,
            Invoice.deleted_at.isnot(None),
        )
        .all()
    )

    count = 0
    for invoice in invoices:
        invoice.deleted_at = None
        invoice.deleted_by = None
        count += 1

    ctx.db.commit()
    return {"message": "Facturas restauradas exitosamente", "count": count}


@router.post("/api/invoices/bulk-permanent-delete")
async def bulk_permanent_delete_invoices(
    action: BulkActionRequest,
    ctx: TenantContext = Depends(require_tenant),
):
    if not action.invoice_ids:
        return {"message": "No se seleccionaron facturas", "count": 0}

    invoices = (
        ctx.db.query(Invoice)
        .filter(
            Invoice.id.in_(action.invoice_ids),
            Invoice.tenant_id == ctx.tenant_id,
            Invoice.organization_id == ctx.org_id,
            Invoice.deleted_at.isnot(None),
        )
        .all()
    )

    errors: list[str] = []
    for invoice in invoices:
        storage_ok = True
        if invoice.file_path and INVOICES_PREFIX in invoice.file_path:
            if not delete_invoice_folder(ctx.tenant_id, ctx.org_id, invoice.id):
                logger.error("Error deleting storage folder for invoice %s", invoice.id)
                storage_ok = False
        elif invoice.file_path:
            if not supabase_delete(invoice.file_path):
                logger.error("Error deleting file for invoice %s: %s", invoice.id, invoice.file_path)
                storage_ok = False
            if invoice.processed_path and not supabase_delete(invoice.processed_path):
                logger.error("Error deleting processed file for invoice %s: %s", invoice.id, invoice.processed_path)
                storage_ok = False

        if storage_ok:
            ctx.db.delete(invoice)
        else:
            errors.append(str(invoice.id))

    ctx.db.commit()

    deleted_count = len(invoices) - len(errors)
    if errors:
        logger.warning("Storage deletion failed for %d invoice(s), DB records preserved", len(errors))
        return {
            "message": f"{deleted_count} factura(s) eliminada(s), {len(errors)} no se pudieron eliminar (error de storage)",
            "count": deleted_count,
            "errors": errors,
        }

    return {"message": "Facturas eliminadas permanentemente", "count": deleted_count}


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


@router.get("/invoices/template")
async def download_invoice_template():
    from app.services.pipeline.xlsx_processor import xlsx_processor

    template_bytes = xlsx_processor.create_template_bytes()
    timestamp = datetime.now().strftime("%Y%m%d")
    filename = f"plantilla_facturas_{timestamp}.xlsx"

    return StreamingResponse(
        io.BytesIO(template_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
