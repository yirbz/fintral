import json
import logging
from datetime import timedelta
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.utils.dates import utc_now
from app.core.permissions import PERMISSIONS, ROLE_DEFAULT_PERMISSIONS
from app.database import get_db
from app.dependencies.permissions import require_permission
from app.dependencies.tenant import TenantContext, require_tenant
from app.models import Invitation, Organization, User, UserOrganization

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/organizations", tags=["organizations"])


# --- Schemas ---

class OrgCreate(BaseModel):
    name: str
    tax_id: Optional[str] = None
    country: Optional[str] = "DO"


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
    }


@router.get("")
def list_organizations(ctx: TenantContext = Depends(require_permission("org.create"))):
    orgs = (
        ctx.db.query(Organization)
        .filter(
            Organization.tenant_id == ctx.tenant_id,
            Organization.is_active.is_(True),
        )
        .all()
    )
    return [
        {
            "id": str(o.id),
            "name": o.name,
            "tax_id": o.tax_id,
            "country": o.country,
            "is_current": o.id == ctx.org_id,
        }
        for o in orgs
    ]


@router.post("", status_code=201)
def create_organization(
    body: OrgCreate,
    ctx: TenantContext = Depends(require_permission("org.create")),
):
    org = Organization(
        tenant_id=ctx.tenant_id,
        name=body.name,
        tax_id=body.tax_id,
        country=body.country or "DO",
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
    org.is_active = False
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
        expires_at=utc_now() + timedelta(days=7),
    )
    ctx.db.add(invitation)
    ctx.db.commit()
    ctx.db.refresh(invitation)

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
