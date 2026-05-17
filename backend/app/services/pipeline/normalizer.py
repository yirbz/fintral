import json
import re
from datetime import datetime
from typing import Any, Dict, Optional


CANONICAL_SCHEMA = {
    "vendor_name": str,
    "vendor_tax_id": str,
    "vendor_fiscal_address": str,
    "invoice_number": str,
    "invoice_date": str,
    "payment_date": Optional[str],
    "total_amount": float,
    "tax_amount": Optional[float],
    "currency": str,
    "transaction_type": str,
    "category": str,
    "description": str,
    "line_items": list,
    "goods_services_type": Optional[str],
    "payment_method": Optional[str],
    "confidence": float,
    "source_type": str,
    "audit_warnings": list,
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
            "invoice_number": self._normalize_ncf(data.get("invoice_number")),
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
            "confidence": float(confidence) if confidence else self._clean_confidence(data.get("confidence", 0.5)),
            "source_type": source_type,
            "audit_warnings": data.get("audit_warnings", []) if isinstance(data.get("audit_warnings"), list) else [],
        }

        if not normalized["vendor_name"]:
            normalized["vendor_name"] = "Proveedor no identificado"
            # No añadir warning — es un fallback informativo, no un error

        return normalized

    def to_db_dict(self, normalized: Dict[str, Any]) -> Dict[str, Any]:
        """Convert canonical schema to database-compatible dict."""
        return {
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
            "source_type": normalized.get("source_type"),
            "audit_flags": json.dumps(normalized.get("audit_warnings", [])),
        }

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
                    if parsed.date() > datetime.now().date():
                        return None
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