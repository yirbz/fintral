from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import desc
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.config import ADMIN_EMAIL, ADMIN_PASSWORD, IS_PRODUCTION, REMEMBER_ME_EXPIRE_DAYS
from app.core.auth import create_access_token, verify_password
from app.core.container import openai_processor
from app.database import get_db
from app.dependencies.tenant import TenantContext, optional_tenant, require_tenant
from app.services.audit_logger import record as audit_record
from app.dependencies.tenancy import get_company_context
from app.models import Invoice, Organization, User, UserOrganization
from app.schemas import ChatRequest, ForgotPasswordRequest, RegisterRequest, ResetPasswordRequest, VerifyCodeRequest
from app.utils.validation import validate_email, validate_full_name, validate_password
from app.services.auth_service import provision_local_user, sign_in, sign_up_user, verify_and_login, verify_email_code, verify_user
from app.services.email_service import send_password_changed_email, send_reset_password_email, send_verification_email

router = APIRouter()

# Max-age in seconds for persistent "remember me" cookie
_REMEMBER_MAX_AGE = REMEMBER_ME_EXPIRE_DAYS * 24 * 3600
# Max-age in seconds for session-only JWT (still needs a finite exp claim)
_SESSION_EXPIRE_MINUTES = 480  # 8h — long enough to survive a work day


@router.post("/token")
async def login_for_access_token(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    # Read optional `remember` field from the raw form body
    raw_form = await request.form()
    remember = str(raw_form.get("remember", "false")).lower() in ("true", "1", "yes")
    user = None

    # 1) PROD: try Supabase Auth first (verify credentials via Supabase,
    #    then issue our own long-lived JWT for the session)
    if IS_PRODUCTION:
        result = sign_in(form_data.username, form_data.password)
        if result:
            user = provision_local_user(db, result["user"])
            if user and not user.is_active:
                user.is_active = True
                db.commit()
            if not user:
                raise HTTPException(status_code=401, detail="Email o contraseña incorrectos")
            _assert_not_deleted(user)
            expire = timedelta(days=REMEMBER_ME_EXPIRE_DAYS) if remember else timedelta(minutes=_SESSION_EXPIRE_MINUTES)
            token = create_access_token(data={"sub": form_data.username}, expires_delta=expire)
            audit_record(
                db, tenant_id=user.tenant_id, organization_id=user.tenant_id,
                actor_id=str(user.id), actor_name=user.full_name, actor_email=user.email,
                action="user.login", summary=f"Inicio de sesión: {user.email}",
            )
            return _create_token_response(token, persist=remember)
        # fall through to local verification if Supabase fails

    # 2) Legacy password verification (PROD fallback + DEVELOPMENT primary)
    try:
        user = db.query(User).filter(User.email == form_data.username).first()
        if user and verify_password(form_data.password, user.hashed_password):
            if not user.is_active:
                raise HTTPException(status_code=400, detail="Usuario inactivo")
            _assert_not_deleted(user)
            expire = timedelta(days=REMEMBER_ME_EXPIRE_DAYS) if remember else timedelta(minutes=_SESSION_EXPIRE_MINUTES)
            token = create_access_token(data={"sub": form_data.username}, expires_delta=expire)
            audit_record(
                db, tenant_id=user.tenant_id, organization_id=user.tenant_id,
                actor_id=str(user.id), actor_name=user.full_name, actor_email=user.email,
                action="user.login", summary=f"Inicio de sesión: {user.email}",
            )
            return _create_token_response(token, persist=remember)
    except OperationalError:
        pass

    # 3) Hardcoded admin fallback (DB unavailable)
    if ADMIN_EMAIL and form_data.username == ADMIN_EMAIL and ADMIN_PASSWORD == form_data.password:
        expire = timedelta(days=REMEMBER_ME_EXPIRE_DAYS) if remember else timedelta(minutes=_SESSION_EXPIRE_MINUTES)
        token = create_access_token(data={"sub": form_data.username}, expires_delta=expire)
        try:
            admin_user = db.query(User).filter(User.email == ADMIN_EMAIL).first()
            if admin_user:
                audit_record(
                    db, tenant_id=admin_user.tenant_id, organization_id=admin_user.tenant_id,
                    actor_id=str(admin_user.id), actor_name=admin_user.full_name, actor_email=admin_user.email,
                    action="user.login", summary=f"Inicio de sesión (admin): {ADMIN_EMAIL}",
                )
        except Exception:
            pass
        return _create_token_response(token, persist=remember)

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Email o contraseña incorrectos",
        headers={"WWW-Authenticate": "Bearer"},
    )


