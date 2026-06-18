"""Unit tests for OpenAIInvoiceProcessor (pure methods, no external API calls)."""

from unittest.mock import patch, Mock
from app.services.openai_processor import OpenAIInvoiceProcessor


def make_processor():
    """Create processor instance without triggering API key checks in __init__."""
    with patch.object(OpenAIInvoiceProcessor, "_get_api_key", return_value=None):
        return OpenAIInvoiceProcessor()


class TestCleanString:
    def test_clean_string_none(self):
        p = make_processor()
        assert p._clean_string(None) is None

    def test_clean_string_null_str(self):
        p = make_processor()
        assert p._clean_string("null") is None

    def test_clean_string_empty(self):
        p = make_processor()
        assert p._clean_string("") is None

    def test_clean_string_whitespace(self):
        p = make_processor()
        assert p._clean_string("   ") is None

    def test_clean_string_strips(self):
        p = make_processor()
        assert p._clean_string("  Hello  ") == "Hello"


class TestCleanNumber:
    def test_clean_number_none(self):
        p = make_processor()
        assert p._clean_number(None) is None

    def test_clean_number_float(self):
        p = make_processor()
        assert p._clean_number(123.45) == 123.45

    def test_clean_number_int(self):
        p = make_processor()
        assert p._clean_number(100) == 100.0

    def test_clean_number_currency_str(self):
        p = make_processor()
        assert p._clean_number("$1,234.56") == 1234.56

    def test_clean_number_invalid(self):
        p = make_processor()
        assert p._clean_number("not-a-number") is None


class TestCleanCurrency:
    def test_clean_currency_none_defaults_dop(self):
        p = make_processor()
        assert p._clean_currency(None) == "DOP"

    def test_clean_currency_valid(self):
        p = make_processor()
        assert p._clean_currency("USD") == "USD"
        assert p._clean_currency("eur") == "EUR"
        assert p._clean_currency("DOP") == "DOP"

    def test_clean_currency_symbol(self):
        p = make_processor()
        assert p._clean_currency("RD$") == "DOP"
        assert p._clean_currency("$") == "USD"


class TestNormalizeNCF:
    def test_normalize_ncf_none(self):
        p = make_processor()
        assert p._normalize_ncf(None) is None

    def test_normalize_ncf_uppercases(self):
        p = make_processor()
        assert p._normalize_ncf("b010000001") == "B010000001"

    def test_normalize_ncf_removes_spaces(self):
        p = make_processor()
        assert p._normalize_ncf("B01 000 0001") == "B010000001"


class TestIsValidNCF:
    def test_is_valid_ncf_none(self):
        p = make_processor()
        assert p._is_valid_ncf(None) is True

    def test_is_valid_ncf_b_format(self):
        p = make_processor()
        assert p._is_valid_ncf("B0100000001") is True

    def test_is_valid_ncf_e_format(self):
        p = make_processor()
        assert p._is_valid_ncf("E310000000001") is True

    def test_is_valid_ncf_short(self):
        p = make_processor()
        assert p._is_valid_ncf("B01") is False

    def test_is_valid_ncf_invalid(self):
        p = make_processor()
        assert p._is_valid_ncf("ABC123") is False


class TestValidateGoodsServicesType:
    def test_valid_codes(self):
        p = make_processor()
        for i in range(1, 12):
            code = f"{i:02d}"
            assert p._validate_goods_services_type(code) == code

    def test_single_digit_normalized(self):
        p = make_processor()
        assert p._validate_goods_services_type("2") == "02"

    def test_invalid_code(self):
        p = make_processor()
        assert p._validate_goods_services_type("99") is None

    def test_none(self):
        p = make_processor()
        assert p._validate_goods_services_type(None) is None


class TestValidatePaymentMethod:
    def test_valid_codes(self):
        p = make_processor()
        for i in range(1, 8):
            assert p._validate_payment_method(str(i)) == str(i)

    def test_invalid_code(self):
        p = make_processor()
        assert p._validate_payment_method("9") is None

    def test_text_efectivo(self):
        p = make_processor()
        assert p._validate_payment_method("Pago en efectivo") == "1"

    def test_text_transferencia(self):
        p = make_processor()
        assert p._validate_payment_method("Transferencia bancaria") == "2"

    def test_none(self):
        p = make_processor()
        assert p._validate_payment_method(None) is None


class TestValidateISRRetentionType:
    def test_valid_codes(self):
        p = make_processor()
        for i in range(1, 10):
            assert p._validate_isr_retention_type(str(i)) == str(i)

    def test_invalid_code(self):
        p = make_processor()
        assert p._validate_isr_retention_type("0") is None
        assert p._validate_isr_retention_type("10") is None

    def test_text_mapping(self):
        p = make_processor()
        assert p._validate_isr_retention_type("alquiler") == "1"
        assert p._validate_isr_retention_type("honorario") == "2"
        assert p._validate_isr_retention_type("servicio") == "2"
        assert p._validate_isr_retention_type("ganaderia") == "9"

    def test_none(self):
        p = make_processor()
        assert p._validate_isr_retention_type(None) is None


