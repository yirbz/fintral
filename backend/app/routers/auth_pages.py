from datetime import timedelta
from typing import Optional
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import desc
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.config import ADMIN_EMAIL, ADMIN_PASSWORD, REMEMBER_ME_EXPIRE_DAYS, SUPABASE_URL, PUBLIC_APP_URL
from app.dependencies.auth import resolve_user_from_token
from app.core.auth import create_access_token, verify_password
from app.core.container import openai_processor
from app.core.redis import get_redis_client
from app.database import get_db
from app.dependencies.tenant import TenantContext, optional_tenant, require_tenant
from app.services.audit_logger import record as audit_record
from app.dependencies.tenancy import get_company_context
from app.models import Invoice, Organization, User, UserOrganization
from app.schemas import ChatRequest, ForgotPasswordRequest, RegisterRequest, ResetPasswordRequest, VerifyCodeRequest
from app.utils.validation import validate_email, validate_full_name, validate_password
from app.services.auth_service import provision_local_user, sign_in, sign_up_user, verify_and_login, verify_email_code, verify_user, get_supabase_admin
from app.services.email_service import send_password_changed_email, send_reset_password_email, send_verification_email

logger = logging.getLogger(__name__)
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

    # 1) Try Supabase Auth first (verify credentials via Supabase,
    #    then use the Supabase token directly for the session)
    if SUPABASE_URL:
        result = sign_in(form_data.username, form_data.password)
        if result:
            user = provision_local_user(db, result["user"])
            if user and not user.is_active:
                user.is_active = True
                db.commit()
            if not user:
                raise HTTPException(status_code=401, detail="Email o contraseña incorrectos")
            _assert_not_deleted(user)
            # Generate a local session JWT to respect the remember-me / persistence settings,
            # since Supabase's native access token expires after 1 hour.
            expire = timedelta(days=REMEMBER_ME_EXPIRE_DAYS) if remember else timedelta(minutes=_SESSION_EXPIRE_MINUTES)
            local_token = create_access_token(data={"sub": form_data.username}, expires_delta=expire)
            audit_record(
                db, tenant_id=user.tenant_id, organization_id=user.tenant_id,
                actor_id=str(user.id), actor_name=user.full_name, actor_email=user.email,
                action="user.login", summary=f"Inicio de sesión (Supabase): {user.email}",
            )
            hostname = request.headers.get("x-forwarded-host") or request.headers.get("host", "")
            return _create_token_response(local_token, persist=remember, hostname=hostname)
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
            hostname = request.headers.get("x-forwarded-host") or request.headers.get("host", "")
            return _create_token_response(token, persist=remember, hostname=hostname)
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
        hostname = request.headers.get("x-forwarded-host") or request.headers.get("host", "")
        return _create_token_response(token, persist=remember, hostname=hostname)

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
    request: Request,
    body: VerifyCodeRequest,
    db: Session = Depends(get_db),
):
    if not body.email or not body.code:
        raise HTTPException(status_code=400, detail="Email y código son requeridos")

    token = verify_and_login(body.email, body.code, db)
    if not token:
        raise HTTPException(status_code=400, detail="Código inválido o expirado")

    hostname = request.headers.get("x-forwarded-host") or request.headers.get("host", "")
    response = _create_token_response(token, persist=True, hostname=hostname)
    return response


@router.post("/api/auth/resend-code")
async def resend_code(
    body: dict,
    db: Session = Depends(get_db),
):
    email = body.get("email", "")
    if not email:
        raise HTTPException(status_code=400, detail="Email requerido")

    # ── Rate limit: 30s cooldown per email ──
    r = get_redis_client()
    cooldown_key = f"cooldown:resend_code:{email}"
    if r:
        ttl = r.ttl(cooldown_key)
        if ttl > 0:
            raise HTTPException(
                status_code=429,
                detail=f"Debes esperar {ttl} segundos antes de solicitar otro código.",
            )

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

    # ── Set cooldown after successful resend ──
    if r:
        r.setex(cooldown_key, 30, "1")

    send_verification_email(email, user.full_name or "", code)
    return {"message": "Código reenviado."}


