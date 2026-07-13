import json
import logging
import os
import tempfile
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from uuid import UUID

from app.services.plan_service import PlanService
from app.services.telegram_notifier import TelegramNotifier

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.core.redis import redis_client
from app.core.reference_data import get_cached_domain, invalidate_domain_cache
from app.database import get_db
from app.dependencies.tenant import require_admin, TenantContext
from app.services.dgii_health import check_dgii_health
from app.models import (
    AuditLog,
    Invoice,
    Organization,
    PaymentProof,
    ReferenceData,
    Tenant,
    User,
    UserOrganization,
)
from app.utils.dates import utc_now

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ---------------------------------------------------------------------------
# Dashboard Stats
# ---------------------------------------------------------------------------


@router.get("/stats")
async def admin_stats(
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    total_users = db.query(func.count(User.id)).filter(User.deleted_at.is_(None)).scalar() or 0
    active_users = (
        db.query(func.count(User.id)).filter(User.is_active.is_(True), User.deleted_at.is_(None)).scalar() or 0
    )
    total_orgs = db.query(func.count(Organization.id)).filter(Organization.deleted_at.is_(None)).scalar() or 0
    active_orgs = (
        db.query(func.count(Organization.id))
        .filter(Organization.is_active.is_(True), Organization.deleted_at.is_(None))
        .scalar()
        or 0
    )
    total_tenants = db.query(func.count(Tenant.id)).filter(Tenant.deleted_at.is_(None)).scalar() or 0
    total_invoices = db.query(func.count(Invoice.id)).scalar() or 0

    last_24h = utc_now() - timedelta(hours=24)

    new_users_24h = (
        db.query(func.count(User.id)).filter(User.created_at >= last_24h, User.deleted_at.is_(None)).scalar() or 0
    )
    new_orgs_24h = (
        db.query(func.count(Organization.id))
        .filter(Organization.created_at >= last_24h, Organization.deleted_at.is_(None))
        .scalar()
        or 0
    )
    audit_24h = db.query(func.count(AuditLog.id)).filter(AuditLog.created_at >= last_24h).scalar() or 0

    return {
        "users": {"total": total_users, "active": active_users, "new_24h": new_users_24h},
        "organizations": {"total": total_orgs, "active": active_orgs, "new_24h": new_orgs_24h},
        "tenants": total_tenants,
        "invoices": total_invoices,
        "audit_events_24h": audit_24h,
    }


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------


@router.get("/users")
async def list_users(
    search: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    is_superuser: Optional[bool] = Query(None),
    include_deleted: bool = Query(False),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    q = db.query(User)
    if not include_deleted:
        q = q.filter(User.deleted_at.is_(None))
    if search:
        pattern = f"%{search}%"
        q = q.filter(User.email.ilike(pattern) | User.full_name.ilike(pattern))
    if is_active is not None:
        q = q.filter(User.is_active.is_(is_active))
    if is_superuser is not None:
        q = q.filter(User.is_superuser.is_(is_superuser))

    total = q.count()
    users = q.order_by(User.created_at.desc()).offset(offset).limit(limit).all()

    result = []
    for u in users:
        org_count = db.query(func.count(UserOrganization.id)).filter(UserOrganization.user_id == u.id).scalar() or 0
        tenant_name = None
        if u.tenant_id:
            t = db.query(Tenant).filter(Tenant.id == u.tenant_id).first()
            tenant_name = t.name if t else None

        result.append(
            {
                "id": str(u.id),
                "email": u.email,
                "full_name": u.full_name,
                "is_active": u.is_active,
                "is_superuser": u.is_superuser,
                "tenant_id": str(u.tenant_id) if u.tenant_id else None,
                "tenant_name": tenant_name,
                "organization_count": org_count,
                "deleted_at": u.deleted_at.isoformat() if u.deleted_at else None,
                "created_at": u.created_at.isoformat() if u.created_at else None,
                "last_seen": None,
            }
        )

    return {"total": total, "offset": offset, "limit": limit, "users": result}


@router.get("/users/{user_id}")
async def get_user_detail(
    user_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    memberships = (
        db.query(
            UserOrganization.organization_id,
            UserOrganization.role,
            UserOrganization.created_at,
            Organization.name,
            Organization.is_active,
        )
        .join(Organization, UserOrganization.organization_id == Organization.id)
        .filter(UserOrganization.user_id == user.id)
        .all()
    )

    tenant_name = None
    if user.tenant_id:
        t = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
        tenant_name = t.name if t else None

    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "job_title": user.job_title,
        "phone": user.phone,
        "is_active": user.is_active,
        "is_superuser": user.is_superuser,
        "tenant_id": str(user.tenant_id) if user.tenant_id else None,
        "tenant_name": tenant_name,
        "organizations": [
            {
                "id": str(m.organization_id),
                "name": m.name,
                "role": m.role,
                "is_active": m.is_active,
                "joined_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in memberships
        ],
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


@router.patch("/users/{user_id}/toggle-active")
async def toggle_user_active(
    user_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if user.is_superuser:
        raise HTTPException(status_code=400, detail="No puedes desactivar un superusuario")

    user.is_active = not user.is_active
    db.commit()
    return {
        "id": str(user.id),
        "email": user.email,
        "is_active": user.is_active,
    }


@router.patch("/users/{user_id}/set-superuser")
async def set_user_superuser(
    user_id: str,
    body: dict,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    user.is_superuser = body.get("is_superuser", False)
    db.commit()
    return {
        "id": str(user.id),
        "email": user.email,
        "is_superuser": user.is_superuser,
    }


# ---------------------------------------------------------------------------
# Tenants
# ---------------------------------------------------------------------------


@router.get("/tenants")
async def list_tenants(
    search: Optional[str] = Query(None),
    include_deleted: bool = Query(False),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    q = db.query(Tenant)
    if not include_deleted:
        q = q.filter(Tenant.deleted_at.is_(None))
    if search:
        pattern = f"%{search}%"
        q = q.filter(Tenant.name.ilike(pattern) | Tenant.slug.ilike(pattern))

    total = q.count()
    tenants = q.order_by(Tenant.created_at.desc()).offset(offset).limit(limit).all()

    result = []
    for t in tenants:
        org_count = db.query(func.count(Organization.id)).filter(Organization.tenant_id == t.id).scalar() or 0
        user_count = db.query(func.count(User.id)).filter(User.tenant_id == t.id).scalar() or 0
        result.append(
            {
                "id": str(t.id),
                "name": t.name,
                "slug": t.slug,
                "plan": t.plan,
                "is_active": t.is_active,
                "organization_count": org_count,
                "user_count": user_count,
                "deleted_at": t.deleted_at.isoformat() if t.deleted_at else None,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
        )

    return {"total": total, "offset": offset, "limit": limit, "tenants": result}


@router.get("/tenants/{tenant_id}")
async def get_tenant_detail(
    tenant_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")

    orgs = db.query(Organization).filter(Organization.tenant_id == tenant.id).order_by(Organization.name).all()

    org_data = []
    for org in orgs:
        memberships = (
            db.query(User, UserOrganization)
            .join(UserOrganization, User.id == UserOrganization.user_id)
            .filter(UserOrganization.organization_id == org.id)
            .order_by(User.full_name)
            .all()
        )
        org_data.append(
            {
                "id": str(org.id),
                "name": org.name,
                "tax_id": org.tax_id,
                "is_active": org.is_active,
                "is_ecf_authorized": org.is_ecf_authorized,
                "certification_status": org.certification_status,
                "is_deleted": org.is_deleted,
                "deleted_at": org.deleted_at.isoformat() if org.deleted_at else None,
                "created_at": org.created_at.isoformat() if org.created_at else None,
                "users": [
                    {
                        "id": str(u.id),
                        "full_name": u.full_name,
                        "email": u.email,
                        "role": uo.role,
                        "is_active": u.is_active,
                        "deleted_at": u.deleted_at.isoformat() if u.deleted_at else None,
                    }
                    for u, uo in memberships
                ],
            }
        )

    return {
        "id": str(tenant.id),
        "name": tenant.name,
        "slug": tenant.slug,
        "plan": tenant.plan,
        "is_active": tenant.is_active,
        "settings_json": tenant.settings_json,
        "deleted_at": tenant.deleted_at.isoformat() if tenant.deleted_at else None,
        "created_at": tenant.created_at.isoformat() if tenant.created_at else None,
        "updated_at": tenant.updated_at.isoformat() if tenant.updated_at else None,
        "organizations": org_data,
    }


@router.patch("/tenants/{tenant_id}")
async def update_tenant(
    tenant_id: str,
    body: dict,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")

    if "name" in body:
        tenant.name = body["name"]
    if "slug" in body:
        tenant.slug = body["slug"]
    if "plan" in body:
        tenant.plan = body["plan"]
    if "is_active" in body:
        tenant.is_active = body["is_active"]

    db.commit()
    db.refresh(tenant)
    return {
        "id": str(tenant.id),
        "name": tenant.name,
        "slug": tenant.slug,
        "plan": tenant.plan,
        "is_active": tenant.is_active,
    }


class TenantSuspendRequest(BaseModel):
    reason: str
    notify_user: bool = True
    grace_days: int = 0


class TenantUnsuspendRequest(BaseModel):
    notify_user: bool = True


class TenantOnboardRequest(BaseModel):
    org_name: str
    tax_id: str
    admin_email: str
    admin_name: str
    plan: str
    country: str = "DO"
    password: Optional[str] = None


@router.post("/tenants/{tenant_id}/suspend")
async def suspend_tenant(
    tenant_id: str,
    body: TenantSuspendRequest,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    from app.services.email_service import send_tenant_suspension_email
    from app.services import audit_logger

    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")

    if not tenant.is_active:
        raise HTTPException(status_code=400, detail="El tenant ya está suspendido")

    tenant.is_active = False

    # Store suspension reasons in settings_json
    settings = {}
    if tenant.settings_json:
        try:
            settings = json.loads(tenant.settings_json)
        except Exception:
            pass
    settings["suspension"] = {
        "suspended_at": utc_now().isoformat(),
        "reason": body.reason,
        "grace_days": body.grace_days,
    }
    tenant.settings_json = json.dumps(settings)

    db.commit()

    # Find a representative organization for the tenant to satisfy DB nullable constraint on AuditLog
    org = db.query(Organization).filter(Organization.tenant_id == tenant.id).first()
    org_id = org.id if org else tenant.id
    org_name = org.name if org else tenant.name

    # Log audit event
    audit_logger.record(
        db=db,
        tenant_id=tenant.id,
        organization_id=org_id,
        organization_name=org_name,
        actor_id=str(ctx.user.id),
        actor_name=ctx.user.full_name,
        actor_email=ctx.user.email,
        action="tenant.suspended",
        resource_type="tenant",
        resource_id=str(tenant.id),
        summary="Tenant suspendido por administrador",
        details=f"Razón: {body.reason}, Días de gracia: {body.grace_days}",
        metadata={
            "reason": body.reason,
            "grace_days": body.grace_days,
            "notify_user": body.notify_user,
        },
    )

    # Optionally notify active users
    if body.notify_user:
        active_users = (
            db.query(User)
            .filter(User.tenant_id == tenant.id, User.is_active.is_(True), User.deleted_at.is_(None))
            .all()
        )
        for u in active_users:
            send_tenant_suspension_email(u.email, tenant.name, body.reason, body.grace_days)

    return {
        "id": str(tenant.id),
        "is_active": tenant.is_active,
        "message": "Tenant suspendido exitosamente",
    }


@router.post("/tenants/{tenant_id}/unsuspend")
async def unsuspend_tenant(
    tenant_id: str,
    body: TenantUnsuspendRequest,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    from app.services.email_service import send_tenant_unsuspension_email
    from app.services import audit_logger

    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")

    if tenant.is_active:
        raise HTTPException(status_code=400, detail="El tenant no está suspendido")

    tenant.is_active = True

    # Clear suspension from settings_json
    settings = {}
    if tenant.settings_json:
        try:
            settings = json.loads(tenant.settings_json)
        except Exception:
            pass
    settings.pop("suspension", None)
    tenant.settings_json = json.dumps(settings)

    db.commit()

    # Find a representative organization for the tenant to satisfy DB nullable constraint on AuditLog
    org = db.query(Organization).filter(Organization.tenant_id == tenant.id).first()
    org_id = org.id if org else tenant.id
    org_name = org.name if org else tenant.name

    # Log audit event
    audit_logger.record(
        db=db,
        tenant_id=tenant.id,
        organization_id=org_id,
        organization_name=org_name,
        actor_id=str(ctx.user.id),
        actor_name=ctx.user.full_name,
        actor_email=ctx.user.email,
        action="tenant.reactivated",
        resource_type="tenant",
        resource_id=str(tenant.id),
        summary="Tenant reactivado por administrador",
        details="El tenant fue reactivado exitosamente",
        metadata={
            "notify_user": body.notify_user,
        },
    )

    # Optionally notify active users
    if body.notify_user:
        active_users = (
            db.query(User)
            .filter(User.tenant_id == tenant.id, User.is_active.is_(True), User.deleted_at.is_(None))
            .all()
        )
        for u in active_users:
            send_tenant_unsuspension_email(u.email, tenant.name)

    return {
        "id": str(tenant.id),
        "is_active": tenant.is_active,
        "message": "Tenant reactivado exitosamente",
    }


@router.post("/tenants")
async def onboard_tenant(
    body: TenantOnboardRequest,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    import secrets
    from app.core.auth import get_password_hash
    from app.dependencies.tenancy import slugify
    from app.services.auth_service import get_supabase_admin
    from app.services import audit_logger
    from app.models.subscription_plan import SubscriptionPlan

    # Check if plan exists
    plan_name = body.plan.lower()
    plan_obj = (
        db.query(SubscriptionPlan)
        .filter(SubscriptionPlan.name == plan_name, SubscriptionPlan.is_active.is_(True))
        .first()
    )
    if not plan_obj:
        raise HTTPException(
            status_code=400, detail=f"Plan '{body.plan}' no encontrado o inactivo"
        )

    # Check if admin email in use
    existing_user = db.query(User).filter(User.email == body.admin_email).first()
    if existing_user:
        raise HTTPException(
            status_code=400, detail="El email del administrador ya está en uso"
        )

    # Generate unique slug
    base_slug = slugify(body.org_name)
    slug = base_slug
    suffix = 1
    while db.query(Tenant).filter(Tenant.slug == slug).first():
        slug = f"{base_slug}-{suffix}"
        suffix += 1

    password = body.password or f"Fintral-{secrets.token_urlsafe(8)}"
    hashed_password = get_password_hash(password)

    # Handle Supabase Auth if present
    supabase = get_supabase_admin()
    supabase_uid = None
    if supabase:
        try:
            response = supabase.auth.admin.create_user({
                "email": body.admin_email,
                "password": password,
                "email_confirm": True,
                "user_metadata": {"full_name": body.admin_name},
            })
            if response and response.user:
                supabase_uid = response.user.id
                logger.info(
                    "Manual onboard: Supabase user created: %s (%s)",
                    body.admin_email,
                    supabase_uid,
                )
            else:
                logger.warning("Supabase Auth returned no user for %s", body.admin_email)
        except Exception as e:
            logger.warning(
                "Supabase Auth user creation failed for %s: %s. Continuing with local dev flow.",
                body.admin_email,
                e,
            )

    # Create Tenant
    tenant = Tenant(
        name=body.org_name,
        slug=slug,
        plan=plan_name,
        is_active=True,
    )
    db.add(tenant)
    db.flush()

    # Create Organization
    org = Organization(
        tenant_id=tenant.id,
        name=body.org_name,
        tax_id=body.tax_id or None,
        country=body.country or "DO",
        is_active=True,
    )
    db.add(org)
    db.flush()

    # Create User
    user = User(
        email=body.admin_email,
        full_name=body.admin_name,
        is_active=True,
        is_superuser=False,
        supabase_uid=supabase_uid,
        tenant_id=tenant.id,
        hashed_password=hashed_password,
    )
    db.add(user)
    db.flush()

    # UserOrganization role="owner"
    user_org = UserOrganization(
        user_id=user.id,
        organization_id=org.id,
        role="owner",
    )
    db.add(user_org)
    db.flush()

    # Provision Subscription
    plan_service = PlanService(db)
    plan_service.change_plan(org.id, plan_name)

    # Log audit event
    audit_logger.record(
        db=db,
        tenant_id=tenant.id,
        organization_id=org.id,
        organization_name=org.name,
        actor_id=str(ctx.user.id),
        actor_name=ctx.user.full_name,
        actor_email=ctx.user.email,
        action="tenant.created",
        resource_type="tenant",
        resource_id=str(tenant.id),
        summary="Tenant creado manualmente por administrador",
        details=f"Organización: {org.name}, Email: {user.email}, Plan: {body.plan}",
        metadata={
            "tenant_name": tenant.name,
            "org_name": org.name,
            "tax_id": org.tax_id,
            "admin_email": user.email,
            "plan": body.plan,
        },
    )

    db.commit()

    return {
        "tenant_id": str(tenant.id),
        "tenant_name": tenant.name,
        "slug": tenant.slug,
        "org_id": str(org.id),
        "admin_email": user.email,
        "admin_name": user.full_name,
        "plan": tenant.plan,
        "temp_password": password if not body.password else None,
    }



@router.delete("/tenants/{tenant_id}")
async def delete_tenant(
    tenant_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")
    if tenant.deleted_at:
        raise HTTPException(status_code=400, detail="El tenant ya está eliminado")

    now = utc_now()
    tenant.deleted_at = now
    db.query(Organization).filter(Organization.tenant_id == tenant.id, Organization.deleted_at.is_(None)).update(
        {"deleted_at": now}, synchronize_session=False
    )
    db.query(User).filter(User.tenant_id == tenant.id, User.deleted_at.is_(None)).update(
        {"deleted_at": now}, synchronize_session=False
    )
    db.commit()
    return {"message": "Tenant y sus recursos marcados como eliminados"}


@router.patch("/tenants/{tenant_id}/restore")
async def restore_tenant(
    tenant_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")
    if not tenant.deleted_at:
        raise HTTPException(status_code=400, detail="El tenant no está eliminado")

    tenant.deleted_at = None
    db.query(Organization).filter(Organization.tenant_id == tenant.id, Organization.deleted_at.isnot(None)).update(
        {"deleted_at": None}, synchronize_session=False
    )
    db.query(User).filter(User.tenant_id == tenant.id, User.deleted_at.isnot(None)).update(
        {"deleted_at": None}, synchronize_session=False
    )
    db.commit()
    return {"message": "Tenant restaurado"}


# ---------------------------------------------------------------------------
# User Management (soft-delete, update)
# ---------------------------------------------------------------------------


@router.patch("/users/{user_id}")
async def update_user(
    user_id: str,
    body: dict,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if "full_name" in body:
        user.full_name = body["full_name"]
    if "email" in body:
        user.email = body["email"]
    if "is_active" in body:
        user.is_active = body["is_active"]
    if "is_superuser" in body:
        user.is_superuser = body["is_superuser"]

    db.commit()
    db.refresh(user)
    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "is_active": user.is_active,
        "is_superuser": user.is_superuser,
    }


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.is_superuser:
        raise HTTPException(status_code=400, detail="No puedes eliminar un superusuario")
    if user.deleted_at:
        raise HTTPException(status_code=400, detail="El usuario ya está eliminado")

    user.deleted_at = utc_now()
    db.commit()
    return {"message": "Usuario marcado como eliminado (datos preservados por retención fiscal)"}


@router.patch("/users/{user_id}/restore")
async def restore_user(
    user_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if not user.deleted_at:
        raise HTTPException(status_code=400, detail="El usuario no está eliminado")

    user.deleted_at = None
    db.commit()
    return {"message": "Usuario restaurado"}


# ---------------------------------------------------------------------------
# Organization Management (soft-delete, update, restore)
# ---------------------------------------------------------------------------


@router.patch("/organizations/{org_id}")
async def update_organization(
    org_id: str,
    body: dict,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organización no encontrada")

    if "name" in body:
        org.name = body["name"]
    if "is_active" in body:
        org.is_active = body["is_active"]
    if "tax_id" in body:
        try:
            org.tax_id = body["tax_id"]
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    if "is_ecf_authorized" in body:
        org.is_ecf_authorized = body["is_ecf_authorized"]
    if "certification_status" in body:
        org.certification_status = body["certification_status"]

    db.commit()
    db.refresh(org)
    return {
        "id": str(org.id),
        "name": org.name,
        "tax_id": org.tax_id,
        "is_active": org.is_active,
        "is_ecf_authorized": org.is_ecf_authorized,
        "certification_status": org.certification_status,
        "tenant_id": str(org.tenant_id),
        "is_deleted": org.is_deleted,
    }



@router.delete("/organizations/{org_id}")
async def delete_organization(
    org_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organización no encontrada")
    if org.is_deleted or org.deleted_at:
        raise HTTPException(status_code=400, detail="La organización ya está eliminada")

    org.is_deleted = True
    org.deleted_at = utc_now()
    db.commit()
    return {"message": "Organización marcada como eliminada (datos preservados por retención fiscal)"}


@router.patch("/organizations/{org_id}/restore")
async def restore_organization(
    org_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organización no encontrada")
    if not org.is_deleted and not org.deleted_at:
        raise HTTPException(status_code=400, detail="La organización no está eliminada")

    org.is_deleted = False
    org.deleted_at = None
    db.commit()
    return {"message": "Organización restaurada"}


# ---------------------------------------------------------------------------
# System Health
# ---------------------------------------------------------------------------


@router.get("/health")
async def system_health(
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    checks = {}

    # Database
    try:
        db.execute(text("SELECT 1"))
        checks["database"] = {"status": "ok"}
    except Exception as e:
        checks["database"] = {"status": "error", "message": str(e)}

    # Redis
    try:
        r = redis_client()
        if r:
            r.ping()
            checks["redis"] = {"status": "ok"}
        else:
            checks["redis"] = {"status": "disconnected"}
    except Exception as e:
        checks["redis"] = {"status": "error", "message": str(e)}

    # Recent error logs
    last_hour = utc_now() - timedelta(hours=1)
    error_count = (
        db.query(func.count(AuditLog.id))
        .filter(
            AuditLog.action == "error",
            AuditLog.created_at >= last_hour,
        )
        .scalar()
        or 0
    )

    return {
        "status": "ok" if all(c.get("status") == "ok" for c in checks.values()) else "degraded",
        "timestamp": utc_now().isoformat(),
        "checks": checks,
        "errors_last_hour": error_count,
    }


@router.get("/reference-data")
async def list_reference_data(
    domain: Optional[str] = Query(None),
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    query = db.query(ReferenceData)
    if domain:
        query = query.filter(ReferenceData.domain == domain)
    if not include_inactive:
        query = query.filter(ReferenceData.is_active.is_(True))
    items = query.order_by(ReferenceData.domain, ReferenceData.sort_order, ReferenceData.code).all()
    return {"items": [item.to_dict() for item in items], "total": len(items)}


@router.post("/reference-data")
async def create_reference_data(
    body: dict,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    existing = (
        db.query(ReferenceData)
        .filter(
            ReferenceData.domain == body["domain"],
            ReferenceData.code == body["code"],
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail=f"Ya existe '{body['code']}' en dominio '{body['domain']}'")

    meta = body.get("metadata")
    item = ReferenceData(
        domain=body["domain"],
        code=body["code"],
        label_es=body["label_es"],
        description=body.get("description"),
        sort_order=body.get("sort_order", 0),
        is_active=body.get("is_active", True),
        metadata_json=json.dumps(meta) if meta else None,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    invalidate_domain_cache(item.domain)
    return item.to_dict()


@router.put("/reference-data/{item_id}")
async def update_reference_data(
    item_id: str,
    body: dict,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    item = db.query(ReferenceData).filter(ReferenceData.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")

    if "code" in body:
        item.code = body["code"]
    if "label_es" in body:
        item.label_es = body["label_es"]
    if "description" in body:
        item.description = body.get("description")
    if "sort_order" in body:
        item.sort_order = body["sort_order"]
    if "is_active" in body:
        item.is_active = body["is_active"]
    if "metadata" in body:
        item.metadata_json = json.dumps(body["metadata"]) if body.get("metadata") else None

    db.commit()
    db.refresh(item)
    invalidate_domain_cache(item.domain)
    return item.to_dict()


@router.delete("/reference-data/{item_id}")
async def delete_reference_data(
    item_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    item = db.query(ReferenceData).filter(ReferenceData.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")
    domain = item.domain
    db.delete(item)
    db.commit()
    invalidate_domain_cache(domain)
    return {"message": "Item eliminado"}


@router.get("/reference-data/domains")
async def list_domains(
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    rows = db.query(ReferenceData.domain).distinct().order_by(ReferenceData.domain).all()
    return {"domains": [r[0] for r in rows]}


@router.get("/reference-data/public/{domain}")
async def get_domain_data(
    domain: str,
    db: Session = Depends(get_db),
):
    items = get_cached_domain(db, domain)
    return {"domain": domain, "items": items}


@router.get("/audit-logs")
async def list_admin_audit_logs(
    tenant_id: Optional[str] = Query(None, description="Filter by tenant UUID"),
    organization_id: Optional[str] = Query(None, description="Filter by organization UUID"),
    action: Optional[str] = Query(None),
    actor_id: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    visibility: Optional[str] = Query(None, description="client, internal, or empty for all"),
    start_date: Optional[str] = Query(None, description="ISO start date"),
    end_date: Optional[str] = Query(None, description="ISO end date"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    ctx: TenantContext = Depends(require_admin),
):
    q = ctx.db.query(AuditLog)
    if tenant_id:
        try:
            q = q.filter(AuditLog.tenant_id == UUID(tenant_id))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid tenant_id UUID")
    if organization_id:
        try:
            q = q.filter(AuditLog.organization_id == UUID(organization_id))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid organization_id UUID")
    if visibility == "client":
        q = q.filter((AuditLog.visibility == "client") | (AuditLog.visibility.is_(None)))
    elif visibility:
        q = q.filter(AuditLog.visibility == visibility)
    if action:
        q = q.filter(AuditLog.action == action)
    if actor_id:
        q = q.filter(AuditLog.actor_id == actor_id)
    if resource_type:
        q = q.filter(AuditLog.resource_type == resource_type)

    if start_date:
        try:
            # Handle possible 'Z' suffix or standard ISO formats
            dt_str = start_date.replace("Z", "+00:00")
            q = q.filter(AuditLog.created_at >= datetime.fromisoformat(dt_str))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid start_date format, must be ISO-8601")
    if end_date:
        try:
            dt_str = end_date.replace("Z", "+00:00")
            q = q.filter(AuditLog.created_at <= datetime.fromisoformat(dt_str))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid end_date format, must be ISO-8601")

    total = q.count()
    rows = q.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit).all()
    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "events": [r.to_dict() for r in rows],
    }


@router.get("/health/dgii/check")
async def run_dgii_health_check(ctx: TenantContext = Depends(require_admin)):
    report = await check_dgii_health()
    return report.to_dict()


@router.get("/analytics/costs")
async def admin_costs_analytics(
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    from app.core.container import cost_control

    return cost_control.get_cost_statistics(db)


@router.get("/analytics/usage")
async def admin_usage_analytics(
    cycle: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    from app.models import UsageRecord

    if cycle is None:
        cycle = int(utc_now().strftime("%Y%m"))

    usage_stats = (
        db.query(
            func.sum(UsageRecord.ecf_count).label("ecf_count"),
            func.sum(UsageRecord.ai_query_count).label("ai_query_count"),
            func.sum(UsageRecord.ocr_doc_count).label("ocr_doc_count"),
            func.sum(UsageRecord.storage_bytes).label("storage_bytes"),
            func.sum(UsageRecord.api_call_count).label("api_call_count"),
        )
        .filter(UsageRecord.cycle == cycle)
        .first()
    )

    top_ai = (
        db.query(UsageRecord.organization_id, Organization.name, UsageRecord.ai_query_count)
        .join(Organization, UsageRecord.organization_id == Organization.id)
        .filter(UsageRecord.cycle == cycle)
        .order_by(UsageRecord.ai_query_count.desc())
        .limit(5)
        .all()
    )

    top_ecf = (
        db.query(UsageRecord.organization_id, Organization.name, UsageRecord.ecf_count)
        .join(Organization, UsageRecord.organization_id == Organization.id)
        .filter(UsageRecord.cycle == cycle)
        .order_by(UsageRecord.ecf_count.desc())
        .limit(5)
        .all()
    )

    local_vs_electronic = (
        db.query(Invoice.is_electronic, func.count(Invoice.id))
        .filter(Invoice.is_deleted.is_(False))
        .group_by(Invoice.is_electronic)
        .all()
    )

    local_vs_electronic_dict = {"electronic": 0, "physical": 0}
    for is_elec, count in local_vs_electronic:
        if is_elec:
            local_vs_electronic_dict["electronic"] = count
        else:
            local_vs_electronic_dict["physical"] = count

    source_dist = (
        db.query(Invoice.source_type, func.count(Invoice.id))
        .filter(Invoice.is_deleted.is_(False))
        .group_by(Invoice.source_type)
        .all()
    )
    source_dist_dict = {str(k or "unknown"): v for k, v in source_dist}

    ai_invoices = db.query(Invoice).filter(Invoice.confidence_score.isnot(None), Invoice.is_deleted.is_(False))
    total_ai_invoices = ai_invoices.count()
    low_confidence_invoices = ai_invoices.filter(Invoice.confidence_score < 0.7).count()
    avg_confidence = (
        db.query(func.avg(Invoice.confidence_score))
        .filter(Invoice.confidence_score.isnot(None), Invoice.is_deleted.is_(False))
        .scalar()
        or 1.0
    )

    return {
        "cycle": cycle,
        "totals": {
            "ecf_count": int(usage_stats.ecf_count or 0) if usage_stats else 0,
            "ai_query_count": int(usage_stats.ai_query_count or 0) if usage_stats else 0,
            "ocr_doc_count": int(usage_stats.ocr_doc_count or 0) if usage_stats else 0,
            "storage_mb": round((usage_stats.storage_bytes or 0) / (1024 * 1024), 2) if usage_stats else 0,
            "api_call_count": int(usage_stats.api_call_count or 0) if usage_stats else 0,
        },
        "top_organizations": {
            "ai": [{"org_id": str(org_id), "name": name, "value": val} for org_id, name, val in top_ai],
            "ecf": [{"org_id": str(org_id), "name": name, "value": val} for org_id, name, val in top_ecf],
        },
        "ratio_local_vs_electronic": local_vs_electronic_dict,
        "source_distribution": source_dist_dict,
        "ai_extraction_quality": {
            "total_ai_processed": total_ai_invoices,
            "low_confidence_count": low_confidence_invoices,
            "error_rate_pct": round((low_confidence_invoices / total_ai_invoices * 100), 2)
            if total_ai_invoices > 0
            else 0,
            "average_confidence": round(float(avg_confidence), 4),
        },
    }


@router.get("/analytics/storage")
async def admin_storage_analytics(
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    from app.models import UsageRecord

    current_cycle = int(utc_now().strftime("%Y%m"))

    storage_by_org = (
        db.query(UsageRecord.organization_id, Organization.name, UsageRecord.storage_bytes)
        .join(Organization, UsageRecord.organization_id == Organization.id)
        .filter(UsageRecord.cycle == current_cycle)
        .order_by(UsageRecord.storage_bytes.desc())
        .all()
    )

    total_bytes = sum(item[2] for item in storage_by_org if item[2] is not None)

    file_types = (
        db.query(Invoice.file_type, func.count(Invoice.id))
        .filter(Invoice.is_deleted.is_(False))
        .group_by(Invoice.file_type)
        .all()
    )

    file_sources = (
        db.query(Invoice.source_type, func.count(Invoice.id))
        .filter(Invoice.is_deleted.is_(False))
        .group_by(Invoice.source_type)
        .all()
    )

    return {
        "total_storage_bytes": total_bytes,
        "total_storage_mb": round(total_bytes / (1024 * 1024), 2),
        "total_storage_gb": round(total_bytes / (1024 * 1024 * 1024), 4),
        "organizations": [
            {
                "org_id": str(org_id),
                "name": name,
                "storage_bytes": bytes_val or 0,
                "storage_mb": round((bytes_val or 0) / (1024 * 1024), 2),
            }
            for org_id, name, bytes_val in storage_by_org
            if (bytes_val or 0) > 0
        ],
        "file_types": {str(k or "unknown"): v for k, v in file_types},
        "file_sources": {str(k or "unknown"): v for k, v in file_sources},
    }


@router.get("/analytics/alanube")
async def admin_alanube_analytics(
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    from sqlalchemy import Integer, cast
    from app.models.alanube_telemetry import AlanubeTelemetry

    totals = db.query(
        func.count(AlanubeTelemetry.id).label("total"),
        func.sum(cast(AlanubeTelemetry.success, Integer)).label("success"),
        func.avg(AlanubeTelemetry.latency_ms).label("avg_latency"),
    ).first()

    total_calls = totals.total or 0
    success_calls = totals.success or 0
    failed_calls = total_calls - success_calls
    avg_latency = float(totals.avg_latency or 0)

    by_action = (
        db.query(AlanubeTelemetry.action, func.count(AlanubeTelemetry.id)).group_by(AlanubeTelemetry.action).all()
    )
    by_action_dict = {str(k): v for k, v in by_action}

    by_ecf = (
        db.query(AlanubeTelemetry.ecf_type, func.count(AlanubeTelemetry.id))
        .filter(AlanubeTelemetry.ecf_type.isnot(None))
        .group_by(AlanubeTelemetry.ecf_type)
        .all()
    )
    by_ecf_dict = {str(k): v for k, v in by_ecf}

    recent_failures = (
        db.query(
            AlanubeTelemetry.id,
            AlanubeTelemetry.action,
            AlanubeTelemetry.ecf_type,
            AlanubeTelemetry.error_message,
            AlanubeTelemetry.latency_ms,
            AlanubeTelemetry.created_at,
            Organization.name.label("org_name"),
        )
        .join(Organization, AlanubeTelemetry.organization_id == Organization.id)
        .filter(AlanubeTelemetry.success.is_(False))
        .order_by(AlanubeTelemetry.created_at.desc())
        .limit(10)
        .all()
    )

    return {
        "summary": {
            "total_calls": total_calls,
            "success_calls": success_calls,
            "failed_calls": failed_calls,
            "success_rate_pct": round((success_calls / total_calls * 100), 2) if total_calls > 0 else 100.0,
            "average_latency_ms": round(avg_latency, 2),
        },
        "by_action": by_action_dict,
        "by_ecf_type": by_ecf_dict,
        "recent_failures": [
            {
                "id": str(item.id),
                "action": item.action,
                "ecf_type": item.ecf_type,
                "error_message": item.error_message,
                "latency_ms": item.latency_ms,
                "created_at": item.created_at.isoformat() if item.created_at else None,
                "organization_name": item.org_name,
            }
            for item in recent_failures
        ],
    }


# ---------------------------------------------------------------------------
# Finance & Subscriptions Analytics
# ---------------------------------------------------------------------------


@router.get("/finance/mrr")
async def admin_finance_mrr(
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    from app.models.organization_subscription import OrganizationSubscription
    from app.models.user_subscription import UserSubscription

    # Sums price_monthly_cents of active subscriptions taking custom overrides into account, deselecting trialing
    subs = db.query(OrganizationSubscription).filter(OrganizationSubscription.status == "active").all()

    total_mrr_cents = 0
    base_mrr_cents = 0
    addon_mrr_cents = 0

    for sub in subs:
        plan = sub.plan
        if not plan:
            continue

        base_price = sub.custom_price_cents if sub.custom_price_cents is not None else plan.price_monthly_cents
        addon_price = (
            sub.addon_ecf_blocks * plan.addon_ecf_block_price_cents
            + sub.addon_ai_blocks * plan.addon_ai_block_price_cents
            + sub.addon_storage_blocks * plan.addon_storage_block_price_cents
            + sub.addon_user_slots * plan.user_slot_price_cents
        )

        base_mrr_cents += base_price
        addon_mrr_cents += addon_price
        total_mrr_cents += base_price + addon_price

    # Also account for user-level entity slot addons
    user_subs = db.query(UserSubscription).filter(UserSubscription.status == "active").all()
    for us in user_subs:
        if us.addon_entity_slots and us.plan:
            entity_revenue = us.addon_entity_slots * us.plan.entity_slot_price_cents
            addon_mrr_cents += entity_revenue
            total_mrr_cents += entity_revenue

    return {
        "mrr": round(total_mrr_cents / 100, 2),
        "mrr_cents": total_mrr_cents,
        "base_mrr": round(base_mrr_cents / 100, 2),
        "addon_mrr": round(addon_mrr_cents / 100, 2),
        "active_subscriptions_count": len(subs),
    }


@router.get("/finance/payments")
async def admin_finance_payments(
    status: Optional[str] = Query(None),
    organization_id: Optional[UUID] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    # DEPRECATED: MIO has been deprecated and deleted
    return {
        "payments": [],
        "total": 0,
        "limit": limit,
        "offset": offset,
    }


@router.get("/finance/churn")
async def admin_finance_churn(
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    from app.models.organization_subscription import OrganizationSubscription
    from app.models.invoice import Invoice

    now = utc_now()
    fourteen_days_ago = now - timedelta(days=14)
    ninety_days_ago = now - timedelta(days=90)

    lost_subs = (
        db.query(OrganizationSubscription)
        .filter(
            (OrganizationSubscription.status.in_(["canceled", "expired"]))
            & (
                (OrganizationSubscription.updated_at >= ninety_days_ago)
                | (OrganizationSubscription.canceled_at >= ninety_days_ago)
            )
        )
        .all()
    )

    lost_subscriptions_list = []
    for sub in lost_subs:
        lost_subscriptions_list.append(
            {
                "subscription_id": str(sub.id),
                "organization_id": str(sub.organization_id),
                "organization_name": sub.organization.name if sub.organization else "Unknown",
                "plan_name": sub.plan.display_name if sub.plan else "Unknown",
                "status": sub.status,
                "canceled_at": sub.canceled_at.isoformat() if sub.canceled_at else None,
                "lost_at": (sub.canceled_at or sub.updated_at).isoformat(),
            }
        )

    active_subs = db.query(OrganizationSubscription).filter(OrganizationSubscription.status == "active").all()

    churn_risks = []
    for sub in active_subs:
        org = sub.organization
        if not org:
            continue

        invoice_count = (
            db.query(func.count(Invoice.id))
            .filter(
                Invoice.organization_id == org.id,
                Invoice.created_at >= fourteen_days_ago,
                Invoice.is_deleted.is_(False),
            )
            .scalar()
            or 0
        )

        if invoice_count == 0:
            total_invoices = (
                db.query(func.count(Invoice.id))
                .filter(Invoice.organization_id == org.id, Invoice.is_deleted.is_(False))
                .scalar()
                or 0
            )

            churn_risks.append(
                {
                    "organization_id": str(org.id),
                    "organization_name": org.name,
                    "plan_name": sub.plan.display_name if sub.plan else "Unknown",
                    "billing_cycle_end": sub.billing_cycle_end.isoformat() if sub.billing_cycle_end else None,
                    "total_invoices": total_invoices,
                    "last_activity": org.updated_at.isoformat() if org.updated_at else None,
                }
            )

    return {
        "lost_subscriptions_last_90_days": lost_subscriptions_list,
        "lost_count": len(lost_subscriptions_list),
        "churn_risks": churn_risks,
        "churn_risk_count": len(churn_risks),
    }


@router.get("/finance/subscription-distribution")
async def admin_subscription_distribution(
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    from app.models.organization_subscription import OrganizationSubscription
    from app.models.subscription_plan import SubscriptionPlan

    # Distribution by plan
    plan_dist = (
        db.query(SubscriptionPlan.display_name, func.count(OrganizationSubscription.id))
        .join(SubscriptionPlan, OrganizationSubscription.plan_id == SubscriptionPlan.id)
        .group_by(SubscriptionPlan.display_name)
        .all()
    )

    # Distribution by status
    status_dist = (
        db.query(OrganizationSubscription.status, func.count(OrganizationSubscription.id))
        .group_by(OrganizationSubscription.status)
        .all()
    )

    return {"by_plan": {str(k): v for k, v in plan_dist}, "by_status": {str(k): v for k, v in status_dist}}


@router.get("/subscriptions")
async def list_admin_subscriptions(
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    from app.models.organization_subscription import OrganizationSubscription

    q = db.query(OrganizationSubscription)
    if status:
        q = q.filter(OrganizationSubscription.status == status)

    total = q.count()
    subs = q.order_by(OrganizationSubscription.created_at.desc()).offset(offset).limit(limit).all()

    result = []
    for sub in subs:
        sub_dict = sub.to_dict()
        sub_dict["organization_name"] = sub.organization.name if sub.organization else None
        result.append(sub_dict)

    return {
        "subscriptions": result,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


class SubscriptionUpdate(BaseModel):
    plan_id: Optional[UUID] = None
    status: Optional[str] = None
    custom_price_cents: Optional[int] = None
    custom_limits_json: Optional[Dict[str, Any]] = None
    billing_cycle_end: Optional[datetime] = None
    addon_ecf_blocks: Optional[int] = None
    addon_ai_blocks: Optional[int] = None
    addon_storage_blocks: Optional[int] = None
    addon_ocr_blocks: Optional[int] = None
    addon_entity_slots: Optional[int] = None
    addon_user_slots: Optional[int] = None


@router.patch("/subscriptions/{sub_id}")
async def update_admin_subscription(
    sub_id: UUID,
    body: SubscriptionUpdate,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    from app.models.organization_subscription import OrganizationSubscription
    from app.services import audit_logger

    sub = db.query(OrganizationSubscription).filter(OrganizationSubscription.id == sub_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")

    old_values = {}
    new_values = {}

    if body.plan_id is not None:
        old_values["plan_id"] = str(sub.plan_id)
        sub.plan_id = body.plan_id
        new_values["plan_id"] = str(body.plan_id)

    if body.status is not None:
        old_values["status"] = sub.status
        sub.status = body.status
        new_values["status"] = body.status

    if body.custom_price_cents is not None:
        old_values["custom_price_cents"] = sub.custom_price_cents
        sub.custom_price_cents = body.custom_price_cents
        new_values["custom_price_cents"] = body.custom_price_cents

    if body.custom_limits_json is not None:
        old_values["custom_limits_json"] = sub.custom_limits_json
        sub.custom_limits_json = json.dumps(body.custom_limits_json)
        new_values["custom_limits_json"] = sub.custom_limits_json

    if body.billing_cycle_end is not None:
        old_values["billing_cycle_end"] = sub.billing_cycle_end.isoformat() if sub.billing_cycle_end else None
        dt = body.billing_cycle_end
        if dt.tzinfo is None:
            import pytz

            dt = pytz.UTC.localize(dt)
        sub.billing_cycle_end = dt
        new_values["billing_cycle_end"] = dt.isoformat()

    if body.addon_ecf_blocks is not None:
        old_values["addon_ecf_blocks"] = sub.addon_ecf_blocks
        sub.addon_ecf_blocks = body.addon_ecf_blocks
        new_values["addon_ecf_blocks"] = body.addon_ecf_blocks

    if body.addon_ai_blocks is not None:
        old_values["addon_ai_blocks"] = sub.addon_ai_blocks
        sub.addon_ai_blocks = body.addon_ai_blocks
        new_values["addon_ai_blocks"] = body.addon_ai_blocks

    if body.addon_storage_blocks is not None:
        old_values["addon_storage_blocks"] = sub.addon_storage_blocks
        sub.addon_storage_blocks = body.addon_storage_blocks
        new_values["addon_storage_blocks"] = body.addon_storage_blocks

    if body.addon_ocr_blocks is not None:
        old_values["addon_ocr_blocks"] = sub.addon_ocr_blocks
        sub.addon_ocr_blocks = body.addon_ocr_blocks
        new_values["addon_ocr_blocks"] = body.addon_ocr_blocks

    if body.addon_entity_slots is not None:
        old_values["addon_entity_slots"] = sub.addon_entity_slots
        sub.addon_entity_slots = body.addon_entity_slots
        new_values["addon_entity_slots"] = body.addon_entity_slots

    if body.addon_user_slots is not None:
        old_values["addon_user_slots"] = sub.addon_user_slots
        sub.addon_user_slots = body.addon_user_slots
        new_values["addon_user_slots"] = body.addon_user_slots

    sub.updated_at = utc_now()
    db.commit()
    db.refresh(sub)

    audit_logger.record(
        db=db,
        tenant_id=ctx.tenant_id,
        organization_id=sub.organization_id,
        organization_name=sub.organization.name if sub.organization else None,
        actor_id=str(ctx.user.id),
        actor_name=ctx.user.full_name,
        actor_email=ctx.user.email,
        action="settings.updated",
        resource_type="subscription",
        resource_id=str(sub.id),
        summary="Suscripción modificada por administrador",
        details=f"Valores modificados: {json.dumps(new_values)}",
        metadata={"old_values": old_values, "new_values": new_values},
    )

    return sub.to_dict()


class SubscriptionCreditRequest(BaseModel):
    days: int
    reason: str


@router.post("/subscriptions/{sub_id}/credit")
async def credit_admin_subscription(
    sub_id: UUID,
    body: SubscriptionCreditRequest,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    from app.models.organization_subscription import OrganizationSubscription
    from app.services import audit_logger

    sub = db.query(OrganizationSubscription).filter(OrganizationSubscription.id == sub_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")

    old_cycle_end = sub.billing_cycle_end
    new_cycle_end = old_cycle_end + timedelta(days=body.days)
    sub.billing_cycle_end = new_cycle_end
    sub.updated_at = utc_now()
    db.commit()
    db.refresh(sub)

    audit_logger.record(
        db=db,
        tenant_id=ctx.tenant_id,
        organization_id=sub.organization_id,
        organization_name=sub.organization.name if sub.organization else None,
        actor_id=str(ctx.user.id),
        actor_name=ctx.user.full_name,
        actor_email=ctx.user.email,
        action="settings.updated",
        resource_type="subscription",
        resource_id=str(sub.id),
        summary="Crédito de días de gracia aplicado a la suscripción",
        details=f"Se agregaron {body.days} días de gracia. Nueva fecha fin: {new_cycle_end.isoformat()}. Razón: {body.reason}",
        metadata={
            "grace_days": body.days,
            "reason": body.reason,
            "old_billing_cycle_end": old_cycle_end.isoformat(),
            "new_billing_cycle_end": new_cycle_end.isoformat(),
        },
    )

    return sub.to_dict()


@router.get("/subscription-plans")
async def list_admin_subscription_plans(
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    from app.models.subscription_plan import SubscriptionPlan

    plans = db.query(SubscriptionPlan).order_by(SubscriptionPlan.sort_order).all()
    return [plan.to_dict() for plan in plans]


@router.get("/user-subscriptions")
async def list_admin_user_subscriptions(
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    from app.models.user_subscription import UserSubscription
    from app.models.user import User

    q = db.query(UserSubscription).join(User, UserSubscription.user_id == User.id)
    if status:
        q = q.filter(UserSubscription.status == status)
    if search:
        search_filter = f"%{search}%"
        q = q.filter(
            (User.email.ilike(search_filter)) |
            (User.full_name.ilike(search_filter))
        )

    total = q.count()
    subs = q.order_by(UserSubscription.created_at.desc()).offset(offset).limit(limit).all()

    result = []
    for sub in subs:
        sub_dict = sub.to_dict()
        sub_dict["user_email"] = sub.user.email if sub.user else None
        sub_dict["user_name"] = sub.user.full_name if sub.user else None
        result.append(sub_dict)

    return {
        "subscriptions": result,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


class UserSubscriptionUpdate(BaseModel):
    plan_id: Optional[UUID] = None
    status: Optional[str] = None
    billing_cycle_end: Optional[datetime] = None
    trial_ends_at: Optional[datetime] = None
    addon_entity_slots: Optional[int] = None


@router.patch("/user-subscriptions/{sub_id}")
async def update_admin_user_subscription(
    sub_id: UUID,
    body: UserSubscriptionUpdate,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    from app.models.user_subscription import UserSubscription
    from app.services import audit_logger

    sub = db.query(UserSubscription).filter(UserSubscription.id == sub_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="User subscription not found")

    old_values = {}
    new_values = {}

    if body.plan_id is not None:
        old_values["plan_id"] = str(sub.plan_id)
        sub.plan_id = body.plan_id
        new_values["plan_id"] = str(body.plan_id)

    if body.status is not None:
        old_values["status"] = sub.status
        sub.status = body.status
        new_values["status"] = body.status

    if body.billing_cycle_end is not None:
        old_values["billing_cycle_end"] = sub.billing_cycle_end.isoformat() if sub.billing_cycle_end else None
        dt = body.billing_cycle_end
        if dt.tzinfo is None:
            import pytz
            dt = pytz.UTC.localize(dt)
        sub.billing_cycle_end = dt
        new_values["billing_cycle_end"] = dt.isoformat()

    if body.trial_ends_at is not None:
        old_values["trial_ends_at"] = sub.trial_ends_at.isoformat() if sub.trial_ends_at else None
        dt = body.trial_ends_at
        if dt.tzinfo is None:
            import pytz
            dt = pytz.UTC.localize(dt)
        sub.trial_ends_at = dt
        new_values["trial_ends_at"] = dt.isoformat()

    if body.addon_entity_slots is not None:
        old_values["addon_entity_slots"] = sub.addon_entity_slots
        sub.addon_entity_slots = body.addon_entity_slots
        new_values["addon_entity_slots"] = body.addon_entity_slots

    sub.updated_at = utc_now()
    db.commit()
    db.refresh(sub)

    audit_logger.record(
        db=db,
        tenant_id=ctx.tenant_id,
        organization_id=sub.organization_id,
        organization_name=None,
        actor_id=str(ctx.user.id),
        actor_name=ctx.user.full_name,
        actor_email=ctx.user.email,
        action="settings.updated",
        resource_type="user_subscription",
        resource_id=str(sub.id),
        summary="Suscripción de usuario modificada por administrador",
        details=f"Valores modificados: {json.dumps(new_values)}",
        metadata={"old_values": old_values, "new_values": new_values},
    )

    return sub.to_dict()


@router.post("/user-subscriptions/{sub_id}/credit")
async def credit_admin_user_subscription(
    sub_id: UUID,
    body: SubscriptionCreditRequest,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    from app.models.user_subscription import UserSubscription
    from app.services import audit_logger

    sub = db.query(UserSubscription).filter(UserSubscription.id == sub_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="User subscription not found")

    old_cycle_end = sub.billing_cycle_end
    new_cycle_end = (old_cycle_end or utc_now()) + timedelta(days=body.days)
    sub.billing_cycle_end = new_cycle_end
    sub.updated_at = utc_now()
    db.commit()
    db.refresh(sub)

    audit_logger.record(
        db=db,
        tenant_id=ctx.tenant_id,
        organization_id=sub.organization_id,
        organization_name=None,
        actor_id=str(ctx.user.id),
        actor_name=ctx.user.full_name,
        actor_email=ctx.user.email,
        action="settings.updated",
        resource_type="user_subscription",
        resource_id=str(sub.id),
        summary="Crédito de días de gracia aplicado a suscripción de usuario",
        details=f"Se agregaron {body.days} días de gracia. Nueva fecha fin: {new_cycle_end.isoformat()}. Razón: {body.reason}",
        metadata={
            "grace_days": body.days,
            "reason": body.reason,
            "old_billing_cycle_end": old_cycle_end.isoformat() if old_cycle_end else None,
            "new_billing_cycle_end": new_cycle_end.isoformat(),
        },
    )

    return sub.to_dict()


# ---------------------------------------------------------------------------
# Payment Proofs (admin review)
# ---------------------------------------------------------------------------


class AdminCartItemResponse(BaseModel):
    type: str
    plan_name: str | None = None
    addon_type: str | None = None
    quantity: int = 1
    months: int | None = None
    price_cents: int = 0
    label: str | None = None


class AdminPaymentProofItem(BaseModel):
    id: str
    tenant_id: str
    organization_id: str
    organization_name: str | None
    user_id: str | None
    user_name: str | None
    user_email: str | None
    plan_name: str
    amount: float
    currency: str
    exchange_rate: float | None = None
    usd_amount: float | None = None
    addons: str | None
    items: list[AdminCartItemResponse] | None = None
    status: str
    file_url: str
    notes: str | None
    admin_notes: str | None
    created_at: str | None
    updated_at: str | None


@router.get("/payment-proofs")
async def list_admin_payment_proofs(
    status_filter: str | None = Query(None),
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    q = db.query(PaymentProof).outerjoin(
        User, PaymentProof.user_id == User.id,
    ).outerjoin(
        Organization, PaymentProof.organization_id == Organization.id,
    )

    if status_filter:
        q = q.filter(PaymentProof.status == status_filter)

    q = q.order_by(PaymentProof.created_at.desc())
    rows = q.all()

    results = []
    for p in rows:
        d = p.to_dict()
        uploader = p.user if p.user else None
        items_list = None
        if d.get("items"):
            try:
                items_list = [AdminCartItemResponse(**i) for i in d["items"]]
            except Exception:
                items_list = None
        admin_file_url = f"/api/admin/payment-proofs/{p.id}/file"
        results.append(AdminPaymentProofItem(
            id=d["id"],
            tenant_id=d["tenant_id"],
            organization_id=d["organization_id"],
            organization_name=p.organization.name if p.organization else None,
            user_id=d["user_id"],
            user_name=uploader.full_name if uploader else None,
            user_email=uploader.email if uploader else None,
            plan_name=d["plan_name"],
            amount=d["amount"],
            currency=d["currency"],
            exchange_rate=d.get("exchange_rate"),
            usd_amount=d.get("usd_amount"),
            addons=d["addons"],
            items=items_list,
            status=d["status"],
            file_url=admin_file_url,
            notes=d["notes"],
            admin_notes=d["admin_notes"],
            created_at=d["created_at"],
            updated_at=d["updated_at"],
        ))
    return results


class AdminVerifyPaymentRequest(BaseModel):
    action: str  # "verified" or "rejected"
    admin_notes: str | None = None


@router.get("/payment-proofs/{proof_id}/file")
async def admin_get_payment_proof_file(
    proof_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    """Serve a payment proof file for admin — no org scoping."""
    from app.services.supabase_storage import is_structured_path, download_file

    proof = db.query(PaymentProof).filter(PaymentProof.id == proof_id).first()
    if not proof:
        raise HTTPException(status_code=404, detail="Comprobante no encontrado")

    if proof.file_path and is_structured_path(proof.file_path):
        file_data = download_file(proof.file_path)
        if not file_data:
            raise HTTPException(status_code=404, detail="No se pudo descargar el archivo del storage")
    else:
        local_dir = os.path.join(tempfile.gettempdir(), "fintral", "payment-proofs")
        local_path = os.path.join(local_dir, proof.file_path)
        try:
            with open(local_path, "rb") as f:
                file_data = f.read()
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail="Archivo no encontrado")

    ext = os.path.splitext(proof.file_path)[1].lower() if proof.file_path else ".png"
    content_types = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".pdf": "application/pdf",
        ".webp": "image/webp",
    }
    content_type = content_types.get(ext, "application/octet-stream")

    from fastapi.responses import StreamingResponse
    import io

    return StreamingResponse(
        io.BytesIO(file_data),
        media_type=content_type,
        headers={"Content-Disposition": f"inline; filename=comprobante{ext}"},
    )


@router.patch("/payment-proofs/{proof_id}")
async def admin_verify_payment(
    proof_id: str,
    body: AdminVerifyPaymentRequest,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    if body.action not in ("verified", "rejected", "revoked"):
        raise HTTPException(status_code=400, detail="Acción inválida. Usa 'verified', 'rejected' o 'revoked'")

    proof = db.query(PaymentProof).filter(PaymentProof.id == proof_id).first()
    if not proof:
        raise HTTPException(status_code=404, detail="Comprobante no encontrado")

    proof.status = body.action
    proof.admin_notes = body.admin_notes
    proof.verified_by = ctx.user.id
    proof.verified_at = utc_now()
    db.flush()

    provision_errors = []

    if body.action == "revoked":
        try:
            from app.models.organization_subscription import OrganizationSubscription
            from app.models.user_subscription import UserSubscription
            from app.services.lago_service import LagoService
            lago = LagoService()

            # 1. Revert OrganizationSubscription if provisioned
            org_sub = (
                db.query(OrganizationSubscription)
                .filter(
                    OrganizationSubscription.organization_id == proof.organization_id,
                    OrganizationSubscription.status.in_(["active", "trialing"]),
                )
                .order_by(OrganizationSubscription.created_at.desc())
                .first()
            )
            if org_sub:
                org_sub.status = "canceled"
                org_sub.canceled_at = utc_now()
                if org_sub.lago_subscription_id:
                    try:
                        await lago.cancel_subscription(org_sub.lago_subscription_id)
                        logger.info("Canceled Lago org subscription %s", org_sub.lago_subscription_id)
                    except Exception as e:
                        logger.warning("Could not cancel Lago subscription %s: %s", org_sub.lago_subscription_id, e)

                # Find and restore previous organization subscription
                previous_org_sub = (
                    db.query(OrganizationSubscription)
                    .filter(
                        OrganizationSubscription.organization_id == proof.organization_id,
                        OrganizationSubscription.id != org_sub.id,
                    )
                    .order_by(OrganizationSubscription.created_at.desc())
                    .first()
                )
                if previous_org_sub:
                    previous_org_sub.status = "active"
                    previous_org_sub.canceled_at = None
                    db.flush()
                    logger.info("Restored previous OrganizationSubscription %s to active", previous_org_sub.id)
                    if previous_org_sub.lago_subscription_id:
                        try:
                            from app.models.subscription_plan import SubscriptionPlan
                            prev_plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == previous_org_sub.plan_id).first()
                            if prev_plan:
                                await lago.create_subscription(
                                    customer_external_id=str(proof.organization_id),
                                    plan_code=prev_plan.lago_plan_code or prev_plan.name,
                                    external_id=previous_org_sub.lago_subscription_id,
                                    billing_time="anniversary",
                                )
                                logger.info("Recreated Lago subscription for old plan %s", prev_plan.name)
                        except Exception as lago_err:
                            logger.warning("Could not recreate old subscription in Lago: %s", lago_err)

            # 2. Revert UserSubscription
            if proof.user_id:
                user_sub = (
                    db.query(UserSubscription)
                    .filter(UserSubscription.user_id == proof.user_id)
                    .order_by(UserSubscription.created_at.desc())
                    .first()
                )
                if user_sub:
                    user_sub.status = "expired"
                    if user_sub.lago_subscription_id:
                        try:
                            await lago.cancel_subscription(user_sub.lago_subscription_id)
                            logger.info("Canceled Lago user subscription %s", user_sub.lago_subscription_id)
                        except Exception as e:
                            logger.warning("Could not cancel Lago user subscription %s: %s", user_sub.lago_subscription_id, e)

                    # Find and restore previous user subscription
                    previous_user_sub = (
                        db.query(UserSubscription)
                        .filter(
                            UserSubscription.user_id == proof.user_id,
                            UserSubscription.id != user_sub.id,
                        )
                        .order_by(UserSubscription.created_at.desc())
                        .first()
                    )
                    if previous_user_sub:
                        previous_user_sub.status = "active"
                        previous_user_sub.canceled_at = None
                        db.flush()
                        logger.info("Restored previous UserSubscription %s to active", previous_user_sub.id)
                        if previous_user_sub.lago_subscription_id:
                            try:
                                from app.models.subscription_plan import SubscriptionPlan
                                prev_plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == previous_user_sub.plan_id).first()
                                if prev_plan:
                                    await lago.create_subscription(
                                        customer_external_id=str(proof.user_id),
                                        plan_code=prev_plan.lago_plan_code or prev_plan.name,
                                        external_id=previous_user_sub.lago_subscription_id,
                                    )
                                    logger.info("Recreated Lago user subscription for old plan %s", prev_plan.name)
                            except Exception as lago_err:
                                logger.warning("Could not recreate old user subscription in Lago: %s", lago_err)

            # 3. Revert addons and prepaid balances
            items = []
            if proof.items_json:
                try:
                    items = json.loads(proof.items_json)
                except Exception:
                    pass

            for item in items:
                itype = item.get("type")
                qty = item.get("quantity", 1)

                if itype == "ecf_blocks":
                    org_id = item.get("organization_id") or proof.organization_id
                    org = db.query(Organization).filter(Organization.id == org_id).first()
                    if org:
                        org.e_cf_balance = max(0, (org.e_cf_balance or 0) - (100 * qty))
                        logger.info("Deducted e-CF balance from org %s: new balance %s", org.id, org.e_cf_balance)

                elif itype == "addon":
                    addon_type = item.get("addon_type")
                    if addon_type and org_sub:
                        if addon_type == "ecf":
                            org_sub.addon_ecf_blocks = max(0, (org_sub.addon_ecf_blocks or 0) - qty)
                        elif addon_type == "ai":
                            org_sub.addon_ai_blocks = max(0, (org_sub.addon_ai_blocks or 0) - qty)
                        elif addon_type == "storage":
                            org_sub.addon_storage_blocks = max(0, (org_sub.addon_storage_blocks or 0) - qty)
                        elif addon_type == "user_slot":
                            org_sub.addon_user_slots = max(0, (org_sub.addon_user_slots or 0) - qty)

                elif itype == "entity_slot" and proof.user_id:
                    # Retrieve latest user subscription (which we just expired above)
                    # and deduct slots
                    user_sub_to_deduct = (
                        db.query(UserSubscription)
                        .filter(UserSubscription.user_id == proof.user_id)
                        .order_by(UserSubscription.created_at.desc())
                        .first()
                    )
                    if user_sub_to_deduct:
                        user_sub_to_deduct.addon_entity_slots = max(0, (user_sub_to_deduct.addon_entity_slots or 0) - qty)

                elif itype == "user_slot" and org_sub:
                    org_sub.addon_user_slots = max(0, (org_sub.addon_user_slots or 0) - qty)

            db.flush()
        except Exception as e:
            logger.exception("Failed to rollback subscription/addons during revocation")
            provision_errors.append(f"rollback: {e}")

    # ── Ensure user's UserSubscription is activated upon verification ──
    if body.action == "verified" and proof.user_id:
        try:
            from app.models.user_subscription import UserSubscription
            from datetime import timedelta
            user_sub = (
                db.query(UserSubscription)
                .filter(UserSubscription.user_id == proof.user_id)
                .order_by(UserSubscription.created_at.desc())
                .first()
            )
            
            # Determine plan_name and months
            plan_name = None
            months = 1
            if proof.items_json:
                try:
                    items = json.loads(proof.items_json)
                    for item in items:
                        if item.get("type") in ("plan_change", "renewal"):
                            plan_name = item.get("plan_name")
                            months = item.get("months", 1)
                            break
                except Exception:
                    pass
            
            if not plan_name and proof.plan_name:
                plan_name = proof.plan_name

            if user_sub:
                user_sub.status = "active"
                if plan_name:
                    p_slug = plan_name.strip().lower()
                    from app.models.subscription_plan import SubscriptionPlan
                    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.name == p_slug).first()
                    if plan:
                        user_sub.plan_id = plan.id
                        logger.info("Updated plan_id for UserSubscription %s to %s", user_sub.id, plan.id)
                if not user_sub.billing_cycle_end or user_sub.billing_cycle_end < utc_now():
                    user_sub.billing_cycle_start = utc_now()
                    user_sub.billing_cycle_end = utc_now() + timedelta(days=30 * months)
                db.flush()
                logger.info("Successfully activated UserSubscription %s for user %s", user_sub.id, proof.user_id)
            else:
                # If no user sub exists, provision one
                from app.models.subscription_plan import SubscriptionPlan
                p_slug = plan_name.strip().lower() if plan_name else "inicial"
                plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.name == p_slug).first()
                if not plan:
                    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.name == "inicial").first()
                
                if plan:
                    user_sub = UserSubscription(
                        user_id=proof.user_id,
                        plan_id=plan.id,
                        status="active",
                        payment_method="transfer",
                        billing_cycle_start=utc_now(),
                        billing_cycle_end=utc_now() + timedelta(days=30 * months),
                    )
                    db.add(user_sub)
                    db.flush()
                    logger.info("Created new UserSubscription for user %s", proof.user_id)
        except Exception as e:
            logger.exception("Failed to update UserSubscription status upon verification")
            provision_errors.append(f"user_subscription: {e}")

    # ── Lago: crear suscripción al verificar transferencia ──────────
    if body.action == "verified" and proof.user_id:
        try:
            from app.services.billing_checkout_service import BillingCheckoutService
            plan_slug = proof.plan_name.strip().lower() if proof.plan_name else ""
            if plan_slug in ["inicial", "profesional", "despacho"]:
                checkout_svc = BillingCheckoutService(db)
                await checkout_svc.provision_user_subscription(
                    user_id=str(proof.user_id),
                    plan_name=plan_slug,
                    payment_method="transfer"
                )
                logger.info(
                    "Created Lago manual user subscription for user %s",
                    proof.user_id,
                )
        except Exception as e:
            logger.exception("Failed to create Lago manual user subscription for proof %s", proof.id)
            provision_errors.append(f"lago: {e}")

    # ── Auto-provision cart items when verified ──────────────────────
    if body.action == "verified" and proof.items_json:
        try:
            items = json.loads(proof.items_json)
        except json.JSONDecodeError:
            items = []

        svc = PlanService(db)

        for item in items:
            try:
                if item.get("type") == "plan_change":
                    plan_name = item.get("plan_name")
                    months = item.get("months", 1)
                    if plan_name:
                        svc.change_plan(proof.organization_id, plan_name)
                        sub_obj, _ = svc.get_plan_for_org(proof.organization_id)
                        if sub_obj and sub_obj.billing_cycle_end:
                            sub_obj.billing_cycle_end = sub_obj.billing_cycle_end + timedelta(days=30 * months)

                elif item.get("type") == "addon":
                    addon_type = item.get("addon_type")
                    qty = item.get("quantity", 1)
                    if addon_type:
                        svc.purchase_addon(
                            proof.organization_id,
                            addon_type,
                            qty,
                            user_id=str(proof.user_id) if addon_type == "entity_slot" else None,
                        )

                elif item.get("type") == "ecf_blocks":
                    org_id = item.get("organization_id") or proof.organization_id
                    qty = item.get("quantity", 1)
                    block_size = 100
                    org = db.query(Organization).filter(Organization.id == org_id).first()
                    if org:
                        org.e_cf_balance = (org.e_cf_balance or 0) + (block_size * qty)
                        logger.info("📄 Credited %d e-CF to org %s (balance: %d)", block_size * qty, org_id, org.e_cf_balance)

                elif item.get("type") == "entity_slot":
                    months = item.get("months", 1)
                    qty = item.get("quantity", 1)
                    svc.purchase_addon(proof.organization_id, "entity_slot", qty, user_id=str(proof.user_id))
                    sub_obj, _ = svc.get_plan_for_org(proof.organization_id)
                    if sub_obj and sub_obj.billing_cycle_end:
                        sub_obj.billing_cycle_end = sub_obj.billing_cycle_end + timedelta(days=30 * months)
                    # Activate the pre-created target org if bound to this slot
                    target_org_id = item.get("target_org_id")
                    if target_org_id:
                        target_org = db.query(Organization).filter(Organization.id == target_org_id).first()
                        if target_org and not target_org.is_active:
                            target_org.is_active = True
                            logger.info("✅ Activated pre-created org %s after entity_slot verification", target_org_id)

                elif item.get("type") in ("ai", "storage", "ocr"):
                    qty = item.get("quantity", 1)
                    svc.purchase_addon(proof.organization_id, item.get("type"), qty)

                elif item.get("type") == "user_slot":
                    months = item.get("months", 1)
                    qty = item.get("quantity", 1)
                    svc.purchase_addon(proof.organization_id, "user_slot", qty)
                    sub_obj, _ = svc.get_plan_for_org(proof.organization_id)
                    if sub_obj and sub_obj.billing_cycle_end:
                        sub_obj.billing_cycle_end = sub_obj.billing_cycle_end + timedelta(days=30 * months)

                elif item.get("type") == "renewal":
                    months = item.get("months", 1)
                    sub_obj, _ = svc.get_plan_for_org(proof.organization_id)
                    if sub_obj and sub_obj.billing_cycle_end:
                        sub_obj.billing_cycle_end = sub_obj.billing_cycle_end + timedelta(days=30 * months)

                elif item.get("type") == "overage":
                    addon_type = item.get("addon_type")
                    qty = item.get("quantity", 0)
                    if addon_type and qty > 0:
                        svc.purchase_addon(
                            proof.organization_id,
                            addon_type,
                            qty,
                            user_id=str(proof.user_id) if addon_type == "entity_slot" else None,
                        )

            except Exception as e:
                provision_errors.append(f"{item.get('type')}: {e}")
                logger.exception("Auto-provision error for item %s", item)

    # ── Send invoice email to customer ──────────────────────────────
    if body.action == "verified" and proof.user and proof.user.email:
        try:
            invoice_items = []
            total = 0.0
            if proof.items_json:
                cart_items = json.loads(proof.items_json)
                for ci in cart_items:
                    unit_price = ci.get("price_cents", 0) / 100.0
                    qty = ci.get("quantity", 1)
                    months = ci.get("months", 1)
                    line_total = unit_price * qty * months
                    total += line_total
                    invoice_items.append({
                        "label": ci.get("label", ci.get("type", "Item")),
                        "quantity": qty * months,
                        "total": line_total,
                    })
            if not invoice_items:
                invoice_items.append({
                    "label": proof.plan_name or "Compra",
                    "quantity": 1,
                    "total": float(proof.amount),
                })
                total = float(proof.amount)
            from app.services.email_service import send_purchase_invoice_email
            send_purchase_invoice_email(
                customer_email=proof.user.email,
                customer_name=proof.user.full_name or proof.user.email,
                items=invoice_items,
                total=total,
                currency=proof.currency or "DOP",
            )
        except Exception as e:
            logger.exception("Failed to send purchase invoice email for proof %s", proof.id)
            provision_errors.append(f"email: {e}")

    # ── Send verified/rejected/revoked email to customer ─────────
    if body.action == "verified":
        try:
            from app.services.email_service import send_payment_verified_email
            if proof.user and proof.user.email:
                send_payment_verified_email(
                    customer_email=proof.user.email,
                    customer_name=proof.user.full_name or proof.user.email,
                    amount=float(proof.amount),
                    currency=proof.currency,
                    admin_notes=body.admin_notes,
                )
        except Exception:
            logger.exception("Error sending payment verified email")
    elif body.action == "rejected":
        try:
            from app.services.email_service import send_payment_rejected_email
            if proof.user and proof.user.email:
                send_payment_rejected_email(
                    customer_email=proof.user.email,
                    customer_name=proof.user.full_name or proof.user.email,
                    amount=float(proof.amount),
                    currency=proof.currency,
                    admin_notes=body.admin_notes,
                )
        except Exception:
            logger.exception("Error sending payment rejected email")
    elif body.action == "revoked":
        try:
            from app.services.email_service import send_payment_revoked_email
            if proof.user and proof.user.email:
                send_payment_revoked_email(
                    customer_email=proof.user.email,
                    customer_name=proof.user.full_name or proof.user.email,
                    amount=float(proof.amount),
                    currency=proof.currency,
                    admin_notes=body.admin_notes,
                )
        except Exception:
            logger.exception("Error sending payment revoked email")

    # ── Telegram notifications ──────────────────────────────────────
    org = db.query(Organization).filter(Organization.id == proof.organization_id).first()
    if body.action == "verified":
        try:
            notifier = TelegramNotifier()
            await notifier.notify_payment_proof_verified(
                org_name=org.name if org else "N/A",
                amount_dop=float(proof.amount or 0),
                admin_name=ctx.user.full_name or ctx.user.email,
            )
        except Exception as notify_err:
            logger.warning(f"Telegram notification failed: {notify_err}")
    elif body.action == "rejected":
        try:
            notifier = TelegramNotifier()
            await notifier.notify_payment_proof_rejected(
                org_name=org.name if org else "N/A",
                amount_dop=float(proof.amount or 0),
                admin_name=ctx.user.full_name or ctx.user.email,
                reason=body.admin_notes,
            )
        except Exception as notify_err:
            logger.warning(f"Telegram notification failed: {notify_err}")

    db.commit()
    db.refresh(proof)

    result = proof.to_dict()
    result["provision_errors"] = provision_errors if provision_errors else None
    return result
