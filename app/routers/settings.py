from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.database import get_db

from app.core.ui import templates
from app.dependencies.tenant import TenantContext, optional_tenant, require_tenant
from app.dependencies.tenancy import get_company_context
from app.schemas import SettingUpdate
from app.services import SettingsService

router = APIRouter()
settings_service = SettingsService()


@router.get("/settings", response_class=HTMLResponse)
async def settings_page(
    request: Request,
    ctx: Optional[TenantContext] = Depends(optional_tenant),
):
    if not ctx:
        return RedirectResponse(url="/login")
    return templates.TemplateResponse(
        "settings.html",
        {
            "request": request,
            "user": ctx.user,
            **get_company_context(ctx.organization),
        },
    )


@router.get("/reports", response_class=HTMLResponse)
async def reports_page(
    request: Request,
    ctx: Optional[TenantContext] = Depends(optional_tenant),
):
    if not ctx:
        return RedirectResponse(url="/login")
    return templates.TemplateResponse(
        "reports.html",
        {
            "request": request,
            "user": ctx.user,
            **get_company_context(ctx.organization),
        },
    )


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
