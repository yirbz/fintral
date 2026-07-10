"""
Tests for the subscription plan system — PlanService, UsageTracker,
rate limiting, and plan enforcement integration.
"""
import pytest
from unittest.mock import patch, MagicMock
from uuid import uuid4

from app.utils.dates import utc_now

from app.database import SessionLocal
from app.models import (
    SubscriptionPlan,
    OrganizationSubscription,
    UsageAlert,
    Organization,
    Invoice,
    UserSubscription,
)
from app.services.plan_service import PlanService, PlanLimitExceeded
from app.services.usage_tracker import UsageTracker

# ── Shared session fixtures ─────────────────────────────────────────

@pytest.fixture(scope="session")
def plans():
    """Get or create the three plans once per test session."""
    db = SessionLocal()
    try:
        db.query(OrganizationSubscription).delete()
        db.query(SubscriptionPlan).delete()
        db.commit()
        items = [
            SubscriptionPlan(name="inicial", display_name="Inicial",
                price_monthly_cents=99900, max_users=3, max_entities=1,
                max_ecf_monthly=0, max_ai_queries_monthly=0,
                max_ocr_docs_monthly=50, max_storage_mb=500,
                max_ai_rate_per_minute=10, max_api_rate_per_minute=0,
                max_api_calls_monthly=0,
                max_ocr_rate_per_minute=5,
                addon_ecf_block_size=100, addon_ecf_block_price_cents=80000,
                addon_ai_block_size=500, addon_ai_block_price_cents=60000,
                addon_storage_block_mb=10240, addon_storage_block_price_cents=30000,
                entity_slot_price_cents=60000, user_slot_price_cents=30000,
                extra_entity_price_cents=0, extra_billing_entity_price_cents=0,
                soft_limit_enabled=True, sort_order=10, is_public=True, is_active=True),
            SubscriptionPlan(name="profesional", display_name="Profesional",
                price_monthly_cents=299900, max_users=10, max_entities=5,
                max_ecf_monthly=500, max_ai_queries_monthly=1000,
                max_ocr_docs_monthly=500, max_storage_mb=5120,
                max_ai_rate_per_minute=30, max_api_rate_per_minute=50,
                max_api_calls_monthly=5000,
                max_ocr_rate_per_minute=10,
                addon_ecf_block_size=100, addon_ecf_block_price_cents=80000,
                addon_ai_block_size=500, addon_ai_block_price_cents=60000,
                addon_storage_block_mb=10240, addon_storage_block_price_cents=30000,
                entity_slot_price_cents=60000, user_slot_price_cents=30000,
                extra_entity_price_cents=0, extra_billing_entity_price_cents=0,
                soft_limit_enabled=True, has_api_access=True,
                has_advanced_reports=True, has_webhooks=True,
                overage_unit_price_cents=900,
                sort_order=20, is_public=True, is_active=True),
            SubscriptionPlan(name="despacho", display_name="Despacho Contable",
                price_monthly_cents=799900,
                max_users=999999, max_entities=20, max_ecf_monthly=500,
                max_ai_queries_monthly=10000, max_ocr_docs_monthly=1000,
                max_storage_mb=25600, max_ai_rate_per_minute=60,
                max_api_rate_per_minute=100, max_api_calls_monthly=25000,
                max_ocr_rate_per_minute=20,
                addon_ecf_block_size=100, addon_ecf_block_price_cents=80000,
                addon_ai_block_size=500, addon_ai_block_price_cents=60000,
                addon_storage_block_mb=10240, addon_storage_block_price_cents=30000,
                entity_slot_price_cents=60000, user_slot_price_cents=30000,
                extra_entity_price_cents=0, extra_billing_entity_price_cents=0,
                soft_limit_enabled=True, has_api_access=True, has_webhooks=True,
                has_multi_entity_dashboard=True, has_batch_ecf_generation=True,
                has_sla=True,
                overage_unit_price_cents=900,
                sort_order=30, is_public=True, is_active=True),
        ]
        for p in items:
            db.add(p)
        db.commit()
        for p in items:
            db.refresh(p)
        return {p.name: p for p in items}
    finally:
        db.close()


# ── Per-test fixtures (each test gets clean state) ─────────────────

@pytest.fixture()
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture()
def fresh_org(db_session, test_tenant):
    """Create a unique org for each test to avoid cross-test contamination."""
    org = Organization(
        tenant_id=test_tenant.id,
        name=f"Test Org {uuid4().hex[:8]}",
        tax_id="",
    )
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)
    return org


# ── Tests: Plan Model ───────────────────────────────────────────────

