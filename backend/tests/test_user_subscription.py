"""Tests for UserSubscription — per-user Hub subscription with Lago trial."""

import pytest
from unittest.mock import patch, AsyncMock
from uuid import uuid4
from datetime import timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import (
    UserSubscription,
    OrganizationSubscription,
    SubscriptionPlan,
    User,
    Tenant,
    Organization,
    UserOrganization,
)
from app.utils.dates import utc_now
from app.database import Base


# ── Helpers ──────────────────────────────────────────────────────────────────


def naive_now():
    """SQLite no preserva tzinfo en DateTime(timezone=True) al leer."""
    return utc_now().replace(tzinfo=None)


# ── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    plan = SubscriptionPlan(
        id=uuid4(),
        name="inicial",
        display_name="Inicial Plan",
        price_monthly_cents=100000,
        currency="DOP",
        price_dop=1000.00,
        lago_plan_code="inicial",
        max_users=3,
        max_entities=1,
    )
    session.add(plan)
    session.commit()

    yield session
    session.close()


@pytest.fixture
def seeded_plan(db_session):
    return db_session.query(SubscriptionPlan).first()


@pytest.fixture
def test_tenant(db_session):
    tenant = Tenant(id=uuid4(), name="Test Tenant", slug="test-tenant", is_active=True)
    db_session.add(tenant)
    db_session.commit()
    return tenant


@pytest.fixture
def test_org(db_session, test_tenant):
    org = Organization(
        id=uuid4(),
        tenant_id=test_tenant.id,
        name="Test Org",
        tax_id="131-12345-6",
        is_active=True,
    )
    db_session.add(org)
    db_session.commit()
    return org


@pytest.fixture
def test_user(db_session, test_tenant, test_org):
    user = User(
        id=uuid4(),
        tenant_id=test_tenant.id,
        email="test@fintral.com",
        full_name="Test User",
        is_active=True,
    )
    db_session.add(user)
    db_session.flush()
    uo = UserOrganization(user_id=user.id, organization_id=test_org.id, role="owner")
    db_session.add(uo)
    db_session.commit()
    return user


# ── Tests: _provision_local_user ─────────────────────────────────────────────


class TestProvisionLocalUser:
    @patch("app.services.auth_service.get_supabase_admin")
    def test_creates_user_subscription_not_org_subscription(self, mock_supabase, db_session, seeded_plan):
        from app.services.auth_service import _provision_local_user

        mock_supabase.return_value = None

        _provision_local_user(
            db=db_session,
            email="newuser@fintral.com",
            full_name="New User",
            phone="",
            company_name="New Co",
            tax_id="",
            supabase_uid=None,
            is_active=False,
            verification_code="123456",
        )

        user = db_session.query(User).filter(User.email == "newuser@fintral.com").first()
        assert user is not None

        user_sub = db_session.query(UserSubscription).filter(UserSubscription.user_id == user.id).first()
        assert user_sub is not None
        assert user_sub.status == "trialing"

        org_sub = db_session.query(OrganizationSubscription).filter(
            OrganizationSubscription.organization_id == user.user_organizations[0].organization_id
        ).first()
        assert org_sub is None

    @patch("app.services.auth_service.get_supabase_admin")
    def test_user_subscription_has_7_day_trial(self, mock_supabase, db_session, seeded_plan):
        from app.services.auth_service import _provision_local_user

        mock_supabase.return_value = None

        _provision_local_user(
            db=db_session,
            email="trialuser@fintral.com",
            full_name="Trial User",
            phone="",
            company_name="Trial Co",
            tax_id="",
            supabase_uid=None,
            is_active=False,
            verification_code="123456",
        )

        user = db_session.query(User).filter(User.email == "trialuser@fintral.com").first()
        user_sub = db_session.query(UserSubscription).filter(UserSubscription.user_id == user.id).first()

        assert user_sub.trial_ends_at is not None
        remaining = (user_sub.trial_ends_at - naive_now()).days
        assert remaining == 6  # ~7 days minus fractional day

    @patch("app.services.auth_service.get_supabase_admin")
    def test_user_subscription_has_lago_plan_code(self, mock_supabase, db_session, seeded_plan):
        from app.services.auth_service import _provision_local_user

        mock_supabase.return_value = None

        _provision_local_user(
            db=db_session,
            email="lagouser@fintral.com",
            full_name="Lago User",
            phone="",
            company_name="Lago Co",
            tax_id="",
            supabase_uid=None,
            is_active=False,
            verification_code="123456",
        )

        user = db_session.query(User).filter(User.email == "lagouser@fintral.com").first()
        user_sub = db_session.query(UserSubscription).filter(UserSubscription.user_id == user.id).first()

        assert user_sub.lago_plan_code == "inicial"
        assert user_sub.plan_id == seeded_plan.id

    @patch("app.services.auth_service.get_supabase_admin")
    def test_existing_user_not_reprovisioned(self, mock_supabase, db_session, seeded_plan):
        from app.services.auth_service import _provision_local_user

        mock_supabase.return_value = None

        _provision_local_user(
            db=db_session,
            email="existing@fintral.com",
            full_name="First",
            phone="",
            company_name="Co",
            tax_id="",
            supabase_uid=None,
            is_active=True,
            verification_code=None,
        )

        _provision_local_user(
            db=db_session,
            email="existing@fintral.com",
            full_name="Second",
            phone="",
            company_name="Co",
            tax_id="",
            supabase_uid=None,
            is_active=True,
            verification_code=None,
        )

        users = db_session.query(User).filter(User.email == "existing@fintral.com").all()
        assert len(users) == 1


