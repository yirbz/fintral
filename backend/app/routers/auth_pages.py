from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.core.auth import create_access_token, verify_password
from app.database import get_db
from app.models import Invoice, User

from app.core.container import openai_processor
from app.core.ui import templates
from app.dependencies.tenant import TenantContext, optional_tenant, require_tenant
from app.dependencies.tenancy import get_company_context
from app.schemas import ChatRequest

router = APIRouter()


@router.post("/token")
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Usuario inactivo")

    access_token = create_access_token(data={"sub": user.email}, expires_delta=timedelta(minutes=300))
    return {"access_token": access_token, "token_type": "bearer"}


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
    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "user": ctx.user,
            **get_company_context(ctx.organization),
        },
    )


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
