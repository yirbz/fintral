# -*- coding: utf-8 -*-
"""Router dedicado a exportaciones y gestión DGII (606, 607, 608).
Expone endpoints con filtros ricos pensados para el flujo del contador:
filtrar por rango de fechas, categorías, tipo de bienes/servicios, proveedor.
"""
import html
import io
import json
import logging
import re
import httpx
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.config import IS_DEVELOPMENT, SUPABASE_STORAGE_BUCKET, SUPABASE_URL
from app.core.container import export_service
from app.dependencies.tenant import TenantContext, require_tenant
from app.models import DgiiSubmission, Invoice, InvoiceDgiiStatus
from app.repositories import InvoiceRepository
from app.services.supabase_storage import download_file
from app.utils.dates import utc_now

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/dgii", tags=["dgii"])

invoice_repo = InvoiceRepository()


# ── Schemas ────────────────────────────────────────────────────────────────

class DgiiConciliateRequest(BaseModel):
    format: str = "606"
    period: Optional[str] = None


class DgiiFixRequest(BaseModel):
    fields: Dict[str, Any] = {}


class DgiiDeferRequest(BaseModel):
    target_period: str


class DgiiExcludeRequest(BaseModel):
    reason: str = ""


class DgiiVerifyNcfRequest(BaseModel):
    invoice_ids: List[str]


class ConciliationProblem(BaseModel):
    code: str
    message: str
    severity: str  # "error" or "warning"


class ConciliationConflict(BaseModel):
    id: str
    vendor_name: str
    invoice_number: str
    total_amount: Optional[float]
    fiscal_status: str
    problems: List[ConciliationProblem]
    suggested_actions: List[str]
    editable_fields: Dict[str, Any]


class DgiiExportRequest(BaseModel):
    format: str  # "dgii_606" | "dgii_607" | "dgii_608"
    # Rango de fechas (YYYY-MM-DD)
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    # Filtros adicionales
    categories: Optional[List[str]] = None
    goods_types: Optional[List[str]] = None    # ["01", "07", ...]
    vendor_search: Optional[str] = None
    source_types: Optional[List[str]] = None   # ["xml", "pdf_text", ...]
    # Override: si se pasan IDs explícitos, ignora los demás filtros
    invoice_ids: Optional[List[str]] = None
    # IDs a excluir (usado por fix de duplicados)
    exclude_ids: Optional[List[str]] = None
    # Período (YYYYMM) — alternativa rápida a date_from/date_to
    period: Optional[str] = None               # "202605"
    # Opciones
    processed_only: bool = True
    include_no_ncf: bool = False               # Para 608, incluir sin NCF
    # Excluir facturas ya reportadas en submissions previas para este formato/período
    exclude_reported: bool = True
    # Auto-fixes a aplicar antes de preview/export
    auto_fixes: List[str] = []                 # "deduplicate", "recalculate_itbis", "assign_goods_type"
    # Formato de salida: "xls" (plantilla .xlsx), "csv" (rápido), o "dgii_txt" (oficial DGII, listo para subir)
    output_format: str = "dgii_txt"


class DgiiSummaryRequest(BaseModel):
    report: str = "606"    # "606" | "607" | "608"
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    period: Optional[str] = None   # "202605" — alternativa


class CreateDgiiSubmissionRequest(BaseModel):
    format: str                    # "606" | "607" | "608"
    period: str                    # "202605"
    invoice_ids: List[str]
    notes: Optional[str] = None
    status: Optional[str] = "pending_confirm"  # "pending_confirm" | "pending_upload"






# ── Citizen lookup ──────────────────────────────────────────────────────────

_CEDULA_URL = "https://dgii.gov.do/app/WebApps/ConsultasWeb2/ConsultasWeb/consultas/ciudadanos.aspx"
_DGII_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

_VIEWSTATE_RE = re.compile(r'id="__VIEWSTATE" value="([^"]+)"')
_VIEWSTATEGEN_RE = re.compile(r'id="__VIEWSTATEGENERATOR" value="([^"]+)"')
_EVENTVALIDATION_RE = re.compile(r'id="__EVENTVALIDATION" value="([^"]+)"')
_UPDATE_PANEL_RE = re.compile(r"updatePanel\|upMainMaster\|([\s\S]*?)(?=\|8\|hiddenField|$)")


def _extract_form_fields(html: str) -> dict[str, str]:
    viewstate = _VIEWSTATE_RE.search(html)
    viewstate_gen = _VIEWSTATEGEN_RE.search(html)
    event_validation = _EVENTVALIDATION_RE.search(html)
    return {
        "__VIEWSTATE": viewstate.group(1) if viewstate else "",
        "__VIEWSTATEGENERATOR": viewstate_gen.group(1) if viewstate_gen else "",
        "__EVENTVALIDATION": event_validation.group(1) if event_validation else "",
    }


def _parse_ajax_response(response: str) -> str:
    match = _UPDATE_PANEL_RE.search(response)
    return match.group(1).strip() if match else ""


def _extract_ciudadano_name(content: str) -> str | None:
    table_match = re.search(r'<table[^>]*id="cphMain_dvResultadoCedula"[^>]*>([\s\S]*?)</table>', content)
    if table_match:
        rows = re.findall(r'<tr[^>]*>([\s\S]*?)</tr>', table_match.group(1))
        for row in rows:
            cells = re.findall(r'<td[^>]*>([\s\S]*?)</td>', row)
            if len(cells) >= 2:
                label = re.sub(r'<[^>]*>', '', cells[0]).strip().lower()
                if 'nombre' in label or 'razon' in label:
                    raw = re.sub(r'<[^>]*>', '', cells[1])
                    return re.sub(r'\s+', ' ', html.unescape(raw.strip()))
    return None


@router.get("/ciudadano")
async def dgii_ciudadano_lookup(
    cedula: str = Query(..., min_length=11, max_length=11, description="Cédula de identidad (11 dígitos)"),
):
    """Busca un ciudadano por cédula en el portal de la DGII y devuelve su nombre."""
    if not cedula.isdigit():
        raise HTTPException(status_code=400, detail="La cédula debe contener solo dígitos")

    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
        try:
            html = await client.get(
                _CEDULA_URL,
                headers={"User-Agent": _DGII_USER_AGENT},
            )
            html.raise_for_status()

            fields = _extract_form_fields(html.text)
            if not fields["__VIEWSTATE"]:
                raise HTTPException(status_code=502, detail="No se pudo extraer el formulario de la DGII")

            fields["ctl00$cphMain$txtCedula"] = cedula
            fields["ctl00$cphMain$btnBuscarCedula"] = "Buscar"
            fields["__ASYNCPOST"] = "true"

            resp = await client.post(
                _CEDULA_URL,
                data=fields,
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": _DGII_USER_AGENT,
                },
            )
            resp.raise_for_status()

            content = _parse_ajax_response(resp.text)
            if not content:
                return {"cedula": cedula, "name": None, "found": False}

            name = _extract_ciudadano_name(content)
            if name:
                return {"cedula": cedula, "name": name, "found": True}
            return {"cedula": cedula, "name": None, "found": False}

        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Error al consultar la DGII: {exc}",
            ) from exc


# ── Helpers ────────────────────────────────────────────────────────────────

