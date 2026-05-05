import os
import mimetypes
from typing import Tuple
import PyPDF2


ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".pdf", ".xml", ".xlsx", ".xls"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff"}
PDF_EXTENSIONS = {".pdf"}
XML_EXTENSIONS = {".xml"}
XLSX_EXTENSIONS = {".xlsx", ".xls"}


class FileClassifier:
    """Classifies uploaded files and determines processing strategy."""

    def classify(self, file_path: str) -> Tuple[str, str]:
        """
        Classify a file and return (source_type, strategy).
        
        Returns:
            source_type: xml, pdf_text, pdf_image, image_ocr, image_ai, xlsx, manual
            strategy: The processing strategy to use
        """
        filename = os.path.basename(file_path)
        ext = os.path.splitext(filename)[1].lower()
        
        if ext in XML_EXTENSIONS:
            return "xml", "xml_processor"
        
        if ext in XLSX_EXTENSIONS:
            return "xlsx", "xlsx_processor"
        
        if ext in PDF_EXTENSIONS:
            return self._classify_pdf(file_path)
        
        if ext in IMAGE_EXTENSIONS:
            return self._classify_image(file_path)
        
        raise ValueError(f"Unsupported file type: {ext}")

    def _classify_pdf(self, file_path: str) -> Tuple[str, str]:
        """Classify PDF: text-based vs scanned."""
        try:
            with open(file_path, "rb") as f:
                reader = PyPDF2.PdfReader(f)
                text = ""
                for page in reader.pages:
                    text += page.extract_text() or ""
                
                printable_chars = sum(1 for c in text if c.isprintable())
                
                if printable_chars > 50:
                    return "pdf_text", "pdf_text_parser"
                else:
                    return "pdf_image", "image_preprocessor"
        except Exception:
            return "pdf_image", "image_preprocessor"

    def _classify_image(self, file_path: str) -> Tuple[str, str]:
        """Classify image: attempt OCR first, then AI."""
        return "image_ocr", "image_preprocessor"

    def get_mime_type(self, filename: str) -> str:
        """Get MIME type from filename."""
        mime_type = mimetypes.guess_type(filename)[0]
        return mime_type or "application/octet-stream"


classifier = FileClassifier()