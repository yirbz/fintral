import json
import logging
from typing import Dict, List, Optional, Tuple
from uuid import UUID

from sqlalchemy.orm import Session

from app.models import AccountMapping, ExportProfile, Invoice

logger = logging.getLogger(__name__)

EXPORT_EVENTS = {
    "csv": "invoices.exported.csv",
    "excel": "invoices.exported.excel",
    "json": "invoices.exported.json",
    "quickbooks": "invoices.exported.quickbooks",
    "odoo": "invoices.exported.odoo",
    "xero": "invoices.exported.xero",
    "contaplus": "invoices.exported.contaplus",
}


class IntegrationExportService:
    """Export service that integrates with ExportService for file generation.

    Adds:
    - Account mappings (category → external account code)
    - Export profiles (saved column/filter configs)
    - Provider-aware column configuration
    """

    def get_mappings(
        self, db: Session, tenant_id: UUID, org_id: UUID, provider: str
    ) -> Dict[str, Tuple[str, str]]:
        rows = (
            db.query(AccountMapping)
            .filter(
                AccountMapping.tenant_id == tenant_id,
                AccountMapping.organization_id == org_id,
                AccountMapping.provider == provider,
            )
            .all()
        )
        return {row.category: (row.account_code, row.account_label or row.account_code) for row in rows}

    def apply_mappings(
        self, invoices: List[Invoice], mappings: Dict[str, Tuple[str, str]]
    ) -> Dict[str, Tuple[str, str]]:
        """Returns category → (code, label) resolution for a set of invoices."""
        resolved: Dict[str, Tuple[str, str]] = {}
        for inv in invoices:
            cat = (inv.category or "Uncategorized").strip()
            if cat not in resolved:
                resolved[cat] = mappings.get(cat, ("", cat))
        return resolved

    def list_profiles(
        self, db: Session, tenant_id: UUID, org_id: UUID
    ) -> List[ExportProfile]:
        return (
            db.query(ExportProfile)
            .filter(
                ExportProfile.tenant_id == tenant_id,
                ExportProfile.organization_id == org_id,
            )
            .order_by(ExportProfile.name)
            .all()
        )

    def get_profile(
        self, db: Session, profile_id: UUID, tenant_id: UUID, org_id: UUID
    ) -> Optional[ExportProfile]:
        return (
            db.query(ExportProfile)
            .filter(
                ExportProfile.id == profile_id,
                ExportProfile.tenant_id == tenant_id,
                ExportProfile.organization_id == org_id,
            )
            .first()
        )

    def save_profile(
        self,
        db: Session,
        tenant_id: UUID,
        org_id: UUID,
        name: str,
        provider: str,
        config: dict,
        profile_id: Optional[UUID] = None,
    ) -> ExportProfile:
        if profile_id:
            profile = self.get_profile(db, profile_id, tenant_id, org_id)
            if not profile:
                raise ValueError("Profile not found")
            profile.name = name
            profile.provider = provider
            profile.config = json.dumps(config)
        else:
            profile = ExportProfile(
                tenant_id=tenant_id,
                organization_id=org_id,
                name=name,
                provider=provider,
                config=json.dumps(config),
            )
            db.add(profile)
        db.commit()
        db.refresh(profile)
        return profile

    def delete_profile(
        self, db: Session, profile_id: UUID, tenant_id: UUID, org_id: UUID
    ) -> bool:
        profile = self.get_profile(db, profile_id, tenant_id, org_id)
        if not profile:
            return False
        db.delete(profile)
        db.commit()
        return True

    def resolve_account_code(
        self, mappings: Dict[str, Tuple[str, str]], category: Optional[str]
    ) -> str:
        cat = (category or "Uncategorized").strip()
        code, _ = mappings.get(cat, ("", cat))
        return code

    def save_mappings(
        self,
        db: Session,
        tenant_id: UUID,
        org_id: UUID,
        provider: str,
        entries: List[Dict[str, str]],
    ):
        existing = (
            db.query(AccountMapping)
            .filter(
                AccountMapping.tenant_id == tenant_id,
                AccountMapping.organization_id == org_id,
                AccountMapping.provider == provider,
            )
            .all()
        )
        existing_map = {r.category: r for r in existing}

        for entry in entries:
            cat = entry.get("category", "").strip()
            code = entry.get("account_code", "").strip()
            label = entry.get("account_label", "").strip() or None
            if not cat or not code:
                continue

            if cat in existing_map:
                existing_map[cat].account_code = code
                existing_map[cat].account_label = label
            else:
                mapping = AccountMapping(
                    tenant_id=tenant_id,
                    organization_id=org_id,
                    provider=provider,
                    category=cat,
                    account_code=code,
                    account_label=label,
                )
                db.add(mapping)

        db.commit()

    def list_mappings(
        self, db: Session, tenant_id: UUID, org_id: UUID, provider: str
    ) -> List[AccountMapping]:
        return (
            db.query(AccountMapping)
            .filter(
                AccountMapping.tenant_id == tenant_id,
                AccountMapping.organization_id == org_id,
                AccountMapping.provider == provider,
            )
            .order_by(AccountMapping.category)
            .all()
        )

    def delete_mapping(
        self, db: Session, mapping_id: UUID, tenant_id: UUID, org_id: UUID
    ) -> bool:
        mapping = (
            db.query(AccountMapping)
            .filter(
                AccountMapping.id == mapping_id,
                AccountMapping.tenant_id == tenant_id,
                AccountMapping.organization_id == org_id,
            )
            .first()
        )
        if not mapping:
            return False
        db.delete(mapping)
        db.commit()
        return True


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
