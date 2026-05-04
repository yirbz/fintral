from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.database import get_db
from app.models import UserOrganization
from app.services.websocket import websocket_manager

from app.dependencies.auth import get_current_user_from_websocket

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    db = next(get_db())
    try:
        user = await get_current_user_from_websocket(websocket, db)
        if not user:
            await websocket.close(code=1008)
            return

        # Get user's first org for websocket channel scoping
        user_org = (
            db.query(UserOrganization)
            .filter(UserOrganization.user_id == user.id)
            .first()
        )
        if not user_org:
            await websocket.close(code=1008)
            return

        await websocket_manager.connect(websocket, str(user_org.organization_id))
    finally:
        db.close()

    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket_manager.send_personal_message(
                    {"type": "pong", "message": "Conexión activa"},
                    websocket,
                )
    except WebSocketDisconnect:
        websocket_manager.disconnect(websocket)


@router.get("/websocket/status")
async def get_websocket_status():
    return {
        "status": "success",
        "websocket_status": websocket_manager.get_status(),
        "description": "Estado actual del sistema de notificaciones en tiempo real",
    }
