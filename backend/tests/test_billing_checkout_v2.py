"""Tests for BillingCheckoutService v2 methods."""

import pytest
from unittest.mock import MagicMock, AsyncMock
from app.services.billing_checkout_service import BillingCheckoutService


class TestBillingCheckoutV2:
    """Tests for new BillingCheckoutService methods."""

    @pytest.fixture
    def db_mock(self):
        return MagicMock()

    @pytest.fixture
    def checkout_svc(self, db_mock):
        svc = BillingCheckoutService(db_mock)
        svc.lago = AsyncMock()
        svc.mio = AsyncMock()
        return svc

    @pytest.mark.anyio
    async def test_process_complete_cart_empty_items(self, checkout_svc):
        """Empty cart raises ValueError."""
        with pytest.raises(ValueError, match="vacío"):
            await checkout_svc.process_complete_cart(
                org_id="org_123", user_id="user_123", items=[], payment_method="card"
            )

    @pytest.mark.anyio
    async def test_preview_plan_change_no_active_sub(self, checkout_svc, db_mock):
        """Without active subscription, returns simple price with is_new=True."""
        mock_org = MagicMock()
        mock_org.name = "Test Org"
        mock_org.email_contact = "admin@test.com"
        mock_org.tax_id = ""
        mock_org.price_dop = 2800.0
        mock_org.lago_plan_code = "profesional"

        # query().filter().first() returns mock_org (shared for org + plan lookups)
        db_mock.query.return_value.filter.return_value.first.return_value = mock_org
        # query().filter().order_by().first() returns None (no active sub)
        db_mock.query.return_value.filter.return_value.order_by.return_value.first.return_value = None

        result = await checkout_svc.preview_plan_change(
            org_id="org_123", new_plan_name="profesional"
        )
        assert result.get("is_new") is True
        assert result.get("price_cents") == 280000

    @pytest.mark.anyio
    async def test_get_next_billing_no_subscription(self, checkout_svc, db_mock):
        """Without subscription, returns has_subscription=False."""
        mock_org = MagicMock()
        mock_org.id = "org_123"

        db_mock.query.return_value.filter.return_value.first.return_value = mock_org
        # query().filter().order_by().first() returns None (no active sub)
        db_mock.query.return_value.filter.return_value.order_by.return_value.first.return_value = None

        result = await checkout_svc.get_next_billing_info(org_id="org_123")
        assert result["has_subscription"] is False
        assert result["next_billing_date"] is None
