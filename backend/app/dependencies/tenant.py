"""
Tenant-scoped dependency for all authenticated endpoints.

Provides TenantContext which guarantees data isolation by tenant + organization.
"""

from dataclasses import dataclass
from typing import Optional
from uuid import UUID, uuid4

from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.core.auth import is_token_expired
from app.database import get_db
from app.dependencies.auth import FallbackUser, get_current_user
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
    grace_hours: int | None = None


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
    response: Response,
    db: Session = Depends(get_db),
) -> TenantContext:
    """
    Authenticate user, resolve active organization, verify tenant membership.

    Organization selection priority:
    1. X-Organization-Id header
    2. org_id query parameter
    3. First org the user has access to (default)
    """
    user = await get_current_user(request, db)
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

    # Check if tenant is suspended
    if user.tenant and not user.tenant.is_active and not user.is_superuser:
        raise HTTPException(status_code=403, detail="Cuenta suspendida")


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
            # Stale X-Organization-Id from localStorage — fallback to first available org
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

    # Differentiate Fintral Factura (billing module) vs Hub
    path = request.url.path
    is_bypass_path = (
        path.startswith("/api/auth/") or
        path.startswith("/api/plans/") or
        path.startswith("/api/billing/") or
        path.startswith("/api/organizations/user-orgs") or
        path.startswith("/api/organizations/switch") or
        path.startswith("/api/me")
    )

    grace_hours = None

    if not is_bypass_path:
        from app.models.user_subscription import UserSubscription
        from app.utils.dates import utc_now

        sub = (
            db.query(UserSubscription)
            .filter(UserSubscription.user_id == user.id)
            .filter(UserSubscription.status.in_(["active", "trialing", "past_due"]))
            .order_by(UserSubscription.created_at.desc())
            .first()
        )

        if sub and sub.status == "trialing":
            if sub.trial_ends_at and sub.trial_ends_at < utc_now():
                sub.status = "expired"
                db.commit()
                try:
                    from app.services.email_service import send_trial_expired_email
                    send_trial_expired_email(user.email, user.full_name or user.email)
                except Exception:
                    pass
                sub = None

        if sub and sub.status == "past_due":
            from datetime import timedelta
            grace_period = timedelta(days=3)
            time_since_failed = utc_now() - sub.updated_at
            
            if time_since_failed > grace_period:
                sub = None
            else:
                grace_hours = max(0, int((grace_period - time_since_failed).total_seconds() / 3600))

        if not sub:
            expired_sub = (
                db.query(UserSubscription)
                .filter(UserSubscription.user_id == user.id, UserSubscription.status == "expired")
                .first()
            )
            if expired_sub and request.method in ("GET", "HEAD", "OPTIONS"):
                response.headers["X-Subscription-Status"] = "expired"
            else:
                raise HTTPException(
                    status_code=402,
                    detail="Suscripción requerida para acceder al Hub Contable."
                )

        # 1. Check if entity limit is exceeded (ENTITY_BLOCKED)
        if sub and not user.is_superuser:
            user_plan = sub.plan
            if user_plan:
                max_entities = user_plan.max_entities + (sub.addon_entity_slots or 0)
                all_user_orgs = (
                    db.query(UserOrganization)
                    .filter(UserOrganization.user_id == user.id)
                    .order_by(UserOrganization.created_at.asc())
                    .all()
                )
                allowed_org_ids = [uo.organization_id for uo in all_user_orgs[:max_entities]]
                if org.id not in allowed_org_ids:
                    raise HTTPException(status_code=403, detail="ENTITY_BLOCKED")

        # 2. Check if user limit inside organization is exceeded (USER_BLOCKED)
        if not user.is_superuser:
            from app.models.organization_subscription import OrganizationSubscription
            org_sub = (
                db.query(OrganizationSubscription)
                .filter(
                    OrganizationSubscription.organization_id == org.id,
                    OrganizationSubscription.status.in_(["active", "trialing", "past_due"]),
                )
                .order_by(OrganizationSubscription.created_at.desc())
                .first()
            )
            if org_sub and org_sub.plan:
                max_users = org_sub.plan.max_users + (org_sub.addon_user_slots or 0)
                all_org_users = (
                    db.query(UserOrganization)
                    .filter(UserOrganization.organization_id == org.id)
                    .order_by(UserOrganization.created_at.asc())
                    .all()
                )
                allowed_user_ids = [uo.user_id for uo in all_org_users[:max_users]]
                if user.id not in allowed_user_ids:
                    raise HTTPException(status_code=403, detail="USER_BLOCKED")


    if grace_hours is not None:
        response.headers["X-Subscription-Grace-Remaining"] = str(grace_hours)

    if org.is_deleted:
        is_write = request.method in ("POST", "PUT", "PATCH", "DELETE")
        is_allowed_write = (
            request.url.path.endswith("/organizations/switch") or
            "/export" in request.url.path or
            "/preview" in request.url.path
        )
        if is_write and not is_allowed_write:
            raise HTTPException(
                status_code=403,
                detail="Esta organización está marcada para eliminación. Solo se permite descargar e inspeccionar información fiscal.",
            )

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
        grace_hours=grace_hours,
    )


async def optional_tenant(
    request: Request,
    db: Session = Depends(get_db),
) -> Optional[TenantContext]:
    """Like require_tenant but returns None instead of 401 for unauthenticated requests.
    Used for pages that show different content for logged-in vs anonymous users."""
    user = await get_current_user(request, db)
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

    # Check if tenant is suspended
    if user.tenant and not user.tenant.is_active and not user.is_superuser:
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
    response: Response,
    db: Session = Depends(get_db),
) -> TenantContext:
    ctx = await require_tenant(request, response, db)
    if not ctx.user.is_superuser:
        raise HTTPException(status_code=403, detail="Se requieren permisos de administrador")
    return ctx
