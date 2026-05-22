import base64
import json
import logging
from datetime import datetime
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from app.config import FRONTEND_URL
from app.dependencies.tenant import TenantContext, require_tenant
from app.models import IntegrationConnection, Invoice
from app.services.xero_connector import XeroConnector

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/integrations/xero", tags=["integrations", "xero"])
connector = XeroConnector()


def _callback_html(status: str, detail: str = "") -> HTMLResponse:
    frontend_url = f"{FRONTEND_URL}/dashboard/settings?section=integraciones&xero={status}"
    if detail:
        frontend_url += f"&detail={detail}"
    return HTMLResponse(f"""<!DOCTYPE html>
<html><body><script>
(function(){{
  var msg = {{ type: "xero-oauth", status: "{status}", detail: "{detail}" }};
  if (window.opener) {{
    window.opener.postMessage(msg, "*");
    window.close();
  }} else {{
    window.location.href = "{frontend_url}";
  }}
}})();
</script></body></html>""")


@router.get("/auth-url")
async def get_auth_url(
    ctx: TenantContext = Depends(require_tenant),
):
    code_verifier, code_challenge = connector.generate_pkce_pair()
    state = base64.urlsafe_b64encode(
        json.dumps({
            "org_id": str(ctx.org_id),
            "tenant_id": str(ctx.tenant_id),
            "code_verifier": code_verifier,
        }).encode()
    ).decode()
    url = connector.get_auth_url(state, code_challenge=code_challenge)
    return {"url": url}


@router.get("/callback", response_class=HTMLResponse)
async def oauth_callback(
    code: str = Query(""),
    state: str = Query(""),
    error: str = Query(""),
    request: Request = None,
):
    client_host = request.client.host if request and request.client else "unknown"
    logger.info(
        "Xero callback received client=%s code=%s state=%s error=%s",
        client_host, "present" if code else "missing",
        state[:20] + "..." if state and len(state) > 20 else (state or "missing"),
        error or "none",
    )

    if error:
        logger.warning("Xero callback error: %s", error)
        return _callback_html("error", error)

    if not code:
        logger.warning("Xero callback missing code")
        return _callback_html("error", "missing_code")

    try:
        state_data = json.loads(base64.urlsafe_b64decode(state.encode()).decode())
        org_id = UUID(state_data.get("org_id", ""))
        tenant_id = UUID(state_data.get("tenant_id", ""))
        code_verifier = state_data.get("code_verifier", "")
        logger.info("Xero callback decoded state org=%s tenant=%s pkce=%s", org_id, tenant_id, bool(code_verifier))
    except (Exception, ValueError, KeyError) as e:
        logger.error("Xero callback invalid state: %s", e)
        return _callback_html("error", "invalid_state")

    try:
        token_data = connector.exchange_code(code, code_verifier=code_verifier)
        tenants = connector.fetch_tenants(token_data)
        if not tenants:
            logger.warning("Xero callback no tenants found")
            return _callback_html("error", "no_tenants")
        xero_tenant = tenants[0]
        token_data["xero_tenant_id"] = xero_tenant.get("tenantId", "")
        token_data["xero_tenant_name"] = xero_tenant.get("tenantName", "")
        logger.info(
            "Xero connected to tenant %s (%s)",
            token_data["xero_tenant_name"], token_data["xero_tenant_id"],
        )
    except Exception as e:
        logger.error("Xero OAuth token exchange failed: %s", e)
        return _callback_html("error", "token_exchange")

    from app.database import get_db
    db = next(get_db())
    try:
        conn = IntegrationConnection(
            tenant_id=tenant_id,
            organization_id=org_id,
            provider="xero",
            name=f"Xero ({token_data.get('xero_tenant_name', 'Unknown')})",
        )
        conn.set_config(token_data)
        db.add(conn)
        db.commit()
        db.refresh(conn)
        logger.info("Xero connection created id=%s tenant=%s", conn.id, token_data["xero_tenant_id"])
    except Exception as e:
        logger.error("Xero callback DB save failed: %s", e)
        return _callback_html("error", "db_save")
    finally:
        db.close()

    return _callback_html("connected")


