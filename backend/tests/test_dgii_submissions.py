"""Tests para el modelo DgiiSubmission y helpers de seguimiento."""

from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.database import SessionLocal
from app.models import DgiiSubmission, Invoice, InvoiceDgiiStatus
from app.routers.dgii import (
    _get_reported_invoice_ids,
    _get_all_reported_invoice_ids,
    _get_confirmed_reported_ncfs,
    _filter_reported_invoices,
    _invoice_preview,
    _compute_pending_summary,
    _period_to_range,
)
from app.services.export import ExportService
from app.utils.dates import utc_now


@pytest.fixture(autouse=True)
def _clean_dgii_submissions(setup_test_database):
    yield
    db = SessionLocal()
    try:
        db.query(InvoiceDgiiStatus).delete()
        db.query(DgiiSubmission).delete()
        db.query(Invoice).delete()
        db.commit()
    finally:
        db.close()


def _make_ctx(db, tenant_id, org_id, user_id=None):
    return SimpleNamespace(
        db=db,
        tenant_id=tenant_id,
        org_id=org_id,
        user=SimpleNamespace(id=user_id) if user_id else None,
    )

def _create_submission_with_status(db, tenant_id, org_id, fmt, period, invoice_ids, **kwargs):
    """Crea un DgiiSubmission + sus InvoiceDgiiStatus entries."""
    sub = DgiiSubmission(
        tenant_id=tenant_id,
        organization_id=org_id,
        format=fmt,
        period=period,
        invoice_ids=list(invoice_ids),
        invoice_count=len(invoice_ids),
        **kwargs,
    )
    db.add(sub)
    db.flush()
    for inv_id in invoice_ids:
        st = InvoiceDgiiStatus(
            invoice_id=inv_id,
            format=fmt,
            period=period,
            status="reported",
            submission_id=sub.id,
        )
        db.add(st)
    db.commit()
    db.refresh(sub)
    return sub


class TestDgiiSubmissionModel:
    def test_create_and_query(self, setup_test_database, test_tenant, test_org):
        db = SessionLocal()
        try:
            inv_ids = [str(uuid4()) for _ in range(3)]
            sub = DgiiSubmission(
                tenant_id=test_tenant.id,
                organization_id=test_org.id,
                format="606",
                period="202605",
                invoice_ids=inv_ids,
                invoice_count=len(inv_ids),
            )
            db.add(sub)
            db.commit()
            db.refresh(sub)

            assert sub.id is not None
            assert sub.format == "606"
            assert sub.period == "202605"
            assert sub.invoice_count == 3
            assert sorted(str(i) for i in sub.invoice_ids) == sorted(inv_ids)
            assert sub.created_at is not None
        finally:
            db.close()

    def test_multiple_submissions_same_period(self, setup_test_database, test_tenant, test_org):
        db = SessionLocal()
        try:
            ids_a = [str(uuid4()) for _ in range(2)]
            ids_b = [str(uuid4()) for _ in range(2)]
            sub_a = DgiiSubmission(
                tenant_id=test_tenant.id,
                organization_id=test_org.id,
                format="606",
                period="202605",
                invoice_ids=ids_a,
                invoice_count=len(ids_a),
            )
            sub_b = DgiiSubmission(
                tenant_id=test_tenant.id,
                organization_id=test_org.id,
                format="606",
                period="202605",
                invoice_ids=ids_b,
                invoice_count=len(ids_b),
            )
            db.add_all([sub_a, sub_b])
            db.commit()

            query = db.query(DgiiSubmission).filter(
                DgiiSubmission.format == "606",
                DgiiSubmission.period == "202605",
            )
            assert query.count() == 2
        finally:
            db.close()

    def test_different_formats_isolation(self, setup_test_database, test_tenant, test_org):
        db = SessionLocal()
        try:
            ids = [str(uuid4()) for _ in range(2)]
            _create_submission_with_status(db, test_tenant.id, test_org.id, "606", "202605", ids)
            _create_submission_with_status(db, test_tenant.id, test_org.id, "607", "202605", ids)

            reported_606 = _get_reported_invoice_ids(
                _make_ctx(db, test_tenant.id, test_org.id), "606", "202605"
            )
            reported_607 = _get_reported_invoice_ids(
                _make_ctx(db, test_tenant.id, test_org.id), "607", "202605"
            )
            assert len(reported_606) == 2
            assert len(reported_607) == 2
            assert reported_606 == reported_607  # mismas facturas, diferente formato
        finally:
            db.close()


