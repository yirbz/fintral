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

    from app.services.seed_plans import seed_plans
    seed_plans()
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


def test_billing_ecf_registration_rollback_and_delete(db_session, test_tenant, test_user, test_org):
    from app.factory import create_app
    app = create_app()
    
    # Save original state of the organization
    org = db_session.query(Organization).get(test_org.id)
    original_status = org.certification_status
    original_tax_id = org.tax_id
    # Ensure clean state (previous tests may have set this via shared fixture)
    org.alanube_company_id = None
    db_session.commit()

    def mock_require_tenant():
        tenant = db_session.query(Tenant).get(test_tenant.id)
        org_ref = db_session.query(Organization).get(test_org.id)
        user = db_session.query(User).get(test_user.id)
        return TenantContext(
            db=db_session,
            user=user,
            tenant=tenant,
            tenant_id=test_tenant.id,
            org_id=test_org.id,
            organization=org_ref,
            role="owner"
        )
    app.dependency_overrides[require_tenant] = mock_require_tenant
    client = TestClient(app)

    import io
    from unittest.mock import patch, AsyncMock

    mock_service_instance = AsyncMock()
    mock_service_instance.create_company.return_value = {"id": "test-company-ulid-rollback-123"}
    # Make sign_document fail to trigger rollback
    mock_service_instance.sign_document.side_effect = Exception("Signature type not supported (AP1007)")
    mock_service_instance.delete_company.return_value = {"status": "deleted"}

    # Mock ENVIRONMENT as PRODUCTION to disable the development bypass
    with patch("app.config.ENVIRONMENT", "PRODUCTION"), \
         patch("app.routers.billing.AlanubeService", return_value=mock_service_instance):
        try:
            certificate_file = ("cert.p12", io.BytesIO(b"dummy_p12_content"))
            res = client.post(
                "/api/billing/certification/register",
                data={
                    "rnc": "132109122",
                    "business_name": "Test Company",
                    "trade_name": "Test Company Trade",
                    "economic_activity": "Servicios de Software",
                    "branch_office_address": "Av. Churchill",
                    "province": "Distrito Nacional",
                    "municipality": "Santo Domingo",
                    "certificate_password": "password123",
                },
                files={
                    "certificate": certificate_file
                }
            )
            # Should fail because of sign_document error under PRODUCTION env
            assert res.status_code == 400
            assert "El tipo de firma del certificado no es compatible" in res.json()["detail"]

            # Note: Alanube has no DELETE endpoint for companies, so orphan
            # companies remain in Alanube but our DB is rolled back cleanly.

            # Verify that DB changes were rolled back (tax_id should be original, status unchanged)
            db_session.expire_all()
            updated_org = db_session.query(Organization).get(test_org.id)
            assert updated_org.tax_id == original_tax_id
            assert updated_org.certification_status == original_status

        finally:
            app.dependency_overrides.clear()


def test_billing_ecf_certification_reset(db_session, test_tenant, test_user):
    from app.factory import create_app
    app = create_app()
    
    # Create a separate org for this test to avoid fixture pollution
    test_org_reset = Organization(
        tenant_id=test_tenant.id,
        name="Test Reset Org",
        tax_id="101581601",
        email_contact="reset@test.com"
    )
    db_session.add(test_org_reset)
    db_session.commit()
    
    # Pre-populate organization's certification fields
    org = db_session.query(Organization).get(test_org_reset.id)
    org.alanube_company_id = "test-reset-company-123"
    org.alanube_environment = "TesteCF"
    org.certification_status = "certificate_uploaded"
    org.is_ecf_authorized = False
    db_session.commit()

    def mock_require_tenant():
        tenant = db_session.query(Tenant).get(test_tenant.id)
        org_ref = db_session.query(Organization).get(test_org_reset.id)
        user = db_session.query(User).get(test_user.id)
        return TenantContext(
            db=db_session,
            user=user,
            tenant=tenant,
            tenant_id=test_tenant.id,
            org_id=test_org_reset.id,
            organization=org_ref,
            role="owner"
        )
    app.dependency_overrides[require_tenant] = mock_require_tenant
    client = TestClient(app)

    from unittest.mock import patch, AsyncMock
    mock_service_instance = AsyncMock()

    with patch("app.routers.billing.AlanubeService", return_value=mock_service_instance):
        try:
            res = client.post("/api/billing/certification/reset")
            assert res.status_code == 200
            assert res.json()["status"] == "none"
            
            # Alanube has no DELETE endpoint — once registered, company stays.
            # delete_company should never be called.
            mock_service_instance.delete_company.assert_not_called()
            
            # Verify DB was reset (tax_id + alanube_company_id remain intact,
            # certification state resets to allow re-trying via PATCH)
            db_session.expire_all()
            updated_org = db_session.query(Organization).get(test_org_reset.id)
            assert updated_org.tax_id == "101581601"
            assert updated_org.alanube_company_id == "test-reset-company-123"  # kept for future PATCH
            assert updated_org.certification_status == "none"
            assert updated_org.is_ecf_authorized is False
            assert updated_org.certification_step == "0"
            assert updated_org.is_certification_completed is False
            
        finally:
            app.dependency_overrides.clear()


