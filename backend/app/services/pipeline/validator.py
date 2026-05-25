import logging
import re
from typing import Any, Dict, Optional, Tuple

from app.utils.validation import is_valid_rnc_or_cedula, validate_rnc_checksum, validate_cedula_checksum

logger = logging.getLogger(__name__)

NCF_PREFIX_MAP = {
    "B": "expense",
    "E": "income",
}

PAYMENT_METHOD_DEFAULT_GUESS = {
    "services": "2",
    "goods": "1",
    "unknown": "4",
}


class PostExtractionValidator:
    """Validates extracted invoice data after normalization, before DB save.

    Runs structural audits against DGII fiscal rules:
    - RNC checksum / cédula checksum using centralized standard do validation.
    - NCF prefix vs transaction_type consistency.
    - ITBIS validation depending on e-CF / NCF types (exemptions, deductibility).
    - Match between buyer RNC / issuer RNC and the current organization.
    - Mandatory NCF modified for Debit/Credit notes.
    - Withholding audits for informal purchases (Tipo 11/41) and payments abroad (Tipo 17/47).
    """

    def validate(self, data: Dict[str, Any], org_rnc: Optional[str] = None) -> Dict[str, Any]:
        """Run all validations on normalized data. Mutates and returns data."""
        warnings: list = data.get("audit_warnings", [])
        if not isinstance(warnings, list):
            warnings = []

        # Ensure ecf_type is inferred if missing but invoice_number matches e-NCF pattern
        ncf = data.get("invoice_number")
        ecf_type = data.get("ecf_type")
        if ncf:
            ncf = ncf.strip().upper()
            if not ecf_type and len(ncf) == 13 and ncf[0] == 'E' and ncf[1:3].isdigit():
                ecf_type = ncf[1:3]
                data["ecf_type"] = ecf_type
            elif not ecf_type and len(ncf) == 11 and ncf[0] == 'B' and ncf[1:3].isdigit():
                ecf_type = ncf[1:3]
                data["ecf_type"] = ecf_type

        vendor_tax_id = data.get("vendor_tax_id")
        if vendor_tax_id:
            tax_warning = self._check_tax_id(vendor_tax_id)
            if tax_warning:
                warnings.append(tax_warning)

        transaction_type = data.get("transaction_type")
        if ncf and transaction_type:
            ncf_warning = self._check_ncf_type(ncf, transaction_type, data)
            if ncf_warning:
                warnings.append(ncf_warning)

        # Smart ITBIS checking
        total = data.get("total_amount")
        tax = data.get("tax_amount")
        if total is not None and tax is not None:
            itbis_warning = self._check_itbis_rules(float(total), float(tax), ecf_type, transaction_type)
            if itbis_warning:
                warnings.append(itbis_warning)

        # Match RNC with Organization RNC
        if org_rnc:
            org_warning = self._check_organization_rnc_match(data, org_rnc)
            if org_warning:
                warnings.append(org_warning)

        # Modification checks for Notes
        ncf_code = ncf[1:3] if (ncf and len(ncf) >= 3 and ncf[1:3].isdigit()) else None
        if ecf_type in ("33", "34") or ncf_code in ("03", "04"):
            ncf_modified = data.get("ncf_modified")
            if not ncf_modified:
                warnings.append("Las Notas de Crédito y Débito deben especificar el comprobante original modificado (NCF Modificado).")
            else:
                ncf_modified_clean = ncf_modified.strip().upper()
                if not re.match(r"^[BE]\d{2}\d{8,10}$", ncf_modified_clean) and len(ncf_modified_clean) != 19:
                    warnings.append(f"El NCF Modificado '{ncf_modified}' tiene un formato inválido.")

        # Withholdings checks
        if transaction_type == "expense":
            if ecf_type == "41" or ncf_code == "11":
                itbis_ret = data.get("total_itbis_retenido")
                isr_ret = data.get("total_isr_retencion")
                if itbis_ret is None or float(itbis_ret) <= 0:
                    warnings.append("Los comprobantes de compras a proveedores informales (B11/E41) usualmente requieren retención del 100% del ITBIS facturado.")
                if isr_ret is None or float(isr_ret) <= 0:
                    warnings.append("Los comprobantes de compras a proveedores informales (B11/E41) requieren la retención del ISR (habitualmente 2% para bienes o 10% para servicios).")
            elif ecf_type == "47" or ncf_code == "17":
                isr_ret = data.get("total_isr_retencion")
                if isr_ret is None or float(isr_ret) <= 0:
                    warnings.append("Los pagos al exterior (B17/E47) requieren retención obligatoria del Impuesto Sobre la Renta (ISR).")

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
        """Validate RNC or cédula using centralized check digit logic."""
        digits_only = re.sub(r"[^0-9]", "", tax_id)
        if len(digits_only) == 9:
            if not validate_rnc_checksum(digits_only):
                return f"El RNC {tax_id} no pasó la validación de dígito verificador (módulo-11). Verifica que esté correcto."
        elif len(digits_only) == 11:
            if not validate_cedula_checksum(digits_only):
                return f"La cédula {tax_id} no pasó la validación de dígito verificador (Luhn). Verifica que esté correcta."
        else:
            return f"El RNC/Cédula {tax_id} tiene una longitud inválida ({len(digits_only)} dígitos, debe ser 9 o 11)."
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

    def _check_itbis_rules(self, total: float, tax: float, ecf_type: Optional[str], transaction_type: Optional[str]) -> Optional[str]:
        """Cross-check ITBIS depending on e-CF / NCF type and deductibility rules."""
        if total <= 0:
            return None

        # Exemption checks
        if ecf_type in ("14", "44", "16", "46"):
            if tax > 0:
                return "Para comprobantes de Regímenes Especiales (B14/E44) o Exportaciones (B16/E46), el ITBIS debe ser 0% (exento/tasa cero)."
            return None

        # Non-deductible checks for expenses
        if transaction_type == "expense" and ecf_type in ("02", "32", "17", "47"):
            if tax > 0:
                return f"Las facturas de consumo (B02/E32) o pagos al exterior (B17/E47) no generan crédito fiscal de ITBIS por adelantar."
            return None

        if tax <= 0:
            return None

        # Max rate check: ITBIS cannot exceed 18% of total (which is 18/118 if tax is included, or 18% of subtotal)
        # Tax included: expected_max_tax = total * 18.0 / 118.0
        # Tax excluded: expected_max_tax = (total - tax) * 0.18 -> wait, this is also tax = total * 18/118
        max_possible_tax = total * 18.0 / 118.0
        if tax > max_possible_tax + 0.05 * total:
            return f"El ITBIS ({tax:.2f}) es mayor al 18% máximo permitido. Verifica el monto del impuesto."

        # Verify rate standard alignment (either 18% or 16% of total)
        expected_18 = total * 18.0 / 118.0
        expected_16 = total * 16.0 / 116.0
        
        diff_18 = abs(tax - expected_18) / expected_18 if expected_18 > 0 else 1.0
        diff_16 = abs(tax - expected_16) / expected_16 if expected_16 > 0 else 1.0

        if diff_18 > 0.05 and diff_16 > 0.05:
            return (
                f"El ITBIS ({tax:.2f}) no coincide con el 18% o 16% del total "
                f"(esperado ≈ {expected_18:.2f} o {expected_16:.2f}). Verifica el monto."
            )
        return None

    def _check_organization_rnc_match(self, data: Dict[str, Any], org_rnc: str) -> Optional[str]:
        """Verify that organization RNC matches buyer RNC (for expenses) or vendor RNC (for incomes)."""
        clean_org = re.sub(r"\D", "", org_rnc)
        if not clean_org:
            return None

        transaction_type = data.get("transaction_type")
        ecf_type = data.get("ecf_type")
        ncf = data.get("invoice_number")
        ncf_code = ncf[1:3] if (ncf and len(ncf) >= 3 and ncf[1:3].isdigit()) else None

        if transaction_type == "expense":
            # Only check match for tax-deductible invoice types
            is_deductible_type = ecf_type in ("31", "41", "44", "45", "43") or ncf_code in ("01", "11", "14", "15", "13")
            if is_deductible_type:
                rnc_comprador = data.get("rnc_comprador")
                if not rnc_comprador:
                    return "Para comprobantes de Crédito Fiscal, Gubernamentales o de Compras, el RNC del comprador es obligatorio."
                
                clean_comprador = re.sub(r"\D", "", str(rnc_comprador))
                if clean_comprador != clean_org:
                    return (
                        f"El RNC del comprador ({rnc_comprador}) no coincide con el RNC de tu organización ({org_rnc}). "
                        "Este comprobante no es deducible para esta empresa."
                    )
        elif transaction_type == "income":
            vendor_tax_id = data.get("vendor_tax_id")
            if vendor_tax_id:
                clean_vendor = re.sub(r"\D", "", str(vendor_tax_id))
                if clean_vendor != clean_org:
                    return (
                        f"El RNC del emisor ({vendor_tax_id}) no coincide con el RNC de tu organización ({org_rnc}). "
                        "Verifica si ingresaste el emisor de forma correcta."
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
