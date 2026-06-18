import os
import tempfile
import pytest

from app.services.pipeline.classifier import classifier
from app.services.pipeline.base import ProcessingResult
from app.services.pipeline.normalizer import normalizer
from app.services.pipeline.xml_processor import XMLProcessor
from app.services.pipeline.pdf_text_parser import PDFTextParser
from app.services.pipeline.xlsx_processor import XLSXProcessor, REQUIRED_COLUMNS


class TestClassifier:
    def test_classify_xml(self):
        with tempfile.NamedTemporaryFile(suffix=".xml", delete=False) as f:
            f.write(b"<eCF></eCF>")
            f.flush()
            try:
                source, strategy = classifier.classify(f.name)
                assert source == "xml"
                assert strategy == "xml_processor"
            finally:
                os.unlink(f.name)

    def test_classify_xlsx(self):
        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as f:
            f.write(b" PK...")
            f.flush()
            try:
                source, strategy = classifier.classify(f.name)
                assert source == "xlsx"
                assert strategy == "xlsx_processor"
            finally:
                os.unlink(f.name)

    def test_classify_unsupported_raises(self):
        with tempfile.NamedTemporaryFile(suffix=".xyz", delete=False) as f:
            f.write(b"test")
            f.flush()
            try:
                with pytest.raises(ValueError):
                    classifier.classify(f.name)
            finally:
                os.unlink(f.name)


class TestNormalizer:
    def test_normalize_minimal_data(self):
        data = {"total_amount": 100.0, "currency": "DOP"}
        result = normalizer.normalize(data, source_type="xml", confidence=1.0)
        assert result["source_type"] == "xml"
        assert result["total_amount"] == 100.0
        assert result["confidence"] == 1.0

    def test_normalize_cleans_strings(self):
        data = {"vendor_name": "  Test  ", "total_amount": 100}
        result = normalizer.normalize(data, source_type="pdf_text", confidence=0.8)
        assert result["vendor_name"] == "Test"

    def test_normalize_transaction_type_defaults_expense(self):
        data = {"total_amount": 100}
        result = normalizer.normalize(data, source_type="image_ai", confidence=0.5)
        assert result["transaction_type"] == "expense"

    def test_normalize_invalid_currency_defaults_dop(self):
        data = {"total_amount": 100, "currency": "INVALID"}
        result = normalizer.normalize(data, source_type="xlsx", confidence=0.9)
        assert result["currency"] == "DOP"

    def test_normalize_validates_ncf(self):
        data = {"invoice_number": "b010000001", "total_amount": 100}
        result = normalizer.normalize(data, source_type="xml", confidence=1.0)
        assert result["invoice_number"] == "B010000001"

    def test_normalize_date_dominican_preference(self):
        data = {"invoice_date": "07/04/26", "total_amount": 100}
        result = normalizer.normalize(data, source_type="image_ai", confidence=0.8)
        assert result["invoice_date"] == "2026-04-07"

    def test_to_db_dict(self):
        normalized = {
            "vendor_name": "Test",
            "vendor_tax_id": "123456789",
            "invoice_number": "B010000001",
            "invoice_date": "2026-01-01",
            "total_amount": 100.0,
            "currency": "DOP",
            "transaction_type": "expense",
            "category": "test",
            "confidence": 1.0,
            "source_type": "xml",
            "line_items": [],
        }
        db_dict = normalizer.to_db_dict(normalized)
        assert db_dict["vendor_name"] == "Test"
        assert db_dict["source_type"] == "xml"


class TestXMLProcessor:
    def test_can_process_xml(self):
        processor = XMLProcessor()
        assert processor.can_process("test.xml", "xml") is True
        assert processor.can_process("test.pdf", "pdf") is False

    def test_process_invalid_xml_returns_error(self):
        processor = XMLProcessor()
        result = processor.process("nonexistent.xml")
        assert result.success is False
        assert result.error is not None