@router.post("/api/auth/register")
async def register(
    body: RegisterRequest,
    db: Session = Depends(get_db),
):
    if not body.email or not body.password:
        raise HTTPException(status_code=400, detail="Email y contraseña son requeridos")
    email_err = validate_email(body.email)
    if email_err:
        raise HTTPException(status_code=400, detail=email_err)
    name_err = validate_full_name(body.full_name)
    if name_err:
        raise HTTPException(status_code=400, detail=name_err)
    pwd_err = validate_password(body.password)
    if pwd_err:
        raise HTTPException(status_code=400, detail=pwd_err)

    existing = db.query(User).filter(User.email == body.email).first()
    if existing:
        if existing.is_active:
            raise HTTPException(status_code=409, detail="Este email ya está registrado")
        return _resume_unverified_registration(db, existing, body)

    if body.tax_id:
        existing_tax = db.query(Organization).filter(Organization.tax_id == body.tax_id).first()
        if existing_tax:
            raise HTTPException(status_code=409, detail="Este RNC/Cédula ya está registrado")

    result, code = sign_up_user(body.email, body.password, body.full_name, body.phone, body.company_name, body.tax_id, db)
    if not result:
        raise HTTPException(status_code=500, detail="Error al crear la cuenta. Intenta de nuevo.")

    if code:
        send_verification_email(body.email, body.full_name, code)

    if result.get("user"):
        user_obj = result["user"]
        audit_record(
            db, tenant_id=user_obj.tenant_id, organization_id=user_obj.tenant_id,
            actor_id=str(user_obj.id), actor_name=user_obj.full_name, actor_email=user_obj.email,
            action="user.created", summary=f"Cuenta creada: {user_obj.email}",
        )

    return {
        "message": "Cuenta creada. Revisa tu email para el código de verificación.",
        "email": body.email,
        "requires_verification": True,
    }


def _resume_unverified_registration(db: Session, existing: User, body: RegisterRequest) -> dict:
    from app.core.auth import get_password_hash
    from app.services.auth_service import _generate_verification_code

    hashed = get_password_hash(body.password)
    existing.hashed_password = hashed
    existing.full_name = body.full_name
    existing.phone = body.phone or None

    uo = db.query(UserOrganization).filter(UserOrganization.user_id == existing.id).first()
    if uo:
        org = db.query(Organization).filter(Organization.id == uo.organization_id).first()
        if org:
            org.name = body.company_name
            if body.tax_id:
                existing_tax = db.query(Organization).filter(
                    Organization.tax_id == body.tax_id, Organization.id != org.id
                ).first()
                if existing_tax:
                    raise HTTPException(status_code=409, detail="Este RNC/Cédula ya está registrado")
                org.tax_id = body.tax_id

    code = _generate_verification_code()
    code_hash = get_password_hash(code)
    existing.verification_code = code_hash
    db.commit()

    send_verification_email(body.email, body.full_name, code)

    return {
        "message": "Reanudando verificación. Revisa tu email para el nuevo código.",
        "email": body.email,
        "requires_verification": True,
        "resumed": True,
    }


@router.post("/api/auth/verify-code")
async def verify_code(
    body: VerifyCodeRequest,
    db: Session = Depends(get_db),
):
    if not body.email or not body.code:
        raise HTTPException(status_code=400, detail="Email y código son requeridos")

    user = verify_email_code(body.email, body.code, db)
    if not user:
        raise HTTPException(status_code=400, detail="Código inválido o expirado")

    return {"message": "Cuenta verificada correctamente.", "verified": True}


@router.post("/api/auth/verify-and-login")
async def verify_code_and_login(
    body: VerifyCodeRequest,
    db: Session = Depends(get_db),
):
    if not body.email or not body.code:
        raise HTTPException(status_code=400, detail="Email y código son requeridos")

    token = verify_and_login(body.email, body.code, db)
    if not token:
        raise HTTPException(status_code=400, detail="Código inválido o expirado")

    response = _create_token_response(token, persist=True)
    return response


@router.post("/api/auth/resend-code")
async def resend_code(
    body: dict,
    db: Session = Depends(get_db),
):
    email = body.get("email", "")
    if not email:
        raise HTTPException(status_code=400, detail="Email requerido")

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.is_active:
        raise HTTPException(status_code=400, detail="La cuenta ya está verificada")

    from app.services.auth_service import _generate_verification_code
    from app.core.auth import get_password_hash

    code = _generate_verification_code()
    user.verification_code = get_password_hash(code)
    db.commit()

    send_verification_email(email, user.full_name or "", code)
    return {"message": "Código reenviado."}


@router.post("/api/auth/forgot-password")
async def forgot_password(
    body: ForgotPasswordRequest,
    db: Session = Depends(get_db),
):
    if not body.email:
        raise HTTPException(status_code=400, detail="Email requerido")

    user = db.query(User).filter(User.email == body.email).first()
    if not user:
        return {"message": "Si el email existe, recibirás un código de restablecimiento."}

    from app.services.auth_service import _generate_verification_code
    from app.core.auth import get_password_hash

    code = _generate_verification_code()
    user.verification_code = get_password_hash(code)
    db.commit()

    send_reset_password_email(body.email, user.full_name or "", code)
    return {"message": "Si el email existe, recibirás un código de restablecimiento."}