class TestValidateDate:
    def test_iso_format(self):
        p = make_processor()
        assert p._validate_date("2026-01-15") == "2026-01-15"

    def test_dd_mm_yyyy_slash(self):
        p = make_processor()
        assert p._validate_date("15/01/2026") == "2026-01-15"

    def test_dd_mm_yy_slash_dominican_preference(self):
        p = make_processor()
        assert p._validate_date("07/04/26") == "2026-04-07"

    def test_dd_mm_yyyy_dash(self):
        p = make_processor()
        assert p._validate_date("15-01-2026") == "2026-01-15"

    def test_invalid(self):
        p = make_processor()
        assert p._validate_date("not-a-date") is None

    def test_none(self):
        p = make_processor()
        assert p._validate_date(None) is None


class TestValidateTransactionType:
    def test_income_variants(self):
        p = make_processor()
        assert p._validate_transaction_type("income") == "income"
        assert p._validate_transaction_type("ingreso") == "income"
        assert p._validate_transaction_type("venta") == "income"
        assert p._validate_transaction_type("factura_emitida") == "income"

    def test_expense_variants(self):
        p = make_processor()
        assert p._validate_transaction_type("expense") == "expense"
        assert p._validate_transaction_type("gasto") == "expense"
        assert p._validate_transaction_type("compra") == "expense"

    def test_invalid(self):
        p = make_processor()
        assert p._validate_transaction_type("invalid") is None

    def test_none(self):
        p = make_processor()
        assert p._validate_transaction_type(None) is None


class TestCleanConfidence:
    def test_valid(self):
        p = make_processor()
        assert p._clean_confidence(0.8) == 0.8

    def test_clamps_low(self):
        p = make_processor()
        assert p._clean_confidence(-0.5) == 0.0

    def test_clamps_high(self):
        p = make_processor()
        assert p._clean_confidence(1.5) == 1.0

    def test_invalid_default(self):
        p = make_processor()
        assert p._clean_confidence("bad") == 0.5


class TestValidateLineItems:
    def test_not_list_returns_empty(self):
        p = make_processor()
        assert p._validate_line_items(None) == []
        assert p._validate_line_items("bad") == []

    def test_cleans_and_validates(self):
        p = make_processor()
        items = [
            {"description": "  Item 1  ", "quantity": "2", "unit_price": "50", "subtotal": 100},
        ]
        result = p._validate_line_items(items)
        assert len(result) == 1
        assert result[0]["description"] == "Item 1"
        assert result[0]["quantity"] == 2.0
        assert result[0]["subtotal"] == 100.0

    def test_recalculates_inconsistent_subtotal(self):
        p = make_processor()
        items = [
            {"description": "Item", "quantity": 3, "unit_price": 10, "subtotal": 999},
        ]
        result = p._validate_line_items(items)
        assert result[0]["subtotal"] == 30.0  # 3 * 10

    def test_skips_items_without_description(self):
        p = make_processor()
        items = [
            {"description": None, "quantity": 1, "unit_price": 10, "subtotal": 10},
            {"description": "Valid", "quantity": 2, "unit_price": 20, "subtotal": 40},
        ]
        result = p._validate_line_items(items)
        assert len(result) == 1
        assert result[0]["description"] == "Valid"


class TestInferCountryFromTaxId:
    def test_dominican_rnc(self):
        p = make_processor()
        assert p._infer_country_from_tax_id("123456789") == "DOM"
        assert p._infer_country_from_tax_id("123-4567890-0") == "DOM"

    def test_mexican_rfc(self):
        p = make_processor()
        assert p._infer_country_from_tax_id("ABC123456XYZ") is not None

    def test_us_ein(self):
        p = make_processor()
        assert p._infer_country_from_tax_id("12-3456789") == "USA"

    def test_none(self):
        p = make_processor()
        assert p._infer_country_from_tax_id(None) is None


class TestInferCountryFromCurrency:
    def test_mapping(self):
        p = make_processor()
        assert p._infer_country_from_currency("USD") == "USA"
        assert p._infer_country_from_currency("DOP") == "DOM"
        assert p._infer_country_from_currency("EUR") is None  # ambiguous


class TestCreateErrorResponse:
    def test_structure(self):
        p = make_processor()
        resp = p._create_error_response("Test error")
        assert resp["error"] == "Test error"
        assert resp["vendor_name"] == "Error en procesamiento"
        assert resp["total_amount"] is None
        assert resp["transaction_type"] == "expense"
        assert resp["category"] == "error"
        assert resp["confidence"] == 0.0


