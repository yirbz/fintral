import logging
import re
from typing import Any, Dict, Optional, Tuple

from sqlalchemy.orm import Session

from app.services.pipeline.base import ProcessingResult
from app.services.pipeline.categorizer import categorizer
from app.services.pipeline.classifier import classifier
from app.services.pipeline.image_preprocessor import image_preprocessor
from app.services.pipeline.normalizer import normalizer
from app.services.pipeline.validator import post_extraction_validator
from app.services.pipeline.xml_processor import xml_processor
from app.services.pipeline.pdf_text_parser import pdf_text_parser
from app.services.pipeline.xlsx_processor import xlsx_processor
from app.services.pipeline.ecf_parser import ecf_parser

logger = logging.getLogger(__name__)

AI_FALLBACK_STRATEGIES = {"image_ocr", "pdf_image"}
CONFIDENCE_THRESHOLD = 0.7
LOW_CONFIDENCE_AI_THRESHOLD = 0.4

OCR_CHAR_CORRECTIONS = [
    (re.compile(r'(?<=[A-Z])O(?=\d)'), '0'),
    (re.compile(r'(?<=\d)O(?=\d)'), '0'),
    (re.compile(r'(?<=\d)O$'), '0'),
    (re.compile(r'(?<=\d)I(?=\d)'), '1'),
    (re.compile(r'^I(?=\d)'), '1'),
    (re.compile(r'(?<=\d)S(?=\d)'), '5'),
    (re.compile(r'(?<=\d)B(?=\d)'), '8'),
    (re.compile(r'(?<=\d)G(?=\d)'), '6'),
    (re.compile(r'(?<=\d)Z(?=\d)'), '2'),
    (re.compile(r'(?<=[BE])\s*0*'), ''),
    (re.compile(r'(?<=\d)l(?=\d)'), '1'),
    (re.compile(r'(?<=\d)\|(?=\d)'), '1'),
]


