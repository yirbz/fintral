import pytest
from fastapi.testclient import TestClient
from app.factory import create_app
from app.dependencies.tenant import require_admin, TenantContext
from app.database import SessionLocal
from app.models import Tenant, User

def test_admin_analytics_endpoints(test_tenant, test_user):
    app = create_app()
    client = TestClient(app)

    db = SessionLocal()
    try:
        # Setup admin override context
        tenant = db.query(Tenant).filter(Tenant.id == test_tenant.id).first()
        user = db.query(User).filter(User.id == test_user.id).first()

        def override_require_admin():
            return TenantContext(
                db=db,
                tenant=tenant,
                organization=None,
                user=user,
                org_id=None,
                tenant_id=test_tenant.id,
                role="owner",
                permissions=[]
            )

        app.dependency_overrides[require_admin] = override_require_admin

        # Test costs analytics
        res = client.get("/api/admin/analytics/costs")
        assert res.status_code == 200
        data = res.json()
        assert "total_cost" in data
        assert "total_tokens" in data
        assert "model_breakdown" in data

        # Test usage analytics
        res = client.get("/api/admin/analytics/usage")
        assert res.status_code == 200
        data = res.json()
        assert "totals" in data
        assert "ratio_local_vs_electronic" in data
        assert "ai_extraction_quality" in data

        # Test storage analytics
        res = client.get("/api/admin/analytics/storage")
        assert res.status_code == 200
        data = res.json()
        assert "total_storage_bytes" in data
        assert "organizations" in data
        assert "file_types" in data

        # Test alanube analytics
        res = client.get("/api/admin/analytics/alanube")
        assert res.status_code == 200
        data = res.json()
        assert "summary" in data
        assert "by_action" in data
        assert "recent_failures" in data

    finally:
        app.dependency_overrides.clear()
        db.close()


def test_admin_finance_and_subscriptions(test_tenant, test_user):
    app = create_app()
    client = TestClient(app)

    db = SessionLocal()
    try:
        # Setup admin override context
        tenant = db.query(Tenant).filter(Tenant.id == test_tenant.id).first()
        user = db.query(User).filter(User.id == test_user.id).first()

        def override_require_admin():
            return TenantContext(
                db=db,
                tenant=tenant,
                organization=None,
                user=user,
                org_id=None,
                tenant_id=test_tenant.id,
                role="owner",
                permissions=[]
            )

        app.dependency_overrides[require_admin] = override_require_admin

        # Test MRR
        res = client.get("/api/admin/finance/mrr")
        assert res.status_code == 200
        data = res.json()
        assert "mrr" in data
        assert "mrr_cents" in data
        assert "active_subscriptions_count" in data

        # Test Payments
        res = client.get("/api/admin/finance/payments")
        assert res.status_code == 200
        data = res.json()
        assert "payments" in data
        assert "total" in data

        # Test Churn
        res = client.get("/api/admin/finance/churn")
        assert res.status_code == 200
        data = res.json()
        assert "lost_subscriptions_last_90_days" in data
        assert "churn_risks" in data

        # Test Subscriptions Distribution
        res = client.get("/api/admin/finance/subscription-distribution")
        assert res.status_code == 200
        data = res.json()
        assert "by_plan" in data
        assert "by_status" in data

        # Test List Subscriptions
        res = client.get("/api/admin/subscriptions")
        assert res.status_code == 200
        data = res.json()
        assert "subscriptions" in data
        assert "total" in data

        # Test Subscription plans
        res = client.get("/api/admin/subscription-plans")
        assert res.status_code == 200
        plans = res.json()
        assert isinstance(plans, list)

        # If there's at least one subscription, let's test update and credit
        from app.models.organization_subscription import OrganizationSubscription
        sub = db.query(OrganizationSubscription).first()
        if sub:
            sub_id = str(sub.id)
            
            # Test update
            update_payload = {
                "status": "active",
                "custom_price_cents": 4900,
                "custom_limits_json": {"max_users": 10}
            }
            res = client.patch(f"/api/admin/subscriptions/{sub_id}", json=update_payload)
            assert res.status_code == 200
            updated_data = res.json()
            assert updated_data["status"] == "active"
            
            # Test credit
            credit_payload = {
                "days": 15,
                "reason": "Grace period extended by support"
            }
            res = client.post(f"/api/admin/subscriptions/{sub_id}/credit", json=credit_payload)
            assert res.status_code == 200
            credited_data = res.json()
            assert "billing_cycle_end" in credited_data

    finally:
        app.dependency_overrides.clear()
        db.close()


