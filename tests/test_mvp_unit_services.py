import os
from types import SimpleNamespace

from app.services import InvoiceProcessingService, SettingsService, StatisticsService
from app.database import SessionLocal
from app.models import Invoice, Organization


def test_invoice_processing_apply_extracted_data_adds_duplicate_warning():
    class FakeRepo:
        def find_duplicate_processed(self, db, org_id, invoice_number, vendor_name, exclude_invoice_id):
            return SimpleNamespace(id=999)

    service = InvoiceProcessingService(invoice_repo=FakeRepo(), openai_processor=None, webhook_sender=None)
    invoice = Invoice(id=1, organization_id=1, file_type="image", file_path="x", filename="x")

    extracted = {
        "vendor_name": "Proveedor A",
        "invoice_number": "B0100000001",
        "invoice_date": "2026-01-01",
        "total_amount": 123.45,
        "tax_amount": 18.52,
        "currency": "USD",
        "transaction_type": "expense",
        "category": "servicios",
        "description": "Factura test",
        "confidence": 0.9,
        "audit_warnings": ["Falta NCF del proveedor"],
        "line_items": [{"description": "Item", "quantity": 1, "unit_price": 100, "subtotal": 100}],
    }

    service.apply_extracted_data(db=None, invoice=invoice, extracted_data=extracted, org_id=1)

    assert invoice.processed is True
    assert "DUPLICADO" in (invoice.audit_flags or "")
    assert invoice.vendor_name == "Proveedor A"


def test_settings_service_resolution_priority(monkeypatch):
    class FakeRepo:
        def get_user_setting(self, db, user_id, key):
            return SimpleNamespace(value="user-value") if key == "k" else None

        def get_org_setting(self, db, org_id, key):
            return SimpleNamespace(value="org-value") if key == "k" else None

    service = SettingsService(repo=FakeRepo())

    monkeypatch.setenv("ENV_KEY", "env-value")
    value = service.resolve_setting(
        db=None,
        key="k",
        user=SimpleNamespace(id=10),
        org_id=1,
        env_key="ENV_KEY",
        default="default-value",
    )
    assert value == "user-value"

    # without user fallback to org
    value2 = service.resolve_setting(
        db=None,
        key="k",
        user=None,
        org_id=1,
        env_key="ENV_KEY",
        default="default-value",
    )
    assert value2 == "org-value"


def test_statistics_service_returns_superset_contract():
    class FakeCostControl:
        def get_cost_statistics(self, db, org_id=None):
            return {
                "total_tokens": 10,
                "total_cost": 1.23,
                "model_breakdown": [],
            }

    db = SessionLocal()
    inv = None
    try:
        org = db.query(Organization).first()
        if not org:
            org = Organization(name="Stats Org", tax_id="", plan="Free Plan")
            db.add(org)
            db.commit()
            db.refresh(org)

        inv = Invoice(
            filename="stats.csv",
            file_path="uploads/stats.csv",
            file_type="pdf",
            processed=True,
            total_amount=100.0,
            tax_amount=18.0,
            currency="USD",
            transaction_type="expense",
            category="oficina",
            organization_id=org.id,
        )
        db.add(inv)
        db.commit()

        service = StatisticsService(cost_control=FakeCostControl())
        data = service.get_statistics(db, org.id)

        for key in ["queue", "performance", "audit", "costs", "charts", "general", "categories", "monthly_stats", "totals", "openai_costs"]:
            assert key in data
    finally:
        try:
            if inv is not None:
                db.delete(inv)
                db.commit()
        except Exception:
            db.rollback()
        db.close()
