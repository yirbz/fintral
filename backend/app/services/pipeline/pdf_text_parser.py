import os
import re
from typing import Any, Dict, Optional
import PyPDF2

from app.services.pipeline.base import BaseProcessor, ProcessingResult


RNC_PATTERN = r"\d{3}-?\d{7}-?\d{1}|\d{9}"
NCF_PATTERN = r"[BE]\d{2}\d{8,10}"
DATE_PATTERN = r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}"
AMOUNT_PATTERN = r"[\$€£]?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?"
ITBIS_PATTERN = r"ITBIS|Impuesto.*(?:\d{1,2}[.,]\d{2})?"
CONFIDENCE_THRESHOLD = 0.7


class PDFTextParser(BaseProcessor):
    """Regex-based PDF text extraction for Dominican fiscal data."""

    name = "pdf_text_parser"

    def can_process(self, file_path: str, file_type: str) -> bool:
        return file_type == "pdf" and os.path.exists(file_path)

    def process(self, file_path: str, **kwargs) -> ProcessingResult:
        try:
            text = self.extract_text(file_path)
            
            if not text or len(text.strip()) < 10:
                return ProcessingResult(
                    success=False,
                    error="No text extracted from PDF",
                    source_type="pdf_text",
                    confidence=0.0,
                )

            data = self._extract_fields(text)
            confidence = self._calculate_confidence(data)

            if confidence < CONFIDENCE_THRESHOLD:
                return ProcessingResult(
                    success=False,
                    data=data,
                    source_type="pdf_text",
                    confidence=confidence,
                    warnings=["PDF text extraction confidence below threshold"],
                )

            return ProcessingResult(
                success=True,
                data=data,
                source_type="pdf_text",
                confidence=confidence,
                warnings=[],
            )

        except Exception as e:
            return ProcessingResult(
                success=False,
                error=f"Error processing PDF: {str(e)}",
                source_type="pdf_text",
                confidence=0.0,
            )

    def extract_text(self, file_path: str) -> str:
        text = ""
        try:
            with open(file_path, "rb") as f:
                reader = PyPDF2.PdfReader(f)
                for page in reader.pages:
                    text += page.extract_text() or ""
        except Exception:
            pass
        return text

    def _extract_fields(self, text: str) -> Dict[str, Any]:
        data = {}

        rnc_match = re.search(RNC_PATTERN, text)
        if rnc_match:
            data["vendor_tax_id"] = rnc_match.group().replace("-", "")

        ncf_match = re.search(NCF_PATTERN, text)
        if ncf_match:
            data["invoice_number"] = ncf_match.group()

        date_match = re.search(DATE_PATTERN, text)
        if date_match:
            data["invoice_date"] = self._normalize_date(date_match.group())

        amounts = self._extract_amounts(text)
        if amounts:
            if amounts.get("total"):
                data["total_amount"] = amounts["total"]
            if amounts.get("tax"):
                data["tax_amount"] = amounts["tax"]

        vendor_lines = self._extract_vendor_info(text)
        if vendor_lines:
            data["vendor_name"] = vendor_lines.get("name")
            data["vendor_fiscal_address"] = vendor_lines.get("address")

        gbs_type = self._extract_goods_services_type(text)
        if gbs_type:
            data["goods_services_type"] = gbs_type

        payment_method = self._extract_payment_method(text)
        if payment_method:
            data["payment_method"] = payment_method

        return data

    def _extract_amounts(self, text: str) -> Dict[str, Optional[float]]:
        amounts = {}

        amounts_list = re.findall(AMOUNT_PATTERN, text)
        if amounts_list:
            total = 0.0
            for amt_str in amounts_list:
                try:
                    clean = re.sub(r"[^0-9.]", "", amt_str.replace(",", ""))
                    val = float(clean)
                    if val > total:
                        total = val
                except Exception:
                    continue
            if total > 0:
                amounts["total"] = total

        itbis_match = re.search(ITBIS_PATTERN, text, re.IGNORECASE)
        if itbis_match:
            context_start = max(0, itbis_match.start() - 20)
            context = text[context_start:itbis_match.end() + 50]
            itbis_amounts = re.findall(AMOUNT_PATTERN, context)
            if itbis_amounts:
                try:
                    clean = re.sub(r"[^0-9.]", "", itbis_amounts[0].replace(",", ""))
                    amounts["tax"] = float(clean)
                except Exception:
                    pass

        return amounts

    def _extract_vendor_info(self, text: str) -> Dict[str, Optional[str]]:
        info = {}

        lines = text.split("\n")
        for i, line in enumerate(lines[:5]):
            if any(kw in line.lower() for kw in ["s.a.", "srl", "cxa", "ca"]):
                info["name"] = line.strip()
                if i + 1 < len(lines):
                    info["address"] = lines[i + 1].strip()
                break

        return info

    def _extract_goods_services_type(self, text: str) -> Optional[str]:
        text_lower = text.lower()
        keywords = {
            "01": ["personal", "nómina", "nomina", "salario"],
            "02": ["servicio", "consultoría", "consultoria", "mantenimiento"],
            "03": ["arrendamiento", "alquiler", "renta"],
            "04": ["activo fijo", "maquinaria", "equipo"],
            "05": ["representación", "representacion", "regalo"],
            "07": ["banco", "financiero", "interés", "interes"],
            "09": ["inventario", "mercancía", "mercancia"],
            "10": ["adquisición", "adquisicion", "compra"],
            "11": ["seguro", "póliza", "poliza"],
        }

        for code, keys in keywords.items():
            if any(k in text_lower for k in keys):
                return code
        return None

    def _extract_payment_method(self, text: str) -> Optional[str]:
        text_lower = text.lower()
        if "efectivo" in text_lower:
            return "1"
        if "cheque" in text_lower or "transferencia" in text_lower:
            return "2"
        if "tarjeta" in text_lower:
            return "3"
        if "crédito" in text_lower or "credito" in text_lower:
            return "4"
        return None

    def _normalize_date(self, date_str: str) -> str:
        import datetime
        for fmt in ["%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%Y-%m-%d"]:
            try:
                dt = datetime.datetime.strptime(date_str.strip(), fmt)
                return dt.strftime("%Y-%m-%d")
            except Exception:
                continue
        return date_str

    def _calculate_confidence(self, data: Dict[str, Any]) -> float:
        required_fields = ["vendor_tax_id", "invoice_number", "total_amount"]
        found = sum(1 for f in required_fields if data.get(f))
        base_confidence = found / len(required_fields)

        if data.get("tax_amount"):
            base_confidence += 0.1

        return min(1.0, base_confidence)


pdf_text_parser = PDFTextParser()