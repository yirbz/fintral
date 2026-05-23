import json
import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.redis import cache_delete, cache_get, cache_set
from app.database import get_db
from app.dependencies.tenant import require_admin, TenantContext
from app.models import ReferenceData
from app.services.audit_logger import query_admin as query_audit_logs

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])

REFDATA_CACHE_TTL = 3600


def _cache_key(domain: str) -> str:
    return f"refdata:{domain}"


@router.get("/reference-data")
async def list_reference_data(
    domain: Optional[str] = Query(None),
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    query = db.query(ReferenceData)
    if domain:
        query = query.filter(ReferenceData.domain == domain)
    if not include_inactive:
        query = query.filter(ReferenceData.is_active.is_(True))
    items = query.order_by(ReferenceData.domain, ReferenceData.sort_order, ReferenceData.code).all()
    return {"items": [item.to_dict() for item in items], "total": len(items)}


@router.post("/reference-data")
async def create_reference_data(
    body: dict,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    existing = db.query(ReferenceData).filter(
        ReferenceData.domain == body["domain"],
        ReferenceData.code == body["code"],
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Ya existe '{body['code']}' en dominio '{body['domain']}'")

    meta = body.get("metadata")
    item = ReferenceData(
        domain=body["domain"],
        code=body["code"],
        label_es=body["label_es"],
        description=body.get("description"),
        sort_order=body.get("sort_order", 0),
        is_active=body.get("is_active", True),
        metadata_json=json.dumps(meta) if meta else None,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    cache_delete(_cache_key(item.domain))
    return item.to_dict()


@router.put("/reference-data/{item_id}")
async def update_reference_data(
    item_id: str,
    body: dict,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    item = db.query(ReferenceData).filter(ReferenceData.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")

    if "code" in body:
        item.code = body["code"]
    if "label_es" in body:
        item.label_es = body["label_es"]
    if "description" in body:
        item.description = body.get("description")
    if "sort_order" in body:
        item.sort_order = body["sort_order"]
    if "is_active" in body:
        item.is_active = body["is_active"]
    if "metadata" in body:
        item.metadata_json = json.dumps(body["metadata"]) if body.get("metadata") else None

    db.commit()
    db.refresh(item)
    cache_delete(_cache_key(item.domain))
    return item.to_dict()


@router.delete("/reference-data/{item_id}")
async def delete_reference_data(
    item_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    item = db.query(ReferenceData).filter(ReferenceData.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")
    domain = item.domain
    db.delete(item)
    db.commit()
    cache_delete(_cache_key(domain))
    return {"message": "Item eliminado"}


@router.get("/reference-data/domains")
async def list_domains(
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_admin),
):
    rows = db.query(ReferenceData.domain).distinct().order_by(ReferenceData.domain).all()
    return {"domains": [r[0] for r in rows]}


@router.get("/reference-data/public/{domain}")
async def get_domain_data(
    domain: str,
    db: Session = Depends(get_db),
):
    cached = cache_get(_cache_key(domain))
    if cached is not None:
        return {"domain": domain, "items": cached}

    items = (
        db.query(ReferenceData)
        .filter(ReferenceData.domain == domain, ReferenceData.is_active.is_(True))
        .order_by(ReferenceData.sort_order, ReferenceData.code)
        .all()
    )
    serialized = [item.to_dict() for item in items]
    cache_set(_cache_key(domain), serialized, REFDATA_CACHE_TTL)
    return {"domain": domain, "items": serialized}


@router.get("/audit-logs")
async def list_admin_audit_logs(
    tenant_id: Optional[str] = Query(None, description="Filter by tenant UUID"),
    organization_id: Optional[str] = Query(None, description="Filter by organization UUID"),
    action: Optional[str] = Query(None),
    actor_id: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    visibility: Optional[str] = Query(None, description="client, internal, or empty for all"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    ctx: TenantContext = Depends(require_admin),
):
    tid = UUID(tenant_id) if tenant_id else None
    oid = UUID(organization_id) if organization_id else None

    rows, total = query_audit_logs(
        ctx.db,
        tenant_id=tid,
        organization_id=oid,
        action=action,
        actor_id=actor_id,
        resource_type=resource_type,
        visibility=visibility,
        limit=limit,
        offset=offset,
    )
    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "events": [r.to_admin_dict() for r in rows],
    }