class TestPDFTextParser:
    def test_can_process_pdf(self, tmp_path):
        pdf_path = tmp_path / "test.pdf"
        pdf_path.write_bytes(b"%PDF-1.4")
        parser = PDFTextParser()
        assert parser.can_process(str(pdf_path), "pdf") is True

    def test_extract_fields_with_patterns(self):
        parser = PDFTextParser()
        text = """
        RNC: 123-456789-0
        NCF: B0100000001
        Fecha: 01/01/2026
        Total: $1,000.00
        ITBIS: 150.00
        """
        data = parser._extract_fields(text)
        assert data.get("vendor_tax_id") is not None
        assert data.get("invoice_number") is not None
        assert data.get("total_amount") is not None

    def test_calculate_confidence_full_match(self):
        parser = PDFTextParser()
        data = {
            "vendor_tax_id": "123456789",
            "invoice_number": "B010000001",
            "total_amount": 1000.0,
        }
        confidence = parser._calculate_confidence(data)
        assert confidence >= 0.7

    def test_calculate_confidence_partial(self):
        parser = PDFTextParser()
        data = {
            "vendor_tax_id": "123456789",
            "invoice_number": None,
            "total_amount": 1000.0,
        }
        confidence = parser._calculate_confidence(data)
        assert confidence < 0.7


class TestProcessingResult:
    def test_processing_result_defaults(self):
        result = ProcessingResult(success=True)
        assert result.success is True
        assert result.confidence == 0.0
        assert result.warnings == []


class TestXLSXProcessor:
    def test_required_columns_defined(self):
        assert "★ RNC Proveedor" in REQUIRED_COLUMNS
        assert "★ NCF" in REQUIRED_COLUMNS

    def test_validate_row_rnc_valid(self):
        processor = XLSXProcessor()
        row_data = {
            "★ RNC Proveedor": "501201234",
            "★ NCF": "B0100000001",
            "★ Monto Total": 5000,
        }
        errors = processor._validate_row(row_data, 3)
        assert len(errors) == 0

    def test_validate_row_rnc_invalid(self):
        processor = XLSXProcessor()
        row_data = {
            "★ RNC Proveedor": "INVALID",
            "★ NCF": "B0100000001",
            "★ Monto Total": 5000,
        }
        errors = processor._validate_row(row_data, 3)
        assert len(errors) > 0

    def test_normalize_row(self):
        processor = XLSXProcessor()
        row_data = {
            "★ RNC Proveedor": "501201234",
            "★ Razón Social": "Test SRL",
            "★ NCF": "B0100000001",
            "★ Fecha Factura": "2026-01-01",
            "Fecha Pago": "2026-01-31",
            "★ Monto Total": 5000,
            "ITBIS": 750,
            "Tipo B/S (606)": "02",
            "Forma de Pago": "2",
            "Moneda": "DOP",
            "Tipo Transacción": "expense",
            "Categoría": "servicios",
            "Descripción": "Test",
        }
        normalized = processor._normalize_row(row_data)
        assert normalized["vendor_tax_id"] == "501201234"
        assert normalized["invoice_number"] == "B0100000001"
        assert normalized["total_amount"] == 5000

    def test_parse_date_string(self):
        processor = XLSXProcessor()
        date_str = processor._parse_date("2026-01-15")
        assert date_str == "2026-01-15"

    def test_parse_date_datetime(self):
        from datetime import datetime
        processor = XLSXProcessor()
        dt = datetime(2026, 1, 15)
        date_str = processor._parse_date(dt)
        assert date_str == "2026-01-15"


