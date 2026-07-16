import pytest
from datetime import datetime
from uuid_utils import uuid7
from sqlalchemy.orm import Session
from fastapi.testclient import TestClient

from app.models import Invoice, Tenant, Organization, User
from app.database import SessionLocal
from app.services.pipeline.normalizer import normalizer
from app.services.pipeline.categorizer import get_admin_category
from app.services.pipeline_orchestrator import PipelineOrchestrator
from app.dependencies.tenant import require_tenant, TenantContext


@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def test_categorizer_expense_vs_income():
    # Test administrative categories and codes for expense
    admin_cat_exp = get_admin_category("02", "expense")
    assert admin_cat_exp == "Servicios y Suministros"
    
    # Test administrative categories and codes for income
    admin_cat_inc = get_admin_category("01", "income")
    assert admin_cat_inc == "Ventas y Operaciones"


def test_normalizer_payment_condition_inference():
    # Test cash (contado) by default
    raw_data_cash = {
        "invoice_date": "2026-05-25",
        "total_amount": 1000.0,
        "transaction_type": "expense",
    }
    norm_cash = normalizer.normalize(raw_data_cash, source_type="manual")
    assert norm_cash["payment_condition"] == "contado"
    assert norm_cash["payment_status"] == "paid"
    assert norm_cash["due_date"] is None

    # Test credit (credito) from payment_method 4
    raw_data_cred = {
        "invoice_date": "2026-05-25",
        "total_amount": 1000.0,
        "transaction_type": "expense",
        "payment_method": "4",
    }
    norm_cred = normalizer.normalize(raw_data_cred, source_type="manual")
    assert norm_cred["payment_condition"] == "credito"
    assert norm_cred["payment_status"] == "pending"
    # due date should default to 30 days later
    assert norm_cred["due_date"] == "2026-06-24"


def test_pipeline_categorization_mapping():
    # Mock tenant context or orchestrator run
    orch = PipelineOrchestrator(openai_processor=None)
    data = {
        "vendor_tax_id": "130907572",  # Altice Dominicana (Layer 2 hit -> code 02)
        "vendor_name": "Altice",
        "line_items": [],
        "transaction_type": "expense",
    }
    invoice = Invoice(
        tenant_id=uuid7(),
        organization_id=uuid7(),
    )
    
    # Run pipeline categorization
    orch._categorize_data(data, invoice, db=None)
    assert data["goods_services_type"] == "02"
    assert data["category"] == "02"


def test_payment_endpoints(test_tenant, test_org, test_user, db_session: Session):
    from app.factory import create_app
    app = create_app()

    tenant_id = test_tenant.id
    org_id = test_org.id

    # Create dummy credit invoice in DB
    inv = Invoice(
        tenant_id=tenant_id,
        organization_id=org_id,
        vendor_name="Altice Test",
        invoice_number="B0100009999",
        invoice_date=datetime(2026, 5, 25),
        due_date=datetime(2026, 6, 25),
        total_amount=5000.0,
        transaction_type="expense",
        payment_condition="credito",
        payment_status="pending",
        processed=True,
    )
    db_session.add(inv)
    db_session.commit()
    db_session.refresh(inv)

    # Setup require_tenant dependency override
    async def mock_require_tenant():
        tenant = db_session.query(Tenant).get(tenant_id)
        org = db_session.query(Organization).get(org_id)
        user = db_session.query(User).get(test_user.id)
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
        # Verify CXP Summary
        resp = client.get("/api/cxp/summary")
        assert resp.status_code == 200
        res_data = resp.json()
        assert res_data["total_outstanding"] >= 5000.0
        
        # Mark invoice as paid
        resp_paid = client.post(f"/api/invoices/{inv.id}/mark-paid", json={"payment_date": "2026-05-26"})
        assert resp_paid.status_code == 200
        assert resp_paid.json()["status"] == "success"

        # Refresh invoice and verify DB state
        db_session.refresh(inv)
        assert inv.payment_status == "paid"
        assert inv.payment_date.strftime("%Y-%m-%d") == "2026-05-26"

        # Verify CXP Summary has updated
        resp2 = client.get("/api/cxp/summary")
        res_data2 = resp2.json()
        assert res_data2["total_outstanding"] < res_data["total_outstanding"]

    finally:
        # Cleanup
        db_session.delete(inv)
        db_session.commit()
        app.dependency_overrides.clear()


