"""
Legacy tenancy helpers — used only by bootstrap and evolution webhook.
For all authenticated endpoints, use app.dependencies.tenant.TenantContext instead.
"""

import re

from sqlalchemy.orm import Session

from app.config import ORG_COUNTRY, ORG_NAME, ORG_TAX_ID, TENANT_PLAN
from app.models import Organization, Tenant


def slugify(text: str) -> str:
    """Generate a URL-friendly slug from text."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    return text[:63]


def get_default_tenant(db: Session) -> Tenant:
    """Get or create the default tenant. Used only during bootstrap."""
    tenant = db.query(Tenant).filter(Tenant.slug == "default").first()
    if not tenant:
        tenant = Tenant(name="Default Tenant", slug="default", plan=TENANT_PLAN)
        db.add(tenant)
        db.commit()
        db.refresh(tenant)
    return tenant


def get_default_org(db: Session, tenant_id) -> Organization:
    """Get or create the default org within a tenant. Used only during bootstrap."""
    org = (
        db.query(Organization)
        .filter(
            Organization.tenant_id == tenant_id,
        )
        .first()
    )
    if not org:
        org = Organization(
            tenant_id=tenant_id,
            name=ORG_NAME,
            tax_id=ORG_TAX_ID,
            country=ORG_COUNTRY,
        )
        db.add(org)
        db.commit()
        db.refresh(org)
    return org


def get_company_context(org: Organization) -> dict:
    """Build the template context dict for a given organization."""
    return {
        "company_name": org.name,
        "company_tax_id": org.tax_id or "",
        "company_country": org.country or "",
    }
