import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.dependencies.tenant import TenantContext, require_tenant
from app.services.audit_logger import query as query_audit_logs

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("")
async def list_history(
    action: Optional[str] = Query(None),
    actor_id: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    ctx: TenantContext = Depends(require_tenant),
):
    rows, total = query_audit_logs(
        ctx.db,
        tenant_id=ctx.tenant_id,
        organization_id=ctx.org_id,
        action=action,
        actor_id=actor_id,
        resource_type=resource_type,
        visibility="client",
        limit=limit,
        offset=offset,
    )
    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "events": [r.to_dict() for r in rows],
    }
