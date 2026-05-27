from uuid import UUID
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.dependencies.tenant import TenantContext, require_tenant
from app.models import Tenant, Organization, User, EcfSequence, Invoice


@pytest.fixture()
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def test_billing_crud_endpoints(db_session, test_tenant, test_user, test_org):
    # Set the test organization as certified for electronic billing
    org = db_session.query(Organization).get(test_org.id)
    org.is_ecf_authorized = True
    db_session.commit()

    from app.factory import create_app
    app = create_app()
    # Setup dependency override
    def mock_require_tenant():
        tenant = db_session.query(Tenant).get(test_tenant.id)
        org = db_session.query(Organization).get(test_org.id)
        user = db_session.query(User).get(test_user.id)
        return TenantContext(
            db=db_session,
            user=user,
            tenant=tenant,
            tenant_id=test_tenant.id,
            org_id=test_org.id,
            organization=org,
            role="owner"
        )

    app.dependency_overrides[require_tenant] = mock_require_tenant
    client = TestClient(app)

    try:
        # -------------------------------------------------------------------
        # 1. Clients CRUD
        # -------------------------------------------------------------------
        # Create client
        payload = {
            "name": "Juan Perez",
            "tax_id": "132-10912-2",
            "phone": "8095551234",
            "email": "juan@example.com",
            "address": "Calle Principal 123"
        }
        res = client.post("/api/billing/clients", json=payload)
        assert res.status_code == 200
        client_data = res.json()
        assert client_data["name"] == "Juan Perez"
        assert client_data["tax_id"] == "132109122"  # Clean tax_id

        client_uuid = client_data["id"]

        # List clients
        res_list = client.get("/api/billing/clients")
        assert res_list.status_code == 200
        assert len(res_list.json()) >= 1

        # Update client
        update_payload = {
            "name": "Juan Perez Modificado",
            "tax_id": "132-10912-2",
            "phone": "8095559999",
            "email": "juan.mod@example.com",
            "address": "Calle Secundaria 456"
        }
        res_up = client.put(f"/api/billing/clients/{client_uuid}", json=update_payload)
        assert res_up.status_code == 200
        assert res_up.json()["name"] == "Juan Perez Modificado"

        # -------------------------------------------------------------------
        # 2. Products CRUD
        # -------------------------------------------------------------------
        # Create product
        prod_payload = {
            "name": "Servicio de Asesoría",
            "internal_code": "SERV-01",
            "description": "Asesoría contable mensual",
            "price": 5000.0,
            "tax_rate": 18.0
        }
        res_prod = client.post("/api/billing/products", json=prod_payload)
        assert res_prod.status_code == 200
        prod_data = res_prod.json()
        assert prod_data["name"] == "Servicio de Asesoría"
        assert prod_data["price"] == 5000.0

        prod_uuid = prod_data["id"]

        # List products
        res_prod_list = client.get("/api/billing/products")
        assert res_prod_list.status_code == 200
        assert len(res_prod_list.json()) >= 1

        # Update product
        prod_up_payload = {
            "price": 5500.0
        }
        res_prod_up = client.put(f"/api/billing/products/{prod_uuid}", json=prod_up_payload)
        assert res_prod_up.status_code == 200
        assert res_prod_up.json()["price"] == 5500.0

        # -------------------------------------------------------------------
        # 3. Sequences CRUD
        # -------------------------------------------------------------------
        # Create sequence
        seq_payload = {
            "ecf_type": 31,
            "prefix": "E",
            "start_number": 9659001,
            "end_number": 9660000,
            "current_number": 9659000,
            "expiry_date": "2028-12-31"
        }
        res_seq = client.post("/api/billing/sequences", json=seq_payload)
        assert res_seq.status_code == 200
        seq_data = res_seq.json()
        assert seq_data["ecf_type"] == 31
        assert seq_data["current_number"] == 9659000

        seq_uuid = seq_data["id"]

        # List sequences
        res_seq_list = client.get("/api/billing/sequences")
        assert res_seq_list.status_code == 200
        assert len(res_seq_list.json()) >= 1

        # -------------------------------------------------------------------
        # 4. Invoice Draft & Emit
        # -------------------------------------------------------------------
        # Create draft invoice
        inv_payload = {
            "client_id": client_uuid,
            "ecf_type": 31,
            "payment_type": 1,
            "payment_method": 2,
            "items": [
                {
                    "product_id": prod_uuid,
                    "quantity": 2.0,
                    "unit_price": 5500.0,
                    "discount_rate": 0.0
                }
            ]
        }
        res_inv = client.post("/api/billing/invoices", json=inv_payload)
        assert res_inv.status_code == 200
        inv_data = res_inv.json()
        assert inv_data["status"] == "draft"
        assert inv_data["total_amount"] == 11000.0 * 1.18 # 11000 + 1980 = 12980

        inv_uuid = inv_data["id"]

        # Create draft credit invoice to test due date and condition calculation
        inv_payload_credit = {
            "client_id": client_uuid,
            "ecf_type": 31,
            "payment_type": 2, # 2 is Credit
            "payment_method": 2,
            "items": [
                {
                    "product_id": prod_uuid,
                    "quantity": 1.0,
                    "unit_price": 100.0,
                    "discount_rate": 0.0
                }
            ]
        }
        res_credit = client.post("/api/billing/invoices", json=inv_payload_credit)
        assert res_credit.status_code == 200
        credit_data = res_credit.json()
        assert credit_data["payment_condition"] == "credito"
        assert credit_data["due_date"] is not None

        # Clean up credit invoice
        credit_inv_to_del = db_session.query(Invoice).get(UUID(credit_data["id"]))
        if credit_inv_to_del:
            db_session.delete(credit_inv_to_del)
            db_session.commit()

        # Mock Alanube emit call
        mock_alanube_response = {
            "id": "mock-alanube-uuid",
            "trackId": "mock-track-id",
            "securityCode": "mock-sec-code",
            "legalStatus": "ACCEPTED",
            "pdfUrl": "https://alanube.mock/invoice.pdf",
            "xmlUrl": "https://alanube.mock/invoice.xml"
        }

        with patch("app.services.alanube.AlanubeService.emit_document", new_callable=AsyncMock) as mock_emit:
            mock_emit.return_value = mock_alanube_response

            res_transmit = client.post(f"/api/billing/invoices/{inv_uuid}/transmit")
            assert res_transmit.status_code == 200
            transmit_data = res_transmit.json()
            assert transmit_data["invoice"]["status"] == "verified"
            assert transmit_data["invoice"]["invoice_number"] == "E310009659001"
            assert transmit_data["invoice"]["processed"] is True

            # Check sequence incremented in DB
            db_session.commit()
            updated_seq = db_session.query(EcfSequence).get(UUID(seq_uuid))
            assert updated_seq.current_number == 9659001

        # Delete client and product clean up
        res_del_client = client.delete(f"/api/billing/clients/{client_uuid}")
        assert res_del_client.status_code == 200
        res_del_prod = client.delete(f"/api/billing/products/{prod_uuid}")
        assert res_del_prod.status_code == 200
        res_del_seq = client.delete(f"/api/billing/sequences/{seq_uuid}")
        assert res_del_seq.status_code == 200

        # Remove the created draft/processed invoice
        inv_to_del = db_session.query(Invoice).get(UUID(inv_uuid))
        if inv_to_del:
            db_session.delete(inv_to_del)
            db_session.commit()

    finally:
        app.dependency_overrides.clear()


