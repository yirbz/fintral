import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

from app.config import ALANUBE_API_URL, ALANUBE_JWT
from app.dependencies.tenant import TenantContext, require_tenant
from app.models import IntegrationConnection
from app.services.alanube_received import AlanubeReceivedService

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/api/alanube/sync")
async def sync_received_documents(
    start_date: str | None = None,
    end_date: str | None = None,
    ctx: TenantContext = Depends(require_tenant),
):
    if not ALANUBE_JWT:
        raise HTTPException(status_code=500, detail="Alanube JWT no configurado en el servidor")

    org_tax_id = ctx.organization.tax_id or ""
    company_id = ctx.organization.alanube_company_id

    service = AlanubeReceivedService(api_url=ALANUBE_API_URL, jwt_token=ALANUBE_JWT)

    result = await service.sync(
        db=ctx.db,
        tenant_id=ctx.tenant_id,
        org_id=ctx.org_id,
        org_tax_id=org_tax_id,
        company_id=company_id,
        start_date=start_date,
        end_date=end_date,
    )

    conn = (
        ctx.db.query(IntegrationConnection)
        .filter(
            IntegrationConnection.tenant_id == ctx.tenant_id,
            IntegrationConnection.organization_id == ctx.org_id,
            IntegrationConnection.provider == "alanube_sync",
        )
        .first()
    )
    if not conn:
        conn = IntegrationConnection(
            tenant_id=ctx.tenant_id,
            organization_id=ctx.org_id,
            provider="alanube_sync",
            name="Alanube Sync",
            is_active=True,
        )
        ctx.db.add(conn)
    conn.last_sync_at = datetime.utcnow()
    conn.last_error = "; ".join(result.get("errors", [])[:3]) if result.get("errors") else None
    ctx.db.commit()

    return {
        "status": "ok",
        "sync": result,
    }


@router.get("/api/alanube/sync-status")
async def sync_status(ctx: TenantContext = Depends(require_tenant)):
    conn = (
        ctx.db.query(IntegrationConnection)
        .filter(
            IntegrationConnection.tenant_id == ctx.tenant_id,
            IntegrationConnection.organization_id == ctx.org_id,
            IntegrationConnection.provider == "alanube_sync",
        )
        .first()
    )

    return {
        "available": bool(ALANUBE_JWT),
        "certified": bool(ctx.organization.is_ecf_authorized or ctx.organization.is_certification_completed),
        "company_id": ctx.organization.alanube_company_id,
        "last_sync_at": conn.last_sync_at.isoformat() if conn and conn.last_sync_at else None,
        "last_error": conn.last_error if conn else None,
    }