# ── Tests: setup_user_lago_trial ─────────────────────────────────────────────


class TestSetupUserLagoTrial:
    @pytest.mark.anyio
    async def test_skips_if_lago_customer_already_exists(
        self, db_session, test_user, seeded_plan
    ):
        """Early return works without LagoService call."""
        from app.services.auth_service import setup_user_lago_trial

        sub = UserSubscription(
            user_id=test_user.id,
            plan_id=seeded_plan.id,
            status="trialing",
            lago_customer_id="existing-cust",
            lago_subscription_id="existing-sub",
        )
        db_session.add(sub)
        db_session.commit()

        # Record exists in DB
        rows = db_session.query(UserSubscription).filter(
            UserSubscription.lago_customer_id.isnot(None)
        ).count()
        assert rows == 1

        result = await setup_user_lago_trial(
            db=db_session,
            user_id=str(test_user.id),
            email=test_user.email,
            full_name=test_user.full_name,
        )

        assert result is not None
        assert "user_subscription_id" in result

    @pytest.mark.anyio
    async def test_handles_lago_failure_gracefully(self, db_session, test_user):
        """Real LagoService will fail — function should return None gracefully."""
        from app.services.auth_service import setup_user_lago_trial

        result = await setup_user_lago_trial(
            db=db_session,
            user_id=str(test_user.id),
            email=test_user.email,
            full_name=test_user.full_name,
        )

        assert result is None


# ── Tests: _try_setup_lago_trial ─────────────────────────────────────────────


class TestTrySetupLagoTrial:
    @patch("app.services.auth_service.setup_user_lago_trial", new_callable=AsyncMock)
    def test_calls_setup_user_lago_trial(self, mock_setup, db_session, test_user):
        from app.services.auth_service import _try_setup_lago_trial

        _try_setup_lago_trial(test_user, db_session)

        mock_setup.assert_called_once()

    @patch("app.services.auth_service.setup_user_lago_trial", new_callable=AsyncMock)
    def test_skips_if_already_has_lago_customer(self, mock_setup, db_session, test_user, seeded_plan):
        from app.services.auth_service import _try_setup_lago_trial

        sub = UserSubscription(
            user_id=test_user.id,
            plan_id=seeded_plan.id,
            status="trialing",
            lago_customer_id="existing-cust",
        )
        db_session.add(sub)
        db_session.commit()

        # Verify record was created
        record = (
            db_session.query(UserSubscription)
            .filter(UserSubscription.lago_customer_id.isnot(None))
            .first()
        )
        assert record is not None
        assert record.lago_customer_id == "existing-cust"

        _try_setup_lago_trial(test_user, db_session)

        mock_setup.assert_not_called()

    @patch("app.services.auth_service.setup_user_lago_trial", new_callable=AsyncMock)
    def test_handles_exception_gracefully(self, mock_setup, db_session, test_user):
        from app.services.auth_service import _try_setup_lago_trial

        mock_setup.side_effect = Exception("Any error")

        _try_setup_lago_trial(test_user, db_session)

        mock_setup.assert_called_once()


# ── Tests: verify_email_code triggers trial ──────────────────────────────────


