"""
Tenant-scoped dependency for all authenticated endpoints.

Provides TenantContext which guarantees data isolation by tenant + organization.
"""

from dataclasses import dataclass
from typing import Optional
from uuid import UUID

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import get_current_user_from_cookie
from app.models import Organization, User, UserOrganization


@dataclass
class TenantContext:
    """Injected into every authenticated endpoint. Guarantees tenant isolation."""

    db: Session
    user: User
    tenant_id: UUID
    org_id: UUID
    organization: Organization
    role: str  # owner / admin / member / viewer


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
        raise HTTPException(status_code=401, detail="No autorizado")

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

        user_org = (
            db.query(UserOrganization)
            .filter(
                UserOrganization.user_id == user.id,
                UserOrganization.organization_id == org_id,
            )
            .first()
        )
        if not user_org:
            raise HTTPException(status_code=403, detail="Sin acceso a esta organización")
        role = user_org.role
    else:
        # Fallback: first org the user has access to
        user_org = (
            db.query(UserOrganization)
            .filter(UserOrganization.user_id == user.id)
            .first()
        )
        if not user_org:
            raise HTTPException(status_code=403, detail="Sin acceso a ninguna organización")
        org_id = user_org.organization_id
        role = user_org.role

    # Critical: validate org belongs to same tenant as user
    org = (
        db.query(Organization)
        .filter(
            Organization.id == org_id,
            Organization.tenant_id == user.tenant_id,
            Organization.is_active.is_(True),
        )
        .first()
    )
    if not org:
        raise HTTPException(status_code=403, detail="Organización no encontrada o inactiva")

    return TenantContext(
        db=db,
        user=user,
        tenant_id=user.tenant_id,
        org_id=org.id,
        organization=org,
        role=role,
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

    user_org = (
        db.query(UserOrganization)
        .filter(UserOrganization.user_id == user.id)
        .first()
    )
    if not user_org:
        return None

    org = (
        db.query(Organization)
        .filter(
            Organization.id == user_org.organization_id,
            Organization.tenant_id == user.tenant_id,
            Organization.is_active.is_(True),
        )
        .first()
    )
    if not org:
        return None

    return TenantContext(
        db=db,
        user=user,
        tenant_id=user.tenant_id,
        org_id=org.id,
        organization=org,
        role=user_org.role,
    )
