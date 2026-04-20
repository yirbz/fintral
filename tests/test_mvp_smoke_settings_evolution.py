import pytest

from app.routers import evolution as evolution_router
from app.routers.evolution import evolution_webhook, get_security_config
from app.routers.settings import get_settings, update_settings
from app.schemas import SettingUpdate
from app.database import SessionLocal
from app.models import User

pytestmark = pytest.mark.anyio


async def test_settings_get_and_update(test_user):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == test_user.id).first()

        settings_payload = await get_settings(user=user, db=db)
        assert isinstance(settings_payload, dict)

        updates = [
            SettingUpdate(
                key="whatsapp_auto_reply",
                value=True,
                category="whatsapp",
                type="boolean",
            )
        ]
        result = await update_settings(updates=updates, user=user, db=db)
        assert result["status"] == "success"
    finally:
        db.close()


async def test_evolution_routes_smoke(monkeypatch):
    class DummyRequest:
        async def json(self):
            return {"event": "messages.upsert", "data": {}}

    async def _fake_process_webhook(payload, db):
        return {
            "status": "success",
            "result": {
                "status": "success",
                "invoice_id": None,
                "openai_result": {"success": True, "data": {}},
                "sender_info": {},
            },
        }

    monkeypatch.setattr(evolution_router.evolution_service, "process_webhook", _fake_process_webhook)

    db = SessionLocal()
    try:
        webhook_resp = await evolution_webhook(DummyRequest(), db=db)
        assert webhook_resp["status"] == "success"

        security_resp = await get_security_config(db=db)
        assert security_resp["status"] == "success"
        assert "authorized_number" in security_resp
    finally:
        db.close()