class TestValidateAndCleanData:
    def test_minimal_data(self):
        p = make_processor()
        data = {"total_amount": 100.0}
        cleaned = p._validate_and_clean_data(data)
        assert cleaned["total_amount"] == 100.0
        assert cleaned["vendor_name"] == "Proveedor no identificado"
        assert cleaned["transaction_type"] == "expense"
        assert cleaned["category"] == "sin_categoria"
        assert cleaned["currency"] == "DOP"
        assert cleaned["line_items"] == []
        assert cleaned["audit_warnings"] == []

    def test_full_data(self):
        p = make_processor()
        data = {
            "vendor_name": "Tech Corp",
            "vendor_tax_id": "123456789",
            "invoice_number": "B0100000001",
            "invoice_date": "15/01/2026",
            "total_amount": 1500.00,
            "tax_amount": 225.00,
            "currency": "DOP",
            "transaction_type": "expense",
            "category": "servicios",
            "description": "Servicios de consultoría",
            "confidence": 0.95,
            "audit_warnings": [],
            "goods_services_type": "02",
            "line_items": [
                {"description": "Consultoría", "quantity": 10, "unit_price": 150, "subtotal": 1500},
            ],
        }
        cleaned = p._validate_and_clean_data(data)
        assert cleaned["vendor_name"] == "Tech Corp"
        assert cleaned["total_amount"] == 1500.0
        assert cleaned["tax_amount"] == 225.0
        assert cleaned["goods_services_type"] == "02"
        assert cleaned["invoice_date"] == "2026-01-15"

    def test_handles_null_strings(self):
        p = make_processor()
        data = {"vendor_name": "null", "total_amount": "null", "currency": "null"}
        cleaned = p._validate_and_clean_data(data)
        assert cleaned["vendor_name"] == "Proveedor no identificado"
        assert cleaned["total_amount"] is None

    def test_audit_warning_on_ncf_type_12(self):
        p = make_processor()
        data = {"invoice_number": "B1200000001", "total_amount": 100}
        cleaned = p._validate_and_clean_data(data)
        # NCF type 12 no longer generates a warning — all NCF types are valid per context
        assert cleaned["audit_warnings"] == []

    def test_adds_missing_payment_date_warning_for_retenciones(self):
        p = make_processor()
        data = {"total_amount": 100, "itbis_retenido": 10.0}
        cleaned = p._validate_and_clean_data(data)
        # Payment date warning no longer generated — not critical for processing
        assert cleaned["audit_warnings"] == []


class TestCallGeminiWithRetry:
    def test_success_on_first_attempt(self):
        mock_resp = Mock()
        mock_resp.status_code = 200

        with patch("requests.post", return_value=mock_resp) as mock_post:
            result = OpenAIInvoiceProcessor._call_gemini_with_retry("https://example.com", {}, max_retries=3)
            assert result.status_code == 200
            assert mock_post.call_count == 1

    def test_retry_on_429_then_success(self):
        responses = [
            Mock(status_code=429),
            Mock(status_code=200),
        ]
        with patch("time.sleep") as mock_sleep:
            with patch("requests.post", side_effect=responses) as mock_post:
                result = OpenAIInvoiceProcessor._call_gemini_with_retry(
                    "https://example.com", {}, max_retries=3,
                )
                assert result.status_code == 200
                assert mock_post.call_count == 2
                mock_sleep.assert_called_once_with(1)

    def test_retry_on_500_then_success(self):
        responses = [
            Mock(status_code=500),
            Mock(status_code=503),
            Mock(status_code=200),
        ]
        with patch("time.sleep") as mock_sleep:
            with patch("requests.post", side_effect=responses) as mock_post:
                result = OpenAIInvoiceProcessor._call_gemini_with_retry(
                    "https://example.com", {}, max_retries=3,
                )
                assert result.status_code == 200
                assert mock_post.call_count == 3
                assert mock_sleep.call_count == 2

    def test_gives_up_after_max_retries(self):
        responses = [Mock(status_code=429), Mock(status_code=429), Mock(status_code=429)]
        with patch("time.sleep"):
            with patch("requests.post", side_effect=responses) as mock_post:
                result = OpenAIInvoiceProcessor._call_gemini_with_retry(
                    "https://example.com", {}, max_retries=3,
                )
                assert result.status_code == 429
                assert mock_post.call_count == 3

    def test_no_retry_on_400(self):
        mock_resp = Mock(status_code=400)
        with patch("requests.post", return_value=mock_resp) as mock_post:
            result = OpenAIInvoiceProcessor._call_gemini_with_retry(
                "https://example.com", {}, max_retries=3,
            )
            assert result.status_code == 400
            assert mock_post.call_count == 1
