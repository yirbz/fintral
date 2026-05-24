import json
import os
import tempfile
import pytest
from copy import deepcopy
from lxml import etree

from app.services.pipeline.classifier import classifier, FileClassifier
from app.services.pipeline.ecf_parser import ecf_parser, ECFParser, ECF_TYPES

ECF_31_XML = """<?xml version="1.0" encoding="utf-8"?>
<ECF xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://www.dgii.gov.do/ecf/v1">
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc>
      <TipoeCF>31</TipoeCF>
      <eNCF>E310000000001</eNCF>
      <FechaVencimientoSecuencia>2026-12-31</FechaVencimientoSecuencia>
      <IndicadorEnvioDiferido>0</IndicadorEnvioDiferido>
      <IndicadorMontoGravado>1</IndicadorMontoGravado>
      <TipoIngresos>01</TipoIngresos>
      <TipoPago>1</TipoPago>
      <FechaLimitePago>2026-06-15</FechaLimitePago>
      <TerminoPago>30</TerminoPago>
    </IdDoc>
    <Emisor>
      <RNCEmisor>131111111</RNCEmisor>
      <RazonSocialEmisor>EMPRESA EJEMPLO SRL</RazonSocialEmisor>
      <NombreComercial>Ejemplo Comercial</NombreComercial>
      <DireccionEmisor>Calle Principal 123, Santo Domingo</DireccionEmisor>
      <Municipio>Distrito Nacional</Municipio>
      <Provincia>Distrito Nacional</Provincia>
      <CorreoEmisor>facturacion@ejemplo.com</CorreoEmisor>
      <ActividadEconomica>Venta al por mayor</ActividadEconomica>
      <FechaEmision>2026-05-23</FechaEmision>
    </Emisor>
    <Comprador>
      <RNCComprador>132222222</RNCComprador>
      <RazonSocialComprador>CLIENTE EJEMPLO SA</RazonSocialComprador>
      <DireccionComprador>Avenida Secundaria 456, Santo Domingo</DireccionComprador>
      <CorreoComprador>cliente@ejemplo.com</CorreoComprador>
    </Comprador>
    <Totales>
      <MontoGravadoTotal>1000.00</MontoGravadoTotal>
      <MontoGravadoI1>800.00</MontoGravadoI1>
      <MontoGravadoI2>200.00</MontoGravadoI2>
      <MontoGravadoI3>0.00</MontoGravadoI3>
      <MontoExento>0.00</MontoExento>
      <ITBIS1>18</ITBIS1>
      <ITBIS2>16</ITBIS2>
      <ITBIS3>0</ITBIS3>
      <TotalITBIS>176.00</TotalITBIS>
      <TotalITBIS1>144.00</TotalITBIS1>
      <TotalITBIS2>32.00</TotalITBIS2>
      <TotalITBIS3>0.00</TotalITBIS3>
      <MontoTotal>1176.00</MontoTotal>
      <MontoPeriodo>1176.00</MontoPeriodo>
      <SaldoAnterior>0.00</SaldoAnterior>
      <MontoAvancePago>0.00</MontoAvancePago>
      <ValorPagar>1176.00</ValorPagar>
      <TotalITBISRetenido>0.00</TotalITBISRetenido>
      <TotalISRRetencion>0.00</TotalISRRetencion>
    </Totales>
    <OtraMoneda>
      <TipoMoneda>USD</TipoMoneda>
      <TipoCambio>58.50</TipoCambio>
      <MontoExentoOtraMoneda>0.00</MontoExentoOtraMoneda>
      <MontoTotalOtraMoneda>20.10</MontoTotalOtraMoneda>
    </OtraMoneda>
  </Encabezado>
  <DetallesItems>
    <Item>
      <NumeroLinea>1</NumeroLinea>
      <IndicadorFacturacion>1</IndicadorFacturacion>
      <NombreItem>Producto A</NombreItem>
      <IndicadorBienoServicio>1</IndicadorBienoServicio>
      <DescripcionItem>Producto de ejemplo A</DescripcionItem>
      <CantidadItem>10</CantidadItem>
      <UnidadMedida>Unidad</UnidadMedida>
      <PrecioUnitarioItem>80.00</PrecioUnitarioItem>
      <MontoItem>800.00</MontoItem>
    </Item>
    <Item>
      <NumeroLinea>2</NumeroLinea>
      <IndicadorFacturacion>2</IndicadorFacturacion>
      <NombreItem>Servicio B</NombreItem>
      <IndicadorBienoServicio>2</IndicadorBienoServicio>
      <DescripcionItem>Servicio de consultoria B</DescripcionItem>
      <CantidadItem>1</CantidadItem>
      <UnidadMedida>Servicio</UnidadMedida>
      <PrecioUnitarioItem>200.00</PrecioUnitarioItem>
      <MontoItem>200.00</MontoItem>
    </Item>
  </DetallesItems>
  <InformacionReferencia>
    <NCFModificado>E310000000000</NCFModificado>
    <TipoModificacion>1</TipoModificacion>
    <FechaNCFModificado>2026-05-20</FechaNCFModificado>
    <MotivoModificacion>Correccion de monto</MotivoModificacion>
  </InformacionReferencia>
  <FechaHoraFirma>2026-05-23T10:30:00</FechaHoraFirma>
</ECF>"""