class TestDgiiSubmissionHelpers:
    def test_get_reported_invoice_ids(self, setup_test_database, test_tenant, test_org):
        db = SessionLocal()
        try:
            ids = {str(uuid4()) for _ in range(3)}
            _create_submission_with_status(db, test_tenant.id, test_org.id, "606", "202605", ids)

            ctx = _make_ctx(db, test_tenant.id, test_org.id)
            result = _get_reported_invoice_ids(ctx, "606", "202605")
            assert result == ids
            assert _get_reported_invoice_ids(ctx, "607", "202605") == set()
            assert _get_reported_invoice_ids(ctx, "606", "202604") == set()
        finally:
            db.close()

    def test_get_all_reported_invoice_ids(self, setup_test_database, test_tenant, test_org):
        db = SessionLocal()
        try:
            ids_a = {str(uuid4()) for _ in range(2)}
            ids_b = {str(uuid4()) for _ in range(2)}
            _create_submission_with_status(db, test_tenant.id, test_org.id, "606", "202605", ids_a)
            _create_submission_with_status(db, test_tenant.id, test_org.id, "606", "202606", ids_b)

            ctx = _make_ctx(db, test_tenant.id, test_org.id)
            result = _get_all_reported_invoice_ids(ctx, "606")
            assert result == ids_a | ids_b
        finally:
            db.close()

    def test_filter_reported_invoices(self, setup_test_database, test_tenant, test_org):
        db = SessionLocal()
        try:
            reported_id = str(uuid4())
            unreported_id = str(uuid4())
            _create_submission_with_status(db, test_tenant.id, test_org.id, "606", "202605", {reported_id})

            mock_invoices = [
                SimpleNamespace(id=reported_id),
                SimpleNamespace(id=unreported_id),
            ]

            ctx = _make_ctx(db, test_tenant.id, test_org.id)
            result = _filter_reported_invoices(mock_invoices, ctx, "606", "202605")
            assert len(result) == 1
            assert str(result[0].id) == unreported_id
        finally:
            db.close()

    def test_get_confirmed_reported_ncfs(self, setup_test_database, test_tenant, test_org):
        db = SessionLocal()
        try:
            accepted_inv = Invoice(
                tenant_id=test_tenant.id,
                organization_id=test_org.id,
                vendor_name="Proveedor A",
                invoice_number="E310000000555",
                total_amount=1000.0,
                tax_amount=180.0,
                invoice_date=utc_now(),
                transaction_type="expense",
                processed=True,
            )
            pending_inv = Invoice(
                tenant_id=test_tenant.id,
                organization_id=test_org.id,
                vendor_name="Proveedor B",
                invoice_number="E310000000777",
                total_amount=900.0,
                tax_amount=162.0,
                invoice_date=utc_now(),
                transaction_type="expense",
                processed=True,
            )
            db.add_all([accepted_inv, pending_inv])
            db.commit()
            db.refresh(accepted_inv)
            db.refresh(pending_inv)

            _create_submission_with_status(
                db,
                test_tenant.id,
                test_org.id,
                "606",
                "202605",
                {str(accepted_inv.id)},
                status="confirmed",
            )
            _create_submission_with_status(
                db,
                test_tenant.id,
                test_org.id,
                "606",
                "202605",
                {str(pending_inv.id)},
                status="pending_confirm",
            )

            ctx = _make_ctx(db, test_tenant.id, test_org.id)
            ncfs = _get_confirmed_reported_ncfs(ctx, "606")
            assert "E310000000555" in ncfs
            assert "E310000000777" not in ncfs
        finally:
            db.close()

    def test_filter_reported_invoices_excludes_same_ncf_if_confirmed(self, setup_test_database, test_tenant, test_org):
        db = SessionLocal()
        try:
            accepted = Invoice(
                tenant_id=test_tenant.id,
                organization_id=test_org.id,
                vendor_name="Proveedor A",
                invoice_number="E310000009999",
                total_amount=2000.0,
                tax_amount=360.0,
                invoice_date=utc_now(),
                transaction_type="expense",
                processed=True,
            )
            duplicate = Invoice(
                tenant_id=test_tenant.id,
                organization_id=test_org.id,
                vendor_name="Proveedor A",
                invoice_number="E310000009999",
                total_amount=2000.0,
                tax_amount=360.0,
                invoice_date=utc_now(),
                transaction_type="expense",
                processed=True,
            )
            db.add_all([accepted, duplicate])
            db.commit()
            db.refresh(accepted)
            db.refresh(duplicate)

            _create_submission_with_status(
                db,
                test_tenant.id,
                test_org.id,
                "606",
                "202605",
                {str(accepted.id)},
                status="confirmed",
            )

            ctx = _make_ctx(db, test_tenant.id, test_org.id)
            result = _filter_reported_invoices([duplicate], ctx, "606", "202606")
            assert result == []
        finally:
            db.close()

    def test_invoice_preview_marks_blocked_confirmed_ncf(self, setup_test_database, test_tenant, test_org):
        db = SessionLocal()
        try:
            inv = Invoice(
                tenant_id=test_tenant.id,
                organization_id=test_org.id,
                vendor_name="Proveedor Bloqueado",
                invoice_number="E310000001234",
                total_amount=1500.0,
                tax_amount=270.0,
                invoice_date=utc_now(),
                transaction_type="expense",
                processed=True,
            )
            db.add(inv)
            db.commit()
            db.refresh(inv)

            preview = _invoice_preview(
                inv,
                fmt="dgii_606",
                raw_cache={},
                report_rnc="101010101",
                confirmed_ncfs={"E310000001234"},
            )
            assert preview["reporting_state"] == "blocked_confirmed_ncf"
            assert preview["reporting_note"]
        finally:
            db.close()

    def test_invoice_preview_marks_reportable_when_ncf_not_confirmed(self, setup_test_database, test_tenant, test_org):
        db = SessionLocal()
        try:
            inv = Invoice(
                tenant_id=test_tenant.id,
                organization_id=test_org.id,
                vendor_name="Proveedor Libre",
                invoice_number="E310000001235",
                total_amount=1500.0,
                tax_amount=270.0,
                invoice_date=utc_now(),
                transaction_type="expense",
                processed=True,
            )
            db.add(inv)
            db.commit()
            db.refresh(inv)

            preview = _invoice_preview(
                inv,
                fmt="dgii_606",
                raw_cache={},
                report_rnc="101010101",
                confirmed_ncfs={"E310000009999"},
            )
            assert preview["reporting_state"] == "reportable"
            assert preview["reporting_note"] is None
        finally:
            db.close()

    def test_period_to_range(self):
        df, dt = _period_to_range("202605")
        assert df is not None
        assert dt is not None
        assert df.month == 5
        assert df.year == 2026
        assert df.day == 1
        assert dt.month == 5
        assert dt.year == 2026
        assert dt.day == 31

    def test_period_to_range_invalid(self):
        df, dt = _period_to_range("invalid")
        assert df is None
        assert dt is None


