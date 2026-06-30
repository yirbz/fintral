import json
import logging
from datetime import timedelta
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.utils.dates import utc_now
from app.core.permissions import PERMISSIONS, ROLE_DEFAULT_PERMISSIONS
from app.database import get_db
from app.dependencies.permissions import require_permission
from app.dependencies.tenant import TenantContext, require_tenant
from app.models import Invitation, Organization, User, UserOrganization
from app.config import PUBLIC_APP_URL
from app.services.email_service import send_invitation_email
from app.services.plan_service import PlanService, PlanLimitExceeded

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/organizations", tags=["organizations"])


# --- Schemas ---

class OrgCreate(BaseModel):
    name: str
    tax_id: Optional[str] = None
    country: Optional[str] = "DO"
    phone: Optional[str] = None
    email_contact: Optional[str] = None
    fiscal_address: Optional[str] = None
    municipality: Optional[str] = None
    province: Optional[str] = None
    is_active: Optional[bool] = True


class OrgUpdate(BaseModel):
    name: Optional[str] = None
    tax_id: Optional[str] = None
    country: Optional[str] = None
    settings_json: Optional[str] = None


class UserRoleUpdate(BaseModel):
    role: str  # admin / member / viewer


class UserPermissionsUpdate(BaseModel):
    permissions: Optional[List[str]] = None  # null = use role defaults


class InviteCreate(BaseModel):
    email: str
    role: str = "member"
    permissions: Optional[List[str]] = None


class InviteAccept(BaseModel):
    token: str


# --- Endpoints ---

@router.get("/mine")
def get_my_organization(ctx: TenantContext = Depends(require_tenant)):
    return {
        "id": str(ctx.org_id),
        "name": ctx.organization.name,
        "tax_id": ctx.organization.tax_id,
        "country": ctx.organization.country,
        "role": ctx.role,
        "permissions": ctx.permissions,
        "settings_json": ctx.organization.settings_json,
        "is_deleted": ctx.organization.is_deleted,
        "deleted_at": ctx.organization.deleted_at.isoformat() if ctx.organization.deleted_at else None,
    }


@router.get("")
def list_organizations(
    include_inactive: bool = False,
    ctx: TenantContext = Depends(require_permission("org.create"))
):
    query = ctx.db.query(Organization).filter(
        Organization.tenant_id == ctx.tenant_id,
        Organization.is_deleted.is_(False)
    )
    if not include_inactive:
        query = query.filter(Organization.is_active.is_(True))
    orgs = query.all()
    return [
        {
            "id": str(o.id),
            "name": o.name,
            "tax_id": o.tax_id,
            "country": o.country,
            "is_active": o.is_active,
            "is_current": o.id == ctx.org_id,
            "is_deleted": o.is_deleted,
            "deleted_at": o.deleted_at.isoformat() if o.deleted_at else None,
        }
        for o in orgs
    ]


