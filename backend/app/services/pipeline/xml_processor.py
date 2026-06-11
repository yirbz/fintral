import os
import re
from typing import Any, Dict, Optional
from lxml import etree

from app.services.pipeline.base import BaseProcessor, ProcessingResult
from app.services.pipeline.classifier import XML_EXTENSIONS


XML_SCHEMA_PATH = "docs/DGII_FILES/invoice_xsd/e-CF 31 v.1.0.xsd"


class XMLProcessor(BaseProcessor):
    """Processor for DGII e-CF XML invoices (zero AI cost)."""

    name = "xml_processor"

    def can_process(self, file_path: str, file_type: str) -> bool:
        ext = os.path.splitext(file_path)[1].lower()
        return ext in XML_EXTENSIONS

    def process(self, file_path: str, **kwargs) -> ProcessingResult:
        try:
            with open(file_path, "rb") as f:
                xml_content = f.read()

            tree = etree.parse(file_path)
            root = tree.getroot()

            ns = self._get_namespace(root)
            data = self._extract_fields(root, ns)

            data["original_xml_data"] = xml_content.decode("utf-8")

            if ns.get("eCF"):
                data["ecf_type"] = ns.get("eCF", {}).get("TipoeCF")

            return ProcessingResult(
                success=True,
                data=data,
                source_type="xml",
                confidence=1.0,
                warnings=[],
            )

        except Exception as e:
            return ProcessingResult(
                success=False,
                error=f"Error processing XML: {str(e)}",
                source_type="xml",
                confidence=0.0,
            )

    def _get_namespace(self, root: etree._Element) -> Dict[str, Any]:
        """Extract XML namespace map."""
        ns = {}
        if root.tag.startswith("{"):
            uri = root.tag[1:].split("}")[0]
            ns["default"] = uri

        if "eCF" in root.attrib.get("Version", ""):
            ns["eCF_version"] = root.attrib.get("Version")
            ns["eCF"] = {}

        return ns

    def _extract_fields(self, root: etree._Element, ns: Dict) -> Dict[str, Any]:
        """Extract fields from e-CF XML structure."""
        data = {}

        find = root.findall
        if ns.get("default"):
            nsmap = {"ecf": ns["default"]}

            def find(path):
                if ":" in path:
                    return root.xpath(f"ecf:{path}", namespaces=nsmap)
                return root.xpath(path, namespaces=nsmap)

        emisor = find(".//Emisor")
        if emisor:
            data["vendor_name"] = self._get_text(emisor, "RazonSocialEmisor")
            data["vendor_tax_id"] = self._get_text(emisor, "RNCEmisor")
            data["vendor_fiscal_address"] = self._get_text(emisor, "DireccionEmisor")

        id_doc = find(".//IdDoc")
        if id_doc:
            data["invoice_number"] = self._get_text(id_doc, "eNCF")
            data["invoice_date"] = self._get_text(id_doc, "FechaEmision")
            tipo_ncf = self._get_text(id_doc, "TipoeCF")
            if tipo_ncf:
                data["goods_services_type"] = tipo_ncf
            data["payment_method"] = self._get_text(id_doc, "TipoPago")

        totales = find(".//Totales")
        if totales:
            data["total_amount"] = self._get_float(totales, "MontoTotal")
            data["tax_amount"] = self._get_float(totales, "TotalITBIS")
            data["itbis_retenido"] = self._get_float(totales, "TotalITBISRetenido")
            data["isr_retention_amount"] = self._get_float(totales, "TotalISRRetencion")

        otra_moneda = find(".//OtraMoneda")
        if otra_moneda:
            data["currency"] = self._get_text(otra_moneda, "TipoMoneda")

        items = find(".//DetallesItems/Item")
        line_items = []
        if items:
            for item in items:
                line_item = {
                    "description": self._get_text(item, "Descripcion"),
                    "quantity": self._get_float(item, "Cantidad"),
                    "unit_price": self._get_float(item, "PrecioUnitario"),
                    "subtotal": self._get_float(item, "MontoITBIS"),
                }
                if line_item["description"]:
                    line_items.append(line_item)
        data["line_items"] = line_items

        return data

    def _get_text(self, parent: etree._Element, tag: str) -> Optional[str]:
        elem = parent.find(tag)
        if elem is not None:
            text = elem.text
            return text.strip() if text and text.strip() else None
        return None

    def _get_float(self, parent: etree._Element, tag: str) -> Optional[float]:
        text = self._get_text(parent, tag)
        if text:
            try:
                clean = re.sub(r"[^0-9.]", "", text)
                return float(clean)
            except Exception:
                pass
        return None


xml_processor = XMLProcessor()