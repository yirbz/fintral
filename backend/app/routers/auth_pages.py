from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import desc
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.config import ADMIN_EMAIL, ADMIN_PASSWORD, IS_PRODUCTION
from app.core.auth import create_access_token, verify_password
from app.core.container import openai_processor
from app.core.ui import templates
from app.database import get_db
from app.dependencies.tenant import TenantContext, optional_tenant, require_tenant
from app.dependencies.tenancy import get_company_context
from app.models import Invoice, User
from app.schemas import ChatRequest
from app.services.auth_service import sign_in, provision_local_user

router = APIRouter()


@router.post("/token")
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user = None

    # 1) PROD: try Supabase Auth first
    if IS_PRODUCTION:
        result = sign_in(form_data.username, form_data.password)
        if result:
            user = provision_local_user(db, result["user"])
            if user and not user.is_active:
                raise HTTPException(status_code=400, detail="Usuario inactivo")
            return _create_token_response(result["access_token"])
        # fall through to local verification if Supabase fails

    # 2) Legacy password verification (PROD fallback + DEVELOPMENT primary)
    try:
        user = db.query(User).filter(User.email == form_data.username).first()
        if user and verify_password(form_data.password, user.hashed_password):
            if not user.is_active:
                raise HTTPException(status_code=400, detail="Usuario inactivo")
            token = create_access_token(data={"sub": form_data.username})
            return _create_token_response(token)
    except OperationalError:
        pass

    # 3) Hardcoded admin fallback (DB unavailable)
    if ADMIN_EMAIL and form_data.username == ADMIN_EMAIL and ADMIN_PASSWORD == form_data.password:
        token = create_access_token(data={"sub": form_data.username})
        return _create_token_response(token)

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Email o contraseña incorrectos",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _create_token_response(token: str):
    response = JSONResponse({"access_token": token, "token_type": "bearer"})
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=300 * 60,
        path="/",
    )
    return response


@router.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})


@router.get("/logout")
async def logout():
    response = RedirectResponse(url="/login")
    response.delete_cookie("access_token")
    return response


@router.get("/", response_class=HTMLResponse)
async def read_root(
    request: Request,
    ctx: Optional[TenantContext] = Depends(optional_tenant),
):
    if not ctx:
        return templates.TemplateResponse("landing.html", {"request": request})
    return RedirectResponse(url="/app", status_code=307)


@router.get("/api/me")
async def get_current_session(ctx: TenantContext = Depends(require_tenant)):
    return {
        "user": {
            "id": str(ctx.user.id),
            "email": ctx.user.email,
            "full_name": ctx.user.full_name,
            "is_active": ctx.user.is_active,
            "is_superuser": ctx.user.is_superuser,
        },
        "tenant": {
            "id": str(ctx.tenant_id),
            "plan": ctx.tenant.plan if ctx.tenant else None,
        },
        "organization": {
            "id": str(ctx.org_id),
            "name": ctx.organization.name,
            "tax_id": ctx.organization.tax_id,
            "country": ctx.organization.country,
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