def test_plan_to_dict(plans):
    p = plans["inicial"]
    d = p.to_dict()
    assert d["name"] == "inicial"
    assert d["price_monthly"] == 999.00
    assert d["limits"]["max_ecf_monthly"] == 0
    assert d["limits"]["max_ai_rate_per_minute"] == 10
    assert d["soft_limit_enabled"] is True
    assert d["is_enterprise"] is False


def test_no_enterprise_flag(plans):
    for p in plans.values():
        assert p.is_enterprise is False


def test_inicial_limits(plans):
    p = plans["inicial"]
    assert p.max_ecf_monthly == 0
    assert p.max_ai_queries_monthly == 0
    assert p.max_storage_mb == 500
    assert p.max_users == 3
    assert p.user_slot_price_cents == 30000
    assert p.entity_slot_price_cents == 60000


def test_profesional_limits(plans):
    p = plans["profesional"]
    assert p.max_ai_queries_monthly == 1000
    assert p.max_api_calls_monthly == 5000
    assert p.has_api_access is True
    assert p.max_ecf_monthly == 500
    assert p.max_ocr_docs_monthly == 500


def test_despacho_limits(plans):
    p = plans["despacho"]
    assert p.max_ecf_monthly == 500
    assert p.max_entities == 20
    assert p.max_users == 999999
    assert p.has_multi_entity_dashboard is True
    assert p.max_ocr_docs_monthly == 1000
    assert p.has_sla is True


def test_plan_feature_flags(plans):
    assert plans["inicial"].has_api_access is False
    assert plans["profesional"].has_api_access is True
    assert plans["despacho"].has_webhooks is True
    assert plans["despacho"].has_sla is True
    assert plans["profesional"].has_webhooks is True
    assert plans["profesional"].has_sla is False


def test_all_plans_are_public(plans):
    for p in plans.values():
        assert p.is_public is True
        assert p.sort_order > 0


def test_addon_margins(plans):
    p = plans["profesional"]
    # Bloque 100 e-CF: RD$950 (cost RD$522 → 45% margin)
    assert p.addon_ecf_block_size == 100
    assert p.addon_ecf_block_price_cents == 80000
    # Excedente e-CF: RD$12.00 (cost RD$5.22 → 56% margin)
    assert p.overage_unit_price_cents == 900
    # Slot precios
    assert p.entity_slot_price_cents == 60000
    assert p.user_slot_price_cents == 30000


# ── Helpers ─────────────────────────────────────────────────────────

def _create_trial_sub(db_session, plans, org_id):
    """Create a trial OrganizationSubscription for an org (replaces old auto-create)."""
    from datetime import date, timedelta
    today = date.today()
    sub = OrganizationSubscription(
        organization_id=org_id,
        plan_id=plans["inicial"].id,
        status="trialing",
        billing_cycle_start=today - timedelta(days=1),
        billing_cycle_end=today + timedelta(days=29),
        trial_ends_at=today + timedelta(days=7),
    )
    db_session.add(sub)
    db_session.commit()
    db_session.refresh(sub)
    return sub


# ── Tests: Subscription ────────────────────────────────────────────

def test_get_plan_for_org_returns_none_when_no_sub(db_session, plans, fresh_org):
    svc = PlanService(db_session)
    sub, plan = svc.get_plan_for_org(fresh_org.id)
    assert sub is None
    assert plan is None


def test_get_plan_for_org_with_sub(db_session, plans, fresh_org):
    _create_trial_sub(db_session, plans, fresh_org.id)
    svc = PlanService(db_session)
    sub, plan = svc.get_plan_for_org(fresh_org.id)
    assert sub.status == "trialing"
    assert sub.plan_id == plans["inicial"].id


def test_change_plan(db_session, plans, fresh_org):
    _create_trial_sub(db_session, plans, fresh_org.id)
    sub = PlanService(db_session).change_plan(fresh_org.id, "profesional")
    assert sub.status == "active"
    assert sub.plan.name == "profesional"


def test_change_plan_invalid_name(db_session, fresh_org):
    with pytest.raises(ValueError):
        PlanService(db_session).change_plan(fresh_org.id, "nonexistent")


def test_cancel_subscription(db_session, plans, fresh_org):
    _create_trial_sub(db_session, plans, fresh_org.id)
    svc = PlanService(db_session)
    svc.cancel_subscription(fresh_org.id)
    sub = db_session.query(OrganizationSubscription).filter(
        OrganizationSubscription.organization_id == fresh_org.id
    ).order_by(OrganizationSubscription.created_at.desc()).first()
    assert sub.status == "canceled"