ECF_43_XML = """<?xml version="1.0" encoding="utf-8"?>
<ECF xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://www.dgii.gov.do/ecf/v1">
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc>
      <TipoeCF>43</TipoeCF>
      <eNCF>E430000000001</eNCF>
      <FechaVencimientoSecuencia>2026-12-31</FechaVencimientoSecuencia>
      <TotalPaginas>1</TotalPaginas>
    </IdDoc>
    <Emisor>
      <RNCEmisor>131111111</RNCEmisor>
      <RazonSocialEmisor>EMPRESA EJEMPLO SRL</RazonSocialEmisor>
      <DireccionEmisor>Calle Principal 123, Santo Domingo</DireccionEmisor>
      <FechaEmision>2026-05-23</FechaEmision>
    </Emisor>
    <Totales>
      <MontoExento>0.00</MontoExento>
      <MontoTotal>500.00</MontoTotal>
      <MontoPeriodo>500.00</MontoPeriodo>
      <SaldoAnterior>0.00</SaldoAnterior>
      <MontoAvancePago>0.00</MontoAvancePago>
      <ValorPagar>500.00</ValorPagar>
    </Totales>
  </Encabezado>
  <DetallesItems>
    <Item>
      <NumeroLinea>1</NumeroLinea>
      <IndicadorFacturacion>1</IndicadorFacturacion>
      <NombreItem>Gasto menor C</NombreItem>
      <IndicadorBienoServicio>1</IndicadorBienoServicio>
      <CantidadItem>1</CantidadItem>
      <PrecioUnitarioItem>500.00</PrecioUnitarioItem>
      <MontoItem>500.00</MontoItem>
    </Item>
  </DetallesItems>
  <FechaHoraFirma>2026-05-23T10:30:00</FechaHoraFirma>
</ECF>"""

ECF_34_XML = """<?xml version="1.0" encoding="utf-8"?>
<ECF xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://www.dgii.gov.do/ecf/v1">
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc>
      <TipoeCF>34</TipoeCF>
      <eNCF>E340000000001</eNCF>
      <IndicadorNotaCredito>1</IndicadorNotaCredito>
      <IndicadorMontoGravado>1</IndicadorMontoGravado>
      <TipoPago>2</TipoPago>
      <TotalPaginas>1</TotalPaginas>
    </IdDoc>
    <Emisor>
      <RNCEmisor>131111111</RNCEmisor>
      <RazonSocialEmisor>EMPRESA EJEMPLO SRL</RazonSocialEmisor>
      <DireccionEmisor>Calle Principal 123, Santo Domingo</DireccionEmisor>
      <FechaEmision>2026-05-23</FechaEmision>
    </Emisor>
    <Comprador>
      <RNCComprador>132222222</RNCComprador>
      <RazonSocialComprador>CLIENTE EJEMPLO SA</RazonSocialComprador>
    </Comprador>
    <Totales>
      <MontoGravadoTotal>-500.00</MontoGravadoTotal>
      <MontoGravadoI1>-500.00</MontoGravadoI1>
      <ITBIS1>18</ITBIS1>
      <TotalITBIS>-90.00</TotalITBIS>
      <TotalITBIS1>-90.00</TotalITBIS1>
      <MontoTotal>-590.00</MontoTotal>
      <ValorPagar>-590.00</ValorPagar>
      <TotalITBISRetenido>0.00</TotalITBISRetenido>
      <TotalISRRetencion>0.00</TotalISRRetencion>
    </Totales>
  </Encabezado>
  <DetallesItems>
    <Item>
      <NumeroLinea>1</NumeroLinea>
      <IndicadorFacturacion>1</IndicadorFacturacion>
      <NombreItem>Nota credito item</NombreItem>
      <IndicadorBienoServicio>1</IndicadorBienoServicio>
      <CantidadItem>1</CantidadItem>
      <PrecioUnitarioItem>500.00</PrecioUnitarioItem>
      <MontoItem>500.00</MontoItem>
    </Item>
  </DetallesItems>
  <InformacionReferencia>
    <NCFModificado>E310000000001</NCFModificado>
    <TipoModificacion>2</TipoModificacion>
    <FechaNCFModificado>2026-05-22</FechaNCFModificado>
  </InformacionReferencia>
  <FechaHoraFirma>2026-05-23T10:30:00</FechaHoraFirma>
</ECF>"""

NON_ECF_XML = """<?xml version="1.0" encoding="utf-8"?>
<Invoice>
  <Supplier>
    <Name>Generic Supplier</Name>
    <TaxId>123456789</TaxId>
  </Supplier>
  <Total>100.00</Total>
</Invoice>"""


@pytest.fixture
def temp_dir():
    with tempfile.TemporaryDirectory() as d:
        yield d


def _write_xml(temp_dir, filename, content):
    path = os.path.join(temp_dir, filename)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    return path


