import base64
import json
import logging
from datetime import datetime
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel

from app.config import FRONTEND_URL
from app.dependencies.tenant import TenantContext, require_tenant
from app.models import IntegrationConnection, Invoice
from app.services.quickbooks_connector import QuickBooksConnector
from app.services.audit_logger import record as audit_record

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/integrations/quickbooks", tags=["integrations", "quickbooks"])
connector = QuickBooksConnector()


class QuickBooksPushBody(BaseModel):
    connection_id: str
    invoice_ids: List[str]


# ── OAuth 2.0 Flow ─────────────────────────────────────────


@router.get("/auth-url")
async def get_auth_url(
    ctx: TenantContext = Depends(require_tenant),
):
    state = base64.urlsafe_b64encode(
        json.dumps({"org_id": str(ctx.org_id), "tenant_id": str(ctx.tenant_id)}).encode()
    ).decode()
    url = connector.get_auth_url(state)
    return {"url": url}


def _callback_html(status: str, detail: str = "") -> HTMLResponse:
    frontend_url = f"{FRONTEND_URL}/dashboard/settings?section=integraciones&qb={status}"
    if detail:
        frontend_url += f"&detail={detail}"
    return HTMLResponse(f"""<!DOCTYPE html>
<html><body><script>
(function(){{
  var msg = {{ type: "qb-oauth", status: "{status}", detail: "{detail}" }};
  if (window.opener) {{
    window.opener.postMessage(msg, "*");
    window.close();
  }} else {{
    window.location.href = "{frontend_url}";
  }}
}})();
</script></body></html>""")


@router.get("/callback", response_class=HTMLResponse)
async def oauth_callback(
    code: str = Query(""),
    realm_id: str = Query(default="", alias="realmId"),
    state: str = Query(""),
    error: str = Query(""),
    request: Request = None,
):
    client_host = request.client.host if request and request.client else "unknown"
    logger.info(
        "QB callback received client=%s code=%s realm_id=%s state=%s error=%s",
        client_host,
        "present" if code else "missing",
        realm_id or "missing",
        state[:20] + "..." if state and len(state) > 20 else (state or "missing"),
        error or "none",
    )

    if error:
        logger.warning("QB callback error from Intuit: %s", error)
        return _callback_html("error", error)

    if not code or not realm_id:
        logger.warning("QB callback missing code or realm_id code=%s realm_id=%s", bool(code), bool(realm_id))
        return _callback_html("error", "missing_code")

    try:
        state_data = json.loads(base64.urlsafe_b64decode(state.encode()).decode())
        org_id = UUID(state_data.get("org_id", ""))
        tenant_id = UUID(state_data.get("tenant_id", ""))
        logger.info("QB callback decoded state org=%s tenant=%s", org_id, tenant_id)
    except (Exception, ValueError, KeyError) as e:
        logger.error("QB callback invalid state: %s", e)
        return _callback_html("error", "invalid_state")

    try:
        token_data = connector.exchange_code(code, realm_id)
    except Exception as e:
        logger.error("QB OAuth token exchange failed: %s", e)
        return _callback_html("error", "token_exchange")

    from app.database import get_db
    db = next(get_db())
    try:
        conn = IntegrationConnection(
            tenant_id=tenant_id,
            organization_id=org_id,
            provider="quickbooks",
            name=f"QuickBooks ({realm_id})",
        )
        conn.set_config(token_data)
        db.add(conn)
        db.commit()
        db.refresh(conn)
        logger.info("QBO connection created id=%s realm=%s", conn.id, realm_id)
    except Exception as e:
        logger.error("QB callback DB save failed: %s", e)
        return _callback_html("error", "db_save")
    finally:
        db.close()

    return _callback_html("connected")


@router.post("/refresh/{connection_id}")
async def refresh_qb_token(
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

    config = conn.get_config()
    if not config:
        raise HTTPException(status_code=400, detail="Connection has no configuration")

    try:
        config = connector.refresh_access_token(config)
        conn.set_config(config)
        ctx.db.commit()
        return {"status": "refreshed"}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Token refresh failed: {e}")


# ── Connection CRUD ────────────────────────────────────────


@router.get("/connections")
async def list_connections(
    ctx: TenantContext = Depends(require_tenant),
):
    rows = (
        ctx.db.query(IntegrationConnection)
        .filter(
            IntegrationConnection.tenant_id == ctx.tenant_id,
            IntegrationConnection.organization_id == ctx.org_id,
            IntegrationConnection.provider == "quickbooks",
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


# ── Test ───────────────────────────────────────────────────


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

    config = conn.get_config()
    if not config:
        raise HTTPException(status_code=400, detail="Connection has no configuration")

    try:
        result = connector.test_connection(config)
        return result
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ── Push ───────────────────────────────────────────────────


@router.post("/push")
async def push_to_quickbooks(
    body: QuickBooksPushBody,
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

    unique_ids = list(set(body.invoice_ids))
    logger.info("push_to_qb: received %d ids, unique %d, ids=%s",
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
    logger.info("push_to_qb: found %d invoices in db, ids=%s", len(invoices), found_ids)

    results = connector.push_vendor_bills(config, invoices)

    conn.last_sync_at = datetime.utcnow()
    errors = [r for r in results if not r["success"]]
    conn.last_error = (errors[0]["error"] or "")[:2000] if errors else None
    ctx.db.commit()

    first = invoices[0]
    audit_record(
        ctx.db,
        tenant_id=ctx.tenant_id,
        organization_id=ctx.org_id,
        organization_name=ctx.organization.name,
        actor_id=str(ctx.user.id),
        actor_name=getattr(ctx.user, 'full_name', None) or getattr(ctx.user, 'name', None) or ctx.user.email,
        actor_email=ctx.user.email,
        action="integration.pushed",
        resource_type="invoice",
        resource_id=str(first.id),
        summary=f"Factura {first.invoice_number} enviada a QuickBooks",
        metadata={"integration": "quickbooks"},
    )

    return {
        "total": len(results),
        "success": sum(1 for r in results if r["success"]),
        "failed": len(errors),
        "results": results,
    }
