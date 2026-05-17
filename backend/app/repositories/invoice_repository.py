from typing import Optional
from uuid import UUID

from sqlalchemy import desc, or_, text
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
                Invoice.deleted_at.is_(None),
            )
            .first()
        )

    def get_including_trashed(self, db: Session, invoice_id: UUID, tenant_id: UUID, org_id: UUID) -> Optional[Invoice]:
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
                Invoice.deleted_at.is_(None),
            )
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
        quality: Optional[str] = None,
    ) -> tuple[list[Invoice], int]:
        query = db.query(Invoice).filter(
            Invoice.tenant_id == tenant_id,
            Invoice.organization_id == org_id,
            Invoice.deleted_at.is_(None),
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

        # Quality / health filters
        if quality == "with_warnings":
            # Any invoice that has at least one entry in audit_flags JSON array
            query = query.filter(
                Invoice.processed.is_(True),
                Invoice.audit_flags.isnot(None),
                Invoice.audit_flags != "[]",
                Invoice.audit_flags != "null",
            )
        elif quality == "has_duplicates":
            query = query.filter(
                Invoice.audit_flags.ilike("%COMPROBANTE DUPLICADO%")
            )
        elif quality == "no_ncf":
            query = query.filter(
                Invoice.processed.is_(True),
                or_(
                    Invoice.invoice_number.is_(None),
                    Invoice.invoice_number == "",
                )
            )
        elif quality == "low_confidence":
            query = query.filter(
                Invoice.processed.is_(True),
                Invoice.confidence_score.isnot(None),
                Invoice.confidence_score < 0.6,
            )
        elif quality == "high_confidence":
            query = query.filter(
                Invoice.processed.is_(True),
                Invoice.confidence_score.isnot(None),
                Invoice.confidence_score >= 0.85,
            )
        elif quality == "pending":
            query = query.filter(Invoice.processed.is_(False))

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
                Invoice.deleted_at.is_(None),
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
                Invoice.deleted_at.is_(None),
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
                Invoice.deleted_at.is_(None),
            )
            .first()
        )

    def find_by_ncf(
        self,
        db: Session,
        tenant_id: UUID,
        org_id: UUID,
        invoice_number: str,
        exclude_invoice_id: UUID,
    ) -> Optional[Invoice]:
        """Find any active invoice with the same NCF/e-NCF number.

        The fiscal rule (DGII) is that a Número de Comprobante Fiscal is
        unique per emission — regardless of vendor. This method enforces
        that constraint scoped to the tenant+org pair.
        """
        return (
            db.query(Invoice)
            .filter(
                Invoice.invoice_number == invoice_number,
                Invoice.id != exclude_invoice_id,
                Invoice.tenant_id == tenant_id,
                Invoice.organization_id == org_id,
                Invoice.deleted_at.is_(None),
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
                Invoice.deleted_at.is_(None),
            )
            .distinct()
            .all()
        )
        return [cat[0] for cat in categories if cat and cat[0]]

    def list_trashed(
        self,
        db: Session,
        tenant_id: UUID,
        org_id: UUID,
        skip: int = 0,
        limit: int = 100,
    ) -> tuple[list[Invoice], int]:
        query = db.query(Invoice).filter(
            Invoice.tenant_id == tenant_id,
            Invoice.organization_id == org_id,
            Invoice.deleted_at.isnot(None),
        )
        total = query.count()
        invoices = query.order_by(desc(Invoice.deleted_at)).offset(skip).limit(limit).all()
        return invoices, total

    def hard_delete(self, db: Session, invoice: Invoice) -> None:
        db.delete(invoice)
        db.commit()
