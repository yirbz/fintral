"""
Supabase Auth integration service.

Provides authentication operations via Supabase Auth:
- Sign in with email/password
- Verify JWT tokens (local JWKS)
- Admin user creation (service role)
- User provisioning in local DB
"""

import logging
from typing import Any

from sqlalchemy.orm import Session
from supabase import create_client, Client

from app.config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
from app.dependencies.tenancy import get_default_org, get_default_tenant
from app.models import User, UserOrganization

logger = logging.getLogger(__name__)

_supabase_admin: Client | None = None


def get_supabase_admin() -> Client | None:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return None

    global _supabase_admin
    if _supabase_admin is None:
        _supabase_admin = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    return _supabase_admin


def sign_in(email: str, password: str) -> dict | None:
    supabase = get_supabase_admin()
    if not supabase:
        return None

    try:
        response = supabase.auth.sign_in_with_password({
            "email": email,
            "password": password,
        })
        if response and response.user:
            return {
                "access_token": response.session.access_token,
                "refresh_token": response.session.refresh_token,
                "user": {
                    "id": response.user.id,
                    "email": response.user.email,
                },
            }
    except Exception as e:
        logger.warning("Sign in failed: %s", e)

    return None


def create_admin_user(email: str, password: str) -> dict | None:
    supabase = get_supabase_admin()
    if not supabase:
        return None

    try:
        response = supabase.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"full_name": "Admin User", "is_superuser": True},
        })
        if response and response.user:
            logger.info("Admin user created in Supabase Auth: %s", email)
            return {
                "id": response.user.id,
                "email": response.user.email,
            }
    except Exception as e:
        logger.warning("Admin user creation failed: %s", e)

    return None


def provision_local_user(db: Session, supabase_user: dict) -> User | None:
    """Find or create a local User record from a Supabase Auth user."""
    email = supabase_user.get("email")
    supabase_id = supabase_user.get("id")
    if not email:
        return None

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        if not existing.supabase_uid and supabase_id:
            existing.supabase_uid = supabase_id
            db.commit()
        return existing

    tenant = get_default_tenant(db)
    org = get_default_org(db, tenant.id)

    user = User(
        email=email,
        full_name="",
        is_active=True,
        is_superuser=False,
        supabase_uid=supabase_id,
        tenant_id=tenant.id,
    )
    db.add(user)
    db.flush()

    user_org = UserOrganization(
        user_id=user.id,
        organization_id=org.id,
        role="member",
    )
    db.add(user_org)
    db.commit()
    db.refresh(user)

    return user
