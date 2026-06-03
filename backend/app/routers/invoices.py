import csv
import json
import logging
import os
import re
from datetime import datetime, timedelta
from typing import Any, Optional
from uuid import UUID

from app.services.audit_logger import record
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
import io
from sqlalchemy import desc
from sqlalchemy.orm import Session


from app.models import BankAccount, DgiiSubmission, Invoice, InvoiceDgiiStatus, TenantVendorRule

from app.config import SUPABASE_URL
from app.core.container import export_service, openai_processor, webhook_sender
from app.dependencies.tenant import TenantContext, require_tenant
from app.repositories import InvoiceRepository
from app.schemas import (
    BulkActionRequest,
    CancelInvoiceRequest,
    CreditNoteCreate,
    ExportRequest,
    ManualInvoiceCreate,
    WebhookPushRequest,
)
from app.services import InvoiceProcessingService
from app.services.pipeline.categorizer import DGII_CATEGORY_LABELS, get_dgii_code
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
from app.core.redis import invalidate_stats_cache


ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff"}
ALLOWED_PDF_EXTENSIONS = {".pdf"}
ALLOWED_XML_EXTENSIONS = {".xml"}
ALLOWED_XLSX_EXTENSIONS = {".xlsx", ".xls"}
ALLOWED_EXTENSIONS = (
    ALLOWED_IMAGE_EXTENSIONS | ALLOWED_PDF_EXTENSIONS | ALLOWED_XML_EXTENSIONS | ALLOWED_XLSX_EXTENSIONS
)


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
    if invoice.is_electronic:
        return None
    if invoice.cancelled_at and invoice.transaction_type == "income":
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


def _invoice_snapshot(invoice: Invoice) -> dict[str, Any]:
    return {
        "id": str(invoice.id),
        "tenant_id": str(invoice.tenant_id),
        "organization_id": str(invoice.organization_id),
        "filename": invoice.filename,
        "file_type": invoice.file_type,
        "vendor_name": invoice.vendor_name,
        "invoice_number": invoice.invoice_number,
        "invoice_date": invoice.invoice_date.isoformat() if invoice.invoice_date else None,
        "total_amount": invoice.total_amount,
        "tax_amount": invoice.tax_amount,
        "currency": invoice.currency,
        "transaction_type": invoice.transaction_type,
        "category": invoice.category,
        "description": invoice.description,
        "vendor_country": invoice.vendor_country,
        "vendor_tax_id": invoice.vendor_tax_id,
        "vendor_fiscal_address": invoice.vendor_fiscal_address,
        "goods_services_type": invoice.goods_services_type,
        "source_type": invoice.source_type,
        "processed": invoice.processed,
        "confidence_score": invoice.confidence_score,
        "is_deleted": invoice.is_deleted,
        "deleted_at": invoice.deleted_at.isoformat() if invoice.deleted_at else None,
        "deleted_by": str(invoice.deleted_by) if invoice.deleted_by else None,
        "cancelled_at": invoice.cancelled_at.isoformat() if invoice.cancelled_at else None,
        "cancellation_type": invoice.cancellation_type,
        "is_electronic": invoice.is_electronic,
        "ecf_type": invoice.ecf_type,
        "original_xml_data": invoice.original_xml_data,
    }


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
            "label": "Reportado a DGII",
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

    logger.info(
        "Upload request: %d file(s), org=%s, tenant=%s, category=%s, transaction_type=%s",
        len(files),
        ctx.org_id,
        ctx.tenant_id,
        category,
        transaction_type,
    )

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
            from app.utils.filenames import normalize_filename

            clean_filename = normalize_filename(file.filename or "invoice.jpg")
            safe_filename = f"{timestamp}_{clean_filename}"
            file_data = file.file.read()
            file_type = get_file_type(clean_filename)
            logger.info("File read: %s (type=%s, size=%d bytes)", clean_filename, file_type, len(file_data))

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
                    logger.error(
                        "Upload failed for %s — storage upload returned None (check Supabase config/permissions)",
                        file.filename,
                    )
                    results.append(
                        {
                            "filename": file.filename,
                            "success": False,
                            "error": "Error al subir a storage",
                        }
                    )
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
                        invoice.quality_report = json.dumps(
                            {
                                "blur_score": quality.blur_score,
                                "brightness": quality.brightness,
                                "contrast": quality.contrast,
                                "text_density": quality.text_density,
                                "has_glare": quality.has_glare,
                                "is_too_dark": quality.is_too_dark,
                                "is_too_bright": quality.is_too_bright,
                                "ocr_readiness": quality.readiness_label,
                                "warnings": quality.warnings,
                            }
                        )
                    except Exception as exc:
                        logger.warning("Could not preprocess image at upload: %s", exc)

                    invoice.file_path = original_path
                    invoice.processed_path = processed_path
                else:
                    invoice.file_path = original_path

            ctx.db.commit()

            logger.info(
                "Invoice created: id=%s, filename=%s, file_type=%s, category=%s, storage_path=%s",
                invoice.id,
                safe_filename,
                file_type,
                category,
                invoice.file_path,
            )

            results.append(
                {
                    "filename": file.filename,
                    "success": True,
                    "invoice_id": str(invoice.id),
                    "message": "Archivo subido correctamente",
                }
            )

            await websocket_manager.notify_new_invoice_upload(
                str(invoice.id),
                file.filename,
                org_id=str(ctx.org_id),
                tenant_id=str(ctx.tenant_id),
            )

            record(
                db=ctx.db,
                tenant_id=ctx.tenant_id,
                organization_id=ctx.org_id,
                organization_name=ctx.organization.name,
                actor_id=str(ctx.user.id),
                actor_name=getattr(ctx.user, "full_name", None) or getattr(ctx.user, "name", None),
                actor_email=ctx.user.email,
                action="invoice.uploaded",
                resource_type="invoice",
                resource_id=str(invoice.id),
                summary=f"Factura '{file.filename}' subida",
                metadata={"files": len(files)},
            )

        except Exception as exc:  # noqa: BLE001
            logger.error("Upload error: %s", exc)
    invalidate_stats_cache(ctx.tenant_id, ctx.org_id)
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
            ctx.db,
            invoice,
            ctx.tenant_id,
            ctx.org_id,
            user_id=ctx.user.id,
        )

        if result["status"] == "already_processed":
            return {"message": "Factura ya procesada", "invoice": invoice.to_dict()}

        if result["status"] == "error":
            # Return 200 with error details in body instead of 400.
            # The invoice record already exists and data may have been
            # partially extracted — a hard HTTP error causes the frontend
            # to discard everything.
            invoice_dict = invoice.to_dict()
            invalidate_stats_cache(ctx.tenant_id, ctx.org_id)
            return {
                "message": "Procesamiento completado con advertencias",
                "status": "partial",
                "error": result.get("error"),
                "invoice": invoice_dict,
                "extracted_data": result.get("extracted_data", {}),
            }

        invoice_obj = result["invoice"]
        record(
            db=ctx.db,
            tenant_id=ctx.tenant_id,
            organization_id=ctx.org_id,
            organization_name=ctx.organization.name,
            actor_id=str(ctx.user.id),
            actor_name=getattr(ctx.user, "full_name", None) or getattr(ctx.user, "name", None),
            actor_email=ctx.user.email,
            action="invoice.processed",
            resource_type="invoice",
            resource_id=str(invoice_id),
            summary=f"Factura '{invoice_obj.invoice_number or invoice_id}' procesada",
        )
        invalidate_stats_cache(ctx.tenant_id, ctx.org_id)
        return {
            "message": "Factura procesada exitosamente",
            "invoice": invoice_obj.to_dict(),
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
    payment_status: Optional[str] = None,
    payment_condition: Optional[str] = None,
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
        payment_status=payment_status,
        payment_condition=payment_condition,
    )

    return {
        "invoices": _serialize_invoices_with_dgii_status(ctx, invoices),
        "total": total,
    }


