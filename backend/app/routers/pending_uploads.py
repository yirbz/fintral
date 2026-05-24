import io
import logging
import os
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import desc

from app.config import SUPABASE_URL
from app.core.container import openai_processor, webhook_sender
from app.dependencies.tenant import TenantContext, require_tenant
from app.models import Invoice, PendingUpload
from app.repositories import InvoiceRepository
from app.services import InvoiceProcessingService
from app.services.pipeline.image_preprocessor import image_preprocessor
from app.services.supabase_storage import upload_invoice_file
from app.services.websocket import websocket_manager
from app.services.audit_logger import record
from app.routers.invoices import ALLOWED_EXTENSIONS, get_file_type

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/pending-uploads", tags=["pending-uploads"])
invoice_repo = InvoiceRepository()
processing_service = InvoiceProcessingService(
    invoice_repo=invoice_repo,
    openai_processor=openai_processor,
    webhook_sender=webhook_sender,
)


@router.post("")
async def create_pending_upload(
    file: UploadFile = File(...),
    ctx: TenantContext = Depends(require_tenant),
):
    file_ext = os.path.splitext(file.filename or "unknown")[1].lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Tipo de archivo no permitido: {file_ext}")

    file_data = await file.read()
    file_type = get_file_type(file.filename or "unknown")

    pending = PendingUpload(
        tenant_id=ctx.tenant_id,
        organization_id=ctx.org_id,
        user_id=ctx.user.id,
        filename=file.filename or "unknown",
        file_path="",
        file_type=file_type,
        file_size=len(file_data),
    )
    ctx.db.add(pending)
    ctx.db.flush()

    if SUPABASE_URL:
        original_ext = file_ext.lstrip(".")
        file_path = upload_invoice_file(
            file_data,
            ctx.tenant_id,
            ctx.org_id,
            pending.id,
            "original",
            original_ext,
            content_type=file.content_type,
        )
        if not file_path:
            ctx.db.rollback()
            raise HTTPException(status_code=500, detail="Error al subir archivo a storage")

        pending.file_path = file_path

        if file_type == "image":
            try:
                processed_pil, quality = image_preprocessor.preprocess_bytes(file_data)
                processed_buffer = io.BytesIO()
                processed_pil.save(processed_buffer, format="JPEG", quality=95)
                processed_data = processed_buffer.getvalue()
                upload_invoice_file(
                    processed_data,
                    ctx.tenant_id,
                    ctx.org_id,
                    pending.id,
                    "processed",
                    "jpg",
                    content_type="image/jpeg",
                )
            except Exception as exc:
                logger.warning("Could not preprocess image at upload: %s", exc)

    ctx.db.commit()
    ctx.db.refresh(pending)

    return {"pending_upload": pending.to_dict()}


@router.get("")
async def list_pending_uploads(
    skip: int = 0,
    limit: int = 50,
    ctx: TenantContext = Depends(require_tenant),
):
    query = ctx.db.query(PendingUpload).filter(
        PendingUpload.tenant_id == ctx.tenant_id,
        PendingUpload.organization_id == ctx.org_id,
        PendingUpload.processed.is_(False),
    )
    total = query.count()
    items = query.order_by(desc(PendingUpload.created_at)).offset(skip).limit(limit).all()
    return {"pending_uploads": [p.to_dict() for p in items], "total": total}


@router.get("/count")
async def count_pending_uploads(
    ctx: TenantContext = Depends(require_tenant),
):
    count = ctx.db.query(PendingUpload).filter(
        PendingUpload.tenant_id == ctx.tenant_id,
        PendingUpload.organization_id == ctx.org_id,
        PendingUpload.processed.is_(False),
    ).count()
    return {"count": count}