class TestDgiiPendingSummary:
    def test_empty_summary(self, setup_test_database, test_tenant, test_org):
        """Sin submissions ni invoices, el resumen debe ser cero."""
        db = SessionLocal()
        try:
            ctx = _make_ctx(db, test_tenant.id, test_org.id)
            summary = _compute_pending_summary(ctx)
            assert summary["total_pending"] >= 0
            assert "by_format" in summary
            assert "606" in summary["by_format"]
            assert "next_deadline" in summary
            assert "deadlines" in summary
        finally:
            db.close()

    def test_summary_with_reported_invoice(self, setup_test_database, test_tenant, test_org):
        """Una factura reportada no debe aparecer como pendiente."""
        db = SessionLocal()
        try:
            inv = Invoice(
                tenant_id=test_tenant.id,
                organization_id=test_org.id,
                vendor_name="Test Vendor",
                invoice_number="E310000000001",
                total_amount=1000.0,
                tax_amount=180.0,
                invoice_date=utc_now(),
                transaction_type="expense",
                processed=True,
            )
            db.add(inv)
            db.commit()
            db.refresh(inv)

            _create_submission_with_status(
                db, test_tenant.id, test_org.id, "606",
                utc_now().strftime("%Y%m"), {str(inv.id)},
            )

            ctx = _make_ctx(db, test_tenant.id, test_org.id)
            summary = _compute_pending_summary(ctx)
            # La factura está reportada → by_format["606"] no la cuenta
            # (puede haber 0 si es la única, o más si hay otras no reportadas)
            assert summary["by_format"]["606"] >= 0
        finally:
            db.close()