class TestECFParserParse:

    def test_parse_ecf_31_full(self, temp_dir):
        path = _write_xml(temp_dir, "ecf_31.xml", ECF_31_XML)
        result = ecf_parser.process(path)
        assert result.success
        assert result.source_type == "ecf"
        assert result.confidence == 1.0

        data = result.data
        assert data["ecf_type"] == "31"
        assert data["ecf_type_name"] == "Factura de Credito Fiscal Electronica"
        assert data["vendor_name"] == "EMPRESA EJEMPLO SRL"
        assert data["vendor_tax_id"] == "131111111"
        assert data["vendor_fiscal_address"] == "Calle Principal 123, Santo Domingo"
        assert data["eNCF"] == "E310000000001"
        assert data["invoice_number"] == "E310000000001"
        assert data["invoice_date"] == "2026-05-23"

        assert data["total_amount"] == 1176.00
        assert data["tax_amount"] == 176.00
        assert data["monto_gravado_total"] == 1000.00
        assert data["monto_gravado_i1"] == 800.00
        assert data["monto_gravado_i2"] == 200.00
        assert data["itbis1"] == 18
        assert data["itbis2"] == 16
        assert data["total_itbis1"] == 144.00
        assert data["total_itbis2"] == 32.00
        assert data["valor_pagar"] == 1176.00
        assert data["currency"] == "USD"
        assert data["tipo_cambio"] == 58.50

        assert data.get("indicador_envio_diferido") == "0"
        assert data.get("tipo_pago") == "1"
        assert data.get("termino_pago") == "30"
        assert data.get("fecha_limite_pago") == "2026-06-15"

        assert data.get("rnc_comprador") == "132222222"
        assert data.get("razon_social_comprador") == "CLIENTE EJEMPLO SA"
        assert data.get("vendor_country") == "DOM"
        assert data.get("country_detection_method") == "dgii_ecf"
        assert data.get("country_confidence") == 1.0

        assert data.get("ncf_modified") == "E310000000000"
        assert data.get("ncf_modification_type") == "1"
        assert data.get("motivo_modificacion") == "Correccion de monto"

        assert len(data["line_items"]) == 2
        assert data["line_items"][0]["name"] == "Producto A"
        assert data["line_items"][0]["quantity"] == 10
        assert data["line_items"][0]["unit_price"] == 80.00
        assert data["line_items"][0]["subtotal"] == 800.00
        assert data["line_items"][0]["tax_indicator"] == 1
        assert data["line_items"][0]["goods_or_service"] == 1

        assert data["line_items"][1]["name"] == "Servicio B"
        assert data["line_items"][1]["goods_or_service"] == 2

    def test_parse_ecf_43_gastos_menores(self, temp_dir):
        path = _write_xml(temp_dir, "ecf_43.xml", ECF_43_XML)
        result = ecf_parser.process(path)
        assert result.success
        data = result.data
        assert data["ecf_type"] == "43"
        assert data["vendor_name"] == "EMPRESA EJEMPLO SRL"
        assert data["total_amount"] == 500.00
        assert data["tax_amount"] is None
        assert data.get("monto_gravado_total") is None
        assert data.get("itbis1") is None
        assert len(data["line_items"]) == 1

    def test_parse_ecf_34_nota_credito(self, temp_dir):
        path = _write_xml(temp_dir, "ecf_34.xml", ECF_34_XML)
        result = ecf_parser.process(path)
        assert result.success
        data = result.data
        assert data["ecf_type"] == "34"
        assert data["total_amount"] == -590.00
        assert data["indicador_nota_credito"] == "1"
        assert len(data["line_items"]) == 1
        assert data["ncf_modified"] == "E310000000001"
        assert data["ncf_modification_type"] == "2"

    def test_non_ecf_xml_detected(self, temp_dir):
        path = _write_xml(temp_dir, "generic.xml", NON_ECF_XML)
        result = ecf_parser.process(path)
        assert not result.success
        assert "TipoeCF" in (result.error or "")

    def test_parse_invalid_xml(self, temp_dir):
        path = _write_xml(temp_dir, "invalid.xml", "not xml content")
        result = ecf_parser.process(path)
        assert not result.success

    def test_vendor_name_fallback_consistent(self, temp_dir):
        path = _write_xml(temp_dir, "ecf_31.xml", ECF_31_XML)
        result = ecf_parser.process(path)
        data = result.data
        assert data["vendor_name"] == "EMPRESA EJEMPLO SRL"
        assert data.get("nombre_comercial") == "Ejemplo Comercial"
        assert data.get("actividad_economica") == "Venta al por mayor"


class TestECFParserClassifier:

    def test_classifier_routes_ecf_xml(self, temp_dir):
        path = _write_xml(temp_dir, "factura_31.xml", ECF_31_XML)
        source_type, strategy = classifier.classify(path)
        assert source_type == "ecf"
        assert strategy == "ecf_parser"

    def test_classifier_routes_ecf_43_xml(self, temp_dir):
        path = _write_xml(temp_dir, "gasto_43.xml", ECF_43_XML)
        source_type, strategy = classifier.classify(path)
        assert source_type == "ecf"
        assert strategy == "ecf_parser"

    def test_classifier_routes_non_ecf_xml_to_xml_processor(self, temp_dir):
        path = _write_xml(temp_dir, "generic.xml", NON_ECF_XML)
        source_type, strategy = classifier.classify(path)
        assert source_type == "xml"
        assert strategy == "xml_processor"

    def test_classifier_rejects_unsupported_extension(self, temp_dir):
        path = os.path.join(temp_dir, "file.xyz")
        with open(path, "w") as f:
            f.write("dummy")
        with pytest.raises(ValueError, match="Unsupported file type"):
            classifier.classify(path)

    def test_classifier_xml_without_namespace(self, temp_dir):
        xml_no_ns = """<?xml version="1.0"?>
<Document>
  <TipoeCF>31</TipoeCF>
  <Data>test</Data>
</Document>"""
        path = _write_xml(temp_dir, "no_ns.xml", xml_no_ns)
        source_type, strategy = classifier.classify(path)
        assert source_type == "ecf"
        assert strategy == "ecf_parser"


