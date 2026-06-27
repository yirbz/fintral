"""LagoService — Lago billing engine API client for Fintral."""

from __future__ import annotations

import logging
from typing import Any, Dict, List
import httpx

from app import config as settings

logger = logging.getLogger(__name__)


class LagoAPIError(Exception):
    """Exception raised for errors in the Lago API."""
    def __init__(self, message: str, status_code: int | None = None, response_body: str | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.response_body = response_body


class LagoService:
    """Service to interact with the self-hosted Lago Billing Engine API.

    Handles customer creation, plan subscriptions, upgrades, cancellations,
    one-off invoicing, payments registration, and event tracking.
    """

    def __init__(self):
        self.base_url = settings.LAGO_API_URL.rstrip("/") + "/api/v1"
        self.api_key = settings.LAGO_API_KEY
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    async def _request(
        self, method: str, path: str, json_data: Dict[str, Any] | None = None, params: Dict[str, Any] | None = None
    ) -> Dict[str, Any]:
        """Make an asynchronous request to the Lago API."""
        url = f"{self.base_url}/{path.lstrip('/')}"
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                response = await client.request(
                    method=method,
                    url=url,
                    headers=self.headers,
                    json=json_data,
                    params=params,
                )
                
                # Check for HTTP errors
                if response.is_error:
                    logger.error(
                        f"Lago API Error [{response.status_code}] on {method} {url}: {response.text}"
                    )
                    raise LagoAPIError(
                        message=f"Lago API error: {response.reason_phrase}",
                        status_code=response.status_code,
                        response_body=response.text,
                    )
                    
                if response.status_code == 204:  # No Content
                    return {}
                    
                return response.json()
            except httpx.RequestError as exc:
                logger.error(f"HTTP Request failed on Lago API {method} {url}: {exc}")
                raise LagoAPIError(message=f"HTTP request failed: {exc}")

    # --- Customers ---
    async def create_or_update_customer(
        self,
        external_id: str,
        name: str,
        email: str,
        rnc: str | None = None,
        currency: str = "DOP",
        timezone: str = "America/Santo_Domingo",
        metadata: List[Dict[str, Any]] | None = None,
    ) -> Dict[str, Any]:
        """Create or update a customer in Lago (Idempotent upsert)."""
        customer_payload: Dict[str, Any] = {
            "external_id": external_id,
            "name": name,
            "email": email,
            "currency": currency,
            "timezone": timezone,
        }

        # Handle DR metadata (RNC/Cédula)
        final_metadata = metadata or []
        if rnc:
            customer_payload["legal_name"] = name
            customer_payload["legal_number"] = rnc
            customer_payload["tax_identification_number"] = rnc
            
            # Check if rnc is already in metadata list
            rnc_exists = any(m.get("key") == "rnc" for m in final_metadata)
            if not rnc_exists:
                final_metadata.append({
                    "key": "rnc",
                    "value": rnc,
                    "display_in_invoice": True
                })

        if final_metadata:
            customer_payload["metadata"] = final_metadata[:5]  # Lago limits to 5 items

        payload = {"customer": customer_payload}
        return await self._request("POST", "customers", json_data=payload)

    # --- Subscriptions ---
    async def create_subscription(
        self,
        customer_external_id: str,
        plan_code: str,
        external_id: str,
        name: str | None = None,
        billing_time: str = "calendar",
    ) -> Dict[str, Any]:
        """Create a new subscription for a customer in Lago."""
        subscription_payload = {
            "external_customer_id": customer_external_id,
            "plan_code": plan_code,
            "external_id": external_id,
            "billing_time": billing_time,
        }
        if name:
            subscription_payload["name"] = name

        payload = {"subscription": subscription_payload}
        return await self._request("POST", "subscriptions", json_data=payload)

    async def upgrade_subscription(
        self,
        customer_external_id: str,
        new_plan_code: str,
        subscription_external_id: str,
    ) -> Dict[str, Any]:
        """Upgrade/Downgrade an existing subscription by providing the new plan_code."""
        payload = {
            "subscription": {
                "external_customer_id": customer_external_id,
                "plan_code": new_plan_code,
                "external_id": subscription_external_id,
            }
        }
        return await self._request("POST", "subscriptions", json_data=payload)

    async def cancel_subscription(self, external_id: str) -> Dict[str, Any]:
        """Terminate a subscription immediately in Lago."""
        return await self._request("DELETE", f"subscriptions/{external_id}")

    async def get_subscription(self, external_id: str) -> Dict[str, Any]:
        """Retrieve subscription details by its external_id."""
        return await self._request("GET", f"subscriptions/{external_id}")

    # --- Invoices ---
    async def get_invoice(self, lago_id: str) -> Dict[str, Any]:
        """Retrieve details of a generated invoice by its Lago ID."""
        return await self._request("GET", f"invoices/{lago_id}")

    async def update_invoice_payment_status(self, lago_id: str, status: str) -> Dict[str, Any]:
        """Update payment status of an invoice. Status can be: 'pending', 'succeeded', 'failed'."""
        payload = {
            "invoice": {
                "payment_status": status
            }
        }
        return await self._request("PUT", f"invoices/{lago_id}", json_data=payload)

    async def create_one_off_invoice(
        self,
        customer_external_id: str,
        fees: List[Dict[str, Any]],
        currency: str = "DOP",
    ) -> Dict[str, Any]:
        """Create a one-off invoice with one or more add-on fees.
        
        fees structure:
        [
            {
                "add_on_code": "setup_fee",
                "units": 1,
                "unit_amount_cents": 500000,
                "description": "Implementación"
            }
        ]
        """
        payload = {
            "invoice": {
                "external_customer_id": customer_external_id,
                "currency": currency,
                "fees": fees,
            }
        }
        return await self._request("POST", "invoices", json_data=payload)

    # --- Payments ---
    async def record_payment(
        self,
        invoice_id: str,
        amount_cents: int,
        reference: str,
        paid_at: str,
    ) -> Dict[str, Any]:
        """Record a payment processed by an external gateway (like MIO or bank transfer)."""
        payload = {
            "payment": {
                "invoice_id": invoice_id,
                "amount_cents": amount_cents,
                "reference": reference,
                "paid_at": paid_at,
            }
        }
        return await self._request("POST", "payments", json_data=payload)

    # --- Usage Event Ingestion ---
    async def send_usage_event(
        self,
        subscription_external_id: str,
        metric_code: str,
        transaction_id: str,
        properties: Dict[str, Any] | None = None,
    ) -> Dict[str, Any]:
        """Ingest a usage event to track meter billing metrics.
        
        transaction_id is the idempotency key (deduplicated).
        """
        event_payload = {
            "transaction_id": transaction_id,
            "external_subscription_id": subscription_external_id,
            "code": metric_code,
            "timestamp": int(httpx.Client().get("https://worldtimeapi.org/api/timezone/America/Santo_Domingo").json()["unixtime"]),
        }
        if properties:
            event_payload["properties"] = properties

        payload = {"event": event_payload}
        return await self._request("POST", "events", json_data=payload)

    # --- Taxes ---
    async def create_tax(self, name: str, code: str, rate: float, description: str | None = None) -> Dict[str, Any]:
        """Create a tax configuration in Lago (e.g., ITBIS 18%)."""
        tax_payload = {
            "name": name,
            "code": code,
            "rate": rate,
        }
        if description:
            tax_payload["description"] = description

        payload = {"tax": tax_payload}
        return await self._request("POST", "taxes", json_data=payload)
