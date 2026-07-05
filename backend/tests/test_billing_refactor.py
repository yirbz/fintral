"""Unit tests for Lago + MIO billing refactor implementation."""

import hashlib
import hmac
import pytest
from unittest.mock import patch, MagicMock
from uuid import uuid4
from datetime import datetime

from app.models import (
    SubscriptionPlan,
    OrganizationSubscription,
    Organization,
    MioPaymentOrder,
    BillingWebhookEvent,
)
from app.services.lago_service import LagoService
from app.services.mio_service import MioService
from app.services.billing_checkout_service import BillingCheckoutService
from app.services.lago_webhook_handler import LagoWebhookHandler
from app.services.mio_webhook_handler import MioWebhookHandler
from app.services.email_service import send_purchase_invoice_email
from app.routers.lago import verify_lago_signature
from app.routers.mio import verify_mio_signature


@pytest.fixture
def db_session():
    """Provides an in-memory SQLite database session for unit tests."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.database import Base

    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    
    # Seed static plans
    Session = sessionmaker(bind=engine)
    session = Session()
    
    plan_inicial = SubscriptionPlan(
        id=uuid4(),
        name="inicial",
        display_name="Inicial Plan",
        price_monthly_cents=100000,
        currency="DOP",
        price_dop=1000.00,
        max_users=3,
        max_entities=1,
    )
    db_plan_profesional = SubscriptionPlan(
        id=uuid4(),
        name="profesional",
        display_name="Profesional Plan",
        price_monthly_cents=280000,
        currency="DOP",
        price_dop=2800.00,
        max_users=10,
        max_entities=5,
    )
    session.add_all([plan_inicial, db_plan_profesional])
    session.commit()
    
    yield session
    session.close()


@pytest.fixture
def test_org(db_session):
    """Fixture to create a test organization."""
    from app.models.tenant import Tenant
    tenant = Tenant(
        id=uuid4(),
        name="Test Tenant",
        slug="test-tenant",
        is_active=True,
    )
    db_session.add(tenant)
    db_session.commit()

    org = Organization(
        id=uuid4(),
        tenant_id=tenant.id,
        name="Empresa Dominicana SRL",
        tax_id="131-12345-6",
        is_active=True,
        e_cf_balance=10,
    )
    db_session.add(org)
    db_session.commit()
    return org


class TestLagoService:
    """Tests the LagoService client wrapper functions using HTTP mocks."""

    @pytest.mark.anyio
    @patch("httpx.AsyncClient.request")
    async def test_create_or_update_customer(self, mock_request):
        # Mock Lago API response
        mock_response = MagicMock()
        mock_response.is_error = False
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "customer": {
                "lago_id": "lago-cust-123",
                "external_id": "org-123",
                "name": "Test Customer"
            }
        }
        mock_request.return_value = mock_response

        svc = LagoService()
        result = await svc.create_or_update_customer(
            external_id="org-123",
            name="Test Customer",
            email="test@fintral.com",
            rnc="131-12345-6"
        )

        assert result["customer"]["lago_id"] == "lago-cust-123"
        mock_request.assert_called_once()
        args, kwargs = mock_request.call_args
        assert kwargs["json"]["customer"]["legal_number"] == "131-12345-6"

    @pytest.mark.anyio
    @patch("httpx.AsyncClient.request")
    async def test_create_subscription(self, mock_request):
        mock_response = MagicMock()
        mock_response.is_error = False
        mock_response.status_code = 200
        mock_response.json.return_value = {"subscription": {"lago_id": "sub-123"}}
        mock_request.return_value = mock_response

        svc = LagoService()
        result = await svc.create_subscription(
            customer_external_id="org-123",
            plan_code="inicial",
            external_id="sub-abc"
        )

        assert result["subscription"]["lago_id"] == "sub-123"


class TestMioService:
    """Tests the MioService client wrapper functions using HTTP mocks."""

    @pytest.mark.anyio
    @patch("httpx.AsyncClient.post")
    @patch("httpx.AsyncClient.request")
    async def test_create_order(self, mock_request, mock_post):
        # Mock Auth Token call first
        auth_resp = MagicMock()
        auth_resp.is_error = False
        auth_resp.status_code = 200
        auth_resp.json.return_value = {"access_token": "mock-jwt-token", "expires_in": 3600}
        mock_post.return_value = auth_resp

        # Mock Create Order call
        order_resp = MagicMock()
        order_resp.is_error = False
        order_resp.status_code = 201
        order_resp.json.return_value = {
            "data": {
                "attributes": {
                    "uuid": "mio-order-uuid-999",
                    "status": "PENDING",
                    "links": {
                        "checkout": "https://mio.checkout.com/pay/mio-order-uuid-999"
                    }
                }
            }
        }
        mock_request.return_value = order_resp

        svc = MioService()
        result = await svc.create_order(
            amount_cents=100000,
            description="Prepaid e-CFs",
            webhook_url="https://fintral.com/webhook",
            success_url="https://fintral.com/success",
            failed_url="https://fintral.com/failed"
        )

        assert result["order_uuid"] == "mio-order-uuid-999"
        assert result["checkout_url"] == "https://mio.checkout.com/pay/mio-order-uuid-999"


class TestBillingCheckoutService:
    """Tests the checkout orchestrations for both subscriptions and prepaid blocks."""

    @pytest.mark.anyio
    @patch("app.services.lago_service.LagoService.create_or_update_customer")
    @patch("app.services.lago_service.LagoService.create_subscription")
    @patch("app.services.mio_service.MioService.create_order")
    async def test_subscribe_organization_card(self, mock_mio, mock_lago_sub, mock_lago_cust, db_session, test_org):
        # Mock customer & sub creation in Lago
        mock_lago_cust.return_value = {"customer": {"lago_id": "lago-cust-999"}}
        mock_lago_sub.return_value = {"subscription": {"lago_id": "lago-sub-999"}}
        # Mock MIO checkout URL creation
        mock_mio.return_value = {
            "order_uuid": "mio-order-111",
            "status": "PENDING",
            "checkout_url": "https://checkout.mio/pay"
        }

        checkout_svc = BillingCheckoutService(db_session)
        result = await checkout_svc.subscribe_organization(
            org_id=str(test_org.id),
            plan_name="profesional",
            payment_method="card"
        )

        assert result["checkout_url"] == "https://checkout.mio/pay"
        assert result["order_uuid"] == "mio-order-111"

        # Verify active subscription record was created locally
        sub = db_session.query(OrganizationSubscription).filter(
            OrganizationSubscription.organization_id == test_org.id
        ).first()
        assert sub is not None
        assert sub.status == "trialing"
        assert sub.payment_method == "card"
        assert sub.lago_plan_code == "profesional"

    @pytest.mark.anyio
    @patch("app.services.lago_service.LagoService.create_or_update_customer")
    @patch("app.services.lago_service.LagoService.create_one_off_invoice")
    @patch("app.services.mio_service.MioService.create_order")
    async def test_purchase_prepaid_ecf_card(self, mock_mio, mock_lago_inv, mock_lago_cust, db_session, test_org):
        mock_lago_cust.return_value = {"customer": {"lago_id": "lago-cust-999"}}
        mock_lago_inv.return_value = {"invoice": {"lago_id": "lago-inv-999", "total_amount_cents": 50000}}
        mock_mio.return_value = {
            "order_uuid": "mio-order-ecf",
            "status": "PENDING",
            "checkout_url": "https://checkout.mio/pay-prepaid"
        }

        checkout_svc = BillingCheckoutService(db_session)
        result = await checkout_svc.purchase_prepaid_ecf(
            org_id=str(test_org.id),
            block_type="ecf_block_100",
            payment_method="card"
        )

        assert result["checkout_url"] == "https://checkout.mio/pay-prepaid"
        assert result["order_uuid"] == "mio-order-ecf"
        
        # Verify MIO payment order is saved locally
        order = db_session.query(MioPaymentOrder).filter(
            MioPaymentOrder.order_uuid == "mio-order-ecf"
        ).first()
        assert order is not None
        assert order.lago_invoice_id == "lago-inv-999"
        assert order.amount_cents == 52500


class TestWebhookHandlers:
    """Tests the idempotent webhooks lifecycle and provisioning."""

    @pytest.mark.anyio
    @patch("app.services.lago_service.LagoService.record_payment")
    async def test_mio_webhook_transaction_completed(self, mock_record_payment, db_session, test_org):
        # Setup pending local payment order
        order = MioPaymentOrder(
            order_uuid="mio-order-777",
            lago_invoice_id="lago-invoice-777",
            organization_id=test_org.id,
            amount_cents=100000,
            status="PENDING",
        )
        db_session.add(order)
        db_session.commit()

        webhook_payload = {
            "order_uuid": "mio-order-777",
            "payment": {
                "id": "pay-999",
                "authorization_code": "auth-123",
                "reference_number": "ref-456"
            }
        }

        handler = MioWebhookHandler(db_session)
        await handler.process(
            event_type="TRANSACTION_COMPLETED",
            event_id="mio_evt_111",
            payload=webhook_payload
        )

        # Assert status is updated locally
        db_session.refresh(order)
        assert order.status == "SUCCESS"
        assert order.reference_number == "ref-456"

        # Assert payment was forwarded to Lago
        mock_record_payment.assert_called_once_with(
            invoice_id="lago-invoice-777",
            amount_cents=100000,
            reference="ref-456",
            paid_at=datetime.utcnow().strftime("%Y-%m-%d")
        )

    @pytest.mark.anyio
    async def test_lago_webhook_invoice_paid_provisions_credits(self, db_session, test_org):
        # Create subscription record locally
        plan = db_session.query(SubscriptionPlan).filter(SubscriptionPlan.name == "inicial").first()
        sub = OrganizationSubscription(
            organization_id=test_org.id,
            plan_id=plan.id,
            status="trialing",
            lago_subscription_id="lago-sub-123"
        )
        db_session.add(sub)
        db_session.commit()

        invoice_payload = {
            "invoice": {
                "lago_id": "lago-invoice-888",
                "customer": {
                    "external_id": str(test_org.id)
                },
                "total_amount_cents": 50000,
                "fees": [
                    {
                        "add_on_code": "ecf_block_100",
                        "units": 2
                    }
                ]
            }
        }

        handler = LagoWebhookHandler(db_session)
        await handler.process(
            event_type="invoice.paid",
            event_id="lago_evt_222",
            payload=invoice_payload
        )

        # Assert e-CF balance was incremented: original 10 + 200 (2 blocks of 100) = 210
        db_session.refresh(test_org)
        assert test_org.e_cf_balance == 210

        # Assert subscription is set to active
        db_session.refresh(sub)
        assert sub.status == "active"


class TestSignatureVerification:
    """Tests HMAC-SHA256 signature verification for Lago and MIO webhooks."""

    def test_verify_lago_signature_valid(self):
        secret = "test-lago-secret"
        body = b'{"webhook_type":"invoice.paid","invoice":{"lago_id":"inv-1"}}'
        expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        assert verify_lago_signature(body, expected, secret) is True

    def test_verify_lago_signature_invalid(self):
        secret = "test-lago-secret"
        body = b'{"webhook_type":"invoice.paid"}'
        assert verify_lago_signature(body, "bad-signature", secret) is False

    def test_verify_lago_signature_no_secret(self):
        body = b'{"webhook_type":"invoice.paid"}'
        assert verify_lago_signature(body, "", "") is True

    def test_verify_lago_signature_no_signature(self):
        secret = "test-lago-secret"
        body = b'{"webhook_type":"invoice.paid"}'
        assert verify_lago_signature(body, "", secret) is False

    def test_verify_mio_signature_valid(self):
        secret = "test-mio-secret"
        body = b'{"event":"TRANSACTION_COMPLETED","order_uuid":"ord-1"}'
        expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        assert verify_mio_signature(body, expected, secret) is True

    def test_verify_mio_signature_invalid(self):
        secret = "test-mio-secret"
        body = b'{"event":"TRANSACTION_COMPLETED"}'
        assert verify_mio_signature(body, "bad", secret) is False

    def test_verify_mio_signature_no_secret(self):
        body = b'{"event":"TRANSACTION_COMPLETED"}'
        assert verify_mio_signature(body, "any", "") is True


class TestLagoServiceExtended:
    """Extended tests for LagoService beyond basic CRUD."""

    @pytest.mark.anyio
    @patch("httpx.AsyncClient.request")
    async def test_upgrade_subscription(self, mock_request):
        mock_response = MagicMock()
        mock_response.is_error = False
        mock_response.status_code = 200
        mock_response.json.return_value = {"subscription": {"lago_id": "sub-upgraded", "plan_code": "profesional"}}
        mock_request.return_value = mock_response

        svc = LagoService()
        result = await svc.upgrade_subscription(
            customer_external_id="org-123",
            new_plan_code="profesional",
            subscription_external_id="sub-abc",
        )

        assert result["subscription"]["plan_code"] == "profesional"
        args, kwargs = mock_request.call_args
        assert kwargs["json"]["subscription"]["plan_code"] == "profesional"
        assert kwargs["method"] == "POST"

    @pytest.mark.anyio
    @patch("httpx.AsyncClient.request")
    async def test_cancel_subscription(self, mock_request):
        mock_response = MagicMock()
        mock_response.is_error = False
        mock_response.status_code = 200
        mock_response.json.return_value = {"subscription": {"lago_id": "sub-abc", "status": "terminated"}}
        mock_request.return_value = mock_response

        svc = LagoService()
        result = await svc.cancel_subscription(external_id="sub-abc")

        assert result["subscription"]["status"] == "terminated"
        args, kwargs = mock_request.call_args
        assert kwargs["method"] == "DELETE"

    @pytest.mark.anyio
    @patch("httpx.AsyncClient.request")
    async def test_create_one_off_invoice(self, mock_request):
        mock_response = MagicMock()
        mock_response.is_error = False
        mock_response.status_code = 200
        mock_response.json.return_value = {"invoice": {"lago_id": "inv-once", "total_amount_cents": 50000}}
        mock_request.return_value = mock_response

        svc = LagoService()
        fees = [{"add_on_code": "ecf_block_100", "units": 1, "unit_amount_cents": 50000}]
        result = await svc.create_one_off_invoice(
            customer_external_id="org-123",
            fees=fees,
        )

        assert result["invoice"]["lago_id"] == "inv-once"
        args, kwargs = mock_request.call_args
        assert kwargs["json"]["invoice"]["fees"][0]["add_on_code"] == "ecf_block_100"

    @pytest.mark.anyio
    @patch("httpx.AsyncClient.request")
    async def test_record_payment(self, mock_request):
        mock_response = MagicMock()
        mock_response.is_error = False
        mock_response.status_code = 200
        mock_response.json.return_value = {"payment": {"lago_id": "pay-1"}}
        mock_request.return_value = mock_response

        svc = LagoService()
        result = await svc.record_payment(
            invoice_id="lago-inv-1",
            amount_cents=100000,
            reference="ref-123",
            paid_at="2026-06-01",
        )

        assert result["payment"]["lago_id"] == "pay-1"
        args, kwargs = mock_request.call_args
        assert kwargs["json"]["payment"]["reference"] == "ref-123"

    @pytest.mark.anyio
    @patch("httpx.AsyncClient.request")
    async def test_get_invoice(self, mock_request):
        mock_response = MagicMock()
        mock_response.is_error = False
        mock_response.status_code = 200
        mock_response.json.return_value = {"invoice": {"lago_id": "lago-inv-1", "total_amount_cents": 50000}}
        mock_request.return_value = mock_response

        svc = LagoService()
        result = await svc.get_invoice(lago_id="lago-inv-1")

        assert result["invoice"]["total_amount_cents"] == 50000
        args, kwargs = mock_request.call_args
        assert "invoices/lago-inv-1" in kwargs["url"]

    @pytest.mark.anyio
    @patch("httpx.AsyncClient.request")
    async def test_lago_api_error_on_4xx(self, mock_request):
        mock_response = MagicMock()
        mock_response.is_error = True
        mock_response.status_code = 422
        mock_response.reason_phrase = "Unprocessable Entity"
        mock_response.text = '{"error": {"detail": ["validation failed"]}}'
        mock_request.return_value = mock_response

        from app.services.lago_service import LagoAPIError

        svc = LagoService()
        with pytest.raises(LagoAPIError) as excinfo:
            await svc.create_subscription(
                customer_external_id="org-123",
                plan_code="inicial",
                external_id="sub-abc",
            )
        assert excinfo.value.status_code == 422

    @pytest.mark.anyio
    @patch("httpx.AsyncClient.request")
    async def test_create_customer_without_rnc(self, mock_request):
        mock_response = MagicMock()
        mock_response.is_error = False
        mock_response.status_code = 200
        mock_response.json.return_value = {"customer": {"lago_id": "lago-cust-no-rnc"}}
        mock_request.return_value = mock_response

        svc = LagoService()
        result = await svc.create_or_update_customer(
            external_id="org-no-rnc",
            name="No RNC Org",
            email="test@fintral.com",
        )

        assert result["customer"]["lago_id"] == "lago-cust-no-rnc"
        args, kwargs = mock_request.call_args
        # Should NOT contain legal_number when rnc is None
        assert "legal_number" not in kwargs["json"]["customer"]


class TestMioServiceExtended:
    """Extended tests for MioService."""

    @pytest.mark.anyio
    @patch("httpx.AsyncClient.post")
    @patch("httpx.AsyncClient.request")
    async def test_get_order_status(self, mock_request, mock_post):
        auth_resp = MagicMock()
        auth_resp.is_error = False
        auth_resp.status_code = 200
        auth_resp.json.return_value = {"access_token": "jwt-token", "expires_in": 3600}
        mock_post.return_value = auth_resp

        order_resp = MagicMock()
        order_resp.is_error = False
        order_resp.status_code = 200
        order_resp.json.return_value = {
            "data": {
                "attributes": {
                    "uuid": "mio-order-status-1",
                    "status": "SUCCESS",
                    "payment": {
                        "id": "pay-1",
                        "authorization_code": "auth-1",
                        "reference_number": "ref-1",
                    }
                }
            }
        }
        mock_request.return_value = order_resp

        svc = MioService()
        result = await svc.get_order_status(order_uuid="mio-order-status-1")

        assert result["status"] == "SUCCESS"
        assert result["reference_number"] == "ref-1"

    @pytest.mark.anyio
    @patch("httpx.AsyncClient.post")
    async def test_token_caching(self, mock_post):
        """Second call should reuse cached token (no auth call)."""
        auth_resp = MagicMock()
        auth_resp.is_error = False
        auth_resp.status_code = 200
        auth_resp.json.return_value = {"access_token": "jwt-token", "expires_in": 3600}
        mock_post.return_value = auth_resp

        MioService._access_token = None
        MioService._token_expires_at = 0.0

        svc = MioService()
        token1 = await svc._get_token()
        token2 = await svc._get_token()

        assert token1 == token2 == "jwt-token"
        # Only one auth call because of caching
        assert mock_post.call_count == 1

    @pytest.mark.anyio
    @patch("httpx.AsyncClient.request")
    @patch("httpx.AsyncClient.post")
    async def test_auth_failure_raises_error(self, mock_post, mock_request):
        auth_resp = MagicMock()
        auth_resp.is_error = True
        auth_resp.status_code = 401
        auth_resp.reason_phrase = "Unauthorized"
        auth_resp.text = '{"error": "invalid_client"}'
        mock_post.return_value = auth_resp

        from app.services.mio_service import MioAPIError

        MioService._access_token = None
        MioService._token_expires_at = 0.0

        svc = MioService()
        with pytest.raises(MioAPIError) as excinfo:
            await svc.create_order(
                amount_cents=50000,
                description="Test",
                webhook_url="https://example.com/webhook",
                success_url="https://example.com/success",
                failed_url="https://example.com/failed",
            )
        assert excinfo.value.status_code == 401


class TestBillingCheckoutServiceExtended:
    """Extended checkout orchestration tests."""

    @pytest.mark.anyio
    @patch("app.services.lago_service.LagoService.create_or_update_customer")
    @patch("app.services.lago_service.LagoService.create_subscription")
    async def test_subscribe_organization_transfer(self, mock_lago_sub, mock_lago_cust, db_session, test_org):
        mock_lago_cust.return_value = {"customer": {"lago_id": "lago-cust-transfer"}}
        mock_lago_sub.return_value = {"subscription": {"lago_id": "lago-sub-transfer"}}

        checkout_svc = BillingCheckoutService(db_session)
        result = await checkout_svc.subscribe_organization(
            org_id=str(test_org.id),
            plan_name="inicial",
            payment_method="transfer"
        )

        assert result["payment_method"] == "transfer"
        assert result["status"] == "active"
        # No checkout_url for transfer orders
        assert "checkout_url" not in result

    @pytest.mark.anyio
    @patch("app.services.lago_service.LagoService.create_or_update_customer")
    @patch("app.services.lago_service.LagoService.create_subscription")
    @patch("app.services.mio_service.MioService.create_order")
    async def test_subscribe_organization_cancels_old_subs(
        self, mock_mio, mock_lago_sub, mock_lago_cust, db_session, test_org
    ):
        mock_lago_cust.return_value = {"customer": {"lago_id": "lago-cust-new"}}
        mock_lago_sub.return_value = {"subscription": {"lago_id": "lago-sub-new"}}
        mock_mio.return_value = {
            "order_uuid": "mio-order-new",
            "status": "PENDING",
            "checkout_url": "https://checkout.mio/pay-new",
        }

        plan = db_session.query(SubscriptionPlan).filter(SubscriptionPlan.name == "inicial").first()

        # Create an existing active subscription
        old_sub = OrganizationSubscription(
            organization_id=test_org.id,
            plan_id=plan.id,
            status="active",
            payment_method="card",
        )
        db_session.add(old_sub)
        db_session.commit()

        checkout_svc = BillingCheckoutService(db_session)
        await checkout_svc.subscribe_organization(
            org_id=str(test_org.id),
            plan_name="profesional",
            payment_method="card",
        )

        # Old sub should be canceled
        db_session.refresh(old_sub)
        assert old_sub.status == "canceled"
        assert old_sub.canceled_at is not None

    @pytest.mark.anyio
    @patch("app.services.lago_service.LagoService.create_or_update_customer")
    @patch("app.services.lago_service.LagoService.create_one_off_invoice")
    async def test_purchase_prepaid_ecf_transfer(self, mock_lago_inv, mock_lago_cust, db_session, test_org):
        mock_lago_cust.return_value = {"customer": {"lago_id": "lago-cust-ecf"}}
        mock_lago_inv.return_value = {"invoice": {"lago_id": "lago-inv-ecf", "total_amount_cents": 50000}}

        checkout_svc = BillingCheckoutService(db_session)
        result = await checkout_svc.purchase_prepaid_ecf(
            org_id=str(test_org.id),
            block_type="ecf_block_100",
            payment_method="transfer",
        )

        assert result["payment_method"] == "transfer"
        assert result["lago_invoice_id"] == "lago-inv-ecf"
        assert "checkout_url" not in result

    @pytest.mark.anyio
    async def test_subscribe_organization_missing_org(self, db_session):
        checkout_svc = BillingCheckoutService(db_session)
        with pytest.raises(ValueError, match="Organización no encontrada"):
            await checkout_svc.subscribe_organization(
                org_id=str(uuid4()),
                plan_name="inicial",
            )

    @pytest.mark.anyio
    @patch("app.services.lago_service.LagoService.create_or_update_customer")
    async def test_purchase_ecf_invalid_block_type(self, mock_lago_cust, db_session, test_org):
        mock_lago_cust.return_value = {"customer": {"lago_id": "lago-cust-1"}}

        checkout_svc = BillingCheckoutService(db_session)
        with pytest.raises(ValueError, match="Tipo de bloque e-CF desconocido"):
            await checkout_svc.purchase_prepaid_ecf(
                org_id=str(test_org.id),
                block_type="ecf_block_invalid",
            )


class TestLagoWebhookHandlerExtended:
    """Extended webhook lifecycle tests for Lago."""

    @pytest.mark.anyio
    @patch("app.services.mio_service.MioService.create_order")
    async def test_invoice_created_creates_mio_order_for_card(
        self, mock_mio, db_session, test_org
    ):
        mock_mio.return_value = {
            "order_uuid": "mio-order-inv-created",
            "status": "PENDING",
            "checkout_url": "https://checkout.mio/pay-inv",
        }

        plan = db_session.query(SubscriptionPlan).first()
        sub = OrganizationSubscription(
            organization_id=test_org.id,
            plan_id=plan.id,
            status="trialing",
            payment_method="card",
            lago_subscription_id="lago-sub-inv-created",
        )
        db_session.add(sub)
        db_session.commit()

        payload = {
            "webhook_type": "invoice.created",
            "invoice": {
                "lago_id": "lago-inv-created",
                "total_amount_cents": 280000,
                "customer": {"external_id": str(test_org.id)},
                "fees": [{"add_on_code": None, "units": 1, "item": {"name": "Profesional Plan"}}],
            }
        }

        handler = LagoWebhookHandler(db_session)
        event = await handler.process(
            event_type="invoice.created",
            event_id="lago_evt_inv_created",
            payload=payload,
        )

        assert event.processed is True
        mock_mio.assert_called_once()

        order = db_session.query(MioPaymentOrder).filter(
            MioPaymentOrder.lago_invoice_id == "lago-inv-created"
        ).first()
        assert order is not None
        assert order.status == "PENDING"

    @pytest.mark.anyio
    async def test_invoice_created_skips_mio_for_transfer(self, db_session, test_org):
        plan = db_session.query(SubscriptionPlan).first()
        sub = OrganizationSubscription(
            organization_id=test_org.id,
            plan_id=plan.id,
            status="active",
            payment_method="transfer",
            lago_subscription_id="lago-sub-transfer-inv",
        )
        db_session.add(sub)
        db_session.commit()

        payload = {
            "webhook_type": "invoice.created",
            "invoice": {
                "lago_id": "lago-inv-transfer",
                "total_amount_cents": 100000,
                "customer": {"external_id": str(test_org.id)},
                "fees": [],
            }
        }

        handler = LagoWebhookHandler(db_session)
        event = await handler.process(
            event_type="invoice.created",
            event_id="lago_evt_inv_transfer",
            payload=payload,
        )

        assert event.processed is True

        order = db_session.query(MioPaymentOrder).filter(
            MioPaymentOrder.lago_invoice_id == "lago-inv-transfer"
        ).first()
        assert order is None

    @pytest.mark.anyio
    async def test_subscription_started_updates_local_sub(self, db_session, test_org):
        plan = db_session.query(SubscriptionPlan).first()
        sub_external_id = "lago-sub-started-ext-1"
        sub = OrganizationSubscription(
            organization_id=test_org.id,
            plan_id=plan.id,
            status="trialing",
            lago_subscription_id=sub_external_id,
        )
        db_session.add(sub)
        db_session.commit()

        payload = {
            "webhook_type": "subscription.started",
            "subscription": {
                "lago_id": "lago-sub-started-1",
                "external_id": sub_external_id,
                "customer_id": "lago-cust-1",
                "plan_code": "inicial",
            }
        }

        handler = LagoWebhookHandler(db_session)
        await handler.process(
            event_type="subscription.started",
            event_id="lago_evt_sub_started",
            payload=payload,
        )

        db_session.refresh(sub)
        assert sub.status == "active"
        assert sub.lago_customer_id == "lago-cust-1"
        assert sub.lago_plan_code == "inicial"

    @pytest.mark.anyio
    async def test_subscription_terminated_cancels_local_sub(self, db_session, test_org):
        plan = db_session.query(SubscriptionPlan).first()
        sub_external_id = "lago-sub-term-1"
        sub = OrganizationSubscription(
            organization_id=test_org.id,
            plan_id=plan.id,
            status="active",
            lago_subscription_id=sub_external_id,
        )
        db_session.add(sub)
        db_session.commit()

        payload = {
            "webhook_type": "subscription.terminated",
            "subscription": {
                "lago_id": "lago-sub-term-1",
                "external_id": sub_external_id,
            }
        }

        handler = LagoWebhookHandler(db_session)
        await handler.process(
            event_type="subscription.terminated",
            event_id="lago_evt_sub_terminated",
            payload=payload,
        )

        db_session.refresh(sub)
        assert sub.status == "canceled"
        assert sub.canceled_at is not None

    @pytest.mark.anyio
    async def test_lago_webhook_idempotent(self, db_session, test_org):
        """Same event_id should skip processing entirely."""
        plan = db_session.query(SubscriptionPlan).first()
        sub = OrganizationSubscription(
            organization_id=test_org.id,
            plan_id=plan.id,
            status="active",
            payment_method="transfer",
            lago_subscription_id="lago-sub-idempotent",
        )
        db_session.add(sub)
        db_session.commit()

        event_id = "lago_evt_idempotent_1"
        payload = {
            "webhook_type": "subscription.terminated",
            "subscription": {
                "lago_id": "lago-sub-idempotent",
                "external_id": "lago-sub-idempotent",
            }
        }

        handler = LagoWebhookHandler(db_session)
        # First call processes
        event1 = await handler.process(
            event_type="subscription.terminated",
            event_id=event_id,
            payload=payload,
        )

        # Second call should return the existing event
        event2 = await handler.process(
            event_type="subscription.terminated",
            event_id=event_id,
            payload=payload,
        )

        assert event1.id == event2.id
        assert event2.processed is True
        # Only one event in DB
        count = db_session.query(BillingWebhookEvent).filter(
            BillingWebhookEvent.event_id == event_id
        ).count()
        assert count == 1

    @pytest.mark.anyio
    async def test_invoice_paid_with_multiple_ecf_blocks(self, db_session, test_org):
        plan = db_session.query(SubscriptionPlan).first()
        sub = OrganizationSubscription(
            organization_id=test_org.id,
            plan_id=plan.id,
            status="trialing",
            lago_subscription_id="lago-sub-ecf-multi",
        )
        db_session.add(sub)
        db_session.commit()

        initial_balance = test_org.e_cf_balance  # 10

        payload = {
            "webhook_type": "invoice.paid",
            "invoice": {
                "lago_id": "lago-inv-ecf-multi",
                "customer": {"external_id": str(test_org.id)},
                "total_amount_cents": 600000,
                "fees": [
                    {"add_on_code": "ecf_block_100", "units": 2},
                    {"add_on_code": "ecf_block_500", "units": 1},
                ]
            }
        }

        handler = LagoWebhookHandler(db_session)
        await handler.process(
            event_type="invoice.paid",
            event_id="lago_evt_ecf_multi",
            payload=payload,
        )

        # 10 + (2*100) + (1*500) = 710
        db_session.refresh(test_org)
        assert test_org.e_cf_balance == initial_balance + 200 + 500

    @pytest.mark.anyio
    async def test_invoice_paid_handles_legacy_ecf_block_code(self, db_session, test_org):
        plan = db_session.query(SubscriptionPlan).first()
        sub = OrganizationSubscription(
            organization_id=test_org.id,
            plan_id=plan.id,
            status="trialing",
            lago_subscription_id="lago-sub-legacy",
        )
        db_session.add(sub)
        db_session.commit()

        payload = {
            "webhook_type": "invoice.paid",
            "invoice": {
                "lago_id": "lago-inv-legacy",
                "customer": {"external_id": str(test_org.id)},
                "total_amount_cents": 25000,
                "fees": [
                    {"add_on_code": "ecf_block_250", "units": 3},
                ]
            }
        }

        handler = LagoWebhookHandler(db_session)
        await handler.process(
            event_type="invoice.paid",
            event_id="lago_evt_legacy",
            payload=payload,
        )

        db_session.refresh(test_org)
        # 10 + (250*3) = 760
        assert test_org.e_cf_balance == 760

    # --- User without token → hosted checkout ---

    @pytest.mark.anyio
    @patch("app.services.lago_webhook_handler.MioService.create_order")
    @patch("app.services.email_service.send_payment_link_email")
    async def test_user_no_token_creates_hosted_checkout(
        self, mock_email, mock_create_order, db_session, test_org
    ):
        """User without an active card token gets a hosted checkout order + payment link email."""
        from app.core.auth import get_password_hash
        from app.models.user import User
        from app.models.user_subscription import UserSubscription

        plan = db_session.query(SubscriptionPlan).filter(SubscriptionPlan.name == "profesional").first()

        user = User(
            id=uuid4(),
            tenant_id=test_org.tenant_id,
            email="no-token@test.local",
            hashed_password=get_password_hash("TestPass123!"),
            full_name="No Token User",
            is_active=True,
        )
        db_session.add(user)
        db_session.commit()

        sub = UserSubscription(
            user_id=user.id,
            plan_id=plan.id,
            status="active",
            payment_method="card",
            auto_renew=True,
            lago_subscription_id="lago-sub-no-tok",
            lago_customer_id="lago-cust-no-tok",
        )
        db_session.add(sub)
        db_session.commit()

        mock_create_order.return_value = {
            "order_uuid": "mio-order-no-tok",
            "status": "PENDING",
            "checkout_url": "https://checkout.mio/no-tok",
        }

        payload = {
            "webhook_type": "invoice.created",
            "invoice": {
                "lago_id": "lago-inv-no-tok",
                "total_amount_cents": 280000,
                "customer": {"external_id": str(user.id)},
                "fees": [{"add_on_code": None, "units": 1, "item": {"name": "Plan Profesional"}}],
            }
        }

        handler = LagoWebhookHandler(db_session)
        event = await handler.process(
            event_type="invoice.created",
            event_id="lago_evt_no_tok",
            payload=payload,
        )

        assert event.processed is True

        # create_order called with 5% fee
        mock_create_order.assert_called_once()
        assert mock_create_order.call_args[1]["amount_cents"] == 294000

        # Payment link email sent
        mock_email.assert_called_once()
        assert mock_email.call_args[1]["customer_email"] == "no-token@test.local"

        # Order persisted
        order = db_session.query(MioPaymentOrder).filter(
            MioPaymentOrder.lago_invoice_id == "lago-inv-no-tok"
        ).first()
        assert order is not None
        assert order.status == "PENDING"
        assert order.user_id == user.id
        assert order.amount_cents == 294000

    @pytest.mark.anyio
    @patch("app.services.lago_webhook_handler.MioService.create_order")
    async def test_user_no_token_mio_fails_still_processed(
        self, mock_create_order, db_session, test_org
    ):
        """When MIO create_order fails, the webhook event is still processed (no crash)."""
        from app.core.auth import get_password_hash
        from app.models.user import User
        from app.models.user_subscription import UserSubscription

        plan = db_session.query(SubscriptionPlan).filter(SubscriptionPlan.name == "profesional").first()

        user = User(
            id=uuid4(),
            tenant_id=test_org.tenant_id,
            email="mio-fail@test.local",
            hashed_password=get_password_hash("TestPass123!"),
            full_name="MIO Fail",
            is_active=True,
        )
        db_session.add(user)

        db_session.add(UserSubscription(
            user_id=user.id,
            plan_id=plan.id,
            status="active",
            payment_method="card",
            auto_renew=True,
            lago_subscription_id="lago-sub-mio-fail",
            lago_customer_id="lago-cust-mio-fail",
        ))
        db_session.commit()

        mock_create_order.side_effect = Exception("MIO connection error")

        payload = {
            "webhook_type": "invoice.created",
            "invoice": {
                "lago_id": "lago-inv-mio-fail",
                "total_amount_cents": 100000,
                "customer": {"external_id": str(user.id)},
                "fees": [],
            }
        }

        handler = LagoWebhookHandler(db_session)
        event = await handler.process(
            event_type="invoice.created",
            event_id="lago_evt_mio_fail",
            payload=payload,
        )

        # Event is processed even though MIO order failed
        assert event.processed is True
        mock_create_order.assert_called_once()
        # No order should be persisted
        order = db_session.query(MioPaymentOrder).filter(
            MioPaymentOrder.lago_invoice_id == "lago-inv-mio-fail"
        ).first()
        assert order is None

    @pytest.mark.anyio
    @patch("app.services.lago_webhook_handler.MioService.create_order")
    async def test_user_no_token_no_subscription_still_works(
        self, mock_create_order, db_session, test_org
    ):
        """User without a UserSubscription record still gets a hosted checkout (defaults to card)."""
        from app.core.auth import get_password_hash
        from app.models.user import User

        user = User(
            id=uuid4(),
            tenant_id=test_org.tenant_id,
            email="no-subscription@test.local",
            hashed_password=get_password_hash("TestPass123!"),
            full_name="No Sub",
            is_active=True,
        )
        db_session.add(user)
        db_session.commit()

        mock_create_order.return_value = {
            "order_uuid": "mio-order-no-sub",
            "status": "PENDING",
            "checkout_url": "https://checkout.mio/no-sub",
        }

        payload = {
            "webhook_type": "invoice.created",
            "invoice": {
                "lago_id": "lago-inv-no-sub-rec",
                "total_amount_cents": 50000,
                "customer": {"external_id": str(user.id)},
                "fees": [],
            }
        }

        handler = LagoWebhookHandler(db_session)
        event = await handler.process(
            event_type="invoice.created",
            event_id="lago_evt_no_sub_rec",
            payload=payload,
        )

        assert event.processed is True
        mock_create_order.assert_called_once()
        order = db_session.query(MioPaymentOrder).filter(
            MioPaymentOrder.lago_invoice_id == "lago-inv-no-sub-rec"
        ).first()
        assert order is not None
        assert order.status == "PENDING"
        # plan_id should be None since there's no subscription
        assert order.plan_id is None

    # --- invoice.paid for users ---

    @pytest.mark.anyio
    async def test_invoice_paid_user_subscription_activated(self, db_session, test_org):
        """invoice.paid for a user sets their UserSubscription to active."""
        from app.core.auth import get_password_hash
        from app.models.user import User
        from app.models.user_subscription import UserSubscription

        plan = db_session.query(SubscriptionPlan).first()

        user = User(
            id=uuid4(),
            tenant_id=test_org.tenant_id,
            email="invoice-paid-user@test.local",
            hashed_password=get_password_hash("TestPass123!"),
            full_name="Invoice Paid User",
            is_active=True,
        )
        db_session.add(user)
        db_session.commit()

        sub = UserSubscription(
            user_id=user.id,
            plan_id=plan.id,
            status="trialing",
            payment_method="card",
            auto_renew=True,
            lago_subscription_id="lago-sub-paid-user",
            lago_customer_id="lago-cust-paid-user",
        )
        db_session.add(sub)
        db_session.commit()

        payload = {
            "webhook_type": "invoice.paid",
            "invoice": {
                "lago_id": "lago-inv-paid-user",
                "customer": {"external_id": str(user.id)},
                "total_amount_cents": 280000,
                "fees": [],
            }
        }

        handler = LagoWebhookHandler(db_session)
        event = await handler.process(
            event_type="invoice.paid",
            event_id="lago_evt_paid_user",
            payload=payload,
        )

        assert event.processed is True
        db_session.refresh(sub)
        assert sub.status == "active"

    @pytest.mark.anyio
    async def test_invoice_paid_user_no_subscription(self, db_session, test_org):
        """invoice.paid for a user with no subscription does not crash."""
        from app.core.auth import get_password_hash
        from app.models.user import User

        user = User(
            id=uuid4(),
            tenant_id=test_org.tenant_id,
            email="paid-no-sub@test.local",
            hashed_password=get_password_hash("TestPass123!"),
            full_name="Paid No Sub",
            is_active=True,
        )
        db_session.add(user)
        db_session.commit()

        payload = {
            "webhook_type": "invoice.paid",
            "invoice": {
                "lago_id": "lago-inv-paid-no-sub",
                "customer": {"external_id": str(user.id)},
                "total_amount_cents": 50000,
                "fees": [],
            }
        }

        handler = LagoWebhookHandler(db_session)
        event = await handler.process(
            event_type="invoice.paid",
            event_id="lago_evt_paid_no_sub",
            payload=payload,
        )

        assert event.processed is True


class TestMioWebhookHandlerExtended:
    """Extended webhook tests for MIO payment gateway."""

    @pytest.mark.anyio
    @patch("app.services.lago_service.LagoService.record_payment")
    async def test_transaction_completed_nested_payload(self, mock_record_payment, db_session, test_org):
        """MIO sometimes sends payload with data.attributes format."""
        order = MioPaymentOrder(
            order_uuid="mio-order-nested",
            lago_invoice_id="lago-inv-nested",
            organization_id=test_org.id,
            amount_cents=100000,
            status="PENDING",
        )
        db_session.add(order)
        db_session.commit()

        mock_record_payment.return_value = {"payment": {"lago_id": "pay-nested"}}

        payload = {
            "data": {
                "attributes": {
                    "uuid": "mio-order-nested",
                    "status": "SUCCESS",
                    "payment": {
                        "id": "pay-nested-1",
                        "authorization_code": "auth-nested",
                        "reference_number": "ref-nested",
                    }
                }
            }
        }

        handler = MioWebhookHandler(db_session)
        await handler.process(
            event_type="TRANSACTION_COMPLETED",
            event_id="mio_evt_nested",
            payload=payload,
        )

        db_session.refresh(order)
        assert order.status == "SUCCESS"
        assert order.reference_number == "ref-nested"
        mock_record_payment.assert_called_once()

    @pytest.mark.anyio
    async def test_transaction_completed_already_success(self, db_session, test_org):
        order = MioPaymentOrder(
            order_uuid="mio-order-already",
            lago_invoice_id="lago-inv-already",
            organization_id=test_org.id,
            amount_cents=100000,
            status="SUCCESS",
        )
        db_session.add(order)
        db_session.commit()

        payload = {
            "order_uuid": "mio-order-already",
            "payment": {
                "id": "pay-already",
                "authorization_code": "auth-already",
                "reference_number": "ref-already",
            }
        }

        handler = MioWebhookHandler(db_session)
        await handler.process(
            event_type="TRANSACTION_COMPLETED",
            event_id="mio_evt_already",
            payload=payload,
        )

        db_session.refresh(order)
        assert order.status == "SUCCESS"  # Still SUCCESS
        # Authorization code should NOT be updated (already SUCCESS, skipped)
        assert order.authorization_code is None

    @pytest.mark.anyio
    async def test_transaction_completed_missing_order(self, db_session, test_org):
        payload = {
            "order_uuid": "mio-order-nonexistent",
            "payment": {"id": "pay-404", "reference_number": "ref-404"},
        }

        handler = MioWebhookHandler(db_session)
        from app.services.payment_intent_service import PaymentIntentError
        with pytest.raises(PaymentIntentError, match="Payment intent with MIO order"):
            await handler.process(
                event_type="TRANSACTION_COMPLETED",
                event_id="mio_evt_missing",
                payload=payload,
            )

    @pytest.mark.anyio
    async def test_transaction_completed_no_order_uuid(self, db_session):
        payload = {"event": "TRANSACTION_COMPLETED"}

        handler = MioWebhookHandler(db_session)
        from app.services.payment_intent_service import PaymentIntentError
        with pytest.raises(PaymentIntentError, match="No order UUID found"):
            await handler.process(
                event_type="TRANSACTION_COMPLETED",
                event_id="mio_evt_no_uuid",
                payload=payload,
            )

    @pytest.mark.anyio
    async def test_mio_webhook_idempotent(self, db_session, test_org):
        event_id = "mio_evt_idempotent"
        order = MioPaymentOrder(
            order_uuid="mio-order-idemp",
            lago_invoice_id="lago-inv-idemp",
            organization_id=test_org.id,
            amount_cents=100000,
            status="PENDING",
        )
        db_session.add(order)
        db_session.commit()

        payload = {
            "order_uuid": "mio-order-idemp",
            "payment": {
                "id": "pay-idemp",
                "authorization_code": "auth-idemp",
                "reference_number": "ref-idemp",
            }
        }

        handler = MioWebhookHandler(db_session)
        event1 = await handler.process(
            event_type="TRANSACTION_COMPLETED",
            event_id=event_id,
            payload=payload,
        )
        event2 = await handler.process(
            event_type="TRANSACTION_COMPLETED",
            event_id=event_id,
            payload=payload,
        )

        assert event1.id == event2.id
        count = db_session.query(BillingWebhookEvent).filter(
            BillingWebhookEvent.event_id == event_id
        ).count()
        assert count == 1

    @pytest.mark.anyio
    @patch("app.services.lago_service.LagoService.record_payment")
    async def test_record_payment_failure_does_not_rollback(
        self, mock_record_payment, db_session, test_org
    ):
        """Even if Lago record_payment fails, the MIO order should still be updated locally."""
        order = MioPaymentOrder(
            order_uuid="mio-order-pay-fail",
            lago_invoice_id="lago-inv-pay-fail",
            organization_id=test_org.id,
            amount_cents=100000,
            status="PENDING",
        )
        db_session.add(order)
        db_session.commit()

        mock_record_payment.side_effect = Exception("Lago network error")

        payload = {
            "order_uuid": "mio-order-pay-fail",
            "payment": {
                "id": "pay-fail",
                "authorization_code": "auth-fail",
                "reference_number": "ref-fail",
            }
        }

        handler = MioWebhookHandler(db_session)
        await handler.process(
            event_type="TRANSACTION_COMPLETED",
            event_id="mio_evt_pay_fail",
            payload=payload,
        )

        # Order should still be updated locally (payment already charged)
        db_session.refresh(order)
        assert order.status == "SUCCESS"
        assert order.reference_number == "ref-fail"


class TestEmailService:
    """Tests for send_purchase_invoice_email."""

    @patch("app.services.email_service._sender")
    def test_send_purchase_invoice_email_success(self, mock_sender):
        mock_sender.send.return_value = {"id": "email-test-id-123"}

        result = send_purchase_invoice_email(
            customer_email="cliente@example.com",
            customer_name="Cliente Test",
            items=[{"label": "Plan Profesional", "quantity": 1, "total": 2800.00}],
            total=2800.00,
        )

        assert result is True
        mock_sender.send.assert_called_once()
        args, kwargs = mock_sender.send.call_args
        assert args[1] == ["cliente@example.com"]
        assert "Plan Profesional" in args[3]
        assert "2800.00" in args[3]

    def test_send_purchase_invoice_email_sends_locally(self):
        result = send_purchase_invoice_email(
            customer_email="cliente@example.com",
            customer_name="Cliente Test",
            items=[],
            total=100.00,
        )
        assert result is True

    @patch("app.services.email_service._sender")
    def test_send_purchase_invoice_send_fails_returns_false(self, mock_sender):
        mock_sender.send.return_value = None

        result = send_purchase_invoice_email(
            customer_email="cliente@example.com",
            customer_name="Cliente Test",
            items=[],
            total=100.00,
        )
        assert result is False


class TestUnhandledWebhookTypes:
    """Tests that unhandled webhook types are logged but don't error."""

    @pytest.mark.anyio
    async def test_lago_unhandled_event_type(self, db_session, test_org):
        handler = LagoWebhookHandler(db_session)
        event = await handler.process(
            event_type="credit_note.generated",
            event_id="lago_evt_unknown",
            payload={"credit_note": {"lago_id": "cn-1", "customer": {"external_id": str(test_org.id)}}},
        )
        assert event.processed is True

    @pytest.mark.anyio
    async def test_mio_unhandled_event_type(self, db_session):
        handler = MioWebhookHandler(db_session)
        event = await handler.process(
            event_type="UNKNOWN_EVENT",
            event_id="mio_evt_unknown",
            payload={"unknown": True},
        )
        assert event.processed is True


