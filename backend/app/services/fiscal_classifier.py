"""
Clasifica automáticamente el fiscal_status de una factura
basándose en reglas determinísticas + resultado de validación DGII.

Se ejecuta:
1. Al procesar una factura nueva (pipeline post-process hook)
2. Al editar campos fiscales manualmente
3. En batch al solicitar auto-generate del 606
"""
import logging
from typing import Any, Dict, List, Optional, Tuple

from app.models import Invoice

logger = logging.getLogger(__name__)

# Valid NCF document types for physical (B) and electronic (E) invoices
_NCF_DOC_TYPES = {'01', '02', '03', '04', '11', '12', '13', '14', '15', '16', '17'}
_ECF_DOC_TYPES = {'31', '32', '33', '34', '41', '43', '44', '45', '46', '47'}


def _is_valid_ncf_format(ncf: Optional[str]) -> bool:
    """Valida NCF dominicano según especificación DGII."""
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


def _is_valid_rnc(rnc: Optional[str]) -> bool:
    from app.utils.validation import is_valid_rnc_or_cedula
    return is_valid_rnc_or_cedula(rnc)


def _ncf_errors(ncf: Optional[str]) -> Optional[str]:
    """Retorna mensaje de error específico, o None si es válido."""
    if not ncf:
        return "Falta NCF"
    ncf = ncf.strip().upper()
    if len(ncf) not in (11, 13, 19):
        return f"NCF longitud inválida ({len(ncf)} chars, esperado 11/13/19)"
    if len(ncf) == 13:
        if ncf[0] != 'E':
            return f"NCF e-CF debe iniciar con 'E', encontrado '{ncf[0]}'"
        if not ncf[1:].isdigit():
            return "NCF contiene caracteres no numéricos"
        if ncf[1:3] not in _ECF_DOC_TYPES:
            return f"Tipo documento '{ncf[1:3]}' no válido"
    elif len(ncf) == 11:
        if ncf[0] != 'B':
            return f"NCF tradicional debe iniciar con 'B', encontrado '{ncf[0]}'"
        if not ncf[1:].isdigit():
            return "NCF contiene caracteres no numéricos"
        if ncf[1:3] not in _NCF_DOC_TYPES:
            return f"Tipo documento '{ncf[1:3]}' no válido"
    elif len(ncf) == 19:
        if ncf[0] not in 'AP':
            return f"NCF pre-2018 debe iniciar con 'A' o 'P', encontrado '{ncf[0]}'"
        if not ncf[1:].isdigit():
            return "NCF contiene caracteres no numéricos"
    return None


class FiscalClassifier:
    """Clasifica el fiscal_status de una factura según reglas determinísticas."""

    def classify(self, invoice: Invoice) -> Tuple[str, List[str]]:
        """Returns (fiscal_status, reasons[]).

        Reasons are human-readable strings explaining the classification.
        """
        reasons: List[str] = []

        # Rule 1: e-CF validada por DGII
        if invoice.dgii_validation_status == "accepted":
            return ("valid", ["Aceptado por la DGII (e-CF)"])

        # Rule 2: e-CF rechazada
        if invoice.dgii_validation_status in ("rejected", "voided"):
            reasons.append(f"DGII: {invoice.dgii_validation_status}")
            return ("invalid", reasons)

        # Rule 3: NCF físico — validación por formato
        ncf = (invoice.invoice_number or "").strip().upper()
        if ncf:
            ncf_err = _ncf_errors(ncf)
            if ncf_err:
                reasons.append(ncf_err)
                return ("invalid", reasons)

            rnc_ok = bool(invoice.vendor_tax_id) and _is_valid_rnc(invoice.vendor_tax_id)
            if not rnc_ok:
                reasons.append("RNC/Cédula del proveedor inválido o ausente")
                return ("invalid", reasons)

            return ("valid", ["NCF y RNC válidos"])

        # Rule 4: Sin NCF
        if not ncf:
            reasons.append("Factura sin NCF")
            return ("invalid", reasons)

        # Fallback
        return ("pending_review", reasons)

    def classify_from_data(self, data: Dict[str, Any]) -> Tuple[str, List[str]]:
        """Classify from a data dict instead of an Invoice model.

        Useful during pipeline processing before the invoice is persisted.
        """
        reasons: List[str] = []

        dgii_status = data.get("dgii_validation_status", "")
        if dgii_status == "accepted":
            return ("valid", ["Aceptado por la DGII (e-CF)"])

        if dgii_status in ("rejected", "voided"):
            reasons.append(f"DGII: {dgii_status}")
            return ("invalid", reasons)

        ncf = (data.get("invoice_number") or "").strip().upper()
        if ncf:
            ncf_err = _ncf_errors(ncf)
            if ncf_err:
                reasons.append(ncf_err)
                return ("invalid", reasons)

            vendor_tax_id = data.get("vendor_tax_id")
            if vendor_tax_id and _is_valid_rnc(vendor_tax_id):
                return ("valid", ["NCF y RNC válidos"])
            reasons.append("RNC/Cédula del proveedor inválido o ausente")
            return ("invalid", reasons)

        reasons.append("Factura sin NCF")
        return ("invalid", reasons)


fiscal_classifier = FiscalClassifier()
