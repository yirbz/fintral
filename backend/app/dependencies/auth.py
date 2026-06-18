from typing import Optional
from uuid import uuid4

from fastapi import Depends, HTTPException, Request, WebSocket, status
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.config import ADMIN_EMAIL, SUPABASE_URL
from app.core.auth import verify_any_token
from app.database import get_db
from app.models import User
import logging

logger = logging.getLogger(__name__)


class FallbackUser:
    """Fake user when database is unavailable."""
    id = uuid4()
    email = ADMIN_EMAIL or "admin@fintral.local"
    full_name = "Admin User"
    is_active = True
    is_superuser = True
    tenant_id = uuid4()


def resolve_user_from_token(token: str, db: Session) -> Optional[User]:
    """Verify token and resolve to local User. Handles Supabase + legacy tokens."""
    payload = verify_any_token(token)
    if not payload:
        return None

    # Determine if this is a Supabase token
    is_supabase = False
    iss = payload.get("iss", "")
    if SUPABASE_URL and (iss.startswith(SUPABASE_URL) or payload.get("aud") == "authenticated"):
        is_supabase = True

    email = payload.get("email")
    sub = payload.get("sub")

    # If it's legacy token, sub might be the email
    if not email and sub and "@" in sub:
        email = sub

    if not email and not sub:
        return None

    try:
        user = None
        # 1) Search by supabase_uid first if it's a Supabase token and sub is a UUID/non-email
        if is_supabase and sub and "@" not in sub:
            user = db.query(User).filter(
                User.supabase_uid == sub,
                User.deleted_at.is_(None),
            ).first()

        # 2) Fallback/primary search by email
        if not user and email:
            user = db.query(User).filter(
                User.email == email,
                User.deleted_at.is_(None),
            ).first()

            # Link supabase_uid if we found the user by email but they didn't have it set
            if user and is_supabase and sub and "@" not in sub and user.supabase_uid != sub:
                user.supabase_uid = sub
                db.commit()
                logger.info("Linked Supabase UID to existing user: email=%s, supabase_id=%s", email, sub)

        # 3) If not found and verified via Supabase, auto-provision
        if not user and is_supabase and email:
            logger.info("Auto-provisioning user from verified Supabase token: email=%s, sub=%s", email, sub)
            from app.services.auth_service import provision_local_user
            user = provision_local_user(db, {"email": email, "id": sub if "@" not in sub else None})

        if user and not user.is_active:
            user.is_active = True
            db.commit()

        return user
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

    return resolve_user_from_token(token, db)


# Keep old name as alias for backward compatibility during migration
get_current_user_from_cookie = get_current_user


async def get_current_user_from_websocket(websocket: WebSocket, db: Session) -> Optional[User]:
    token = websocket.cookies.get("access_token")
    if not token:
        return None
    return resolve_user_from_token(token, db)


def require_user(user: Optional[User]) -> User:
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No autorizado")
    return user


def require_superuser(user: Optional[User]) -> User:
    user = require_user(user)
    if not user.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Se requieren permisos de administrador")
    return user
