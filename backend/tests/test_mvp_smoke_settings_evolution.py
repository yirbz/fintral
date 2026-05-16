import pytest

from app.routers import evolution as evolution_router
from app.routers.evolution import evolution_webhook, get_security_config
from app.database import SessionLocal

pytestmark = pytest.mark.anyio


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
