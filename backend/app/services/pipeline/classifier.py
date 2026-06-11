import os
import mimetypes
from typing import Tuple
import PyPDF2


ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".pdf", ".xml", ".xlsx", ".xls"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff"}
PDF_EXTENSIONS = {".pdf"}
XML_EXTENSIONS = {".xml"}
XLSX_EXTENSIONS = {".xlsx", ".xls"}

ECF_TIPOS = {"31", "32", "33", "34", "41", "43", "44", "45", "46", "47"}


class FileClassifier:
    """Classifies uploaded files and determines processing strategy."""

    def classify(self, file_path: str) -> Tuple[str, str]:
        """
        Classify a file and return (source_type, strategy).
        
        Returns:
            source_type: xml/ecf, pdf_text, pdf_image, image_ocr, image_ai, xlsx, manual
            strategy: The processing strategy to use
        """
        filename = os.path.basename(file_path)
        ext = os.path.splitext(filename)[1].lower()
        
        if ext in XML_EXTENSIONS:
            return self._classify_xml(file_path)
        
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

    def _classify_xml(self, file_path: str) -> Tuple[str, str]:
        """Classify XML: detect DGII e-CF vs other XML formats."""
        try:
            from lxml import etree
            tree = etree.parse(file_path)
            root = tree.getroot()
            for elem in root.iter():
                if elem.tag.startswith("{"):
                    elem.tag = elem.tag.split("}", 1)[1]
            tipos = root.xpath("//TipoeCF/text()")
            if tipos and str(tipos[0]).strip() in ECF_TIPOS:
                return "ecf", "ecf_parser"
        except Exception:
            pass
        return "xml", "xml_processor"

    def _classify_image(self, file_path: str) -> Tuple[str, str]:
        """Classify image: attempt OCR first, then AI."""
        return "image_ocr", "image_preprocessor"

    def get_mime_type(self, filename: str) -> str:
        """Get MIME type from filename."""
        mime_type = mimetypes.guess_type(filename)[0]
        return mime_type or "application/octet-stream"


classifier = FileClassifier()