def _parse_date(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%Y%m%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def _period_to_range(period: str):
    """Convierte "202605" → (2026-05-01, 2026-05-31)."""
    try:
        year = int(period[:4])
        month = int(period[4:6])
        from calendar import monthrange
        _, last_day = monthrange(year, month)
        date_from = datetime(year, month, 1)
        date_to = datetime(year, month, last_day, 23, 59, 59)
        return date_from, date_to
    except Exception:
        return None, None


def _load_invoices_by_ids(db, invoice_ids: List[str], tenant_id, org_id) -> Dict[str, Invoice]:
    if not invoice_ids:
        return {}
    invoices = db.query(Invoice).filter(
        Invoice.tenant_id == tenant_id,
        Invoice.organization_id == org_id,
        Invoice.id.in_(invoice_ids),
    ).all()
    return {str(inv.id): inv for inv in invoices}


def _build_submission_report_snapshots(
    invoices_by_id: Dict[str, Invoice],
    ordered_ids: List[str],
    format_code: str,
    report_rnc: Optional[str],
) -> Dict[str, Dict[str, str]]:
    snapshots: Dict[str, Dict[str, str]] = {}
    for invoice_id in ordered_ids:
        inv = invoices_by_id.get(str(invoice_id))
        if not inv:
            continue
        snapshots[str(invoice_id)] = export_service.build_submission_report_row(
            format_code=format_code,
            invoice=inv,
            report_rnc=report_rnc,
        )
    return snapshots


def _normalize_ncf(value: Optional[str]) -> str:
    return (value or "").strip().upper()


def _invoice_ncf(inv: Optional[Invoice]) -> str:
    if not inv:
        return ""
    direct = _normalize_ncf(getattr(inv, "invoice_number", None))
    if direct:
        return direct

    raw_payload = getattr(inv, "raw_extracted_data", None)
    if not raw_payload:
        return ""
    try:
        raw = json.loads(raw_payload)
    except (json.JSONDecodeError, TypeError):
        return ""
    return _normalize_ncf(raw.get("invoice_number"))


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


def _get_confirmed_reported_ncfs(ctx: TenantContext, fmt: str) -> set[str]:
    """NCFs ya aceptados por DGII para el formato.

    Regla dura: si un NCF fue aceptado (status por factura "reported") dentro de un
    submission finalizado ("confirmed" o "partial_error"), no puede volver a reportarse.
    """
    rows = (
        ctx.db.query(InvoiceDgiiStatus.report_snapshot, Invoice.invoice_number)
        .join(DgiiSubmission, DgiiSubmission.id == InvoiceDgiiStatus.submission_id)
        .outerjoin(Invoice, Invoice.id == InvoiceDgiiStatus.invoice_id)
        .filter(
            DgiiSubmission.tenant_id == ctx.tenant_id,
            DgiiSubmission.organization_id == ctx.org_id,
            InvoiceDgiiStatus.format == fmt,
            InvoiceDgiiStatus.status == "reported",
            DgiiSubmission.status.in_(["confirmed", "partial_error"]),
        )
        .all()
    )

    ncfs: set[str] = set()
    for snapshot, invoice_number in rows:
        ncf = _snapshot_ncf(snapshot) or _normalize_ncf(invoice_number)
        if ncf:
            ncfs.add(ncf)
    return ncfs


def _filter_confirmed_ncf_invoices(invoices: list, ctx: TenantContext, fmt: str) -> list:
    """Excluye facturas cuyo NCF ya fue aceptado por DGII en este formato."""
    confirmed_ncfs = _get_confirmed_reported_ncfs(ctx, fmt)
    if not confirmed_ncfs:
        return invoices
    return [inv for inv in invoices if (_invoice_ncf(inv) not in confirmed_ncfs)]


def _is_confirmed_ncf_blocked(inv: Optional[Invoice], confirmed_ncfs: set[str]) -> bool:
    ncf = _invoice_ncf(inv)
    return bool(ncf and ncf in confirmed_ncfs)

# NCF document types from python-stdnum/stdnum/do/ncf.py
_NCF_DOC_TYPES = {'01', '02', '03', '04', '11', '12', '13', '14', '15', '16', '17'}
_ECF_DOC_TYPES = {'31', '32', '33', '34', '41', '43', '44', '45', '46', '47'}
# Valid payment methods from DGII macro (606 uses "01"-"10", but "01"-"07" most common)
_VALID_PAYMENT_METHODS = {f"{i:02d}" for i in range(1, 11)} | {"1", "2", "3", "4", "5", "6", "7", "8", "9", "10"}
# Valid ISR retention types
_VALID_ISR_TYPES = {f"{i:02d}" for i in range(1, 10)}
# Valid goods/services types (606)
_VALID_GOODS_TYPES = {f"{i:02d}" for i in range(1, 12)}
# Max length for numeric fields (12 digits + 2 decimals per VBA validator)
_MAX_AMOUNT_VALUE = 999_999_999_999.99
_REPORT_RECORD_LIMITS = {
    "dgii_606": 10_000,
    "dgii_607": 65_000,
    "dgii_608": 5_000,
}
_REPORT_MIN_PERIODS = {
    "dgii_606": 201805,
    "dgii_607": 201805,
    "dgii_608": 200701,
}
_SELF_ISSUED_606_NCF_TYPES = {"13", "17", "43", "47"}
_CONSUMER_FINAL_NCF_TYPES = {"02", "32"}
_CREDIT_NOTE_NCF_TYPES = {"04", "34"}
_CONSUMER_FINAL_ID_THRESHOLD = 250_000

ITBIS_RATES = [0.18, 0.16, 0.0]
ITBIS_TOLERANCE = 0.02  # 2% tolerance for rounding


# ── Electronic issuer restriction helpers ────────────────────────────────────

def _get_electronic_issuer_restrictions(ctx: TenantContext) -> dict:
    """
    Retorna las restricciones de reportes según si la organización es emisora electrónica.

    Si NO es emisora: sin restricciones — puede reportar cualquier comprobante.
    Si SÍ es emisora:
      - 606: solo compras a proveedores NO emisores (NCFs que NO empiecen con E)
      - 607: solo ventas con NCF físico (B0<N>) como fallback; la cola offline
             se valida desde el frontend
      - 608: prohibido
    """
    is_issuer = bool(ctx.organization.is_ecf_authorized)
    if not is_issuer:
        return {
            "is_electronic_issuer": False,
            "restrictions": {},
        }

    return {
        "is_electronic_issuer": True,
        "restrictions": {
            "dgii_606": {
                "restricted": True,
                "rule": "non_issuer_suppliers_only",
                "message": "Como emisor electrónico, solo puedes reportar compras de proveedores "
                           "no emisores. Las facturas con NCF electrónico (E*) se excluyen "
                           "automáticamente.",
            },
            "dgii_607": {
                "restricted": True,
                "rule": "physical_fallback_only",
                "message": "Como emisor electrónico, solo puedes reportar ventas con "
                           "comprobantes físicos (B0*). Las facturas electrónicas (E*) se "
                           "reportan directamente a la DGII.",
            },
            "dgii_608": {
                "restricted": True,
                "rule": "prohibited",
                "message": "Los emisores electrónicos no pueden generar Formulario 608. "
                           "Las anulaciones de comprobantes electrónicos se gestionan "
                           "directamente en el sistema de facturación electrónica.",
            },
        },
    }


def _filter_invoices_by_issuer_restrictions(
    invoices: list,
    fmt: str,
    restrictions: dict,
) -> tuple[list, int]:
    """
    Filtra facturas según las restricciones de emisor electrónico.
    Retorna (invoices_filtradas, cantidad_excluidas).
    """
    fmt_restrictions = restrictions.get("restrictions", {}).get(fmt, {})
    if not fmt_restrictions.get("restricted"):
        return invoices, 0

    rule = fmt_restrictions.get("rule")
    excluded = 0
    filtered = []

    for inv in invoices:
        ncf = (inv.invoice_number or "").strip().upper()
        if rule == "non_issuer_suppliers_only":
            # Incluir solo facturas donde el NCF NO es electrónico (no empieza con E)
            # o no tiene NCF (probablemente de fuente no electrónica)
            if ncf and ncf.startswith("E"):
                excluded += 1
                continue
            filtered.append(inv)

        elif rule == "physical_fallback_only":
            # Incluir solo facturas de venta (income) con NCF físico B0*
            if inv.transaction_type != "income":
                excluded += 1
                continue
            if ncf and not ncf.startswith("B0"):
                excluded += 1
                continue
            filtered.append(inv)

        else:
            filtered.append(inv)

    return filtered, excluded


# ── Validation engine ─────────────────────────────────────────────────────

def _is_valid_ncf(ncf: Optional[str]) -> bool:
    """Valida NCF dominicano según especificación python-stdnum/stdnum/do/ncf.py.

    Formatos válidos:
    - B + 2-digit doc type (01-17) + 7-digit serial = 11 chars (NCF tradicional)
    - E + 2-digit doc type (31-47) + 8-digit serial = 13 chars (e-CF)
    - A/P + 18 digits = 19 chars (formato pre-2018, raro)
    """
    if not ncf:
        return False
    ncf = ncf.strip().upper()
    if len(ncf) == 13:
        return ncf[0] == 'E' and ncf[1:].isdigit() and ncf[1:3] in _ECF_DOC_TYPES
    elif len(ncf) == 11:
        return ncf[0] == 'B' and ncf[1:].isdigit() and ncf[1:3] in _NCF_DOC_TYPES
    elif len(ncf) == 19:
        return ncf[0] in 'AP' and ncf[1:].isdigit() and ncf[9:11] in _NCF_DOC_TYPES
    return False


def _ncf_errors(ncf: Optional[str]) -> Optional[str]:
    """Retorna mensaje de error específico para un NCF inválido, o None si es válido."""
    if not ncf:
        return "Falta NCF"
    ncf = ncf.strip().upper()
    if len(ncf) not in (11, 13, 19):
        return f"NCF '{ncf}' longitud inválida ({len(ncf)} chars, debe ser 11 o 13)"
    if len(ncf) == 13:
        if ncf[0] != 'E':
            return f"NCF e-CF debe iniciar con 'E', encontrado '{ncf[0]}'"
        if not ncf[1:].isdigit():
            return f"NCF '{ncf}' contiene caracteres no numéricos"
        if ncf[1:3] not in _ECF_DOC_TYPES:
            return f"NCF tipo documento '{ncf[1:3]}' no válido (e-CF: {', '.join(sorted(_ECF_DOC_TYPES))})"
    elif len(ncf) == 11:
        if ncf[0] != 'B':
            return f"NCF tradicional debe iniciar con 'B', encontrado '{ncf[0]}'"
        if not ncf[1:].isdigit():
            return f"NCF '{ncf}' contiene caracteres no numéricos"
        if ncf[1:3] not in _NCF_DOC_TYPES:
            return f"NCF tipo documento '{ncf[1:3]}' no válido (NCF: {', '.join(sorted(_NCF_DOC_TYPES))})"
    elif len(ncf) == 19:
        if ncf[0] not in 'AP':
            return f"NCF pre-2018 debe iniciar con 'A' o 'P', encontrado '{ncf[0]}'"
        if not ncf[1:].isdigit():
            return f"NCF '{ncf}' contiene caracteres no numéricos"
    return None


def _is_valid_rnc(rnc: Optional[str]) -> bool:
    """Valida RNC/Cédula dominicano usando la utilidad centralizada."""
    from app.utils.validation import is_valid_rnc_or_cedula
    return is_valid_rnc_or_cedula(rnc)


def _rnc_errors(rnc_val: Optional[str]) -> Optional[str]:
    """Retorna mensaje de error específico para un RNC/Cédula inválido, o None si es válido."""
    if not rnc_val:
        return "Falta RNC/Cédula"
    digits = re.sub(r"\D", "", str(rnc_val))
    if not digits:
        return f"RNC/Cédula '{rnc_val}' no contiene dígitos"
    if len(digits) not in (9, 11):
        return f"RNC/Cédula '{digits}' longitud inválida ({len(digits)} dígitos, debe ser 9 o 11)"
    
    from app.utils.validation import validate_rnc_checksum, validate_cedula_checksum
    if len(digits) == 9:
        if not validate_rnc_checksum(digits):
            from app.utils.validation import rnc_calc_check_digit
            expected = rnc_calc_check_digit(digits[:8])
            return f"RNC '{digits}' dígito verificador inválido (esperado '{expected}', encontrado '{digits[8]}')"
    elif len(digits) == 11:
        if not validate_cedula_checksum(digits):
            return f"Cédula '{digits}' dígito verificador (Luhn) inválido"
    return None



def _only_digits(value: Optional[str]) -> str:
    if not value:
        return ""
    return re.sub(r"\D", "", str(value))


def _to_number(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _ncf_document_type(ncf: Optional[str]) -> str:
    if not ncf:
        return ""
    value = str(ncf).strip().upper()
    if len(value) == 13 and value.startswith("E"):
        return value[1:3]
    if len(value) == 11 and value[0] in {"B", "A", "P", "Q"}:
        return value[1:3]
    if len(value) == 19 and value[0] in {"A", "P", "Q"}:
        return value[9:11]
    return ""


def _normalize_payment_method(value: Any) -> Optional[str]:
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    if raw.isdigit():
        code = int(raw)
        return f"{code:02d}" if 1 <= code <= 10 else None
    text = raw.lower()
    if "efectivo" in text:
        return "01"
    if "cheque" in text or "transfer" in text or "depósito" in text or "deposito" in text:
        return "02"
    if "tarjeta" in text:
        return "03"
    if "crédito" in text or "credito" in text:
        return "04"
    if "permuta" in text:
        return "05"
    if "bono" in text or "certificado" in text or "nota de crédito" in text or "nota de credito" in text:
        return "06"
    if "mixto" in text or "otra" in text:
        return "07"
    return None


def _normalize_isr_retention_type(value: Any) -> Optional[str]:
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    if raw.isdigit():
        code = int(raw[:2])
        return f"{code:02d}" if 1 <= code <= 9 else None
    return None


def _invoice_tax_id_for_report(inv, fmt: str, raw: Dict[str, Any], report_rnc: Optional[str] = None) -> str:
    ncf_type = _ncf_document_type(inv.invoice_number or raw.get("invoice_number"))
    if fmt == "dgii_606" and ncf_type in _SELF_ISSUED_606_NCF_TYPES:
        return _only_digits(report_rnc)
    return _only_digits(inv.vendor_tax_id or raw.get("vendor_tax_id") or raw.get("buyer_tax_id"))


def _is_607_identification_optional(inv, raw: Dict[str, Any]) -> bool:
    ncf_type = _ncf_document_type(inv.invoice_number or raw.get("invoice_number"))
    total = _to_number(inv.total_amount) or _to_number(raw.get("total_amount")) or 0.0
    return ncf_type in _CONSUMER_FINAL_NCF_TYPES and total < _CONSUMER_FINAL_ID_THRESHOLD


def _validate_report_header(fmt: str, report_rnc: Optional[str], period: Optional[str], record_count: int) -> List[str]:
    errors: List[str] = []
    report_rnc_digits = _only_digits(report_rnc)
    rnc_err = _rnc_errors(report_rnc_digits)
    if rnc_err:
        errors.append(f"RNC/Cédula declarante: {rnc_err}")

    period_value = (period or "").strip()
    if not period_value:
        errors.append("Período fiscal: falta período AAAAMM")
    elif not re.fullmatch(r"\d{6}", period_value):
        errors.append("Período fiscal inválido: debe usar formato AAAAMM")
    else:
        month = int(period_value[4:6])
        if month < 1 or month > 12:
            errors.append("Período fiscal inválido: mes fuera de rango")
        min_period = _REPORT_MIN_PERIODS.get(fmt)
        if min_period and int(period_value) < min_period:
            errors.append(f"Período fiscal inválido: debe ser mayor o igual a {min_period}")

    limit = _REPORT_RECORD_LIMITS.get(fmt)
    if limit and record_count > limit:
        errors.append(f"Cantidad de registros excede el máximo del {fmt[-3:]} ({record_count} > {limit})")

    return errors


def _check_itbis(total: Optional[float], tax: Optional[float]) -> Optional[str]:
    """Valida ITBIS contra tasas aceptadas (18%, 16%, 0%). Retorna descripción si hay error."""
    if total is None or total == 0 or tax is None:
        return None
    base = total - tax
    if base <= 0:
        return None
    for rate in ITBIS_RATES:
        expected = base * rate
        if expected == 0 and tax == 0:
            return None
        if expected and abs(tax - expected) / expected <= ITBIS_TOLERANCE:
            return None
    rates_str = "/".join(f"{r*100:.0f}%" for r in ITBIS_RATES)
    return f"ITBIS ({tax:.2f}) no corresponde a ninguna tasa ({rates_str}) sobre base {base:.2f}"


def _validate_invoice(inv, fmt: str, raw_cache: Dict, report_rnc: Optional[str] = None) -> dict:
    """Valida una factura individual para DGII.

    Replica las validaciones del VBA clsFormato606Validator / clsFormato607Validator:
    - NCF: formato, longitud, tipo documento válido
    - RNC: formato, longitud, dígito de control (checksum)
    - Montos: no negativos, no exceden 12 dígitos
    - Tipo B/S: rango 01-11 (solo 606)
    - Forma de pago: rango 01-10
    - Tipo retención ISR: rango 01-09
    - NCF modificado: si existe, formato válido
    - Fecha: presente y formatable a YYYYMMDD
    """
    errors: List[str] = []
    warnings: List[str] = []

    raw = raw_cache.get(str(inv.id))
    if raw is None and inv.raw_extracted_data:
        try:
            raw = json.loads(inv.raw_extracted_data)
            raw_cache[str(inv.id)] = raw
        except (json.JSONDecodeError, TypeError):
            raw = {}
            raw_cache[str(inv.id)] = {}
    if raw is None:
        raw = {}

    ncf = (inv.invoice_number or raw.get("invoice_number") or "").strip()
    ncf_type = _ncf_document_type(ncf)
    rnc = _invoice_tax_id_for_report(inv, fmt, raw, report_rnc)

    # ── NCF validation (blocking) ──
    ncf_err = _ncf_errors(ncf)
    if ncf_err:
        errors.append(ncf_err)

    # ── RNC validation (blocking where the official detail requires it) ──
    if fmt != "dgii_608":
        if fmt == "dgii_607" and _is_607_identification_optional(inv, raw):
            if rnc:
                rnc_err = _rnc_errors(rnc)
                if rnc_err:
                    errors.append(rnc_err)
        else:
            rnc_err = _rnc_errors(rnc)
            if rnc_err:
                errors.append(rnc_err)

    # ── Monto total (blocking) ──
    if fmt != "dgii_608" and (inv.total_amount is None or inv.total_amount == 0):
        errors.append("Monto total en cero o vacío")
    elif fmt != "dgii_608" and inv.total_amount < 0:
        errors.append(f"Monto total negativo: {inv.total_amount}")
    elif fmt != "dgii_608" and inv.total_amount > _MAX_AMOUNT_VALUE:
        errors.append(f"Monto total excede máximo ({inv.total_amount} > {_MAX_AMOUNT_VALUE})")

    # ── Fecha comprobante (blocking) ──
    if not inv.invoice_date:
        errors.append("Falta fecha de comprobante")

    # ── Tipo B/S — solo 606 (blocking) ──
    if fmt == "dgii_606":
        gst = (inv.goods_services_type or "").strip()
        if not gst:
            errors.append("Falta tipo B/S (DGII 606)")
        elif gst not in _VALID_GOODS_TYPES:
            errors.append(f"Tipo B/S '{gst}' no válido (debe ser 01-11)")

    # ── Forma de pago / venta according to 606 and 607 templates ──
    payment = raw.get("payment_method")
    normalized_payment = _normalize_payment_method(payment)
    if fmt == "dgii_606":
        if not normalized_payment:
            if payment:
                errors.append(f"Forma de pago '{payment}' fuera de rango")
            else:
                errors.append("Falta forma de pago (DGII 606)")
    elif fmt == "dgii_607" and ncf_type not in _CREDIT_NOTE_NCF_TYPES:
        if not normalized_payment:
            if payment:
                errors.append(f"Forma de pago '{payment}' fuera de rango")
            else:
                errors.append("Falta forma de venta/cobro (DGII 607)")

    if payment and not normalized_payment and fmt == "dgii_608":
        errors.append(f"Forma de pago '{payment}' fuera de rango")

    # ── ITBIS validation (warning) ──
    itbis_issue = _check_itbis(inv.total_amount, inv.tax_amount)
    if itbis_issue:
        warnings.append(itbis_issue)

    # ── ITBIS negativo (blocking) ──
    if fmt != "dgii_608" and inv.tax_amount is not None and inv.tax_amount < 0:
        errors.append(f"ITBIS negativo: {inv.tax_amount}")

    # ── NCF modificado: si existe, debe tener formato válido (warning) ──
    ncf_mod = (raw.get("ncf_modified") or "").strip()
    if ncf_mod:
        ncf_mod_err = _ncf_errors(ncf_mod)
        if ncf_mod_err:
            warnings.append(f"NCF Modificado inválido: {ncf_mod_err}")

    # ── Forma de pago: si existe, rango válido (warning) ──
    # ── Tipo retención ISR: si hay monto, tipo debe ser válido (warning) ──
    isr_type = (raw.get("isr_retention_type") or "").strip()
    isr_amount = raw.get("isr_retention_amount")
    normalized_isr_type = _normalize_isr_retention_type(isr_type)
    if isr_type:
        if not normalized_isr_type or normalized_isr_type not in _VALID_ISR_TYPES:
            warnings.append(f"Tipo retención ISR '{isr_type}' no válido (debe ser 01-09)")
    if isr_amount and not isr_type:
        warnings.append("Tiene monto retención renta pero falta tipo de retención ISR")

    # ── Fecha de pago: requerida si hay retenciones (warning) ──
    itbis_retenido = raw.get("itbis_retenido")
    retencion_renta_terceros = raw.get("retencion_renta_terceros")
    if (itbis_retenido or isr_type or retencion_renta_terceros) and not raw.get("payment_date"):
        warnings.append("Falta fecha de pago (requerida para retenciones)")

    # ── Montos negativos en campos adicionales (warning) ──
    for field_name, field_label in [
        ("itbis_retenido", "ITBIS Retenido"),
        ("isr_retention_amount", "Retención Renta"),
        ("isc_amount", "ISC"),
        ("other_taxes", "Otros Impuestos"),
        ("legal_tip", "Propina Legal"),
    ]:
        val = raw.get(field_name)
        if val is not None:
            try:
                if float(val) < 0:
                    warnings.append(f"{field_label} negativo: {val}")
            except (ValueError, TypeError):
                pass

    status = "ok"
    if errors:
        status = "error" if len(errors) > 1 or any("Falta" in e for e in errors) else "warning"

    return {
        "status": status,
        "errors": errors,
        "warnings": warnings,
    }


def _find_duplicate_ncfs(invoices) -> List[dict]:
    """Detecta NCFs duplicados en el conjunto de facturas."""
    ncf_counter: Dict[str, List] = {}
    for inv in invoices:
        ncf = (inv.invoice_number or "").strip()
        if not ncf:
            continue
        if ncf not in ncf_counter:
            ncf_counter[ncf] = []
        ncf_counter[ncf].append({
            "id": str(inv.id),
            "vendor_name": inv.vendor_name or "",
            "total_amount": inv.total_amount,
        })
    return [
        {"ncf": ncf, "count": len(items), "invoices": items}
        for ncf, items in ncf_counter.items()
        if len(items) > 1
    ]


def _compute_dgii_validation(
    invoices,
    fmt: str,
    report_rnc: Optional[str] = None,
    period: Optional[str] = None,
) -> dict:
    """Valida todas las facturas y retorna estadísticas completas."""
    report_errors = _validate_report_header(fmt, report_rnc, period, len(invoices))
    total = len(invoices)
    if total == 0:
        return {
            "total_invoices": 0, "complete": 0, "issues": 0,
            "can_export": not report_errors, "has_duplicates": False, "has_itbis_errors": False,
            "missing_ncf": 0, "missing_rnc": 0, "missing_goods_type": 0,
            "invalid_ncf": 0, "invalid_rnc": 0, "zero_amount": 0,
            "missing_payment_method": 0, "invalid_payment_method": 0,
            "missing_report_rnc": int(any("declarante: Falta" in e for e in report_errors)),
            "invalid_report_rnc": int(any("declarante:" in e and "Falta" not in e for e in report_errors)),
            "invalid_period": int(any(e.startswith("Período fiscal") for e in report_errors)),
            "record_limit_exceeded": int(any("Cantidad de registros" in e for e in report_errors)),
            "report_errors": report_errors,
            "duplicates": [], "validation": [],
            "total_errors": len(report_errors), "total_warnings": 0,
            "total_amount": 0, "total_tax": 0,
        }

    raw_cache: Dict = {}
    all_errors: List[str] = []
    all_warnings: List[str] = []
    validation_by_id: Dict[str, dict] = {}
    has_duplicates = False
    has_itbis_errors = False

    # Validar cada factura
    for inv in invoices:
        v = _validate_invoice(inv, fmt, raw_cache, report_rnc=report_rnc)
        validation_by_id[str(inv.id)] = v
        for e in v.get("errors", []):
            all_errors.append(e)
        for w in v.get("warnings", []):
            all_warnings.append(w)
            if "ITBIS" in w:
                has_itbis_errors = True

    # Buscar NCFs duplicados
    duplicates = _find_duplicate_ncfs(invoices)
    if duplicates:
        has_duplicates = True
        for dup in duplicates:
            all_errors.append(f"NCF duplicado: {dup['ncf']} ({dup['count']} veces)")

    # Conteos
    missing_ncf = sum(
        1 for inv in invoices
        if not (inv.invoice_number or (raw_cache.get(str(inv.id)) or {}).get("invoice_number") or "").strip()
    )
    missing_rnc = 0
    invalid_rnc = 0
    missing_payment_method = 0
    invalid_payment_method = 0
    for inv in invoices:
        raw = raw_cache.get(str(inv.id)) or {}
        rnc = _invoice_tax_id_for_report(inv, fmt, raw, report_rnc)
        if fmt != "dgii_608" and not (fmt == "dgii_607" and _is_607_identification_optional(inv, raw)):
            if not rnc:
                missing_rnc += 1
            elif not _is_valid_rnc(rnc):
                invalid_rnc += 1

        payment = raw.get("payment_method")
        ncf_type = _ncf_document_type(inv.invoice_number or raw.get("invoice_number"))
        normalized_payment = _normalize_payment_method(payment)
        if fmt == "dgii_606" or (fmt == "dgii_607" and ncf_type not in _CREDIT_NOTE_NCF_TYPES):
            if not normalized_payment:
                if payment:
                    invalid_payment_method += 1
                else:
                    missing_payment_method += 1
        elif payment and not normalized_payment:
            invalid_payment_method += 1

    invalid_ncf = sum(
        1 for inv in invoices
        if (inv.invoice_number or (raw_cache.get(str(inv.id)) or {}).get("invoice_number") or "").strip()
        and not _is_valid_ncf(inv.invoice_number or (raw_cache.get(str(inv.id)) or {}).get("invoice_number"))
    )
    zero_amount = sum(1 for inv in invoices if fmt != "dgii_608" and (inv.total_amount is None or inv.total_amount == 0))
    missing_goods_type = (
        sum(1 for inv in invoices if not (inv.goods_services_type or "").strip())
        if fmt == "dgii_606" else 0
    )

    can_export = not report_errors and not has_duplicates and not any(
        v.get("errors") for v in validation_by_id.values()
    )

    complete = sum(
        1 for inv in invoices
        if not validation_by_id[str(inv.id)].get("errors")
    )

    total_amount = sum(inv.total_amount or 0 for inv in invoices)
    total_tax = sum(inv.tax_amount or 0 for inv in invoices)

    return {
        "total_invoices": total,
        "complete": complete,
        "issues": total - complete,
        "can_export": can_export,
        "has_duplicates": has_duplicates,
        "has_itbis_errors": has_itbis_errors,
        "missing_ncf": missing_ncf,
        "missing_rnc": missing_rnc,
        "missing_goods_type": missing_goods_type,
        "invalid_ncf": invalid_ncf,
        "invalid_rnc": invalid_rnc,
        "zero_amount": zero_amount,
        "missing_payment_method": missing_payment_method,
        "invalid_payment_method": invalid_payment_method,
        "missing_report_rnc": int(any("declarante: Falta" in e for e in report_errors)),
        "invalid_report_rnc": int(any("declarante:" in e and "Falta" not in e for e in report_errors)),
        "invalid_period": int(any(e.startswith("Período fiscal") for e in report_errors)),
        "record_limit_exceeded": int(any("Cantidad de registros" in e for e in report_errors)),
        "report_errors": report_errors,
        "duplicates": duplicates,
        "total_errors": len(all_errors) + len(report_errors),
        "total_warnings": len(all_warnings),
        "total_amount": round(total_amount, 2),
        "total_tax": round(total_tax, 2),
    }


# ── Auto-fix engine ────────────────────────────────────────────────────────

def _deduplicate_invoices(invoices):
    """Keep one invoice per NCF (most complete based on non-null fields)."""
    seen_ncfs: Dict[str, int] = {}
    kept_ncfs: set = set()
    result: List = []
    for inv in invoices:
        ncf = (inv.invoice_number or "").strip()
        if not ncf:
            result.append(inv)
            continue
        if ncf not in kept_ncfs:
            kept_ncfs.add(ncf)
            seen_ncfs[ncf] = len(result)
            result.append(inv)
        else:
            existing = result[seen_ncfs[ncf]]
            def score(x): return sum(1 for f in ['vendor_name', 'vendor_tax_id', 'total_amount', 'tax_amount', 'goods_services_type'] if getattr(x, f, None))
            if score(inv) > score(existing):
                result[seen_ncfs[ncf]] = inv
    return result


def _fix_itbis_in_db(db, invoices) -> int:
    """Recalcula ITBIS = total * 18/118 para facturas con ITBIS que no coincida con 18%, 16% ni 0%."""
    from app.models import Invoice
    from app.utils.dates import utc_now
    fixed = 0
    for inv in invoices:
        if inv.total_amount and inv.tax_amount is not None:
            base = inv.total_amount - inv.tax_amount
            if base > 0:
                matches_any = False
                for rate in ITBIS_RATES:
                    expected = base * rate
                    if expected == 0 and inv.tax_amount == 0:
                        matches_any = True
                        break
                    if expected and abs(inv.tax_amount - expected) / expected <= ITBIS_TOLERANCE:
                        matches_any = True
                        break
                if not matches_any:
                    corrected = round(inv.total_amount * 0.18 / (1 + 0.18), 2)
                    db.query(Invoice).filter(Invoice.id == inv.id).update({"tax_amount": corrected, "updated_at": utc_now()})
                    inv.tax_amount = corrected
                    fixed += 1
    if fixed:
        db.commit()
    return fixed


CATEGORY_TO_GOODS_TYPE = {
    "Servicios": "07", "servicios": "07",
    "Services": "07", "services": "07",
    "Equipo": "03", "equipo": "03",
    "Equipment": "03", "equipment": "03",
    "Materiales": "02", "materiales": "02",
    "Material": "02", "material": "02",
    "Oficina": "05", "oficina": "05",
    "Office": "05", "office": "05",
    "Alquiler": "08", "alquiler": "08",
    "Rent": "08", "rent": "08",
    "Viajes": "09", "viajes": "09",
    "Travel": "09", "travel": "09",
    "Combustible": "04", "combustible": "04",
    "Fuel": "04", "fuel": "04",
    "Inventario": "01", "inventario": "01",
    "Inventory": "01", "inventory": "01",
    "Nómina": "06", "nómina": "06",
    "Payroll": "06", "payroll": "06",
    "Representación": "09", "representación": "09",
    "Deducción": "10", "deducción": "10",
    "Proporcionalidad": "11", "proporcionalidad": "11",
    "Gastos": "07", "gastos": "07",
}


def _fix_goods_type_in_db(db, invoices, fmt) -> int:
    """Asigna tipo B/S basado en categoría de la factura."""
    if fmt != "dgii_606":
        return 0
    from app.models import Invoice
    from app.utils.dates import utc_now
    fixed = 0
    for inv in invoices:
        current = (inv.goods_services_type or "").strip()
        if not current and inv.category:
            mapped = CATEGORY_TO_GOODS_TYPE.get(inv.category.strip())
            if mapped:
                db.query(Invoice).filter(Invoice.id == inv.id).update({"goods_services_type": mapped, "updated_at": utc_now()})
                inv.goods_services_type = mapped
                fixed += 1
    if fixed:
        db.commit()
    return fixed


def _apply_auto_fixes(invoices, auto_fixes: List[str], db, fmt: str):
    """Apply requested auto-fixes. Returns (filtered_invoices, fix_report)."""
    report: Dict[str, int] = {}
    if not auto_fixes:
        return invoices, report

    if "deduplicate" in auto_fixes:
        before = len(invoices)
        invoices = _deduplicate_invoices(invoices)
        removed = before - len(invoices)
        if removed:
            report["duplicates_removed"] = removed

    if "recalculate_itbis" in auto_fixes:
        fixed = _fix_itbis_in_db(db, invoices)
        if fixed:
            report["itbis_fixed"] = fixed

    if "assign_goods_type" in auto_fixes:
        fixed = _fix_goods_type_in_db(db, invoices, fmt)
        if fixed:
            report["goods_type_fixed"] = fixed

    return invoices, report


# ── Endpoints ──────────────────────────────────────────────────────────────

@router.post("/preview")
async def dgii_preview(
    body: DgiiExportRequest,
    ctx: TenantContext = Depends(require_tenant),
):
    """
    Previsualiza cuántas facturas se exportarán con los filtros dados,
    con validación completa de datos (NCF duplicados, ITBIS, RNC, etc.).
    No descarga ningún archivo — retorna stats + preview de hasta 20 facturas.

    Si `auto_fixes` incluye acciones (deduplicate, recalculate_itbis, etc.),
    se aplican antes de la validación. Las acciones que modifican la DB
    (recalculate_itbis, assign_goods_type) son irreversibles.
    """
    # ── Electronic issuer restrictions ──────────────────────────────────
    restrictions = _get_electronic_issuer_restrictions(ctx)
    fmt_restrictions = restrictions.get("restrictions", {}).get(body.format, {})

    if fmt_restrictions.get("rule") == "prohibited":
        raise HTTPException(
            status_code=400,
            detail=fmt_restrictions["message"],
        )

    transaction_type = _format_to_transaction_type(body.format)

    date_from, date_to = _resolve_dates(body)
    report_rnc = _organization_report_rnc(ctx)
    report_period = _resolve_report_period(body, date_from)

    if body.format == "dgii_608":
        invoices = _query_voided_invoices(ctx, date_from, date_to, body)
    else:
        invoices = invoice_repo.list_for_dgii_export(
            db=ctx.db,
            tenant_id=ctx.tenant_id,
            org_id=ctx.org_id,
            transaction_type=transaction_type,
            date_from=date_from,
            date_to=date_to,
            categories=body.categories or None,
            goods_types=body.goods_types or None,
            vendor_search=body.vendor_search or None,
            source_types=body.source_types or None,
            processed_only=body.processed_only,
            include_no_ncf=body.include_no_ncf,
            invoice_ids=body.invoice_ids or None,
        )

    # Excluir facturas ya reportadas (a menos que el usuario pida ver todo)
    if body.exclude_reported and body.period:
        invoices = _filter_reported_invoices(invoices, ctx, body.format.replace("dgii_", ""), body.period)

    confirmed_ncfs = _get_confirmed_reported_ncfs(ctx, body.format.replace("dgii_", ""))
    invoices = [inv for inv in invoices if not _is_confirmed_ncf_blocked(inv, confirmed_ncfs)]

    # Filter by fiscal_status + include deferred from past periods
    period_val = body.period or report_period
    invoices = [inv for inv in invoices if inv.fiscal_status in ("valid", "pending_review", "invalid")]
    deferred_from_past = ctx.db.query(Invoice).filter(
        Invoice.tenant_id == ctx.tenant_id,
        Invoice.organization_id == ctx.org_id,
        Invoice.is_deleted.is_(False),
        Invoice.fiscal_status == "deferred",
        Invoice.fiscal_period_override == period_val,
    )
    if transaction_type:
        deferred_from_past = deferred_from_past.filter(Invoice.transaction_type == transaction_type)
    invoices.extend(deferred_from_past.all())

    # ── Apply electronic issuer restrictions ────────────────────────────
    invoices, excluded_count = _filter_invoices_by_issuer_restrictions(
        invoices, body.format, restrictions,
    )
    restrictions_applied = None
    if fmt_restrictions.get("restricted"):
        restrictions_applied = {
            "format": body.format,
            "rule": fmt_restrictions["rule"],
            "message": fmt_restrictions["message"],
            "excluded_invoices": excluded_count,
        }

    # Aplicar auto-fixes (pueden modificar la DB)
    invoices, fix_report = _apply_auto_fixes(invoices, body.auto_fixes, ctx.db, body.format)

    stats = _compute_dgii_validation(
        invoices,
        body.format,
        report_rnc=report_rnc,
        period=report_period,
    )
    stats["total_visible_invoices"] = len(invoices)
    stats["reportable_invoices"] = len(invoices)
    stats["blocked_confirmed_ncf"] = 0

    raw_cache: Dict = {}
    stats["preview_invoices"] = [
        _invoice_preview(
            inv,
            body.format,
            raw_cache,
            report_rnc=report_rnc,
            confirmed_ncfs=confirmed_ncfs,
        )
        for inv in invoices[:20]
    ]

    return {
        "format": body.format,
        "filters_applied": {
            "date_from": str(date_from.date()) if date_from else None,
            "date_to": str(date_to.date()) if date_to else None,
            "categories": body.categories,
            "goods_types": body.goods_types,
            "vendor_search": body.vendor_search,
        },
        "fixes_applied": fix_report,
        "restrictions_applied": restrictions_applied,
        **stats,
    }


@router.post("/export")
async def dgii_export(
    body: DgiiExportRequest,
    ctx: TenantContext = Depends(require_tenant),
):
    """
    Genera y descarga el archivo de exportación DGII.
    - 606: .xls (plantilla oficial DGII)
    - 607: .csv (UTF-8 BOM, compatible Excel)
    - 608: .csv (UTF-8 BOM, compatible Excel)

    Bloquea la exportación si hay errores críticos:
    NCFs duplicados, RNC inválidos, montos en cero, etc.
    """
    if body.format not in ("dgii_606", "dgii_607", "dgii_608"):
        raise HTTPException(status_code=400, detail=f"Formato '{body.format}' no válido. Use dgii_606, dgii_607 o dgii_608.")

    # ── Electronic issuer restrictions ──────────────────────────────────
    restrictions = _get_electronic_issuer_restrictions(ctx)
    fmt_restrictions = restrictions.get("restrictions", {}).get(body.format, {})

    if fmt_restrictions.get("rule") == "prohibited":
        raise HTTPException(
            status_code=400,
            detail=fmt_restrictions["message"],
        )

    transaction_type = _format_to_transaction_type(body.format)
    date_from, date_to = _resolve_dates(body)
    report_rnc = _organization_report_rnc(ctx)
    period = _resolve_report_period(body, date_from)

    # Para 608 buscamos facturas formalmente anuladas
    if body.format == "dgii_608":
        invoices = _query_voided_invoices(ctx, date_from, date_to, body)
    else:
        invoices = invoice_repo.list_for_dgii_export(
            db=ctx.db,
            tenant_id=ctx.tenant_id,
            org_id=ctx.org_id,
            transaction_type=transaction_type,
            date_from=date_from,
            date_to=date_to,
            categories=body.categories or None,
            goods_types=body.goods_types or None,
            vendor_search=body.vendor_search or None,
            source_types=body.source_types or None,
            processed_only=body.processed_only,
            include_no_ncf=body.include_no_ncf,
            invoice_ids=body.invoice_ids or None,
        )

    if not invoices:
        raise HTTPException(
            status_code=404,
            detail="No se encontraron facturas con los filtros seleccionados."
        )

    # Excluir facturas ya reportadas
    if body.exclude_reported and body.period:
        invoices = _filter_reported_invoices(invoices, ctx, body.format.replace("dgii_", ""), body.period)

    confirmed_ncfs = _get_confirmed_reported_ncfs(ctx, body.format.replace("dgii_", ""))
    invoices = [inv for inv in invoices if not _is_confirmed_ncf_blocked(inv, confirmed_ncfs)]

    if not invoices:
        raise HTTPException(
            status_code=409,
            detail=(
                "No hay facturas reportables para este filtro. "
                "Las facturas encontradas ya tienen NCF confirmado por DGII "
                "y no pueden re-reportarse."
            ),
        )

    # ── Filtrar por fiscal_status (match preview behaviour) ──────────
    invoices = [inv for inv in invoices if inv.fiscal_status in ("valid", "pending_review", "invalid")]

    # Also include deferred invoices whose period_override matches this period
    if hasattr(body, 'period') and body.period:
        deferred_from_past = ctx.db.query(Invoice).filter(
            Invoice.tenant_id == ctx.tenant_id,
            Invoice.organization_id == ctx.org_id,
            Invoice.is_deleted.is_(False),
            Invoice.fiscal_status == "deferred",
            Invoice.fiscal_period_override == body.period,
        )
        if transaction_type:
            deferred_from_past = deferred_from_past.filter(Invoice.transaction_type == transaction_type)
        invoices.extend(deferred_from_past.all())

    # ── Apply electronic issuer restrictions ────────────────────────────
    invoices, excluded_count = _filter_invoices_by_issuer_restrictions(
        invoices, body.format, restrictions,
    )

    if not invoices:
        detail = "No se encontraron facturas para exportar con los filtros actuales."
        if fmt_restrictions.get("restricted"):
            detail = fmt_restrictions["message"]
        raise HTTPException(
            status_code=404,
            detail=detail,
        )

    # Aplicar auto-fixes (pueden modificar la DB)
    invoices, _ = _apply_auto_fixes(invoices, body.auto_fixes, ctx.db, body.format)

    # ── Validación pre-export ────────────────────────────────────────────
    validation = _compute_dgii_validation(
        invoices,
        body.format,
        report_rnc=report_rnc,
        period=period,
    )
    errors: List[str] = []

    errors.extend(validation.get("report_errors") or [])

    if validation["has_duplicates"]:
        for dup in validation["duplicates"]:
            ids = ", ".join(i["id"][:8] for i in dup["invoices"])
            errors.append(f"NCF duplicado: {dup['ncf']} ({dup['count']} facturas: {ids})")

    if validation["missing_ncf"] > 0:
        errors.append(f"{validation['missing_ncf']} factura(s) sin NCF")

    if validation["missing_rnc"] > 0:
        errors.append(f"{validation['missing_rnc']} factura(s) sin RNC/Cédula")

    if validation["invalid_ncf"] > 0:
        errors.append(f"{validation['invalid_ncf']} NCF(s) con formato inválido")

    if validation["invalid_rnc"] > 0:
        errors.append(f"{validation['invalid_rnc']} RNC(s) con formato inválido")

    if validation["zero_amount"] > 0:
        errors.append(f"{validation['zero_amount']} factura(s) con monto total en cero")

    if validation["missing_goods_type"] > 0 and body.format == "dgii_606":
        errors.append(f"{validation['missing_goods_type']} factura(s) sin tipo B/S (DGII 606)")

    if validation.get("missing_payment_method", 0) > 0:
        errors.append(f"{validation['missing_payment_method']} factura(s) sin forma de pago/venta requerida")

    if validation.get("invalid_payment_method", 0) > 0:
        errors.append(f"{validation['invalid_payment_method']} forma(s) de pago fuera de rango")

    if errors:
        detail = "Corrige estos errores antes de exportar:\n" + "\n".join(f"  - {e}" for e in errors)
        raise HTTPException(status_code=422, detail=detail)

    timestamp = datetime.now().strftime("%Y%m%d%H%M")

    as_xls = body.output_format == "xls"

    modificatories: List[Invoice] = []
    if body.format in ("dgii_606", "dgii_607"):
        mod_query = ctx.db.query(Invoice).filter(
            Invoice.tenant_id == ctx.tenant_id,
            Invoice.organization_id == ctx.org_id,
            Invoice.ecf_type.in_(["33", "34"]),
            Invoice.status == "verified",
            Invoice.is_deleted.is_(False),
        )
        if date_from:
            if date_from.tzinfo is None:
                from datetime import timezone
                date_from = date_from.replace(tzinfo=timezone.utc)
            mod_query = mod_query.filter(Invoice.created_at >= date_from)
        if date_to:
            if date_to.tzinfo is None:
                from datetime import timezone
                date_to = date_to.replace(tzinfo=timezone.utc)
            mod_query = mod_query.filter(Invoice.created_at <= date_to)
        modificatories = mod_query.all()

    try:
        if body.format == "dgii_606":
            if body.output_format == "dgii_txt":
                output = export_service.export_dgii_606_txt(invoices, report_rnc=report_rnc, period=period, modificatories=modificatories)
                filename = f"DGII_F_606_{report_rnc or 'RNC'}_{period}.txt"
                return StreamingResponse(
                    io.BytesIO(output),
                    media_type="text/plain; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'},
                )
            output = export_service.export_dgii_606(invoices, report_rnc=report_rnc, period=period)
            filename = f"DGII_606_{period}_{timestamp}.xlsx"
            media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            return StreamingResponse(
                io.BytesIO(output),
                media_type=media_type,
                headers={"Content-Disposition": f'attachment; filename="{filename}"'},
            )

        elif body.format == "dgii_607":
            if body.output_format == "dgii_txt":
                output = export_service.export_dgii_607_txt(invoices, report_rnc=report_rnc, period=period, modificatories=modificatories)
                filename = f"DGII_F_607_{report_rnc or 'RNC'}_{period}.txt"
                return StreamingResponse(
                    io.BytesIO(output),
                    media_type="text/plain; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'},
                )
            output = export_service.export_dgii_607(invoices, report_rnc=report_rnc, period=period, as_xls=as_xls)
            ext = "xlsx" if as_xls else "csv"
            filename = f"DGII_607_{period}_{timestamp}.{ext}"
            media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" if as_xls else "text/csv; charset=utf-8"
            return StreamingResponse(
                io.BytesIO(output),
                media_type=media_type,
                headers={"Content-Disposition": f'attachment; filename="{filename}"'},
            )

        elif body.format == "dgii_608":
            if body.output_format == "dgii_txt":
                output = export_service.export_dgii_608_txt(invoices, report_rnc=report_rnc, period=period)
                filename = f"DGII_F_608_{report_rnc or 'RNC'}_{period}.txt"
                return StreamingResponse(
                    io.BytesIO(output),
                    media_type="text/plain; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'},
                )
            output = export_service.export_dgii_608(invoices, report_rnc=report_rnc, period=period, as_xls=as_xls)
            ext = "xlsx" if as_xls else "csv"
            filename = f"DGII_608_{period}_{timestamp}.{ext}"
            media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" if as_xls else "text/csv; charset=utf-8"
            return StreamingResponse(
                io.BytesIO(output),
                media_type=media_type,
                headers={"Content-Disposition": f'attachment; filename="{filename}"'},
            )

    except FileNotFoundError as e:
        logger.error("DGII export template not found: %s", e)
        raise HTTPException(
            status_code=500,
            detail="Plantilla oficial DGII no encontrada. Contacta al soporte."
        ) from e
    except Exception as e:
        logger.exception("Error generating DGII export format=%s", body.format)
        raise HTTPException(status_code=500, detail=f"Error generando exportación: {e}") from e


@router.get("/search-name")
async def dgii_search_name(
    name: str,
    ctx: TenantContext = Depends(require_tenant),
):
    """
    Busca contribuyentes en la DGII por nombre/razón social.

    Utiliza el sitio web de la DGII (ASP.NET WebForms). La búsqueda por
    nombre requiere JavaScript (Bootstrap tabs + __doPostBack) que no se
    puede replicar vía HTTP server-side, por lo que este endpoint intenta
    el mejor esfuerzo y puede devolver resultados limitados.
    """
    cleaned = name.strip()[:50]
    if len(cleaned) < 3:
        return {"results": []}

    RNC_URL = "https://dgii.gov.do/app/WebApps/ConsultasWeb2/ConsultasWeb/consultas/rnc.aspx"
    UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
            # Step 1: GET initial form + session cookie
            resp = await client.get(RNC_URL, headers={"User-Agent": UA})
            html = resp.text

            viewstate = _extract_viewstate(html, "__VIEWSTATE")
            viewstate_gen = _extract_viewstate(html, "__VIEWSTATEGENERATOR")
            event_validation = _extract_viewstate(html, "__EVENTVALIDATION")

            if not viewstate:
                return {"results": [], "error": "No se pudo acceder al formulario DGII"}

            # Step 2: Submit name search via full POST + __EVENTTARGET
            fields = {
                "__VIEWSTATE": viewstate,
                "__VIEWSTATEGENERATOR": viewstate_gen or "",
                "__EVENTVALIDATION": event_validation or "",
                "__EVENTTARGET": "ctl00$cphMain$btnBuscarPorRazonSocial",
                "__EVENTARGUMENT": "",
                "ctl00$cphMain$hidActiveTab": "razonsocial",
                "ctl00$cphMain$txtRazonSocial": cleaned,
                "ctl00$cphMain$txtRNCCedula": "",
            }

            resp2 = await client.post(
                RNC_URL,
                data=fields,
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": UA,
                    "Referer": RNC_URL,
                },
            )

            text = resp2.text

            # Parse results from the dvDatosContribuyentes table
            results = _parse_dgii_name_results(text)

            # Fallback: check lblInformacion for error messages
            msg = _extract_dgii_message(text)

            return {
                "results": results,
                "note": msg if msg else None,
            }
    except httpx.TimeoutException:
        return {"results": [], "error": "La DGII no respondió a tiempo"}
    except httpx.HTTPError as e:
        return {"results": [], "error": f"Error HTTP al consultar DGII: {e}"}
    except Exception as e:
        logger.exception("Error in DGII name search")
        return {"results": [], "error": f"Error inesperado: {e}"}


def _extract_viewstate(html: str, field: str) -> str:
    m = re.search(r'id="' + re.escape(field) + r'" value="([^"]+)"', html)
    return m.group(1) if m else ""


def _extract_dgii_message(html: str) -> str | None:
    m = re.search(r'id="cphMain_lblInformacion"[^>]*>([^<]*)<', html)
    return m.group(1).strip() if m and m.group(1).strip() else None


def _parse_dgii_name_results(html: str) -> list[dict]:
    """Parse the dvDatosContribuyentes table for name search results."""
    results = []

    # Find the dataview table
    dc = re.search(
        r'id="cphMain_dvDatosContribuyentes"[^>]*>(.*?)</table>',
        html, re.DOTALL,
    )
    if not dc:
        return results

    table_content = dc.group(1)
    rows = re.findall(r"<tr[ >](.*?)</tr>", table_content, re.DOTALL)
    if not rows:
        return results

    for row in rows:
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.DOTALL)
        if len(cells) < 2:
            continue

        clean = [
            re.sub(r"<[^>]*>", "", c).strip().replace("\u00a0", " ").replace("\r\n", " ").replace("\n", " ")
            for c in cells
        ]

        # DGII columns: RNC, name, tradeName, category, regime, status, isElectronic, licenses
        rnc = clean[0] if len(clean) > 0 else ""
        name = clean[1] if len(clean) > 1 else ""
        trade_name = clean[2].strip() if len(clean) > 2 and clean[2].strip() else None
        status = clean[5] if len(clean) > 5 else "INACTIVO"
        is_electronic = len(clean) > 6 and clean[6].upper() == "SI"

        if rnc and name:
            results.append({
                "rnc": rnc,
                "name": name,
                "tradeName": trade_name,
                "status": status,
                "isElectronicBillingRegistered": is_electronic,
            })

    return results


