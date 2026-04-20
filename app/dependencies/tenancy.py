from typing import Optional

from sqlalchemy.orm import Session

from app.models import Organization, User


def get_default_org(db: Session) -> Organization:
    org = db.query(Organization).first()
    if not org:
        org = Organization(name="Mi Empresa S.A.", tax_id="", plan="Free Plan")
        db.add(org)
        db.commit()
        db.refresh(org)
    return org


def get_org_id(user: Optional[User], db: Session) -> int:
    if user and user.organization_id:
        return user.organization_id
    return get_default_org(db).id


def get_company_context(db: Session, user: Optional[User]) -> dict:
    org = db.query(Organization).filter(Organization.id == get_org_id(user, db)).first()
    if not org:
        org = get_default_org(db)
    return {
        "company_name": org.name or "Mi Empresa S.A.",
        "company_tax_id": org.tax_id or "",
        "company_plan": org.plan or "Free Plan",
    }
