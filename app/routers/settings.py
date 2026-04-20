from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User

from app.core.ui import templates
from app.dependencies.auth import get_current_user_from_cookie
from app.dependencies.tenancy import get_company_context, get_org_id
from app.schemas import SettingUpdate
from app.services import SettingsService

router = APIRouter()
settings_service = SettingsService()


@router.get("/settings", response_class=HTMLResponse)
async def settings_page(
    request: Request,
    user: Optional[User] = Depends(get_current_user_from_cookie),
    db: Session = Depends(get_db),
):
    if not user:
        return RedirectResponse(url="/login")
    return templates.TemplateResponse(
        "settings.html",
        {
            "request": request,
            "user": user,
            **get_company_context(db, user),
        },
    )


@router.get("/reports", response_class=HTMLResponse)
async def reports_page(
    request: Request,
    user: Optional[User] = Depends(get_current_user_from_cookie),
    db: Session = Depends(get_db),
):
    if not user:
        return RedirectResponse(url="/login")
    return templates.TemplateResponse(
        "reports.html",
        {
            "request": request,
            "user": user,
            **get_company_context(db, user),
        },
    )


@router.get("/api/settings")
async def get_settings(
    user: Optional[User] = Depends(get_current_user_from_cookie),
    db: Session = Depends(get_db),
):
    if not user:
        raise HTTPException(status_code=401, detail="No autorizado")

    org_id = get_org_id(user, db)
    return settings_service.get_settings_payload(db, user, org_id)


@router.post("/api/settings")
async def update_settings(
    updates: list[SettingUpdate],
    user: Optional[User] = Depends(get_current_user_from_cookie),
    db: Session = Depends(get_db),
):
    if not user:
        raise HTTPException(status_code=401, detail="No autorizado")

    org_id = get_org_id(user, db)
    try:
        updated = settings_service.update_settings(db, user, org_id, updates)
        return {"status": "success", "updated": updated}
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        raise HTTPException(status_code=500, detail=str(exc)) from exc