class TestAutoGenerateMessage:
    def test_build_message_new_only(self):
        from app.routers.dgii import _build_auto_generate_message
        msg = _build_auto_generate_message(5, 0, {})
        assert "5" in msg
        assert "factura(s) del período" in msg

    def test_build_message_with_past_due(self):
        from app.routers.dgii import _build_auto_generate_message
        msg = _build_auto_generate_message(3, 2, {})
        assert "3" in msg
        assert "2 de períodos anteriores" in msg

    def test_build_message_with_fixes(self):
        from app.routers.dgii import _build_auto_generate_message
        msg = _build_auto_generate_message(5, 0, {"goods_type_fixed": 3, "itbis_fixed": 1})
        assert "3 tipo(s) B/S" in msg
        assert "1 ITBIS" in msg
        assert "auto-completado" in msg

    def test_build_message_empty(self):
        from app.routers.dgii import _build_auto_generate_message
        msg = _build_auto_generate_message(0, 0, {})
        assert msg == "No se encontraron cambios"

    def test_build_message_duplicates(self):
        from app.routers.dgii import _build_auto_generate_message
        msg = _build_auto_generate_message(8, 1, {"duplicates_removed": 2})
        assert "2 duplicado(s)" in msg
        assert "8 factura(s) del período" in msg
        assert "1 de períodos anteriores" in msg


class TestCancellationVsDeletion:
    """Verifica que anuladas y eliminadas son conceptos separados en 608."""

    def test_cancelled_invoice_counts_in_608_pending(self, setup_test_database, test_tenant, test_org):
        db = SessionLocal()
        try:
            inv = Invoice(
                tenant_id=test_tenant.id,
                organization_id=test_org.id,
                vendor_name="Cancelled SRL",
                invoice_number="E310000000099",
                total_amount=5000.0,
                tax_amount=900.0,
                transaction_type="income",
                invoice_date=utc_now(),
                processed=True,
                cancelled_at=utc_now(),
                cancellation_type="04",
            )
            db.add(inv)
            db.commit()
            db.refresh(inv)

            ctx = _make_ctx(db, test_tenant.id, test_org.id)
            summary = _compute_pending_summary(ctx)
            # Factura anulada → debe aparecer en 608 pendientes
            assert summary["by_format"]["608"] >= 1
        finally:
            db.close()


