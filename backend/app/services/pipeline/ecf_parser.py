import logging
import os
import re
from typing import Any, Dict, List, Optional
from lxml import etree

from app.services.pipeline.base import BaseProcessor, ProcessingResult
from app.services.pipeline.classifier import XML_EXTENSIONS
try:
    from app.services.pipeline.ecf_signature_validator import validate_ecf_signature
    _SIGNATURE_VALIDATION_AVAILABLE = True
except ImportError:
    logger = logging.getLogger(__name__)
    logger.warning("signxml not available — electronic seal validation disabled")
    _SIGNATURE_VALIDATION_AVAILABLE = False

    def validate_ecf_signature(xml_bytes: bytes, emitter_rnc: Optional[str] = None) -> dict:
        return {"valid": True, "warning": "No se pudo validar la firma digital (librería no disponible)"}

logger = logging.getLogger(__name__)

DGII_XSD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "..", "docs", "DGII_FILES", "invoice_xsd")

ECF_TYPES = {
    "31": "Factura de Credito Fiscal Electronica",
    "32": "Factura de Consumo Electronica",
    "33": "Nota de Debito Electronica",
    "34": "Nota de Credito Electronica",
    "41": "Compras Electronica",
    "42": "Registro Unico de Ingresos Electronico",
    "43": "Gastos Menores Electronico",
    "44": "Regimenes Especiales Electronico",
    "45": "Gubernamental Electronica",
    "46": "Factura de Exportacion Electronica",
    "47": "Comprobante para Pagos al Exterior Electronico",
}

ECF_XSD_FILES = {
    "31": "e-CF 31 v.1.0.xsd",
    "32": "e-CF 32 v.1.0.xsd",
    "33": "e-CF 33 v.1.0.xsd",
    "34": "e-CF 34 v.1.0.xsd",
    "41": "e-CF 41 v.1.0.xsd",
    "42": "e-CF 42 v.1.0.xsd",
    "43": "e-CF 43 v.1.0(1).xsd",
    "44": "e-CF 44 v.1.0.xsd",
    "45": "e-CF 45 v.1.0.xsd",
}

_xsd_cache: Dict[str, etree.XMLSchema] = {}

ECF_TYPES_WITH_RETENCION = {"31", "33", "34", "41"}
ECF_TYPES_WITH_FULL_ITBIS = {"31", "32", "33", "34", "41", "45"}
ECF_TYPES_WITH_COMPRADOR_REQUIRED = {"31", "41", "45"}
ECF_TYPES_WITH_CREDIT_NOTE = {"34"}
ECF_TYPES_WITH_DEBIT_NOTE = {"33"}