@router.post("/{pending_id}/process")
async def process_pending_upload(
    pending_id: UUID,
    ctx: TenantContext = Depends(require_tenant),
):
    pending = ctx.db.query(PendingUpload).filter(
        PendingUpload.id == pending_id,
        PendingUpload.tenant_id == ctx.tenant_id,
        PendingUpload.organization_id == ctx.org_id,
    ).first()

    if not pending:
        raise HTTPException(status_code=404, detail="Carga pendiente no encontrada")
    if pending.processed:
        raise HTTPException(status_code=400, detail="Ya procesada")

    pending.processed = True
    ctx.db.flush()

    try:
        invoice = Invoice(
            tenant_id=ctx.tenant_id,
            organization_id=ctx.org_id,
            filename=pending.filename,
            file_path=pending.file_path,
            file_type=pending.file_type,
            processed=False,
        )
        invoice_repo.create(ctx.db, invoice)
        ctx.db.flush()

        result = await processing_service.process_invoice_record(
            ctx.db, invoice, ctx.tenant_id, ctx.org_id,
        )

        ctx.db.delete(pending)
        ctx.db.commit()

        await websocket_manager.notify_new_invoice_upload(
            str(invoice.id), pending.filename,
            org_id=str(ctx.org_id), tenant_id=str(ctx.tenant_id),
        )

        record(
            db=ctx.db,
            tenant_id=ctx.tenant_id,
            organization_id=ctx.org_id,
            organization_name=ctx.organization.name,
            actor_id=str(ctx.user.id),
            actor_name=getattr(ctx.user, 'full_name', None) or getattr(ctx.user, 'name', None),
            actor_email=ctx.user.email,
            action="pending.upload.processed",
            resource_type="invoice",
            resource_id=str(invoice.id),
            summary=f"Factura '{pending.filename}' procesada desde pendientes",
            metadata={},
        )

        return {
            "message": "Factura procesada exitosamente",
            "invoice": invoice.to_dict(),
            "extracted_data": result,
        }

    except Exception as exc:
        logger.error("Error processing pending upload %s: %s", pending_id, exc)
        pending.processed = False
        ctx.db.commit()
        raise HTTPException(status_code=500, detail=f"Error al procesar: {exc}")


@router.post("/bulk-process")
async def bulk_process_pending(
    ctx: TenantContext = Depends(require_tenant),
):
    pendings = ctx.db.query(PendingUpload).filter(
        PendingUpload.tenant_id == ctx.tenant_id,
        PendingUpload.organization_id == ctx.org_id,
        PendingUpload.processed.is_(False),
    ).all()

    if not pendings:
        return {"message": "No hay cargas pendientes", "success_count": 0, "errors": []}

    success_count = 0
    errors: list[str] = []

    for pending in pendings:
        try:
            pending.processed = True
            ctx.db.flush()

            invoice = Invoice(
                tenant_id=ctx.tenant_id,
                organization_id=ctx.org_id,
                filename=pending.filename,
                file_path=pending.file_path,
                file_type=pending.file_type,
                processed=False,
            )
            invoice_repo.create(ctx.db, invoice)
            ctx.db.flush()

            await processing_service.process_invoice_record(
                ctx.db, invoice, ctx.tenant_id, ctx.org_id,
            )
            ctx.db.delete(pending)
            ctx.db.commit()
            success_count += 1

        except Exception as exc:
            logger.error("Bulk process error for %s: %s", pending.id, exc)
            pending.processed = False
            ctx.db.commit()
            errors.append(f"{pending.filename}: {exc}")

    return {
        "message": f"{success_count} de {len(pendings)} procesadas",
        "success_count": success_count,
        "errors": errors,
    }


@router.delete("/{pending_id}")
async def delete_pending_upload(
    pending_id: UUID,
    ctx: TenantContext = Depends(require_tenant),
):
    pending = ctx.db.query(PendingUpload).filter(
        PendingUpload.id == pending_id,
        PendingUpload.tenant_id == ctx.tenant_id,
        PendingUpload.organization_id == ctx.org_id,
    ).first()

    if not pending:
        raise HTTPException(status_code=404, detail="Carga pendiente no encontrada")

    ctx.db.delete(pending)
    ctx.db.commit()

    return {"message": "Carga pendiente eliminada"}
