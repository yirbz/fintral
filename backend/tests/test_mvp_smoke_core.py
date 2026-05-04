from types import SimpleNamespace

import pytest
from starlette.requests import Request

from app.routers.auth_pages import login_page
from app.routers.websocket import get_websocket_status

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
