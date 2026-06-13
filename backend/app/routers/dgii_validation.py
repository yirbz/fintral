import json
import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.dependencies.tenant import TenantContext, require_tenant
from app.models import Invoice
from app.services.dgii_validation import dgii_validation_service
from app.utils.dates import utc_now

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/dgii/validation", tags=["dgii_validation"])


class ValidateQrRequest(BaseModel):
    qr_url: str


class ValidateEcfRequest(BaseModel):
    rnc_emisor: str
    encf: str
    monto_total: float
    codigo_seguridad: str


class ValidateInvoiceRequest(BaseModel):
    invoice_id: str


@router.post("/qr")
async def validate_qr(
    body: ValidateQrRequest,
):
    result = await dgii_validation_service.validate_qr(body.qr_url)
    return result.to_dict()


@router.post("/ecf")
async def validate_ecf(
    body: ValidateEcfRequest,
):
    result = await dgii_validation_service.validate_ecf(
        rnc_emisor=body.rnc_emisor,
        encf=body.encf,
        monto_total=body.monto_total,
        codigo_seguridad=body.codigo_seguridad,
    )
    return result.to_dict()


@router.post("/scan")
async def scan_uploaded_qr(
    file: UploadFile = File(...),
):
    image_data = await file.read()
    qr_results = dgii_validation_service.detect_qr_codes_bytes(image_data)

    if not qr_results:
        return {
            "success": False,
            "message": "No se detectaron códigos QR en la imagen",
            "qr_count": 0,
            "results": [],
        }

    validated = []
    for qr in qr_results:
        parsed = qr.get("parsed")
        if parsed:
            result = await dgii_validation_service.validate_qr(qr["text"])
            validated.append({
                "qr_text": qr["text"],
                "validation": result.to_dict(),
            })
        else:
            validated.append({
                "qr_text": qr["text"],
                "validation": {
                    "status": "error",
                    "error": "El código QR no corresponde a un comprobante fiscal electrónico (e-CF) de la DGII",
                },
            })

    return {
        "success": True,
        "message": f"Se detectaron {len(qr_results)} código(s) QR",
        "qr_count": len(qr_results),
        "results": validated,
    }