class TestPipelineIntegration:
    """Test orchestrator and pipeline integration."""

    def test_classifier_routes_xml_to_xml_processor(self):
        with tempfile.NamedTemporaryFile(suffix=".xml", delete=False) as f:
            f.write(b"<eCF></eCF>")
            f.flush()
            try:
                source, strategy = classifier.classify(f.name)
                assert strategy == "xml_processor"
            finally:
                os.unlink(f.name)

    def test_classifier_routes_xlsx_to_xlsx_processor(self):
        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as f:
            f.write(b"PK\x00\x00")
            f.flush()
            try:
                source, strategy = classifier.classify(f.name)
                assert strategy == "xlsx_processor"
            finally:
                os.unlink(f.name)

    def test_classifier_routes_pdf(self, tmp_path):
        """Test PDF routing based on text extraction."""
        # Test small PDF (scanned)
        small_pdf = tmp_path / "small.pdf"
        small_pdf.write_text("%PDF-1.4")  # < 50 chars -> pdf_image
        source1, strategy1 = classifier.classify(str(small_pdf))
        # Small text results in image pipeline
        assert strategy1 == "image_preprocessor"

    def test_classifier_routes_image_to_ocr(self):
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
            f.write(b"\xFF\xD8\xFF JPEG")
            f.flush()
            try:
                source, strategy = classifier.classify(f.name)
                assert strategy == "image_preprocessor"
            finally:
                os.unlink(f.name)

    def test_processing_result_with_data(self):
        result = ProcessingResult(
            success=True,
            data={"vendor_name": "Test"},
            source_type="xml",
            confidence=1.0,
            warnings=[],
        )
        assert result.success is True
        assert result.data["vendor_name"] == "Test"
        assert result.source_type == "xml"

    def test_processing_result_error_case(self):
        result = ProcessingResult(
            success=False,
            error="Test error",
            source_type="pdf",
            confidence=0.0,
        )
        assert result.success is False
        assert result.error == "Test error"


class TestNormalizerEdgeCases:
    """Test edge cases in normalizer."""

    def test_normalize_handles_missing_vendor(self):
        data = {"total_amount": 100}
        result = normalizer.normalize(data, source_type="xml", confidence=1.0)
        assert result["vendor_name"] is not None

    def test_normalize_handles_invalid_ncf(self):
        data = {"invoice_number": "INVALID", "total_amount": 100}
        result = normalizer.normalize(data, source_type="xml", confidence=1.0)
        # Invalid NCF is cleaned (non-alphanumeric removed) but may still have content
        # The important thing is it doesn't crash
        assert "invoice_number" in result

    def test_normalize_handles_invalid_transaction_type(self):
        data = {"transaction_type": "invalid", "total_amount": 100}
        result = normalizer.normalize(data, source_type="xml", confidence=1.0)
        assert result["transaction_type"] == "expense"

    def test_normalize_handles_invalid_goods_services_type(self):
        data = {"goods_services_type": "99", "total_amount": 100}
        result = normalizer.normalize(data, source_type="xml", confidence=1.0)
        assert result["goods_services_type"] is None

    def test_normalize_handles_valid_goods_services_type(self):
        data = {"goods_services_type": "02", "total_amount": 100}
        result = normalizer.normalize(data, source_type="xml", confidence=1.0)
        assert result["goods_services_type"] == "02"

    def test_normalize_handles_payment_method(self):
        data = {"payment_method": "2", "total_amount": 100}
        result = normalizer.normalize(data, source_type="xml", confidence=1.0)
        assert result["payment_method"] == "2"

    def test_normalize_handles_line_items(self):
        data = {
            "total_amount": 100,
            "line_items": [
                {"description": "Item 1", "quantity": 2, "unit_price": 50, "subtotal": 100},
            ],
        }
        result = normalizer.normalize(data, source_type="xml", confidence=1.0)
        assert len(result["line_items"]) == 1