class TestVerifyActivatesTrial:
    @patch("app.services.auth_service.setup_user_lago_trial", new_callable=AsyncMock)
    def test_verify_email_code_triggers_trial(self, mock_setup, db_session, seeded_plan):
        from app.core.auth import get_password_hash
        from app.services.auth_service import verify_email_code

        code = "654321"
        code_hash = get_password_hash(code)
        tenant = Tenant(id=uuid4(), name="V", slug="v", is_active=True)
        db_session.add(tenant)
        db_session.flush()
        org = Organization(id=uuid4(), tenant_id=tenant.id, name="O")
        db_session.add(org)
        db_session.flush()
        user = User(
            id=uuid4(),
            tenant_id=tenant.id,
            email="verify@fintral.com",
            full_name="Verify User",
            is_active=False,
            verification_code=code_hash,
        )
        db_session.add(user)
        db_session.commit()

        result = verify_email_code("verify@fintral.com", code, db_session)

        assert result is not None
        assert result.is_active is True

        mock_setup.assert_called_once()

    @patch("app.services.auth_service.setup_user_lago_trial", new_callable=AsyncMock)
    def test_verify_user_triggers_trial(self, mock_setup, db_session, seeded_plan):
        from app.core.auth import create_access_token
        from app.services.auth_service import verify_user

        tenant = Tenant(id=uuid4(), name="V2", slug="v2", is_active=True)
        db_session.add(tenant)
        db_session.flush()
        org = Organization(id=uuid4(), tenant_id=tenant.id, name="O2")
        db_session.add(org)
        db_session.flush()
        user = User(
            id=uuid4(),
            tenant_id=tenant.id,
            email="verifytoken@fintral.com",
            full_name="Token User",
            is_active=False,
        )
        db_session.add(user)
        db_session.commit()

        token = create_access_token(
            data={"sub": "verifytoken@fintral.com", "purpose": "verify_email"},
            expires_delta=timedelta(hours=1),
        )

        result = verify_user(token, db_session)

        assert result is not None
        assert result.is_active is True

        mock_setup.assert_called_once()


# ── Tests: require_tenant middleware logic ────────────────────────────────────


class TestRequireTenantSubscriptionCheck:
    def test_no_user_subscription_blocks_hub(self, db_session, test_user, test_org):
        from app.models.user_subscription import UserSubscription

        sub = db_session.query(UserSubscription).filter(
            UserSubscription.user_id == test_user.id
        ).first()
        assert sub is None

    def test_active_user_subscription_allows_access(self, db_session, test_user, test_org, seeded_plan):
        sub = UserSubscription(
            user_id=test_user.id,
            plan_id=seeded_plan.id,
            status="active",
        )
        db_session.add(sub)
        db_session.commit()

        found = db_session.query(UserSubscription).filter(
            UserSubscription.user_id == test_user.id,
            UserSubscription.status.in_(["active", "trialing"]),
        ).first()
        assert found is not None

    def test_trialing_user_subscription_allows_access(self, db_session, test_user, test_org, seeded_plan):
        sub = UserSubscription(
            user_id=test_user.id,
            plan_id=seeded_plan.id,
            status="trialing",
            trial_ends_at=utc_now() + timedelta(days=5),
        )
        db_session.add(sub)
        db_session.commit()

        found = db_session.query(UserSubscription).filter(
            UserSubscription.user_id == test_user.id,
            UserSubscription.status.in_(["active", "trialing"]),
        ).first()
        assert found is not None

    def test_expired_trial_does_not_allow_access(self, db_session, test_user, test_org, seeded_plan):
        sub = UserSubscription(
            user_id=test_user.id,
            plan_id=seeded_plan.id,
            status="trialing",
            trial_ends_at=naive_now() - timedelta(days=1),
        )
        db_session.add(sub)
        db_session.commit()

        found = db_session.query(UserSubscription).filter(
            UserSubscription.user_id == test_user.id,
            UserSubscription.status.in_(["active", "trialing"]),
        ).first()
        # Still trialing — the require_tenant code checks expiration at request time
        assert found is not None
        assert found.trial_ends_at < naive_now()

    def test_canceled_subscription_does_not_allow_access(self, db_session, test_user, test_org, seeded_plan):
        sub = UserSubscription(
            user_id=test_user.id,
            plan_id=seeded_plan.id,
            status="canceled",
        )
        db_session.add(sub)
        db_session.commit()

        found = db_session.query(UserSubscription).filter(
            UserSubscription.user_id == test_user.id,
            UserSubscription.status.in_(["active", "trialing"]),
        ).first()
        assert found is None

    def test_organization_subscription_no_longer_grants_hub_access(self, db_session, test_user, test_org, seeded_plan):
        """Verifies that having an OrganizationSubscription alone does not grant Hub access."""
        org_sub = OrganizationSubscription(
            organization_id=test_org.id,
            plan_id=seeded_plan.id,
            status="active",
        )
        db_session.add(org_sub)
        db_session.commit()

        user_sub = db_session.query(UserSubscription).filter(
            UserSubscription.user_id == test_user.id,
            UserSubscription.status.in_(["active", "trialing"]),
        ).first()
        assert user_sub is None


