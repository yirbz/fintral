
import pytest

from app.routers.websocket import get_websocket_status

pytestmark = pytest.mark.anyio


async def test_websocket_status():
    ws_status = await get_websocket_status()
    assert ws_status["status"] == "success"
    assert "websocket_status" in ws_status