def test_bank_accounts_and_liquidation(test_tenant, test_org, test_user, db_session: Session):
    from app.factory import create_app
    from app.models import BankAccount
    app = create_app()

    tenant_id = test_tenant.id
    org_id = test_org.id

    # Setup require_tenant dependency override
    async def mock_require_tenant():
        tenant = db_session.query(Tenant).get(tenant_id)
        org = db_session.query(Organization).get(org_id)
        user = db_session.query(User).get(test_user.id)
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
        # 1. Test GET /api/bank-accounts (triggers seeding)
        resp_get = client.get("/api/bank-accounts")
        assert resp_get.status_code == 200
        banks = resp_get.json()
        assert len(banks) == 2
        assert any(b["name"] == "Banco Popular" for b in banks)

        popular_id = next(b["id"] for b in banks if b["name"] == "Banco Popular")

        # 2. Test POST /api/bank-accounts/bulk (syncing / updating balances)
        sync_payload = {
            "accounts": [
                {"id": popular_id, "name": "Banco Popular Editado", "balance": 10000.0},
                {"name": "Banreservas", "balance": 5000.0}
            ]
        }
        resp_bulk = client.post("/api/bank-accounts/bulk", json=sync_payload)
        assert resp_bulk.status_code == 200
        synced = resp_bulk.json()
        assert len(synced) == 2
        assert any(b["name"] == "Banco Popular Editado" and b["balance"] == 10000.0 for b in synced)
        assert any(b["name"] == "Banreservas" and b["balance"] == 5000.0 for b in synced)

        # Get final IDs
        res_popular_id = next(b["id"] for b in synced if "Popular" in b["name"])

        # 3. Create dummy credit invoice
        inv = Invoice(
            tenant_id=tenant_id,
            organization_id=org_id,
            vendor_name="Proveedor Test",
            invoice_number="B0100008888",
            invoice_date=datetime(2026, 5, 25),
            due_date=datetime(2026, 6, 25),
            total_amount=3000.0,
            transaction_type="expense",
            payment_condition="credito",
            payment_status="pending",
            processed=True,
        )
        db_session.add(inv)
        db_session.commit()
        db_session.refresh(inv)

        # 4. Mark invoice paid with bank account ID
        resp_mark = client.post(
            f"/api/invoices/{inv.id}/mark-paid",
            json={"payment_date": "2026-05-26", "bank_account_id": res_popular_id}
        )
        assert resp_mark.status_code == 200

        # Verify DB state of bank balance: 10000.0 - 3000.0 = 7000.0
        db_popular = db_session.query(BankAccount).get(res_popular_id)
        assert float(db_popular.balance) == 7000.0

        # Cleanup invoice
        db_session.delete(inv)
        db_session.commit()

    finally:
        # Cleanup bank accounts created
        db_session.query(BankAccount).filter(BankAccount.organization_id == org_id).delete()
        db_session.commit()
        app.dependency_overrides.clear()


def test_manual_invoice_creation_with_bank_account(test_tenant, test_org, test_user, db_session: Session):
    from app.factory import create_app
    from app.models import BankAccount
    app = create_app()

    tenant_id = test_tenant.id
    org_id = test_org.id

    # Create a dummy bank account
    bank = BankAccount(
        tenant_id=tenant_id,
        organization_id=org_id,
        name="Banco Popular Test",
        balance=1000.0
    )
    db_session.add(bank)
    db_session.commit()
    db_session.refresh(bank)

    # Setup require_tenant dependency override
    async def mock_require_tenant():
        tenant = db_session.query(Tenant).get(tenant_id)
        org = db_session.query(Organization).get(org_id)
        user = db_session.query(User).get(test_user.id)
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
        # Create manual invoice with bank account ID
        payload = {
            "vendor_name": "Proveedor Test Manual",
            "invoice_number": "B0100007777",
            "invoice_date": "2026-05-25",
            "total_amount": 500.0,
            "currency": "DOP",
            "transaction_type": "expense",
            "payment_condition": "contado",
            "bank_account_id": str(bank.id),
            "line_items": []
        }
        resp = client.post("/invoices", json=payload)
        assert resp.status_code == 200
        res_data = resp.json()
        assert res_data["bank_account_id"] == str(bank.id)
        assert res_data["payment_condition"] == "contado"
        assert res_data["payment_status"] == "paid"

        # Verify in DB and verify bank balance decreased by 500
        db_session.refresh(bank)
        assert float(bank.balance) == 500.0

        db_inv = db_session.query(Invoice).filter(Invoice.invoice_number == "B0100007777").first()
        assert db_inv is not None
        assert db_inv.bank_account_id == bank.id

        # Update bank_account_id via PUT /invoices/{id} to None
        resp_put = client.put(f"/invoices/{db_inv.id}", json={"bank_account_id": None})
        assert resp_put.status_code == 200
        assert resp_put.json()["bank_account_id"] is None

        db_session.refresh(db_inv)
        assert db_inv.bank_account_id is None

        # Verify bank balance is restored to 1000.0
        db_session.refresh(bank)
        assert float(bank.balance) == 1000.0

        # Clean up
        db_session.delete(db_inv)
        db_session.commit()
    finally:
        db_session.delete(bank)
        db_session.commit()
        app.dependency_overrides.clear()
