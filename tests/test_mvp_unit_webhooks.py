from types import SimpleNamespace

from app.core.container import webhook_sender
from app.database import SessionLocal
from app.models import WebhookEndpoint


def test_webhook_sender_filters_by_event(monkeypatch):
    db = SessionLocal()
    called_urls = []

    class _Resp:
        status_code = 200

    def _fake_post(url, data=None, headers=None, timeout=None):
        called_urls.append(url)
        return _Resp()

    monkeypatch.setattr("requests.post", _fake_post)

    wh1 = WebhookEndpoint(url="https://example.com/a", events='["invoice.processed"]', is_active=True, organization_id=1)
    wh2 = WebhookEndpoint(url="https://example.com/b", events='["other.event"]', is_active=True, organization_id=1)

    try:
        db.add(wh1)
        db.add(wh2)
        db.commit()

        result = webhook_sender.trigger_event(db, "invoice.processed", {"id": 1}, org_id=1)
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