def test_usage_summary(db_session, plans, fresh_org):
    _create_trial_sub(db_session, plans, fresh_org.id)
    svc = PlanService(db_session)
    summary = svc.get_usage_summary(fresh_org.id)
    assert summary["plan"]["name"] == "inicial"
    assert summary["usage"]["ecf"]["limit"] == 0
    assert summary["usage"]["ai_queries"]["used"] == 0


def test_subscription_effective_limits(db_session, plans, fresh_org):
    sub = _create_trial_sub(db_session, plans, fresh_org.id)
    assert sub.effective_limits()["max_ecf_monthly"] == 0
    sub.addon_ecf_blocks = 2
    db_session.commit()
    assert sub.effective_limits()["max_ecf_monthly"] == 200


def test_purchase_addon_increases_limits(db_session, plans, fresh_org):
    _create_trial_sub(db_session, plans, fresh_org.id)
    svc = PlanService(db_session)
    svc.purchase_addon(fresh_org.id, "ecf", 2)
    svc.purchase_addon(fresh_org.id, "ai", 1)
    limits = svc.effective_limits(fresh_org.id)
    assert limits["max_ecf_monthly"] == 200
    assert limits["max_ai_queries_monthly"] == 500


# ── Tests: User Slot Addon ──────────────────────────────────────────

def test_user_slot_price_in_to_dict(plans):
    d = plans["inicial"].to_dict()
    assert d["user_slot_price_cents"] == 30000
    assert d["user_slot_price"] == 300.00


def test_purchase_user_slot_addon(db_session, plans, fresh_org):
    sub = _create_trial_sub(db_session, plans, fresh_org.id)
    svc = PlanService(db_session)
    svc.purchase_addon(fresh_org.id, "user_slot", 2)
    db_session.refresh(sub)
    assert sub.addon_user_slots == 2


def test_effective_limits_includes_user_slots(db_session, plans, fresh_org):
    sub = _create_trial_sub(db_session, plans, fresh_org.id)
    # Base: Inicial has max_users=3
    assert sub.effective_limits()["max_users"] == 3
    # Add 2 user slots
    sub.addon_user_slots = 2
    db_session.commit()
    assert sub.effective_limits()["max_users"] == 5


def test_entity_slot_addon_updates_max_entities(db_session, plans, fresh_org, test_user):
    from app.models.user_subscription import UserSubscription

    _create_trial_sub(db_session, plans, fresh_org.id)
    # Create a UserSubscription for the test user
    user_sub = UserSubscription(
        user_id=test_user.id,
        plan_id=plans["inicial"].id,
        status="active",
    )
    db_session.add(user_sub)
    db_session.commit()
    db_session.refresh(user_sub)

    svc = PlanService(db_session)
    # Base: Inicial has max_entities=1
    assert svc.get_user_entity_limits(str(test_user.id))["max_entities"] == 1

    svc.purchase_addon(fresh_org.id, "entity_slot", 3, user_id=str(test_user.id))
    db_session.refresh(user_sub)
    assert user_sub.addon_entity_slots == 3

    limits = svc.get_user_entity_limits(str(test_user.id))
    assert limits["max_entities"] == 4  # 1 base + 3 addon


def test_purchase_addon_rejects_unknown_type(db_session, plans, fresh_org):
    _create_trial_sub(db_session, plans, fresh_org.id)
    svc = PlanService(db_session)
    with pytest.raises(ValueError, match="Unknown addon type"):
        svc.purchase_addon(fresh_org.id, "invalid_type")


def test_subscription_to_dict_includes_user_slots(db_session, plans, fresh_org):
    sub = _create_trial_sub(db_session, plans, fresh_org.id)
    sub.addon_user_slots = 3
    db_session.commit()
    d = sub.to_dict()
    assert d["addons"]["user_slots"] == 3
    assert d["limits"]["max_users"] == 6  # 3 base + 3 addon


# ── Tests: AI Query Quota — uses Profesional (Inicial has AI=0) ─────

def test_ai_query_allows_within_quota(db_session, plans, fresh_org):
    svc = PlanService(db_session)
    svc.change_plan(fresh_org.id, "profesional")
    result = svc.check_ai_query_limit(fresh_org.id)
    assert result["allowed"] is True
    assert result["remaining"] > 0


def test_ai_query_blocks_excess(db_session, plans, fresh_org):
    svc = PlanService(db_session)
    svc.change_plan(fresh_org.id, "profesional")
    UsageTracker(db_session).increment_ai_query(fresh_org.id, 1000)
    with pytest.raises(PlanLimitExceeded):
        svc.check_ai_query_limit(fresh_org.id, amount=1)