def test_billing_sequence_validation(db_session, test_tenant, test_user, test_org):
    from app.factory import create_app
    app = create_app()
    def mock_require_tenant():
        tenant = db_session.query(Tenant).get(test_tenant.id)
        org = db_session.query(Organization).get(test_org.id)
        user = db_session.query(User).get(test_user.id)
        return TenantContext(
            db=db_session,
            user=user,
            tenant=tenant,
            tenant_id=test_tenant.id,
            org_id=test_org.id,
            organization=org,
            role="owner"
        )
    app.dependency_overrides[require_tenant] = mock_require_tenant
    client = TestClient(app)

    try:
        # 1. Invalid prefix
        res = client.post("/api/billing/sequences", json={
            "ecf_type": 31,
            "prefix": "A",
            "start_number": 1,
            "end_number": 100,
            "current_number": 0,
            "expiry_date": "2028-12-31"
        })
        assert res.status_code == 422

        # 2. Negative numbers
        res = client.post("/api/billing/sequences", json={
            "ecf_type": 31,
            "prefix": "E",
            "start_number": -5,
            "end_number": 100,
            "current_number": 0,
            "expiry_date": "2028-12-31"
        })
        assert res.status_code == 422

        # 3. Start number > End number
        res = client.post("/api/billing/sequences", json={
            "ecf_type": 31,
            "prefix": "E",
            "start_number": 500,
            "end_number": 100,
            "current_number": 0,
            "expiry_date": "2028-12-31"
        })
        assert res.status_code == 422

        # 4. Expired date
        res = client.post("/api/billing/sequences", json={
            "ecf_type": 31,
            "prefix": "E",
            "start_number": 1,
            "end_number": 100,
            "current_number": 0,
            "expiry_date": "2020-01-01"
        })
        assert res.status_code == 422

        # 5. Invalid prefix-type alignment (e.g. type 31 is electronic, but trying to set prefix B)
        res = client.post("/api/billing/sequences", json={
            "ecf_type": 31,
            "prefix": "B",
            "start_number": 1,
            "end_number": 100,
            "current_number": 0,
            "expiry_date": "2028-12-31"
        })
        assert res.status_code == 422

    finally:
        app.dependency_overrides.clear()