class ECFParser(BaseProcessor):
    name = "ecf_parser"

    def can_process(self, file_path: str, file_type: str) -> bool:
        ext = os.path.splitext(file_path)[1].lower()
        return ext in XML_EXTENSIONS

    def process(self, file_path: str, **kwargs) -> ProcessingResult:
        try:
            with open(file_path, "rb") as f:
                xml_content = f.read()

            tree = etree.parse(file_path)
            root = tree.getroot()

            ecf_type = self._detect_ecf_type_from_tree(root)
            if not ecf_type:
                logger.warning("Non e-CF XML detected, cannot parse: %s", file_path)
                return ProcessingResult(
                    success=False,
                    error="No se pudo determinar el tipo de comprobante e-CF (TipoeCF no encontrado).",
                    source_type="xml",
                    confidence=0.0,
                )

            # Validate electronic seal (Sellado Electrónico) before stripping namespaces
            emitter_rnc = self._extract_emitter_rnc(root)
            seal_result = validate_ecf_signature(xml_content, emitter_rnc=emitter_rnc)
            logger.info(
                "Electronic seal validation for %s: valid=%s, error=%s",
                file_path, seal_result.get("valid"), seal_result.get("error"),
            )

            self._strip_ns(root)

            warnings = self._validate_xsd(root, ecf_type)
            xp = root.xpath

            data = {"ecf_type": ecf_type, "ecf_type_name": ECF_TYPES.get(ecf_type, "Desconocido")}
            data["original_xml_data"] = xml_content.decode("utf-8")
            data["electronic_seal"] = seal_result
            if warnings:
                data["xsd_warnings"] = warnings

            self._parse_encabezado(data, xp, ecf_type)
            self._parse_detalles_items(data, xp, ecf_type)
            self._parse_subtotales(data, xp)
            self._parse_descuentos_recargos(data, xp)
            self._parse_informacion_referencia(data, xp)
            self._parse_paginacion(data, xp)

            if not seal_result.get("valid"):
                error_msg = seal_result.get("error", "Firma digital no válida")
                warnings.append(error_msg)

            return ProcessingResult(
                success=True,
                data=data,
                source_type="ecf",
                confidence=0.3 if not seal_result.get("valid") else 1.0,
                warnings=warnings,
            )

        except etree.XMLSyntaxError as e:
            logger.error("XML syntax error in %s: %s", file_path, e)
            return ProcessingResult(
                success=False,
                error=f"Error de sintaxis XML: {e}",
                source_type="ecf",
                confidence=0.0,
            )
        except Exception as e:
            logger.error("ECF parsing error in %s: %s", file_path, e, exc_info=True)
            return ProcessingResult(
                success=False,
                error=f"Error al procesar el comprobante e-CF: {e}",
                source_type="ecf",
                confidence=0.0,
            )

    def _detect_ecf_type_from_tree(self, root: etree._Element) -> Optional[str]:
        tipo_elem = root.find(".//{*}TipoeCF")
        if tipo_elem is not None and tipo_elem.text:
            val = tipo_elem.text.strip()
            return val if val in ECF_TYPES else None
        return None

    @staticmethod
    def _extract_emitter_rnc(root: etree._Element) -> Optional[str]:
        """Extract emitter RNC from the XML before namespace stripping."""
        rnc_el = root.find(".//{*}RNCEmisor")
        if rnc_el is not None and rnc_el.text:
            return rnc_el.text.strip()
        return None

    def _load_schema(self, ecf_type: str) -> Optional[etree.XMLSchema]:
        if ecf_type in _xsd_cache:
            return _xsd_cache[ecf_type]
        xsd_path = os.path.join(DGII_XSD_DIR, ECF_XSD_FILES.get(ecf_type, ""))
        if not os.path.isfile(xsd_path):
            logger.warning("XSD file not found for e-CF type %s: %s", ecf_type, xsd_path)
            return None
        try:
            xsd_doc = etree.parse(xsd_path)
            for elem in xsd_doc.iter():
                name_attr = elem.get("name")
                if name_attr and (name_attr.startswith(" ") or name_attr.endswith(" ")):
                    elem.set("name", name_attr.strip())
            schema = etree.XMLSchema(xsd_doc)
            _xsd_cache[ecf_type] = schema
            logger.info("Loaded XSD schema for e-CF type %s", ecf_type)
            return schema
        except etree.XMLSchemaParseError as e:
            logger.warning("XSD parse error for type %s: %s", ecf_type, e)
            return None

    def _validate_xsd(self, root: etree._Element, ecf_type: str) -> List[str]:
        schema = self._load_schema(ecf_type)
        if schema is None:
            return []
        try:
            schema.assertValid(root)
            logger.info("XSD validation passed for e-CF type %s", ecf_type)
            return []
        except etree.DocumentInvalid:
            error_log = schema.error_log
            warnings = []
            for err in error_log:
                msg = f"XSD {err.line}:{err.column} — {err.message}"
                warnings.append(msg)
                logger.warning("XSD validation issue: %s", msg)
            return warnings

    def _strip_ns(self, root: etree._Element) -> None:
        for elem in root.iter():
            if elem.tag.startswith("{"):
                elem.tag = elem.tag.split("}", 1)[1]

    def _detect_ecf_type(self, xp) -> Optional[str]:
        tipos = xp("//TipoeCF")
        if tipos:
            return self._get_text(tipos)
        return None

    def _get_text(self, elements) -> Optional[str]:
        if elements:
            val = elements[0]
            if hasattr(val, "text"):
                text = val.text
            else:
                text = str(val) if val is not None else None
            if text is not None:
                stripped = text.strip()
                return stripped if stripped else None
        return None

    def _get_float(self, elements) -> Optional[float]:
        text = self._get_text(elements)
        if text:
            try:
                clean = re.sub(r"[^0-9.\-]", "", text)
                return float(clean) if clean else None
            except (ValueError, TypeError):
                pass
        return None

    def _get_int(self, elements) -> Optional[int]:
        text = self._get_text(elements)
        if text:
            try:
                return int(re.sub(r"[^0-9\-]", "", text))
            except (ValueError, TypeError):
                pass
        return None

    def _parse_encabezado(self, data: Dict[str, Any], xp, ecf_type: str) -> None:
        id_doc = xp("//IdDoc")
        if not id_doc:
            return
        id_doc = id_doc[0]

        data["eNCF"] = self._get_text(id_doc.xpath("eNCF/text()"))
        data["tipo_pago"] = self._get_text(id_doc.xpath("TipoPago/text()"))
        data["fecha_limite_pago"] = self._get_text(id_doc.xpath("FechaLimitePago/text()"))
        data["termino_pago"] = self._get_text(id_doc.xpath("TerminoPago/text()"))
        data["indicador_monto_gravado"] = self._get_text(id_doc.xpath("IndicadorMontoGravado/text()"))
        data["indicador_servicio_todo_incluido"] = self._get_text(id_doc.xpath("IndicadorServicioTodoIncluido/text()"))
        data["tipo_ingresos"] = self._get_text(id_doc.xpath("TipoIngresos/text()"))
        data["fecha_vencimiento_secuencia"] = self._get_text(id_doc.xpath("FechaVencimientoSecuencia/text()"))
        data["indicador_envio_diferido"] = self._get_text(id_doc.xpath("IndicadorEnvioDiferido/text()"))

        if ecf_type in ECF_TYPES_WITH_CREDIT_NOTE:
            data["indicador_nota_credito"] = self._get_text(id_doc.xpath("IndicadorNotaCredito/text()"))

        data["invoice_number"] = data.get("eNCF")
        data["goods_services_type"] = ecf_type

        tablas_pago = id_doc.xpath("TablaFormasPago/FormaDePago")
        formas_pago = []
        for fp in tablas_pago:
            forma = self._get_text(fp.xpath("FormaPago/text()"))
            monto = self._get_float(fp.xpath("MontoPago/text()"))
            if forma:
                formas_pago.append({"forma_pago": forma, "monto": monto})
        if formas_pago:
            data["formas_pago"] = formas_pago
            data["payment_method"] = formas_pago[0]["forma_pago"]

        data["tipo_cuenta_pago"] = self._get_text(id_doc.xpath("TipoCuentaPago/text()"))
        data["numero_cuenta_pago"] = self._get_text(id_doc.xpath("NumeroCuentaPago/text()"))
        data["banco_pago"] = self._get_text(id_doc.xpath("BancoPago/text()"))
        data["fecha_desde"] = self._get_text(id_doc.xpath("FechaDesde/text()"))
        data["fecha_hasta"] = self._get_text(id_doc.xpath("FechaHasta/text()"))
        data["total_paginas"] = self._get_int(id_doc.xpath("TotalPaginas/text()"))

        emisor = xp("//Emisor")
        if emisor:
            emisor = emisor[0]
            data["vendor_name"] = self._get_text(emisor.xpath("RazonSocialEmisor/text()"))
            data["vendor_tax_id"] = self._get_text(emisor.xpath("RNCEmisor/text()"))
            data["vendor_fiscal_address"] = self._get_text(emisor.xpath("DireccionEmisor/text()"))
            data["nombre_comercial"] = self._get_text(emisor.xpath("NombreComercial/text()"))
            data["sucursal"] = self._get_text(emisor.xpath("Sucursal/text()"))
            data["municipio_emisor"] = self._get_text(emisor.xpath("Municipio/text()"))
            data["provincia_emisor"] = self._get_text(emisor.xpath("Provincia/text()"))
            data["correo_emisor"] = self._get_text(emisor.xpath("CorreoEmisor/text()"))
            data["website"] = self._get_text(emisor.xpath("WebSite/text()"))
            data["actividad_economica"] = self._get_text(emisor.xpath("ActividadEconomica/text()"))
            data["codigo_vendedor"] = self._get_text(emisor.xpath("CodigoVendedor/text()"))
            data["numero_factura_interna"] = self._get_text(emisor.xpath("NumeroFacturaInterna/text()"))
            data["numero_pedido_interno"] = self._get_int(emisor.xpath("NumeroPedidoInterno/text()"))
            data["zona_venta"] = self._get_text(emisor.xpath("ZonaVenta/text()"))
            data["ruta_venta"] = self._get_text(emisor.xpath("RutaVenta/text()"))
            data["informacion_adicional_emisor"] = self._get_text(emisor.xpath("InformacionAdicionalEmisor/text()"))
            data["invoice_date"] = self._get_text(emisor.xpath("FechaEmision/text()"))
            data["fecha_emision"] = self._get_text(emisor.xpath("FechaEmision/text()"))

            telefonos = emisor.xpath("TablaTelefonoEmisor/TelefonoEmisor/text()")
            if telefonos:
                data["telefonos_emisor"] = [str(t).strip() for t in telefonos if t and t.strip()]

        comprador = xp("//Comprador")
        if comprador:
            comprador = comprador[0]
            data["vendor_country"] = "DOM"
            data["country_detection_method"] = "dgii_ecf"
            data["country_confidence"] = 1.0
            data["rnc_comprador"] = self._get_text(comprador.xpath("RNCComprador/text()"))
            data["identificador_extranjero"] = self._get_text(comprador.xpath("IdentificadorExtranjero/text()"))
            data["razon_social_comprador"] = self._get_text(comprador.xpath("RazonSocialComprador/text()"))
            data["contacto_comprador"] = self._get_text(comprador.xpath("ContactoComprador/text()"))
            data["correo_comprador"] = self._get_text(comprador.xpath("CorreoComprador/text()"))
            data["direccion_comprador"] = self._get_text(comprador.xpath("DireccionComprador/text()"))
            data["municipio_comprador"] = self._get_text(comprador.xpath("MunicipioComprador/text()"))
            data["provincia_comprador"] = self._get_text(comprador.xpath("ProvinciaComprador/text()"))
            data["fecha_entrega"] = self._get_text(comprador.xpath("FechaEntrega/text()"))
            data["contacto_entrega"] = self._get_text(comprador.xpath("ContactoEntrega/text()"))
            data["direccion_entrega"] = self._get_text(comprador.xpath("DireccionEntrega/text()"))
            data["telefono_adicional"] = self._get_text(comprador.xpath("TelefonoAdicional/text()"))
            data["fecha_orden_compra"] = self._get_text(comprador.xpath("FechaOrdenCompra/text()"))
            data["numero_orden_compra"] = self._get_text(comprador.xpath("NumeroOrdenCompra/text()"))
            data["codigo_interno_comprador"] = self._get_text(comprador.xpath("CodigoInternoComprador/text()"))
            data["responsable_pago"] = self._get_text(comprador.xpath("ResponsablePago/text()"))
            data["informacion_adicional_comprador"] = self._get_text(comprador.xpath("InformacionAdicionalComprador/text()"))

        totales = xp("//Totales")
        if totales:
            totales = totales[0]
            data["total_amount"] = self._get_float(totales.xpath("MontoTotal/text()"))
            data["monto_gravado_total"] = self._get_float(totales.xpath("MontoGravadoTotal/text()"))
            data["monto_exento"] = self._get_float(totales.xpath("MontoExento/text()"))
            data["monto_periodo"] = self._get_float(totales.xpath("MontoPeriodo/text()"))
            data["saldo_anterior"] = self._get_float(totales.xpath("SaldoAnterior/text()"))
            data["monto_avance_pago"] = self._get_float(totales.xpath("MontoAvancePago/text()"))
            data["valor_pagar"] = self._get_float(totales.xpath("ValorPagar/text()"))
            data["monto_no_facturable"] = self._get_float(totales.xpath("MontoNoFacturable/text()"))

            if ecf_type in ECF_TYPES_WITH_FULL_ITBIS:
                data["monto_gravado_i1"] = self._get_float(totales.xpath("MontoGravadoI1/text()"))
                data["monto_gravado_i2"] = self._get_float(totales.xpath("MontoGravadoI2/text()"))
                data["monto_gravado_i3"] = self._get_float(totales.xpath("MontoGravadoI3/text()"))
                data["itbis1"] = self._get_int(totales.xpath("ITBIS1/text()"))
                data["itbis2"] = self._get_int(totales.xpath("ITBIS2/text()"))
                data["itbis3"] = self._get_int(totales.xpath("ITBIS3/text()"))
                data["tax_amount"] = self._get_float(totales.xpath("TotalITBIS/text()"))
                data["total_itbis1"] = self._get_float(totales.xpath("TotalITBIS1/text()"))
                data["total_itbis2"] = self._get_float(totales.xpath("TotalITBIS2/text()"))
                data["total_itbis3"] = self._get_float(totales.xpath("TotalITBIS3/text()"))
                data["monto_impuesto_adicional"] = self._get_float(totales.xpath("MontoImpuestoAdicional/text()"))

                if ecf_type in ECF_TYPES_WITH_RETENCION:
                    data["total_itbis_retenido"] = self._get_float(totales.xpath("TotalITBISRetenido/text()"))
                    data["total_isr_retencion"] = self._get_float(totales.xpath("TotalISRRetencion/text()"))
                    data["total_itbis_percepcion"] = self._get_float(totales.xpath("TotalITBISPercepcion/text()"))
                    data["total_isr_percepcion"] = self._get_float(totales.xpath("TotalISRPercepcion/text()"))

            impuestos_adicionales = totales.xpath("ImpuestosAdicionales/ImpuestoAdicional")
            if impuestos_adicionales:
                data["impuestos_adicionales"] = []
                for imp in impuestos_adicionales:
                    entry = {
                        "tipo_impuesto": self._get_text(imp.xpath("TipoImpuesto/text()")),
                        "tasa": self._get_float(imp.xpath("TasaImpuestoAdicional/text()")),
                        "monto_especifico": self._get_float(imp.xpath("MontoImpuestoSelectivoConsumoEspecifico/text()")),
                        "monto_advalorem": self._get_float(imp.xpath("MontoImpuestoSelectivoConsumoAdvalorem/text()")),
                        "otros": self._get_float(imp.xpath("OtrosImpuestosAdicionales/text()")),
                    }
                    data["impuestos_adicionales"].append(entry)

        otra_moneda = xp("//OtraMoneda")
        if otra_moneda:
            otra_moneda = otra_moneda[0]
            data["currency"] = self._get_text(otra_moneda.xpath("TipoMoneda/text()"))
            data["tipo_cambio"] = self._get_float(otra_moneda.xpath("TipoCambio/text()"))
            data["monto_exento_otra_moneda"] = self._get_float(otra_moneda.xpath("MontoExentoOtraMoneda/text()"))
            data["monto_total_otra_moneda"] = self._get_float(otra_moneda.xpath("MontoTotalOtraMoneda/text()"))

        data.setdefault("tax_amount", None)

        if not data.get("currency"):
            data["currency"] = "DOP"

        informaciones = xp("//InformacionesAdicionales")
        if informaciones:
            informaciones = informaciones[0]
            data["fecha_embarque"] = self._get_text(informaciones.xpath("FechaEmbarque/text()"))
            data["numero_embarque"] = self._get_text(informaciones.xpath("NumeroEmbarque/text()"))
            data["numero_contenedor"] = self._get_text(informaciones.xpath("NumeroContenedor/text()"))
            data["numero_referencia"] = self._get_int(informaciones.xpath("NumeroReferencia/text()"))
            data["peso_bruto"] = self._get_float(informaciones.xpath("PesoBruto/text()"))
            data["peso_neto"] = self._get_float(informaciones.xpath("PesoNeto/text()"))
            data["unidad_peso_bruto"] = self._get_text(informaciones.xpath("UnidadPesoBruto/text()"))
            data["unidad_peso_neto"] = self._get_text(informaciones.xpath("UnidadPesoNeto/text()"))
            data["cantidad_bulto"] = self._get_float(informaciones.xpath("CantidadBulto/text()"))
            data["unidad_bulto"] = self._get_text(informaciones.xpath("UnidadBulto/text()"))
            data["volumen_bulto"] = self._get_float(informaciones.xpath("VolumenBulto/text()"))
            data["unidad_volumen"] = self._get_text(informaciones.xpath("UnidadVolumen/text()"))

        transporte = xp("//Transporte")
        if transporte:
            transporte = transporte[0]
            data["conductor"] = self._get_text(transporte.xpath("Conductor/text()"))
            data["matricula"] = self._get_text(transporte.xpath("Matricula/text()"))
            data["fecha_inicio_transporte"] = self._get_text(transporte.xpath("FechaInicioTransporte/text()"))
            data["fecha_fin_transporte"] = self._get_text(transporte.xpath("FechaFinTransporte/text()"))
            data["ruta"] = self._get_text(transporte.xpath("Ruta/text()"))

    def _parse_detalles_items(self, data: Dict[str, Any], xp, ecf_type: str) -> None:
        items = xp("//DetallesItems/Item")
        if not items:
            data["line_items"] = []
            return

        line_items = []
        for item in items:
            indicador = self._get_int(item.xpath("IndicadorFacturacion/text()"))
            nombre = self._get_text(item.xpath("NombreItem/text()"))
            descripcion = self._get_text(item.xpath("DescripcionItem/text()"))
            cantidad = self._get_float(item.xpath("CantidadItem/text()"))
            unidad = self._get_text(item.xpath("UnidadMedida/text()"))
            precio_unitario = self._get_float(item.xpath("PrecioUnitarioItem/text()"))
            descuento = self._get_float(item.xpath("DescuentoMonto/text()"))
            recargo = self._get_float(item.xpath("RecargoMonto/text()"))
            monto_item = self._get_float(item.xpath("MontoItem/text()"))
            bien_o_servicio = self._get_int(item.xpath("IndicadorBienoServicio/text()"))

            entry = {
                "line_number": self._get_int(item.xpath("NumeroLinea/text()")),
                "name": nombre,
                "description": descripcion or nombre,
                "quantity": cantidad or 1.0,
                "unit": unidad,
                "unit_price": precio_unitario or 0.0,
                "discount": descuento,
                "surcharge": recargo,
                "subtotal": monto_item or 0.0,
                "tax_indicator": indicador,
                "goods_or_service": bien_o_servicio,
            }

            item_codes = item.xpath("TablaCodigosItem/CodigosItem")
            if item_codes:
                codes = []
                for c in item_codes:
                    tipo = self._get_text(c.xpath("TipoCodigo/text()"))
                    codigo = self._get_text(c.xpath("CodigoItem/text()"))
                    if codigo:
                        codes.append({"type": tipo or "UNSPSC", "code": codigo})
                entry["item_codes"] = codes

            retencion = item.xpath("Retencion")
            if retencion and ecf_type in ECF_TYPES_WITH_RETENCION:
                ret = retencion[0]
                entry["retencion"] = {
                    "indicador": self._get_int(ret.xpath("IndicadorAgenteRetencionoPercepcion/text()")),
                    "itbis_retenido": self._get_float(ret.xpath("MontoITBISRetenido/text()")),
                    "isr_retenido": self._get_float(ret.xpath("MontoISRRetenido/text()")),
                }

            cantidad_ref = item.xpath("CantidadReferencia")
            if cantidad_ref:
                entry["cantidad_referencia"] = self._get_float(cantidad_ref[0].xpath("text()"))
                entry["unidad_referencia"] = self._get_text(item.xpath("UnidadReferencia/text()"))

            grados = item.xpath("GradosAlcohol")
            if grados:
                entry["grados_alcohol"] = self._get_float(grados)

            fecha_elab = item.xpath("FechaElaboracion")
            if fecha_elab:
                entry["fecha_elaboracion"] = self._get_text(fecha_elab)

            fecha_venc = item.xpath("FechaVencimientoItem")
            if fecha_venc:
                entry["fecha_vencimiento"] = self._get_text(fecha_venc)

            imp_adic = item.xpath("TablaImpuestoAdicional/ImpuestoAdicional")
            if imp_adic:
                impuestos = []
                for imp in imp_adic:
                    impuestos.append({
                        "tipo": self._get_text(imp.xpath("TipoImpuesto/text()")),
                        "tasa": self._get_float(imp.xpath("TasaImpuestoAdicional/text()")),
                        "monto": self._get_float(imp.xpath("MontoImpuestoAdicional/text()")),
                    })
                entry["impuestos_adicionales"] = impuestos

            if entry.get("name") or entry.get("description"):
                line_items.append(entry)

        data["line_items"] = line_items

        first_goods = None
        for li in line_items:
            gs = li.get("goods_or_service")
            if gs is not None:
                first_goods = gs
                break
        tipo_str = data.get("goods_services_type", "")
        if first_goods == 1:
            tipo_str = "01"
        elif first_goods == 2:
            tipo_str = "02"
        data["goods_services_type"] = tipo_str

    def _parse_subtotales(self, data: Dict[str, Any], xp) -> None:
        subtotales = xp("//Subtotales/Subtotal")
        if not subtotales:
            return
        data["subtotales"] = []
        for st in subtotales:
            entry = {
                "nombre": self._get_text(st.xpath("SubtotalNombre/text()")),
                "monto": self._get_float(st.xpath("SubtotalMonto/text()")),
                "orden": self._get_int(st.xpath("SubtotalOrden/text()")),
            }
            data["subtotales"].append(entry)

    def _parse_descuentos_recargos(self, data: Dict[str, Any], xp) -> None:
        items = xp("//DescuentosORecargos/DescuentoORecargo")
        if not items:
            return
        data["descuentos_recargos"] = []
        for dr in items:
            entry = {
                "tipo": self._get_int(dr.xpath("TipoDR/text()")),
                "indicador": self._get_int(dr.xpath("IndicadorDR/text()")),
                "descripcion": self._get_text(dr.xpath("DescripcionDR/text()")),
                "monto_o_tasa": self._get_float(dr.xpath("MontoOTasaDR/text()")),
                "monto": self._get_float(dr.xpath("MontoDR/text()")),
            }
            data["descuentos_recargos"].append(entry)

    def _parse_informacion_referencia(self, data: Dict[str, Any], xp) -> None:
        ref = xp("//InformacionReferencia")
        if not ref:
            return
        ref = ref[0]
        data["ncf_modified"] = self._get_text(ref.xpath("NCFModificado/text()"))
        data["ncf_modification_type"] = self._get_text(ref.xpath("TipoModificacion/text()"))
        data["fecha_ncf_modificado"] = self._get_text(ref.xpath("FechaNCFModificado/text()"))
        data["motivo_modificacion"] = self._get_text(ref.xpath("MotivoModificacion/text()"))

    def _parse_paginacion(self, data: Dict[str, Any], xp) -> None:
        paginas = xp("//Paginacion/Pagina")
        if not paginas:
            return
        entries = []
        for pagina in paginas:
            entry = {
                "numero_pagina": self._get_int(pagina.xpath("NumeroPagina/text()")),
                "cantidad_items": self._get_int(pagina.xpath("CantidadItems/text()")),
                "monto_pagina": self._get_float(pagina.xpath("MontoPagina/text()")),
            }
            entries.append(entry)
        if entries:
            data["paginacion"] = entries


ecf_parser = ECFParser()