@router.post("/refresh/{connection_id}")
async def refresh_xero_token(
    connection_id: str,
    ctx: TenantContext = Depends(require_tenant),
):
    conn = ctx.db.query(IntegrationConnection).filter(
        IntegrationConnection.id == connection_id,
        IntegrationConnection.tenant_id == ctx.tenant_id,
        IntegrationConnection.organization_id == ctx.org_id,
        IntegrationConnection.provider == "xero",
    ).first()
    if not conn:
        raise HTTPException(404, "Xero connection not found")

    config = conn.get_config()
    try:
        config = connector.refresh_access_token(config)
        conn.set_config(config)
        ctx.db.commit()
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(400, str(e))


@router.get("/connections")
async def list_xero_connections(
    ctx: TenantContext = Depends(require_tenant),
):
    rows = ctx.db.query(IntegrationConnection).filter(
        IntegrationConnection.tenant_id == ctx.tenant_id,
        IntegrationConnection.organization_id == ctx.org_id,
        IntegrationConnection.provider == "xero",
    ).order_by(IntegrationConnection.created_at.desc()).all()
    return [r.to_dict() for r in rows]


@router.delete("/connections/{connection_id}")
async def delete_xero_connection(
    connection_id: str,
    ctx: TenantContext = Depends(require_tenant),
):
    conn = ctx.db.query(IntegrationConnection).filter(
        IntegrationConnection.id == connection_id,
        IntegrationConnection.tenant_id == ctx.tenant_id,
        IntegrationConnection.organization_id == ctx.org_id,
        IntegrationConnection.provider == "xero",
    ).first()
    if not conn:
        raise HTTPException(404, "Xero connection not found")
    ctx.db.delete(conn)
    ctx.db.commit()
    return {"status": "deleted"}


@router.post("/test/{connection_id}")
async def test_xero_connection(
    connection_id: str,
    ctx: TenantContext = Depends(require_tenant),
):
    conn = ctx.db.query(IntegrationConnection).filter(
        IntegrationConnection.id == connection_id,
        IntegrationConnection.tenant_id == ctx.tenant_id,
        IntegrationConnection.organization_id == ctx.org_id,
        IntegrationConnection.provider == "xero",
    ).first()
    if not conn:
        raise HTTPException(404, "Xero connection not found")

    config = conn.get_config()
    result = connector.test_connection(config)
    return result


class XeroPushBody(BaseModel):
    connection_id: str
    invoice_ids: List[str]


@router.post("/push")
async def push_to_xero(
    body: XeroPushBody,
    ctx: TenantContext = Depends(require_tenant),
):
    conn = ctx.db.query(IntegrationConnection).filter(
        IntegrationConnection.id == body.connection_id,
        IntegrationConnection.tenant_id == ctx.tenant_id,
        IntegrationConnection.organization_id == ctx.org_id,
        IntegrationConnection.provider == "xero",
    ).first()
    if not conn:
        raise HTTPException(404, "Xero connection not found")

    config = conn.get_config()
    ids = list(set(body.invoice_ids))
    logger.info("push_to_xero: received %d ids, unique %d", len(body.invoice_ids), len(ids))

    invoices = ctx.db.query(Invoice).filter(
        Invoice.id.in_(ids),
        Invoice.tenant_id == ctx.tenant_id,
        Invoice.organization_id == ctx.org_id,
    ).all()
    logger.info("push_to_xero: found %d invoices in db", len(invoices))

    if not invoices:
        raise HTTPException(400, "No invoices found for the given ids")

    results = connector.push_invoices(config, invoices)
    total = len(results)
    success = sum(1 for r in results if r.get("success"))
    failed = total - success

    conn.last_sync_at = datetime.utcnow()
    if failed > 0:
        conn.last_error = results[failed - 1].get("error", "") if failed <= len(results) else ""
    ctx.db.commit()

    return {"total": total, "success": success, "failed": failed, "results": results}
