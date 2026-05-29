"""
Tenant-scoped dependency for all authenticated endpoints.

Provides TenantContext which guarantees data isolation by tenant + organization.
"""

from dataclasses import dataclass
from typing import Optional
from uuid import UUID, uuid4

from fastapi import Depends, HTTPException, Request
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.core.auth import is_token_expired
from app.database import get_db
from app.dependencies.auth import FallbackUser, get_current_user_from_cookie
from app.models import Organization, Tenant, User, UserOrganization


@dataclass
class TenantContext:
    """Injected into every authenticated endpoint. Guarantees tenant isolation."""

    db: Session
    user: User
    tenant: Tenant
    tenant_id: UUID
    org_id: UUID
    organization: Organization
    role: str  # owner / admin / member / viewer
    permissions: list[str] | None = None  # explicit permission overrides; None = use role defaults


@dataclass
class FallbackOrganization:
    """Fake organization when database is unavailable."""
    id: UUID
    tenant_id: UUID
    name: str = "Mi Empresa S.A."
    tax_id: str = ""
    country: str = "DO"


async def require_tenant(
    request: Request,
    db: Session = Depends(get_db),
) -> TenantContext:
    """
    Authenticate user, resolve active organization, verify tenant membership.

    Organization selection priority:
    1. X-Organization-Id header
    2. org_id query parameter
    3. First org the user has access to (default)
    """
    user = await get_current_user_from_cookie(request, db)
    if not user:
        token = request.cookies.get("access_token")
        if token and is_token_expired(token):
            raise HTTPException(status_code=401, detail="Sesión expirada")
        raise HTTPException(status_code=401, detail="No autorizado")

    # Check if user is a fallback user (DB is down)
    if isinstance(user, FallbackUser):
        fake_org = FallbackOrganization(
            id=uuid4(),
            tenant_id=user.tenant_id,
        )
        return TenantContext(
            db=db,
            user=user,
            tenant=None,
            tenant_id=user.tenant_id,
            org_id=fake_org.id,
            organization=fake_org,
            role="owner",
        )

    # Check if tenant is deleted
    if user.tenant and user.tenant.deleted_at:
        raise HTTPException(status_code=401, detail="No disponible")

    import json

    # Determine which org the user wants to work with
    org_id_str = (
        request.headers.get("X-Organization-Id")
        or request.query_params.get("org_id")
    )

    if org_id_str:
        try:
            org_id = UUID(org_id_str)
        except ValueError:
            raise HTTPException(status_code=400, detail="ID de organización inválido")

        try:
            user_org = (
                db.query(UserOrganization)
                .filter(
                    UserOrganization.user_id == user.id,
                    UserOrganization.organization_id == org_id,
                )
                .first()
            )
        except OperationalError:
            user_org = None

        if not user_org:
            raise HTTPException(status_code=403, detail="Sin acceso a esta organización")
    else:
        # Fallback: first org the user has access to
        try:
            user_org = (
                db.query(UserOrganization)
                .filter(UserOrganization.user_id == user.id)
                .first()
            )
        except OperationalError:
            user_org = None

        if not user_org:
            raise HTTPException(status_code=403, detail="Sin acceso a ninguna organización")
        org_id = user_org.organization_id

    # Critical: validate org belongs to same tenant as user
    try:
        org = (
            db.query(Organization)
            .filter(
                Organization.id == user_org.organization_id,
                Organization.tenant_id == user.tenant_id,
                Organization.is_active.is_(True),
            )
            .first()
        )
    except OperationalError:
        org = None

    if not org:
        raise HTTPException(status_code=403, detail="Organización no encontrada o inactiva")

    raw = user_org.permissions
    permissions = json.loads(raw) if raw else None

    return TenantContext(
        db=db,
        user=user,
        tenant=user.tenant,
        tenant_id=user.tenant_id,
        org_id=org.id,
        organization=org,
        role=user_org.role,
        permissions=permissions,
    )


async def optional_tenant(
    request: Request,
    db: Session = Depends(get_db),
) -> Optional[TenantContext]:
    """Like require_tenant but returns None instead of 401 for unauthenticated requests.
    Used for pages that show different content for logged-in vs anonymous users."""
    user = await get_current_user_from_cookie(request, db)
    if not user:
        return None

    # Check if user is a fallback user (DB is down)
    if isinstance(user, FallbackUser):
        fake_org = FallbackOrganization(
            id=uuid4(),
            tenant_id=user.tenant_id,
        )
        return TenantContext(
            db=db,
            user=user,
            tenant=None,
            tenant_id=user.tenant_id,
            org_id=fake_org.id,
            organization=fake_org,
            role="owner",
        )

    # Check if tenant is deleted (account frozen)
    if user.tenant and user.tenant.deleted_at:
        return None

    import json

    try:
        user_org = (
            db.query(UserOrganization)
            .filter(UserOrganization.user_id == user.id)
            .first()
        )
    except OperationalError:
        user_org = None

    if not user_org:
        return None

    try:
        org = (
            db.query(Organization)
            .filter(
                Organization.id == user_org.organization_id,
                Organization.tenant_id == user.tenant_id,
                Organization.is_active.is_(True),
            )
            .first()
        )
    except OperationalError:
        org = None

    if not org:
        return None

    raw = user_org.permissions
    permissions = json.loads(raw) if raw else None

    return TenantContext(
        db=db,
        user=user,
        tenant=user.tenant,
        tenant_id=user.tenant_id,
        org_id=org.id,
        organization=org,
        role=user_org.role,
        permissions=permissions,
    )


async def require_admin(
    request: Request,
    db: Session = Depends(get_db),
) -> TenantContext:
    ctx = await require_tenant(request, db)
    if not ctx.user.is_superuser:
        raise HTTPException(status_code=403, detail="Se requieren permisos de administrador")
    return ctx