class TestECFParserDataNormalization:

    def test_normalizer_ecf_fields_propagate(self, temp_dir):
        from app.services.pipeline.normalizer import normalizer
        path = _write_xml(temp_dir, "ecf_31.xml", ECF_31_XML)
        parse_result = ecf_parser.process(path)
        assert parse_result.success

        normalized = normalizer.normalize(
            parse_result.data,
            source_type="ecf",
            confidence=1.0,
        )
        assert normalized["vendor_name"] == "EMPRESA EJEMPLO SRL"
        assert normalized["vendor_tax_id"] == "131111111"
        assert normalized["eNCF"] == "E310000000001"
        assert normalized["ecf_type"] == "31"
        assert normalized["total_amount"] == 1176.00
        assert normalized["tax_amount"] == 176.00
        assert normalized["currency"] == "USD"
        assert normalized["source_type"] == "ecf"
        assert len(normalized["line_items"]) == 2

        db_dict = normalizer.to_db_dict(normalized)
        assert db_dict["vendor_name"] == "EMPRESA EJEMPLO SRL"
        assert db_dict["ecf_type"] == "31"
        assert db_dict["source_type"] == "ecf"
        assert db_dict["original_xml_data"] is not None
        line_items = json.loads(db_dict["line_items_data"])
        assert len(line_items) == 2

    def test_normalizer_ecf_43_no_tax(self, temp_dir):
        from app.services.pipeline.normalizer import normalizer
        path = _write_xml(temp_dir, "ecf_43.xml", ECF_43_XML)
        parse_result = ecf_parser.process(path)
        normalized = normalizer.normalize(
            parse_result.data,
            source_type="ecf",
            confidence=1.0,
        )
        assert normalized["ecf_type"] == "43"
        assert normalized["tax_amount"] is None
        assert normalized["monto_gravado_total"] is None

    def test_normalizer_ecf_34_negative_amounts(self, temp_dir):
        from app.services.pipeline.normalizer import normalizer
        path = _write_xml(temp_dir, "ecf_34.xml", ECF_34_XML)
        parse_result = ecf_parser.process(path)
        normalized = normalizer.normalize(
            parse_result.data,
            source_type="ecf",
            confidence=1.0,
        )
        assert normalized["total_amount"] == -590.00
        assert normalized["ncf_modified"] == "E310000000001"


class TestECFParserEtiquetasEspeciales:

    def test_subtotales_descuentos(self, temp_dir):
        xml = """<?xml version="1.0" encoding="utf-8"?>
<ECF xmlns="http://www.dgii.gov.do/ecf/v1">
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc><TipoeCF>31</TipoeCF><eNCF>E319999999999</eNCF>
      <FechaVencimientoSecuencia>2026-12-31</FechaVencimientoSecuencia>
      <TipoPago>1</TipoPago></IdDoc>
    <Emisor><RNCEmisor>131111111</RNCEmisor>
      <RazonSocialEmisor>EMPRESA TEST</RazonSocialEmisor>
      <DireccionEmisor>Direccion Test</DireccionEmisor>
      <FechaEmision>2026-05-23</FechaEmision></Emisor>
    <Totales><MontoTotal>1000.00</MontoTotal>
      <MontoPeriodo>1000.00</MontoPeriodo>
      <SaldoAnterior>0.00</SaldoAnterior>
      <MontoAvancePago>0.00</MontoAvancePago>
      <ValorPagar>1000.00</ValorPagar></Totales>
  </Encabezado>
  <DetallesItems>
    <Item><NumeroLinea>1</NumeroLinea>
      <IndicadorFacturacion>1</IndicadorFacturacion>
      <NombreItem>Item A</NombreItem>
      <IndicadorBienoServicio>1</IndicadorBienoServicio>
      <CantidadItem>1</CantidadItem>
      <PrecioUnitarioItem>1000.00</PrecioUnitarioItem>
      <MontoItem>1000.00</MontoItem></Item>
  </DetallesItems>
  <Subtotales>
    <Subtotal><SubtotalNombre>Subtotal 1</SubtotalNombre>
      <SubtotalMonto>500.00</SubtotalMonto>
      <SubtotalOrden>1</SubtotalOrden></Subtotal>
    <Subtotal><SubtotalNombre>Subtotal 2</SubtotalNombre>
      <SubtotalMonto>500.00</SubtotalMonto>
      <SubtotalOrden>2</SubtotalOrden></Subtotal>
  </Subtotales>
  <DescuentosORecargos>
    <DescuentoORecargo>
      <TipoDR>1</TipoDR>
      <IndicadorDR>1</IndicadorDR>
      <DescripcionDR>Descuento por pronto pago</DescripcionDR>
      <MontoOTasaDR>5.00</MontoOTasaDR>
      <MontoDR>50.00</MontoDR></DescuentoORecargo>
  </DescuentosORecargos>
  <FechaHoraFirma>2026-05-23T10:30:00</FechaHoraFirma>
</ECF>"""
        path = _write_xml(temp_dir, "with_extra.xml", xml)
        result = ecf_parser.process(path)
        data = result.data

        assert len(data.get("subtotales", [])) == 2
        assert data["subtotales"][0]["nombre"] == "Subtotal 1"
        assert data["subtotales"][0]["monto"] == 500.00
        assert data["subtotales"][0]["orden"] == 1

        assert len(data.get("descuentos_recargos", [])) == 1
        dr = data["descuentos_recargos"][0]
        assert dr["tipo"] == 1
        assert dr["descripcion"] == "Descuento por pronto pago"
        assert dr["monto_o_tasa"] == 5.00
        assert dr["monto"] == 50.00

    def test_formas_pago(self, temp_dir):
        xml = """<?xml version="1.0" encoding="utf-8"?>
<ECF xmlns="http://www.dgii.gov.do/ecf/v1">
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc><TipoeCF>31</TipoeCF><eNCF>E319999999998</eNCF>
      <FechaVencimientoSecuencia>2026-12-31</FechaVencimientoSecuencia>
      <TipoPago>1</TipoPago>
      <TablaFormasPago>
        <FormaDePago><FormaPago>1</FormaPago><MontoPago>800.00</MontoPago></FormaDePago>
        <FormaDePago><FormaPago>2</FormaPago><MontoPago>376.00</MontoPago></FormaDePago>
      </TablaFormasPago></IdDoc>
    <Emisor><RNCEmisor>131111111</RNCEmisor>
      <RazonSocialEmisor>EMPRESA TEST</RazonSocialEmisor>
      <DireccionEmisor>Direccion Test</DireccionEmisor>
      <FechaEmision>2026-05-23</FechaEmision></Emisor>
    <Totales><MontoTotal>1176.00</MontoTotal>
      <MontoPeriodo>1176.00</MontoPeriodo>
      <SaldoAnterior>0.00</SaldoAnterior>
      <MontoAvancePago>0.00</MontoAvancePago>
      <ValorPagar>1176.00</ValorPagar></Totales>
  </Encabezado>
  <DetallesItems>
    <Item><NumeroLinea>1</NumeroLinea>
      <IndicadorFacturacion>1</IndicadorFacturacion>
      <NombreItem>Item A</NombreItem>
      <IndicadorBienoServicio>1</IndicadorBienoServicio>
      <CantidadItem>1</CantidadItem>
      <PrecioUnitarioItem>1000.00</PrecioUnitarioItem>
      <MontoItem>1000.00</MontoItem></Item>
  </DetallesItems>
  <FechaHoraFirma>2026-05-23T10:30:00</FechaHoraFirma>
</ECF>"""
        path = _write_xml(temp_dir, "formas_pago.xml", xml)
        result = ecf_parser.process(path)
        data = result.data

        assert len(data.get("formas_pago", [])) == 2
        assert data["formas_pago"][0]["forma_pago"] == "1"
        assert data["formas_pago"][0]["monto"] == 800.00
        assert data["formas_pago"][1]["forma_pago"] == "2"
        assert data["formas_pago"][1]["monto"] == 376.00