class TestXLSXEdgeCases:
    """Test XLSX processor edge cases."""

    def test_validate_row_missing_rnc(self):
        processor = XLSXProcessor()
        row_data = {
            "★ RNC Proveedor": "",
            "★ NCF": "B0100000001",
            "★ Monto Total": 5000,
        }
        errors = processor._validate_row(row_data, 3)
        assert len(errors) > 0

    def test_validate_row_invalid_ncf(self):
        processor = XLSXProcessor()
        row_data = {
            "★ RNC Proveedor": "501201234",
            "★ NCF": "INVALID",
            "★ Monto Total": 5000,
        }
        errors = processor._validate_row(row_data, 3)
        assert len(errors) > 0

    def test_validate_row_negative_total(self):
        processor = XLSXProcessor()
        row_data = {
            "★ RNC Proveedor": "501201234",
            "★ NCF": "B0100000001",
            "★ Monto Total": -100,
        }
        errors = processor._validate_row(row_data, 3)
        assert len(errors) > 0

    def test_validate_row_invalid_tipo_bs(self):
        processor = XLSXProcessor()
        row_data = {
            "★ RNC Proveedor": "501201234",
            "★ NCF": "B0100000001",
            "★ Monto Total": 5000,
            "Tipo B/S (606)": "99",
        }
        errors = processor._validate_row(row_data, 3)
        assert any("Tipo B/S" in e for e in errors)

    def test_validate_row_invalid_forma_pago(self):
        processor = XLSXProcessor()
        row_data = {
            "★ RNC Proveedor": "501201234",
            "★ NCF": "B0100000001",
            "★ Monto Total": 5000,
            "Forma de Pago": "99",
        }
        errors = processor._validate_row(row_data, 3)
        assert any("Forma pago" in e for e in errors)

    def test_parse_currency_valid(self):
        processor = XLSXProcessor()
        assert processor._parse_currency("USD") == "USD"
        assert processor._parse_currency("EUR") == "EUR"
        assert processor._parse_currency("DOP") == "DOP"

    def test_parse_currency_invalid_defaults_dop(self):
        processor = XLSXProcessor()
        assert processor._parse_currency("INVALID") == "DOP"
        assert processor._parse_currency(None) == "DOP"

    def test_parse_transaction_type_valid(self):
        processor = XLSXProcessor()
        assert processor._parse_transaction_type("income") == "income"
        assert processor._parse_transaction_type("expense") == "expense"

    def test_parse_transaction_type_invalid_defaults_expense(self):
        processor = XLSXProcessor()
        assert processor._parse_transaction_type("INVALID") == "expense"


class TestPDFTextParserEdgeCases:
    """Test PDF text parser edge cases."""

    def test_extract_fields_handles_empty_text(self):
        parser = PDFTextParser()
        data = parser._extract_fields("")
        assert data == {}

    def test_extract_amounts_finds_total(self):
        parser = PDFTextParser()
        text = "Total: $1,500.00"
        data = parser._extract_fields(text)
        assert data.get("total_amount") is not None

    def test_extract_goods_services_type(self):
        parser = PDFTextParser()
        text = "Servicios de consultoría"
        tipo = parser._extract_goods_services_type(text)
        assert tipo == "02"

    def test_extract_payment_method(self):
        parser = PDFTextParser()
        text = "Pago por transferencia"
        method = parser._extract_payment_method(text)
        assert method == "2"


