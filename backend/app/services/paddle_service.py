"""PaddleService — Paddle Billing client wrapper for Fintral."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from paddle_billing import Client, Environment, Options
from paddle_billing.Entities.Shared import (
    CollectionMode,
    CustomData,
)
from paddle_billing.Resources.Customers.Operations import CreateCustomer
from paddle_billing.Resources.Subscriptions.Operations import (
    CancelSubscription,
    PauseSubscription,
    ResumeSubscription,
    SubscriptionIncludes,
    UpdateSubscription,
)
from paddle_billing.Resources.Subscriptions.Operations.Update import (
    SubscriptionUpdateItem,
)
from paddle_billing.Entities.Subscriptions import (
    SubscriptionEffectiveFrom,
    SubscriptionProrationBillingMode,
)
from paddle_billing.Exceptions.ApiError import ApiError

from app import config as settings


@dataclass
class PaddleCustomerInfo:
    paddle_customer_id: str
    email: str
    name: str


class PaddleService:
    """Thin wrapper around Paddle Billing SDK.

    All Paddle API interactions go through this service.
    Handles customer management, subscription lifecycle, and webhook verification.
    """

    _client: Client | None = None

    def get_client(self) -> Client:
        if self._client is None:
            env = (
                Environment.SANDBOX
                if settings.PADDLE_ENVIRONMENT == "sandbox"
                else Environment.PRODUCTION
            )
            self._client = Client(
                settings.PADDLE_API_KEY,
                options=Options(env),
                retry_count=3,
            )
        return self._client

    # ── Customers ────────────────────────────────────────────────────

    def create_customer(
        self,
        email: str,
        name: str,
        org_id: str,
        tenant_id: str,
    ) -> PaddleCustomerInfo:
        """Create a customer in Paddle and return its info."""
        client = self.get_client()
        customer = client.customers.create(
            CreateCustomer(
                email=email,
                name=name,
                custom_data=CustomData({
                    "org_id": org_id,
                    "tenant_id": tenant_id,
                }),
            )
        )
        return PaddleCustomerInfo(
            paddle_customer_id=customer.id,
            email=customer.email,
            name=customer.name or name,
        )

    def get_or_create_customer(
        self,
        email: str,
        name: str,
        org_id: str,
        tenant_id: str,
        existing_paddle_id: str | None = None,
    ) -> PaddleCustomerInfo:
        """Idempotent customer lookup/create.

        If existing_paddle_id is provided, returns it directly.
        Otherwise searches by email, creates if not found.
        """
        if existing_paddle_id:
            return PaddleCustomerInfo(
                paddle_customer_id=existing_paddle_id,
                email=email,
                name=name,
            )

        client = self.get_client()
        try:
            for c in client.customers.list():
                if c.email == email:
                    return PaddleCustomerInfo(
                        paddle_customer_id=c.id,
                        email=c.email,
                        name=c.name or name,
                    )
        except ApiError:
            pass

        return self.create_customer(email, name, org_id, tenant_id)

    # ── Subscriptions ────────────────────────────────────────────────

    def create_manual_subscription(
        self,
        paddle_customer_id: str,
        price_id: str,
        quantity: int = 1,
    ) -> dict[str, Any]:
        """Create a subscription with manual collection mode (for bank transfers).

        Returns the created subscription data dict.
        """
        client = self.get_client()
        sub = client.subscriptions.create(
            customer_id=paddle_customer_id,
            items=[SubscriptionUpdateItem(price_id=price_id, quantity=quantity)],
            collection_mode=CollectionMode.Manual,
        )
        return {
            "subscription_id": sub.id,
            "status": sub.status,
            "items": sub.items,
        }

    def get_subscription(self, paddle_sub_id: str) -> dict[str, Any]:
        """Fetch subscription from Paddle with transaction details."""
        client = self.get_client()
        sub = client.subscriptions.get(
            paddle_sub_id,
            includes=[SubscriptionIncludes.RecurringTransactionDetails],
        )
        return _subscription_to_dict(sub)

    def update_subscription_items(
        self,
        paddle_sub_id: str,
        price_id: str,
        quantity: int = 1,
    ) -> dict[str, Any]:
        """Update subscription items (upgrade/downgrade)."""
        client = self.get_client()
        sub = client.subscriptions.update(
            paddle_sub_id,
            UpdateSubscription(
                items=[SubscriptionUpdateItem(price_id=price_id, quantity=quantity)],
                proration_billing_mode=SubscriptionProrationBillingMode.ProratedImmediately,
            ),
        )
        return _subscription_to_dict(sub)

    def pause_subscription(self, paddle_sub_id: str) -> dict[str, Any]:
        """Pause subscription at next billing period."""
        client = self.get_client()
        sub = client.subscriptions.pause(
            paddle_sub_id,
            PauseSubscription(
                effective_from=SubscriptionEffectiveFrom.NextBillingPeriod,
            ),
        )
        return _subscription_to_dict(sub)

    def resume_subscription(self, paddle_sub_id: str) -> dict[str, Any]:
        """Resume a paused subscription immediately."""
        client = self.get_client()
        sub = client.subscriptions.resume(
            paddle_sub_id,
            ResumeSubscription(
                effective_from=SubscriptionEffectiveFrom.Immediately,
            ),
        )
        return _subscription_to_dict(sub)

    def cancel_subscription(
        self,
        paddle_sub_id: str,
        effective_from: str = "next_billing_period",
    ) -> dict[str, Any]:
        """Cancel subscription. Default: at end of current billing period."""
        client = self.get_client()
        ef = (
            SubscriptionEffectiveFrom.NextBillingPeriod
            if effective_from == "next_billing_period"
            else SubscriptionEffectiveFrom.Immediately
        )
        sub = client.subscriptions.cancel(
            paddle_sub_id,
            CancelSubscription(effective_from=ef),
        )
        return _subscription_to_dict(sub)

    # ── Customer Portal ──────────────────────────────────────────────

    def create_portal_session(
        self,
        paddle_customer_id: str,
        subscription_ids: list[str] | None = None,
    ) -> dict[str, Any]:
        """Generate a Customer Portal session URL for self-service."""
        from paddle_billing.Resources.CustomerPortalSessions.Operations import (
            CreateCustomerPortalSession,
        )

        client = self.get_client()
        session = client.customer_portal_sessions.create(
            paddle_customer_id,
            CreateCustomerPortalSession(
                subscription_ids=subscription_ids or [],
            ),
        )
        return {
            "general_url": session.urls.general.overview,
            "subscription_urls": {
                s.id: s.cancel_subscription
                for s in (session.urls.subscriptions or [])
            },
        }

    # ── Webhook Verification ─────────────────────────────────────────

    def verify_webhook_signature(
        self,
        raw_body: str,
        signature_header: str,
        max_drift_seconds: int = 30,
    ) -> bool:
        """Verify HMAC-SHA256 signature of a Paddle webhook."""
        from paddle_billing.Notifications import Secret, Verifier

        secret = Secret(settings.PADDLE_WEBHOOK_SECRET)
        verifier = Verifier(max_seconds_drift=max_drift_seconds)

        class _FakeRequest:
            def __init__(self, body, sig):
                self.body = body
                self._headers = {"paddle-signature": sig}

            @property
            def headers(self):
                return self._headers

        request = _FakeRequest(raw_body, signature_header)
        return verifier.verify(request, secret)


def _subscription_to_dict(sub: Any) -> dict[str, Any]:
    """Convert a Paddle subscription entity to a plain dict."""
    period = sub.current_billing_period
    return {
        "subscription_id": sub.id,
        "status": sub.status,
        "customer_id": sub.customer_id,
        "items": [
            {
                "price_id": item.price.id if item.price else None,
                "product_id": item.price.product_id if item.price else None,
                "quantity": item.quantity,
            }
            for item in (sub.items or [])
        ],
        "current_billing_period": {
            "starts_at": str(period.starts_at) if period else None,
            "ends_at": str(period.ends_at) if period else None,
        }
        if period
        else None,
        "collection_mode": sub.collection_mode.value if sub.collection_mode else None,
        "scheduled_change": sub.scheduled_change,
        "created_at": str(sub.created_at) if sub.created_at else None,
        "updated_at": str(sub.updated_at) if sub.updated_at else None,
    }