def test_billing_ecf_verification_flow(db_session, test_tenant, test_user, test_org):
    # Ensure it is false initially
    org = db_session.query(Organization).get(test_org.id)
    org.is_ecf_authorized = False
    db_session.commit()

    from app.factory import create_app
    app = create_app()
    def mock_require_tenant():
        tenant = db_session.query(Tenant).get(test_tenant.id)
        org = db_session.query(Organization).get(test_org.id)
        user = db_session.query(User).get(test_user.id)
        return TenantContext(
            db=db_session,
            user=user,
            tenant=tenant,
            tenant_id=test_tenant.id,
            org_id=test_org.id,
            organization=org,
            role="owner"
        )
    app.dependency_overrides[require_tenant] = mock_require_tenant
    client = TestClient(app)

    from unittest.mock import patch, AsyncMock
    import io

    mock_service_instance = AsyncMock()
    mock_service_instance.create_company.return_value = {"id": "123"}
    mock_service_instance.patch_company.return_value = {}
    mock_service_instance.sign_document.return_value = {"url": "https://dummy/signed.xml"}
    mock_service_instance.create_set_test.return_value = {"id": "test-track-123", "status": "processing"}
    mock_service_instance.check_set_test_status.return_value = {"status": "approved"}

    with patch("app.routers.billing.AlanubeService", return_value=mock_service_instance):
        try:
            # 1. Get verification status (should be false)
            res = client.get("/api/billing/verification-status")
            assert res.status_code == 200
            assert res.json()["is_ecf_authorized"] is False
            assert res.json()["certification_status"] == "none"

            # 2. Try to create electronic sequence (should fail)
            res_seq = client.post("/api/billing/sequences", json={
                "ecf_type": 31,
                "prefix": "E",
                "start_number": 100,
                "end_number": 200,
                "current_number": 99,
                "expiry_date": "2028-12-31"
            })
            assert res_seq.status_code == 400
            assert "no está verificada" in res_seq.json()["detail"]

            # 3. Create traditional physical sequence (should succeed regardless)
            res_seq_phys = client.post("/api/billing/sequences", json={
                "ecf_type": 1,
                "prefix": "B",
                "start_number": 1,
                "end_number": 100,
                "current_number": 0,
                "expiry_date": "2028-12-31"
            })
            assert res_seq_phys.status_code == 200
            phys_seq_id = res_seq_phys.json()["id"]

            # 4. Step 1 & 2: Register company and upload certificate
            certificate_file = ("cert.p12", io.BytesIO(b"dummy_p12_content"))
            res_reg = client.post(
                "/api/billing/certification/register",
                data={
                    "rnc": "132109122",
                    "business_name": "Test Company",
                    "trade_name": "Test Company Trade",
                    "economic_activity": "Servicios de Software / TI",
                    "branch_office_address": "Av. Churchill",
                    "province": "Distrito Nacional",
                    "municipality": "Santo Domingo",
                    "certificate_password": "password123",
                },
                files={
                    "certificate": certificate_file
                }
            )
            assert res_reg.status_code == 200
            assert res_reg.json()["status"] == "certificate_uploaded"

            # Step 3: Start set test
            res_start = client.post("/api/billing/certification/start-set-test")
            assert res_start.status_code == 200
            assert res_start.json()["status"] == "set_test_running"

            # Step 3b: Poll set test status (which returns approved and authorizes org)
            res_poll = client.get("/api/billing/certification/set-test-status")
            assert res_poll.status_code == 200
            assert res_poll.json()["status"] == "COMPLETED"
            assert res_poll.json()["result"] == "APPROVED"

            # 5. Check status again (should be true)
            res_status_2 = client.get("/api/billing/verification-status")
            assert res_status_2.status_code == 200
            assert res_status_2.json()["is_ecf_authorized"] is True
            assert res_status_2.json()["certification_status"] == "certified"

            # 6. Try to create electronic sequence (should now succeed)
            res_seq_elec = client.post("/api/billing/sequences", json={
                "ecf_type": 31,
                "prefix": "E",
                "start_number": 100,
                "end_number": 200,
                "current_number": 99,
                "expiry_date": "2028-12-31"
            })
            assert res_seq_elec.status_code == 200
            elec_seq_id = res_seq_elec.json()["id"]

            # Cleanup
            client.delete(f"/api/billing/sequences/{phys_seq_id}")
            client.delete(f"/api/billing/sequences/{elec_seq_id}")

        finally:
            app.dependency_overrides.clear()
