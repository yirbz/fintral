

from app.core.container import webhook_sender
from app.database import SessionLocal
from app.models import Tenant, Organization, WebhookEndpoint


def test_webhook_sender_filters_by_event(monkeypatch):
    db = SessionLocal()
    called_urls = []

    class _Resp:
        status_code = 200

    def _fake_post(url, data=None, headers=None, timeout=None):
        called_urls.append(url)
        return _Resp()

    monkeypatch.setattr("requests.post", _fake_post)

    # Get or create tenant + org
    tenant = db.query(Tenant).first()
    if not tenant:
        tenant = Tenant(name="WH Tenant", slug="wh-test", plan="free")
        db.add(tenant)
        db.commit()
        db.refresh(tenant)

    org = db.query(Organization).filter(Organization.tenant_id == tenant.id).first()
    if not org:
        org = Organization(tenant_id=tenant.id, name="WH Org", tax_id="")
        db.add(org)
        db.commit()
        db.refresh(org)

    wh1 = WebhookEndpoint(
        tenant_id=tenant.id,
        organization_id=org.id,
        url="https://example.com/a",
        events='["invoice.processed"]',
        is_active=True,
    )
    wh2 = WebhookEndpoint(
        tenant_id=tenant.id,
        organization_id=org.id,
        url="https://example.com/b",
        events='["other.event"]',
        is_active=True,
    )

    try:
        db.add(wh1)
        db.add(wh2)
        db.commit()

        result = webhook_sender.trigger_event(
            db, "invoice.processed", {"id": "test"}, tenant_id=tenant.id, org_id=org.id,
        )
        assert result["status"] == "completed"
        assert "https://example.com/a" in called_urls
        assert "https://example.com/b" not in called_urls
    finally:
        try:
            db.delete(wh1)
            db.delete(wh2)
            db.commit()
        except Exception:
            db.rollback()
        db.close()
