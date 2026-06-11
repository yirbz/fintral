"""
Tests for the subscription plan system — PlanService, UsageTracker,
rate limiting, and plan enforcement integration.
"""
import pytest
from datetime import date, datetime, timedelta
from unittest.mock import patch, MagicMock
from uuid import uuid4

from app.database import SessionLocal
from app.models import (
    SubscriptionPlan,
    OrganizationSubscription,
    UsageRecord,
    UsageAlert,
    Organization,
)
from app.services.plan_service import PlanService, PlanLimitExceeded
from app.services.usage_tracker import UsageTracker, _current_cycle

# ── Shared session fixtures ─────────────────────────────────────────

@pytest.fixture(scope="session")
def plans():
    """Get or create the four plans once per test session."""
    db = SessionLocal()
    try:
        existing = {p.name: p for p in db.query(SubscriptionPlan).all()}
        if len(existing) >= 4:
            return existing
        items = [
            SubscriptionPlan(name="esencial", display_name="Esencial",
                price_monthly_cents=2900, max_users=2, max_entities=1,
                max_ecf_monthly=50, max_ai_queries_monthly=300,
                max_ocr_docs_monthly=30, max_storage_mb=500,
                max_ai_rate_per_minute=10, max_api_rate_per_minute=0,
                max_api_calls_monthly=0,
                max_ocr_rate_per_minute=5,
                addon_ecf_block_size=100, addon_ecf_block_price_cents=500,
                addon_ai_block_size=500, addon_ai_block_price_cents=1000,
                addon_storage_block_mb=10240, addon_storage_block_price_cents=500,
                soft_limit_enabled=True, sort_order=10, is_public=True, is_active=True),
            SubscriptionPlan(name="profesional", display_name="Profesional",
                price_monthly_cents=6900, max_users=5, max_entities=1,
                max_ecf_monthly=300, max_ai_queries_monthly=3000,
                max_ocr_docs_monthly=300, max_storage_mb=5120,
                max_ai_rate_per_minute=30, max_api_rate_per_minute=50,
                max_api_calls_monthly=5000,
                max_ocr_rate_per_minute=10,
                addon_ecf_block_size=100, addon_ecf_block_price_cents=500,
                addon_ai_block_size=500, addon_ai_block_price_cents=1000,
                addon_storage_block_mb=10240, addon_storage_block_price_cents=500,
                soft_limit_enabled=True, has_api_access=True,
                has_advanced_reports=True, overage_unit_price_cents=88,
                sort_order=20, is_public=True, is_active=True),
            SubscriptionPlan(name="multi-entidad", display_name="Multi-Entidad",
                price_monthly_cents=14900, extra_entity_price_cents=1200,
                max_users=15, max_entities=10, max_ecf_monthly=5000,
                max_ai_queries_monthly=10000, max_ocr_docs_monthly=2000,
                max_storage_mb=25600, max_ai_rate_per_minute=60,
                max_api_rate_per_minute=100, max_api_calls_monthly=25000,
                max_ocr_rate_per_minute=20,
                addon_ecf_block_size=100, addon_ecf_block_price_cents=500,
                addon_ai_block_size=500, addon_ai_block_price_cents=1000,
                addon_storage_block_mb=10240, addon_storage_block_price_cents=500,
                soft_limit_enabled=True, has_api_access=True, has_webhooks=True,
                has_multi_entity_dashboard=True, has_batch_ecf_generation=True,
                sort_order=30, is_public=True, is_active=True),
            SubscriptionPlan(name="enterprise", display_name="Enterprise",
                price_monthly_cents=29900, max_users=999, max_entities=999,
                max_ecf_monthly=10000, max_ai_queries_monthly=30000,
                max_ocr_docs_monthly=10000, max_storage_mb=102400,
                max_ai_rate_per_minute=200, max_api_rate_per_minute=500,
                max_api_calls_monthly=250000,
                max_ocr_rate_per_minute=100, soft_limit_enabled=True,
                has_sla=True, has_api_access=True, has_webhooks=True,
                is_enterprise=True, sort_order=40, is_public=True, is_active=True),
        ]
        for p in items:
            if p.name not in existing:
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
    p = plans["esencial"]
    d = p.to_dict()
    assert d["name"] == "esencial"
    assert d["price_monthly"] == 29.00
    assert d["limits"]["max_ecf_monthly"] == 50
    assert d["limits"]["max_ai_rate_per_minute"] == 10
    assert d["soft_limit_enabled"] is True
    assert d["is_enterprise"] is False