class TestPipelineOrchestrator:
    """Test PipelineOrchestrator pure logic (no external deps)."""

    def test_correct_ocr_chars_O_to_0_then_leading_zero_removed(self):
        from app.services.pipeline_orchestrator import PipelineOrchestrator
        p = PipelineOrchestrator()
        # O between [A-Z] and \d -> 0, then BE lead zero removed
        assert p._correct_ocr_chars("BO123456789") == "B123456789"

    def test_correct_ocr_chars_leading_I_to_1(self):
        from app.services.pipeline_orchestrator import PipelineOrchestrator
        p = PipelineOrchestrator()
        assert p._correct_ocr_chars("I234567") == "1234567"

    def test_correct_ocr_chars_digit_I_to_1(self):
        from app.services.pipeline_orchestrator import PipelineOrchestrator
        p = PipelineOrchestrator()
        # I between digits -> 1
        assert p._correct_ocr_chars("10I5") == "1015"

    def test_correct_ocr_chars_S_to_5_between_digits(self):
        from app.services.pipeline_orchestrator import PipelineOrchestrator
        p = PipelineOrchestrator()
        # S between digits -> 5
        assert p._correct_ocr_chars("10S5") == "1055"

    def test_correct_ocr_chars_empty(self):
        from app.services.pipeline_orchestrator import PipelineOrchestrator
        p = PipelineOrchestrator()
        assert p._correct_ocr_chars("") == ""

    def test_correct_ocr_chars_no_changes(self):
        from app.services.pipeline_orchestrator import PipelineOrchestrator
        p = PipelineOrchestrator()
        assert p._correct_ocr_chars("ABC 123") == "ABC 123"

    def test_text_quality_suspect_good_text(self):
        from app.services.pipeline_orchestrator import PipelineOrchestrator
        p = PipelineOrchestrator()
        assert p._text_quality_suspect("Hello World 123", ["Hello", "World", "123"]) is False

    def test_text_quality_suspect_bad_text(self):
        from app.services.pipeline_orchestrator import PipelineOrchestrator
        p = PipelineOrchestrator()
        # Many special chars -> low alphanumeric ratio
        text = "|||| === *** >>> |||"
        assert p._text_quality_suspect(text, text.split()) is True

    def test_text_quality_suspect_empty(self):
        from app.services.pipeline_orchestrator import PipelineOrchestrator
        p = PipelineOrchestrator()
        assert p._text_quality_suspect("", []) is True

    def test_calculate_field_confidence_all_required(self):
        from app.services.pipeline_orchestrator import PipelineOrchestrator
        p = PipelineOrchestrator()
        data = {"vendor_name": "Test", "invoice_number": "B01000001", "total_amount": 100.0}
        confidence = p._calculate_field_confidence(data, {})
        assert confidence == pytest.approx(1.0 + 0.0, abs=0.01)  # 3/3 = 1.0, no extras

    def test_calculate_field_confidence_two_of_three(self):
        from app.services.pipeline_orchestrator import PipelineOrchestrator
        p = PipelineOrchestrator()
        data = {"vendor_name": "Test", "invoice_number": None, "total_amount": 100.0}
        confidence = p._calculate_field_confidence(data, {})
        assert confidence == pytest.approx(2.0 / 3.0, abs=0.01)

    def test_calculate_field_confidence_with_extras(self):
        from app.services.pipeline_orchestrator import PipelineOrchestrator
        p = PipelineOrchestrator()
        data = {
            "vendor_name": "Test", "invoice_number": "B01000001", "total_amount": 100.0,
            "vendor_tax_id": "123456789", "tax_amount": 18.0, "invoice_date": "2026-01-01",
        }
        confidence = p._calculate_field_confidence(data, {})
        assert confidence == pytest.approx(min(1.0 + 0.1 + 0.05 + 0.05, 1.0), abs=0.01)

    def test_calculate_field_confidence_none_found(self):
        from app.services.pipeline_orchestrator import PipelineOrchestrator
        p = PipelineOrchestrator()
        data = {}
        confidence = p._calculate_field_confidence(data, {})
        assert confidence == 0.0

    def test_combine_confidences_weighted(self):
        from app.services.pipeline_orchestrator import PipelineOrchestrator
        p = PipelineOrchestrator()
        result = p._combine_confidences(0.5, 0.8)
        expected = 0.4 * 0.5 + 0.6 * 0.8
        assert result == pytest.approx(expected, abs=0.001)

    def test_combine_confidences_boundary(self):
        from app.services.pipeline_orchestrator import PipelineOrchestrator
        p = PipelineOrchestrator()
        assert p._combine_confidences(0.0, 0.0) == 0.0
        assert p._combine_confidences(1.0, 1.0) == 1.0

    def test_process_unknown_strategy_returns_error(self):
        from app.services.pipeline_orchestrator import PipelineOrchestrator
        p = PipelineOrchestrator()
        success, data, source = p.process("/nonexistent/file.xyz", "xyz")
        assert success is False
        assert "error" in data

    def test_orchestrator_constants(self):
        from app.services.pipeline_orchestrator import CONFIDENCE_THRESHOLD, LOW_CONFIDENCE_AI_THRESHOLD, AI_FALLBACK_STRATEGIES
        assert CONFIDENCE_THRESHOLD == 0.7
        assert LOW_CONFIDENCE_AI_THRESHOLD == 0.4
        assert "image_ocr" in AI_FALLBACK_STRATEGIES
        assert "pdf_image" in AI_FALLBACK_STRATEGIES