@router.get("/invoices/pending-count")
async def pending_invoice_count(
    ctx: TenantContext = Depends(require_tenant),
):
    count = (
        ctx.db.query(Invoice)
        .filter(
            Invoice.tenant_id == ctx.tenant_id,
            Invoice.organization_id == ctx.org_id,
            Invoice.processed.is_(False),
            Invoice.is_deleted.is_(False),
        )
        .count()
    )
    return {"count": count}


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


FISCAL_CORE_FIELDS = frozenset(
    {
        "vendor_name",
        "invoice_number",
        "invoice_date",
        "total_amount",
        "tax_amount",
        "currency",
        "transaction_type",
        "vendor_country",
        "vendor_tax_id",
        "vendor_fiscal_address",
        "goods_services_type",
        "rnc_comprador",
        "ecf_type",
    }
)

OPERATIONAL_METADATA_FIELDS = frozenset(
    {
        "category",
        "description",
        "accounting_account_id",
        "cost_center_id",
        "tags",
        "internal_notes",
        "payment_status",
        "payment_condition",
        "due_date",
        "payment_date",
        "bank_account_id",
    }
)


def revalidate_invoice(invoice: Invoice, db: Session, org_rnc: Optional[str] = None) -> list[str]:
    from app.services.pipeline.validator import post_extraction_validator

    # Infer electronic status and ecf_type from invoice number if not already set
    ncf_clean = (invoice.invoice_number or "").strip().upper()
    is_ecf = len(ncf_clean) == 13 and ncf_clean.startswith("E")

    if len(ncf_clean) >= 3 and ncf_clean[1:3].isdigit():
        invoice.ecf_type = ncf_clean[1:3]

    invoice.is_electronic = is_ecf

    ncf_modified = None
    payment_method = None
    if invoice.raw_extracted_data:
        try:
            raw = json.loads(invoice.raw_extracted_data)
            ncf_modified = raw.get("ncf_modified")
            payment_method = raw.get("payment_method")
            # Fallback: extract rnc_comprador from raw data if DB field is empty
            # (old invoices processed before this field was persisted)
            if not invoice.rnc_comprador:
                invoice.rnc_comprador = raw.get("rnc_comprador")
        except Exception:
            pass

    # Build validation dictionary
    data = {
        "vendor_tax_id": invoice.vendor_tax_id,
        "invoice_number": invoice.invoice_number,
        "transaction_type": invoice.transaction_type,
        "total_amount": invoice.total_amount,
        "tax_amount": invoice.tax_amount,
        "vendor_country": invoice.vendor_country,
        "currency": invoice.currency,
        "goods_services_type": invoice.goods_services_type,
        "ecf_type": invoice.ecf_type,
        "rnc_comprador": invoice.rnc_comprador,
        "ncf_modified": ncf_modified,
        "payment_method": payment_method,
    }

    # Run validation
    validated = post_extraction_validator.validate(data, org_rnc=org_rnc)

    # Auto-link parent invoice
    ncf_code = ncf_clean[1:3] if (ncf_clean and len(ncf_clean) >= 3 and ncf_clean[1:3].isdigit()) else None
    if invoice.ecf_type in ("33", "34") or ncf_code in ("03", "04"):
        if ncf_modified:
            original = (
                db.query(Invoice)
                .filter(
                    Invoice.tenant_id == invoice.tenant_id,
                    Invoice.organization_id == invoice.organization_id,
                    Invoice.invoice_number == ncf_modified,
                    Invoice.is_deleted.is_(False),
                )
                .first()
            )
            if original:
                invoice.parent_invoice_id = original.id
            else:
                invoice.parent_invoice_id = None
        else:
            invoice.parent_invoice_id = None
    else:
        invoice.parent_invoice_id = None

    return validated.get("audit_warnings", [])