@router.get("/summary")
async def dgii_summary(
    report: str = "606",
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    period: Optional[str] = None,
    ctx: TenantContext = Depends(require_tenant),
):
    """
    Resumen de completitud DGII para un período.
    Útil para mostrar el dashboard de la página DGII sin descargar nada.
    """
    transaction_type = _format_to_transaction_type(f"dgii_{report}")

    # Resolver fechas
    df, dt = None, None
    if period:
        df, dt = _period_to_range(period)
    else:
        df = _parse_date(date_from)
        dt = _parse_date(date_to)

    stats = invoice_repo.count_by_period(
        db=ctx.db,
        tenant_id=ctx.tenant_id,
        org_id=ctx.org_id,
        transaction_type=transaction_type,
        date_from=df,
        date_to=dt,
    )
    return {"report": report, "period": period, **stats}


@router.get("/categories")
async def dgii_categories(ctx: TenantContext = Depends(require_tenant)):
    """Lista de categorías disponibles en la org (para los filtros de exportación)."""
    categories = invoice_repo.list_distinct_categories(ctx.db, ctx.tenant_id, ctx.org_id)
    return {"categories": sorted(categories)}


# ── DGII field editing ─────────────────────────────────────────────────────

# Fields that live as Invoice model columns (first-class data)
_COLUMN_FIELDS = {
    "vendor_name", "vendor_tax_id", "invoice_number", "invoice_date",
    "total_amount", "tax_amount", "goods_services_type", "category",
    "transaction_type",
}

