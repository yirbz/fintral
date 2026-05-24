import logging
import re
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger(__name__)

RNC_WEIGHTS = [7, 9, 8, 6, 5, 4, 3, 2]
CEDULA_WEIGHTS = [1, 2, 1, 2, 1, 2, 1, 2, 1, 2]

NCF_PREFIX_MAP = {
    "B": "expense",
    "E": "income",
}

PAYMENT_METHOD_DEFAULT_GUESS = {
    "services": "2",
    "goods": "1",
    "unknown": "4",
}


def _validate_rnc_checksum(rnc: str) -> bool:
    """DGII módulo-11 checksum for 9-digit RNC."""
    if len(rnc) != 9 or not rnc.isdigit():
        return False
    digits = [int(d) for d in rnc]
    s = sum(d * w for d, w in zip(digits[:8], RNC_WEIGHTS))
    remainder = s % 11
    check = 11 - remainder
    if check == 11:
        check = 0
    return check == digits[8]


def _validate_cedula_checksum(cedula: str) -> bool:
    """Luhn mod-10 for 11-digit Dominican cédula."""
    if len(cedula) != 11 or not cedula.isdigit():
        return False
    digits = [int(d) for d in cedula]
    s = 0
    for d, w in zip(digits[:10], CEDULA_WEIGHTS):
        p = d * w
        if p >= 10:
            p = p // 10 + p % 10
        s += p
    remainder = s % 10
    check = (10 - remainder) % 10
    return check == digits[10]