def test_certification_step_tracking(db_session, test_tenant, test_user):
    """Test that certification steps are tracked as user progresses through wizard."""
    from app.factory import create_app
    app = create_app()
    
    # Create a separate org for this test
    test_org_step = Organization(
        tenant_id=test_tenant.id,
        name="Test Step Tracking Org",
        tax_id="101581602",
        email_contact="steps@test.com"
    )
    db_session.add(test_org_step)
    db_session.commit()
    
    # Verify initial state
    org = db_session.query(Organization).get(test_org_step.id)
    assert org.certification_step == "0"
    assert org.is_certification_completed is False
    
    def mock_require_tenant():
        tenant = db_session.query(Tenant).get(test_tenant.id)
        org_ref = db_session.query(Organization).get(test_org_step.id)
        user = db_session.query(User).get(test_user.id)
        return TenantContext(
            db=db_session,
            user=user,
            tenant=tenant,
            tenant_id=test_tenant.id,
            org_id=test_org_step.id,
            organization=org_ref,
            role="owner"
        )
    
    app.dependency_overrides[require_tenant] = mock_require_tenant
    client = TestClient(app)
    
    try:
        # Test /certification/status endpoint - should return current step
        res = client.get("/api/billing/certification/status")
        assert res.status_code == 200
        data = res.json()
        assert data["certification_step"] == "0"
        assert data["is_certification_completed"] is False
        
    finally:
        app.dependency_overrides.clear()


def test_certification_locked_company_id_on_register(db_session, test_tenant, test_user):
    """Test that alanube_company_id is locked when company is registered, even if API returns it late."""
    from app.factory import create_app
    from io import BytesIO
    app = create_app()
    
    # Create a separate org
    test_org_locked = Organization(
        tenant_id=test_tenant.id,
        name="Test Locked Org",
        tax_id="101581603",
        email_contact="locked@test.com"
    )
    db_session.add(test_org_locked)
    db_session.commit()
    
    def mock_require_tenant():
        tenant = db_session.query(Tenant).get(test_tenant.id)
        org_ref = db_session.query(Organization).get(test_org_locked.id)
        user = db_session.query(User).get(test_user.id)
        return TenantContext(
            db=db_session,
            user=user,
            tenant=tenant,
            tenant_id=test_tenant.id,
            org_id=test_org_locked.id,
            organization=org_ref,
            role="owner"
        )
    
    app.dependency_overrides[require_tenant] = mock_require_tenant
    client = TestClient(app)
    
    from unittest.mock import patch, AsyncMock
    mock_service_instance = AsyncMock()
    # Simulate Alanube returns company ID
    mock_service_instance.create_company.return_value = {"company": {"id": "locked-company-ulid-123"}, "status": "created"}
    mock_service_instance.sign_document.return_value = {"status": "signed"}
    
    cert_file = BytesIO(b"fake cert content")
    
    with patch("app.routers.billing.AlanubeService", return_value=mock_service_instance):
        try:
            res = client.post(
                "/api/billing/certification/register",
                data={
                    "rnc": "101-581-603",
                    "business_name": "Fintral Locked Test",
                    "trade_name": "Fintral",
                    "economic_activity": "6201",
                    "branch_office_address": "Calle Test 123",
                    "province": "Santo Domingo",
                    "municipality": "Santo Domingo",
                    "certificate_password": "test123"
                },
                files={"certificate": ("cert.p12", cert_file, "application/octet-stream")}
            )
            
            if res.status_code == 200:
                # Verify company ID is locked and step is set to 2
                db_session.expire_all()
                updated_org = db_session.query(Organization).get(test_org_locked.id)
                assert updated_org.alanube_company_id == "locked-company-ulid-123"
                assert updated_org.certification_step == "2"
                assert updated_org.is_certification_completed is False
                assert updated_org.certification_status == "certificate_uploaded"
            
        finally:
            app.dependency_overrides.clear()
