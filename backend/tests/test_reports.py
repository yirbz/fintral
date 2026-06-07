import pytest
from datetime import datetime
from sqlalchemy.orm import Session
from fastapi.testclient import TestClient

from app.models import Invoice, Tenant, Organization, User
from app.database import SessionLocal
from app.dependencies.tenant import require_tenant, TenantContext


@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def test_reports_endpoints(test_tenant, test_org, test_user, db_session: Session):
    from app.factory import create_app
    app = create_app()

    tenant_id = test_tenant.id
    org_id = test_org.id

    # Create dummy credit invoices in DB: one AP and one AR
    ap_invoice = Invoice(
        tenant_id=tenant_id,
        organization_id=org_id,
        vendor_name="Proveedor de Prueba S.A.",
        invoice_number="B0100000001",
        invoice_date=datetime(2026, 5, 20),
        due_date=datetime(2026, 6, 20),
        total_amount=10000.0,
        tax_amount=1800.0,
        transaction_type="expense",
        payment_condition="credito",
        payment_status="pending",
        processed=True,
    )
    ar_invoice = Invoice(
        tenant_id=tenant_id,
        organization_id=org_id,
        vendor_name="Cliente de Prueba SRL",
        invoice_number="B0100000002",
        invoice_date=datetime(2026, 5, 22),
        due_date=datetime(2026, 6, 22),
        total_amount=15000.0,
        tax_amount=2700.0,
        transaction_type="income",
        payment_condition="credito",
        payment_status="pending",
        processed=True,
    )

    db_session.add(ap_invoice)
    db_session.add(ar_invoice)
    db_session.commit()
    db_session.refresh(ap_invoice)
    db_session.refresh(ar_invoice)

    # Setup require_tenant dependency override
    async def mock_require_tenant():
        tenant = db_session.query(Tenant).filter(Tenant.id == tenant_id).first()
        org = db_session.query(Organization).filter(Organization.id == org_id).first()
        user = db_session.query(User).filter(User.id == test_user.id).first()
        return TenantContext(
            db=db_session,
            user=user,
            tenant=tenant,
            tenant_id=tenant_id,
            org_id=org_id,
            organization=org,
            role="owner",
            permissions=None
        )

    app.dependency_overrides[require_tenant] = mock_require_tenant
    client = TestClient(app)

    try:
        # 1. Test AP Preview
        resp_ap_prev = client.get("/api/reports/ap-ar/preview?report_type=ap")
        assert resp_ap_prev.status_code == 200
        data_ap = resp_ap_prev.json()
        assert data_ap["report_type"] == "ap"
        assert data_ap["totals"]["total_amount"] >= 10000.0
        assert len(data_ap["rows"]) >= 1
        assert data_ap["rows"][0]["invoice_number"] == "B0100000001"

        # 2. Test AR Preview
        resp_ar_prev = client.get("/api/reports/ap-ar/preview?report_type=ar")
        assert resp_ar_prev.status_code == 200
        data_ar = resp_ar_prev.json()
        assert data_ar["report_type"] == "ar"
        assert data_ar["totals"]["total_amount"] >= 15000.0
        assert len(data_ar["rows"]) >= 1
        assert data_ar["rows"][0]["invoice_number"] == "B0100000002"

        # 3. Test Excel Export
        resp_xlsx = client.get("/api/reports/ap-ar/export?report_type=ap&format=xlsx")
        assert resp_xlsx.status_code == 200
        assert resp_xlsx.headers["content-type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        assert len(resp_xlsx.content) > 0

        # 4. Test CSV Export
        resp_csv = client.get("/api/reports/ap-ar/export?report_type=ar&format=csv")
        assert resp_csv.status_code == 200
        assert "text/csv" in resp_csv.headers["content-type"]
        csv_text = resp_csv.content.decode("utf-8")
        assert "Cliente de Prueba SRL" in csv_text

        # 5. Test TXT Export
        resp_txt = client.get("/api/reports/ap-ar/export?report_type=ap&format=txt")
        assert resp_txt.status_code == 200
        assert "text/plain" in resp_txt.headers["content-type"]
        txt_text = resp_txt.content.decode("utf-8")
        assert "Proveedor de Prueba S.A." in txt_text

    finally:
        # Cleanup
        db_session.delete(ap_invoice)
        db_session.delete(ar_invoice)
        db_session.commit()
        app.dependency_overrides.clear()