def test_admin_tenant_management_workflows(test_tenant, test_user):
    app = create_app()
    client = TestClient(app)

    db = SessionLocal()
    try:
        # Setup admin override context
        tenant = db.query(Tenant).filter(Tenant.id == test_tenant.id).first()
        user = db.query(User).filter(User.id == test_user.id).first()

        def override_require_admin():
            return TenantContext(
                db=db,
                tenant=tenant,
                organization=None,
                user=user,
                org_id=None,
                tenant_id=test_tenant.id,
                role="owner",
                permissions=[]
            )

        app.dependency_overrides[require_admin] = override_require_admin

        # 1. Test Suspend Tenant
        suspend_payload = {
            "reason": "Test non-payment suspension",
            "notify_user": False,
            "grace_days": 10
        }
        res = client.post(f"/api/admin/tenants/{str(test_tenant.id)}/suspend", json=suspend_payload)
        assert res.status_code == 200
        data = res.json()
        assert data["is_active"] is False

        # Verify DB state
        db.refresh(tenant)
        assert tenant.is_active is False
        import json
        settings = json.loads(tenant.settings_json)
        assert "suspension" in settings
        assert settings["suspension"]["reason"] == "Test non-payment suspension"
        assert settings["suspension"]["grace_days"] == 10

        # 2. Test Unsuspend Tenant
        unsuspend_payload = {
            "notify_user": False
        }
        res = client.post(f"/api/admin/tenants/{str(test_tenant.id)}/unsuspend", json=unsuspend_payload)
        assert res.status_code == 200
        data = res.json()
        assert data["is_active"] is True

        # Verify DB state
        db.refresh(tenant)
        assert tenant.is_active is True
        settings = json.loads(tenant.settings_json)
        assert "suspension" not in settings

        # 3. Test Onboard Tenant
        # Ensure a plan exists
        from app.models.subscription_plan import SubscriptionPlan
        plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.is_active).first()
        if not plan:
            plan = SubscriptionPlan(
                name="inicial",
                display_name="Inicial",
                is_active=True,
                price_monthly_cents=99900,
                extra_entity_price_cents=60000,
                addon_ecf_block_size=200,
                addon_ecf_block_price_cents=150000,
                addon_ai_block_size=500,
                addon_ai_block_price_cents=60000,
                addon_storage_block_mb=10240,
                addon_storage_block_price_cents=50000
            )
            db.add(plan)
            db.commit()
            db.refresh(plan)
        onboard_payload = {
            "org_name": "Empresa Test Onboard",
            "tax_id": "130123456",
            "admin_email": "admin.onboard@test.com",
            "admin_name": "Admin Test",
            "plan": plan.name,
            "country": "DO"
        }

        res = client.post("/api/admin/tenants", json=onboard_payload)
        assert res.status_code == 200
        data = res.json()
        assert data["tenant_name"] == "Empresa Test Onboard"
        assert data["admin_email"] == "admin.onboard@test.com"
        assert "temp_password" in data
        assert data["temp_password"] is not None

        # Verify DB state
        new_tenant = db.query(Tenant).filter(Tenant.id == data["tenant_id"]).first()
        assert new_tenant is not None
        assert new_tenant.plan == plan.name

        new_user = db.query(User).filter(User.email == "admin.onboard@test.com").first()
        assert new_user is not None
        assert new_user.tenant_id == new_tenant.id

        # Clean up
        db.delete(new_user)
        # Note: cascade/manual deletions if needed, but since it's SQLite test session, it will be discarded anyway

    finally:
        app.dependency_overrides.clear()
        db.close()