def test_ai_query_auto_addon(db_session, plans, fresh_org):
    svc = PlanService(db_session)
    svc.change_plan(fresh_org.id, "profesional")
    sub, _ = svc.get_plan_for_org(fresh_org.id)
    sub.auto_renew_addons = True
    db_session.commit()
    UsageTracker(db_session).increment_ai_query(fresh_org.id, 1000)
    result = svc.check_ai_query_limit(fresh_org.id)
    assert result["allowed"] is True
    db_session.refresh(sub)
    assert sub.addon_ai_blocks == 1


# ── Tests: e-CF Quota — uses balance-based check ───────────────────

def test_ecf_allows_within_balance(db_session, plans, fresh_org):
    """Crediting e_cf_balance allows document emission."""
    fresh_org.e_cf_balance = 100
    db_session.commit()
    result = PlanService(db_session).check_ecf_limit(fresh_org.id)
    assert result["allowed"] is True
    assert result["remaining"] == 99
    assert result["deducted"] == 1


def test_ecf_blocks_exhausted_balance(db_session, plans, fresh_org):
    """Depleting e_cf_balance blocks further emission."""
    fresh_org.e_cf_balance = 5
    db_session.commit()
    svc = PlanService(db_session)
    svc.check_ecf_limit(fresh_org.id, 5)  # consume all
    with pytest.raises(PlanLimitExceeded, match="insufficient_ecf_balance"):
        svc.check_ecf_limit(fresh_org.id)


def test_ecf_limit_zero_balance_blocks(db_session, plans, fresh_org):
    """Zero e_cf_balance raises PlanLimitExceeded."""
    with pytest.raises(PlanLimitExceeded, match="insufficient_ecf_balance"):
        PlanService(db_session).check_ecf_limit(fresh_org.id)


# ── Tests: Rate Limiting ───────────────────────────────────────────

def test_rate_limit_allows_normal(db_session, plans, fresh_org):
    _create_trial_sub(db_session, plans, fresh_org.id)
    result = PlanService(db_session).check_rate_limit(fresh_org.id, "ai")
    assert result["allowed"] is True


def test_rate_limit_blocks_excess(db_session, plans, fresh_org):
    _create_trial_sub(db_session, plans, fresh_org.id)
    with patch("app.services.usage_tracker.get_redis_client") as mock_get:
        mock_redis = MagicMock()
        mock_get.return_value = mock_redis
        mock_pipe = MagicMock()
        mock_pipe.incr.return_value = 999
        mock_pipe.expire.return_value = True
        mock_pipe.execute.return_value = [999, True]
        mock_redis.pipeline.return_value = mock_pipe

        with pytest.raises(PlanLimitExceeded) as exc:
            PlanService(db_session).check_rate_limit(fresh_org.id, "ai")
        assert "rate_limit" in str(exc.value)


def test_rate_limit_fallback_when_redis_down(db_session, plans, fresh_org):
    _create_trial_sub(db_session, plans, fresh_org.id)
    with patch("app.services.usage_tracker.get_redis_client") as mock_redis:
        mock_redis.return_value = None
        result = PlanService(db_session).check_rate_limit(fresh_org.id, "ai")
        assert result["allowed"] is True


# ── Tests: Usage Recording ─────────────────────────────────────────

def test_record_and_get_usage(db_session, plans, fresh_org, test_tenant):
    _create_trial_sub(db_session, plans, fresh_org.id)
    svc = PlanService(db_session)
    now = utc_now()

    for i in range(3):
        db_session.add(Invoice(
            tenant_id=test_tenant.id,
            organization_id=fresh_org.id,
            filename=f"ecf_{i}",
            is_electronic=True,
            created_at=now,
            invoice_date=now,
            total_amount=1000.0,
        ))
    for i in range(5):
        db_session.add(Invoice(
            tenant_id=test_tenant.id,
            organization_id=fresh_org.id,
            filename=f"ai_{i}",
            openai_tokens_used=100,
            created_at=now,
            invoice_date=now,
            total_amount=500.0,
        ))
    for i in range(2):
        db_session.add(Invoice(
            tenant_id=test_tenant.id,
            organization_id=fresh_org.id,
            filename=f"ocr_{i}",
            source_type="image_ocr",
            created_at=now,
            invoice_date=now,
            total_amount=200.0,
        ))
    db_session.commit()

    summary = svc.get_usage_summary(fresh_org.id)
    assert summary["usage"]["ai_queries"]["used"] == 5
    assert summary["usage"]["ecf"]["used"] == 3
    assert summary["usage"]["ocr_docs"]["used"] == 2


