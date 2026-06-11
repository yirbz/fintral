import pytest
import datetime
from unittest.mock import MagicMock, patch
from uuid_utils import uuid7

from app.database import SessionLocal
from app.models import Tenant, Organization, User, Invoice, MioPayment
from app.services import MioService
from app.dependencies.tenant import require_tenant, TenantContext
from app.factory import create_app
from fastapi.testclient import TestClient

@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def test_mio_service_get_token_success():
    service = MioService()
    
    db_mock = MagicMock()
    org_id = uuid7()
    
    settings_mock = MagicMock()
    settings_mock.resolve_setting.side_effect = lambda db, key, **kwargs: {
        "mio_client_id": "test_client_id",
        "mio_client_secret": "test_client_secret",
        "mio_auth_url": "https://auth.stg.geopagos.io",
        "mio_checkout_url": "https://api-mpos-mio.stg.geopagos.io",
    }.get(key, "")
    service.settings_service = settings_mock

    with patch("requests.post") as mock_post:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "access_token": "mock_access_token",
            "expires_in": 3600,
            "token_type": "Bearer"
        }
        mock_post.return_value = mock_response
        
        # 1. Get token
        res = service.get_token(db_mock, org_id)
        assert res["status"] == "success"
        assert res["access_token"] == "mock_access_token"
        assert res["cached"] is False
        
        # 2. Get token again (should hit cache)
        res_cached = service.get_token(db_mock, org_id)
        assert res_cached["status"] == "success"
        assert res_cached["access_token"] == "mock_access_token"
        assert res_cached["cached"] is True

        # 3. Get token with force_refresh
        mock_response_new = MagicMock()
        mock_response_new.status_code = 200
        mock_response_new.json.return_value = {
            "access_token": "new_mock_access_token",
            "expires_in": 3600,
            "token_type": "Bearer"
        }
        mock_post.return_value = mock_response_new
        
        res_refreshed = service.get_token(db_mock, org_id, force_refresh=True)
        assert res_refreshed["status"] == "success"
        assert res_refreshed["access_token"] == "new_mock_access_token"
        assert res_refreshed["cached"] is False

def test_mio_service_missing_credentials():
    service = MioService()
    db_mock = MagicMock()
    org_id = uuid7()
    
    settings_mock = MagicMock()
    settings_mock.resolve_setting.return_value = ""
    service.settings_service = settings_mock
    
    res = service.get_token(db_mock, org_id)
    assert res["status"] == "error"
    assert "MIO no configurado" in res["message"]

def test_create_and_status_order_flow(test_tenant, test_org, db_session):
    service = MioService()
    
    # Setup settings mock
    settings_mock = MagicMock()
    settings_mock.resolve_setting.side_effect = lambda db, key, **kwargs: {
        "mio_client_id": "test_client_id",
        "mio_client_secret": "test_client_secret",
        "mio_auth_url": "https://auth.stg.geopagos.io",
        "mio_checkout_url": "https://api-mpos-mio.stg.geopagos.io",
    }.get(key, "")
    service.settings_service = settings_mock

    # Create dummy invoice to attach payment to
    invoice = Invoice(
        tenant_id=test_tenant.id,
        organization_id=test_org.id,
        vendor_name="Test Vendor",
        invoice_number="B0100001234",
        invoice_date=datetime.datetime(2026, 6, 9),
        total_amount=1500.0,
        payment_status="pending",
        processed=True
    )
    db_session.add(invoice)
    db_session.commit()
    db_session.refresh(invoice)

    try:
        with patch("requests.post") as mock_post, patch("requests.get") as mock_get:
            # Mock Token response
            mock_token_resp = MagicMock()
            mock_token_resp.status_code = 200
            mock_token_resp.json.return_value = {
                "access_token": "valid_token",
                "expires_in": 3600
            }
            # Mock Create Order response
            mock_order_resp = MagicMock()
            mock_order_resp.status_code = 201
            mock_order_resp.json.return_value = {
                "data": {
                    "id": "/api/v2/orders/test-order-uuid-123",
                    "attributes": {
                        "uuid": "test-order-uuid-123",
                        "links": {
                            "checkout": "https://checkout.mio.com.do/test-order-uuid-123"
                        }
                    }
                }
            }
            # The requests.post mock returns token first, then order
            mock_post.side_effect = [mock_token_resp, mock_order_resp]

            # Create order
            order_res = service.create_order(
                db=db_session,
                tenant_id=test_tenant.id,
                org_id=test_org.id,
                amount=1500.0,
                currency="DOP",
                invoice_id=invoice.id
            )
            assert order_res["status"] == "success"
            assert order_res["order_uuid"] == "test-order-uuid-123"
            assert order_res["checkout_url"] == "https://checkout.mio.com.do/test-order-uuid-123"

            # Check db record
            payment_rec = db_session.query(MioPayment).filter_by(mio_order_uuid="test-order-uuid-123").first()
            assert payment_rec is not None
            assert payment_rec.status == "PENDING"
            assert float(payment_rec.amount) == 1500.0

            # Mock status query response
            mock_status_resp = MagicMock()
            mock_status_resp.status_code = 200
            mock_status_resp.json.return_value = {
                "data": {
                    "attributes": {
                        "status": "SUCCESS",
                        "payment": {
                            "id": 888,
                            "authorization_code": "AUT123",
                            "reference_number": "REF123"
                        }
                    }
                }
            }
            mock_get.return_value = mock_status_resp
            # Post side effect needs to return token for status check
            mock_post.side_effect = [mock_token_resp]

            # Get order status (should update DB and invoice status)
            status_res = service.get_order_status(db_session, test_org.id, "test-order-uuid-123")
            assert status_res["status"] == "success"
            assert status_res["mio_status"] == "SUCCESS"

            db_session.refresh(payment_rec)
            assert payment_rec.status == "SUCCESS"
            assert payment_rec.payment_id == "888"

            db_session.refresh(invoice)
            assert invoice.payment_status == "paid"

    finally:
        # Cleanup
        db_session.delete(invoice)
        payment_rec = db_session.query(MioPayment).filter_by(mio_order_uuid="test-order-uuid-123").first()
        if payment_rec:
            db_session.delete(payment_rec)
        db_session.commit()

