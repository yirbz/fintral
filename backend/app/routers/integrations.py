import logging
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.dependencies.tenant import TenantContext, require_tenant
from app.models import AccountMapping, ExportProfile, Invoice
from app.repositories import InvoiceRepository
from app.services.integrations import IntegrationExportService
from app.services.audit_logger import record as audit_record
from app.services.export import ExportService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/integrations", tags=["integrations"])

integration_service = IntegrationExportService()
export_service = ExportService()
invoice_repo = InvoiceRepository()


class MappingsListBody(BaseModel):
    provider: str


class MappingEntry(BaseModel):
    category: str
    account_code: str
    account_label: Optional[str] = None


class SaveMappingsBody(BaseModel):
    provider: str
    entries: List[MappingEntry]


class ProfileCreate(BaseModel):
    name: str
    provider: str
    config: dict = {}


class ExportBody(BaseModel):
    provider: str
    invoice_ids: List[str]
    profile_id: Optional[str] = None


class BulkExportBody(BaseModel):
    provider: str
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    profile_id: Optional[str] = None


PRESET_PROFILES = [
    {
        "name": "QuickBooks Online Bills",
        "provider": "quickbooks",
        "is_preset": True,
        "config": {
            "columns": [
                "Bill No", "Vendor", "Transaction Date", "Due Date",
                "Total", "Account", "Line Amount", "Line Description",
            ],
            "separator": "comma",
            "date_format": "%m/%d/%Y",
        },
    },
    {
        "name": "Odoo Vendor Bills",
        "provider": "odoo",
        "is_preset": True,
        "config": {
            "columns": [
                "move_type", "partner_id/name", "invoice_date", "invoice_date_due",
                "ref", "currency_id/name",
                "invoice_line_ids/name", "invoice_line_ids/quantity",
                "invoice_line_ids/price_unit", "invoice_line_ids/account_id/name",
            ],
            "separator": "comma",
            "date_format": "%Y-%m-%d",
        },
    },
    {
        "name": "Xero Bills",
        "provider": "xero",
        "is_preset": True,
        "config": {
            "columns": [
                "Contact Name", "Invoice Number", "Invoice Date", "Due Date",
                "Description", "Quantity", "Unit Amount", "Account Code",
            ],
            "separator": "comma",
            "date_format": "%Y-%m-%d",
        },
    },
    {
        "name": "Contaplus/Sage Diario",
        "provider": "contaplus",
        "is_preset": True,
        "config": {
            "columns": [
                "Fecha", "Cuenta", "Concepto", "Debe", "Haber", "Documento",
            ],
            "separator": "comma",
            "date_format": "%d/%m/%Y",
        },
    },
]


# ── Account Mappings ──────────────────────────────────────────


@router.get("/mappings")
async def list_mappings(
    provider: str = "",
    ctx: TenantContext = Depends(require_tenant),
):
    if provider:
        mappings = integration_service.list_mappings(ctx.db, ctx.tenant_id, ctx.org_id, provider)
    else:
        mappings = (
            ctx.db.query(AccountMapping)
            .filter(
                AccountMapping.tenant_id == ctx.tenant_id,
                AccountMapping.organization_id == ctx.org_id,
            )
            .order_by(AccountMapping.provider, AccountMapping.category)
            .all()
        )
    return [m.to_dict() for m in mappings]


@router.post("/mappings")
async def save_mappings(
    body: SaveMappingsBody,
    ctx: TenantContext = Depends(require_tenant),
):
    entries = [e.model_dump() for e in body.entries]
    integration_service.save_mappings(ctx.db, ctx.tenant_id, ctx.org_id, body.provider, entries)
    first = entries[0] if entries else {}
    audit_record(
        ctx.db,
        tenant_id=ctx.tenant_id,
        organization_id=ctx.org_id,
        organization_name=ctx.organization.name,
        actor_id=str(ctx.user.id),
        actor_name=getattr(ctx.user, 'full_name', None) or getattr(ctx.user, 'name', None) or ctx.user.email,
        actor_email=ctx.user.email,
        action="settings.updated",
        resource_type="account_mapping",
        summary=f"Mapeo contable '{first.get('account_code', '')}' creado",
    )
    return {"status": "ok"}


