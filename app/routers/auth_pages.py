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
from app.dependencies.auth import get_current_user_from_cookie
from app.dependencies.tenancy import get_company_context, get_org_id
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
    user: Optional[User] = Depends(get_current_user_from_cookie),
    db: Session = Depends(get_db),
):
    if not user:
        return templates.TemplateResponse("landing.html", {"request": request})
    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "user": user,
            **get_company_context(db, user),
        },
    )


@router.post("/api/chat/finance")
async def chat_finance(
    request: ChatRequest,
    user: Optional[User] = Depends(get_current_user_from_cookie),
    db: Session = Depends(get_db),
):
    if not user:
        raise HTTPException(status_code=401, detail="No autorizado")

    org_id = get_org_id(user, db)
    invoices = (
        db.query(Invoice)
        .filter(Invoice.processed.is_(True), Invoice.organization_id == org_id)
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

    answer = openai_processor.process_finance_chat(request.query, context_data, org_id=org_id, user_id=user.id)
    return {"answer": answer}
