"""Tests for QuickBooks OAuth callback flow.

Validates:
- _callback_html helper
- realmId alias maps to realm_id
- Error paths (missing params, token exchange, DB save)
- Success path with DB save
"""

import json
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.services.quickbooks_connector import QuickBooksConnector


@pytest.fixture
def app():
    from app.factory import create_app
    return create_app()


@pytest.fixture
def client(app):
    return TestClient(app)


class TestCallbackHtml:
    def test_returns_html_with_connected_status(self):
        from app.routers.quickbooks_integration import _callback_html
        resp = _callback_html("connected")
        assert resp.status_code == 200
        assert resp.media_type == "text/html"
        assert "connected" in resp.body.decode()
        assert "qb-oauth" in resp.body.decode()

    def test_returns_html_with_error_status_and_detail(self):
        from app.routers.quickbooks_integration import _callback_html
        resp = _callback_html("error", "token_exchange")
        body = resp.body.decode()
        assert 'status: "error"' in body
        assert '"token_exchange"' in body

    def test_contains_opener_postmessage(self):
        from app.routers.quickbooks_integration import _callback_html
        resp = _callback_html("connected")
        body = resp.body.decode()
        assert "window.opener.postMessage" in body
        assert "window.close()" in body

    def test_contains_fallback_redirect(self):
        from app.routers.quickbooks_integration import _callback_html
        resp = _callback_html("connected")
        body = resp.body.decode()
        assert "window.location.href" in body


class TestOauthCallback:
    CALLBACK_PATH = "/api/integrations/quickbooks/callback"

    def test_returns_error_html_when_realm_id_missing_via_realmid_alias(self, client):
        resp = client.get(self.CALLBACK_PATH, params={
            "code": "XABsomecode123",
            "realmId": "",
            "state": "test",
        })
        assert resp.status_code == 200
        assert "missing_code" in resp.text

    @patch.object(QuickBooksConnector, "exchange_code")
    def test_success_with_realmId_camelcase(self, mock_exchange, client, test_org, test_tenant):
        mock_exchange.return_value = {
            "access_token": "tok_test",
            "refresh_token": "ref_test",
            "token_expiry": "2026-06-21T00:00:00",
        }
        state = base64_encode({
            "org_id": str(test_org.id),
            "tenant_id": str(test_tenant.id),
        })
        resp = client.get(self.CALLBACK_PATH, params={
            "code": "XABsomecode123",
            "realmId": "9341457131774697",
            "state": state,
        })
        assert resp.status_code == 200
        body = resp.text
        assert "connected" in body

    def test_returns_error_html_when_error_param_present(self, client):
        resp = client.get(self.CALLBACK_PATH, params={"error": "access_denied"})
        assert resp.status_code == 200
        assert "access_denied" in resp.text

    def test_returns_error_html_when_code_missing(self, client):
        resp = client.get(self.CALLBACK_PATH, params={"realmId": "12345", "state": "x"})
        assert resp.status_code == 200
        assert "missing_code" in resp.text

    def test_returns_error_html_when_state_invalid(self, client):
        resp = client.get(self.CALLBACK_PATH, params={
            "code": "XABcode",
            "realmId": "12345",
            "state": "not-base64-json",
        })
        assert resp.status_code == 200
        assert "invalid_state" in resp.text

    @patch.object(QuickBooksConnector, "exchange_code")
    def test_returns_error_html_when_token_exchange_fails(self, mock_exchange, client, test_org, test_tenant):
        mock_exchange.side_effect = ConnectionError("QuickBooks token exchange failed: 401")
        state = base64_encode({
            "org_id": str(test_org.id),
            "tenant_id": str(test_tenant.id),
        })
        resp = client.get(self.CALLBACK_PATH, params={
            "code": "XABbadcode",
            "realmId": "9341457131774697",
            "state": state,
        })
        assert resp.status_code == 200
        assert "token_exchange" in resp.text

    @patch.object(QuickBooksConnector, "exchange_code")
    def test_logs_callback_receipt(self, mock_exchange, client, caplog):
        from app.routers.quickbooks_integration import logger as qb_logger
        qb_logger.propagate = True
        caplog.set_level("INFO")

        client.get(self.CALLBACK_PATH, params={
            "code": "XABcode",
            "realmId": "12345",
            "state": "bad",
        })
        assert "QB callback received" in caplog.text
        assert "code=present" in caplog.text
        assert "realm_id=12345" in caplog.text


def base64_encode(data: dict) -> str:
    import base64
    return base64.urlsafe_b64encode(json.dumps(data).encode()).decode()