@router.post("/api/auth/reset-password")
async def reset_password(
    body: ResetPasswordRequest,
    db: Session = Depends(get_db),
):
    if not body.email or not body.code or not body.password:
        raise HTTPException(status_code=400, detail="Todos los campos son requeridos")
    pwd_err = validate_password(body.password)
    if pwd_err:
        raise HTTPException(status_code=400, detail=pwd_err)

    user = db.query(User).filter(User.email == body.email).first()
    if not user:
        raise HTTPException(status_code=400, detail="Código inválido o expirado")
    if not user.verification_code:
        raise HTTPException(status_code=400, detail="No hay una solicitud de restablecimiento activa")

    from app.core.auth import get_password_hash, verify_password

    if not verify_password(body.code, user.verification_code):
        raise HTTPException(status_code=400, detail="Código inválido o expirado")

    user.hashed_password = get_password_hash(body.password)
    user.verification_code = None
    db.commit()

    send_password_changed_email(body.email, user.full_name or "")

    response = JSONResponse({"message": "Contraseña actualizada correctamente."})
    response.delete_cookie("access_token")
    return response


@router.get("/api/auth/verify")
async def verify(token: str, db: Session = Depends(get_db)):
    user = verify_user(token, db)
    if not user:
        raise HTTPException(status_code=400, detail="Enlace inválido o expirado")
    return {"message": "Cuenta verificada correctamente. Ya puedes iniciar sesión."}


def _assert_not_deleted(user: User) -> None:
    if user.deleted_at:
        raise HTTPException(status_code=401, detail="No disponible")
    if user.tenant and user.tenant.deleted_at:
        raise HTTPException(status_code=401, detail="No disponible")


def _create_token_response(token: str, *, persist: bool = False):
    """Build a JSONResponse that sets the access_token cookie.

    persist=True  → 30-day max_age ("remember me")
    persist=False → session cookie — browser deletes it on close
    """
    response = JSONResponse({"access_token": token, "token_type": "bearer"})
    cookie_kwargs: dict = dict(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        path="/",
    )
    if persist:
        cookie_kwargs["max_age"] = _REMEMBER_MAX_AGE
    # No max_age for session cookies → browser lifetime only
    response.set_cookie(**cookie_kwargs)
    return response


@router.get("/logout")
async def logout(
    ctx: Optional[TenantContext] = Depends(optional_tenant),
    db: Session = Depends(get_db),
):
    if ctx:
        audit_record(
            db, tenant_id=ctx.tenant_id, organization_id=ctx.org_id,
            actor_id=str(ctx.user.id), actor_name=ctx.user.full_name, actor_email=ctx.user.email,
            action="user.logout", summary=f"Cierre de sesión: {ctx.user.email}",
            organization_name=ctx.organization.name if ctx.organization else None,
        )
    response = RedirectResponse(url="/login")
    response.delete_cookie("access_token")
    return response


@router.get("/")
async def read_root():
    return {"status": "ok", "service": "fintral-api"}


@router.get("/api/me")
async def get_current_session(ctx: TenantContext = Depends(require_tenant)):
    return {
        "user": {
            "id": str(ctx.user.id),
            "email": ctx.user.email,
            "full_name": ctx.user.full_name,
            "job_title": ctx.user.job_title,
            "phone": ctx.user.phone,
            "avatar_url": ctx.user.avatar_url,
            "is_active": ctx.user.is_active,
            "is_superuser": ctx.user.is_superuser,
            "created_at": ctx.user.created_at.isoformat() if ctx.user.created_at else None,
        },
        "tenant": {
            "id": str(ctx.tenant_id),
            "plan": ctx.tenant.plan if ctx.tenant else None,
        },
        "organization": {
            "id": str(ctx.org_id),
            "name": ctx.organization.name,
            "tax_id": ctx.organization.tax_id,
            "phone": ctx.organization.phone,
            "country": ctx.organization.country,
            "fiscal_address": ctx.organization.fiscal_address,
        },
        "role": ctx.role,
        **get_company_context(ctx.organization),
        "company_plan": ctx.tenant.plan if ctx.tenant else "free",
    }


@router.post("/api/chat/finance")
async def chat_finance(
    request: ChatRequest,
    ctx: TenantContext = Depends(require_tenant),
):
    invoices = (
        ctx.db.query(Invoice)
        .filter(
            Invoice.processed.is_(True),
            Invoice.tenant_id == ctx.tenant_id,
            Invoice.organization_id == ctx.org_id,
        )
        .order_by(desc(Invoice.invoice_date))
        .limit(50)
        .all()
    )

    context_data = [
        {
            "fecha": inv.invoice_date.strftime("%Y-%m-%d") if inv.invoice_date else "N/A",
            "proveedor": inv.vendor_name,
            "total": inv.total_amount,
            "moneda": inv.currency,
            "tipo": inv.transaction_type,
            "categoria": inv.category,
        }
        for inv in invoices
    ]

    if not context_data:
        return {
            "answer": "No veo ninguna factura registrada en el sistema aún. Sube algunas facturas para que pueda ayudarte con tus finanzas."
        }

    answer = openai_processor.process_finance_chat(
        request.query, context_data, org_id=str(ctx.org_id), user_id=str(ctx.user.id),
    )
    return {"answer": answer}