@router.put("/invoices/{invoice_id}")
async def update_invoice(
    invoice_id: str,
    invoice_data: dict,
    ctx: TenantContext = Depends(require_tenant),
):
    invoice = invoice_repo.get(ctx.db, invoice_id, ctx.tenant_id, ctx.org_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    # Guard Clause of Inmutabilidad for e-CF
    is_locked = invoice.is_electronic or invoice.status == "verified"
    attempted_fiscal = FISCAL_CORE_FIELDS & invoice_data.keys()

    if is_locked and attempted_fiscal:
        detail_msg = (
            "Esta factura electrónica (e-CF) es inmutable y no se pueden modificar sus datos fiscales ({})."
            if invoice.is_electronic
            else "Esta factura ya está verificada y no se pueden modificar sus datos fiscales ({})."
        ).format(", ".join(sorted(attempted_fiscal)))
        raise HTTPException(
            status_code=403,
            detail=detail_msg,
        )

    before = _invoice_snapshot(invoice)

    if is_locked:
        # Only operational metadata is mutable for locked invoices
        mutable = OPERATIONAL_METADATA_FIELDS
    else:
        # Draft physical invoices allow full editing
        mutable = FISCAL_CORE_FIELDS | OPERATIONAL_METADATA_FIELDS

    for field in mutable:
        if field in invoice_data:
            setattr(invoice, field, invoice_data[field])

    if "invoice_date" in invoice_data and not is_locked:
        try:
            invoice.invoice_date = datetime.strptime(invoice_data["invoice_date"], "%Y-%m-%d")
        except Exception:  # noqa: BLE001
            pass

    if "due_date" in invoice_data:
        if invoice_data["due_date"]:
            try:
                invoice.due_date = datetime.strptime(invoice_data["due_date"].split("T")[0], "%Y-%m-%d")
            except Exception:
                pass
        else:
            invoice.due_date = None

    if "payment_date" in invoice_data:
        if invoice_data["payment_date"]:
            try:
                invoice.payment_date = datetime.strptime(invoice_data["payment_date"].split("T")[0], "%Y-%m-%d")
            except Exception:
                pass
        else:
            invoice.payment_date = None

    if "bank_account_id" in invoice_data:
        val = invoice_data["bank_account_id"]
        if val:
            try:
                from uuid import UUID

                invoice.bank_account_id = UUID(str(val))
            except Exception:
                pass
        else:
            invoice.bank_account_id = None

    if "payment_method" in invoice_data:
        try:
            raw_data = {}
            if invoice.raw_extracted_data:
                raw_data = json.loads(invoice.raw_extracted_data)
            raw_data["payment_method"] = invoice_data["payment_method"]
            invoice.raw_extracted_data = json.dumps(raw_data, ensure_ascii=False)
        except Exception:
            pass

    if "warnings_reviewed" in invoice_data:
        try:
            raw_data = {}
            if invoice.raw_extracted_data:
                raw_data = json.loads(invoice.raw_extracted_data)
            raw_data["warnings_reviewed"] = bool(invoice_data["warnings_reviewed"])
            invoice.raw_extracted_data = json.dumps(raw_data, ensure_ascii=False)
        except Exception:
            pass

    # Parse tags JSON string if provided
    if "tags" in invoice_data and isinstance(invoice_data["tags"], list):
        invoice.tags = json.dumps(invoice_data["tags"], ensure_ascii=False)

    # Re-run fiscal audits and update audit_flags
    warnings = revalidate_invoice(invoice, ctx.db, org_rnc=ctx.organization.tax_id)
    invoice.audit_flags = json.dumps(warnings, ensure_ascii=False)

    # ACID: bank balance mutation lives in the same transaction as the invoice state
    was_unpaid = before.get("payment_status") != "paid"
    if was_unpaid and invoice.payment_status == "paid" and invoice.bank_account_id:
        bank_acct = (
            ctx.db.query(BankAccount)
            .filter(
                BankAccount.id == invoice.bank_account_id,
                BankAccount.organization_id == ctx.org_id,
            )
            .first()
        )
        if not bank_acct:
            raise HTTPException(
                status_code=422,
                detail=f"La cuenta bancaria {invoice.bank_account_id} no pertenece a esta organización o no existe.",
            )
        total_amount = invoice.total_amount or 0.0
        if invoice.transaction_type == "income":
            net = total_amount
            raw_data = None
            if invoice.raw_extracted_data:
                try:
                    raw_data = json.loads(invoice.raw_extracted_data)
                except Exception:
                    pass
            if raw_data:
                itbis_ret = raw_data.get("total_itbis_retenido") or 0
                isr_ret = raw_data.get("total_isr_retencion") or 0
                itbis_perc = raw_data.get("total_itbis_percepcion") or 0
                isr_perc = raw_data.get("total_isr_percepcion") or 0
                net = net - float(itbis_ret) - float(isr_ret) + float(itbis_perc) + float(isr_perc)
            bank_acct.balance = (bank_acct.balance or 0.0) + net
        else:
            bank_acct.balance = (bank_acct.balance or 0.0) - total_amount

    invoice.updated_at = datetime.utcnow()
    ctx.db.commit()
    ctx.db.refresh(invoice)

    # Auto-learn TenantVendorRule when user changes category
    if "category" in invoice_data and invoice.vendor_tax_id:
        clean_rnc = re.sub(r"[^0-9]", "", invoice.vendor_tax_id)
        if clean_rnc:
            dgii_code = invoice_data.get("goods_services_type") or get_dgii_code(
                invoice.category, invoice.transaction_type
            )
            if dgii_code and dgii_code in DGII_CATEGORY_LABELS:
                existing = (
                    ctx.db.query(TenantVendorRule)
                    .filter(
                        TenantVendorRule.tenant_id == ctx.tenant_id,
                        TenantVendorRule.emisor_rnc == clean_rnc,
                    )
                    .first()
                )
                if existing:
                    existing.dgii_category_code = dgii_code
                    existing.source = "accountant_override"
                    existing.vendor_name = invoice.vendor_name
                    existing.updated_at = datetime.utcnow()
                else:
                    rule = TenantVendorRule(
                        tenant_id=ctx.tenant_id,
                        emisor_rnc=clean_rnc,
                        dgii_category_code=dgii_code,
                        source="accountant_override",
                        vendor_name=invoice.vendor_name,
                    )
                    ctx.db.add(rule)
                ctx.db.commit()

    after = _invoice_snapshot(invoice)
    changed_fields = [k for k in before if before.get(k) != after.get(k)]

    record(
        db=ctx.db,
        tenant_id=ctx.tenant_id,
        organization_id=ctx.org_id,
        organization_name=ctx.organization.name,
        actor_id=str(ctx.user.id),
        actor_name=getattr(ctx.user, "full_name", None) or getattr(ctx.user, "name", None),
        actor_email=ctx.user.email,
        action="invoice.updated",
        resource_type="invoice",
        resource_id=str(invoice_id),
        summary=f"Factura '{invoice.invoice_number}' actualizada",
        details=f"Campos modificados: {', '.join(changed_fields)}" if changed_fields else "Sin cambios",
        snapshot_before=before,
        snapshot_after=after,
    )

    invalidate_stats_cache(ctx.tenant_id, ctx.org_id)
    return invoice.to_dict()


@router.post("/invoices/{invoice_id}/verify")
async def verify_invoice(
    invoice_id: str,
    ctx: TenantContext = Depends(require_tenant),
):
    """Lock a draft physical NCF invoice by setting status to verified."""
    invoice = invoice_repo.get(ctx.db, invoice_id, ctx.tenant_id, ctx.org_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    if invoice.is_electronic:
        raise HTTPException(
            status_code=400, detail="Las facturas electrónicas se verifican automáticamente al procesarse"
        )
    if invoice.status == "verified":
        return {"message": "La factura ya estaba verificada", "invoice": invoice.to_dict()}

    before = _invoice_snapshot(invoice)
    invoice.status = "verified"
    invoice.processed = True
    invoice.updated_at = datetime.utcnow()
    ctx.db.commit()
    ctx.db.refresh(invoice)

    record(
        db=ctx.db,
        tenant_id=ctx.tenant_id,
        organization_id=ctx.org_id,
        organization_name=ctx.organization.name,
        actor_id=str(ctx.user.id),
        actor_name=getattr(ctx.user, "full_name", None) or getattr(ctx.user, "name", None),
        actor_email=ctx.user.email,
        action="invoice.verified",
        resource_type="invoice",
        resource_id=str(invoice_id),
        summary=f"Factura '{invoice.invoice_number}' verificada",
        details="Factura física bloqueada para reportes fiscales",
        snapshot_before=before,
        snapshot_after=_invoice_snapshot(invoice),
    )

    invalidate_stats_cache(ctx.tenant_id, ctx.org_id)
    return {"message": "Factura verificada exitosamente", "invoice": invoice.to_dict()}


@router.post("/invoices/{invoice_id}/credit-note")
async def create_credit_note(
    invoice_id: str,
    payload: CreditNoteCreate,
    ctx: TenantContext = Depends(require_tenant),
):
    """Create a credit/debit note linked to a verified or electronic invoice."""
    original = invoice_repo.get(ctx.db, invoice_id, ctx.tenant_id, ctx.org_id)
    if not original:
        raise HTTPException(status_code=404, detail="Factura original no encontrada")

    credit = Invoice(
        tenant_id=ctx.tenant_id,
        organization_id=ctx.org_id,
        filename=f"credit_note_{original.invoice_number}_{datetime.now().strftime('%Y%m%d%H%M%S')}",
        file_type="manual",
        vendor_name=original.vendor_name,
        invoice_number=f"NC-{original.invoice_number}",
        invoice_date=datetime.now(),
        total_amount=payload.total_amount,
        tax_amount=payload.tax_amount,
        currency=original.currency,
        transaction_type="expense" if original.transaction_type == "income" else "income",
        category=original.category,
        description=payload.description or f"Nota de Crédito — {original.invoice_number}",
        vendor_tax_id=original.vendor_tax_id,
        vendor_country=original.vendor_country,
        line_items_data=json.dumps(payload.line_items, ensure_ascii=False) if payload.line_items else None,
        source_type="manual",
        is_electronic=False,
        status="verified",
        parent_invoice_id=original.id,
        processed=True,
        confidence_score=1.0,
        goods_services_type=original.goods_services_type,
    )
    invoice_repo.create(ctx.db, credit)
    ctx.db.flush()

    record(
        db=ctx.db,
        tenant_id=ctx.tenant_id,
        organization_id=ctx.org_id,
        organization_name=ctx.organization.name,
        actor_id=str(ctx.user.id),
        actor_name=getattr(ctx.user, "full_name", None) or getattr(ctx.user, "name", None),
        actor_email=ctx.user.email,
        action="credit_note.created",
        resource_type="invoice",
        resource_id=str(credit.id),
        summary=f"Nota de Crédito creada para factura '{original.invoice_number}'",
        details=f"Monto: {payload.total_amount} {original.currency}. Motivo: {payload.motivo or 'N/A'}",
        snapshot_before=None,
        snapshot_after=_invoice_snapshot(credit),
    )

    return {"message": "Nota de Crédito creada exitosamente", "invoice": credit.to_dict()}


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

    due_date = None
    if payload.due_date:
        try:
            due_date = datetime.strptime(payload.due_date.split("T")[0], "%Y-%m-%d")
        except Exception:
            pass

    payment_date = None
    if payload.payment_date:
        try:
            payment_date = datetime.strptime(payload.payment_date.split("T")[0], "%Y-%m-%d")
        except Exception:
            pass

    payment_status = "pending"
    if (payload.payment_condition or "contado") == "contado":
        payment_status = "paid"
    elif due_date and due_date.date() < datetime.now().date():
        payment_status = "overdue"

    line_items_data = None
    if payload.line_items:
        line_items_data = json.dumps([item.model_dump() for item in payload.line_items])

    raw_data: dict[str, object] = {}
    if payload.payment_method:
        raw_data["payment_method"] = payload.payment_method
    if payload.ncf_modified:
        raw_data["ncf_modified"] = payload.ncf_modified
    raw_extracted = json.dumps(raw_data) if raw_data else None

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
        vendor_fiscal_address=payload.vendor_fiscal_address,
        goods_services_type=payload.goods_services_type,
        raw_extracted_data=raw_extracted,
        line_items_data=line_items_data,
        source_type="manual",
        processed=True,
        confidence_score=1.0,
        payment_condition=payload.payment_condition or "contado",
        due_date=due_date,
        payment_date=payment_date,
        payment_status=payment_status,
        bank_account_id=payload.bank_account_id,
    )

    # Run validation and save audit_flags
    warnings = revalidate_invoice(invoice, ctx.db, org_rnc=ctx.organization.tax_id)
    invoice.audit_flags = json.dumps(warnings, ensure_ascii=False)

    invoice_repo.create(ctx.db, invoice)

    record(
        db=ctx.db,
        tenant_id=ctx.tenant_id,
        organization_id=ctx.org_id,
        organization_name=ctx.organization.name,
        actor_id=str(ctx.user.id),
        actor_name=getattr(ctx.user, "full_name", None) or getattr(ctx.user, "name", None),
        actor_email=ctx.user.email,
        action="invoice.created",
        resource_type="invoice",
        resource_id=str(invoice.id),
        summary=f"Factura '{payload.invoice_number}' creada manualmente",
        details=f"Proveedor: {payload.vendor_name}, Total: {payload.total_amount} {payload.currency}",
    )

    invalidate_stats_cache(ctx.tenant_id, ctx.org_id)
    return invoice.to_dict()


@router.delete("/invoices/{invoice_id}")
async def delete_invoice(
    invoice_id: str,
    ctx: TenantContext = Depends(require_tenant),
):
    invoice = invoice_repo.get(ctx.db, invoice_id, ctx.tenant_id, ctx.org_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    invoice.is_deleted = True
    invoice.deleted_at = datetime.utcnow()
    invoice.deleted_by = ctx.user.id
    ctx.db.commit()

    record(
        db=ctx.db,
        tenant_id=ctx.tenant_id,
        organization_id=ctx.org_id,
        organization_name=ctx.organization.name,
        actor_id=str(ctx.user.id),
        actor_name=getattr(ctx.user, "full_name", None) or getattr(ctx.user, "name", None),
        actor_email=ctx.user.email,
        action="invoice.deleted",
        resource_type="invoice",
        resource_id=str(invoice_id),
        summary=f"Factura '{invoice.invoice_number}' eliminada",
    )

    logger.info("Invoice moved to trash: id=%s, filename=%s, user=%s", invoice_id, invoice.filename, ctx.user.id)
    invalidate_stats_cache(ctx.tenant_id, ctx.org_id)
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
        invoice.is_deleted = True
        invoice.deleted_at = now
        invoice.deleted_by = ctx.user.id
        count += 1

    ctx.db.commit()

    record(
        db=ctx.db,
        tenant_id=ctx.tenant_id,
        organization_id=ctx.org_id,
        organization_name=ctx.organization.name,
        actor_id=str(ctx.user.id),
        actor_name=getattr(ctx.user, "full_name", None) or getattr(ctx.user, "name", None),
        actor_email=ctx.user.email,
        action="invoice.deleted",
        resource_type="invoice",
        summary=f"{count} factura(s) movidas a la papelera",
    )

    invalidate_stats_cache(ctx.tenant_id, ctx.org_id)
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
        ctx.db,
        invoices,
        ctx.tenant_id,
        ctx.org_id,
        user_id=ctx.user.id,
    )

    invalidate_stats_cache(ctx.tenant_id, ctx.org_id)
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
    if not invoice.is_deleted:
        raise HTTPException(status_code=400, detail="La factura no está en la papelera")
    if invoice.status == "permanently_deleted":
        raise HTTPException(status_code=400, detail="La factura fue eliminada permanentemente y no puede restaurarse")

    invoice.is_deleted = False
    invoice.deleted_at = None
    invoice.deleted_by = None
    ctx.db.commit()
    ctx.db.refresh(invoice)

    record(
        db=ctx.db,
        tenant_id=ctx.tenant_id,
        organization_id=ctx.org_id,
        organization_name=ctx.organization.name,
        actor_id=str(ctx.user.id),
        actor_name=getattr(ctx.user, "full_name", None) or getattr(ctx.user, "name", None),
        actor_email=ctx.user.email,
        action="invoice.restored",
        resource_type="invoice",
        resource_id=str(invoice_id),
        summary=f"Factura '{invoice.invoice_number}' restaurada de la papelera",
    )

    invalidate_stats_cache(ctx.tenant_id, ctx.org_id)
    return {"message": "Factura restaurada exitosamente", "invoice": invoice.to_dict()}


@router.delete("/invoices/{invoice_id}/permanent")
async def permanent_delete_invoice(
    invoice_id: str,
    ctx: TenantContext = Depends(require_tenant),
):
    invoice = invoice_repo.get_including_trashed(ctx.db, invoice_id, ctx.tenant_id, ctx.org_id)
    if not invoice:
        record(
            db=ctx.db,
            tenant_id=ctx.tenant_id,
            organization_id=ctx.org_id,
            organization_name=ctx.organization.name,
            actor_id=str(ctx.user.id),
            actor_name=getattr(ctx.user, "full_name", None) or getattr(ctx.user, "name", None),
            actor_email=ctx.user.email,
            action="invoice.permanent_deleted",
            resource_type="invoice",
            resource_id=str(invoice_id),
            summary="Intento de eliminación permanente — factura no encontrada en BD",
            details="El registro ya había sido eliminado o el ID es inválido",
        )
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    logger.info(
        "Permanent delete requested: id=%s, filename=%s, file_path=%s, processed_path=%s",
        invoice_id,
        invoice.filename,
        invoice.file_path,
        invoice.processed_path,
    )

    # Preserve storage for emitted e-CFs per DGII regulations (Ley 32-23, Código Tributario).
    # The signed XML must be retained for minimum 10 years even if the DB record is removed.
    has_emitted_ecf = invoice.is_electronic and bool(invoice.original_xml_data)

    snapshot = _invoice_snapshot(invoice)

    # Clean up storage files (best-effort) — DB record is never deleted per DGII 10-year retention.
    if not has_emitted_ecf:
        try:
            if invoice.file_path and INVOICES_PREFIX in invoice.file_path:
                logger.info(
                    "Deleting storage folder for invoice %s (tenant=%s, org=%s)", invoice.id, ctx.tenant_id, ctx.org_id
                )
                if not delete_invoice_folder(ctx.tenant_id, ctx.org_id, invoice.id):
                    logger.warning("Storage folder deletion FAILED for invoice %s", invoice.id)
            elif invoice.file_path:
                logger.info("Deleting individual storage file: %s", invoice.file_path)
                if not supabase_delete(invoice.file_path):
                    logger.warning("File deletion FAILED: %s", invoice.file_path)
                if invoice.processed_path and not supabase_delete(invoice.processed_path):
                    logger.warning("Processed file deletion FAILED: %s", invoice.processed_path)
        except Exception:
            logger.exception("Storage cleanup error for invoice %s (non-fatal)", invoice.id)

    invoice.status = "permanently_deleted"
    ctx.db.commit()

    summary = f"Factura '{invoice.invoice_number}' marcada como eliminada permanentemente (registro preservado)"
    if has_emitted_ecf:
        summary += " — XML preservado para cumplimiento DGII"
    record(
        db=ctx.db,
        tenant_id=ctx.tenant_id,
        organization_id=ctx.org_id,
        organization_name=ctx.organization.name,
        actor_id=str(ctx.user.id),
        actor_name=getattr(ctx.user, "full_name", None) or getattr(ctx.user, "name", None),
        actor_email=ctx.user.email,
        action="invoice.permanent_deleted",
        resource_type="invoice",
        resource_id=str(invoice_id),
        summary=summary,
        details=f"Proveedor: {invoice.vendor_name}, Total: {invoice.total_amount} {invoice.currency or ''}",
        snapshot_before=snapshot,
    )
    invalidate_stats_cache(ctx.tenant_id, ctx.org_id)
    logger.info("Invoice marked as permanently deleted (record kept): id=%s, filename=%s", invoice_id, invoice.filename)
    return {"message": "Factura marcada como eliminada. El registro se conserva en BD para cumplimiento DGII."}


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

    before = _invoice_snapshot(invoice)
    invoice.cancelled_at = datetime.utcnow()
    invoice.cancellation_type = body.cancellation_type or "01"
    ctx.db.commit()
    ctx.db.refresh(invoice)

    record(
        db=ctx.db,
        tenant_id=ctx.tenant_id,
        organization_id=ctx.org_id,
        organization_name=ctx.organization.name,
        actor_id=str(ctx.user.id),
        actor_name=getattr(ctx.user, "full_name", None) or getattr(ctx.user, "name", None),
        actor_email=ctx.user.email,
        action="invoice.cancelled",
        resource_type="invoice",
        resource_id=str(invoice_id),
        summary=f"Factura '{invoice.invoice_number}' anulada",
        details=f"Tipo anulación: {body.cancellation_type or '01'}",
        snapshot_before=before,
    )

    message = "Factura anulada exitosamente"
    if invoice.transaction_type == "expense":
        message += (
            ". Esta factura de gasto NO se reporta en el Formulario 608. "
            "Si el período ya cerró, corrige el 606 (elimina esta factura) y presenta una rectificativa IT-1. "
            "Si el período no ha cerrado, re-envía el 606 sin incluir esta factura."
        )

    return {"message": message, "invoice": invoice.to_dict()}


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

    before = _invoice_snapshot(invoice)
    invoice.cancelled_at = None
    invoice.cancellation_type = None
    ctx.db.commit()
    ctx.db.refresh(invoice)

    record(
        db=ctx.db,
        tenant_id=ctx.tenant_id,
        organization_id=ctx.org_id,
        organization_name=ctx.organization.name,
        actor_id=str(ctx.user.id),
        actor_name=getattr(ctx.user, "full_name", None) or getattr(ctx.user, "name", None),
        actor_email=ctx.user.email,
        action="invoice.uncancelled",
        resource_type="invoice",
        resource_id=str(invoice_id),
        summary=f"Anulación revertida para factura '{invoice.invoice_number}'",
        snapshot_before=before,
    )

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

    record(
        db=ctx.db,
        tenant_id=ctx.tenant_id,
        organization_id=ctx.org_id,
        organization_name=ctx.organization.name,
        actor_id=str(ctx.user.id),
        actor_name=getattr(ctx.user, "full_name", None) or getattr(ctx.user, "name", None),
        actor_email=ctx.user.email,
        action="invoice.bulk_cancelled",
        resource_type="invoice",
        summary=f"{count} facturas anuladas",
    )

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
            Invoice.is_deleted.is_(True),
            Invoice.status != "permanently_deleted",
        )
        .all()
    )

    count = 0
    for invoice in invoices:
        invoice.is_deleted = False
        invoice.deleted_at = None
        invoice.deleted_by = None
        count += 1

    ctx.db.commit()

    record(
        db=ctx.db,
        tenant_id=ctx.tenant_id,
        organization_id=ctx.org_id,
        organization_name=ctx.organization.name,
        actor_id=str(ctx.user.id),
        actor_name=getattr(ctx.user, "full_name", None) or getattr(ctx.user, "name", None),
        actor_email=ctx.user.email,
        action="invoice.bulk_restored",
        resource_type="invoice",
        summary=f"{count} factura(s) restauradas de la papelera",
    )

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
            Invoice.is_deleted.is_(True),
        )
        .all()
    )

    snapshots = {str(inv.id): _invoice_snapshot(inv) for inv in invoices}

    preserved_ecf_count = 0
    for invoice in invoices:
        has_emitted_ecf = invoice.is_electronic and bool(invoice.original_xml_data)
        if has_emitted_ecf:
            preserved_ecf_count += 1
            continue
        # Best-effort storage cleanup — never delete DB records
        try:
            if invoice.file_path and INVOICES_PREFIX in invoice.file_path:
                logger.info(
                    "Deleting storage folder for invoice %s (tenant=%s, org=%s)", invoice.id, ctx.tenant_id, ctx.org_id
                )
                if not delete_invoice_folder(ctx.tenant_id, ctx.org_id, invoice.id):
                    logger.warning("Storage folder deletion FAILED for invoice %s", invoice.id)
            elif invoice.file_path:
                if not supabase_delete(invoice.file_path):
                    logger.warning("File deletion FAILED: %s", invoice.file_path)
                if invoice.processed_path and not supabase_delete(invoice.processed_path):
                    logger.warning("Processed file deletion FAILED: %s", invoice.processed_path)
        except Exception:
            logger.exception("Storage cleanup error for invoice %s (non-fatal)", invoice.id)

    for invoice in invoices:
        invoice.status = "permanently_deleted"
    ctx.db.commit()

    pending = len(action.invoice_ids) - len(invoices) if len(action.invoice_ids) > 0 else 0
    summary = f"{len(invoices)} factura(s) marcada(s) como eliminadas permanentemente (registros preservados)"
    if preserved_ecf_count:
        summary += f" — XML de {preserved_ecf_count} e-CF(s) preservado para cumplimiento DGII"
    if pending:
        summary += f", {pending} no encontrada(s) en BD"
    record(
        db=ctx.db,
        tenant_id=ctx.tenant_id,
        organization_id=ctx.org_id,
        organization_name=ctx.organization.name,
        actor_id=str(ctx.user.id),
        actor_name=getattr(ctx.user, "full_name", None) or getattr(ctx.user, "name", None),
        actor_email=ctx.user.email,
        action="invoice.bulk_permanent_deleted",
        resource_type="invoice",
        summary=summary,
        snapshot_before=[snapshots[i] for i in snapshots],
    )

    invalidate_stats_cache(ctx.tenant_id, ctx.org_id)

    preserved_msg = (
        f" — XML de {preserved_ecf_count} e-CF(s) preservado para cumplimiento DGII" if preserved_ecf_count else ""
    )
    return {
        "message": f"{len(invoices)} factura(s) marcada(s) como eliminada(s). Los registros se conservan en BD para cumplimiento DGII.{preserved_msg}",
        "count": len(invoices),
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
        elif action.format == "txt":
            output = export_service.export_txt(invoices)
            media_type = "text/plain"
            filename += ".txt"
        elif action.format == "excel":
            output = export_service.export_excel_generic(invoices)
            media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            filename += ".xlsx"
        else:
            output = export_service.export_csv_generic(invoices)
            filename += ".csv"

        record(
            db=ctx.db,
            tenant_id=ctx.tenant_id,
            organization_id=ctx.org_id,
            organization_name=ctx.organization.name,
            actor_id=str(ctx.user.id),
            actor_name=getattr(ctx.user, "full_name", None) or getattr(ctx.user, "name", None),
            actor_email=ctx.user.email,
            action="invoice.exported",
            resource_type="invoice",
            resource_id=str(invoices[0].id),
            summary=f"{len(invoices)} factura(s) exportada(s) a {action.format.upper()}",
            details=f"Formato: {action.format}",
        )

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
        ctx.db,
        payload.event,
        data,
        tenant_id=ctx.tenant_id,
        org_id=ctx.org_id,
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

    record(
        db=ctx.db,
        tenant_id=ctx.tenant_id,
        organization_id=ctx.org_id,
        organization_name=ctx.organization.name,
        actor_id=str(ctx.user.id),
        actor_name=getattr(ctx.user, "full_name", None) or getattr(ctx.user, "name", None),
        actor_email=ctx.user.email,
        action="export.downloaded",
        resource_type="invoice",
        summary=f"{len(invoices)} facturas descargadas",
        details=f"Formatos: {format or 'csv'}",
    )

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
                "Ingreso"
                if invoice.transaction_type == "income"
                else "Gasto"
                if invoice.transaction_type == "expense"
                else "",
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


# ---------------------------------------------------------------------------
# Vendor Categorization Rules (Feedback Loop)
# ---------------------------------------------------------------------------


class VendorRulePayload(BaseModel):
    emisor_rnc: str
    dgii_category_code: str
    vendor_name: Optional[str] = None


@router.get("/api/vendor-rules")
async def list_vendor_rules(
    ctx: TenantContext = Depends(require_tenant),
):
    rules = (
        ctx.db.query(TenantVendorRule)
        .filter(TenantVendorRule.tenant_id == ctx.tenant_id)
        .order_by(TenantVendorRule.updated_at.desc())
        .all()
    )
    return {
        "rules": [
            {
                "id": str(r.id),
                "emisor_rnc": r.emisor_rnc,
                "dgii_category_code": r.dgii_category_code,
                "category_label": DGII_CATEGORY_LABELS.get(r.dgii_category_code, ""),
                "source": r.source,
                "vendor_name": r.vendor_name,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            }
            for r in rules
        ]
    }


@router.post("/api/vendor-rules")
async def upsert_vendor_rule(
    payload: VendorRulePayload,
    ctx: TenantContext = Depends(require_tenant),
):
    if payload.dgii_category_code not in DGII_CATEGORY_LABELS:
        raise HTTPException(
            status_code=400,
            detail=f"Código de categoría inválido: {payload.dgii_category_code}. "
            f"Valores válidos: {', '.join(sorted(DGII_CATEGORY_LABELS))}",
        )

    from re import sub as _sub

    clean_rnc = _sub(r"[^0-9]", "", payload.emisor_rnc)

    existing = (
        ctx.db.query(TenantVendorRule)
        .filter(
            TenantVendorRule.tenant_id == ctx.tenant_id,
            TenantVendorRule.emisor_rnc == clean_rnc,
        )
        .first()
    )

    if existing:
        existing.dgii_category_code = payload.dgii_category_code
        existing.source = "accountant_override"
        if payload.vendor_name:
            existing.vendor_name = payload.vendor_name
        existing.updated_at = datetime.utcnow()
    else:
        existing = TenantVendorRule(
            tenant_id=ctx.tenant_id,
            emisor_rnc=clean_rnc,
            dgii_category_code=payload.dgii_category_code,
            source="accountant_override",
            vendor_name=payload.vendor_name,
        )
        ctx.db.add(existing)

    ctx.db.commit()
    ctx.db.refresh(existing)
    return {"message": "Regla guardada exitosamente", "rule_id": str(existing.id)}


@router.delete("/api/vendor-rules/{rule_id}")
async def delete_vendor_rule(
    rule_id: str,
    ctx: TenantContext = Depends(require_tenant),
):
    rule = (
        ctx.db.query(TenantVendorRule)
        .filter(
            TenantVendorRule.id == rule_id,
            TenantVendorRule.tenant_id == ctx.tenant_id,
        )
        .first()
    )
    if not rule:
        raise HTTPException(status_code=404, detail="Regla no encontrada")
    ctx.db.delete(rule)
    ctx.db.commit()
    return {"message": "Regla eliminada"}


@router.get("/api/dgii-categories")
async def list_dgii_categories():
    return {"categories": [{"code": k, "label": v} for k, v in sorted(DGII_CATEGORY_LABELS.items())]}


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


class MarkPaidRequest(BaseModel):
    payment_date: Optional[str] = None
    bank_account_id: Optional[UUID] = None


@router.post("/api/invoices/{invoice_id}/mark-paid")
async def mark_invoice_as_paid(
    invoice_id: str,
    payload: Optional[MarkPaidRequest] = None,
    ctx: TenantContext = Depends(require_tenant),
):
    invoice = invoice_repo.get(ctx.db, invoice_id, ctx.tenant_id, ctx.org_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    # Set status to paid and determine payment date
    invoice.payment_status = "paid"

    from app.utils.dates import utc_now

    p_date = utc_now()
    if payload and payload.payment_date:
        try:
            p_date = datetime.strptime(payload.payment_date.split("T")[0], "%Y-%m-%d")
        except Exception:
            pass
    invoice.payment_date = p_date
    invoice.updated_at = utc_now()

    if payload and payload.bank_account_id:
        invoice.bank_account_id = payload.bank_account_id
        from app.models import BankAccount

        bank_acc = (
            ctx.db.query(BankAccount)
            .filter(
                BankAccount.id == payload.bank_account_id,
                BankAccount.tenant_id == ctx.tenant_id,
                BankAccount.organization_id == ctx.org_id,
            )
            .first()
        )
        if bank_acc:
            amount = invoice.total_amount or 0.0
            if invoice.transaction_type == "expense":
                bank_acc.balance = float(bank_acc.balance) - amount
            elif invoice.transaction_type == "income":
                bank_acc.balance = float(bank_acc.balance) + amount
            ctx.db.add(bank_acc)

    ctx.db.commit()
    ctx.db.refresh(invoice)

    # Audit log
    before = {"payment_status": "pending", "payment_date": None}
    after = {
        "payment_status": "paid",
        "payment_date": invoice.payment_date.isoformat() if invoice.payment_date else None,
    }
    record(
        db=ctx.db,
        tenant_id=ctx.tenant_id,
        organization_id=ctx.org_id,
        organization_name=ctx.organization.name,
        actor_id=str(ctx.user.id),
        actor_name=getattr(ctx.user, "full_name", None) or getattr(ctx.user, "name", None),
        actor_email=ctx.user.email,
        action="invoice.marked_paid",
        resource_type="invoice",
        resource_id=str(invoice_id),
        summary=f"Factura '{invoice.invoice_number}' marcada como pagada/cobrada",
        details="Pago liquidado",
        snapshot_before=before,
        snapshot_after=after,
    )

    return {"status": "success", "invoice": invoice.to_dict()}


def _get_bank_balances(db: Session, tenant_id: UUID, org_id: UUID) -> list[dict]:
    from app.models import BankAccount

    accounts = (
        db.query(BankAccount)
        .filter(
            BankAccount.tenant_id == tenant_id,
            BankAccount.organization_id == org_id,
        )
        .all()
    )

    if not accounts:
        # Seeding on-demand
        popular = BankAccount(
            tenant_id=tenant_id,
            organization_id=org_id,
            name="Banco Popular",
            balance=0.00,
        )
        bhd = BankAccount(
            tenant_id=tenant_id,
            organization_id=org_id,
            name="BHD León",
            balance=0.00,
        )
        db.add(popular)
        db.add(bhd)
        db.commit()
        db.refresh(popular)
        db.refresh(bhd)
        accounts = [popular, bhd]

    return [acc.to_dict() for acc in accounts]


@router.get("/api/cxp/summary")
async def get_cxp_summary(
    ctx: TenantContext = Depends(require_tenant),
):
    from app.utils.dates import utc_now

    now = utc_now()
    start_of_today = datetime.combine(now.date(), datetime.min.time())
    one_week_from_now = start_of_today + timedelta(days=7)

    # Get outstanding (payment_status in ('pending', 'overdue') or due_date < now)
    # Filter by transaction_type == 'expense' and payment_condition == 'credito'
    outstanding_invoices = (
        ctx.db.query(Invoice)
        .filter(
            Invoice.tenant_id == ctx.tenant_id,
            Invoice.organization_id == ctx.org_id,
            Invoice.transaction_type == "expense",
            Invoice.payment_condition == "credito",
            Invoice.payment_status != "paid",
            Invoice.is_deleted.is_(False),
        )
        .all()
    )

    total_outstanding = sum(inv.total_amount or 0.0 for inv in outstanding_invoices)

    total_overdue = sum(
        inv.total_amount or 0.0 for inv in outstanding_invoices if inv.due_date and inv.due_date.date() < now.date()
    )

    weekly_commitments = sum(
        inv.total_amount or 0.0
        for inv in outstanding_invoices
        if inv.due_date and start_of_today.date() <= inv.due_date.date() <= one_week_from_now.date()
    )

    bank_balances = _get_bank_balances(ctx.db, ctx.tenant_id, ctx.org_id)
    cash_balance = sum(float(b.get("balance", 0.0)) for b in bank_balances if isinstance(b, dict))

    return {
        "total_outstanding": total_outstanding,
        "total_overdue": total_overdue,
        "weekly_commitments": weekly_commitments,
        "cash_balance": cash_balance,
        "bank_balances": bank_balances,
        "recent_invoices": [inv.to_dict() for inv in outstanding_invoices],
    }


@router.get("/api/cxc/summary")
async def get_cxc_summary(
    ctx: TenantContext = Depends(require_tenant),
):
    from app.utils.dates import utc_now

    now = utc_now()
    start_of_today = datetime.combine(now.date(), datetime.min.time())
    one_week_from_now = start_of_today + timedelta(days=7)

    # Get outstanding (payment_status in ('pending', 'overdue') or due_date < now)
    # Filter by transaction_type == 'income' and payment_condition == 'credito'
    outstanding_invoices = (
        ctx.db.query(Invoice)
        .filter(
            Invoice.tenant_id == ctx.tenant_id,
            Invoice.organization_id == ctx.org_id,
            Invoice.transaction_type == "income",
            Invoice.payment_condition == "credito",
            Invoice.payment_status != "paid",
            Invoice.is_deleted.is_(False),
        )
        .all()
    )

    total_outstanding = sum(inv.total_amount or 0.0 for inv in outstanding_invoices)

    total_overdue = sum(
        inv.total_amount or 0.0 for inv in outstanding_invoices if inv.due_date and inv.due_date.date() < now.date()
    )

    weekly_receivables = sum(
        inv.total_amount or 0.0
        for inv in outstanding_invoices
        if inv.due_date and start_of_today.date() <= inv.due_date.date() <= one_week_from_now.date()
    )

    return {
        "total_outstanding": total_outstanding,
        "total_overdue": total_overdue,
        "weekly_receivables": weekly_receivables,
        "recent_invoices": [inv.to_dict() for inv in outstanding_invoices],
    }