class PipelineOrchestrator:
    """Orchestrates the full invoice processing pipeline."""

    def __init__(self, openai_processor=None):
        self.classifier = classifier
        self.normalizer = normalizer
        self.openai_processor = openai_processor

    def process(
        self,
        file_path: str,
        file_type: str,
        invoice=None,
        db=None,
        user_id: Optional[int] = None,
        org_rnc: Optional[str] = None,
    ) -> Tuple[bool, Dict[str, Any], Optional[str]]:
        try:
            source_type, strategy = self.classifier.classify(file_path)
            logger.info("Classified %s as %s/%s", file_path, source_type, strategy)

            result = self._process_by_strategy(
                source_type=source_type,
                strategy=strategy,
                file_path=file_path,
                invoice=invoice,
                db=db,
                user_id=user_id,
            )

            if result.success:
                normalized = self.normalizer.normalize(
                    result.data,
                    source_type=source_type,
                    confidence=result.confidence,
                )
                self._resolve_direction(normalized, org_rnc)
                self._categorize_data(normalized, invoice, db)
                validated = post_extraction_validator.validate(normalized, org_rnc=org_rnc)
                return True, validated, source_type

            if source_type in AI_FALLBACK_STRATEGIES and result.confidence < CONFIDENCE_THRESHOLD:
                logger.info("Low confidence (%.2f), escalating to AI fallback", result.confidence)
                success, ai_data, ai_source = self._process_with_ai(
                    file_path=file_path,
                    file_type=file_type,
                    invoice=invoice,
                    db=db,
                    user_id=user_id,
                )
                if success:
                    ai_data["quality_warnings"] = result.warnings
                    self._categorize_data(ai_data, invoice, db)
                    validated = post_extraction_validator.validate(ai_data, org_rnc=org_rnc)
                    return True, validated, ai_source
                return success, ai_data, ai_source

            normalized = self.normalizer.normalize(
                result.data or {},
                source_type=source_type,
                confidence=result.confidence,
            )
            self._resolve_direction(normalized, org_rnc)
            self._categorize_data(normalized, invoice, db)
            validated = post_extraction_validator.validate(normalized, org_rnc=org_rnc)
            return result.success, validated, source_type

        except Exception as e:
            logger.exception("Pipeline error processing %s: %s", file_path, e)
            return False, {"error": "Ocurrió un error interno al procesar el documento. Intenta de nuevo o sube un archivo con mejor calidad."}, None

    def _categorize_data(self, data: Dict[str, Any], invoice, db: Optional[Session]) -> None:
        """Apply 3-tier categorization cascade to the normalized data."""
        tenant_id = str(invoice.tenant_id) if invoice and hasattr(invoice, "tenant_id") else None
        if not tenant_id:
            return

        cat_result = categorizer.categorize(
            vendor_tax_id=data.get("vendor_tax_id"),
            vendor_name=data.get("vendor_name"),
            line_items=data.get("line_items", []),
            tenant_id=tenant_id,
            transaction_type=data.get("transaction_type"),
            db=db,
        )

        if cat_result.get("dgii_category_code"):
            data["category"] = cat_result["dgii_category_code"]
            data["category_source"] = cat_result.get("source", "none")

    def _resolve_direction(self, data: Dict[str, Any], org_rnc: Optional[str]) -> None:
        """Resolve transaction_type for e-CF invoices by comparing RNCs.

        The e-CF parser stays agnostic about direction. This method
        determines it here — after extraction, before validation — by
        comparing the issuer/ buyer RNC against the organization's RNC.

        Special cases:
        - Types 41 (Compras) and 43 (Gastos Menores) are always expense,
          even though the tenant is the issuer.
        """
        ecf_type = data.get("ecf_type")
        if not ecf_type or not org_rnc:
            return

        clean_org = re.sub(r"[^0-9]", "", org_rnc)
        if not clean_org:
            return

        # Types 41 and 43 are always expense (tenant-issued purchases)
        if ecf_type in ("41", "43"):
            data["transaction_type"] = "expense"
            return

        emisor_rnc = str(data.get("vendor_tax_id") or "")
        comprador_rnc = str(data.get("rnc_comprador") or "")

        clean_emisor = re.sub(r"[^0-9]", "", emisor_rnc)
        clean_comprador = re.sub(r"[^0-9]", "", comprador_rnc)

        if clean_emisor == clean_org:
            data["transaction_type"] = "income"
        elif clean_comprador == clean_org:
            data["transaction_type"] = "expense"
        elif ecf_type in ("31", "32", "33", "34", "42"):
            data["transaction_type"] = "income"
        else:
            data["transaction_type"] = "expense"


    def _process_by_strategy(
        self,
        source_type: str,
        strategy: str,
        file_path: str,
        invoice=None,
        db=None,
        user_id: Optional[int] = None,
    ) -> ProcessingResult:
        if strategy == "xml_processor":
            return xml_processor.process(file_path)
        elif strategy == "ecf_parser":
            return ecf_parser.process(file_path)
        elif strategy == "pdf_text_parser":
            return pdf_text_parser.process(file_path)
        elif strategy == "xlsx_processor":
            return xlsx_processor.process(file_path)
        elif strategy in ("image_preprocessor", "pdf_image"):
            return self._process_image_with_ocr(file_path)
        else:
            return ProcessingResult(
                success=False,
                error=f"Formato de archivo no soportado ({strategy}). Usa JPG, PNG, PDF, XML o XLSX.",
                source_type=source_type,
                confidence=0.0,
            )

    def _process_image_with_ocr(self, file_path: str) -> ProcessingResult:
        try:
            import pytesseract

            processed_pil, quality = image_preprocessor.preprocess_pil(file_path)

            # --psm 6: assume uniform block of text (ideal for preprocessed invoices)
            # spa+eng: Spanish + English (invoices often mix both)
            ocr_data = pytesseract.image_to_data(
                processed_pil,
                lang="spa+eng",
                config="--psm 6 --oem 3",
                output_type=pytesseract.Output.DICT,
            )

            text_lines = []
            word_confidences = []
            for i, word in enumerate(ocr_data["text"]):
                word = word.strip()
                if word:
                    text_lines.append(word)
                    conf = ocr_data["conf"][i]
                    if conf > 0:
                        word_confidences.append(conf)

            full_text = " ".join(text_lines)

            if not text_lines:
                return ProcessingResult(
                    success=False,
                    error="No se pudo leer texto de la imagen. Asegúrate de que la foto sea nítida y esté bien iluminada.",
                    source_type="image_ocr",
                    confidence=0.0,
                    warnings=quality.warnings,
                )

            data = self._parse_ocr_text(self._correct_ocr_chars(full_text))
            field_confidence = self._calculate_field_confidence(data, ocr_data)
            tesseract_confidence = (
                sum(word_confidences) / len(word_confidences) / 100.0
                if word_confidences else 0.0
            )

            confidence = self._combine_confidences(field_confidence, tesseract_confidence)

            all_warnings = list(quality.warnings)
            if self._text_quality_suspect(full_text, text_lines):
                all_warnings.append("El texto OCR contiene muchos caracteres no estándar")
            if confidence < CONFIDENCE_THRESHOLD:
                all_warnings.append("Confianza baja en los datos extraídos")

            if confidence >= CONFIDENCE_THRESHOLD:
                data["ocr_raw_text"] = full_text[:2000]

            # Only report success if confidence meets the bar
            # Low-confidence results fall through to AI vision fallback
            return ProcessingResult(
                success=confidence >= CONFIDENCE_THRESHOLD,
                data=data,
                source_type="image_ocr",
                confidence=confidence,
                warnings=all_warnings,
            )

        except ImportError:
            return ProcessingResult(
                success=False,
                error="El motor de reconocimiento óptico (OCR) no está disponible en este servidor. Contacta al administrador.",
                source_type="image_ocr",
                confidence=0.0,
            )
        except Exception as e:
            logger.error("OCR error: %s", e)
            return ProcessingResult(
                success=False,
                error="Error al procesar la imagen. Verifica que el archivo no esté dañado e intenta de nuevo.",
                source_type="image_ocr",
                confidence=0.0,
            )

    def _correct_ocr_chars(self, text: str) -> str:
        for pattern, replacement in OCR_CHAR_CORRECTIONS:
            text = pattern.sub(replacement, text)
        return text

    def _parse_ocr_text(self, text: str) -> Dict[str, Any]:
        data = {}

        # Vendor name — first meaningful alphabetic line before numbers
        lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
        for line in lines:
            words = [w for w in line.split() if w.isalpha() and len(w) > 2]
            if len(words) >= 2 and not any(
                kw in line.upper() for kw in ["TOTAL", "SUBTOTAL", "PAGO", "RNC", "NCF", "FACTURA", "FECHA"]
            ):
                data["vendor_name"] = line.strip().rstrip(".,:")
                break

        # RNC / Cédula / general tax ID (RD: 3-7-1 or 9-digit)
        rnc_label = re.search(
            r"(?:RNC|CEDULA|RUC|CUIT|NIT|RFC|TAX\s*ID|EIN)\s*:?\s*([\d]{3,4}[-.\s]?[\d]{6,8}[-.\s]?[\d]{0,2})",
            text, re.IGNORECASE,
        )
        if rnc_label:
            data["vendor_tax_id"] = re.sub(r"[^0-9]", "", rnc_label.group(1))
        else:
            rnc_match = re.search(r"\b(\d{3}-?\d{7}-?\d{1})\b", text)
            if rnc_match:
                data["vendor_tax_id"] = rnc_match.group(1).replace("-", "")
            elif re.search(r"(?:RUC|CUIT|NIT|RFC)\s*:?\s*([A-Z0-9-]{4,20})", text, re.IGNORECASE):
                tax_match = re.search(r"(?:RUC|CUIT|NIT|RFC)\s*:?\s*([A-Z0-9-]{4,20})", text, re.IGNORECASE)
                data["vendor_tax_id"] = tax_match.group(1)

        # Invoice number — DGII NCF (RD format: B01xxxxxx, E31xxxxxx, etc.)
        ncf_match = re.search(r"\b([BE]\d{2}\d{8,10})\b", text)
        if ncf_match:
            data["invoice_number"] = ncf_match.group(1)
        else:
            inv_match = re.search(
                r"(?:FACTURA|FACT\.?|INV\.?|INVOICE|N[o°]\.?|No\.|#)\s*:?\s*([A-Z0-9][-A-Z0-9/]{2,20})",
                text, re.IGNORECASE,
            )
            if inv_match:
                data["invoice_number"] = inv_match.group(1)

        # Date — DD/MM/YYYY or DD-MM-YYYY (RD standard)
        date_match = re.search(r"\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b", text)
        if date_match:
            day, month, year = int(date_match.group(1)), int(date_match.group(2)), date_match.group(3)
            # Discard impossible months (month > 12) = likely US format
            if month <= 12 and day <= 31:
                if len(year) == 2:
                    year = "20" + year if int(year) < 50 else "19" + year
                data["invoice_date"] = f"{year}-{month:02d}-{day:02d}"

        # Amounts — RD$, DOP, USD, EUR, or bare numbers
        amounts = re.findall(r"(?:RD\$|DOP|US\$|USD|€|EUR|\$)?\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)", text)
        if amounts:
            try:
                parsed = []
                for a in amounts:
                    clean = a.replace(",", "").strip()
                    if clean and clean.replace(".", "").isdigit():
                        parsed.append(float(clean))
                if parsed:
                    data["total_amount"] = max(parsed)
            except Exception:
                pass

        # Tax — ITBIS (RD), IVA, VAT
        itbis_match = re.search(
            r"(?:ITBIS|ITEBIS|IVA|IMPUESTO|TAX|VAT)\s*:?\s*(?:RD\$|DOP|\$)?\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)",
            text, re.IGNORECASE,
        )
        if itbis_match:
            try:
                data["tax_amount"] = float(itbis_match.group(1).replace(",", ""))
            except Exception:
                pass

        # Keyword-specific totals
        for keyword in ["TOTAL", "PAGO", "SUBTOTAL"]:
            pattern = rf"{keyword}\s*:?\s*(?:RD\$|DOP|\$)?\s*(\d{{1,3}}(?:[.,]\d{{3}})*(?:[.,]\d{{2}})?)"
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                try:
                    val = float(match.group(1).replace(",", ""))
                    if keyword == "TOTAL":
                        data["total_amount"] = val
                    elif keyword == "PAGO" and "total_amount" not in data:
                        data["total_amount"] = val
                except Exception:
                    pass

        return data

    def _calculate_field_confidence(self, data: Dict[str, Any],
                                    ocr_data: dict) -> float:
        required = ["vendor_name", "invoice_number", "total_amount"]
        found = sum(1 for f in required if data.get(f))
        base = found / len(required)

        extra_bonus = 0.0
        if data.get("vendor_tax_id"):
            extra_bonus += 0.1
        if data.get("tax_amount"):
            extra_bonus += 0.05
        if data.get("invoice_date"):
            extra_bonus += 0.05

        return min(base + extra_bonus, 1.0)

    def _combine_confidences(self, field_conf: float,
                              tesseract_conf: float) -> float:
        return 0.4 * field_conf + 0.6 * tesseract_conf

    def _text_quality_suspect(self, full_text: str,
                               words: list[str]) -> bool:
        if not words:
            return True
        alnum_chars = sum(1 for c in full_text if c.isalnum())
        total_chars = len(full_text)
        if total_chars == 0:
            return True
        ratio = alnum_chars / total_chars
        return ratio < 0.6

    def _process_with_ai(
        self,
        file_path: str,
        file_type: str,
        invoice=None,
        db=None,
        user_id: Optional[int] = None,
    ) -> Tuple[bool, Dict[str, Any], str]:
        if not self.openai_processor:
            return False, {"error": "El procesador de inteligencia artificial no está disponible. Contacta al administrador."}, "image_ai"

        source_type = "image_ai" if file_type.startswith("image") else "pdf_ai"

        try:
            result = self.openai_processor.process_invoice(
                file_path=file_path,
                file_type=file_type,
                invoice=invoice,
                db=db,
                user_id=user_id,
            )

            if result.get("error"):
                return False, result, source_type

            return True, result, source_type

        except Exception as e:
            logger.error("AI processing error: %s", e)
            return False, {"error": "Error al analizar el documento con inteligencia artificial. Intenta de nuevo en unos minutos."}, source_type


orchestrator = PipelineOrchestrator()
