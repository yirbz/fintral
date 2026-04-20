from types import SimpleNamespace

import pytest
from starlette.requests import Request

from app.routers.auth_pages import login_page
from app.routers.invoices import get_invoices
from app.routers.websocket import get_websocket_status
from app.database import SessionLocal
from app.models import Organization, User

pytestmark = pytest.mark.anyio


def _make_request(path: str = "/login") -> Request:
    scope = {
        "type": "http",
        "method": "GET",
        "path": path,
        "headers": [],
        "query_string": b"",
        "client": ("test", 1234),
        "server": ("testserver", 80),
        "scheme": "http",
        "root_path": "",
    }
    return Request(scope)


async def test_pages_and_status_endpoints():
    response = await login_page(_make_request("/login"))
    assert response.status_code == 200

    ws_status = await get_websocket_status()
    assert ws_status["status"] == "success"
    assert "websocket_status" in ws_status


async def test_invoices_handler_smoke():
    db = SessionLocal()
    try:
        org = db.query(Organization).first()
        if not org:
            org = Organization(name="Smoke Org", tax_id="", plan="Free Plan")
            db.add(org)
            db.commit()
            db.refresh(org)

        user = db.query(User).filter(User.organization_id == org.id).first()
        if not user:
            user = SimpleNamespace(id=1, organization_id=org.id, is_active=True)

        payload = await get_invoices(user=user, db=db)
        assert "invoices" in payload
        assert "total" in payload
    finally:
        db.close()
