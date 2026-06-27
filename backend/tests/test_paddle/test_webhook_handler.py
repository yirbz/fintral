"""Unit tests for Paddle webhook handler — idempotency and event processing."""

import pytest

from app.services.paddle_webhook_handler import PaddleWebhookHandler


@pytest.fixture
def db_session():
    """In-memory SQLite session for testing."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.database import Base

    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def make_event(
    event_type: str,
    event_id: str = "evt_01h1vjes1y163xfj1rh1tkfb65",
    **data_overrides,
) -> dict:
    """Build a realistic Paddle webhook payload."""
    data = {
        "id": "sub_01h1vjes1y163xfj1rh1tkfb65",
        "status": "active",
        "customer_id": "ctm_01h1vjes1y163xfj1rh1tkfb65",
        "items": [
            {
                "price": {
                    "id": "pri_01hsxycme6m95sejkz7sbz5e9g",
                    "product_id": "pro_01hsxycme6m95sejkz7sbz5e9g",
                },
                "quantity": 1,
            }
        ],
        "current_billing_period": {
            "starts_at": "2026-06-20T00:00:00Z",
            "ends_at": "2026-07-20T00:00:00Z",
        },
        "collection_mode": "automatic",
        "scheduled_change": None,
        **data_overrides,
    }
    return {
        "event_id": event_id,
        "event_type": event_type,
        "occurred_at": "2026-06-20T12:00:00Z",
        "data": data,
    }


class TestPaddleWebhookHandler:
    """Test webhook event processing and idempotency."""

    def test_process_subscription_created(self, db_session):
        event = make_event("subscription.created")
        handler = PaddleWebhookHandler(db_session)
        result = handler.process(
            event_type=event["event_type"],
            event_id=event["event_id"],
            payload=event,
        )

        assert result.processed is True
        assert result.event_type == "subscription.created"

        from app.models.organization_subscription import OrganizationSubscription

        sub = (
            db_session.query(OrganizationSubscription)
            .filter(OrganizationSubscription.paddle_subscription_id == "sub_01h1vjes1y163xfj1rh1tkfb65")
            .first()
        )
        assert sub is not None
        assert sub.paddle_customer_id == "ctm_01h1vjes1y163xfj1rh1tkfb65"

    def test_idempotency_skip_duplicate(self, db_session):
        event = make_event("subscription.created")
        handler = PaddleWebhookHandler(db_session)

        result1 = handler.process(
            event_type=event["event_type"],
            event_id=event["event_id"],
            payload=event,
        )
        assert result1.processed is True

        result2 = handler.process(
            event_type=event["event_type"],
            event_id=event["event_id"],
            payload=event,
        )
        assert result2.processed is False

        from app.models.billing_webhook_event import BillingWebhookEvent

        count = db_session.query(BillingWebhookEvent).filter(
            BillingWebhookEvent.event_id == event["event_id"]
        ).count()
        assert count == 1

    def test_subscription_activated(self, db_session):
        event = make_event("subscription.activated")
        handler = PaddleWebhookHandler(db_session)

        result = handler.process(
            event_type=event["event_type"],
            event_id=event["event_id"],
            payload=event,
        )
        assert result.processed is True

        from app.models.organization_subscription import OrganizationSubscription

        sub = (
            db_session.query(OrganizationSubscription)
            .filter(OrganizationSubscription.paddle_subscription_id == "sub_01h1vjes1y163xfj1rh1tkfb65")
            .first()
        )
        assert sub is not None
        assert sub.status == "active"

    def test_subscription_canceled(self, db_session):
        # Create first, then cancel
        create = make_event("subscription.created", event_id="evt_001")
        handler = PaddleWebhookHandler(db_session)
        handler.process(
            event_type=create["event_type"],
            event_id=create["event_id"],
            payload=create,
        )

        cancel = make_event("subscription.canceled", event_id="evt_002")
        handler.process(
            event_type=cancel["event_type"],
            event_id=cancel["event_id"],
            payload=cancel,
        )

        from app.models.organization_subscription import OrganizationSubscription

        sub = (
            db_session.query(OrganizationSubscription)
            .filter(OrganizationSubscription.paddle_subscription_id == "sub_01h1vjes1y163xfj1rh1tkfb65")
            .first()
        )
        assert sub.status == "canceled"

    def test_subscription_past_due(self, db_session):
        create = make_event("subscription.created", event_id="evt_001")
        handler = PaddleWebhookHandler(db_session)
        handler.process(
            event_type=create["event_type"],
            event_id=create["event_id"],
            payload=create,
        )

        past_due = make_event(
            "subscription.past_due",
            event_id="evt_002",
            status="past_due",
        )
        handler.process(
            event_type=past_due["event_type"],
            event_id=past_due["event_id"],
            payload=past_due,
        )

        from app.models.organization_subscription import OrganizationSubscription

        sub = (
            db_session.query(OrganizationSubscription)
            .filter(OrganizationSubscription.paddle_subscription_id == "sub_01h1vjes1y163xfj1rh1tkfb65")
            .first()
        )
        assert sub.status == "past_due"

    def test_event_unhandled_type_does_not_crash(self, db_session):
        event = make_event("unknown.event.type", event_id="evt_999")
        handler = PaddleWebhookHandler(db_session)

        result = handler.process(
            event_type=event["event_type"],
            event_id=event["event_id"],
            payload=event,
        )
        assert result.processed is True

    def test_processing_error_logged(self, db_session):
        event_data = make_event("subscription.created")
        # Corrupt data to force an error
        event_data["data"] = None

        handler = PaddleWebhookHandler(db_session)
        result = handler.process(
            event_type=event_data["event_type"],
            event_id=event_data["event_id"],
            payload=event_data,
        )

        assert result.processed is False
        assert result.error is not None
        assert result.attempts >= 1
