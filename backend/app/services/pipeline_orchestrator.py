import logging
from typing import Any, Dict, Optional, Tuple

from app.services.pipeline.base import ProcessingResult
from app.services.pipeline.classifier import classifier
from app.services.pipeline.normalizer import normalizer
from app.services.pipeline.xml_processor import xml_processor
from app.services.pipeline.pdf_text_parser import pdf_text_parser
from app.services.pipeline.xlsx_processor import xlsx_processor

logger = logging.getLogger(__name__)

AI_FALLBACK_STRATEGIES = {"image_ocr", "pdf_image"}
CONFIDENCE_THRESHOLD = 0.7


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
    ) -> Tuple[bool, Dict[str, Any], Optional[str]]:
        """
        Main entry point for pipeline processing.
        
        Returns:
            (success, extracted_data, source_type)
        """
        try:
            source_type, strategy = self.classifier.classify(file_path)
            logger.info(f"Classified {file_path} as {source_type}/{strategy}")
        except Exception as e:
            logger.error(f"Classification error: {e}")
            return False, {"error": str(e)}, None

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
            return True, normalized, source_type

        if source_type in AI_FALLBACK_STRATEGIES and result.confidence < CONFIDENCE_THRESHOLD:
            logger.info(f"Low confidence ({result.confidence}), escalating to AI fallback")
            return self._process_with_ai(
                file_path=file_path,
                file_type=file_type,
                invoice=invoice,
                db=db,
                user_id=user_id,
            )

        normalized = self.normalizer.normalize(
            result.data or {},
            source_type=source_type,
            confidence=result.confidence,
        )
        return result.success, normalized, source_type

    def _process_by_strategy(
        self,
        source_type: str,
        strategy: str,
        file_path: str,
        invoice=None,
        db=None,
        user_id: Optional[int] = None,
    ) -> ProcessingResult:
        """Route to appropriate processor based on strategy."""
        if strategy == "xml_processor":
            return xml_processor.process(file_path)
        elif strategy == "pdf_text_parser":
            return pdf_text_parser.process(file_path)
        elif strategy == "xlsx_processor":
            return xlsx_processor.process(file_path)
        elif strategy in ("image_preprocessor", "pdf_image"):
            return self._process_image_with_ocr(file_path)
        else:
            return ProcessingResult(
                success=False,
                error=f"Unknown strategy: {strategy}",
                source_type=source_type,
                confidence=0.0,
            )

    def _process_image_with_ocr(self, file_path: str) -> ProcessingResult:
        """Process image with Tesseract OCR as first attempt."""
        try:
            import pytesseract
            from PIL import Image

            with Image.open(file_path) as img:
                if img.mode != "L":
                    img = img.convert("L")

                text = pytesseract.image_to_string(img, lang="spa")

            if not text or len(text.strip()) < 100:
                return ProcessingResult(
                    success=False,
                    error="OCR produced insufficient text",
                    source_type="image_ocr",
                    confidence=0.0,
                )

            data = self._parse_ocr_text(text)
            confidence = self._calculate_ocr_confidence(data)

            return ProcessingResult(
                success=confidence >= CONFIDENCE_THRESHOLD,
                data=data,
                source_type="image_ocr",
                confidence=confidence,
                warnings=["Low confidence from OCR"] if confidence < CONFIDENCE_THRESHOLD else [],
            )

        except ImportError:
            return ProcessingResult(
                success=False,
                error="pytesseract not installed",
                source_type="image_ocr",
                confidence=0.0,
            )
        except Exception as e:
            return ProcessingResult(
                success=False,
                error=f"OCR error: {str(e)}",
                source_type="image_ocr",
                confidence=0.0,
            )

    def _parse_ocr_text(self, text: str) -> Dict[str, Any]:
        """Parse OCR output with regex patterns."""
        import re
        data = {}

        rnc_match = re.search(r"\d{3}-?\d{7}-?\d{1}|\d{9}", text)
        if rnc_match:
            data["vendor_tax_id"] = rnc_match.group().replace("-", "")

        ncf_match = re.search(r"[BE]\d{2}\d{8,10}", text)
        if ncf_match:
            data["invoice_number"] = ncf_match.group()

        date_match = re.search(r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}", text)
        if date_match:
            data["invoice_date"] = date_match.group()

        amounts = re.findall(r"[\$€£]?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?", text)
        if amounts:
            try:
                parsed_amounts = []
                for a in amounts:
                    clean = re.sub(r"[^0-9.]", "", a.replace(",", ""))
                    parsed_amounts.append(float(clean))
                total = max(parsed_amounts)
                data["total_amount"] = total
            except Exception:
                pass

        return data

    def _calculate_ocr_confidence(self, data: Dict[str, Any]) -> float:
        required = ["vendor_tax_id", "invoice_number", "total_amount"]
        found = sum(1 for f in required if data.get(f))
        return found / len(required)

    def _process_with_ai(
        self,
        file_path: str,
        file_type: str,
        invoice=None,
        db=None,
        user_id: Optional[int] = None,
    ) -> Tuple[bool, Dict[str, Any], str]:
        """Fallback to AI (OpenAI/Gemini/Ollama) processing."""
        if not self.openai_processor:
            return False, {"error": "AI processor not available"}, "image_ai"

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
            logger.error(f"AI processing error: {e}")
            return False, {"error": str(e)}, source_type


orchestrator = PipelineOrchestrator()