class PostExtractionValidator:
    """Validates extracted invoice data after normalization, before DB save.

    Runs structural audits against DGII fiscal rules:
    - RNC checksum (módulo-11) / cédula checksum (Luhn)
    - NCF prefix vs transaction_type consistency
    - ITBIS ≈ 18/118 of total
    - Country + currency consistency
    - Default payment_method inference when missing
    """

    def validate(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Run all validations on normalized data. Mutates and returns data."""
        warnings: list = data.get("audit_warnings", [])
        if not isinstance(warnings, list):
            warnings = []

        vendor_tax_id = data.get("vendor_tax_id")
        if vendor_tax_id:
            tax_warning = self._check_tax_id(vendor_tax_id)
            if tax_warning:
                warnings.append(tax_warning)

        ncf = data.get("invoice_number")
        transaction_type = data.get("transaction_type")
        if ncf and transaction_type:
            ncf_warning = self._check_ncf_type(ncf, transaction_type, data)
            if ncf_warning:
                warnings.append(ncf_warning)

        total = data.get("total_amount")
        tax = data.get("tax_amount")
        if total is not None and tax is not None:
            itbis_warning = self._check_itbis(float(total), float(tax))
            if itbis_warning:
                warnings.append(itbis_warning)

        country = data.get("vendor_country")
        currency = data.get("currency", "DOP")
        country_warning = self._check_country_currency(country, currency)
        if country_warning:
            warnings.append(country_warning)

        payment_method = data.get("payment_method")
        if not payment_method:
            inferred = self._infer_payment_method(data)
            if inferred:
                data["payment_method"] = inferred
                warnings.append(
                    f"Forma de pago inferida como {inferred} (no estaba explícita en el documento)"
                )

        if not country:
            inferred_country, method, confidence = self._infer_country(data)
            if inferred_country:
                data["vendor_country"] = inferred_country
                data["country_detection_method"] = method
                data["country_confidence"] = confidence

        data["audit_warnings"] = warnings
        return data

    def _check_tax_id(self, tax_id: str) -> Optional[str]:
        """Validate RNC (módulo-11) or cédula (Luhn) checksum."""
        digits_only = re.sub(r"[^0-9]", "", tax_id)
        if len(digits_only) == 9 and _validate_rnc_checksum(digits_only):
            return None
        if len(digits_only) == 11 and _validate_cedula_checksum(digits_only):
            return None
        if len(digits_only) == 9:
            return f"El RNC {tax_id} no pasó la validación de dígito verificador (módulo-11). Verifica que esté correcto."
        if len(digits_only) == 11:
            return f"La cédula {tax_id} no pasó la validación de dígito verificador (Luhn). Verifica que esté correcta."
        return None

    def _check_ncf_type(self, ncf: str, transaction_type: str, data: Optional[Dict[str, Any]] = None) -> Optional[str]:
        """Cross-check NCF prefix letter against transaction_type.
        
        For e-CF NCFs (E prefix + ecf_type present), the E means "Electronic"
        not "Income" — skip the traditional prefix check.
        """
        prefix = ncf[0].upper() if ncf else None
        if not prefix:
            return None
        # e-CF NCFs use E prefix for "Electronic" — skip the income/expense mapping
        if prefix == "E" and data and data.get("ecf_type"):
            return None
        if prefix not in NCF_PREFIX_MAP:
            return None
        expected_type = NCF_PREFIX_MAP[prefix]
        if expected_type != transaction_type:
            label = "ingreso" if expected_type == "income" else "gasto"
            actual_label = "ingreso" if transaction_type == "income" else "gasto"
            return (
                f"El NCF \"{ncf}\" (prefijo {prefix}) corresponde a {label}, "
                f"pero el tipo de transacción es {actual_label}. "
                "Verifica el tipo de comprobante."
            )
        return None

    def _check_itbis(self, total: float, tax: float) -> Optional[str]:
        """Cross-check ITBIS ≈ 18/118 of total (Dominican ITBIS included)."""
        if total <= 0 or tax <= 0:
            return None
        expected_tax = total * 18.0 / 118.0
        if expected_tax <= 0:
            return None
        diff_pct = abs(tax - expected_tax) / expected_tax
        if diff_pct > 0.05:
            return (
                f"El ITBIS ({tax:.2f}) no coincide con el 18% incluido del total "
                f"({total:.2f}, esperado ≈ {expected_tax:.2f}). "
                "Diferencia del {:.1f}%. Verifica el monto.".format(diff_pct * 100)
            )
        return None

    def _check_country_currency(self, country: Optional[str], currency: str) -> Optional[str]:
        """Warn on DOM + non-DOP or USA + non-USD combinations."""
        if not country:
            return None
        country = country.upper().strip()
        currency = currency.upper().strip()
        if country == "DOM" and currency != "DOP":
            return (
                f"País {country} con moneda {currency}. "
                "Las facturas dominicanas usualmente usan DOP. "
                "Verifica que la moneda sea correcta."
            )
        if country == "USA" and currency not in ("USD",):
            return (
                f"País {country} con moneda {currency}. "
                "Verifica que la moneda sea correcta."
            )
        return None

    def _infer_payment_method(self, data: Dict[str, Any]) -> Optional[str]:
        """Infer default payment method when missing from document."""
        gst = data.get("goods_services_type")
        total = data.get("total_amount") or 0
        transaction_type = data.get("transaction_type")

        if transaction_type == "income":
            return "3"

        if gst:
            gst_code = int(gst) if gst.isdigit() else 0
            if gst_code >= 6:
                return "2"
            if total > 100000:
                return "2"
            return "1"

        if total > 100000:
            return "2"
        return "4"

    def _infer_country(self, data: Dict[str, Any]) -> Tuple[Optional[str], str, float]:
        """Infer country from tax_id pattern or currency."""
        tax_id = data.get("vendor_tax_id")
        currency = data.get("currency")

        if tax_id:
            digits_only = re.sub(r"[^0-9]", "", tax_id)
            if len(digits_only) == 9 or len(digits_only) == 11:
                return "DOM", "tax_id_pattern", 0.7

        if currency:
            currency_to_country = {
                "DOP": "DOM",
                "USD": "USA",
                "MXN": "MEX",
                "EUR": None,
                "COP": "COL",
                "ARS": "ARG",
                "CLP": "CHL",
                "BRL": "BRA",
                "PEN": "PER",
                "GBP": "GBR",
            }
            inferred = currency_to_country.get(currency.upper())
            if inferred:
                return inferred, "currency_fallback", 0.5

        return None, "undetected", 0.0


post_extraction_validator = PostExtractionValidator()
