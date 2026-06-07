"""Tests for pipeline auto-detection of e-CF modificatory documents (33/34).

Credit and debit notes are now unified into the Invoice model.
This tests the pipeline routing that detects them and applies
modificatory-specific fields instead of creating a separate object.
"""

import os

from app.database import SessionLocal
from app.models import Invoice
from app.services.invoice_processing_service import InvoiceProcessingService
from app.services.pipeline.ecf_parser import ECFParser


SAMPLES_DIR = os.path.join(os.path.dirname(__file__), "samples")
_NEXT_NCF = 9001


def _unique_ncf():
    global _NEXT_NCF
    ncf = f"E31{_NEXT_NCF:08d}"
    _NEXT_NCF += 1
    return ncf


def _ensure_invoice(db, test_tenant, test_org, ncf=None):
    if ncf is None:
        ncf = _unique_ncf()
    inv = Invoice(
        tenant_id=test_tenant.id,
        organization_id=test_org.id,
        invoice_number=ncf,
        vendor_name="ALTICE DOMINICANA SA",
        vendor_tax_id="130907579",
        total_amount=1000.00,
        tax_amount=180.00,
        currency="DOP",
        transaction_type="expense",
        status="verified",
        processed=True,
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return inv


# ── _is_modificatory_pipeline_result ────────────────────────────────────────


class TestIsModificatory:
    def test_ecf32_is_not_modificatory(self):
        assert InvoiceProcessingService._is_modificatory_pipeline_result({"ecf_type": "32"}) is False

    def test_ecf33_is_debit_note(self):
        assert InvoiceProcessingService._is_modificatory_pipeline_result({"ecf_type": "33"}) is True

    def test_ecf34_is_credit_note(self):
        assert InvoiceProcessingService._is_modificatory_pipeline_result({"ecf_type": "34"}) is True

    def test_ecf31_is_not_modificatory(self):
        assert InvoiceProcessingService._is_modificatory_pipeline_result({"ecf_type": "31"}) is False

    def test_no_ecf_type_is_not_modificatory(self):
        assert InvoiceProcessingService._is_modificatory_pipeline_result({}) is False

    def test_is_credit_note_flag(self):
        assert InvoiceProcessingService._is_modificatory_pipeline_result({"is_credit_note": True}) is True
        assert InvoiceProcessingService._is_modificatory_pipeline_result({"is_credit_note": False}) is False

    def test_ncf_prefix_b03_is_debit_note(self):
        assert InvoiceProcessingService._is_modificatory_pipeline_result({"invoice_number": "B0300000001"}) is True

    def test_ncf_prefix_b04_is_credit_note(self):
        assert InvoiceProcessingService._is_modificatory_pipeline_result({"invoice_number": "B0400000001"}) is True

    def test_ncf_prefix_e33_is_debit_note(self):
        assert InvoiceProcessingService._is_modificatory_pipeline_result({"invoice_number": "E330000000001"}) is True

    def test_ncf_prefix_e34_is_credit_note(self):
        assert InvoiceProcessingService._is_modificatory_pipeline_result({"invoice_number": "E340000000001"}) is True

    def test_ncf_prefix_e32_is_not_modificatory(self):
        assert InvoiceProcessingService._is_modificatory_pipeline_result({"invoice_number": "E320000000001"}) is False

    def test_ncf_prefix_e31_is_not_modificatory(self):
        assert InvoiceProcessingService._is_modificatory_pipeline_result({"invoice_number": "E310000000001"}) is False

    def test_ncf_prefix_b01_is_not_modificatory(self):
        assert InvoiceProcessingService._is_modificatory_pipeline_result({"invoice_number": "B01000000001"}) is False

    def test_ncf_prefix_b02_is_not_modificatory(self):
        assert InvoiceProcessingService._is_modificatory_pipeline_result({"invoice_number": "B02000000001"}) is False


# ── ECFParser integration — modificatory detection ──────────────────────────


class TestECFParserModificatory:
    def test_ecf32_parses_with_reference_info(self):
        path = os.path.join(SAMPLES_DIR, "ecf32_credit_note.xml")
        result = ECFParser().process(path)
        assert result.success
        assert result.data["ecf_type"] == "32"
        assert result.data["invoice_number"] == "E320000000001"
        assert result.data["ncf_modified"] == "E310000000001"
        assert result.data["motivo_modificacion"] is not None
        assert InvoiceProcessingService._is_modificatory_pipeline_result(result.data) is False

    def test_ecf34_credit_note_has_indicator(self):
        path = os.path.join(SAMPLES_DIR, "ecf34_credit_note.xml")
        result = ECFParser().process(path)
        assert result.success
        assert result.data["ecf_type"] == "34"
        assert result.data["indicador_nota_credito"] == "1"
        assert result.data["ncf_modified"] == "E310000000001"
        assert float(result.data["total_amount"]) < 0
        assert InvoiceProcessingService._is_modificatory_pipeline_result(result.data) is True

    def test_ecf31_regular_invoice_is_not_modificatory(self):
        path = os.path.join(SAMPLES_DIR, "ecf31_regular_invoice.xml")
        result = ECFParser().process(path)
        assert result.success
        assert result.data["ecf_type"] == "31"
        assert result.data.get("indicador_nota_credito") is None
        assert result.data.get("ncf_modified") is None
        assert InvoiceProcessingService._is_modificatory_pipeline_result(result.data) is False


# ── _apply_modificatory_data ────────────────────────────────────────────────


def _make_invoice(db, test_tenant, test_org, **kw):
    inv = Invoice(
        tenant_id=test_tenant.id,
        organization_id=test_org.id,
        file_type="xml",
        processed=False,
        **kw,
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return inv


def _make_uncommitted_invoice(db, test_tenant, test_org, **kw):
    """Create an Invoice but don't commit — used when _apply_modificatory_data will fill it."""
    inv = Invoice(
        tenant_id=test_tenant.id,
        organization_id=test_org.id,
        file_type="xml",
        processed=False,
        **kw,
    )
    db.add(inv)
    db.flush()
    return inv


class TestApplyModificatoryData:
    def _apply_base_fields(self, inv, data):
        inv.total_amount = data.get("total_amount")
        inv.tax_amount = data.get("tax_amount", 0)
        inv.currency = data.get("currency", "DOP")
        inv.vendor_name = data.get("vendor_name")
        inv.vendor_tax_id = data.get("vendor_tax_id")
        inv.invoice_number = data.get("invoice_number")
        inv.transaction_type = "expense"

    def test_applies_modificatory_data_verified_when_parent_found(self, test_tenant, test_org):
        db = SessionLocal()
        try:
            parent = _ensure_invoice(db, test_tenant, test_org)
            inv = _make_uncommitted_invoice(db, test_tenant, test_org)
            data = {
                "ecf_type": "34",
                "invoice_number": _unique_ncf(),
                "ncf_modified": parent.invoice_number,
                "vendor_name": "ALTICE DOMINICANA SA",
                "vendor_tax_id": "130907579",
                "total_amount": -472.00,
                "tax_amount": -72.00,
                "currency": "DOP",
            }
            self._apply_base_fields(inv, data)
            InvoiceProcessingService._apply_modificatory_data(db, inv, data, test_tenant.id, test_org.id)
            db.commit()
            db.refresh(inv)
            assert inv.is_modificatory is True
            assert inv.parent_invoice_id == parent.id
            assert inv.total_amount == -472.00
            assert inv.status == "verified"
        finally:
            db.close()

    def test_applies_modificatory_data_pending_when_parent_missing(self, test_tenant, test_org):
        db = SessionLocal()
        try:
            inv = _make_uncommitted_invoice(db, test_tenant, test_org)
            data = {
                "ecf_type": "34",
                "indicador_nota_credito": "1",
                "invoice_number": _unique_ncf(),
                "ncf_modified": "E319999999999",
                "vendor_name": "SOME VENDOR",
                "vendor_tax_id": "999999999",
                "total_amount": -1176.00,
                "currency": "DOP",
            }
            self._apply_base_fields(inv, data)
            InvoiceProcessingService._apply_modificatory_data(db, inv, data, test_tenant.id, test_org.id)
            db.commit()
            db.refresh(inv)
            assert inv.status == "pending_review"
            assert inv.parent_invoice_id is None
            assert inv.modified_ncf == "E319999999999"
        finally:
            db.close()

    def test_applies_modificatory_data_preserves_amount_sign(self, test_tenant, test_org):
        db = SessionLocal()
        try:
            inv = _make_uncommitted_invoice(db, test_tenant, test_org)
            data = {
                "ecf_type": "34",
                "invoice_number": _unique_ncf(),
                "total_amount": -500.00,
                "currency": "DOP",
            }
            self._apply_base_fields(inv, data)
            InvoiceProcessingService._apply_modificatory_data(db, inv, data, test_tenant.id, test_org.id)
            db.commit()
            db.refresh(inv)
            assert inv.total_amount == -500.00
            assert inv.is_modificatory is True
        finally:
            db.close()

    def test_parent_voided_when_reason_is_01(self, test_tenant, test_org):
        db = SessionLocal()
        try:
            parent = _ensure_invoice(db, test_tenant, test_org)
            assert parent.status == "verified"
            inv = _make_invoice(db, test_tenant, test_org)
            data = {
                "ecf_type": "34",
                "invoice_number": _unique_ncf(),
                "ncf_modified": parent.invoice_number,
                "ncf_modification_type": "1",
                "vendor_name": "ALTICE DOMINICANA SA",
                "vendor_tax_id": "130907579",
                "total_amount": -1000.00,
                "currency": "DOP",
            }
            self._apply_base_fields(inv, data)
            InvoiceProcessingService._apply_modificatory_data(db, inv, data, test_tenant.id, test_org.id)
            # flush parent & inv separately to avoid mixed UUID sort
            db.flush()
            db.refresh(parent)
            db.refresh(inv)
            assert inv.modification_reason == "01"
            assert parent.status == "voided"
            assert parent.cancelled_at is not None
            assert parent.cancellation_type == "01"
        finally:
            db.close()

    def test_creates_pending_review_with_suggestion_when_non_xml_parent_found(self, test_tenant, test_org):
        db = SessionLocal()
        try:
            parent = _ensure_invoice(db, test_tenant, test_org)
            assert parent.status == "verified"
            inv = _make_invoice(db, test_tenant, test_org)
            data = {
                "ecf_type": "34",
                "source_type": "image_ocr",
                "invoice_number": _unique_ncf(),
                "ncf_modified": parent.invoice_number,
                "vendor_name": "ALTICE DOMINICANA SA",
                "vendor_tax_id": "130907579",
                "total_amount": -472.00,
                "tax_amount": -72.00,
                "currency": "DOP",
            }
            self._apply_base_fields(inv, data)
            InvoiceProcessingService._apply_modificatory_data(db, inv, data, test_tenant.id, test_org.id)
            db.commit()
            db.refresh(parent)
            db.refresh(inv)
            assert inv.status == "pending_review"
            assert inv.parent_invoice_id == parent.id
            assert parent.status == "verified"
        finally:
            db.close()


# ── Integration: ECFParser → Invoice modificatory ───────────────────────────


class TestFullPipeline:
    def _apply_result_to_invoice(self, inv, data):
        inv.total_amount = data.get("total_amount")
        inv.tax_amount = data.get("tax_amount", 0)
        inv.currency = data.get("currency", "DOP")
        inv.vendor_name = data.get("vendor_name")
        inv.vendor_tax_id = data.get("vendor_tax_id")
        inv.invoice_number = data.get("invoice_number")
        inv.transaction_type = "expense"

    def test_ecf34_creates_modificatory_verified(self, test_tenant, test_org):
        db = SessionLocal()
        try:
            parent_ncf = _unique_ncf()
            parent = _ensure_invoice(db, test_tenant, test_org, ncf=parent_ncf)
            path = os.path.join(SAMPLES_DIR, "ecf34_credit_note.xml")
            result = ECFParser().process(path)
            assert result.success

            assert InvoiceProcessingService._is_modificatory_pipeline_result(result.data)

            result.data["ncf_modified"] = parent_ncf
            result.data["invoice_number"] = _unique_ncf()

            inv = _make_invoice(db, test_tenant, test_org)
            self._apply_result_to_invoice(inv, result.data)
            InvoiceProcessingService._apply_modificatory_data(
                db, inv, result.data, test_tenant.id, test_org.id,
            )
            db.commit()
            db.refresh(inv)
            assert inv.status == "verified"
            assert inv.parent_invoice_id == parent.id
            assert inv.ecf_type == "34"
            assert inv.is_electronic is True
            assert abs(inv.total_amount) > 0
        finally:
            db.close()

    def test_ecf34_without_parent_creates_pending_review(self, test_tenant, test_org):
        db = SessionLocal()
        try:
            path = os.path.join(SAMPLES_DIR, "ecf34_credit_note.xml")
            result = ECFParser().process(path)
            assert result.success

            result.data["invoice_number"] = _unique_ncf()

            inv = _make_invoice(db, test_tenant, test_org)
            self._apply_result_to_invoice(inv, result.data)
            InvoiceProcessingService._apply_modificatory_data(
                db, inv, result.data, test_tenant.id, test_org.id,
            )
            db.commit()
            db.refresh(inv)
            assert inv.status == "pending_review"
            assert inv.parent_invoice_id is None
            assert inv.modified_ncf == "E310000000001"
        finally:
            db.close()

    def test_ecf31_regular_invoice_not_routed_to_modificatory(self, test_tenant, test_org):
        path = os.path.join(SAMPLES_DIR, "ecf31_regular_invoice.xml")
        result = ECFParser().process(path)
        assert result.success
        assert InvoiceProcessingService._is_modificatory_pipeline_result(result.data) is False

    def test_ecf32_not_routed_to_modificatory(self, test_tenant, test_org):
        path = os.path.join(SAMPLES_DIR, "ecf32_credit_note.xml")
        result = ECFParser().process(path)
        assert result.success
        assert InvoiceProcessingService._is_modificatory_pipeline_result(result.data) is False


class TestAutoVerifySourceType:
    def test_invoice_status_by_source_type(self, test_tenant, test_org):
        db = SessionLocal()
        try:
            from unittest.mock import MagicMock
            import asyncio

            service = InvoiceProcessingService()
            service.orchestrator.process = MagicMock(
                return_value=(
                    True,
                    {
                        "ecf_type": "31",
                        "vendor_name": "ALTICE DOMINICANA SA",
                        "invoice_number": "E3100000001",
                        "total_amount": 100.0,
                    },
                    "image_ocr",
                )
            )

            inv = Invoice(
                tenant_id=test_tenant.id,
                organization_id=test_org.id,
                file_type="image",
                filename="test.png",
                processed=False,
            )
            db.add(inv)
            db.commit()

            loop = asyncio.get_event_loop()
            loop.run_until_complete(
                service.process_invoice_record(db, inv, test_tenant.id, test_org.id, trigger_webhook=False)
            )

            db.refresh(inv)
            assert inv.status == "draft"
            assert inv.is_electronic is True

            inv2 = Invoice(
                tenant_id=test_tenant.id,
                organization_id=test_org.id,
                file_type="xml",
                filename="test.xml",
                processed=False,
            )
            db.add(inv2)
            db.commit()

            service.orchestrator.process = MagicMock(
                return_value=(
                    True,
                    {
                        "ecf_type": "31",
                        "vendor_name": "ALTICE DOMINICANA SA",
                        "invoice_number": "E3100000002",
                        "total_amount": 100.0,
                    },
                    "xml",
                )
            )

            loop.run_until_complete(
                service.process_invoice_record(db, inv2, test_tenant.id, test_org.id, trigger_webhook=False)
            )

            db.refresh(inv2)
            assert inv2.status == "verified"

        finally:
            db.close()