def test_enterprise_plan_flag(plans):
    assert plans["enterprise"].is_enterprise is True
    assert plans["enterprise"].price_monthly_cents == 29900


def test_esencial_limits(plans):
    p = plans["esencial"]
    assert p.max_ecf_monthly == 50
    assert p.max_ai_queries_monthly == 300
    assert p.max_storage_mb == 500
    assert p.max_users == 2


def test_profesional_limits(plans):
    p = plans["profesional"]
    assert p.max_ai_queries_monthly == 3000
    assert p.max_api_calls_monthly == 5000
    assert p.has_api_access is True


def test_multi_entidad_limits(plans):
    p = plans["multi-entidad"]
    assert p.max_ecf_monthly == 5000
    assert p.max_entities == 10
    assert p.extra_entity_price_cents == 1200
    assert p.has_multi_entity_dashboard is True


def test_plan_feature_flags(plans):
    assert plans["esencial"].has_api_access is False
    assert plans["profesional"].has_api_access is True
    assert plans["multi-entidad"].has_webhooks is True
    assert plans["multi-entidad"].has_sla is False
    assert plans["enterprise"].has_sla is True
    assert plans["enterprise"].has_webhooks is True


def test_all_plans_are_public(plans):
    for p in plans.values():
        assert p.is_public is True
        assert p.sort_order > 0


def test_addon_margins(plans):
    p = plans["profesional"]
    cost_per_doc = p.addon_ecf_block_price_cents / p.addon_ecf_block_size
    alanube_cost_cents = 0.88
    assert cost_per_doc / alanube_cost_cents > 5.0


# ── Tests: Subscription ────────────────────────────────────────────

def test_get_plan_for_org_creates_trial(db_session, plans, fresh_org):
    svc = PlanService(db_session)
    sub, plan = svc.get_plan_for_org(fresh_org.id)
    assert sub.status == "trialing"
    assert sub.plan_id == plans["esencial"].id
    # Second call returns same
    sub2, _ = svc.get_plan_for_org(fresh_org.id)
    assert sub2.id == sub.id


def test_change_plan(db_session, plans, fresh_org):
    sub = PlanService(db_session).change_plan(fresh_org.id, "profesional")
    assert sub.status == "active"
    assert sub.plan.name == "profesional"


def test_change_plan_invalid_name(db_session, fresh_org):
    with pytest.raises(ValueError):
        PlanService(db_session).change_plan(fresh_org.id, "nonexistent")


def test_cancel_subscription(db_session, plans, fresh_org):
    svc = PlanService(db_session)
    # First ensure a subscription exists
    svc.get_plan_for_org(fresh_org.id)
    svc.cancel_subscription(fresh_org.id)
    # Query directly (not get_plan_for_org which auto-creates new trials)
    sub = db_session.query(OrganizationSubscription).filter(
        OrganizationSubscription.organization_id == fresh_org.id
    ).order_by(OrganizationSubscription.created_at.desc()).first()
    assert sub.status == "canceled"


def test_usage_summary(db_session, plans, fresh_org):
    svc = PlanService(db_session)
    summary = svc.get_usage_summary(fresh_org.id)
    assert summary["plan"]["name"] == "esencial"
    assert summary["usage"]["ecf"]["limit"] == 50
    assert summary["usage"]["ai_queries"]["used"] == 0


def test_subscription_effective_limits(db_session, plans, fresh_org):
    svc = PlanService(db_session)
    sub, _ = svc.get_plan_for_org(fresh_org.id)
    assert sub.effective_limits()["max_ecf_monthly"] == 50
    sub.addon_ecf_blocks = 2
    db_session.commit()
    assert sub.effective_limits()["max_ecf_monthly"] == 250


def test_purchase_addon_increases_limits(db_session, plans, fresh_org):
    svc = PlanService(db_session)
    svc.purchase_addon(fresh_org.id, "ecf", 2)
    svc.purchase_addon(fresh_org.id, "ai", 1)
    limits = svc.effective_limits(fresh_org.id)
    assert limits["max_ecf_monthly"] == 250
    assert limits["max_ai_queries_monthly"] == 800


