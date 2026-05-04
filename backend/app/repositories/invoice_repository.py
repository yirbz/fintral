from typing import Optional
from uuid import UUID

from sqlalchemy import desc, or_
from sqlalchemy.orm import Session

from app.models import Invoice


class InvoiceRepository:
    def get(self, db: Session, invoice_id: UUID, tenant_id: UUID, org_id: UUID) -> Optional[Invoice]:
        return (
            db.query(Invoice)
            .filter(
                Invoice.id == invoice_id,
                Invoice.tenant_id == tenant_id,
                Invoice.organization_id == org_id,
            )
            .first()
        )

    def get_with_lock(self, db: Session, invoice_id: UUID, tenant_id: UUID, org_id: UUID) -> Optional[Invoice]:
        return (
            db.query(Invoice)
            .filter(
                Invoice.id == invoice_id,
                Invoice.tenant_id == tenant_id,
                Invoice.organization_id == org_id,
            )
            .with_for_update()
            .first()
        )

    def list_for_org(
        self,
        db: Session,
        tenant_id: UUID,
        org_id: UUID,
        skip: int = 0,
        limit: int = 100,
        transaction_type: Optional[str] = None,
        category: Optional[str] = None,
        search: Optional[str] = None,
        processed: Optional[bool] = None,
    ) -> tuple[list[Invoice], int]:
        query = db.query(Invoice).filter(
            Invoice.tenant_id == tenant_id,
            Invoice.organization_id == org_id,
        )

        if transaction_type:
            query = query.filter(Invoice.transaction_type == transaction_type)
        if category:
            query = query.filter(Invoice.category == category)
        if processed is not None:
            query = query.filter(Invoice.processed == processed)
        if search:
            pattern = f"%{search}%"
            query = query.filter(
                or_(
                    Invoice.vendor_name.ilike(pattern),
                    Invoice.invoice_number.ilike(pattern),
                    Invoice.description.ilike(pattern),
                )
            )

        total = query.count()
        invoices = query.order_by(desc(Invoice.created_at)).offset(skip).limit(limit).all()
        return invoices, total

    def list_by_ids(self, db: Session, invoice_ids: list[UUID], tenant_id: UUID, org_id: UUID) -> list[Invoice]:
        return (
            db.query(Invoice)
            .filter(
                Invoice.id.in_(invoice_ids),
                Invoice.tenant_id == tenant_id,
                Invoice.organization_id == org_id,
            )
            .all()
        )

    def list_pending_by_ids(self, db: Session, invoice_ids: list[UUID], tenant_id: UUID, org_id: UUID) -> list[Invoice]:
        return (
            db.query(Invoice)
            .filter(
                Invoice.id.in_(invoice_ids),
                Invoice.tenant_id == tenant_id,
                Invoice.organization_id == org_id,
                Invoice.processed.is_(False),
            )
            .all()
        )

    def create(self, db: Session, invoice: Invoice) -> Invoice:
        db.add(invoice)
        db.commit()
        db.refresh(invoice)
        return invoice

    def find_duplicate_processed(
        self,
        db: Session,
        tenant_id: UUID,
        org_id: UUID,
        invoice_number: str,
        vendor_name: str,
        exclude_invoice_id: UUID,
    ) -> Optional[Invoice]:
        return (
            db.query(Invoice)
            .filter(
                Invoice.invoice_number == invoice_number,
                Invoice.vendor_name == vendor_name,
                Invoice.id != exclude_invoice_id,
                Invoice.processed.is_(True),
                Invoice.tenant_id == tenant_id,
                Invoice.organization_id == org_id,
            )
            .first()
        )

    def list_distinct_categories(self, db: Session, tenant_id: UUID, org_id: UUID) -> list[str]:
        categories = (
            db.query(Invoice.category)
            .filter(
                Invoice.category.isnot(None),
                Invoice.tenant_id == tenant_id,
                Invoice.organization_id == org_id,
            )
            .distinct()
            .all()
        )
        return [cat[0] for cat in categories if cat and cat[0]]