@router.post("/invoice/{invoice_id}")
async def validate_invoice(
    invoice_id: str,
    ctx: TenantContext = Depends(require_tenant),
):
    invoice = ctx.db.query(Invoice).filter(
        Invoice.id == invoice_id,
        Invoice.tenant_id == ctx.tenant_id,
        Invoice.organization_id == ctx.org_id,
        Invoice.is_deleted.is_(False),
    ).first()

    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    extracted = {}
    if invoice.raw_extracted_data:
        try:
            extracted = json.loads(invoice.raw_extracted_data)
        except (json.JSONDecodeError, TypeError):
            extracted = {}

    rnc_emisor = (
        (invoice.vendor_tax_id or "").strip()
        or (extracted.get("rnc_emisor") or "").strip()
        or (extracted.get("vendor_tax_id") or "").strip()
    )
    encf = (
        (invoice.invoice_number or "").strip()
        or (extracted.get("eNCF") or "").strip()
        or (extracted.get("encf") or "").strip()
        or (extracted.get("invoice_number") or "").strip()
    )
    monto_total = (
        invoice.total_amount
        or extracted.get("monto_total")
        or extracted.get("total_amount")
    )

    qr_data = extracted.get("dgii_qr_data") or extracted.get("qr_data")
    codigo_seguridad = (
        (invoice.dgii_security_code or "").strip()
        or (extracted.get("dgii_security_code") or "").strip()
        or (extracted.get("codigo_seguridad") or "").strip()
        or ((qr_data.get("codigo_seguridad") or "").strip() if isinstance(qr_data, dict) else None)
    )

    # If missing required fields or security code, try to extract from document QR
    is_ecf = str(encf or "").strip().upper().startswith("E") if encf else True
    needs_qr = not rnc_emisor or not encf or (is_ecf and not codigo_seguridad)

    if needs_qr and invoice.file_path:
        from app.routers.dgii import _extract_qr_from_invoice_image
        extracted_qr = await _extract_qr_from_invoice_image(invoice.file_path)
        if extracted_qr:
            if extracted_qr.get("codigo_seguridad"):
                codigo_seguridad = extracted_qr.get("codigo_seguridad")
            if extracted_qr.get("rnc_emisor"):
                rnc_emisor = extracted_qr.get("rnc_emisor")
            if extracted_qr.get("encf"):
                encf = extracted_qr.get("encf")
            if not monto_total or monto_total == 0:
                monto_total = extracted_qr.get("monto_total")

    if not rnc_emisor or not encf or not monto_total:
        raise HTTPException(
            status_code=400,
            detail=(
                "La factura no tiene datos suficientes para validación DGII. "
                "Se requiere: RNC Emisor, e-NCF y Monto Total."
            ),
        )

    # Detect if NCF is electronic (starts with E)
    is_ecf = str(encf).strip().upper().startswith("E")

    if is_ecf:
        result = await dgii_validation_service.validate_ecf(
            rnc_emisor=str(rnc_emisor),
            encf=str(encf).strip().upper(),
            monto_total=float(monto_total),
            codigo_seguridad=str(codigo_seguridad or ""),
        )
        result_dict = result.to_dict()
    else:
        from app.services.dgii_scraper import dgii_scraper
        scraper_result = await dgii_scraper.consultar_ncf(
            rnc=str(rnc_emisor),
            ncf=str(encf).strip().upper(),
        )
        status = "accepted" if scraper_result.found else "rejected"
        if scraper_result.blocked:
            status = "error"
        result_dict = {
            "status": status,
            "estado_dgii": scraper_result.estado,
            "razon_social": scraper_result.razon_social,
            "rnc_emisor": scraper_result.rnc or rnc_emisor,
            "encf": scraper_result.ncf or encf,
            "description": scraper_result.raw_message or scraper_result.error,
            "validated_at": utc_now().isoformat(),
        }

    # Persist updated values to database
    invoice.dgii_validation_status = result_dict["status"]
    invoice.dgii_validation_date = utc_now()
    if codigo_seguridad:
        invoice.dgii_security_code = str(codigo_seguridad)
    if monto_total and not invoice.total_amount:
        invoice.total_amount = float(monto_total)
    if rnc_emisor and invoice.vendor_tax_id != rnc_emisor:
        invoice.vendor_tax_id = str(rnc_emisor)
    if encf and invoice.invoice_number != encf:
        invoice.invoice_number = str(encf)
    if is_ecf:
        invoice.is_electronic = True

    invoice.dgii_validation_detail = json.dumps({
        "status": result_dict["status"],
        "estado_dgii": result_dict.get("estado_dgii"),
        "razon_social": result_dict.get("razon_social"),
        "rnc_emisor": result_dict.get("rnc_emisor") or rnc_emisor,
        "encf": result_dict.get("encf") or encf,
        "description": result_dict.get("description"),
        "validated_at": result_dict["validated_at"],
    }, ensure_ascii=False)

    ctx.db.commit()
    ctx.db.refresh(invoice)

    return {
        "invoice_id": invoice_id,
        "validation": result_dict,
    }


@router.get("/{invoice_id}")
async def get_validation_status(
    invoice_id: str,
    ctx: TenantContext = Depends(require_tenant),
):
    invoice = ctx.db.query(Invoice).filter(
        Invoice.id == invoice_id,
        Invoice.tenant_id == ctx.tenant_id,
        Invoice.organization_id == ctx.org_id,
        Invoice.is_deleted.is_(False),
    ).first()

    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    detail = {}
    if invoice.dgii_validation_detail:
        try:
            detail = json.loads(invoice.dgii_validation_detail)
        except (json.JSONDecodeError, TypeError):
            detail = {"raw": invoice.dgii_validation_detail}

    return {
        "invoice_id": invoice_id,
        "invoice_number": invoice.invoice_number,
        "dgii_validation_status": invoice.dgii_validation_status or "unchecked",
        "dgii_validation_date": invoice.dgii_validation_date.isoformat() if invoice.dgii_validation_date else None,
        "dgii_security_code": invoice.dgii_security_code,
        "detail": detail,
    }