@router.post("", status_code=201)
def create_organization(
    body: OrgCreate,
    ctx: TenantContext = Depends(require_permission("org.create")),
):
    # ── Validate email_contact uniqueness ──
    if body.email_contact:
        email = body.email_contact.strip().lower()

        # Check other active organizations (same tenant)
        existing_org = (
            ctx.db.query(Organization)
            .filter(
                Organization.tenant_id == ctx.tenant_id,
                Organization.email_contact == email,
                Organization.is_active.is_(True),
            )
            .first()
        )
        if existing_org:
            raise HTTPException(
                status_code=409,
                detail=f"El email '{body.email_contact}' ya está registrado como contacto de la organización '{existing_org.name}'.",
            )

        # Check if it's a registered user email
        existing_user = ctx.db.query(User).filter(User.email == email).first()
        if existing_user:
            raise HTTPException(
                status_code=409,
                detail=f"El email '{body.email_contact}' corresponde a un usuario registrado. Cada organización debe usar un email de contacto único.",
            )

        # Check other tenants too (global uniqueness)
        global_org = (
            ctx.db.query(Organization)
            .filter(
                Organization.email_contact == email,
                Organization.is_active.is_(True),
            )
            .first()
        )
        if global_org:
            raise HTTPException(
                status_code=409,
                detail=f"El email '{body.email_contact}' ya está en uso como contacto de otra organización. Usa un email de contacto diferente.",
            )

    # ── Check entity limit from user's subscription (only if creating active) ──
    if body.is_active:
        plan_svc = PlanService(ctx.db)
        try:
            plan_svc.check_entity_limit(str(ctx.user.id))
        except PlanLimitExceeded as e:
            raise HTTPException(
                status_code=403,
                detail=f"Has alcanzado el límite de organizaciones de tu plan. {e.reason}",
            )

    org = Organization(
        tenant_id=ctx.tenant_id,
        name=body.name,
        tax_id=body.tax_id,
        country=body.country or "DO",
        phone=body.phone,
        email_contact=body.email_contact,
        fiscal_address=body.fiscal_address,
        municipality=body.municipality,
        province=body.province,
        is_active=body.is_active,
    )
    ctx.db.add(org)
    ctx.db.flush()

    user_org = UserOrganization(
        user_id=ctx.user.id,
        organization_id=org.id,
        role="owner",
    )
    ctx.db.add(user_org)
    ctx.db.commit()
    ctx.db.refresh(org)

    return {
        "id": str(org.id),
        "name": org.name,
        "tax_id": org.tax_id,
        "country": org.country,
        "role": "owner",
        "phone": org.phone,
        "email_contact": org.email_contact,
        "fiscal_address": org.fiscal_address,
        "municipality": org.municipality,
        "province": org.province,
        "is_deleted": org.is_deleted,
        "deleted_at": org.deleted_at.isoformat() if org.deleted_at else None,
    }


@router.put("/{org_id}")
def update_organization(
    org_id: UUID,
    body: OrgUpdate,
    ctx: TenantContext = Depends(require_permission("org.settings.update")),
):
    org = _get_org(ctx, org_id)
    if body.name is not None:
        org.name = body.name
    if body.tax_id is not None:
        old_rnc = (org.tax_id or "").strip()
        new_rnc = (body.tax_id or "").strip()
        if old_rnc and old_rnc != new_rnc:
            raise HTTPException(
                status_code=400,
                detail="El RNC/Cédula no puede ser modificado una vez registrado."
            )
        org.tax_id = body.tax_id
    if body.country is not None:
        org.country = body.country
    if body.settings_json is not None:
        org.settings_json = body.settings_json
    ctx.db.commit()
    ctx.db.refresh(org)
    return {
        "id": str(org.id),
        "name": org.name,
        "tax_id": org.tax_id,
        "country": org.country,
    }


@router.delete("/{org_id}")
def delete_organization(
    org_id: UUID,
    ctx: TenantContext = Depends(require_permission("org.delete")),
):
    org = _get_org(ctx, org_id)
    if org.id == ctx.org_id:
        raise HTTPException(status_code=400, detail="No puedes eliminar la organización activa")
    org.is_deleted = True
    org.deleted_at = utc_now()
    ctx.db.commit()
    return {"ok": True}


@router.get("/{org_id}/users")
def list_users(
    org_id: UUID,
    ctx: TenantContext = Depends(require_permission("users.read")),
):
    org = _get_org(ctx, org_id)
    members = (
        ctx.db.query(UserOrganization)
        .filter(UserOrganization.organization_id == org.id)
        .all()
    )
    user_ids = [m.user_id for m in members]
    users_map = {u.id: u for u in ctx.db.query(User).filter(User.id.in_(user_ids)).all()}
    return [
        {
            "user_id": str(m.user_id),
            "email": users_map[m.user_id].email if m.user_id in users_map else "unknown",
            "name": users_map[m.user_id].full_name if m.user_id in users_map else "Unknown",
            "role": m.role,
            "permissions": json.loads(m.permissions) if m.permissions else None,
        }
        for m in members
    ]


