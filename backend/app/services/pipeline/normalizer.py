import json
import re
from datetime import datetime, timedelta
from typing import Any, Dict, Optional


CANONICAL_SCHEMA = {
    "vendor_name": str,
    "vendor_tax_id": str,
    "vendor_fiscal_address": str,
    "invoice_number": str,
    "ncf_modified": Optional[str],
    "ncf_modification_type": Optional[str],
    "invoice_date": str,
    "payment_date": Optional[str],
    "total_amount": float,
    "tax_amount": Optional[float],
    "currency": str,
    "vendor_country": Optional[str],
    "country_detection_method": Optional[str],
    "country_confidence": Optional[float],
    "transaction_type": str,
    "category": str,
    "description": str,
    "line_items": list,
    "goods_services_type": Optional[str],
    "payment_method": Optional[str],
    "payment_condition": Optional[str],
    "due_date": Optional[str],
    "confidence": float,
    "source_type": str,
    "ecf_type": Optional[str],
    "audit_warnings": list,
    "is_credit_note": Optional[bool],
    "indicador_nota_credito": Optional[str],
    "motivo_modificacion": Optional[str],

    "eNCF": Optional[str],
    "tipo_pago": Optional[str],
    "fecha_limite_pago": Optional[str],
    "termino_pago": Optional[str],
    "fecha_vencimiento_secuencia": Optional[str],
    "tipo_ingresos": Optional[str],
    "monto_periodo": Optional[float],
    "saldo_anterior": Optional[float],
    "monto_avance_pago": Optional[float],
    "valor_pagar": Optional[float],
    "monto_gravado_total": Optional[float],
    "monto_exento": Optional[float],
    "monto_gravado_i1": Optional[float],
    "monto_gravado_i2": Optional[float],
    "monto_gravado_i3": Optional[float],
    "itbis1": Optional[int],
    "itbis2": Optional[int],
    "itbis3": Optional[int],
    "total_itbis1": Optional[float],
    "total_itbis2": Optional[float],
    "total_itbis3": Optional[float],
    "total_itbis_retenido": Optional[float],
    "total_isr_retencion": Optional[float],
    "total_itbis_percepcion": Optional[float],
    "total_isr_percepcion": Optional[float],
    "monto_impuesto_adicional": Optional[float],
    "impuestos_adicionales": list,
    "descuentos_recargos": list,
    "subtotales": list,
    "formas_pago": list,
    "original_xml_data": Optional[str],

    # Emisor extra fields
    "correo_emisor": Optional[str],
    "nombre_comercial": Optional[str],
    "sucursal": Optional[str],
    "municipio_emisor": Optional[str],
    "provincia_emisor": Optional[str],
    "fecha_emision": Optional[str],

    # Comprador fields
    "razon_social_comprador": Optional[str],
    "direccion_comprador": Optional[str],
    "correo_comprador": Optional[str],
    "municipio_comprador": Optional[str],
    "provincia_comprador": Optional[str],
    "contacto_comprador": Optional[str],
    "numero_orden_compra": Optional[str],
    "identificador_extranjero": Optional[str],

    # Tax breakdown aliases
    "itbis_retenido": Optional[float],
    "isr_retention_amount": Optional[float],
}