class TestECFParserEdgeCases:

    def test_all_ecf_types_recognized(self, temp_dir):
        for ecf_type in sorted(ECF_TYPES.keys()):
            xml = f"""<?xml version="1.0" encoding="utf-8"?>
<ECF xmlns="http://www.dgii.gov.do/ecf/v1">
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc><TipoeCF>{ecf_type}</TipoeCF><eNCF>E{ecf_type}0000000001</eNCF>
      <FechaVencimientoSecuencia>2026-12-31</FechaVencimientoSecuencia>
      <TipoPago>1</TipoPago></IdDoc>
    <Emisor><RNCEmisor>131111111</RNCEmisor>
      <RazonSocialEmisor>EMPRESA {ecf_type}</RazonSocialEmisor>
      <DireccionEmisor>Direccion {ecf_type}</DireccionEmisor>
      <FechaEmision>2026-05-23</FechaEmision></Emisor>
    <Totales><MontoTotal>100.00</MontoTotal>
      <MontoPeriodo>100.00</MontoPeriodo>
      <SaldoAnterior>0.00</SaldoAnterior>
      <MontoAvancePago>0.00</MontoAvancePago>
      <ValorPagar>100.00</ValorPagar></Totales>
  </Encabezado>
  <DetallesItems>
    <Item><NumeroLinea>1</NumeroLinea>
      <IndicadorFacturacion>1</IndicadorFacturacion>
      <NombreItem>Item</NombreItem>
      <IndicadorBienoServicio>1</IndicadorBienoServicio>
      <CantidadItem>1</CantidadItem>
      <PrecioUnitarioItem>100.00</PrecioUnitarioItem>
      <MontoItem>100.00</MontoItem></Item>
  </DetallesItems>
  <FechaHoraFirma>2026-05-23T10:30:00</FechaHoraFirma>
</ECF>"""
            path = _write_xml(temp_dir, f"ecf_{ecf_type}.xml", xml)
            result = ecf_parser.process(path)
            assert result.success, f"Failed for e-CF type {ecf_type}: {result.error}"
            assert result.data["ecf_type"] == ecf_type

    def test_informacion_transporte(self, temp_dir):
        xml = """<?xml version="1.0" encoding="utf-8"?>
<ECF xmlns="http://www.dgii.gov.do/ecf/v1">
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc><TipoeCF>31</TipoeCF><eNCF>E319999999997</eNCF>
      <FechaVencimientoSecuencia>2026-12-31</FechaVencimientoSecuencia>
      <TipoPago>1</TipoPago></IdDoc>
    <Emisor><RNCEmisor>131111111</RNCEmisor>
      <RazonSocialEmisor>TRANSPORTE SA</RazonSocialEmisor>
      <DireccionEmisor>Zona Industrial</DireccionEmisor>
      <FechaEmision>2026-05-23</FechaEmision></Emisor>
    <InformacionesAdicionales>
      <PesoBruto>1500.00</PesoBruto>
      <PesoNeto>1400.00</PesoNeto>
      <UnidadPesoBruto>KG</UnidadPesoBruto>
      <UnidadPesoNeto>KG</UnidadPesoNeto>
      <CantidadBulto>10</CantidadBulto>
      <UnidadBulto>CAJ</UnidadBulto>
    </InformacionesAdicionales>
    <Transporte>
      <Conductor>Juan Perez</Conductor>
      <Matricula>ABC-123</Matricula>
      <Ruta>Santo Domingo-Santiago</Ruta>
    </Transporte>
    <Totales><MontoTotal>2000.00</MontoTotal>
      <MontoPeriodo>2000.00</MontoPeriodo>
      <SaldoAnterior>0.00</SaldoAnterior>
      <MontoAvancePago>0.00</MontoAvancePago>
      <ValorPagar>2000.00</ValorPagar></Totales>
  </Encabezado>
  <DetallesItems>
    <Item><NumeroLinea>1</NumeroLinea>
      <IndicadorFacturacion>1</IndicadorFacturacion>
      <NombreItem>Mercancia</NombreItem>
      <IndicadorBienoServicio>1</IndicadorBienoServicio>
      <CantidadItem>1</CantidadItem>
      <PrecioUnitarioItem>2000.00</PrecioUnitarioItem>
      <MontoItem>2000.00</MontoItem></Item>
  </DetallesItems>
  <FechaHoraFirma>2026-05-23T10:30:00</FechaHoraFirma>
</ECF>"""
        path = _write_xml(temp_dir, "transporte.xml", xml)
        result = ecf_parser.process(path)
        data = result.data
        assert data["peso_bruto"] == 1500.00
        assert data["peso_neto"] == 1400.00
        assert data["unidad_peso_bruto"] == "KG"
        assert data["cantidad_bulto"] == 10.0
        assert data["conductor"] == "Juan Perez"
        assert data["matricula"] == "ABC-123"
        assert data["ruta"] == "Santo Domingo-Santiago"

    def test_line_item_codes(self, temp_dir):
        xml = """<?xml version="1.0" encoding="utf-8"?>
<ECF xmlns="http://www.dgii.gov.do/ecf/v1">
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc><TipoeCF>31</TipoeCF><eNCF>E319999999996</eNCF>
      <FechaVencimientoSecuencia>2026-12-31</FechaVencimientoSecuencia>
      <TipoPago>1</TipoPago></IdDoc>
    <Emisor><RNCEmisor>131111111</RNCEmisor>
      <RazonSocialEmisor>EMPRESA TEST</RazonSocialEmisor>
      <DireccionEmisor>Direccion</DireccionEmisor>
      <FechaEmision>2026-05-23</FechaEmision></Emisor>
    <Totales><MontoTotal>100.00</MontoTotal>
      <MontoPeriodo>100.00</MontoPeriodo>
      <SaldoAnterior>0.00</SaldoAnterior>
      <MontoAvancePago>0.00</MontoAvancePago>
      <ValorPagar>100.00</ValorPagar></Totales>
  </Encabezado>
  <DetallesItems>
    <Item><NumeroLinea>1</NumeroLinea>
      <IndicadorFacturacion>1</IndicadorFacturacion>
      <NombreItem>Item con codigo</NombreItem>
      <IndicadorBienoServicio>1</IndicadorBienoServicio>
      <TablaCodigosItem>
        <CodigosItem><TipoCodigo>UNSPSC</TipoCodigo><CodigoItem>44111505</CodigoItem></CodigosItem>
      </TablaCodigosItem>
      <CantidadItem>1</CantidadItem>
      <PrecioUnitarioItem>100.00</PrecioUnitarioItem>
      <MontoItem>100.00</MontoItem></Item>
  </DetallesItems>
  <FechaHoraFirma>2026-05-23T10:30:00</FechaHoraFirma>
</ECF>"""
        path = _write_xml(temp_dir, "item_codes.xml", xml)
        result = ecf_parser.process(path)
        data = result.data
        assert len(data["line_items"]) == 1
        codes = data["line_items"][0].get("item_codes", [])
        assert len(codes) == 1
        assert codes[0]["type"] == "UNSPSC"
        assert codes[0]["code"] == "44111505"


