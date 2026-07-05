"""Tests for Lago v2 enhanced service methods."""

import pytest
from unittest.mock import patch, MagicMock
from app.services.lago_service import LagoService


class TestLagoV2Service:
    """Tests for new LagoService methods added in Lago v2."""

    @pytest.fixture
    def lago(self):
        return LagoService()

    @pytest.mark.anyio
    @patch("httpx.AsyncClient.request")
    async def test_preview_subscription_change_sends_correct_payload(self, mock_request, lago):
        """Preview subscription change sends customer, plan, and sub IDs."""
        mock_response = MagicMock()
        mock_response.is_error = False
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "invoice": {
                "total_amount_cents": 5000,
                "currency": "DOP",
                "line_items": [{"name": "New Plan Fee", "amount_cents": 5000}],
            }
        }
        mock_request.return_value = mock_response

        result = await lago.preview_subscription_change(
            customer_external_id="org_123",
            plan_code="profesional",
            subscription_external_id="sub_123_inicial",
        )

        assert result["invoice"]["total_amount_cents"] == 5000
        mock_request.assert_called_once()

    @pytest.mark.anyio
    @patch("httpx.AsyncClient.request")
    async def test_preview_subscription_change_fails_on_lago_error(self, mock_request, lago):
        """Raises LagoAPIError when Lago returns an error."""
        mock_response = MagicMock()
        mock_response.is_error = True
        mock_response.status_code = 422
        mock_response.reason_phrase = "Unprocessable Entity"
        mock_response.text = '{"error": "plan not found"}'
        mock_request.return_value = mock_response

        from app.services.lago_service import LagoAPIError

        with pytest.raises(LagoAPIError):
            await lago.preview_subscription_change(
                customer_external_id="org_123",
                plan_code="nonexistent",
                subscription_external_id="sub_123",
            )

    @pytest.mark.anyio
    @patch("httpx.AsyncClient.request")
    async def test_create_payment_request_with_email(self, mock_request, lago):
        """Payment request includes email for dunning notifications."""
        mock_response = MagicMock()
        mock_response.is_error = False
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "payment_request": {"lago_id": "req_123", "status": "pending"}
        }
        mock_request.return_value = mock_response

        result = await lago.create_payment_request(
            customer_external_id="org_123",
            lago_invoice_ids=["inv_1", "inv_2"],
            email="admin@fintral.com",
        )

        assert result["payment_request"]["lago_id"] == "req_123"

    @pytest.mark.anyio
    @patch("httpx.AsyncClient.request")
    async def test_create_payment_request_without_email(self, mock_request, lago):
        """Payment request works without email."""
        mock_response = MagicMock()
        mock_response.is_error = False
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "payment_request": {"lago_id": "req_456", "status": "pending"}
        }
        mock_request.return_value = mock_response

        result = await lago.create_payment_request(
            customer_external_id="org_123",
            lago_invoice_ids=["inv_3"],
        )

        assert result["payment_request"]["lago_id"] == "req_456"

    @pytest.mark.anyio
    @patch("httpx.AsyncClient.request")
    async def test_get_upcoming_invoices(self, mock_request, lago):
        """Get upcoming invoices for a customer."""
        mock_response = MagicMock()
        mock_response.is_error = False
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "invoices": [{"lago_id": "inv_upcoming", "amount_cents": 99900}]
        }
        mock_request.return_value = mock_response

        result = await lago.get_upcoming_invoices(customer_external_id="org_123")
        assert len(result["invoices"]) == 1
        assert result["invoices"][0]["amount_cents"] == 99900

    @pytest.mark.anyio
    @patch("httpx.AsyncClient.request")
    async def test_finalize_invoice(self, mock_request, lago):
        """Finalize a draft invoice."""
        mock_response = MagicMock()
        mock_response.is_error = False
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "invoice": {"lago_id": "inv_1", "status": "finalized"}
        }
        mock_request.return_value = mock_response

        result = await lago.finalize_invoice(lago_id="inv_1")
        assert result["invoice"]["status"] == "finalized"

    @pytest.mark.anyio
    @patch("httpx.AsyncClient.request")
    async def test_void_invoice(self, mock_request, lago):
        """Void a finalized invoice."""
        mock_response = MagicMock()
        mock_response.is_error = False
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "invoice": {"lago_id": "inv_1", "status": "voided"}
        }
        mock_request.return_value = mock_response

        result = await lago.void_invoice(lago_id="inv_1")
        assert result["invoice"]["status"] == "voided"

    @pytest.mark.anyio
    @patch("httpx.AsyncClient.request")
    async def test_list_invoices_with_filters(self, mock_request, lago):
        """List invoices filtered by customer and status."""
        mock_response = MagicMock()
        mock_response.is_error = False
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "invoices": [{"lago_id": "inv_1"}, {"lago_id": "inv_2"}]
        }
        mock_request.return_value = mock_response

        result = await lago.list_invoices(
            customer_external_id="org_123",
            status="finalized",
            page=1,
            per_page=10,
        )
        assert len(result["invoices"]) == 2

    @pytest.mark.anyio
    @patch("httpx.AsyncClient.request")
    async def test_get_subscription_upcoming_charges(self, mock_request, lago):
        """Get upcoming charges for a subscription."""
        mock_response = MagicMock()
        mock_response.is_error = False
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "amount_cents": 99900,
            "currency": "DOP",
        }
        mock_request.return_value = mock_response

        result = await lago.get_subscription_upcoming_charges(
            subscription_external_id="sub_123"
        )
        assert result["amount_cents"] == 99900

    @pytest.mark.anyio
    @patch("httpx.AsyncClient.request")
    async def test_anniversary_billing_default(self, mock_request, lago):
        """Create subscription defaults to anniversary billing."""
        mock_response = MagicMock()
        mock_response.is_error = False
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "subscription": {"lago_id": "sub_1", "billing_time": "anniversary"}
        }
        mock_request.return_value = mock_response

        await lago.create_subscription(
            customer_external_id="org_123",
            plan_code="inicial",
            external_id="sub_org123_inicial",
        )

        # Verify the default billing_time was sent
        call_kwargs = mock_request.call_args[1]
        payload = call_kwargs["json"]
        assert payload["subscription"]["billing_time"] == "anniversary"
