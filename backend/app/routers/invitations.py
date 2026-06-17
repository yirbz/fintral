"""
Router de invitaciones con registro para nuevos usuarios.

- GET   /api/invitations/{token}    — Valida token y devuelve info de la invitación
- POST  /api/invitations/register   — Acepta invitación + crea cuenta + auto-login
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import create_access_token, get_password_hash
from app.database import get_db
from app.models import Invitation, Organization, User, UserOrganization
from app.utils.dates import utc_now

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/invitations", tags=["invitations"])


class InviteRegisterRequest(BaseModel):
    token: str
    full_name: str
    password: str
    email: str  # Email de acceso obligatorio
    phone: Optional[str] = None


class InviteInfoResponse(BaseModel):
    email: str
    organization_name: str
    organization_id: str
    role: str
    expires_at: str
    is_expired: bool


@router.get("/{token}")
def get_invitation_info(token: str, db: Session = Depends(get_db)):
    """Validate invitation token and return org info.

    Used by the frontend accept-invite page to show details before registration.
    """
    invitation = db.query(Invitation).filter(Invitation.token == token).first()
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitación no encontrada o inválida")

    if invitation.accepted:
        raise HTTPException(status_code=400, detail="Esta invitación ya fue aceptada")

    org = db.query(Organization).filter(Organization.id == invitation.organization_id).first()
    if not org or not org.is_active:
        raise HTTPException(status_code=400, detail="La organización ya no está activa")

    is_expired = invitation.expires_at < utc_now()

    return {
        "email": invitation.email,
        "organization_name": org.name,
        "organization_id": str(org.id),
        "role": invitation.role,
        "expires_at": invitation.expires_at.isoformat(),
        "is_expired": is_expired,
    }


@router.post("/register")
def accept_invitation_with_registration(
    body: InviteRegisterRequest,
    db: Session = Depends(get_db),
):
    """Accept invitation and create user account in one step.

    Validates the invitation token, creates the user account,
    associates them with the organization, and returns a JWT
    so the user is automatically logged in.
    """
    # ── Validate token ──
    invitation = db.query(Invitation).filter(Invitation.token == body.token).first()
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitación no encontrada o inválida")

    if invitation.accepted:
        raise HTTPException(status_code=400, detail="Esta invitación ya fue aceptada")

    if invitation.expires_at < utc_now():
        raise HTTPException(status_code=400, detail="Esta invitación ha expirado")

    # ── Validate org is active ──
    org = db.query(Organization).filter(Organization.id == invitation.organization_id).first()
    if not org or not org.is_active:
        raise HTTPException(status_code=400, detail="La organización ya no está activa")

    # ── Validate input ──
    if not body.full_name or not body.full_name.strip():
        raise HTTPException(status_code=400, detail="El nombre completo es requerido")

    if not body.password or len(body.password) < 8:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 8 caracteres")

    # Password strength: at least one uppercase, one lowercase, one digit/symbol
    import re
    if not re.search(r"[A-Z]", body.password):
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos una mayúscula")
    if not re.search(r"[a-z]", body.password):
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos una minúscula")
    if not re.search(r"[0-9!@#\$%^&*()_+\-=\[\]{}|;':\",./<>?]", body.password):
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos un número o símbolo")

    if not body.email or not body.email.strip():
        raise HTTPException(status_code=400, detail="El email de acceso es obligatorio")

    account_email = body.email.strip().lower()

    # ── Check if user already exists with the account email ──
    existing_user = db.query(User).filter(User.email == account_email).first()
    if existing_user:
        if existing_user.is_active:
            # User exists — just add to org
            existing_membership = (
                db.query(UserOrganization)
                .filter(
                    UserOrganization.user_id == existing_user.id,
                    UserOrganization.organization_id == org.id,
                )
                .first()
            )
            if existing_membership:
                invitation.accepted = True
                db.commit()
                raise HTTPException(
                    status_code=409,
                    detail="Ya eres miembro de esta organización. Inicia sesión para acceder.",
                )

            user_org = UserOrganization(
                user_id=existing_user.id,
                organization_id=org.id,
                role=invitation.role,
                permissions=invitation.permissions,
            )
            db.add(user_org)
            invitation.accepted = True
            db.commit()

            return {
                "message": "Invitación aceptada. Ya tienes una cuenta — inicia sesión.",
                "email": account_email,
                "requires_login": True,
            }
        else:
            # User exists but inactive — activate, update password, add to org
            existing_user.full_name = body.full_name
            existing_user.hashed_password = get_password_hash(body.password)
            existing_user.is_active = True
            existing_user.verification_code = None
            if body.phone:
                existing_user.phone = body.phone
            db.flush()

            user_org = UserOrganization(
                user_id=existing_user.id,
                organization_id=org.id,
                role=invitation.role,
                permissions=invitation.permissions,
            )
            db.add(user_org)
            invitation.accepted = True
            db.commit()

            access_token = create_access_token(data={"sub": account_email})

            return {
                "message": "Cuenta activada. Bienvenido a Fintral.",
                "access_token": access_token,
                "token_type": "bearer",
                "email": existing_user.email,
                "organization_id": str(org.id),
                "organization_name": org.name,
            }

    # ── Create new user ──
    # Build user in the org's tenant
    new_user = User(
        tenant_id=org.tenant_id,
        email=account_email,
        full_name=body.full_name.strip(),
        hashed_password=get_password_hash(body.password),
        is_active=True,  # Invitation = trusted, skip email verification
        phone=body.phone or "",
    )
    db.add(new_user)
    db.flush()  # Get user.id

    # Associate with the inviting organization
    user_org = UserOrganization(
        user_id=new_user.id,
        organization_id=org.id,
        role=invitation.role,
        permissions=invitation.permissions,
    )
    db.add(user_org)

    # Mark invitation as accepted
    invitation.accepted = True
    db.commit()
    db.refresh(new_user)

    # Generate access token for auto-login
    access_token = create_access_token(data={"sub": account_email})

    return {
        "message": "Cuenta creada. Bienvenido a Fintral.",
        "access_token": access_token,
        "token_type": "bearer",
        "email": account_email,
        "organization_id": str(org.id),
        "organization_name": org.name,
    }
