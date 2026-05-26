import json
from uuid import UUID
from datetime import date
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.dependencies.tenant import TenantContext, require_tenant
from app.models import Tenant, Organization, User, Client, Product, EcfSequence, Invoice


@pytest.fixture()
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def test_billing_crud_endpoints(db_session, test_tenant, test_user, test_org):
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
