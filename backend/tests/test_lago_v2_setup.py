"""Tests for Lago v2 setup (seed plans, addons, invoice custom sections)."""

import pytest
from unittest.mock import patch, AsyncMock
from app.services.lago_setup import (
    _validate_env,
    verify_lago_connectivity,
)


class TestLagoV2Setup:
    """Tests for Lago setup functions."""

    def test_validate_env_no_key_in_dev_does_not_raise(self):
        """In development, missing key only warns, does not raise."""
        with patch("app.services.lago_setup.LAGO_API_KEY", ""):
            with patch("app.services.lago_setup.IS_PRODUCTION", False):
                _validate_env()

    def test_validate_env_no_key_in_prod_raises(self):
        """In production, missing key raises RuntimeError."""
        with patch("app.services.lago_setup.LAGO_API_KEY", ""):
            with patch("app.services.lago_setup.IS_PRODUCTION", True):
                with pytest.raises(RuntimeError):
                    _validate_env()

    @pytest.mark.anyio
    @patch("httpx.AsyncClient")
    async def test_verify_connectivity_success(self, mock_client_cls):
        """Returns True when Lago responds 200."""
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__.return_value = mock_client
        mock_response = AsyncMock()
        mock_response.status_code = 200
        mock_client.get.return_value = mock_response

        with patch("app.services.lago_setup.LAGO_API_KEY", "valid-key"):
            result = await verify_lago_connectivity()
            assert result is True

    @pytest.mark.anyio
    @patch("httpx.AsyncClient")
    async def test_verify_connectivity_401_returns_false(self, mock_client_cls):
        """Returns False when Lago returns 401 (key rejected)."""
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__.return_value = mock_client
        mock_response = AsyncMock()
        mock_response.status_code = 401
        mock_client.get.return_value = mock_response

        with patch("app.services.lago_setup.LAGO_API_KEY", "bad-key"):
            result = await verify_lago_connectivity()
            assert result is False

    @pytest.mark.anyio
    @patch("httpx.AsyncClient")
    async def test_verify_connectivity_no_key_returns_false(self, mock_client_cls):
        """Returns False when no API key is configured."""
        with patch("app.services.lago_setup.LAGO_API_KEY", ""):
            result = await verify_lago_connectivity()
            assert result is False