@router.patch("/{org_id}/users/{user_id}/role")
def update_user_role(
    org_id: UUID,
    user_id: UUID,
    body: UserRoleUpdate,
    ctx: TenantContext = Depends(require_permission("users.manage_roles")),
):
    if body.role not in ("admin", "member", "viewer"):
        raise HTTPException(status_code=400, detail="Rol inválido. Usa: admin, member, viewer")
    org = _get_org(ctx, org_id)
    uo = _get_membership(ctx, org.id, user_id)
    if uo.role == "owner":
        raise HTTPException(status_code=400, detail="No puedes cambiar el rol del propietario")
    uo.role = body.role
    ctx.db.commit()
    return {"ok": True}


@router.patch("/{org_id}/users/{user_id}/permissions")
def update_user_permissions(
    org_id: UUID,
    user_id: UUID,
    body: UserPermissionsUpdate,
    ctx: TenantContext = Depends(require_permission("users.manage_roles")),
):
    org = _get_org(ctx, org_id)
    uo = _get_membership(ctx, org.id, user_id)
    if uo.role == "owner":
        raise HTTPException(status_code=400, detail="No puedes cambiar permisos del propietario")
    uo.permissions = json.dumps(body.permissions) if body.permissions is not None else None
    ctx.db.commit()
    return {"ok": True, "permissions": body.permissions}


@router.delete("/{org_id}/users/{user_id}")
def remove_user(
    org_id: UUID,
    user_id: UUID,
    ctx: TenantContext = Depends(require_permission("users.remove")),
):
    org = _get_org(ctx, org_id)
    uo = _get_membership(ctx, org.id, user_id)
    if uo.role == "owner":
        raise HTTPException(status_code=400, detail="No puedes eliminar al propietario")
    ctx.db.delete(uo)
    ctx.db.commit()
    return {"ok": True}


@router.post("/{org_id}/invitations", status_code=201)
def create_invitation(
    org_id: UUID,
    body: InviteCreate,
    ctx: TenantContext = Depends(require_permission("users.invite")),
):
    org = _get_org(ctx, org_id)
    existing_user = ctx.db.query(User).filter(User.email == body.email).first()
    if existing_user:
        existing_member = (
            ctx.db.query(UserOrganization)
            .filter(
                UserOrganization.user_id == existing_user.id,
                UserOrganization.organization_id == org.id,
            )
            .first()
        )
        if existing_member:
            raise HTTPException(status_code=409, detail="El usuario ya es miembro de esta organización")

    invitation = Invitation(
        organization_id=org.id,
        invited_by_user_id=ctx.user.id,
        email=body.email,
        role=body.role,
        permissions=json.dumps(body.permissions) if body.permissions is not None else None,
        expires_at=utc_now() + timedelta(hours=24),
    )
    ctx.db.add(invitation)
    ctx.db.commit()
    ctx.db.refresh(invitation)

    # Send invitation email
    inviter_name = ctx.user.full_name or ctx.user.email
    invite_link = f"{PUBLIC_APP_URL}/accept-invite?token={invitation.token}"
    send_invitation_email(
        email=invitation.email,
        inviter_name=inviter_name,
        org_name=org.name,
        invite_link=invite_link,
        role=invitation.role,
    )

    return {
        "id": str(invitation.id),
        "email": invitation.email,
        "role": invitation.role,
        "token": invitation.token,
        "expires_at": invitation.expires_at.isoformat(),
    }


@router.get("/{org_id}/invitations")
def list_invitations(
    org_id: UUID,
    ctx: TenantContext = Depends(require_permission("users.read")),
):
    org = _get_org(ctx, org_id)
    invites = (
        ctx.db.query(Invitation)
        .filter(
            Invitation.organization_id == org.id,
            Invitation.accepted.is_(False),
            Invitation.expires_at > utc_now(),
        )
        .all()
    )
    return [
        {
            "id": str(i.id),
            "email": i.email,
            "role": i.role,
            "created_at": i.created_at.isoformat(),
            "expires_at": i.expires_at.isoformat(),
        }
        for i in invites
    ]