@router.delete("/mappings/{mapping_id}")
async def delete_mapping(
    mapping_id: str,
    ctx: TenantContext = Depends(require_tenant),
):
    ok = integration_service.delete_mapping(ctx.db, UUID(mapping_id), ctx.tenant_id, ctx.org_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Mapping not found")
    audit_record(
        ctx.db,
        tenant_id=ctx.tenant_id,
        organization_id=ctx.org_id,
        organization_name=ctx.organization.name,
        actor_id=str(ctx.user.id),
        actor_name=getattr(ctx.user, 'full_name', None) or getattr(ctx.user, 'name', None) or ctx.user.email,
        actor_email=ctx.user.email,
        action="settings.updated",
        resource_type="account_mapping",
        summary="Mapeo contable eliminado",
    )
    return {"status": "deleted"}


# ── Export Profiles ───────────────────────────────────────────


@router.get("/profiles")
async def list_profiles(
    ctx: TenantContext = Depends(require_tenant),
):
    user_profiles = integration_service.list_profiles(ctx.db, ctx.tenant_id, ctx.org_id)
    return {
        "presets": PRESET_PROFILES,
        "profiles": [p.to_dict() for p in user_profiles],
    }


@router.post("/profiles")
async def create_profile(
    body: ProfileCreate,
    ctx: TenantContext = Depends(require_tenant),
):
    profile = integration_service.save_profile(
        ctx.db,
        ctx.tenant_id,
        ctx.org_id,
        body.name,
        body.provider,
        body.config,
    )
    audit_record(
        ctx.db,
        tenant_id=ctx.tenant_id,
        organization_id=ctx.org_id,
        organization_name=ctx.organization.name,
        actor_id=str(ctx.user.id),
        actor_name=getattr(ctx.user, 'full_name', None) or getattr(ctx.user, 'name', None) or ctx.user.email,
        actor_email=ctx.user.email,
        action="settings.updated",
        resource_type="export_profile",
        summary=f"Perfil de exportación '{profile.name}' creado",
    )
    return profile.to_dict()


@router.put("/profiles/{profile_id}")
async def update_profile(
    profile_id: str,
    body: ProfileCreate,
    ctx: TenantContext = Depends(require_tenant),
):
    profile = integration_service.save_profile(
        ctx.db,
        ctx.tenant_id,
        ctx.org_id,
        body.name,
        body.provider,
        body.config,
        profile_id=UUID(profile_id),
    )
    audit_record(
        ctx.db,
        tenant_id=ctx.tenant_id,
        organization_id=ctx.org_id,
        organization_name=ctx.organization.name,
        actor_id=str(ctx.user.id),
        actor_name=getattr(ctx.user, 'full_name', None) or getattr(ctx.user, 'name', None) or ctx.user.email,
        actor_email=ctx.user.email,
        action="settings.updated",
        resource_type="export_profile",
        summary=f"Perfil de exportación '{profile.name}' actualizado",
    )
    return profile.to_dict()


@router.delete("/profiles/{profile_id}")
async def delete_profile(
    profile_id: str,
    ctx: TenantContext = Depends(require_tenant),
):
    profile = ctx.db.query(ExportProfile).filter(
        ExportProfile.id == UUID(profile_id),
        ExportProfile.tenant_id == ctx.tenant_id,
        ExportProfile.organization_id == ctx.org_id,
    ).first()
    profile_name = profile.name if profile else "Unknown"
    ok = integration_service.delete_profile(ctx.db, UUID(profile_id), ctx.tenant_id, ctx.org_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Profile not found")
    audit_record(
        ctx.db,
        tenant_id=ctx.tenant_id,
        organization_id=ctx.org_id,
        organization_name=ctx.organization.name,
        actor_id=str(ctx.user.id),
        actor_name=getattr(ctx.user, 'full_name', None) or getattr(ctx.user, 'name', None) or ctx.user.email,
        actor_email=ctx.user.email,
        action="settings.updated",
        resource_type="export_profile",
        summary=f"Perfil de exportación '{profile_name}' eliminado",
    )
    return {"status": "deleted"}


# ── Export ────────────────────────────────────────────────────


@router.post("/export")
async def export_invoices(
    body: ExportBody,
    ctx: TenantContext = Depends(require_tenant),
):
    invoices = invoice_repo.list_by_ids(ctx.db, body.invoice_ids, ctx.tenant_id, ctx.org_id)
    if not invoices:
        raise HTTPException(status_code=404, detail="No invoices found")

    mappings = integration_service.get_mappings(ctx.db, ctx.tenant_id, ctx.org_id, body.provider)

    content, filename, media_type = _render_export(body.provider, invoices, mappings)

    from fastapi.responses import StreamingResponse
    import io
    return StreamingResponse(
        io.BytesIO(content if isinstance(content, bytes) else content.encode("utf-8-sig")),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/export/bulk")
async def bulk_export(
    body: BulkExportBody,
    ctx: TenantContext = Depends(require_tenant),
):
    invoices = invoice_repo.list_for_dgii_export(
        db=ctx.db,
        tenant_id=ctx.tenant_id,
        org_id=ctx.org_id,
        transaction_type=None,
        date_from=datetime.strptime(body.date_from, "%Y-%m-%d") if body.date_from else None,
        date_to=datetime.strptime(body.date_to, "%Y-%m-%d") if body.date_to else None,
        processed_only=True,
    )
    if not invoices:
        raise HTTPException(status_code=404, detail="No invoices found for the given filters")

    mappings = integration_service.get_mappings(ctx.db, ctx.tenant_id, ctx.org_id, body.provider)

    content, filename, media_type = _render_export(body.provider, invoices, mappings)

    from fastapi.responses import StreamingResponse
    import io
    return StreamingResponse(
        io.BytesIO(content if isinstance(content, bytes) else content.encode("utf-8-sig")),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Render helpers ────────────────────────────────────────────


def _render_export(
    provider: str,
    invoices: List[Invoice],
    mappings: dict,
) -> tuple:
    timestamp = datetime.now().strftime("%Y%m%d%H%M")

    if provider == "quickbooks":
        content = export_service.export_quickbooks_bills(invoices)
        return content, f"quickbooks_bills_{timestamp}.csv", "text/csv; charset=utf-8"

    if provider == "odoo":
        content = export_service.export_odoo_vendor_bills(invoices)
        return content, f"odoo_bills_{timestamp}.csv", "text/csv; charset=utf-8"

    if provider == "xero":
        content = export_service.export_xero_bills(invoices)
        return content, f"xero_bills_{timestamp}.csv", "text/csv; charset=utf-8"

    if provider == "contaplus":
        content = export_service.export_contaplus(invoices)
        return content, f"contaplus_{timestamp}.csv", "text/csv; charset=utf-8"

    if provider == "csv":
        content = export_service.export_csv_generic(invoices)
        return content, f"export_{timestamp}.csv", "text/csv; charset=utf-8"

    if provider == "excel":
        content = export_service.export_excel_generic(invoices)
        return content, f"export_{timestamp}.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

    if provider == "json":
        content = export_service.export_json(invoices)
        return content, f"export_{timestamp}.json", "application/json"

    raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")