# ── Tests: AI Query Quota ───────────────────────────────────────────

def test_ai_query_allows_within_quota(db_session, plans, fresh_org):
    result = PlanService(db_session).check_ai_query_limit(fresh_org.id)
    assert result["allowed"] is True
    assert result["remaining"] > 0


def test_ai_query_blocks_excess(db_session, plans, fresh_org):
    svc = PlanService(db_session)
    UsageTracker(db_session).increment_ai_query(fresh_org.id, 300)
    with pytest.raises(PlanLimitExceeded):
        svc.check_ai_query_limit(fresh_org.id, amount=1)


def test_ai_query_auto_addon(db_session, plans, fresh_org):
    svc = PlanService(db_session)
    sub, _ = svc.get_plan_for_org(fresh_org.id)
    sub.auto_renew_addons = True
    db_session.commit()
    UsageTracker(db_session).increment_ai_query(fresh_org.id, 300)
    result = svc.check_ai_query_limit(fresh_org.id)
    assert result["allowed"] is True
    db_session.refresh(sub)
    assert sub.addon_ai_blocks == 1


# ── Tests: e-CF Quota ──────────────────────────────────────────────

def test_ecf_allows_within_quota(db_session, plans, fresh_org):
    result = PlanService(db_session).check_ecf_limit(fresh_org.id)
    assert result["allowed"] is True


def test_ecf_soft_block_with_overage(db_session, plans, fresh_org):
    svc = PlanService(db_session)
    UsageTracker(db_session).increment_ecf(fresh_org.id, 50)
    result = svc.check_ecf_limit(fresh_org.id)
    assert result["allowed"] is True
    assert result["overage"] is True


def test_ecf_limit_no_ecf_in_plan(db_session, plans, fresh_org):
    svc = PlanService(db_session)
    # Use a separate approach: query through the session and restore
    plan = db_session.query(SubscriptionPlan).filter(
        SubscriptionPlan.name == "esencial").first()
    original_value = plan.max_ecf_monthly
    plan.max_ecf_monthly = 0
    db_session.commit()
    with pytest.raises(PlanLimitExceeded):
        svc.check_ecf_limit(fresh_org.id)
    # Restore to avoid contaminating other tests
    plan.max_ecf_monthly = original_value
    db_session.commit()


# ── Tests: Rate Limiting ───────────────────────────────────────────

def test_rate_limit_allows_normal(db_session, plans, fresh_org):
    result = PlanService(db_session).check_rate_limit(fresh_org.id, "ai")
    assert result["allowed"] is True


def test_rate_limit_blocks_excess(db_session, plans, fresh_org):
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
    with patch("app.services.usage_tracker.get_redis_client") as mock_redis:
        mock_redis.return_value = None
        result = PlanService(db_session).check_rate_limit(fresh_org.id, "ai")
        assert result["allowed"] is True


# ── Tests: Usage Recording ─────────────────────────────────────────

def test_record_and_get_usage(db_session, plans, fresh_org):
    svc = PlanService(db_session)
    svc.record_ai_query(fresh_org.id, 5)
    svc.record_ecf(fresh_org.id, 3)
    svc.record_ocr_doc(fresh_org.id, 2)
    summary = svc.get_usage_summary(fresh_org.id)
    assert summary["usage"]["ai_queries"]["used"] == 5
    assert summary["usage"]["ecf"]["used"] == 3
    assert summary["usage"]["ocr_docs"]["used"] == 2


def test_recording_triggers_soft_limit_alerts(db_session, plans, fresh_org):
    UsageTracker(db_session).increment_ecf(fresh_org.id, 40)
    PlanService(db_session).record_ecf(fresh_org.id)
    alerts = db_session.query(UsageAlert).filter(
        UsageAlert.organization_id == fresh_org.id).all()
    assert any(a.alert_type == "80pct_ecf" for a in alerts)


# ── Tests: Storage Limit ───────────────────────────────────────────

def test_storage_limit_check(db_session, plans, fresh_org):
    svc = PlanService(db_session)
    svc.check_storage_limit(fresh_org.id, additional_bytes=1024 * 1024)
    with pytest.raises(PlanLimitExceeded):
        svc.check_storage_limit(fresh_org.id, additional_bytes=9999 * 1024 * 1024)