@router.delete("/{org_id}/invitations/{invitation_id}")
def revoke_invitation(
    org_id: UUID,
    invitation_id: UUID,
    ctx: TenantContext = Depends(require_permission("users.invite")),
):
    org = _get_org(ctx, org_id)
    invitation = (
        ctx.db.query(Invitation)
        .filter(
            Invitation.id == invitation_id,
            Invitation.organization_id == org.id,
        )
        .first()
    )
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitación no encontrada")
    ctx.db.delete(invitation)
    ctx.db.commit()
    return {"ok": True}


@router.post("/invitations/accept")
def accept_invitation(
    body: InviteAccept,
    db: Session = Depends(get_db),
):
    invitation = db.query(Invitation).filter(Invitation.token == body.token).first()
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitación no encontrada")
    if invitation.accepted:
        raise HTTPException(status_code=400, detail="Invitación ya aceptada")
    if invitation.expires_at < utc_now():
        raise HTTPException(status_code=400, detail="Invitación expirada")

    org = db.query(Organization).filter(Organization.id == invitation.organization_id).first()
    if not org or not org.is_active:
        raise HTTPException(status_code=400, detail="La organización ya no está activa")

    user = db.query(User).filter(User.email == invitation.email).first()
    if not user:
        raise HTTPException(status_code=400, detail="Debes registrarte primero con este email")

    existing = (
        db.query(UserOrganization)
        .filter(
            UserOrganization.user_id == user.id,
            UserOrganization.organization_id == org.id,
        )
        .first()
    )
    if existing:
        invitation.accepted = True
        db.commit()
        return {"ok": True, "message": "Ya eras miembro"}

    user_org = UserOrganization(
        user_id=user.id,
        organization_id=org.id,
        role=invitation.role,
        permissions=invitation.permissions,
    )
    db.add(user_org)
    invitation.accepted = True
    db.commit()

    return {"ok": True, "organization_id": str(org.id), "organization_name": org.name}


# ── New: Switch active organization & update session ────────────────


