"""MioService — MIO (GeoPagos) payment gateway client for Fintral."""

from __future__ import annotations

import logging
import time
from typing import Any, Dict, Optional
import httpx

from app import config as settings

logger = logging.getLogger(__name__)


class MioAPIError(Exception):
    """Exception raised for errors in the MIO API."""
    def __init__(self, message: str, status_code: int | None = None, response_body: str | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.response_body = response_body


class MioService:
    """Service to interact with the MIO (GeoPagos) Dominican Republic payment gateway.

    Handles tokenized authentications, hosted order checkouts, payment status, and refunds.
    """

    # In-memory JWT cache
    _access_token: str | None = None
    _token_expires_at: float = 0.0

    def __init__(self):
        self.api_base_url = settings.MIO_API_BASE_URL.rstrip("/")
        self.auth_url = settings.MIO_AUTH_URL.rstrip("/")
        self.client_id = settings.MIO_CLIENT_ID
        self.client_secret = settings.MIO_CLIENT_SECRET

    async def _get_token(self) -> str:
        """Retrieve and cache a valid JWT access token using client credentials flow."""
        current_time = time.time()
        
        # Check cache (with 60 seconds buffer)
        if MioService._access_token and current_time < (MioService._token_expires_at - 60):
            return MioService._access_token

        url = f"{self.auth_url}/oauth/token"
        payload = {
            "grant_type": "client_credentials",
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "scope": "*",
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                logger.info(f"Authenticating with MIO Auth Server: {url}")
                response = await client.post(url, json=payload)
                
                if response.is_error:
                    logger.error(f"MIO OAuth failed [{response.status_code}]: {response.text}")
                    raise MioAPIError(
                        message="Failed to authenticate with MIO payment gateway",
                        status_code=response.status_code,
                        response_body=response.text,
                    )
                
                data = response.json()
                MioService._access_token = data["access_token"]
                expires_in = data.get("expires_in", 3600)
                MioService._token_expires_at = current_time + float(expires_in)
                
                logger.info("Successfully authenticated with MIO gateway, token cached.")
                return MioService._access_token
            except httpx.RequestError as exc:
                logger.error(f"HTTP Connection to MIO Auth Server failed: {exc}")
                raise MioAPIError(message=f"MIO Auth connection error: {exc}")

    async def _request(
        self, method: str, path: str, json_data: Dict[str, Any] | None = None, params: Dict[str, Any] | None = None
    ) -> Dict[str, Any]:
        """Make an authenticated asynchronous request to MIO API."""
        token = await self._get_token()
        url = f"{self.api_base_url}/{path.lstrip('/')}"
        
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/vnd.api+json",
            "Accept": "application/vnd.api+json",
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                response = await client.request(
                    method=method,
                    url=url,
                    headers=headers,
                    json=json_data,
                    params=params,
                )
                
                if response.is_error:
                    logger.error(
                        f"MIO API Error [{response.status_code}] on {method} {url}: {response.text}"
                    )
                    raise MioAPIError(
                        message=f"MIO API error: {response.reason_phrase}",
                        status_code=response.status_code,
                        response_body=response.text,
                    )
                    
                if response.status_code == 204:
                    return {}
                    
                return response.json()
            except httpx.RequestError as exc:
                logger.error(f"HTTP Request failed on MIO API {method} {url}: {exc}")
                raise MioAPIError(message=f"HTTP request failed: {exc}")

    async def create_order(
        self,
        amount_cents: int,
        description: str,
        webhook_url: str,
        success_url: str,
        failed_url: str,
        currency_code: str = "214",  # 214 is ISO Numeric for DOP (Dominican Peso)
    ) -> Dict[str, Any]:
        """Create a checkout order on MIO.
        
        Returns the checkout URL for hosted checkout redirection and the MIO order UUID.
        """
        # MIO/GeoPagos expects JSON API spec body format:
        payload = {
            "data": {
                "attributes": {
                    "currency": currency_code,
                    "items": [
                        {
                            "id": 1,
                            "name": description,
                            "unitPrice": {
                                "currency": currency_code,
                                "amount": amount_cents,  # amount in cents
                            },
                            "quantity": 1
                        }
                    ],
                    "redirect_urls": {
                        "success": success_url,
                        "failed": failed_url
                    },
                    "webhookUrl": webhook_url
                }
            }
        }

        logger.info(f"Creating MIO checkout order for {amount_cents} DOP centavos")
        resp = await self._request("POST", "api/v2/orders", json_data=payload)
        
        attributes = resp.get("data", {}).get("attributes", {})
        return {
            "order_uuid": attributes.get("uuid"),
            "status": attributes.get("status"),
            "checkout_url": attributes.get("links", {}).get("checkout"),
        }

    async def get_order_status(self, order_uuid: str) -> Dict[str, Any]:
        """Retrieve details and payment status of a MIO order by its UUID."""
        resp = await self._request("GET", f"api/v2/orders/{order_uuid}")
        attributes = resp.get("data", {}).get("attributes", {})
        
        return {
            "order_uuid": attributes.get("uuid"),
            "status": attributes.get("status"),  # PENDING, SUCCESS, FAILED, EXPIRED
            "payment_id": attributes.get("payment", {}).get("id"),
            "authorization_code": attributes.get("payment", {}).get("authorization_code"),
            "reference_number": attributes.get("payment", {}).get("reference_number"),
            "raw_attributes": attributes
        }

    async def refund(self, reference_number: str) -> Dict[str, Any]:
        """Issue a refund for a successful transaction using its reference number."""
        payload = {
            "data": {
                "attributes": {
                    "refNumber": reference_number
                }
            }
        }
        
        logger.info(f"Requesting MIO refund for transaction reference: {reference_number}")
        # Note: Refunds API in GeoPagos uses v1 endpoint
        headers = {
            "Content-Type": "application/vnd.api+json",
            "Accept": "application/json",
        }
        token = await self._get_token()
        url = f"{self.api_base_url}/api/v1/refunds"
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                response = await client.post(
                    url,
                    headers={"Authorization": f"Bearer {token}", **headers},
                    json=payload
                )
                if response.is_error:
                    logger.error(f"MIO Refund failed [{response.status_code}]: {response.text}")
                    raise MioAPIError(
                        message="Refund request declined by MIO API",
                        status_code=response.status_code,
                        response_body=response.text,
                    )
                return response.json()
            except httpx.RequestError as exc:
                logger.error(f"HTTP request failed on MIO Refund API: {exc}")
                raise MioAPIError(message=f"Refund request failed: {exc}")