@router.post("/api/auth/forgot-password")
async def forgot_password(
    body: ForgotPasswordRequest,
    db: Session = Depends(get_db),
):
    if not body.email:
        raise HTTPException(status_code=400, detail="Email requerido")

    # ── Rate limit: 30s cooldown per email ──
    r = get_redis_client()
    cooldown_key = f"cooldown:forgot_password:{body.email}"
    if r:
        ttl = r.ttl(cooldown_key)
        if ttl > 0:
            raise HTTPException(
                status_code=429,
                detail=f"Debes esperar {ttl} segundos antes de solicitar otro código.",
            )

    user = db.query(User).filter(User.email == body.email).first()
    if not user:
        return {"message": "Si el email existe, recibirás un código de restablecimiento."}

    from app.services.auth_service import _generate_verification_code
    from app.core.auth import get_password_hash

    code = _generate_verification_code()
    user.verification_code = get_password_hash(code)
    db.commit()

    if r:
        r.setex(cooldown_key, 30, "1")

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


def _get_cookie_domain(hostname: str) -> str | None:
    """Extract parent domain for cookie sharing across subdomains.

    - factura.localhost:3000 → None (host-only cookie for local dev)
    - factura.fintral.app   → .fintral.app
    - localhost:3000        → None
    - fintral.app           → .fintral.app
    """
    hostname = hostname.split(":")[0].lower()
    if hostname == "localhost" or hostname.endswith(".localhost") or hostname == "127.0.0.1":
        return None
    
    import re
    if re.match(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$", hostname):
        return None

    parts = hostname.split(".")
    if len(parts) >= 2:
        return "." + ".".join(parts[-2:])
    return None


def _create_token_response(token: str, *, persist: bool = False, hostname: str | None = None):
    """Build a JSONResponse that sets the access_token cookie.

    persist=True  → 30-day max_age ("remember me")
    persist=False → session cookie — browser deletes it on close
    hostname     → if provided, sets domain for subdomain-wide cookie
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
    if hostname:
        domain = _get_cookie_domain(hostname)
        if domain:
            cookie_kwargs["domain"] = domain
    response.set_cookie(**cookie_kwargs)
    return response


@router.get("/logout")
async def logout(
    request: Request,
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
    hostname = request.headers.get("x-forwarded-host") or request.headers.get("host", "")
    domain = _get_cookie_domain(hostname)

    # Delete host-only cookie first (no Domain — matches verify-and-login / OAuth flows)
    response.delete_cookie(key="access_token", path="/")
    # Then delete domain-scoped cookie (with Domain — matches regular login flow)
    if domain:
        response.delete_cookie(key="access_token", path="/", domain=domain)
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
            "is_deleted": ctx.organization.is_deleted,
            "deleted_at": ctx.organization.deleted_at.isoformat() if ctx.organization.deleted_at else None,
        },
        "role": ctx.role,
        **get_company_context(ctx.organization),
        "company_plan": ctx.tenant.plan if ctx.tenant else "free",
    }


@router.get("/api/me/subscription")
async def get_user_subscription(ctx: TenantContext = Depends(require_tenant)):
    """Return the current user's Fintral Hub subscription status."""
    from app.models.user_subscription import UserSubscription

    sub = (
        ctx.db.query(UserSubscription)
        .filter(UserSubscription.user_id == ctx.user.id)
        .order_by(UserSubscription.created_at.desc())
        .first()
    )
    if not sub:
        return {"subscription": None, "plan": None, "has_active_subscription": False}

    trial_remaining = 0
    if sub.trial_ends_at:
        from datetime import timezone
        remaining = (sub.trial_ends_at - sub.trial_ends_at.now(timezone.utc)).days
        trial_remaining = max(0, remaining)

    card_info = None

    grace_hours = None
    if sub.status == "past_due":
        from datetime import timezone, timedelta
        from app.utils.dates import utc_now
        grace_period = timedelta(days=3)
        time_since_failed = utc_now() - sub.updated_at
        if time_since_failed <= grace_period:
            grace_hours = max(0, int((grace_period - time_since_failed).total_seconds() / 3600))

    plan = sub.plan

    # Check org-level subscription grace period
    in_grace_period = False
    if ctx.org_id:
        from app.utils.dates import utc_now
        from app.models.organization_subscription import OrganizationSubscription
        org_sub = (
            ctx.db.query(OrganizationSubscription)
            .filter(
                OrganizationSubscription.organization_id == ctx.org_id,
                OrganizationSubscription.status.in_(["active", "trialing"]),
                OrganizationSubscription.billing_cycle_end < utc_now(),
            )
            .order_by(OrganizationSubscription.created_at.desc())
            .first()
        )
        if org_sub:
            in_grace_period = True

    return {
        "in_grace_period": in_grace_period,
        "subscription": {
            "id": str(sub.id),
            "status": sub.status,
            "plan_code": sub.lago_plan_code,
            "plan_name": plan.display_name if plan else None,
            "payment_method": sub.payment_method,
            "auto_renew": sub.auto_renew,
            "trial_ends_at": sub.trial_ends_at.isoformat() if sub.trial_ends_at else None,
            "trial_remaining_days": trial_remaining,
            "billing_cycle_start": sub.billing_cycle_start.isoformat() if sub.billing_cycle_start else None,
            "billing_cycle_end": sub.billing_cycle_end.isoformat() if sub.billing_cycle_end else None,
            "canceled_at": sub.canceled_at.isoformat() if sub.canceled_at else None,
            "lago_subscription_id": sub.lago_subscription_id,
            "lago_customer_id": sub.lago_customer_id,
            "created_at": sub.created_at.isoformat() if sub.created_at else None,
            "card_info": card_info,
            "grace_hours": grace_hours,
        },
        "plan": {
            "id": str(plan.id),
            "name": plan.name,
            "display_name": plan.display_name,
            "description": plan.description,
            "price_monthly": round(plan.price_monthly_cents / 100, 2),
            "price_usd": float(plan.price_usd) if plan.price_usd is not None else None,
            "limits": plan.to_dict().get("limits", {}),
            "features": plan.to_dict().get("features", {}),
            "is_enterprise": plan.is_enterprise,
            "sort_order": plan.sort_order,
            "soft_limit_enabled": plan.soft_limit_enabled,
        } if plan else None,
        "has_active_subscription": sub.status in ("active", "trialing", "past_due"),
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


@router.get("/auth/google")
async def auth_google():
    if not SUPABASE_URL:
        raise HTTPException(status_code=400, detail="Supabase no está configurado")
    redirect_url = f"{SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to={PUBLIC_APP_URL}/auth/callback"
    return RedirectResponse(url=redirect_url)


@router.post("/api/auth/session")
async def create_session_from_token(
    request: Request,
    body: dict,
    db: Session = Depends(get_db),
):
    token = body.get("access_token")
    code = body.get("code")
    
    if not token and not code:
        raise HTTPException(status_code=400, detail="Se requiere access_token o code")
        
    # If PKCE code is provided, exchange it for a session token
    if code:
        supabase = get_supabase_admin()
        if not supabase:
            raise HTTPException(status_code=400, detail="Supabase no está configurado")
        try:
            res = supabase.auth.exchange_code_for_session({"auth_code": code})
            if res and res.session:
                token = res.session.access_token
            else:
                raise HTTPException(status_code=400, detail="No se pudo intercambiar el código")
        except Exception as e:
            logger.error("Error exchanging code: %s", e)
            raise HTTPException(status_code=400, detail=f"Error al intercambiar el código: {e}")
            
    user = resolve_user_from_token(token, db)
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado o no se pudo registrar")
        
    _assert_not_deleted(user)
    
    audit_record(
        db, tenant_id=user.tenant_id, organization_id=user.tenant_id,
        actor_id=str(user.id), actor_name=user.full_name, actor_email=user.email,
        action="user.login", summary=f"Inicio de sesión vía OAuth/Token: {user.email}",
    )
    
    hostname = request.headers.get("x-forwarded-host") or request.headers.get("host", "")
    return _create_token_response(token, persist=True, hostname=hostname)