@router.post("/switch")
async def switch_organization(
    request: Request,
    body: dict,
    db: Session = Depends(get_db),
):
    """Switch the active organization and return a new session payload.

    This is the preferred way to change orgs on the frontend.
    The new org_id is validated, then the current session payload
    (identical shape to /api/me) is returned.
    """
    from app.dependencies.auth import get_current_user, FallbackUser

    org_id_str = body.get("organization_id")
    if not org_id_str:
        raise HTTPException(status_code=400, detail="organization_id es requerido")

    try:
        target_org_id = UUID(org_id_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID de organización inválido")

    user = await get_current_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="No autorizado")

    if isinstance(user, FallbackUser):
        raise HTTPException(status_code=503, detail="Base de datos no disponible")

    # Validate membership
    membership = (
        db.query(UserOrganization)
        .filter(
            UserOrganization.user_id == user.id,
            UserOrganization.organization_id == target_org_id,
        )
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Sin acceso a esta organización")

    # Validate org is active & belongs to same tenant
    org = (
        db.query(Organization)
        .filter(
            Organization.id == target_org_id,
            Organization.tenant_id == user.tenant_id,
            Organization.is_active.is_(True),
        )
        .first()
    )
    if not org:
        raise HTTPException(
            status_code=404, detail="Organización no encontrada o inactiva"
        )

    raw = membership.permissions
    json.loads(raw) if raw else None

    # Build session response (same shape as /api/me)
    return {
        "user": {
            "id": str(user.id),
            "email": user.email,
            "full_name": user.full_name,
            "job_title": user.job_title,
            "phone": user.phone,
            "avatar_url": user.avatar_url,
            "is_active": user.is_active,
            "is_superuser": user.is_superuser,
            "created_at": user.created_at.isoformat() if user.created_at else None,
        },
        "tenant": {
            "id": str(user.tenant_id),
            "plan": user.tenant.plan if user.tenant else None,
        },
        "organization": {
            "id": str(org.id),
            "name": org.name,
            "tax_id": org.tax_id,
            "phone": org.phone,
            "email_contact": org.email_contact,
            "website": org.website,
            "country": org.country,
            "fiscal_address": org.fiscal_address,
            "municipality": org.municipality,
            "province": org.province,
            "is_deleted": org.is_deleted,
            "deleted_at": org.deleted_at.isoformat() if org.deleted_at else None,
        },
        "role": membership.role,
        "company_name": org.name or "",
        "company_tax_id": org.tax_id or "",
        "company_country": org.country or "DO",
        "company_plan": user.tenant.plan if user.tenant else "free",
    }


# ── New: List orgs the current user is a member of (for org switcher) ──


@router.get("/user-orgs")
def list_user_organizations(
    include_inactive: bool = False,
    ctx: TenantContext = Depends(require_tenant),
):
    """List all organizations the current user belongs to.

    This is the lightweight endpoint used by the org switcher dropdown.
    No special permission required — the user can only see orgs they
    are actually a member of.
    """
    memberships = (
        ctx.db.query(UserOrganization)
        .filter(UserOrganization.user_id == ctx.user.id)
        .all()
    )
    if not memberships:
        return []

    org_ids = [m.organization_id for m in memberships]
    query = ctx.db.query(Organization).filter(
        Organization.id.in_(org_ids),
        Organization.is_deleted.is_(False)
    )
    if not include_inactive:
        query = query.filter(Organization.is_active.is_(True))
    orgs = query.all()
    org_map = {str(o.id): o for o in orgs}

    result = []
    for m in memberships:
        oid = str(m.organization_id)
        org = org_map.get(oid)
        if not org:
            continue
        result.append(
            {
                "id": oid,
                "name": org.name,
                "tax_id": org.tax_id,
                "role": m.role,
                "is_active": org.is_active,
                "is_current": oid == str(ctx.org_id),
                "is_deleted": org.is_deleted,
                "deleted_at": org.deleted_at.isoformat() if org.deleted_at else None,
            }
        )

    # Sort: current org first, then alphabetical
    result.sort(key=lambda r: (0 if r["is_current"] else 1, r["name"].lower()))
    return result


@router.get("/permissions/available")
def list_available_permissions():
    return [
        {"key": k, "label": v}
        for k, v in PERMISSIONS.items()
    ]


@router.get("/permissions/role-defaults/{role}")
def get_role_defaults(role: str):
    if role not in ROLE_DEFAULT_PERMISSIONS:
        raise HTTPException(status_code=404, detail="Rol no encontrado")
    return {"role": role, "permissions": ROLE_DEFAULT_PERMISSIONS[role]}


@router.get("/{org_id}/ecf-balance")
def get_ecf_balance(org_id: UUID, ctx: TenantContext = Depends(require_tenant)):
    """Get e-CF document balance for a specific organization."""
    org = _get_org(ctx, org_id)
    return {"organization_id": str(org.id), "balance": org.e_cf_balance or 0}


# --- Helpers ---

def _get_org(ctx: TenantContext, org_id: UUID) -> Organization:
    org = (
        ctx.db.query(Organization)
        .filter(
            Organization.id == org_id,
            Organization.tenant_id == ctx.tenant_id,
            Organization.is_active.is_(True),
        )
        .first()
    )
    if not org:
        raise HTTPException(status_code=404, detail="Organización no encontrada")
    return org


def _get_membership(ctx: TenantContext, org_id: UUID, user_id: UUID) -> UserOrganization:
    uo = (
        ctx.db.query(UserOrganization)
        .filter(
            UserOrganization.organization_id == org_id,
            UserOrganization.user_id == user_id,
        )
        .first()
    )
    if not uo:
        raise HTTPException(status_code=404, detail="Usuario no encontrado en esta organización")
    return uo