def test_process_webhook_flow(test_tenant, test_org, db_session):
    service = MioService()
    
    invoice = Invoice(
        tenant_id=test_tenant.id,
        organization_id=test_org.id,
        vendor_name="Test Webhook Vendor",
        invoice_number="B0100001235",
        invoice_date=datetime.datetime(2026, 6, 9),
        total_amount=2000.0,
        payment_status="pending",
        processed=True
    )
    db_session.add(invoice)
    db_session.commit()
    db_session.refresh(invoice)

    # Pre-populate MioPayment record
    payment_rec = MioPayment(
        tenant_id=test_tenant.id,
        organization_id=test_org.id,
        invoice_id=invoice.id,
        mio_order_uuid="webhook-order-uuid-456",
        status="PENDING",
        currency="DOP",
        amount=2000.0
    )
    db_session.add(payment_rec)
    db_session.commit()
    db_session.refresh(payment_rec)

    try:
        webhook_payload = {
            "data": {
                "type": "Payment",
                "order": {
                    "uuid": "webhook-order-uuid-456",
                    "status": "SUCCESS"
                },
                "payment": {
                    "id": 999,
                    "authorizationCode": "AUT456",
                    "refNumber": "REF456",
                    "status": "APPROVED"
                }
            }
        }

        res = service.process_webhook(db_session, webhook_payload)
        assert res["status"] == "success"
        assert res["mapped_status"] == "SUCCESS"

        db_session.refresh(payment_rec)
        assert payment_rec.status == "SUCCESS"
        assert payment_rec.payment_id == "999"

        db_session.refresh(invoice)
        assert invoice.payment_status == "paid"

    finally:
        db_session.delete(invoice)
        db_session.delete(payment_rec)
        db_session.commit()

def test_mio_endpoints(test_tenant, test_org, test_user, db_session):
    app = create_app()
    tenant_id = test_tenant.id
    org_id = test_org.id

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
        import os
        os.environ["MIO_CLIENT_ID"] = "env_client_id"
        os.environ["MIO_CLIENT_SECRET"] = "env_client_secret"
        
        with patch("requests.post") as mock_post, patch("requests.get") as mock_get:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {
                "access_token": "env_access_token",
                "expires_in": 3600,
                "token_type": "Bearer"
            }
            # Mock Create Order response
            mock_order_resp = MagicMock()
            mock_order_resp.status_code = 201
            mock_order_resp.json.return_value = {
                "data": {
                    "id": "/api/v2/orders/order-1234",
                    "attributes": {
                        "uuid": "order-1234",
                        "links": {
                            "checkout": "https://checkout.mio.com.do/order-1234"
                        }
                    }
                }
            }
            # Mock Order Status response
            mock_status_resp = MagicMock()
            mock_status_resp.status_code = 200
            mock_status_resp.json.return_value = {
                "data": {
                    "attributes": {
                        "status": "SUCCESS",
                        "payment": {}
                    }
                }
            }

            mock_post.side_effect = [mock_response, mock_response, mock_order_resp]
            mock_get.return_value = mock_status_resp
            
            resp = client.post("/api/mio/token")
            assert resp.status_code == 200
            assert resp.json()["status"] == "success"
            assert resp.json()["access_token"] == "env_access_token"
            
            # Refresh
            resp_ref = client.post("/api/mio/token/refresh")
            assert resp_ref.status_code == 200
            assert resp_ref.json()["status"] == "success"
            assert resp_ref.json()["access_token"] == "env_access_token"
            assert resp_ref.json()["cached"] is False

            # Create Order Endpoint
            order_payload = {
                "amount": 1000.0,
                "currency": "DOP"
            }
            resp_order = client.post("/api/mio/create-order", json=order_payload)
            assert resp_order.status_code == 200
            assert resp_order.json()["status"] == "success"
            assert resp_order.json()["order_uuid"] == "order-1234"

            # Get Status Endpoint
            # Side effect for token fetch during status check
            mock_post.side_effect = [mock_response]
            resp_status = client.get("/api/mio/order-status/order-1234")
            assert resp_status.status_code == 200
            assert resp_status.json()["status"] == "success"
            assert resp_status.json()["mio_status"] == "SUCCESS"

            # Webhook Endpoint
            webhook_payload = {
                "data": {
                    "type": "Payment",
                    "order": {
                        "uuid": "order-1234",
                        "status": "SUCCESS"
                    },
                    "payment": {
                        "id": 777,
                        "status": "APPROVED"
                    }
                }
            }
            resp_webhook = client.post("/api/mio/webhook", json=webhook_payload)
            assert resp_webhook.status_code == 200
            assert resp_webhook.json()["status"] == "success"

    finally:
        app.dependency_overrides.clear()
        if "MIO_CLIENT_ID" in os.environ:
            del os.environ["MIO_CLIENT_ID"]
        if "MIO_CLIENT_SECRET" in os.environ:
            del os.environ["MIO_CLIENT_SECRET"]