# Fields that live inside raw_extracted_data JSON (DGII-specific fiscal data)
_RAW_DGII_FIELDS = {
    "ncf_modified", "payment_date", "payment_method",
    "itbis_retenido", "itbis_proporcionalidad", "itbis_llevado_costo", "itbis_percibido",
    "isr_retention_type", "isr_retention_amount", "isr_percibido",
    "isc_amount", "other_taxes", "legal_tip",
    "cancellation_type",
    # 607-specific
    "tipo_ingreso", "retencion_renta_terceros",
}


class DgiiFieldUpdate(BaseModel):
    """Payload para actualizar campos DGII de una factura."""
    fields: Dict[str, Any]  # key → valor. Acepta campos de columna + raw DGII.


@router.patch("/invoice/{invoice_id}/dgii-fields")
async def update_dgii_fields(
    invoice_id: str,
    body: DgiiFieldUpdate,
    ctx: TenantContext = Depends(require_tenant),
):
    """Actualiza campos DGII de una factura individual.

    Acepta tanto campos de columna (vendor_tax_id, total_amount, etc.)
    como campos fiscales que viven en raw_extracted_data (payment_method,
    itbis_retenido, isr_retention_type, etc.).

    Recalcula la validación DGII y retorna el preview actualizado.
    """
    invoice = invoice_repo.get_including_trashed(ctx.db, invoice_id, ctx.tenant_id, ctx.org_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    # 1. Update column fields
    for field, value in body.fields.items():
        if field in _COLUMN_FIELDS:
            if field == "invoice_date" and isinstance(value, str):
                try:
                    from datetime import datetime as dt
                    setattr(invoice, field, dt.strptime(value, "%Y-%m-%d"))
                except ValueError:
                    raise HTTPException(status_code=400, detail=f"Fecha inválida: {value}")
            elif field in ("total_amount", "tax_amount") and value is not None:
                try:
                    setattr(invoice, field, float(value))
                except (ValueError, TypeError):
                    raise HTTPException(status_code=400, detail=f"Valor numérico inválido para {field}: {value}")
            else:
                setattr(invoice, field, value)

    # 2. Update raw_extracted_data fields
    raw_updates = {k: v for k, v in body.fields.items() if k in _RAW_DGII_FIELDS}
    if raw_updates:
        raw = {}
        if invoice.raw_extracted_data:
            try:
                raw = json.loads(invoice.raw_extracted_data)
            except (json.JSONDecodeError, TypeError):
                raw = {}
        for k, v in raw_updates.items():
            if v is None or v == "":
                raw.pop(k, None)  # Remove empty values
            else:
                raw[k] = v
        invoice.raw_extracted_data = json.dumps(raw, ensure_ascii=False)

    invoice.updated_at = utc_now()
    ctx.db.commit()
    ctx.db.refresh(invoice)

    # 3. Return updated preview with re-validated status
    raw_cache: Dict = {}
    preview = _invoice_preview(invoice, "dgii_606", raw_cache, report_rnc=_organization_report_rnc(ctx))
    return {"status": "ok", "invoice": preview}


@router.patch("/invoices/dgii-bulk-fields")
async def bulk_update_dgii_fields(
    body: Dict[str, Any],
    ctx: TenantContext = Depends(require_tenant),
):
    """Actualización masiva de un campo DGII para múltiples facturas.

    Body: {"invoice_ids": [...], "field": "payment_method", "value": "01"}
    """
    invoice_ids = body.get("invoice_ids", [])
    field = body.get("field", "")
    value = body.get("value")

    if not invoice_ids or not field:
        raise HTTPException(status_code=400, detail="Se requieren invoice_ids y field")

    invoices = invoice_repo.list_by_ids(ctx.db, invoice_ids, ctx.tenant_id, ctx.org_id)
    updated = 0

    for invoice in invoices:
        if field in _COLUMN_FIELDS:
            setattr(invoice, field, value)
            updated += 1
        elif field in _RAW_DGII_FIELDS:
            raw = {}
            if invoice.raw_extracted_data:
                try:
                    raw = json.loads(invoice.raw_extracted_data)
                except (json.JSONDecodeError, TypeError):
                    raw = {}
            if value is None or value == "":
                raw.pop(field, None)
            else:
                raw[field] = value
            invoice.raw_extracted_data = json.dumps(raw, ensure_ascii=False)
            updated += 1
        invoice.updated_at = utc_now()

    if updated:
        ctx.db.commit()

    return {"status": "ok", "updated": updated}


# ── Submission tracking endpoints ───────────────────────────────────────────


@router.get("/submissions")
async def dgii_list_submissions(
    format: Optional[str] = None,
    period: Optional[str] = None,
    limit: int = 50,
    ctx: TenantContext = Depends(require_tenant),
):
    """Lista envíos registrados (submissions) opcionalmente filtrados por formato y/o período."""
    query = ctx.db.query(DgiiSubmission).filter(
        DgiiSubmission.tenant_id == ctx.tenant_id,
        DgiiSubmission.organization_id == ctx.org_id,
    )
    if format:
        query = query.filter(DgiiSubmission.format == format)
    if period:
        query = query.filter(DgiiSubmission.period == period)

    submissions = query.order_by(DgiiSubmission.created_at.desc()).limit(limit).all()
    return {
        "submissions": [_format_submission_response(s) for s in submissions],
        "total": len(submissions),
    }


@router.post("/submissions", status_code=201)
async def dgii_create_submission(
    body: CreateDgiiSubmissionRequest,
    ctx: TenantContext = Depends(require_tenant),
):
    """Registra un envío de facturas para un formato y período específicos."""
    if body.format not in ("606", "607", "608"):
        raise HTTPException(status_code=400, detail=f"Formato '{body.format}' no válido. Use 606, 607 o 608.")

    if not body.invoice_ids:
        raise HTTPException(status_code=400, detail="Debe incluir al menos una factura.")

    invoices_by_id = _load_invoices_by_ids(ctx.db, body.invoice_ids, ctx.tenant_id, ctx.org_id)
    if len(invoices_by_id) != len(body.invoice_ids):
        raise HTTPException(status_code=404, detail="Una o más facturas no existen para esta organización.")

    # Regla dura de no re-reporte por NCF:
    # si el NCF ya fue aceptado por DGII para este formato, no permitimos crear otro envío.
    confirmed_ncfs = _get_confirmed_reported_ncfs(ctx, body.format)
    blocked_ncfs: set[str] = set()
    for inv_id in body.invoice_ids:
        inv = invoices_by_id.get(str(inv_id))
        ncf = _invoice_ncf(inv)
        if ncf and ncf in confirmed_ncfs:
            blocked_ncfs.add(ncf)

    if blocked_ncfs:
        blocked_list = ", ".join(sorted(blocked_ncfs))
        raise HTTPException(
            status_code=409,
            detail=(
                "No se puede crear el envío: uno o más NCF ya fueron confirmados "
                f"como aceptados por DGII para el formato {body.format}. NCF(s): {blocked_list}"
            ),
        )

    report_rnc = _organization_report_rnc(ctx)
    report_snapshots = _build_submission_report_snapshots(
        invoices_by_id=invoices_by_id,
        ordered_ids=body.invoice_ids,
        format_code=body.format,
        report_rnc=report_rnc,
    )

    sub_status = body.status or "pending_confirm"

    submission = DgiiSubmission(
        tenant_id=ctx.tenant_id,
        organization_id=ctx.org_id,
        format=body.format,
        period=body.period,
        invoice_ids=body.invoice_ids,
        invoice_count=len(body.invoice_ids),
        status=sub_status,
        notes=body.notes,
        created_by=ctx.user.id if ctx.user else None,
    )
    ctx.db.add(submission)
    ctx.db.flush()

    if sub_status != "pending_upload":
        for inv_id in body.invoice_ids:
            inv_status = InvoiceDgiiStatus(
                invoice_id=inv_id,
                format=body.format,
                period=body.period,
                status="reported",
                submission_id=submission.id,
                report_snapshot=report_snapshots.get(str(inv_id), {}),
            )
            ctx.db.add(inv_status)

    ctx.db.commit()
    ctx.db.refresh(submission)

    return _format_submission_response(submission)


@router.delete("/submissions/{submission_id}")
async def dgii_delete_submission(
    submission_id: str,
    ctx: TenantContext = Depends(require_tenant),
):
    """Elimina un registro de envío (deshacer)."""
    submission = ctx.db.query(DgiiSubmission).filter(
        DgiiSubmission.id == submission_id,
        DgiiSubmission.tenant_id == ctx.tenant_id,
        DgiiSubmission.organization_id == ctx.org_id,
    ).first()

    if not submission:
        raise HTTPException(status_code=404, detail="Submission no encontrada.")

    ctx.db.query(InvoiceDgiiStatus).filter(
        InvoiceDgiiStatus.submission_id == submission_id,
    ).delete()
    ctx.db.delete(submission)
    ctx.db.commit()
    return {"status": "deleted", "id": submission_id}


class ReportResultsItem(BaseModel):
    invoice_id: str
    status: str
    error_detail: Optional[str] = None


class ReportResultsRequest(BaseModel):
    results: List[ReportResultsItem]


class DgiiStatusOverride(BaseModel):
    status: str
    error_detail: Optional[str] = None
    notes: Optional[str] = None


@router.get("/submissions/{submission_id}")
async def dgii_get_submission(
    submission_id: str,
    ctx: TenantContext = Depends(require_tenant),
):
    """Detalle de un envío con el estado por factura."""
    submission = ctx.db.query(DgiiSubmission).filter(
        DgiiSubmission.id == submission_id,
        DgiiSubmission.tenant_id == ctx.tenant_id,
        DgiiSubmission.organization_id == ctx.org_id,
    ).first()

    if not submission:
        raise HTTPException(status_code=404, detail="Submission no encontrada.")

    report_rnc = _organization_report_rnc(ctx)
    report_columns = export_service.submission_report_columns(submission.format)
    ordered_invoice_ids = [str(invoice_id) for invoice_id in (submission.invoice_ids or [])]

    invoice_statuses = ctx.db.query(InvoiceDgiiStatus).filter(
        InvoiceDgiiStatus.submission_id == submission_id,
    ).all()

    statuses_by_invoice_id = {str(status.invoice_id): status for status in invoice_statuses}
    if not ordered_invoice_ids:
        ordered_invoice_ids = list(statuses_by_invoice_id.keys())

    invoices_by_id = _load_invoices_by_ids(ctx.db, ordered_invoice_ids, ctx.tenant_id, ctx.org_id)
    fallback_snapshots = _build_submission_report_snapshots(
        invoices_by_id=invoices_by_id,
        ordered_ids=ordered_invoice_ids,
        format_code=submission.format,
        report_rnc=report_rnc,
    )

    invoices = []
    for invoice_id in ordered_invoice_ids:
        st = statuses_by_invoice_id.get(invoice_id)
        invoices.append({
            "id": invoice_id,
            "status": st.status if st else "pending",
            "error_detail": st.error_detail if st else None,
            "notes": st.notes if st else None,
            "report_snapshot": (st.report_snapshot if st and st.report_snapshot else fallback_snapshots.get(invoice_id, {})),
        })

    return {
        **_format_submission_response(submission),
        "report_columns": report_columns,
        "invoices": invoices,
    }


@router.post("/submissions/{submission_id}/confirm")
async def dgii_confirm_submission(
    submission_id: str,
    ctx: TenantContext = Depends(require_tenant),
):
    """Confirma que un envío fue aceptado por la DGII."""
    submission = ctx.db.query(DgiiSubmission).filter(
        DgiiSubmission.id == submission_id,
        DgiiSubmission.tenant_id == ctx.tenant_id,
        DgiiSubmission.organization_id == ctx.org_id,
    ).first()

    if not submission:
        raise HTTPException(status_code=404, detail="Submission no encontrada.")

    submission.status = "confirmed"

    existing_statuses = ctx.db.query(InvoiceDgiiStatus).filter(
        InvoiceDgiiStatus.submission_id == submission_id,
    ).count()

    if existing_statuses == 0 and submission.invoice_ids:
        ordered_invoice_ids = [str(invoice_id) for invoice_id in (submission.invoice_ids or [])]
        invoices_by_id = _load_invoices_by_ids(ctx.db, ordered_invoice_ids, ctx.tenant_id, ctx.org_id)
        report_snapshots = _build_submission_report_snapshots(
            invoices_by_id=invoices_by_id,
            ordered_ids=ordered_invoice_ids,
            format_code=submission.format,
            report_rnc=_organization_report_rnc(ctx),
        )
        for inv_id in submission.invoice_ids:
            inv_status = InvoiceDgiiStatus(
                invoice_id=inv_id,
                format=submission.format,
                period=submission.period,
                status="reported",
                submission_id=submission.id,
                report_snapshot=report_snapshots.get(str(inv_id), {}),
            )
            ctx.db.add(inv_status)
    else:
        ctx.db.query(InvoiceDgiiStatus).filter(
            InvoiceDgiiStatus.submission_id == submission_id,
        ).update({"status": "reported"}, synchronize_session=False)

    ctx.db.commit()
    ctx.db.refresh(submission)

    return _format_submission_response(submission)


@router.post("/submissions/{submission_id}/mark-uploaded")
async def dgii_mark_submission_uploaded(
    submission_id: str,
    ctx: TenantContext = Depends(require_tenant),
):
    """Marca un envío pendiente de subida como subido (pending_upload → pending_confirm)."""
    submission = ctx.db.query(DgiiSubmission).filter(
        DgiiSubmission.id == submission_id,
        DgiiSubmission.tenant_id == ctx.tenant_id,
        DgiiSubmission.organization_id == ctx.org_id,
    ).first()

    if not submission:
        raise HTTPException(status_code=404, detail="Submission no encontrada.")

    if submission.status != "pending_upload":
        raise HTTPException(status_code=400, detail=f"Solo submissions 'pending_upload' pueden marcarse como subidas (estado actual: {submission.status}).")

    existing_statuses = ctx.db.query(InvoiceDgiiStatus).filter(
        InvoiceDgiiStatus.submission_id == submission_id,
    ).count()

    if existing_statuses == 0 and submission.invoice_ids:
        ordered_invoice_ids = [str(invoice_id) for invoice_id in (submission.invoice_ids or [])]
        invoices_by_id = _load_invoices_by_ids(ctx.db, ordered_invoice_ids, ctx.tenant_id, ctx.org_id)
        report_snapshots = _build_submission_report_snapshots(
            invoices_by_id=invoices_by_id,
            ordered_ids=ordered_invoice_ids,
            format_code=submission.format,
            report_rnc=_organization_report_rnc(ctx),
        )
        for inv_id in submission.invoice_ids:
            inv_status = InvoiceDgiiStatus(
                invoice_id=inv_id,
                format=submission.format,
                period=submission.period,
                status="reported",
                submission_id=submission.id,
                report_snapshot=report_snapshots.get(str(inv_id), {}),
            )
            ctx.db.add(inv_status)

    submission.status = "pending_confirm"
    ctx.db.commit()
    ctx.db.refresh(submission)

    return _format_submission_response(submission)


@router.post("/submissions/{submission_id}/report-results")
async def dgii_report_submission_results(
    submission_id: str,
    body: ReportResultsRequest,
    ctx: TenantContext = Depends(require_tenant),
):
    """Reporta resultados individuales por factura después de subir a DGII."""
    submission = ctx.db.query(DgiiSubmission).filter(
        DgiiSubmission.id == submission_id,
        DgiiSubmission.tenant_id == ctx.tenant_id,
        DgiiSubmission.organization_id == ctx.org_id,
    ).first()

    if not submission:
        raise HTTPException(status_code=404, detail="Submission no encontrada.")

    has_errors = any(r.status == "error" for r in body.results)
    ordered_invoice_ids = [str(invoice_id) for invoice_id in (submission.invoice_ids or [])]
    invoices_by_id = _load_invoices_by_ids(ctx.db, ordered_invoice_ids, ctx.tenant_id, ctx.org_id)
    report_snapshots = _build_submission_report_snapshots(
        invoices_by_id=invoices_by_id,
        ordered_ids=ordered_invoice_ids,
        format_code=submission.format,
        report_rnc=_organization_report_rnc(ctx),
    )

    for result in body.results:
        existing = ctx.db.query(InvoiceDgiiStatus).filter(
            InvoiceDgiiStatus.submission_id == submission_id,
            InvoiceDgiiStatus.invoice_id == result.invoice_id,
        ).first()
        if existing:
            existing.status = result.status
            existing.error_detail = result.error_detail
            existing.updated_at = utc_now()
            if not existing.report_snapshot:
                existing.report_snapshot = report_snapshots.get(str(result.invoice_id), {})
        else:
            ctx.db.add(InvoiceDgiiStatus(
                invoice_id=result.invoice_id,
                format=submission.format,
                period=submission.period,
                status=result.status,
                submission_id=submission.id,
                error_detail=result.error_detail,
                report_snapshot=report_snapshots.get(str(result.invoice_id), {}),
            ))

    submission.status = "partial_error" if has_errors else "confirmed"
    ctx.db.commit()
    ctx.db.refresh(submission)

    return _format_submission_response(submission)


@router.patch("/invoices/{invoice_id}/dgii-status")
async def dgii_override_invoice_status(
    invoice_id: str,
    body: DgiiStatusOverride,
    ctx: TenantContext = Depends(require_tenant),
):
    """Override manual del estado DGII de una factura."""
    invoice = ctx.db.query(Invoice).filter(
        Invoice.id == invoice_id,
        Invoice.tenant_id == ctx.tenant_id,
        Invoice.organization_id == ctx.org_id,
    ).first()

    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada.")

    existing = ctx.db.query(InvoiceDgiiStatus).filter(
        InvoiceDgiiStatus.invoice_id == invoice_id,
    ).first()

    if existing:
        existing.status = body.status
        existing.error_detail = body.error_detail
        existing.notes = body.notes
        existing.updated_at = utc_now()
    else:
        st = InvoiceDgiiStatus(
            invoice_id=invoice_id,
            format="606",
            period="",
            status=body.status,
            error_detail=body.error_detail,
            notes=body.notes,
        )
        ctx.db.add(st)

    ctx.db.commit()
    return {"status": "ok"}


@router.get("/pending-summary")
async def dgii_pending_summary(
    ctx: TenantContext = Depends(require_tenant),
):
    """
    Resumen de facturas pendientes de reportar por formato (606/607/608),
    más el próximo vencimiento (día 15 del mes).
    """
    return _compute_pending_summary(ctx)


@router.get("/pending-invoices")
async def dgii_pending_invoices(
    format: str = "606",
    period: Optional[str] = None,
    ctx: TenantContext = Depends(require_tenant),
):
    """
    Lista facturas pendientes para un formato y período específicos.
    - period: YYYYMM (ej. "202605"). Si se omite, usa el mes actual.
    """
    if format not in ("606", "607", "608"):
        raise HTTPException(status_code=400, detail=f"Formato '{format}' no válido.")

    if not period:
        period = datetime.now().strftime("%Y%m")

    date_from, date_to = _period_to_range(period)
    if not date_from:
        raise HTTPException(status_code=400, detail=f"Período '{period}' no válido.")

    transaction_type = _format_to_transaction_type(f"dgii_{format}")
    reported_ids = _get_reported_invoice_ids(ctx, format, period)

    query = ctx.db.query(Invoice).filter(
        Invoice.tenant_id == ctx.tenant_id,
        Invoice.organization_id == ctx.org_id,
    )

    if format == "608":
        query = query.filter(
            Invoice.cancelled_at.isnot(None),
            Invoice.transaction_type == "income",
        )
    else:
        query = query.filter(Invoice.is_deleted.is_(False))
        if transaction_type:
            query = query.filter(Invoice.transaction_type == transaction_type)

    query = query.filter(Invoice.invoice_date >= date_from, Invoice.invoice_date <= date_to)
    invoices = query.order_by(Invoice.invoice_date.asc()).all()

    confirmed_ncfs = _get_confirmed_reported_ncfs(ctx, format)
    pending = [
        inv
        for inv in invoices
        if str(inv.id) not in reported_ids
        and (_invoice_ncf(inv) not in confirmed_ncfs)
    ]

    return {
        "format": format,
        "period": period,
        "total_pending": len(pending),
        "invoices": [
            {
                "id": str(inv.id),
                "vendor_name": inv.vendor_name or "",
                "vendor_tax_id": inv.vendor_tax_id or "",
                "invoice_number": inv.invoice_number or "",
                "invoice_date": inv.invoice_date.isoformat() if inv.invoice_date else None,
                "total_amount": inv.total_amount,
                "tax_amount": inv.tax_amount,
                "category": inv.category or "",
                "goods_services_type": inv.goods_services_type or "",
            }
            for inv in pending
        ],
    }


@router.get("/report-restrictions")
async def dgii_report_restrictions(
    ctx: TenantContext = Depends(require_tenant),
):
    """
    Retorna las restricciones de reportes DGII según si la organización
    es emisora electrónica. El frontend usa esto para:
    - Deshabilitar formularios no permitidos (608)
    - Mostrar advertencias sobre filtros automáticos (606/607)
    """
    return _get_electronic_issuer_restrictions(ctx)


@router.post("/auto-generate")
async def dgii_auto_generate(
    format: str = "606",
    period: Optional[str] = None,
    ctx: TenantContext = Depends(require_tenant),
):
    """
    ✨ Auto-genera un borrador de reporte DGII para el formato y período dados.

    Hace tres cosas en un solo llamado:
    1. Encuentra todas las facturas pendientes (no reportadas) para el formato/período,
       incluyendo facturas de períodos anteriores que nunca se han reportado.
    2. Aplica correcciones inteligentes: asigna tipo B/S por categoría,
       recalcula ITBIS, etc.
    3. Devuelve un resumen con lo que encontró y lo que completó.

    El frontend puede usar este endpoint como paso único para poblar la preview.
    """
    if format not in ("606", "607", "608"):
        raise HTTPException(status_code=400, detail=f"Formato '{format}' no válido.")

    if not period:
        period = datetime.now().strftime("%Y%m")

    date_from, date_to = _period_to_range(period)
    if not date_from:
        raise HTTPException(status_code=400, detail=f"Período '{period}' no válido.")

    transaction_type = _format_to_transaction_type(f"dgii_{format}")
    reported_ids = _get_reported_invoice_ids(ctx, format, period)
    all_reported_ids = _get_all_reported_invoice_ids(ctx, format)
    confirmed_ncfs = _get_confirmed_reported_ncfs(ctx, format)

    report_rnc = _organization_report_rnc(ctx)

    # ── 1. Facturas del período actual (pendientes) ──
    query = ctx.db.query(Invoice).filter(
        Invoice.tenant_id == ctx.tenant_id,
        Invoice.organization_id == ctx.org_id,
    )

    if format == "608":
        query = query.filter(
            Invoice.cancelled_at.isnot(None),
            Invoice.transaction_type == "income",
        )
    else:
        query = query.filter(Invoice.is_deleted.is_(False))
        if transaction_type:
            query = query.filter(Invoice.transaction_type == transaction_type)

    query = query.filter(Invoice.invoice_date >= date_from, Invoice.invoice_date <= date_to)
    current_invoices = query.order_by(Invoice.invoice_date.asc()).all()

    pending_current = [
        inv
        for inv in current_invoices
        if str(inv.id) not in reported_ids
        and (_invoice_ncf(inv) not in confirmed_ncfs)
        and inv.fiscal_status in ("valid", "pending_review", "invalid")
    ]

    # ── 2. Facturas de períodos anteriores nunca reportadas ──
    past_due_invoices = []
    if format == "608":
        past_query = ctx.db.query(Invoice).filter(
            Invoice.tenant_id == ctx.tenant_id,
            Invoice.organization_id == ctx.org_id,
            Invoice.cancelled_at.isnot(None),
            Invoice.transaction_type == "income",
            Invoice.invoice_date < date_from,
        )
    else:
        past_query = ctx.db.query(Invoice).filter(
            Invoice.tenant_id == ctx.tenant_id,
            Invoice.organization_id == ctx.org_id,
            Invoice.is_deleted.is_(False),
            Invoice.invoice_date < date_from,
            Invoice.processed.is_(True),
        )
        if transaction_type:
            past_query = past_query.filter(Invoice.transaction_type == transaction_type)
    past_invoices = past_query.order_by(Invoice.invoice_date.asc()).all()
    past_due_invoices = [
        inv
        for inv in past_invoices
        if str(inv.id) not in all_reported_ids
        and (_invoice_ncf(inv) not in confirmed_ncfs)
    ]

    # ── 3. Unir y aplicar auto-fixes ──
    all_invoices = pending_current + past_due_invoices

    if not all_invoices:
        return {
            "status": "empty",
            "format": format,
            "period": period,
            "summary": {
                "total_pending": 0,
                "new_this_period": 0,
                "from_previous_periods": 0,
                "fixes_applied": {},
                "message": "No hay facturas pendientes para este período. Todas están reportadas."
            },
        }

    # Aplicar todas las correcciones automáticas
    auto_fixes = ["assign_goods_type", "recalculate_itbis", "deduplicate"]
    fixed_invoices, fix_report = _apply_auto_fixes(all_invoices, auto_fixes, ctx.db, f"dgii_{format}")

    # ── 4. Validación rápida ──
    raw_cache: Dict = {}
    previews = [_invoice_preview(inv, f"dgii_{format}", raw_cache, report_rnc=report_rnc)
                for inv in fixed_invoices[:50]]
    complete_count = sum(1 for p in previews if p["macro_status"] == "OK")
    issues_count = sum(1 for p in previews if p["macro_status"] != "OK")

    errored_ids = _get_errored_invoice_ids(ctx, format)
    errored_included = len([inv for inv in fixed_invoices if str(inv.id) in errored_ids])

    return {
        "status": "success",
        "format": format,
        "period": period,
        "summary": {
            "total_pending": len(fixed_invoices),
            "new_this_period": len(pending_current),
            "from_previous_periods": len(past_due_invoices),
            "from_errors": errored_included,
            "fixes_applied": fix_report,
            "complete": complete_count,
            "issues": issues_count,
            "total_invoices": len(fixed_invoices),
            "message": _build_auto_generate_message(
                len(pending_current), len(past_due_invoices), fix_report
            ),
        },
        "invoices": previews,
    }


# ── Conciliation endpoints ───────────────────────────────────────────────

@router.post("/conciliate")
async def dgii_conciliate(
    body: DgiiConciliateRequest,
    ctx: TenantContext = Depends(require_tenant),
):
    """
    Diagnóstico pre-export para el panel de conciliación.

    Retorna:
    - ready[]: facturas listas (fiscal_status = 'valid')
    - conflicts[]: facturas con problemas que el usuario debe resolver
    - deferred[]: facturas diferidas de períodos anteriores que caen en este
    - summary: totales, montos, conteos
    """
    fmt = f"dgii_{body.format}"
    transaction_type = _format_to_transaction_type(fmt)
    report_rnc = _organization_report_rnc(ctx)

    period = body.period or datetime.now().strftime("%Y%m")
    date_from, date_to = _period_to_range(period)

    # ── Query all invoices for this period ──
    invoices = invoice_repo.list_for_dgii_export(
        db=ctx.db,
        tenant_id=ctx.tenant_id,
        org_id=ctx.org_id,
        transaction_type=transaction_type,
        date_from=date_from,
        date_to=date_to,
    )

    # ── Also fetch deferred invoices from previous periods targeting this one ──
    deferred_in = ctx.db.query(Invoice).filter(
        Invoice.tenant_id == ctx.tenant_id,
        Invoice.organization_id == ctx.org_id,
        Invoice.is_deleted.is_(False),
        Invoice.fiscal_status == "deferred",
        Invoice.fiscal_period_override == period,
    ).all()

    # ── Classify each invoice ──
    from app.services.fiscal_classifier import fiscal_classifier

    ready: List[dict] = []
    conflicts: List[dict] = []

    confirmed_ncfs = _get_confirmed_reported_ncfs(ctx, body.format)
    reported_ids = _get_reported_invoice_ids(ctx, body.format, period)

    for inv in invoices:
        # Skip already reported
        if str(inv.id) in reported_ids or _invoice_ncf(inv) in confirmed_ncfs:
            continue

        # Re-classify on the fly
        if inv.fiscal_status in ("valid", "deferred", "non_deductible"):
            status = inv.fiscal_status
            reasons: list = []
        else:
            status, reasons = fiscal_classifier.classify(inv)

        problems = []
        for r in reasons:
            severity = "error"
            problems.append({"code": "CLASSIFICATION", "message": r, "severity": severity})

        preview = _invoice_preview(inv, fmt, {}, report_rnc=report_rnc)

        has_errors = False
        if preview.get("macro_status") != "OK":
            has_errors = True
            macro_errs = preview.get("macro_status", "").replace("ERROR: ", "").split("; ")
            for me in macro_errs:
                if me and not any(p["message"] == me for p in problems):
                    problems.append({"code": "MACRO", "message": me, "severity": "error"})

        for ve in preview.get("validation_errors", []):
            has_errors = True
            if not any(p["message"] == ve for p in problems):
                problems.append({"code": "VALIDATION", "message": ve, "severity": "error"})

        suggested = _suggested_actions(status)
        if has_errors and "edit" not in suggested:
            suggested.append("edit")

        entry = {
            "id": str(inv.id),
            "vendor_name": inv.vendor_name or "",
            "invoice_number": inv.invoice_number or "",
            "total_amount": inv.total_amount,
            "fiscal_status": status,
            "problems": problems,
            "suggested_actions": suggested,
            "editable_fields": {
                "vendor_tax_id": {"current": inv.vendor_tax_id, "suggestion": None},
                "invoice_number": {"current": inv.invoice_number, "suggestion": None},
                "goods_services_type": {"current": inv.goods_services_type or "", "suggestion": None},
            },
            **preview,
        }

        if status in ("invalid", "pending_review") or has_errors:
            conflicts.append(entry)
        else:
            ready.append(entry)

    # ── Summary ──
    ready_total = sum(inv.total_amount or 0 for inv in invoices if str(inv.id) in {r["id"] for r in ready})

    today = datetime.now()
    if today.day < 15:
        deadline = today.replace(day=15)
    else:
        next_month = today.month + 1
        next_year = today.year
        if next_month > 12:
            next_month = 1
            next_year += 1
        deadline = today.replace(year=next_year, month=next_month, day=15)

    days_remaining = (deadline - today).days

    can_export = len(conflicts) == 0 and len(ready) > 0

    return {
        "format": body.format,
        "period": period,
        "can_export": can_export,
        "summary": {
            "total_ready": len(ready),
            "total_conflicts": len(conflicts),
            "total_deferred_in": len(deferred_in),
            "total_amount_ready": round(ready_total, 2),
            "total_itbis_ready": round(sum(inv.tax_amount or 0 for inv in invoices if str(inv.id) in {r["id"] for r in ready}), 2),
            "deadline": deadline.strftime("%Y-%m-%d"),
            "days_remaining": max(0, days_remaining),
        },
        "conflicts": conflicts[:50],
        "ready": ready[:50],
        "deferred_in": [
            {
                "id": str(inv.id),
                "vendor_name": inv.vendor_name or "",
                "invoice_number": inv.invoice_number or "",
                "total_amount": inv.total_amount,
                "fiscal_period_override": inv.fiscal_period_override,
            }
            for inv in deferred_in
        ],
    }


@router.patch("/conciliate/{invoice_id}/fix")
async def dgii_conciliate_fix(
    invoice_id: str,
    body: DgiiFixRequest,
    ctx: TenantContext = Depends(require_tenant),
):
    """
    Edita campos de una factura en conflicto y re-clasifica
    fiscal_status automáticamente.
    """
    invoice = invoice_repo.get_including_trashed(ctx.db, invoice_id, ctx.tenant_id, ctx.org_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    from app.routers.dgii import _COLUMN_FIELDS, _RAW_DGII_FIELDS

    # Update column fields
    for field, value in body.fields.items():
        if field in _COLUMN_FIELDS:
            if field == "invoice_date" and isinstance(value, str):
                from datetime import datetime as dt
                setattr(invoice, field, dt.strptime(value, "%Y-%m-%d"))
            elif field in ("total_amount", "tax_amount") and value is not None:
                try:
                    setattr(invoice, field, float(value))
                except (ValueError, TypeError):
                    raise HTTPException(status_code=400, detail=f"Valor inválido para {field}")
            else:
                setattr(invoice, field, value)

    # Update raw_extracted_data fields
    raw_updates = {k: v for k, v in body.fields.items() if k in _RAW_DGII_FIELDS}
    if raw_updates:
        raw = {}
        if invoice.raw_extracted_data:
            try:
                raw = json.loads(invoice.raw_extracted_data)
            except (json.JSONDecodeError, TypeError):
                raw = {}
        for k, v in raw_updates.items():
            if v is None or v == "":
                raw.pop(k, None)
            else:
                raw[k] = v
        invoice.raw_extracted_data = json.dumps(raw, ensure_ascii=False)

    invoice.updated_at = utc_now()

    # Re-classify
    from app.services.fiscal_classifier import fiscal_classifier
    new_status, reasons = fiscal_classifier.classify(invoice)
    invoice.fiscal_status = new_status

    ctx.db.commit()
    ctx.db.refresh(invoice)

    return {
        "status": "ok",
        "invoice_id": str(invoice.id),
        "fiscal_status": new_status,
        "reasons": reasons,
    }


@router.patch("/conciliate/{invoice_id}/defer")
async def dgii_conciliate_defer(
    invoice_id: str,
    body: DgiiDeferRequest,
    ctx: TenantContext = Depends(require_tenant),
):
    """
    Diferir una factura a un período fiscal futuro.
    fiscal_status → 'deferred', fiscal_period_override → target_period.
    """
    invoice = invoice_repo.get_including_trashed(ctx.db, invoice_id, ctx.tenant_id, ctx.org_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    if not re.match(r"^\d{6}$", body.target_period):
        raise HTTPException(status_code=400, detail="target_period debe ser YYYYMM")

    invoice.fiscal_status = "deferred"
    invoice.fiscal_period_override = body.target_period
    invoice.fiscal_exclusion_reason = None
    invoice.updated_at = utc_now()
    ctx.db.commit()

    return {
        "status": "ok",
        "invoice_id": str(invoice.id),
        "fiscal_status": "deferred",
        "target_period": body.target_period,
    }


@router.patch("/conciliate/{invoice_id}/exclude")
async def dgii_conciliate_exclude(
    invoice_id: str,
    body: DgiiExcludeRequest,
    ctx: TenantContext = Depends(require_tenant),
):
    """
    Marcar una factura como no deducible fiscalmente.
    Se excluye permanentemente del 606.
    """
    invoice = invoice_repo.get_including_trashed(ctx.db, invoice_id, ctx.tenant_id, ctx.org_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    invoice.fiscal_status = "non_deductible"
    invoice.fiscal_exclusion_reason = body.reason or "No especificado"
    invoice.fiscal_period_override = None
    invoice.updated_at = utc_now()
    ctx.db.commit()

    return {
        "status": "ok",
        "invoice_id": str(invoice.id),
        "fiscal_status": "non_deductible",
        "exclusion_reason": invoice.fiscal_exclusion_reason,
    }


@router.post("/verify-ncf")
async def dgii_verify_ncf(
    body: DgiiVerifyNcfRequest,
    ctx: TenantContext = Depends(require_tenant),
):
    """
    Verifica NCFs contra el portal público de la DGII (consulta viva).
    Ejecuta on-demand desde el panel de conciliación.
    
    Para cada factura:
    - Si tiene dgii_security_code (e-CF): valida usando RNC + e-NCF + monto + código de seguridad
    - Si no (física): consulta el NCF en ncf.aspx de la DGII
    - Actualiza dgii_validation_status según el resultado
    - Re-clasifica fiscal_status
    """
    from app.services.dgii_scraper import dgii_scraper
    from app.services.dgii_validation import dgii_validation_service

    invoices = invoice_repo.list_by_ids(ctx.db, body.invoice_ids, ctx.tenant_id, ctx.org_id)
    if not invoices:
        raise HTTPException(status_code=404, detail="No se encontraron facturas")

    results = []
    for inv in invoices:
        ncf = (inv.invoice_number or "").strip()
        rnc = (inv.vendor_tax_id or "").strip()
        security_code = (inv.dgii_security_code or "").strip()
        total_amount = inv.total_amount

        # Extract QR first if we are missing any of: NCF, RNC, or security code (e-CF)
        is_electronic_by_ncf = ncf.upper().startswith("E")
        needs_qr = not ncf or not rnc or (is_electronic_by_ncf and not security_code)

        if needs_qr and inv.file_path:
            qr_data = await _extract_qr_from_invoice_image(inv.file_path)
            if qr_data:
                if qr_data.get("codigo_seguridad"):
                    security_code = qr_data.get("codigo_seguridad")
                if qr_data.get("rnc_emisor"):
                    rnc = qr_data.get("rnc_emisor")
                if qr_data.get("encf"):
                    ncf = qr_data.get("encf")
                if not total_amount or total_amount == 0:
                    total_amount = qr_data.get("monto_total")

        if not ncf or not rnc:
            results.append({
                "invoice_id": str(inv.id),
                "ncf": ncf,
                "status": "skipped",
                "reason": "Factura sin NCF o RNC. Sube un archivo con el QR visible.",
            })
            continue

        # e-CF: use security code validation (needs RNC + e-NCF + amount + security code)
        is_ecf = str(ncf).strip().upper().startswith("E")
        if is_ecf:
            if not security_code or not total_amount:
                results.append({
                    "invoice_id": str(inv.id),
                    "ncf": ncf,
                    "status": "error",
                    "reason": "Comprobante electrónico (e-CF) requiere Código de Seguridad y Monto Total.",
                })
                continue

            ecf_result = await dgii_validation_service.validate_ecf_from_data(
                rnc_emisor=rnc,
                encf=ncf,
                monto_total=total_amount,
                codigo_seguridad=security_code,
            )
            if ecf_result.status == "error":
                results.append({
                    "invoice_id": str(inv.id),
                    "ncf": ncf,
                    "status": "error",
                    "razon_social": ecf_result.razon_social,
                    "tipo_comprobante": None,
                    "estado_dgii": ecf_result.estado_dgii,
                    "vigencia": None,
                    "reason": ecf_result.error,
                })
                continue

            # Persist security code and other fields if successfully verified
            if not inv.dgii_security_code and security_code:
                inv.dgii_security_code = security_code
            if total_amount and not inv.total_amount:
                inv.total_amount = total_amount
            if rnc and inv.vendor_tax_id != rnc:
                inv.vendor_tax_id = rnc
            if ncf and inv.invoice_number != ncf:
                inv.invoice_number = ncf
            inv.is_electronic = True

            inv.dgii_validation_status = ecf_result.status
            inv.dgii_validation_detail = json.dumps({
                "razon_social": ecf_result.razon_social,
                "tipo_comprobante": None,
                "estado": ecf_result.estado_dgii,
                "verified_by": "ecf_validation",
            }, ensure_ascii=False)
            
            if ecf_result.status in ("accepted", "registered"):
                inv.fiscal_status = "valid"
            else:
                from app.services.fiscal_classifier import fiscal_classifier
                new_status, _ = fiscal_classifier.classify(inv)
                inv.fiscal_status = new_status

            inv.dgii_validation_date = utc_now()
            inv.updated_at = utc_now()

            results.append({
                "invoice_id": str(inv.id),
                "ncf": ncf,
                "status": ecf_result.status,
                "razon_social": ecf_result.razon_social,
                "tipo_comprobante": None,
                "estado_dgii": ecf_result.estado_dgii,
                "vigencia": None,
            })
            continue

        # Physical invoice: use NCF scraper (RNC + NCF only)
        result = await dgii_scraper.consultar_ncf(rnc, ncf)

        if result.blocked:
            results.append({
                "invoice_id": str(inv.id),
                "ncf": ncf,
                "status": "blocked",
                "reason": "DGII bloqueó la solicitud temporalmente",
            })
            continue

        if result.found:
            inv.dgii_validation_status = "accepted"
            inv.fiscal_status = "valid"
            inv.dgii_validation_detail = json.dumps({
                "razon_social": result.razon_social,
                "tipo_comprobante": result.tipo_comprobante,
                "estado": result.estado,
                "vigencia": result.vigencia,
                "verified_by": "ncf_scraper",
            }, ensure_ascii=False)
        else:
            inv.dgii_validation_status = "not_found"
            from app.services.fiscal_classifier import fiscal_classifier
            new_status, _ = fiscal_classifier.classify(inv)
            inv.fiscal_status = new_status

        # Update RNC & NCF if modified by QR
        if rnc and inv.vendor_tax_id != rnc:
            inv.vendor_tax_id = rnc
        if ncf and inv.invoice_number != ncf:
            inv.invoice_number = ncf
        if not inv.dgii_security_code and security_code:
            inv.dgii_security_code = security_code
            inv.is_electronic = True

        inv.dgii_validation_date = utc_now()
        inv.updated_at = utc_now()

        results.append({
            "invoice_id": str(inv.id),
            "ncf": ncf,
            "status": "found" if result.found else "not_found",
            "razon_social": result.razon_social,
            "tipo_comprobante": result.tipo_comprobante,
            "estado_dgii": result.estado,
            "vigencia": result.vigencia,
        })

    ctx.db.commit()

    return {
        "results": results,
        "total": len(results),
        "found": sum(1 for r in results if r.get("status") in ("found", "accepted", "registered")),
        "not_found": sum(1 for r in results if r.get("status") in ("not_found", "rejected")),
    }


def _suggested_actions(fiscal_status: str) -> List[str]:
    mapping = {
        "invalid": ["edit", "defer", "mark_non_deductible"],
        "pending_review": ["edit", "defer", "mark_non_deductible"],
        "valid": [],
        "deferred": [],
        "non_deductible": [],
    }
    return mapping.get(fiscal_status, ["edit"])


def _build_auto_generate_message(new_count: int, past_count: int, fixes: dict) -> str:
    parts = []
    if new_count:
        parts.append(f"{new_count} factura(s) del período")
    if past_count:
        parts.append(f"{past_count} de períodos anteriores")
    total_fixes = sum(fixes.values())
    if total_fixes:
        fix_details = []
        if fixes.get("goods_type_fixed"):
            fix_details.append(f"{fixes['goods_type_fixed']} tipo(s) B/S")
        if fixes.get("itbis_fixed"):
            fix_details.append(f"{fixes['itbis_fixed']} ITBIS")
        if fixes.get("duplicates_removed"):
            fix_details.append(f"{fixes['duplicates_removed']} duplicado(s)")
        parts.append(f"auto-completado: {', '.join(fix_details)}")
    return f"✓ {' · '.join(parts)}" if parts else "No se encontraron cambios"


# ── Private helpers ────────────────────────────────────────────────────────

# ── Submission tracking helpers ───────────────────────────────────────────

def _get_reported_invoice_ids(ctx: TenantContext, fmt: str, period: str) -> set:
    """Retorna set de invoice IDs ya reportados o excluidos para un formato + período."""
    rows = ctx.db.query(InvoiceDgiiStatus.invoice_id).filter(
        InvoiceDgiiStatus.format == fmt,
        InvoiceDgiiStatus.period == period,
        InvoiceDgiiStatus.status.in_(["reported", "excluded"]),
    ).all()
    return {str(r[0]) for r in rows}


def _get_all_reported_invoice_ids(ctx: TenantContext, fmt: str) -> set:
    """Retorna set de invoice IDs reportados o excluidos para un formato (todos los períodos)."""
    rows = ctx.db.query(InvoiceDgiiStatus.invoice_id).filter(
        InvoiceDgiiStatus.format == fmt,
        InvoiceDgiiStatus.status.in_(["reported", "excluded"]),
    ).all()
    return {str(r[0]) for r in rows}


def _get_errored_invoice_ids(ctx: TenantContext, fmt: str) -> set:
    """Retorna set de invoice IDs con estado 'error' para un formato."""
    rows = ctx.db.query(InvoiceDgiiStatus.invoice_id).filter(
        InvoiceDgiiStatus.format == fmt,
        InvoiceDgiiStatus.status == "error",
    ).all()
    return {str(r[0]) for r in rows}


def _filter_reported_invoices(invoices: list, ctx: TenantContext, fmt: str, period: str) -> list:
    """Excluye facturas ya reportadas en submissions previas."""
    reported = _get_reported_invoice_ids(ctx, fmt, period)
    confirmed_ncfs = _get_confirmed_reported_ncfs(ctx, fmt)
    if not reported and not confirmed_ncfs:
        return invoices
    return [
        inv
        for inv in invoices
        if str(inv.id) not in reported
        and (_invoice_ncf(inv) not in confirmed_ncfs)
    ]


def _deduce_period_from_date(d: Optional[datetime]) -> Optional[str]:
    """Convierte un datetime a formato YYYYMM."""
    if not d:
        return None
    return d.strftime("%Y%m")


def _format_submission_response(sub: DgiiSubmission) -> dict:
    return {
        "id": str(sub.id),
        "format": sub.format,
        "period": sub.period,
        "invoice_ids": [str(i) for i in (sub.invoice_ids or [])],
        "invoice_count": sub.invoice_count,
        "status": sub.status,
        "notes": sub.notes,
        "created_by": str(sub.created_by) if sub.created_by else None,
        "created_at": sub.created_at.isoformat() if sub.created_at else None,
    }


def _compute_pending_summary(ctx: TenantContext) -> dict:
    """Resumen de facturas pendientes por formato + próximos vencimientos."""
    from datetime import date

    today = date.today()
    # Próximo día 15 — si ya pasó el 15 de este mes, es el 15 del próximo
    if today.day < 15:
        next_deadline = date(today.year, today.month, 15)
    else:
        next_month = today.month + 1
        next_year = today.year
        if next_month > 12:
            next_month = 1
            next_year += 1
        next_deadline = date(next_year, next_month, 15)

    deadlines = {
        "606": f"{today.year}-{today.month:02d}-15",
        "607": f"{today.year}-{today.month:02d}-15",
        "608": f"{today.year}-{today.month:02d}-15",
    }

    by_format = {}
    total_pending = 0
    past_due_count = 0

    for fmt, trans_type, label in [
        ("606", "expense", "Compras"),
        ("607", "income", "Ventas"),
        ("608", None, "Anulaciones"),
    ]:
        reported_ids = _get_all_reported_invoice_ids(ctx, fmt)
        confirmed_ncfs = _get_confirmed_reported_ncfs(ctx, fmt)

        query = ctx.db.query(Invoice).filter(
            Invoice.tenant_id == ctx.tenant_id,
            Invoice.organization_id == ctx.org_id,
            Invoice.status != "draft",
        )

        if trans_type:
            query = query.filter(Invoice.transaction_type == trans_type)
            query = query.filter(Invoice.is_deleted.is_(False))
        else:
            # 608: solo anulaciones de comprobantes emitidos (income)
            query = query.filter(
                Invoice.cancelled_at.isnot(None),
                Invoice.transaction_type == "income",
            )

        all_invoices = query.all()
        pending = [
            inv
            for inv in all_invoices
            if str(inv.id) not in reported_ids
            and (_invoice_ncf(inv) not in confirmed_ncfs)
        ]
        count = len(pending)
        by_format[fmt] = count
        total_pending += count

        # Past due: invoices from months before current that are still pending
        current_period = today.strftime("%Y%m")
        past_due = [inv for inv in pending if _deduce_period_from_date(inv.invoice_date) and
                     _deduce_period_from_date(inv.invoice_date) < current_period]
        past_due_count += len(past_due)

    return {
        "total_pending": total_pending,
        "by_format": by_format,
        "past_due_count": past_due_count,
        "next_deadline": next_deadline.isoformat(),
        "deadlines": deadlines,
    }


# ── Existing helpers ──────────────────────────────────────────────────────

def _format_to_transaction_type(fmt: str) -> Optional[str]:
    """606 = compras (expense), 607 = ventas (income), 608 = cualquiera (anuladas)."""
    if fmt == "dgii_606":
        return "expense"
    if fmt == "dgii_607":
        return "income"
    return None  # 608 incluye ambos tipos


def _resolve_dates(body: DgiiExportRequest):
    if body.period:
        return _period_to_range(body.period)
    return _parse_date(body.date_from), _parse_date(body.date_to)


def _resolve_report_period(body: DgiiExportRequest, date_from: Optional[datetime]) -> str:
    return body.period or (date_from.strftime("%Y%m") if date_from else datetime.now().strftime("%Y%m"))


def _organization_report_rnc(ctx: TenantContext) -> str:
    return _only_digits(getattr(ctx.organization, "tax_id", None))


def _query_voided_invoices(ctx, date_from, date_to, body: DgiiExportRequest):
    """Para 608: busca facturas formalmente anuladas dentro del período.
    Solo incluye facturas de ingreso (NCF emitidos al cliente) — las facturas
    de gasto anuladas NO se reportan en 608 (se corrigen re-enviando el 606).
    """
    from app.models import Invoice
    query = ctx.db.query(Invoice).filter(
        Invoice.tenant_id == ctx.tenant_id,
        Invoice.organization_id == ctx.org_id,
        Invoice.cancelled_at.isnot(None),
        Invoice.transaction_type == "income",
    )
    if date_from:
        query = query.filter(Invoice.cancelled_at >= date_from)
    if date_to:
        query = query.filter(Invoice.cancelled_at <= date_to)
    if body.invoice_ids:
        query = query.filter(Invoice.id.in_(body.invoice_ids))
    return query.order_by(Invoice.invoice_date.asc().nullslast()).all()


def _extract_raw_dgii_fields(inv, raw_cache: Dict) -> Dict[str, Any]:
    """Extract all DGII-relevant fields from raw_extracted_data for the preview."""
    raw = raw_cache.get(str(inv.id))
    if raw is None and inv.raw_extracted_data:
        try:
            raw = json.loads(inv.raw_extracted_data)
            raw_cache[str(inv.id)] = raw
        except (json.JSONDecodeError, TypeError):
            raw = {}
            raw_cache[str(inv.id)] = {}
    if raw is None:
        raw = {}

    return {field: raw.get(field, None) for field in _RAW_DGII_FIELDS}


def _invoice_preview(
    inv,
    fmt: str = "dgii_606",
    raw_cache: Optional[Dict] = None,
    report_rnc: Optional[str] = None,
    confirmed_ncfs: Optional[set[str]] = None,
) -> dict:
    """Preview de factura con su estado de validación DGII + macro_status."""
    if raw_cache is None:
        raw_cache = {}
    v = _validate_invoice(inv, fmt, raw_cache, report_rnc=report_rnc)
    raw = raw_cache.get(str(inv.id)) or {}

    # Macro-simulation: replica la lógica de la columna Estatus de la plantilla oficial.
    # La plantilla usa =IF(AND(campos obligatorios), "OK", "ERROR: ...")
    macro_errors: List[str] = []
    ncf = (inv.invoice_number or raw.get("invoice_number") or "").strip()
    rnc = _invoice_tax_id_for_report(inv, fmt, raw, report_rnc)
    payment = raw.get("payment_method")
    normalized_payment = _normalize_payment_method(payment)
    ncf_type = _ncf_document_type(ncf)

    if not ncf:
        macro_errors.append("Falta NCF")
    if not _is_valid_ncf(ncf):
        macro_errors.append("NCF inválido")
    if fmt != "dgii_608" and not (fmt == "dgii_607" and _is_607_identification_optional(inv, raw)):
        if not rnc:
            macro_errors.append("Falta RNC")
        elif not _is_valid_rnc(rnc):
            macro_errors.append("RNC inválido")
    if fmt != "dgii_608" and (inv.total_amount is None or inv.total_amount == 0):
        macro_errors.append("Monto cero")
    if not inv.invoice_date:
        macro_errors.append("Falta fecha")
    if fmt == "dgii_606" and not (inv.goods_services_type or "").strip():
        macro_errors.append("Falta tipo B/S")
    if fmt == "dgii_606" and not normalized_payment:
        macro_errors.append("Falta forma de pago")
    if fmt == "dgii_607" and ncf_type not in _CREDIT_NOTE_NCF_TYPES and not normalized_payment:
        macro_errors.append("Falta forma de venta")

    macro_status = f"ERROR: {'; '.join(macro_errors)}" if macro_errors else "OK"
    reporting_state = "reportable"
    reporting_note = None
    if confirmed_ncfs and _is_confirmed_ncf_blocked(inv, confirmed_ncfs):
        reporting_state = "blocked_confirmed_ncf"
        reporting_note = "NCF ya confirmado como aceptado por DGII. No se puede re-reportar."

    # Extract raw DGII fields for inline editing
    dgii_fields = _extract_raw_dgii_fields(inv, raw_cache)

    file_url = None
    if inv.file_path:
        if IS_DEVELOPMENT:
            file_url = f"/invoices/{inv.id}/file?org_id={inv.organization_id}"
        else:
            file_url = f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_STORAGE_BUCKET}/{inv.file_path.lstrip('/')}"

    return {
        "id": str(inv.id),
        "vendor_name": inv.vendor_name or "",
        "vendor_tax_id": inv.vendor_tax_id or "",
        "invoice_number": inv.invoice_number or "",
        "invoice_date": inv.invoice_date.strftime("%Y-%m-%d") if inv.invoice_date else None,
        "total_amount": inv.total_amount,
        "tax_amount": inv.tax_amount,
        "goods_services_type": inv.goods_services_type or "",
        "category": inv.category or "",
        "source_type": inv.source_type or "",
        "file_path": inv.file_path or "",
        "file_url": file_url,
        "filename": inv.filename or "",
        "validation_status": v["status"],
        "validation_errors": v["errors"],
        "validation_warnings": v["warnings"],
        "macro_status": macro_status,
        "reporting_state": reporting_state,
        "reporting_note": reporting_note,
        "dgii_fields": dgii_fields,
        "dgii_validation_status": inv.dgii_validation_status or "unchecked",
        "dgii_security_code": inv.dgii_security_code or "",
    }


async def _extract_qr_from_invoice_image(file_path: str) -> Optional[Dict[str, Any]]:
    """Download invoice file from Supabase storage and try to extract QR data.
    
    Supports parsing hyperlinks and plain-text URLs from PDF documents
    as well as decoding QR codes from image data.
    """
    from app.services.dgii_validation import DgiiValidationService

    try:
        data = download_file(file_path)
        if not data:
            logger.warning("Could not download invoice file: %s", file_path)
            return None

        # If it is a PDF, parse hyperlinks and text links to extract DGII ConsultaTimbreFC URLs
        if file_path.lower().endswith(".pdf"):
            import io
            import PyPDF2
            
            try:
                reader = PyPDF2.PdfReader(io.BytesIO(data))
                for page in reader.pages:
                    # 1. Search page text for DGII validation URL pattern
                    text = page.extract_text() or ""
                    url_matches = re.findall(r'https?://fc\.dgii\.gov\.do/ecf/ConsultaTimbreFC[^\s"\'><]+', text)
                    for url in url_matches:
                        parsed = DgiiValidationService.parse_qr_url(url)
                        if parsed:
                            logger.info("QR URL extracted from PDF text: %s", file_path)
                            return parsed.to_dict()
                    
                    # 2. Search PDF annotation links (clickable hotspots)
                    if "/Annots" in page:
                        annots = page["/Annots"]
                        for annot in annots:
                            annot_obj = annot.get_object()
                            if "/A" in annot_obj and "/URI" in annot_obj["/A"]:
                                uri = annot_obj["/A"]["/URI"]
                                if "ConsultaTimbreFC" in uri:
                                    parsed = DgiiValidationService.parse_qr_url(uri)
                                    if parsed:
                                        logger.info("QR URL extracted from PDF links: %s", file_path)
                                        return parsed.to_dict()
            except Exception as pdf_err:
                logger.error("Failed to parse PDF links/text for QR extraction: %s", pdf_err)

        # Use image QR decoding strategy (either image format or fallback for PDFs)
        qr_results = DgiiValidationService.detect_qr_codes_bytes(data)
        if not qr_results:
            logger.info("No QR code found in file bytes: %s", file_path)
            return None

        for qr in qr_results:
            parsed = qr.get("parsed")
            if parsed:
                logger.info("QR extracted from image bytes: %s", file_path)
                return parsed

        return None
    except Exception as e:
        logger.error("QR extraction failed for %s: %s", file_path, e)
        return None