class Normalizer:
    """Normalize extracted data to canonical JSON schema."""

    def normalize(
        self,
        data: Dict[str, Any],
        source_type: str,
        confidence: float = 0.0,
    ) -> Dict[str, Any]:
        """Normalize extraction data to canonical schema."""
        normalized = {
            "vendor_name": self._clean_string(data.get("vendor_name")),
            "vendor_tax_id": self._normalize_rnc(data.get("vendor_tax_id")),
            "vendor_fiscal_address": self._clean_string(data.get("vendor_fiscal_address")),
            "vendor_country": self._clean_string(data.get("vendor_country")),
            "country_detection_method": self._clean_string(data.get("country_detection_method")),
            "country_confidence": self._clean_number(data.get("country_confidence")),
            "invoice_number": self._normalize_ncf(data.get("invoice_number")),
            "ncf_modified": self._normalize_ncf(data.get("ncf_modified")),
            "ncf_modification_type": self._clean_string(data.get("ncf_modification_type")),
            "invoice_date": self._validate_date(data.get("invoice_date")),
            "payment_date": self._validate_date(data.get("payment_date")),
            "total_amount": self._clean_number(data.get("total_amount")) or 0.0,
            "tax_amount": self._clean_number(data.get("tax_amount")),
            "currency": self._clean_currency(data.get("currency", "DOP")),
            "transaction_type": self._validate_transaction_type(data.get("transaction_type")),
            "category": self._clean_string(data.get("category")) or "sin_categoria",
            "description": self._clean_string(data.get("description")),
            "line_items": self._validate_line_items(data.get("line_items", [])),
            "goods_services_type": self._validate_goods_services_type(data.get("goods_services_type")),
            "payment_method": self._validate_payment_method(data.get("payment_method")),
            "payment_condition": self._clean_string(data.get("payment_condition")),
            "due_date": self._validate_date(data.get("due_date")),
            "confidence": float(confidence) if confidence else self._clean_confidence(data.get("confidence", 0.5)),
            "source_type": source_type,
            "ecf_type": self._clean_string(data.get("ecf_type")),
            "rnc_comprador": self._normalize_rnc(data.get("rnc_comprador")),
            "is_credit_note": bool(data.get("is_credit_note")) if data.get("is_credit_note") is not None else None,
            "indicador_nota_credito": self._clean_string(data.get("indicador_nota_credito")),
            "motivo_modificacion": self._clean_string(data.get("motivo_modificacion")),
            "vendor_tax_id_comprador": self._normalize_rnc(data.get("vendor_tax_id_comprador")),

            # Emisor extra fields
            "correo_emisor": self._clean_string(data.get("correo_emisor")),
            "nombre_comercial": self._clean_string(data.get("nombre_comercial")),
            "sucursal": self._clean_string(data.get("sucursal")),
            "municipio_emisor": self._clean_string(data.get("municipio_emisor")),
            "provincia_emisor": self._clean_string(data.get("provincia_emisor")),
            "fecha_emision": self._validate_date(data.get("fecha_emision")),

            # Comprador fields
            "razon_social_comprador": self._clean_string(data.get("razon_social_comprador")),
            "direccion_comprador": self._clean_string(data.get("direccion_comprador")),
            "correo_comprador": self._clean_string(data.get("correo_comprador")),
            "municipio_comprador": self._clean_string(data.get("municipio_comprador")),
            "provincia_comprador": self._clean_string(data.get("provincia_comprador")),
            "contacto_comprador": self._clean_string(data.get("contacto_comprador")),
            "numero_orden_compra": self._clean_string(data.get("numero_orden_compra")),
            "identificador_extranjero": self._clean_string(data.get("identificador_extranjero")),

            # Tax breakdown aliases
            "itbis_retenido": self._clean_number(data.get("itbis_retenido") or data.get("total_itbis_retenido")),
            "isr_retention_amount": self._clean_number(data.get("isr_retention_amount") or data.get("total_isr_retencion")),

            "audit_warnings": data.get("audit_warnings", []) if isinstance(data.get("audit_warnings"), list) else [],

            "eNCF": self._clean_string(data.get("eNCF")),
            "tipo_pago": self._clean_string(data.get("tipo_pago")),
            "fecha_limite_pago": self._validate_date(data.get("fecha_limite_pago")),
            "termino_pago": self._clean_string(data.get("termino_pago")),
            "fecha_vencimiento_secuencia": self._validate_date(data.get("fecha_vencimiento_secuencia")),
            "tipo_ingresos": self._clean_string(data.get("tipo_ingresos")),
            "monto_periodo": self._clean_number(data.get("monto_periodo")),
            "saldo_anterior": self._clean_number(data.get("saldo_anterior")),
            "monto_avance_pago": self._clean_number(data.get("monto_avance_pago")),
            "valor_pagar": self._clean_number(data.get("valor_pagar")),
            "monto_gravado_total": self._clean_number(data.get("monto_gravado_total")),
            "monto_exento": self._clean_number(data.get("monto_exento")),
            "monto_gravado_i1": self._clean_number(data.get("monto_gravado_i1")),
            "monto_gravado_i2": self._clean_number(data.get("monto_gravado_i2")),
            "monto_gravado_i3": self._clean_number(data.get("monto_gravado_i3")),
            "itbis1": self._clean_int(data.get("itbis1")),
            "itbis2": self._clean_int(data.get("itbis2")),
            "itbis3": self._clean_int(data.get("itbis3")),
            "total_itbis1": self._clean_number(data.get("total_itbis1")),
            "total_itbis2": self._clean_number(data.get("total_itbis2")),
            "total_itbis3": self._clean_number(data.get("total_itbis3")),
            "total_itbis_retenido": self._clean_number(data.get("total_itbis_retenido")),
            "total_isr_retencion": self._clean_number(data.get("total_isr_retencion")),
            "total_itbis_percepcion": self._clean_number(data.get("total_itbis_percepcion")),
            "total_isr_percepcion": self._clean_number(data.get("total_isr_percepcion")),
            "monto_impuesto_adicional": self._clean_number(data.get("monto_impuesto_adicional")),
            "impuestos_adicionales": data.get("impuestos_adicionales", []),
            "descuentos_recargos": data.get("descuentos_recargos", []),
            "subtotales": data.get("subtotales", []),
            "formas_pago": data.get("formas_pago", []),
            "original_xml_data": data.get("original_xml_data"),
            "electronic_seal": data.get("electronic_seal"),
        }

        # Clean/infer payment_condition
        p_cond = normalized.get("payment_condition")
        if p_cond:
            p_cond_clean = p_cond.lower()
            if "cred" in p_cond_clean or p_cond_clean == "4" or "credit" in p_cond_clean:
                normalized["payment_condition"] = "credito"
            else:
                normalized["payment_condition"] = "contado"
        else:
            # Inference:
            pm = normalized.get("payment_method")
            tp = normalized.get("tipo_pago")
            term = normalized.get("termino_pago")
            if pm == "4" or str(tp) == "2" or (term and "cred" in term.lower()):
                normalized["payment_condition"] = "credito"
            else:
                normalized["payment_condition"] = "contado"

        # Resolve due_date
        due = normalized.get("due_date") or normalized.get("fecha_limite_pago")
        if due:
            normalized["due_date"] = due
        elif normalized["payment_condition"] == "credito" and normalized["invoice_date"]:
            # default to invoice_date + 30 days
            try:
                inv_date = datetime.strptime(normalized["invoice_date"], "%Y-%m-%d")
                normalized["due_date"] = (inv_date + timedelta(days=30)).strftime("%Y-%m-%d")
            except Exception:
                normalized["due_date"] = None
        else:
            normalized["due_date"] = None

        # Resolve default payment_status
        if normalized.get("payment_date"):
            normalized["payment_status"] = "paid"
        else:
            if normalized["payment_condition"] == "credito":
                normalized["payment_status"] = "pending"
            elif normalized.get("transaction_type") == "income":
                # Income invoices are pending until the client actually pays
                normalized["payment_status"] = "pending"
            else:
                normalized["payment_status"] = "paid"

        if not normalized["vendor_name"]:
            normalized["vendor_name"] = "Proveedor no identificado"

        return normalized

    def to_db_dict(self, normalized: Dict[str, Any]) -> Dict[str, Any]:
        """Convert canonical schema to database-compatible dict."""
        result = {
            "vendor_name": normalized.get("vendor_name"),
            "vendor_tax_id": normalized.get("vendor_tax_id"),
            "vendor_fiscal_address": normalized.get("vendor_fiscal_address"),
            "invoice_number": normalized.get("invoice_number"),
            "invoice_date": self._parse_date(normalized.get("invoice_date")),
            "payment_date": self._parse_date(normalized.get("payment_date")),
            "total_amount": normalized.get("total_amount"),
            "tax_amount": normalized.get("tax_amount"),
            "currency": normalized.get("currency", "DOP"),
            "transaction_type": normalized.get("transaction_type"),
            "category": normalized.get("category"),
            "description": normalized.get("description"),
            "line_items_data": json.dumps(normalized.get("line_items", [])),
            "goods_services_type": normalized.get("goods_services_type"),
            "payment_method": normalized.get("payment_method"),
            "confidence_score": normalized.get("confidence"),
            "payment_condition": normalized.get("payment_condition", "contado"),
            "due_date": self._parse_date(normalized.get("due_date")),
            "payment_status": normalized.get("payment_status", "paid"),
            "source_type": normalized.get("source_type"),
            "ecf_type": normalized.get("ecf_type"),
            "rnc_comprador": normalized.get("rnc_comprador"),
            "rnc_emisor": normalized.get("rnc_emisor") or normalized.get("vendor_tax_id"),
            "audit_flags": json.dumps(normalized.get("audit_warnings", [])),
        }
        if normalized.get("ecf_type"):
            result["original_xml_data"] = normalized.get("original_xml_data")
        return result

    def _clean_string(self, value: Any) -> Optional[str]:
        if value is None or value == "null" or (isinstance(value, str) and not value.strip()):
            return None
        return str(value).strip()

    def _clean_number(self, value: Any) -> Optional[float]:
        if value is None or value == "null":
            return None
        try:
            if isinstance(value, str):
                cleaned = value.replace("$", "").replace("€", "").replace("£", "").replace(",", "").strip()
                return float(cleaned) if cleaned else None
            return float(value)
        except (ValueError, TypeError):
            return None

    def _clean_int(self, value: Any) -> Optional[int]:
        if value is None or value == "null":
            return None
        try:
            if isinstance(value, str):
                cleaned = re.sub(r"[^0-9\-]", "", value.strip())
                return int(cleaned) if cleaned else None
            return int(value)
        except (ValueError, TypeError):
            return None

    def _clean_currency(self, value: Any) -> str:
        if value is None or value == "null":
            return "DOP"
        valid = ["DOP", "USD", "EUR", "MXN", "CAD", "GBP", "JPY", "CNY", "AUD", "CHF"]
        currency = str(value).upper().strip()
        return currency if currency in valid else "DOP"

    def _normalize_rnc(self, value: Any) -> Optional[str]:
        if value is None or value == "null":
            return None
        rnc = re.sub(r"[^0-9]", "", str(value))
        return rnc if rnc else None

    def _normalize_ncf(self, value: Any) -> Optional[str]:
        if value is None or value == "null":
            return None
        ncf = str(value).upper().strip()
        ncf = re.sub(r"[^A-Z0-9]", "", ncf)
        return ncf if ncf else None

    def _validate_date(self, value: Any) -> Optional[str]:
        if value is None or value == "null":
            return None
        try:
            date_str = str(value).strip()
            for fmt in ["%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%Y/%m/%d"]:
                try:
                    parsed = datetime.strptime(date_str, fmt)
                    return parsed.strftime("%Y-%m-%d")
                except ValueError:
                    continue
            return None
        except Exception:
            return None

    def _parse_date(self, value: Optional[str]) -> Optional[datetime]:
        if not value:
            return None
        try:
            return datetime.strptime(value, "%Y-%m-%d")
        except Exception:
            return None

    def _validate_transaction_type(self, value: Any) -> str:
        if value is None or value == "null":
            return "expense"
        value = str(value).lower().strip()
        if value in ["income", "ingreso", "venta"]:
            return "income"
        return "expense"

    def _validate_line_items(self, items: Any) -> list:
        if not isinstance(items, list):
            return []
        cleaned = []
        for item in items:
            if not isinstance(item, dict):
                continue
            cleaned_item = {
                "description": self._clean_string(item.get("description")),
                "quantity": self._clean_number(item.get("quantity")) or 1.0,
                "unit_price": self._clean_number(item.get("unit_price")) or 0.0,
                "subtotal": self._clean_number(item.get("subtotal")) or 0.0,
            }
            if cleaned_item["description"]:
                cleaned.append(cleaned_item)
        return cleaned

    def _validate_goods_services_type(self, value: Any) -> Optional[str]:
        if value is None or value == "null":
            return None
        code = str(value).strip()
        if len(code) == 1:
            code = f"0{code}"
        valid = {f"{i:02d}" for i in range(1, 12)}
        return code if code in valid else None

    def _validate_payment_method(self, value: Any) -> Optional[str]:
        if value is None or value == "null":
            return None
        raw = str(value).strip()
        if raw.isdigit():
            code = int(raw)
            return str(code) if 1 <= code <= 7 else None
        text = raw.lower()
        if "efectivo" in text:
            return "1"
        if "cheque" in text or "transfer" in text or "depósito" in text:
            return "2"
        if "tarjeta" in text:
            return "3"
        if "crédito" in text or "credito" in text:
            return "4"
        return None

    def _clean_confidence(self, value: Any) -> float:
        try:
            conf = float(value)
            return max(0.0, min(1.0, conf))
        except Exception:
            return 0.5


normalizer = Normalizer()