class TestDominicanFiscalValidation:
    def test_validation_utilities(self):
        from app.utils.validation import is_valid_rnc_or_cedula
        # RNC Whitelisted
        assert is_valid_rnc_or_cedula("101581601") is True
        # RNC Valid
        assert is_valid_rnc_or_cedula("101165421") is True
        # RNC Invalid
        assert is_valid_rnc_or_cedula("101165423") is False
        
        # Cédula Valid
        assert is_valid_rnc_or_cedula("00100684786") is True
        # Cédula Invalid
        assert is_valid_rnc_or_cedula("00100684784") is False
        
        # Invalid length
        assert is_valid_rnc_or_cedula("123") is False

    def test_validator_smart_itbis_exempt_and_rates(self):
        from app.services.pipeline.validator import post_extraction_validator
        
        # Regimen especial (E44/B14) with ITBIS > 0 -> should warn
        data = {
            "vendor_tax_id": "101165421",
            "invoice_number": "E440000000001",
            "transaction_type": "expense",
            "total_amount": 1000.0,
            "tax_amount": 180.0,
            "currency": "DOP",
            "vendor_country": "DOM",
        }
        res = post_extraction_validator.validate(data.copy())
        assert any("Regímenes Especiales" in w for w in res["audit_warnings"])

        # Regimen especial (E44/B14) with ITBIS == 0 -> should not warn
        data_ok = data.copy()
        data_ok["tax_amount"] = 0.0
        res_ok = post_extraction_validator.validate(data_ok)
        assert not any("Regímenes Especiales" in w for w in res_ok["audit_warnings"])

        # ITBIS rate too high (>18%)
        data_high = {
            "vendor_tax_id": "101165421",
            "invoice_number": "E310000000001",
            "transaction_type": "expense",
            "total_amount": 1000.0,
            "tax_amount": 300.0,
            "currency": "DOP",
            "vendor_country": "DOM",
        }
        res_high = post_extraction_validator.validate(data_high.copy())
        assert any("mayor al 18%" in w for w in res_high["audit_warnings"])

        # ITBIS matches 18% or 16% standard rates
        data_18 = {
            "vendor_tax_id": "101165421",
            "invoice_number": "E310000000001",
            "transaction_type": "expense",
            "total_amount": 118.0,
            "tax_amount": 18.0,
            "currency": "DOP",
            "vendor_country": "DOM",
        }
        res_18 = post_extraction_validator.validate(data_18.copy())
        assert not any("no coincide con la tasa del 18%" in w for w in res_18["audit_warnings"])

    def test_validator_organization_rnc_match(self):
        from app.services.pipeline.validator import post_extraction_validator
        
        # Expense: buyer RNC doesn't match org RNC
        data = {
            "vendor_tax_id": "101165421",
            "invoice_number": "E310000000001",
            "transaction_type": "expense",
            "total_amount": 118.0,
            "tax_amount": 18.0,
            "currency": "DOP",
            "vendor_country": "DOM",
            "rnc_comprador": "101581601",  # Buyer RNC
        }
        res = post_extraction_validator.validate(data.copy(), org_rnc="101165421") # Org RNC is different
        assert any("no coincide con el RNC de tu organización" in w for w in res["audit_warnings"])

        # Expense: buyer RNC matches org RNC
        res_ok = post_extraction_validator.validate(data.copy(), org_rnc="101581601")
        assert not any("no coincide con el RNC de tu organización" in w for w in res_ok["audit_warnings"])

    def test_validator_modified_ncf_notes(self):
        from app.services.pipeline.validator import post_extraction_validator
        
        # Credit Note (E34) missing ncf_modified
        data = {
            "vendor_tax_id": "101165422",
            "invoice_number": "E340000000001",
            "transaction_type": "expense",
            "total_amount": 118.0,
            "tax_amount": 18.0,
            "currency": "DOP",
            "vendor_country": "DOM",
        }
        res = post_extraction_validator.validate(data)
        assert any("especificar el comprobante original" in w for w in res["audit_warnings"])

    def test_validator_withholdings_informal_and_abroad(self):
        from app.services.pipeline.validator import post_extraction_validator
        
        # Informal Purchase (E41) missing ITBIS / ISR withholdings
        data = {
            "vendor_tax_id": "00100684786",
            "invoice_number": "E410000000001",
            "transaction_type": "expense",
            "total_amount": 1000.0,
            "tax_amount": 0.0,
            "currency": "DOP",
            "vendor_country": "DOM",
        }
        res = post_extraction_validator.validate(data)
        assert any("requieren retención del 100% del ITBIS" in w for w in res["audit_warnings"])
        assert any("requieren la retención del ISR" in w for w in res["audit_warnings"])


if __name__ == "__main__":
    pytest.main([__file__, "-v"])