@pytest.mark.anyio
async def test_daily_metrics_and_alert_hooks(test_tenant, test_user):
    from unittest.mock import patch
    from datetime import timedelta
    from app.services.alert_hooks import Alert, alert_manager
    from app.services.daily_metrics import (
        compute_and_store_daily_metrics,
        check_cost_anomalies,
    )
    from app.models.metrics_snapshot import MetricsSnapshot
    from app.models.organization_subscription import OrganizationSubscription
    from app.models.subscription_plan import SubscriptionPlan
    from app.models.invoice import Invoice

    db = SessionLocal()
    try:
        # 1. Test EmailAlertHook behavior
        with patch("app.services.email_service._sender") as mock_sender, \
             patch("app.config.ADMIN_EMAIL", "admin@test.com"):
            
            mock_sender.send.return_value = {"id": "test-email-id"}
            
            alert = Alert(
                title="Critical System Alert",
                message="Testing the email alert hook",
                severity="error",
                source="test"
            )
            await alert_manager.dispatch(alert)
            
            assert mock_sender.send.called
            args, kwargs = mock_sender.send.call_args
            assert "admin@test.com" in args[1]
            assert "Critical System Alert" in args[2]

        # 2. Test compute_and_store_daily_metrics
        plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.is_active).first()
        if not plan:
            plan = SubscriptionPlan(
                name="inicial",
                display_name="Inicial",
                is_active=True,
                price_monthly_cents=99900,
                extra_entity_price_cents=60000,
                addon_ecf_block_size=200,
                addon_ecf_block_price_cents=150000,
                addon_ai_block_size=500,
                addon_ai_block_price_cents=60000,
                addon_storage_block_mb=10240,
                addon_storage_block_price_cents=50000
            )
            db.add(plan)
            db.commit()
            db.refresh(plan)
        from app.dependencies.tenancy import get_default_org
        org = get_default_org(db, test_tenant.id)

        from app.utils.dates import utc_now
        now = utc_now()
        sub = OrganizationSubscription(
            organization_id=org.id,
            plan_id=plan.id,
            status="active",
            billing_cycle_start=now,
            billing_cycle_end=now + timedelta(days=30),
            addon_ecf_blocks=2,
            addon_ai_blocks=1
        )
        db.add(sub)
        db.commit()
        db.refresh(sub)

        target_date = now.date()
        snapshot = compute_and_store_daily_metrics(db, target_date)
        
        assert snapshot is not None
        assert snapshot.snapshot_date == target_date
        assert snapshot.active_subscriptions_count >= 1
        assert snapshot.mrr_cents >= 6400

        # 3. Test check_cost_anomalies (without anomalies)
        for i in range(1, 8):
            inv_date = now - timedelta(days=i)
            inv = Invoice(
                tenant_id=test_tenant.id,
                organization_id=org.id,
                total_amount=100.0,
                openai_cost_usd=1.0,
                created_at=inv_date,
                processed=True
            )
            db.add(inv)
        
        inv_today = Invoice(
            tenant_id=test_tenant.id,
            organization_id=org.id,
            total_amount=100.0,
            openai_cost_usd=1.2,
            created_at=now,
            processed=True
        )
        db.add(inv_today)
        db.commit()

        with patch("app.services.alert_hooks.alert_manager.dispatch") as mock_dispatch:
            await check_cost_anomalies(db, target_date)
            # Filter dispatches to check if alert_manager didn't dispatch daily_metrics alert
            metric_dispatches = [c[0][0] for c in mock_dispatch.call_args_list if c[0][0].source == "daily_metrics"]
            assert not metric_dispatches

        # Today's invoice with anomaly cost (> 2x average of 1.0, i.e. > 2.0)
        inv_anomaly = Invoice(
            tenant_id=test_tenant.id,
            organization_id=org.id,
            total_amount=100.0,
            openai_cost_usd=3.0,
            created_at=now,
            processed=True
        )
        db.add(inv_anomaly)
        db.commit()

        with patch("app.services.alert_hooks.alert_manager.dispatch") as mock_dispatch:
            await check_cost_anomalies(db, target_date)
            metric_dispatches = [c[0][0] for c in mock_dispatch.call_args_list if c[0][0].source == "daily_metrics"]
            assert len(metric_dispatches) == 1
            alert_called = metric_dispatches[0]
            assert "Anomalía de Costos de IA Detectada" in alert_called.title
            assert alert_called.severity == "warning"

        # Cleanup test data
        db.delete(sub)
        db.query(Invoice).filter(Invoice.organization_id == org.id).delete()
        db.query(MetricsSnapshot).filter(MetricsSnapshot.snapshot_date == target_date).delete()
        db.commit()

    finally:
        db.close()


def test_organization_is_deleted_lifecycle(test_tenant, test_user):
    app = create_app()
    client = TestClient(app)

    db = SessionLocal()
    try:
        tenant = db.query(Tenant).filter(Tenant.id == test_tenant.id).first()
        user = db.query(User).filter(User.id == test_user.id).first()

        def override_require_admin():
            return TenantContext(
                db=db,
                tenant=tenant,
                organization=None,
                user=user,
                org_id=None,
                tenant_id=test_tenant.id,
                role="owner",
                permissions=[]
            )

        app.dependency_overrides[require_admin] = override_require_admin

        # Create a test organization
        from app.models import Organization
        org = Organization(
            tenant_id=test_tenant.id,
            name="Lifecycle Test Org",
            tax_id="131234567",
            country="DO",
            is_deleted=False
        )
        db.add(org)
        db.commit()
        db.refresh(org)

        # 1. Delete organization
        res = client.delete(f"/api/admin/organizations/{str(org.id)}")
        assert res.status_code == 200
        
        # Verify DB state
        db.refresh(org)
        assert org.is_deleted is True
        assert org.deleted_at is not None

        # 2. Restore organization
        res = client.patch(f"/api/admin/organizations/{str(org.id)}/restore")
        assert res.status_code == 200

        # Verify DB state
        db.refresh(org)
        assert org.is_deleted is False
        assert org.deleted_at is None

        # Cleanup
        db.delete(org)
        db.commit()

    finally:
        app.dependency_overrides.clear()
        db.close()