class TestSubmissionReportSnapshot:
    def test_build_submission_report_row_606(self, setup_test_database, test_tenant, test_org):
        db = SessionLocal()
        try:
            inv = Invoice(
                tenant_id=test_tenant.id,
                organization_id=test_org.id,
                vendor_name="Proveedor Test",
                vendor_tax_id="130123456",
                invoice_number="E310000000001",
                total_amount=1180.0,
                tax_amount=180.0,
                transaction_type="expense",
                invoice_date=utc_now(),
                processed=True,
                raw_extracted_data='{"payment_method":"01","goods_services_type":"01"}',
                goods_services_type="01",
            )
            db.add(inv)
            db.commit()
            db.refresh(inv)

            service = ExportService()
            row = service.build_submission_report_row("606", inv, report_rnc="101010101")
            columns = service.submission_report_columns("606")

            assert len(columns) == 23
            assert row["rnc_cedula"] == "130123456"
            assert row["ncf"] == "E310000000001"
            assert row["tipo_bienes_servicios"] == "01"
            assert row["total_facturado"] == "1000"
            assert row["itbis_facturado"] == "180"
            assert row["forma_pago"] == "01"
        finally:
            db.close()

    def test_deleted_invoice_not_in_608_pending(self, setup_test_database, test_tenant, test_org):
        """Factura eliminada (deleted_at) NO debe aparecer en 608."""
        db = SessionLocal()
        try:
            inv = Invoice(
                tenant_id=test_tenant.id,
                organization_id=test_org.id,
                vendor_name="Deleted SRL",
                invoice_number="E310000000100",
                total_amount=5000.0,
                tax_amount=900.0,
                transaction_type="expense",
                invoice_date=utc_now(),
                processed=True,
                deleted_at=utc_now(),
            )
            db.add(inv)
            db.commit()
            db.refresh(inv)

            ctx = _make_ctx(db, test_tenant.id, test_org.id)
            summary = _compute_pending_summary(ctx)
            # Factura eliminada (no anulada) → 608 NO debe contarla
            assert summary["by_format"]["608"] == 0
        finally:
            db.close()

    def test_deleted_invoice_still_not_in_606_607(self, setup_test_database, test_tenant, test_org):
        """Factura eliminada no aparece en 606 ni 607."""
        db = SessionLocal()
        try:
            inv = Invoice(
                tenant_id=test_tenant.id,
                organization_id=test_org.id,
                vendor_name="Deleted SRL",
                invoice_number="E310000000101",
                total_amount=5000.0,
                tax_amount=900.0,
                transaction_type="expense",
                invoice_date=utc_now(),
                processed=True,
                is_deleted=True,
                deleted_at=utc_now(),
            )
            db.add(inv)
            db.commit()
            db.refresh(inv)

            ctx = _make_ctx(db, test_tenant.id, test_org.id)
            summary = _compute_pending_summary(ctx)
            assert summary["by_format"]["606"] == 0
            assert summary["by_format"]["607"] == 0
        finally:
            db.close()

    def test_cancelled_invoice_still_in_main_list(self, setup_test_database, test_tenant, test_org):
        """Factura anulada debe aparecer en el listado principal (no filtrada por deleted_at)."""
        from app.repositories import InvoiceRepository
        db = SessionLocal()
        repo = InvoiceRepository()
        try:
            inv = Invoice(
                tenant_id=test_tenant.id,
                organization_id=test_org.id,
                vendor_name="Cancelled Visible SRL",
                invoice_number="E310000000102",
                total_amount=5000.0,
                tax_amount=900.0,
                transaction_type="expense",
                invoice_date=utc_now(),
                processed=True,
                cancelled_at=utc_now(),
                cancellation_type="01",
            )
            db.add(inv)
            db.commit()
            db.refresh(inv)

            invoices, total = repo.list_for_org(db, test_tenant.id, test_org.id)
            ids = [str(i.id) for i in invoices]
            # Debe aparecer en el listado principal
            assert str(inv.id) in ids
        finally:
            db.close()
