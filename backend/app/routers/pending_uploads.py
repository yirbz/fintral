import io
import logging
import os
from datetime import timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.config import SUPABASE_URL, PUBLIC_APP_URL
from app.database import get_db
from app.core.container import openai_processor, webhook_sender
from app.services.plan_service import PlanService, PlanLimitExceeded
from app.dependencies.tenant import TenantContext, require_tenant
from app.models import Invoice, PendingUpload, UploadLink, User
from app.repositories import InvoiceRepository
from app.services import InvoiceProcessingService
from app.services.pipeline.image_preprocessor import image_preprocessor
from app.services.supabase_storage import upload_invoice_file
from app.services.usage_tracker import UsageTracker
from app.services.websocket import websocket_manager
from app.services.audit_logger import record
from app.routers.invoices import ALLOWED_EXTENSIONS, get_file_type
from app.services.email_service import send_upload_link_email
from app.utils.dates import utc_now, ensure_utc
from app.core.redis import invalidate_stats_cache

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

    # Track storage usage
    try:
        UsageTracker(ctx.db).increment_storage(ctx.org_id, len(file_data))
    except Exception:
        logger.exception("Failed to track storage usage")

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

    try:
        plan_svc = PlanService(ctx.db)
        plan_svc.check_ocr_limit(ctx.org_id)
    except PlanLimitExceeded as e:
        usage = getattr(e, 'usage', {})
        limit_val = usage.get("limit", 0)
        current = usage.get("used", 0)
        msg = f"Límite de documentos OCR alcanzado ({current}/{limit_val} mensuales). "
        msg += "Adquiere un bloque adicional de documentos OCR desde la Tienda para seguir procesando."
        raise HTTPException(status_code=403, detail=msg)

    pending.processed = True
    ctx.db.flush()

    try:
        invoice = Invoice(
            tenant_id=ctx.tenant_id,
            organization_id=ctx.org_id,
            filename=pending.filename,
            file_path=pending.file_path,
            file_type=pending.file_type,
            file_size=pending.file_size,
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

        invalidate_stats_cache(ctx.tenant_id, ctx.org_id)
        return {
            "message": "Factura procesada exitosamente",
            "invoice": invoice.to_dict(),
            "extracted_data": result,
        }

    except Exception as exc:
        logger.error("Error processing pending upload %s: %s", pending_id, exc)
        ctx.db.rollback()
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
                file_size=pending.file_size,
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

    invalidate_stats_cache(ctx.tenant_id, ctx.org_id)
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


class CreateUploadLinkRequest(BaseModel):
    client_email: str
    max_files: int = 10
    expires_in_hours: int = 24


@router.get("/links")
async def list_upload_links(
    ctx: TenantContext = Depends(require_tenant),
):
    links = ctx.db.query(UploadLink).filter(
        UploadLink.tenant_id == ctx.tenant_id,
        UploadLink.organization_id == ctx.org_id,
    ).order_by(desc(UploadLink.created_at)).all()
    return {"upload_links": [link.to_dict() for link in links]}


@router.post("/links")
async def create_upload_link(
    body: CreateUploadLinkRequest,
    ctx: TenantContext = Depends(require_tenant),
):
    expires_at = utc_now() + timedelta(hours=body.expires_in_hours)

    link = UploadLink(
        tenant_id=ctx.tenant_id,
        organization_id=ctx.org_id,
        created_by_user_id=ctx.user.id,
        client_email=body.client_email,
        max_files=body.max_files,
        expires_at=expires_at,
        is_active=True,
    )
    ctx.db.add(link)
    ctx.db.commit()
    ctx.db.refresh(link)

    # Construct public upload link URL
    # Format: {PUBLIC_APP_URL}/upload/public?token={token}
    public_link_url = f"{PUBLIC_APP_URL}/upload/public?token={link.token}"

    # Send email
    send_upload_link_email(
        email=body.client_email,
        org_name=ctx.organization.name,
        link=public_link_url,
        expires_in_hours=body.expires_in_hours,
        max_files=body.max_files,
    )

    return {"upload_link": link.to_dict(), "url": public_link_url}


@router.delete("/links/{link_id}")
async def delete_upload_link(
    link_id: UUID,
    ctx: TenantContext = Depends(require_tenant),
):
    link = ctx.db.query(UploadLink).filter(
        UploadLink.id == link_id,
        UploadLink.tenant_id == ctx.tenant_id,
        UploadLink.organization_id == ctx.org_id,
    ).first()

    if not link:
        raise HTTPException(status_code=404, detail="Enlace temporal no encontrado")

    ctx.db.delete(link)
    ctx.db.commit()
    return {"message": "Enlace temporal eliminado"}


# Public endpoints
@router.get("/public/{token}")
async def get_public_link_info(
    token: str,
    db: Session = Depends(get_db),
):
    link = db.query(UploadLink).filter(
        UploadLink.token == token,
        UploadLink.is_active.is_(True),
    ).first()

    if not link:
        raise HTTPException(status_code=404, detail="Enlace temporal no válido o inactivo")

    if ensure_utc(link.expires_at) < utc_now():
        link.is_active = False
        db.commit()
        raise HTTPException(status_code=400, detail="El enlace temporal ha expirado")

    # Fetch non-processed pending uploads for this link
    pendings = db.query(PendingUpload).filter(
        PendingUpload.upload_link_id == link.id,
        PendingUpload.processed.is_(False),
    ).order_by(desc(PendingUpload.created_at)).all()

    return {
        "organization_name": link.organization.name,
        "max_files": link.max_files,
        "uploaded_count": link.uploaded_count,
        "expires_at": link.expires_at.isoformat(),
        "pending_uploads": [p.to_dict() for p in pendings],
    }


@router.post("/public/{token}/upload")
async def create_public_pending_upload(
    token: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    link = db.query(UploadLink).filter(
        UploadLink.token == token,
        UploadLink.is_active.is_(True),
    ).first()

    if not link:
        raise HTTPException(status_code=404, detail="Enlace temporal no válido o inactivo")

    if ensure_utc(link.expires_at) < utc_now():
        link.is_active = False
        db.commit()
        raise HTTPException(status_code=400, detail="El enlace temporal ha expirado")

    if link.uploaded_count >= link.max_files:
        raise HTTPException(status_code=400, detail="Se ha alcanzado el límite máximo de archivos permitidos")

    file_ext = os.path.splitext(file.filename or "unknown")[1].lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Tipo de archivo no permitido: {file_ext}")

    file_data = await file.read()
    file_type = get_file_type(file.filename or "unknown")

    # Find user_id (default to the creator of the link, fallback to first user in org/tenant)
    user_id = link.created_by_user_id
    if not user_id:
        fallback_user = db.query(User).filter(User.tenant_id == link.tenant_id).first()
        if fallback_user:
            user_id = fallback_user.id
        else:
            raise HTTPException(status_code=400, detail="No se encontró un usuario responsable para esta carga")

    # Create PendingUpload
    pending = PendingUpload(
        tenant_id=link.tenant_id,
        organization_id=link.organization_id,
        user_id=user_id,
        upload_link_id=link.id,
        filename=file.filename or "unknown",
        file_path="",
        file_type=file_type,
        file_size=len(file_data),
    )
    db.add(pending)
    db.flush()

    if SUPABASE_URL:
        original_ext = file_ext.lstrip(".")
        file_path = upload_invoice_file(
            file_data,
            link.tenant_id,
            link.organization_id,
            pending.id,
            "original",
            original_ext,
            content_type=file.content_type,
        )
        if not file_path:
            db.rollback()
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
                    link.tenant_id,
                    link.organization_id,
                    pending.id,
                    "processed",
                    "jpg",
                    content_type="image/jpeg",
                )
            except Exception as exc:
                logger.warning("Could not preprocess image at public upload: %s", exc)

    # Increment link uploaded count
    link.uploaded_count += 1
    db.commit()
    db.refresh(pending)

    # Notify upload via websocket
    try:
        await websocket_manager.notify_new_invoice_upload(
            str(pending.id), pending.filename,
            org_id=str(link.organization_id), tenant_id=str(link.tenant_id)
        )
    except Exception as exc:
        logger.warning("Failed to send WebSocket notification for public upload: %s", exc)

    return {"pending_upload": pending.to_dict()}


@router.delete("/public/{token}/{pending_id}")
async def delete_public_pending_upload(
    token: str,
    pending_id: UUID,
    db: Session = Depends(get_db),
):
    link = db.query(UploadLink).filter(
        UploadLink.token == token,
        UploadLink.is_active.is_(True),
    ).first()

    if not link:
        raise HTTPException(status_code=404, detail="Enlace temporal no válido")

    pending = db.query(PendingUpload).filter(
        PendingUpload.id == pending_id,
        PendingUpload.upload_link_id == link.id,
    ).first()

    if not pending:
        raise HTTPException(status_code=404, detail="Archivo pendiente no encontrado")

    try:
        if pending.file_path:
            from app.services.supabase_storage import supabase_delete
            supabase_delete(pending.file_path)
    except Exception as exc:
        logger.warning("Storage cleanup failed for pending %s: %s", pending_id, exc)

    db.delete(pending)
    link.uploaded_count = max(0, link.uploaded_count - 1)
    db.commit()

    return {"message": "Archivo eliminado"}


@router.post("/public/{token}/process")
async def process_public_pending_uploads(
    token: str,
    db: Session = Depends(get_db),
):
    link = db.query(UploadLink).filter(
        UploadLink.token == token,
        UploadLink.is_active.is_(True),
    ).first()

    if not link:
        raise HTTPException(status_code=404, detail="Enlace temporal no válido")

    pendings = db.query(PendingUpload).filter(
        PendingUpload.upload_link_id == link.id,
        PendingUpload.processed.is_(False),
    ).all()

    if not pendings:
        return {"message": "No hay archivos pendientes", "success_count": 0, "errors": []}

    success_count = 0
    errors: list[str] = []

    for pending in pendings:
        try:
            pending.processed = True
            db.flush()

            invoice = Invoice(
                tenant_id=link.tenant_id,
                organization_id=link.organization_id,
                filename=pending.filename,
                file_path=pending.file_path,
                file_type=pending.file_type,
                file_size=pending.file_size,
                processed=False,
                upload_link_id=link.id,
            )
            invoice_repo.create(db, invoice)
            db.flush()

            await processing_service.process_invoice_record(
                db, invoice, link.tenant_id, link.organization_id,
            )

            db.delete(pending)
            db.commit()

            try:
                await websocket_manager.notify_new_invoice_upload(
                    str(invoice.id), pending.filename,
                    org_id=str(link.organization_id), tenant_id=str(link.tenant_id),
                )
            except Exception:
                logger.warning("WS notify failed for public upload %s", invoice.id)

            success_count += 1

        except Exception as exc:
            logger.error("Public process error for %s: %s", pending.id, exc)
            pending.processed = False
            db.commit()
            errors.append(f"{pending.filename}: {exc}")

    link.is_active = False
    db.commit()

    return {
        "message": f"{success_count} de {len(pendings)} procesadas",
        "success_count": success_count,
        "errors": errors,
    }


@router.get("/links/{link_id}/invoices")
async def get_link_invoices(
    link_id: UUID,
    ctx: TenantContext = Depends(require_tenant),
):
    # Verify link belongs to this tenant/org
    link = ctx.db.query(UploadLink).filter(
        UploadLink.id == link_id,
        UploadLink.tenant_id == ctx.tenant_id,
        UploadLink.organization_id == ctx.org_id,
    ).first()

    if not link:
        raise HTTPException(status_code=404, detail="Enlace temporal no encontrado")

    invoices = ctx.db.query(Invoice).filter(
        Invoice.upload_link_id == link_id,
        Invoice.tenant_id == ctx.tenant_id,
        Invoice.organization_id == ctx.org_id,
    ).order_by(desc(Invoice.created_at)).all()

    return {"invoices": [inv.to_dict() for inv in invoices]}

