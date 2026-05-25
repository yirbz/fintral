from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel

from app.dependencies.tenant import TenantContext, optional_tenant, require_tenant
from app.schemas import SettingUpdate
from app.services import SettingsService
from app.models import User, Organization, UserOrganization
from app.utils.dates import utc_now

router = APIRouter()
settings_service = SettingsService()


class ProfileUpdate(BaseModel):
    full_name: str = ""
    job_title: str = ""
    phone: str = ""


class OrgUpdate(BaseModel):
    name: str
    tax_id: Optional[str] = None
    phone: Optional[str] = None
    email_contact: Optional[str] = None
    website: Optional[str] = None
    country: Optional[str] = None
    fiscal_address: Optional[str] = None


@router.get("/settings", response_class=HTMLResponse)
async def settings_page(
    request: Request,
    ctx: Optional[TenantContext] = Depends(optional_tenant),
):
    if not ctx:
        return RedirectResponse(url="/login")
    return RedirectResponse(url="/app/settings", status_code=307)


@router.get("/reports", response_class=HTMLResponse)
async def reports_page(
    request: Request,
    ctx: Optional[TenantContext] = Depends(optional_tenant),
):
    if not ctx:
        return RedirectResponse(url="/login")
    return RedirectResponse(url="/app/reports", status_code=307)


@router.get("/api/settings")
async def get_settings(
    ctx: TenantContext = Depends(require_tenant),
):
    return settings_service.get_settings_payload(ctx.db, ctx.user, ctx.tenant_id, ctx.org_id)


@router.post("/api/settings")
async def update_settings(
    updates: list[SettingUpdate],
    ctx: TenantContext = Depends(require_tenant),
):
    try:
        updated = settings_service.update_settings(ctx.db, ctx.user, ctx.tenant_id, ctx.org_id, updates)
        return {"status": "success", "updated": updated}
    except Exception as exc:  # noqa: BLE001
        ctx.db.rollback()
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.put("/api/settings/profile")
async def update_profile(
    body: ProfileUpdate,
    ctx: TenantContext = Depends(require_tenant),
):
    user = ctx.db.query(User).filter(User.id == ctx.user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    user.full_name = body.full_name
    user.job_title = body.job_title or None
    user.phone = body.phone or None
    ctx.db.commit()
    ctx.db.refresh(user)

    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "job_title": user.job_title,
        "phone": user.phone,
        "avatar_url": user.avatar_url,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


@router.post("/api/settings/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    ctx: TenantContext = Depends(require_tenant),
):
    user = ctx.db.query(User).filter(User.id == ctx.user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    contents = await file.read()
    
    from app.services.supabase_storage import upload_user_profile_pic
    
    avatar_url = upload_user_profile_pic(
        file_data=contents,
        tenant_id=ctx.tenant_id,
        org_id=ctx.org_id,
        user_id=ctx.user.id,
        original_filename=file.filename or "avatar.png"
    )
    
    if not avatar_url:
        raise HTTPException(
            status_code=400,
            detail="Error al procesar o subir la imagen de perfil. Verifique el tamaño (<5MB) y el formato (JPG/PNG/WEBP)."
        )

    user.avatar_url = avatar_url
    ctx.db.commit()

    return {"avatar_url": avatar_url}


@router.delete("/api/settings/avatar")
async def delete_avatar(
    ctx: TenantContext = Depends(require_tenant),
):
    user = ctx.db.query(User).filter(User.id == ctx.user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    from app.services.supabase_storage import delete_user_profile_pics, SUPABASE_URL
    
    if SUPABASE_URL:
        delete_user_profile_pics(ctx.tenant_id, ctx.org_id, ctx.user.id)
    
    user.avatar_url = None
    ctx.db.commit()

    return {"message": "Foto de perfil eliminada correctamente"}


@router.get("/api/settings/organization")
async def get_organization(
    ctx: TenantContext = Depends(require_tenant),
):
    org = ctx.organization

    # Count members and collect basic info
    member_rows = (
        ctx.db.query(UserOrganization, User)
        .join(User, User.id == UserOrganization.user_id)
        .filter(UserOrganization.organization_id == ctx.org_id)
        .all()
    )

    members = [
        {
            "id": str(u.id),
            "full_name": u.full_name or "",
            "email": u.email or "",
            "job_title": u.job_title,
            "avatar_url": u.avatar_url,
            "role": uo.role,
            "joined_at": uo.created_at.isoformat() if uo.created_at else None,
        }
        for uo, u in member_rows
    ]

    return {
        "id": str(org.id),
        "name": org.name,
        "tax_id": org.tax_id,
        "phone": org.phone,
        "email_contact": org.email_contact,
        "website": org.website,
        "country": org.country,
        "fiscal_address": org.fiscal_address,
        "created_at": org.created_at.isoformat() if org.created_at else None,
        "updated_at": org.updated_at.isoformat() if org.updated_at else None,
        "member_count": len(members),
        "members": members,
        "role": ctx.role,
    }


@router.put("/api/settings/organization")
async def update_organization(
    body: OrgUpdate,
    ctx: TenantContext = Depends(require_tenant),
):
    if ctx.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Solo el administrador puede modificar la organización")

    if not body.name or not body.name.strip():
        raise HTTPException(status_code=400, detail="El nombre de la organización es requerido")

    org = ctx.db.query(Organization).filter(Organization.id == ctx.org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organización no encontrada")

    # Validate RNC (Dominican format: 11 digits with check digit)
    if body.tax_id:
        import re as _re
        rnc = _re.sub(r"\D", "", body.tax_id)
        if not _is_valid_rnc(rnc):
            raise HTTPException(
                status_code=400,
                detail="RNC inválido. Debe tener 9 dígitos (empresa/persona jurídica) o 11 (cédula/persona física)",
            )

        # Check uniqueness across other orgs
        existing = (
            ctx.db.query(Organization)
            .filter(Organization.tax_id == rnc, Organization.id != ctx.org_id)
            .first()
        )
        if existing:
            raise HTTPException(status_code=409, detail="Este RNC ya está registrado en el sistema")

    # Validate phone uniqueness
    if body.phone:
        phone = body.phone.strip()
        existing_phone = (
            ctx.db.query(Organization)
            .filter(Organization.phone == phone, Organization.id != ctx.org_id)
            .first()
        )
        if existing_phone:
            raise HTTPException(status_code=409, detail="Este número de teléfono ya está registrado")

    org.name = body.name.strip()
    org.tax_id = body.tax_id.strip() if body.tax_id else None
    org.phone = body.phone.strip() if body.phone else None
    org.email_contact = body.email_contact.strip() if body.email_contact else None
    org.website = body.website.strip() if body.website else None
    org.country = body.country or org.country
    org.fiscal_address = body.fiscal_address.strip() if body.fiscal_address else None
    org.updated_at = utc_now()
    ctx.db.commit()
    ctx.db.refresh(org)

    return {
        "id": str(org.id),
        "name": org.name,
        "tax_id": org.tax_id,
        "phone": org.phone,
        "email_contact": org.email_contact,
        "website": org.website,
        "country": org.country,
        "fiscal_address": org.fiscal_address,
    }


def _is_valid_rnc(rnc: str) -> bool:
    """Valida RNC/Cédula dominicano usando la utilidad centralizada."""
    from app.utils.validation import is_valid_rnc_or_cedula
    return is_valid_rnc_or_cedula(rnc)