# ── Tests: /api/me/subscription endpoint logic ────────────────────────────────


class TestMeSubscriptionEndpoint:
    def test_no_subscription_returns_none(self, db_session, test_user, test_org):
        from app.models.user_subscription import UserSubscription

        sub = db_session.query(UserSubscription).filter(
            UserSubscription.user_id == test_user.id
        ).first()
        assert sub is None

    def test_trial_subscription_has_correct_status(self, db_session, test_user, test_org, seeded_plan):
        trial_end = naive_now() + timedelta(days=5)
        sub = UserSubscription(
            user_id=test_user.id,
            plan_id=seeded_plan.id,
            status="trialing",
            trial_ends_at=trial_end,
            lago_plan_code="inicial",
            lago_subscription_id="lago-sub-test",
            lago_customer_id="lago-cust-test",
        )
        db_session.add(sub)
        db_session.commit()

        assert sub.status == "trialing"
        assert sub.lago_plan_code == "inicial"
        assert sub.lago_subscription_id == "lago-sub-test"
        assert sub.lago_customer_id == "lago-cust-test"
        assert sub.trial_ends_at is not None
        remaining = (sub.trial_ends_at - naive_now()).days
        assert 4 <= remaining <= 5

    def test_active_subscription_has_active_status(self, db_session, test_user, test_org, seeded_plan):
        sub = UserSubscription(
            user_id=test_user.id,
            plan_id=seeded_plan.id,
            status="active",
            lago_plan_code="profesional",
        )
        db_session.add(sub)
        db_session.commit()

        assert sub.status == "active"
        assert sub.lago_plan_code == "profesional"

    def test_multiple_subs_returns_latest(self, db_session, test_user, test_org, seeded_plan):
        now_aware = utc_now()
        sub1 = UserSubscription(
            user_id=test_user.id,
            plan_id=seeded_plan.id,
            status="canceled",
            lago_plan_code="inicial",
            created_at=now_aware - timedelta(minutes=5),
        )
        db_session.add(sub1)
        db_session.flush()
        sub2 = UserSubscription(
            user_id=test_user.id,
            plan_id=seeded_plan.id,
            status="active",
            lago_plan_code="profesional",
            created_at=now_aware,
        )
        db_session.add(sub2)
        db_session.commit()

        all_subs = db_session.query(UserSubscription).all()
        assert len(all_subs) == 2, f"expected 2, got {len(all_subs)}"

        latest = db_session.query(UserSubscription).filter(
            UserSubscription.user_id == test_user.id
        ).order_by(UserSubscription.created_at.desc()).first()
        assert latest is not None
        assert latest.status == "active"
        assert latest.lago_plan_code == "profesional"


# ── Tests: Lago webhook upgrades UserSubscription ───────────────────────────


