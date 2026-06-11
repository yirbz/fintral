import json
import logging
from datetime import timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
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
    ReferenceData,
    Tenant,
    User,
    UserOrganization,
)
from app.services.audit_logger import query_admin as query_audit_logs
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

    db.commit()
    db.refresh(org)
    return {
        "id": str(org.id),
        "name": org.name,
        "tax_id": org.tax_id,
        "is_active": org.is_active,
        "tenant_id": str(org.tenant_id),
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
    if org.deleted_at:
        raise HTTPException(status_code=400, detail="La organización ya está eliminada")

    org.deleted_at = utc_now()
    db.query(UserOrganization).filter(UserOrganization.organization_id == org.id).delete(synchronize_session=False)
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
    if not org.deleted_at:
        raise HTTPException(status_code=400, detail="La organización no está eliminada")

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
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    ctx: TenantContext = Depends(require_admin),
):
    tid = UUID(tenant_id) if tenant_id else None
    oid = UUID(organization_id) if organization_id else None

    rows, total = query_audit_logs(
        ctx.db,
        tenant_id=tid,
        organization_id=oid,
        action=action,
        actor_id=actor_id,
        resource_type=resource_type,
        visibility=visibility,
        limit=limit,
        offset=offset,
    )
    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "events": [r.to_admin_dict() for r in rows],
    }


@router.get("/health/dgii/check")
async def run_dgii_health_check(ctx: TenantContext = Depends(require_admin)):
    report = await check_dgii_health()
    return report.to_dict()
