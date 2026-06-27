"""Unit tests for Lago + MIO billing refactor implementation."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from uuid import uuid4
from datetime import datetime

from app.models import (
    SubscriptionPlan,
    OrganizationSubscription,
    Organization,
    BillingWebhookEvent,
    MioPaymentOrder
)
from app.services.lago_service import LagoService, LagoAPIError
from app.services.mio_service import MioService, MioAPIError
from app.services.billing_checkout_service import BillingCheckoutService
from app.services.lago_webhook_handler import LagoWebhookHandler
from app.services.mio_webhook_handler import MioWebhookHandler


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
        assert order.amount_cents == 50000


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