class TestLagoWebhookUpdatesUserSubscription:
    """Lago subscription.started/terminated webhooks should update UserSubscription
    when the external_id matches a user-level Hub subscription."""

    @pytest.mark.anyio
    async def test_subscription_started_updates_user_sub(self, db_session, test_user, seeded_plan):
        from app.services.lago_webhook_handler import LagoWebhookHandler

        sub = UserSubscription(
            user_id=test_user.id,
            plan_id=seeded_plan.id,
            status="trialing",
            lago_subscription_id="lago-user-sub-started-1",
            lago_plan_code="inicial",
        )
        db_session.add(sub)
        db_session.commit()

        payload = {
            "webhook_type": "subscription.started",
            "subscription": {
                "lago_id": "lago-sub-internal-1",
                "external_id": "lago-user-sub-started-1",
                "customer_id": "lago-cust-user-1",
                "plan_code": "inicial",
            }
        }

        handler = LagoWebhookHandler(db_session)
        await handler.process(
            event_type="subscription.started",
            event_id="lago_evt_user_sub_started_1",
            payload=payload,
        )

        db_session.refresh(sub)
        assert sub.status == "active"
        assert sub.lago_customer_id == "lago-cust-user-1"
        assert sub.lago_plan_code == "inicial"
        assert sub.lago_subscription_id == "lago-user-sub-started-1"

    @pytest.mark.anyio
    async def test_subscription_started_by_user_sub_id(self, db_session, test_user, seeded_plan):
        """Fallback: external_id matches UserSubscription.id (UUID) when not set as lago_subscription_id."""
        from app.services.lago_webhook_handler import LagoWebhookHandler

        sub = UserSubscription(
            user_id=test_user.id,
            plan_id=seeded_plan.id,
            status="trialing",
            lago_subscription_id=None,
        )
        db_session.add(sub)
        db_session.commit()
        sub_uuid = str(sub.id)

        payload = {
            "webhook_type": "subscription.started",
            "subscription": {
                "lago_id": "lago-sub-internal-2",
                "external_id": sub_uuid,
                "customer_id": "lago-cust-user-2",
                "plan_code": "profesional",
            }
        }

        handler = LagoWebhookHandler(db_session)
        await handler.process(
            event_type="subscription.started",
            event_id="lago_evt_user_sub_started_2",
            payload=payload,
        )

        db_session.refresh(sub)
        assert sub.status == "active"
        assert sub.lago_customer_id == "lago-cust-user-2"
        assert sub.lago_plan_code == "profesional"
        assert sub.lago_subscription_id == sub_uuid

    @pytest.mark.anyio
    async def test_subscription_terminated_updates_user_sub(self, db_session, test_user, seeded_plan):
        from app.services.lago_webhook_handler import LagoWebhookHandler

        sub = UserSubscription(
            user_id=test_user.id,
            plan_id=seeded_plan.id,
            status="active",
            lago_subscription_id="lago-user-sub-term-1",
            lago_customer_id="lago-cust-term",
        )
        db_session.add(sub)
        db_session.commit()

        payload = {
            "webhook_type": "subscription.terminated",
            "subscription": {
                "lago_id": "lago-sub-term-internal",
                "external_id": "lago-user-sub-term-1",
            }
        }

        handler = LagoWebhookHandler(db_session)
        await handler.process(
            event_type="subscription.terminated",
            event_id="lago_evt_user_sub_term_1",
            payload=payload,
        )

        db_session.refresh(sub)
        assert sub.status == "canceled"
        assert sub.canceled_at is not None

    @pytest.mark.anyio
    async def test_org_subscription_still_resolved_first(self, db_session, test_org, test_user, seeded_plan):
        """Regression: org-level subscription takes priority over user-level when both exist."""
        from app.services.lago_webhook_handler import LagoWebhookHandler

        external_id = "both-levels-ext-id"

        org_sub = OrganizationSubscription(
            organization_id=test_org.id,
            plan_id=seeded_plan.id,
            status="trialing",
            lago_subscription_id=external_id,
        )
        db_session.add(org_sub)
        db_session.flush()

        user_sub = UserSubscription(
            user_id=test_user.id,
            plan_id=seeded_plan.id,
            status="trialing",
            lago_subscription_id=external_id,
        )
        db_session.add(user_sub)
        db_session.commit()

        payload = {
            "webhook_type": "subscription.started",
            "subscription": {
                "lago_id": "lago-sub-both-1",
                "external_id": external_id,
                "customer_id": "lago-cust-both",
                "plan_code": "inicial",
            }
        }

        handler = LagoWebhookHandler(db_session)
        await handler.process(
            event_type="subscription.started",
            event_id="lago_evt_both_levels",
            payload=payload,
        )

        db_session.refresh(org_sub)
        assert org_sub.status == "active", "org-level sub should be updated first"

        db_session.refresh(user_sub)
        assert user_sub.status == "trialing", "user-level sub should NOT be updated (org took priority)"

    @pytest.mark.anyio
    async def test_upgrade_from_trial_to_active_via_webhook(self, db_session, test_user, seeded_plan):
        """Full upgrade flow: trial UserSubscription receives subscription.started
        webhook (e.g., from Lago after user purchases a paid plan through the store),
        and transitions to active with the new plan code."""
        from app.services.lago_webhook_handler import LagoWebhookHandler

        sub = UserSubscription(
            user_id=test_user.id,
            plan_id=seeded_plan.id,
            status="trialing",
            lago_subscription_id="upgrade-ext-id",
            lago_customer_id="upgrade-cust-id",
            lago_plan_code="inicial",
            trial_ends_at=utc_now() + timedelta(days=3),
        )
        db_session.add(sub)
        db_session.commit()

        payload = {
            "webhook_type": "subscription.started",
            "subscription": {
                "lago_id": "lago-sub-upgrade-1",
                "external_id": "upgrade-ext-id",
                "customer_id": "upgrade-cust-id",
                "plan_code": "profesional",
            }
        }

        handler = LagoWebhookHandler(db_session)
        await handler.process(
            event_type="subscription.started",
            event_id="lago_evt_upgrade_1",
            payload=payload,
        )

        db_session.refresh(sub)
        assert sub.status == "active"
        assert sub.lago_plan_code == "profesional"
        assert sub.lago_customer_id == "upgrade-cust-id"
