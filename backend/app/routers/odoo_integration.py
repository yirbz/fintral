import logging
from datetime import datetime
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.dependencies.tenant import TenantContext, require_tenant
from app.models import IntegrationConnection, Invoice
from app.services.odoo_connector import OdooConnector

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/integrations/odoo", tags=["integrations", "odoo"])
connector = OdooConnector()


class OdooConnectionBody(BaseModel):
    name: str
    url: str
    database: str
    username: str | None = None
    api_key: str


class OdooTestBody(BaseModel):
    url: str
    database: str
    username: str | None = None
    api_key: str


class OdooPushBody(BaseModel):
    connection_id: str
    invoice_ids: List[str]


# ── Connection CRUD ────────────────────────────────────────────


@router.post("/connections")
async def create_connection(
    body: OdooConnectionBody,
    ctx: TenantContext = Depends(require_tenant),
):
    config = {
        "url": body.url,
        "database": body.database,
        "username": body.username,
        "api_key": body.api_key,
    }

    conn = IntegrationConnection(
        tenant_id=ctx.tenant_id,
        organization_id=ctx.org_id,
        provider="odoo",
        name=body.name,
    )
    conn.set_config(config)
    ctx.db.add(conn)
    ctx.db.commit()
    ctx.db.refresh(conn)

    return conn.to_dict()


@router.get("/connections")
async def list_connections(
    ctx: TenantContext = Depends(require_tenant),
):
    rows = (
        ctx.db.query(IntegrationConnection)
        .filter(
            IntegrationConnection.tenant_id == ctx.tenant_id,
            IntegrationConnection.organization_id == ctx.org_id,
            IntegrationConnection.provider == "odoo",
        )
        .order_by(IntegrationConnection.created_at.desc())
        .all()
    )
    return [r.to_dict() for r in rows]


@router.delete("/connections/{connection_id}")
async def delete_connection(
    connection_id: str,
    ctx: TenantContext = Depends(require_tenant),
):
    conn = (
        ctx.db.query(IntegrationConnection)
        .filter(
            IntegrationConnection.id == UUID(connection_id),
            IntegrationConnection.tenant_id == ctx.tenant_id,
            IntegrationConnection.organization_id == ctx.org_id,
        )
        .first()
    )
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    ctx.db.delete(conn)
    ctx.db.commit()
    return {"status": "deleted"}


# ── Test ────────────────────────────────────────────────────────


@router.post("/test")
async def test_odoo_connection(
    body: OdooTestBody,
):
    config = {
        "url": body.url,
        "database": body.database,
        "username": body.username,
        "api_key": body.api_key,
    }
    try:
        result = connector.test_connection(config)
        return result
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.post("/test/{connection_id}")
async def test_saved_connection(
    connection_id: str,
    ctx: TenantContext = Depends(require_tenant),
):
    conn = (
        ctx.db.query(IntegrationConnection)
        .filter(
            IntegrationConnection.id == UUID(connection_id),
            IntegrationConnection.tenant_id == ctx.tenant_id,
            IntegrationConnection.organization_id == ctx.org_id,
        )
        .first()
    )
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    try:
        result = connector.get_connection_status(conn)
        return result
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ── Push ────────────────────────────────────────────────────────


@router.post("/push")
async def push_to_odoo(
    body: OdooPushBody,
    ctx: TenantContext = Depends(require_tenant),
):
    conn = (
        ctx.db.query(IntegrationConnection)
        .filter(
            IntegrationConnection.id == UUID(body.connection_id),
            IntegrationConnection.tenant_id == ctx.tenant_id,
            IntegrationConnection.organization_id == ctx.org_id,
        )
        .first()
    )
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    config = conn.get_config()
    if not config:
        raise HTTPException(status_code=400, detail="Connection has no configuration")

    # Deduplicate invoice IDs (safety net)
    unique_ids = list(set(body.invoice_ids))
    logger.info("push_to_odoo: received %d ids, unique %d, ids=%s",
                len(body.invoice_ids), len(unique_ids), unique_ids)

    if not unique_ids:
        raise HTTPException(status_code=400, detail="No invoice IDs provided")

    invoices = (
        ctx.db.query(Invoice)
        .filter(
            Invoice.id.in_([UUID(i) for i in unique_ids]),
            Invoice.tenant_id == ctx.tenant_id,
            Invoice.organization_id == ctx.org_id,
        )
        .all()
    )
    if not invoices:
        raise HTTPException(status_code=404, detail="No invoices found")

    found_ids = [str(i.id) for i in invoices]
    logger.info("push_to_odoo: found %d invoices in db, ids=%s", len(invoices), found_ids)

    results = connector.push_vendor_bills(config, invoices)

    conn.last_sync_at = datetime.utcnow()
    errors = [r for r in results if not r["success"]]
    conn.last_error = (errors[0]["error"] or "")[:2000] if errors else None
    ctx.db.commit()

    return {
        "total": len(results),
        "success": sum(1 for r in results if r["success"]),
        "failed": len(errors),
        "results": results,
    }