def test_recording_triggers_soft_limit_alerts(db_session, plans, fresh_org):
    """Switch to Profesional first — Inicial has no e-CF quota to alert on."""
    svc = PlanService(db_session)
    svc.change_plan(fresh_org.id, "profesional")
    UsageTracker(db_session).increment_ecf(fresh_org.id, 400)
    svc.record_ecf(fresh_org.id)
    alerts = db_session.query(UsageAlert).filter(
        UsageAlert.organization_id == fresh_org.id).all()
    assert any("ecf" in a.alert_type for a in alerts)


# ── Tests: Storage Limit ───────────────────────────────────────────

def test_storage_limit_check(db_session, plans, fresh_org):
    _create_trial_sub(db_session, plans, fresh_org.id)
    svc = PlanService(db_session)
    svc.check_storage_limit(fresh_org.id, additional_bytes=1024 * 1024)
    with pytest.raises(PlanLimitExceeded):
        svc.check_storage_limit(fresh_org.id, additional_bytes=9999 * 1024 * 1024)


# ── Tests: Addon Cancellation ─────────────────────────────────────

def test_cancel_addon_org_level(db_session, plans, fresh_org):
    sub = _create_trial_sub(db_session, plans, fresh_org.id)
    sub.addon_user_slots = 2
    sub.addon_ai_blocks = 3
    db_session.commit()

    svc = PlanService(db_session)
    
    # Successful cancel 1 user slot
    res = svc.cancel_addon(fresh_org.id, "user_slot", quantity=1)
    assert res["addon_type"] == "user_slot"
    assert res["cancelled"] == 1
    assert res["remaining"] == 1
    assert sub.addon_user_slots == 2
    assert sub.pending_cancel_user_slots == 1

    # Successful cancel remaining AI blocks
    res = svc.cancel_addon(fresh_org.id, "ai", quantity=3)
    assert res["addon_type"] == "ai"
    assert res["cancelled"] == 3
    assert res["remaining"] == 0
    assert sub.addon_ai_blocks == 3
    assert sub.pending_cancel_ai_blocks == 3

    # Error: quantity greater than active
    with pytest.raises(ValueError, match="No puedes cancelar 2"):
        svc.cancel_addon(fresh_org.id, "user_slot", quantity=2)

    # Error: quantity less than 1
    with pytest.raises(ValueError, match="La cantidad a cancelar debe ser al menos 1"):
        svc.cancel_addon(fresh_org.id, "user_slot", quantity=0)


def test_cancel_addon_user_level(db_session, plans, fresh_org):
    user_id = str(uuid4())
    user_sub = UserSubscription(
        user_id=user_id,
        plan_id=plans["inicial"].id,
        status="active",
        addon_entity_slots=3,
    )
    db_session.add(user_sub)
    db_session.commit()

    svc = PlanService(db_session)

    # Successful cancel 1 entity slot
    res = svc.cancel_addon(fresh_org.id, "entity_slot", quantity=1, user_id=user_id)
    assert res["addon_type"] == "entity_slot"
    assert res["cancelled"] == 1
    assert res["remaining"] == 2
    assert user_sub.addon_entity_slots == 3
    assert user_sub.pending_cancel_entity_slots == 1

    # Error: user_id missing
    with pytest.raises(ValueError, match="Se requiere user_id"):
        svc.cancel_addon(fresh_org.id, "entity_slot", quantity=1)

    # Error: quantity greater than active
    with pytest.raises(ValueError, match="No puedes cancelar 4"):
        svc.cancel_addon(fresh_org.id, "entity_slot", quantity=4, user_id=user_id)


def test_fallback_to_user_subscription(db_session, plans, fresh_org):
    from app.models.user_organization import UserOrganization
    from app.models.user_subscription import UserSubscription
    from app.models.user import User
    import uuid

    # Create a user
    user = User(
        id=uuid.uuid4(),
        tenant_id=fresh_org.tenant_id,
        email="testfallback@fintral.com",
        hashed_password="...",
        full_name="Fallback Test User",
    )
    db_session.add(user)
    db_session.flush()

    # Link user to fresh_org as owner
    user_org = UserOrganization(
        user_id=user.id,
        organization_id=fresh_org.id,
        role="owner",
    )
    db_session.add(user_org)

    # Create UserSubscription
    user_sub = UserSubscription(
        user_id=user.id,
        plan_id=plans["inicial"].id,
        status="trialing",
    )
    db_session.add(user_sub)
    db_session.commit()

    svc = PlanService(db_session)
    sub, plan = svc.get_plan_for_org(fresh_org.id)

    assert sub is not None
    assert plan is not None
    assert sub.id == user_sub.id
    assert plan.name == "inicial"