class TestPaymentIntentService:
    """Tests for PaymentIntentService lifecycle management."""

    def test_valid_transitions(self):
        from app.models.mio_payment_order import valid_transition
        assert valid_transition("PENDING", "SUCCESS")
        assert valid_transition("PENDING", "FAILED")
        assert valid_transition("PENDING", "EXPIRED")
        assert valid_transition("PENDING", "REPLACED")
        assert valid_transition("PENDING", "RETRYING")
        assert valid_transition("FAILED", "PENDING")
        assert valid_transition("FAILED", "RETRYING")
        assert valid_transition("EXPIRED", "PENDING")
        assert valid_transition("EXPIRED", "RETRYING")
        assert valid_transition("RETRYING", "SUCCESS")
        assert not valid_transition("SUCCESS", "PENDING")
        assert not valid_transition("SUCCESS", "FAILED")
        assert not valid_transition("REPLACED", "PENDING")
        assert not valid_transition("SUCCESS", "EXPIRED")

    @pytest.mark.anyio
    @patch("app.services.mio_service.MioService.create_order")
    async def test_create_intent(self, mock_create, db_session):
        from uuid import uuid4
        mock_create.side_effect = lambda **kw: {
            "order_uuid": str(uuid4()),
            "checkout_url": "https://checkout.test",
        }
        from app.services.payment_intent_service import PaymentIntentService
        svc = PaymentIntentService(db_session)
        intent = await svc.create_or_replace(
            amount_cents=100000,
            description="Test payment",
            context_type="test",
            context_id="test-001",
            user_id="00000000-0000-0000-0000-000000000001",
        )
        assert intent.status == "PENDING"
        assert intent.amount_cents == 100000
        assert intent.context_type == "test"
        assert intent.context_id == "test-001"
        assert intent.expires_at is not None

    @pytest.mark.anyio
    @patch("app.services.mio_service.MioService.create_order")
    @patch("app.services.mio_service.MioService.cancel_order")
    async def test_replace_old_intent(self, mock_cancel, mock_create, db_session):
        from uuid import uuid4
        mock_create.side_effect = lambda **kw: {
            "order_uuid": str(uuid4()),
            "checkout_url": "https://checkout.test",
        }
        from app.services.payment_intent_service import PaymentIntentService
        svc = PaymentIntentService(db_session)
        intent1 = await svc.create_or_replace(
            amount_cents=50000,
            description="Old",
            context_type="replace_test",
            context_id="replace-001",
            user_id="00000000-0000-0000-0000-000000000001",
        )
        intent2 = await svc.create_or_replace(
            amount_cents=75000,
            description="New",
            context_type="replace_test",
            context_id="replace-001",
            user_id="00000000-0000-0000-0000-000000000001",
        )
        db_session.commit()
        db_session.refresh(intent1)
        assert intent1.status == "REPLACED"
        assert intent2.status == "PENDING"
        assert intent2.amount_cents == 75000
        mock_cancel.assert_called_once_with(intent1.order_uuid)

    @pytest.mark.anyio
    @patch("app.services.mio_service.MioService.create_order")
    async def test_replace_different_context_no_conflict(self, mock_create, db_session):
        from uuid import uuid4
        mock_create.side_effect = lambda **kw: {
            "order_uuid": str(uuid4()),
            "checkout_url": "https://checkout.test",
        }
        from app.services.payment_intent_service import PaymentIntentService
        svc = PaymentIntentService(db_session)
        intent1 = await svc.create_or_replace(
            amount_cents=50000,
            description="Context A",
            context_type="test",
            context_id="ctx-A",
            user_id="00000000-0000-0000-0000-000000000001",
        )
        intent2 = await svc.create_or_replace(
            amount_cents=75000,
            description="Context B",
            context_type="test",
            context_id="ctx-B",
            user_id="00000000-0000-0000-0000-000000000001",
        )
        db_session.commit()
        db_session.refresh(intent1)
        assert intent1.status == "PENDING"
        assert intent2.status == "PENDING"

    @pytest.mark.anyio
    @patch("app.services.mio_service.MioService.create_order")
    async def test_idempotency_key(self, mock_create, db_session):
        from uuid import uuid4
        mock_create.side_effect = lambda **kw: {
            "order_uuid": str(uuid4()),
            "checkout_url": "https://checkout.test",
        }
        from app.services.payment_intent_service import PaymentIntentService
        svc = PaymentIntentService(db_session)
        intent1 = await svc.create_or_replace(
            amount_cents=100000,
            description="Test",
            context_type="idemp_test",
            context_id="idemp-001",
            user_id="00000000-0000-0000-0000-000000000001",
            idempotency_key="key-001",
        )
        intent2 = await svc.create_or_replace(
            amount_cents=999999,
            description="Should be ignored",
            context_type="idemp_test",
            context_id="idemp-001",
            user_id="00000000-0000-0000-0000-000000000001",
            idempotency_key="key-001",
        )
        assert intent1.id == intent2.id
        assert intent2.amount_cents == 100000

    @pytest.mark.anyio
    @patch("app.services.mio_service.MioService.create_order")
    async def test_idempotency_allow_retry_after_failure(self, mock_create, db_session):
        from uuid import uuid4
        mock_create.side_effect = lambda **kw: {
            "order_uuid": str(uuid4()),
            "checkout_url": "https://checkout.test",
        }
        from app.services.payment_intent_service import PaymentIntentService
        svc = PaymentIntentService(db_session)
        intent1 = await svc.create_or_replace(
            amount_cents=100000,
            description="Test",
            context_type="idemp_retry",
            context_id="idemp-retry-001",
            user_id="00000000-0000-0000-0000-000000000001",
            idempotency_key="key-retry",
        )
        intent1.status = "FAILED"
        db_session.commit()
        intent2 = await svc.create_or_replace(
            amount_cents=100000,
            description="Retry",
            context_type="idemp_retry",
            context_id="idemp-retry-001",
            user_id="00000000-0000-0000-0000-000000000001",
            idempotency_key="key-retry",
        )
        assert intent2.id != intent1.id

    def test_process_webhook_success(self, db_session):
        from app.services.payment_intent_service import PaymentIntentService
        svc = PaymentIntentService(db_session)

        from app.models.mio_payment_order import MioPaymentOrder as MPO
        intent = MPO(
            order_uuid="mio-wh-success",
            amount_cents=100000,
            status="PENDING",
        )
        db_session.add(intent)
        db_session.commit()

        result = svc.process_webhook_event(
            event_type="TRANSACTION_COMPLETED",
            order_uuid="mio-wh-success",
            new_status="SUCCESS",
            amount_cents=100000,
            payment_data={"id": "pay-1", "authorization_code": "auth-1", "reference_number": "ref-1"},
        )
        assert result.status == "SUCCESS"
        assert result.payment_id == "pay-1"
        assert result.authorization_code == "auth-1"
        assert result.reference_number == "ref-1"

    def test_process_webhook_amount_mismatch(self, db_session):
        from app.services.payment_intent_service import PaymentIntentService, PaymentIntentError
        svc = PaymentIntentService(db_session)

        from app.models.mio_payment_order import MioPaymentOrder as MPO
        intent = MPO(
            order_uuid="mio-wh-amount",
            amount_cents=100000,
            status="PENDING",
        )
        db_session.add(intent)
        db_session.commit()

        with pytest.raises(PaymentIntentError, match="Amount mismatch"):
            svc.process_webhook_event(
                event_type="TRANSACTION_COMPLETED",
                order_uuid="mio-wh-amount",
                new_status="SUCCESS",
                amount_cents=50000,
            )

    def test_process_webhook_invalid_transition(self, db_session):
        from app.services.payment_intent_service import PaymentIntentService, PaymentIntentError
        svc = PaymentIntentService(db_session)

        from app.models.mio_payment_order import MioPaymentOrder as MPO
        intent = MPO(
            order_uuid="mio-wh-bad-trans",
            amount_cents=100000,
            status="SUCCESS",
        )
        db_session.add(intent)
        db_session.commit()

        with pytest.raises(PaymentIntentError, match="Invalid state transition"):
            svc.process_webhook_event(
                event_type="TRANSACTION_FAILED",
                order_uuid="mio-wh-bad-trans",
                new_status="FAILED",
            )

    def test_lazy_expiry(self, db_session):
        from datetime import timedelta
        from app.services.payment_intent_service import PaymentIntentService
        from app.utils.dates import utc_now
        svc = PaymentIntentService(db_session)

        from app.models.mio_payment_order import MioPaymentOrder as MPO
        intent = MPO(
            order_uuid="mio-stale",
            amount_cents=50000,
            status="PENDING",
            expires_at=utc_now() - timedelta(minutes=1),
        )
        db_session.add(intent)
        db_session.commit()

        svc = PaymentIntentService(db_session)
        result = svc.verify_and_expire_stale(intent.id)
        assert result.status == "EXPIRED"

    def test_lazy_expiry_still_valid(self, db_session):
        from datetime import timedelta
        from app.services.payment_intent_service import PaymentIntentService
        from app.utils.dates import utc_now
        svc = PaymentIntentService(db_session)

        from app.models.mio_payment_order import MioPaymentOrder as MPO
        intent = MPO(
            order_uuid="mio-fresh",
            amount_cents=50000,
            status="PENDING",
            expires_at=utc_now() + timedelta(minutes=5),
        )
        db_session.add(intent)
        db_session.commit()

        result = svc.verify_and_expire_stale(intent.id)
        assert result.status == "PENDING"

    def test_expire_all_stale(self, db_session):
        from datetime import timedelta
        from app.services.payment_intent_service import PaymentIntentService
        from app.utils.dates import utc_now
        svc = PaymentIntentService(db_session)

        from app.models.mio_payment_order import MioPaymentOrder as MPO
        for i in range(3):
            db_session.add(MPO(
                order_uuid=f"mio-batch-{i}",
                amount_cents=50000,
                status="PENDING",
                expires_at=utc_now() - timedelta(minutes=5),
            ))
        db_session.commit()

        count = svc.expire_all_stale()
        assert count == 3
        stale = db_session.query(MPO).filter(MPO.status == "PENDING").count()
        assert stale == 0

    def test_invalid_transition_raises(self, db_session):
        from app.services.payment_intent_service import PaymentIntentService, PaymentIntentError
        svc = PaymentIntentService(db_session)

        from app.models.mio_payment_order import MioPaymentOrder as MPO
        intent = MPO(
            order_uuid="mio-invalid-trans",
            amount_cents=50000,
            status="SUCCESS",
        )
        db_session.add(intent)
        db_session.commit()

        with pytest.raises(PaymentIntentError, match="Invalid state transition"):
            svc._transition(intent, "PENDING")
