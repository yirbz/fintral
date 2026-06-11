from typing import Optional
from uuid import uuid4

from fastapi import Depends, HTTPException, Request, WebSocket, status
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.config import ADMIN_EMAIL
from app.core.auth import verify_any_token
from app.database import get_db
from app.models import User


class FallbackUser:
    """Fake user when database is unavailable."""
    id = uuid4()
    email = ADMIN_EMAIL or "admin@fintral.local"
    full_name = "Admin User"
    is_active = True
    is_superuser = True
    tenant_id = uuid4()


def _resolve_user_from_token(token: str, db: Session) -> Optional[User]:
    """Verify token and resolve to local User. Handles Supabase + legacy tokens."""
    payload = verify_any_token(token)
    if not payload:
        return None

    email = payload.get("email") or payload.get("sub")
    if not email:
        return None

    try:
        return db.query(User).filter(
            User.email == email,
            User.is_active.is_(True),
            User.deleted_at.is_(None),
        ).first()
    except OperationalError:
        if email == ADMIN_EMAIL:
            return FallbackUser()
        return None


async def get_current_user(request: Request, db: Session = Depends(get_db)) -> Optional[User]:
    """Get current user from Authorization header (Bearer) or cookie.

    Tries Bearer token first (for API clients, curl, mobile), then
    falls back to the access_token cookie (browser web flow).
    """
    token = None

    # 1) Try Authorization: Bearer <token>
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]

    # 2) Fallback to cookie
    if not token:
        token = request.cookies.get("access_token")

    if not token:
        return None

    return _resolve_user_from_token(token, db)


# Keep old name as alias for backward compatibility during migration
get_current_user_from_cookie = get_current_user


async def get_current_user_from_websocket(websocket: WebSocket, db: Session) -> Optional[User]:
    token = websocket.cookies.get("access_token")
    if not token:
        return None
    return _resolve_user_from_token(token, db)


def require_user(user: Optional[User]) -> User:
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No autorizado")
    return user


def require_superuser(user: Optional[User]) -> User:
    user = require_user(user)
    if not user.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Se requieren permisos de administrador")
    return user