class TestECFParserXSDValidation:

    def test_valid_ecf_31_passes_xsd(self, temp_dir):
        xml = """<?xml version="1.0" encoding="utf-8"?>
<ECF xmlns="http://www.dgii.gov.do/ecf/v1">
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc>
      <TipoeCF>31</TipoeCF>
      <eNCF>E310000000001</eNCF>
      <FechaVencimientoSecuencia>31-12-2026</FechaVencimientoSecuencia>
      <TipoIngresos>01</TipoIngresos>
      <TipoPago>1</TipoPago>
    </IdDoc>
    <Emisor>
      <RNCEmisor>131111111</RNCEmisor>
      <RazonSocialEmisor>EMPRESA TEST SRL</RazonSocialEmisor>
      <DireccionEmisor>Direccion test</DireccionEmisor>
      <FechaEmision>23-05-2026</FechaEmision>
    </Emisor>
    <Comprador>
      <RNCComprador>132222222</RNCComprador>
      <RazonSocialComprador>CLIENTE TEST SA</RazonSocialComprador>
    </Comprador>
    <Totales>
      <MontoTotal>500.00</MontoTotal>
    </Totales>
  </Encabezado>
  <DetallesItems>
    <Item>
      <NumeroLinea>1</NumeroLinea>
      <IndicadorFacturacion>1</IndicadorFacturacion>
      <NombreItem>Item</NombreItem>
      <IndicadorBienoServicio>1</IndicadorBienoServicio>
      <CantidadItem>1</CantidadItem>
      <PrecioUnitarioItem>500.00</PrecioUnitarioItem>
      <MontoItem>500.00</MontoItem>
    </Item>
  </DetallesItems>
  <FechaHoraFirma>23-05-2026 10:30:00</FechaHoraFirma>
  <Firma>placeholder</Firma>
</ECF>"""
        path = _write_xml(temp_dir, "valid_31.xml", xml)
        result = ecf_parser.process(path)
        assert result.success
        assert result.warnings == []

    def test_valid_ecf_43_passes_xsd(self, temp_dir):
        xml = """<?xml version="1.0" encoding="utf-8"?>
<ECF xmlns="http://www.dgii.gov.do/ecf/v1">
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc>
      <TipoeCF>43</TipoeCF>
      <eNCF>E430000000001</eNCF>
      <FechaVencimientoSecuencia>31-12-2026</FechaVencimientoSecuencia>
    </IdDoc>
    <Emisor>
      <RNCEmisor>131111111</RNCEmisor>
      <RazonSocialEmisor>EMPRESA TEST SRL</RazonSocialEmisor>
      <DireccionEmisor>Direccion test</DireccionEmisor>
      <FechaEmision>23-05-2026</FechaEmision>
    </Emisor>
    <Totales>
      <MontoTotal>500.00</MontoTotal>
      <MontoPeriodo>500.00</MontoPeriodo>
      <SaldoAnterior>0.00</SaldoAnterior>
      <MontoAvancePago>0.00</MontoAvancePago>
      <ValorPagar>500.00</ValorPagar>
    </Totales>
  </Encabezado>
  <DetallesItems>
    <Item>
      <NumeroLinea>1</NumeroLinea>
      <IndicadorFacturacion>1</IndicadorFacturacion>
      <NombreItem>Item</NombreItem>
      <IndicadorBienoServicio>1</IndicadorBienoServicio>
      <CantidadItem>1</CantidadItem>
      <PrecioUnitarioItem>500.00</PrecioUnitarioItem>
      <MontoItem>500.00</MontoItem>
    </Item>
  </DetallesItems>
  <FechaHoraFirma>23-05-2026 10:30:00</FechaHoraFirma>
  <Firma>placeholder</Firma>
</ECF>"""
        path = _write_xml(temp_dir, "valid_43.xml", xml)
        result = ecf_parser.process(path)
        assert result.success
        assert result.warnings == []

    def test_missing_required_field_produces_warning(self, temp_dir):
        xml = """<?xml version="1.0" encoding="utf-8"?>
<ECF xmlns="http://www.dgii.gov.do/ecf/v1">
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc>
      <TipoeCF>31</TipoeCF>
      <eNCF>E319999999991</eNCF>
      <FechaVencimientoSecuencia>2026-12-31</FechaVencimientoSecuencia>
      <TipoPago>1</TipoPago>
    </IdDoc>
    <Emisor>
      <RNCEmisor>131111111</RNCEmisor>
      <RazonSocialEmisor>EMPRESA TEST</RazonSocialEmisor>
      <DireccionEmisor>Direccion test</DireccionEmisor>
      <FechaEmision>2026-05-23</FechaEmision>
    </Emisor>
    <Totales>
      <MontoTotal>500.00</MontoTotal>
      <MontoPeriodo>500.00</MontoPeriodo>
      <SaldoAnterior>0.00</SaldoAnterior>
      <MontoAvancePago>0.00</MontoAvancePago>
      <ValorPagar>500.00</ValorPagar>
    </Totales>
  </Encabezado>
  <DetallesItems>
    <Item>
      <NumeroLinea>1</NumeroLinea>
      <IndicadorFacturacion>1</IndicadorFacturacion>
      <NombreItem>Item</NombreItem>
      <IndicadorBienoServicio>1</IndicadorBienoServicio>
      <CantidadItem>1</CantidadItem>
      <PrecioUnitarioItem>500.00</PrecioUnitarioItem>
      <MontoItem>500.00</MontoItem>
    </Item>
  </DetallesItems>
  <FechaHoraFirma>2026-05-23T10:30:00</FechaHoraFirma>
</ECF>"""
        path = _write_xml(temp_dir, "missing_comprador.xml", xml)
        result = ecf_parser.process(path)
        assert result.success
        assert len(result.warnings) > 0
        assert any("Comprador" in w for w in result.warnings)

    def test_type_31_without_required_itbis_warns(self, temp_dir):
        xml = """<?xml version="1.0" encoding="utf-8"?>
<ECF xmlns="http://www.dgii.gov.do/ecf/v1">
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc>
      <TipoeCF>31</TipoeCF>
      <eNCF>E319999999990</eNCF>
      <FechaVencimientoSecuencia>2026-12-31</FechaVencimientoSecuencia>
      <TipoPago>1</TipoPago>
    </IdDoc>
    <Emisor>
      <RNCEmisor>131111111</RNCEmisor>
      <RazonSocialEmisor>EMPRESA TEST</RazonSocialEmisor>
      <DireccionEmisor>Direccion test</DireccionEmisor>
      <FechaEmision>2026-05-23</FechaEmision>
    </Emisor>
    <Comprador>
      <RNCComprador>132222222</RNCComprador>
      <RazonSocialComprador>CLIENTE TEST</RazonSocialComprador>
    </Comprador>
    <Totales>
      <MontoTotal>1000.00</MontoTotal>
      <MontoPeriodo>1000.00</MontoPeriodo>
      <SaldoAnterior>0.00</SaldoAnterior>
      <MontoAvancePago>0.00</MontoAvancePago>
      <ValorPagar>1000.00</ValorPagar>
    </Totales>
  </Encabezado>
  <DetallesItems>
    <Item>
      <NumeroLinea>1</NumeroLinea>
      <IndicadorFacturacion>1</IndicadorFacturacion>
      <NombreItem>Item</NombreItem>
      <IndicadorBienoServicio>1</IndicadorBienoServicio>
      <CantidadItem>1</CantidadItem>
      <PrecioUnitarioItem>1000.00</PrecioUnitarioItem>
      <MontoItem>1000.00</MontoItem>
    </Item>
  </DetallesItems>
  <FechaHoraFirma>2026-05-23T10:30:00</FechaHoraFirma>
</ECF>"""
        path = _write_xml(temp_dir, "missing_itbis_detail.xml", xml)
        result = ecf_parser.process(path)
        assert result.success
        assert len(result.warnings) > 0

    def test_xsd_validation_does_not_block_parsing(self, temp_dir):
        path = _write_xml(temp_dir, "valid_31.xml", ECF_31_XML)
        result = ecf_parser.process(path)
        assert result.success
        assert result.data["vendor_name"] == "EMPRESA EJEMPLO SRL"
        assert result.data["total_amount"] == 1176.00

    def test_etiqueta_invalida_warns_but_parses(self, temp_dir):
        xml = ECF_31_XML.replace(
            "<MontoTotal>1176.00</MontoTotal>",
            "<MontoTotal>1176.00</MontoTotal><CampoInvalido>xyz</CampoInvalido>",
        )
        path = _write_xml(temp_dir, "invalid_tag.xml", xml)
        result = ecf_parser.process(path)
        assert result.success
        assert len(result.warnings) > 0
        assert "CampoInvalido" in result.warnings[0] or any("CampoInvalido" in w for w in result.warnings)

    def test_valid_ecf_34_xsd(self, temp_dir):
        xml = """<?xml version="1.0" encoding="utf-8"?>
<ECF xmlns="http://www.dgii.gov.do/ecf/v1">
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc>
      <TipoeCF>34</TipoeCF>
      <eNCF>E340000000001</eNCF>
      <IndicadorNotaCredito>1</IndicadorNotaCredito>
      <IndicadorMontoGravado>1</IndicadorMontoGravado>
      <TipoPago>2</TipoPago>
    </IdDoc>
    <Emisor>
      <RNCEmisor>131111111</RNCEmisor>
      <RazonSocialEmisor>EMPRESA TEST SRL</RazonSocialEmisor>
      <DireccionEmisor>Direccion test</DireccionEmisor>
      <FechaEmision>23-05-2026</FechaEmision>
    </Emisor>
    <Comprador>
      <RNCComprador>132222222</RNCComprador>
      <RazonSocialComprador>CLIENTE TEST SA</RazonSocialComprador>
    </Comprador>
    <Totales>
      <MontoGravadoTotal>500.00</MontoGravadoTotal>
      <MontoGravadoI1>500.00</MontoGravadoI1>
      <ITBIS1>18</ITBIS1>
      <TotalITBIS>90.00</TotalITBIS>
      <TotalITBIS1>90.00</TotalITBIS1>
      <MontoTotal>590.00</MontoTotal>
      <ValorPagar>590.00</ValorPagar>
    </Totales>
  </Encabezado>
  <DetallesItems>
    <Item>
      <NumeroLinea>1</NumeroLinea>
      <IndicadorFacturacion>1</IndicadorFacturacion>
      <NombreItem>Item</NombreItem>
      <IndicadorBienoServicio>1</IndicadorBienoServicio>
      <CantidadItem>1</CantidadItem>
      <PrecioUnitarioItem>500.00</PrecioUnitarioItem>
      <MontoItem>500.00</MontoItem>
    </Item>
  </DetallesItems>
  <InformacionReferencia>
    <NCFModificado>E310000000001</NCFModificado>
    <FechaNCFModificado>22-05-2026</FechaNCFModificado>
    <CodigoModificacion>2</CodigoModificacion>
  </InformacionReferencia>
  <FechaHoraFirma>23-05-2026 10:30:00</FechaHoraFirma>
  <Firma>placeholder</Firma>
</ECF>"""
        path = _write_xml(temp_dir, "valid_34.xml", xml)
        result = ecf_parser.process(path)
        assert result.success
        assert result.warnings == []

    def test_all_ecf_types_have_xsd(self, temp_dir):
        for ecf_type in sorted(ECF_TYPES.keys()):
            xml = f"""<?xml version="1.0" encoding="utf-8"?>
<ECF xmlns="http://www.dgii.gov.do/ecf/v1">
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc><TipoeCF>{ecf_type}</TipoeCF><eNCF>E{ecf_type}0000000001</eNCF>
      <FechaVencimientoSecuencia>2026-12-31</FechaVencimientoSecuencia>
      <TipoPago>1</TipoPago></IdDoc>
    <Emisor><RNCEmisor>131111111</RNCEmisor>
      <RazonSocialEmisor>EMPRESA {ecf_type}</RazonSocialEmisor>
      <DireccionEmisor>Direccion {ecf_type}</DireccionEmisor>
      <FechaEmision>2026-05-23</FechaEmision></Emisor>
    <Totales><MontoTotal>100.00</MontoTotal>
      <MontoPeriodo>100.00</MontoPeriodo>
      <SaldoAnterior>0.00</SaldoAnterior>
      <MontoAvancePago>0.00</MontoAvancePago>
      <ValorPagar>100.00</ValorPagar></Totales>
  </Encabezado>
  <DetallesItems>
    <Item><NumeroLinea>1</NumeroLinea>
      <IndicadorFacturacion>1</IndicadorFacturacion>
      <NombreItem>Item</NombreItem>
      <IndicadorBienoServicio>1</IndicadorBienoServicio>
      <CantidadItem>1</CantidadItem>
      <PrecioUnitarioItem>100.00</PrecioUnitarioItem>
      <MontoItem>100.00</MontoItem></Item>
  </DetallesItems>
  <FechaHoraFirma>2026-05-23T10:30:00</FechaHoraFirma>
</ECF>"""
            path = _write_xml(temp_dir, f"xsd_{ecf_type}.xml", xml)
            result = ecf_parser.process(path)
            assert result.success, f"Failed for type {ecf_type}: {result.error}"

    def test_xsd_warnings_in_data(self, temp_dir):
        xml = ECF_31_XML.replace(
            "</Encabezado>",
            "<CampoExtra>valor</CampoExtra></Encabezado>",
        )
        path = _write_xml(temp_dir, "extra_field.xml", xml)
        result = ecf_parser.process(path)
        assert result.success
        assert "xsd_warnings" in result.data
        assert len(result.data["xsd_warnings"]) > 0
