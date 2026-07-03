from datetime import datetime
from typing import List, Optional
from uuid import UUID

from sqlalchemy import desc, or_, not_
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
                Invoice.is_deleted.is_(False),
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
                Invoice.is_deleted.is_(False),
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
        payment_status: Optional[str] = None,
        payment_condition: Optional[str] = None,
        status: Optional[str] = None,
        exclude_source_type: Optional[str] = None,
        include_drafts: bool = False,
    ) -> tuple[list[Invoice], int]:
        query = db.query(Invoice).filter(
            Invoice.tenant_id == tenant_id,
            Invoice.organization_id == org_id,
            Invoice.is_deleted.is_(False),
        )

        if exclude_source_type:
            query = query.filter(Invoice.source_type != exclude_source_type)

        if status:
            query = query.filter(Invoice.status == status)
        elif not include_drafts:
            query = query.filter(Invoice.status != "draft")

        if transaction_type:
            query = query.filter(Invoice.transaction_type == transaction_type)
        if category:
            query = query.filter(Invoice.category == category)
        if processed is not None:
            query = query.filter(Invoice.processed == processed)
        if payment_status:
            query = query.filter(Invoice.payment_status == payment_status)
        if payment_condition:
            query = query.filter(Invoice.payment_condition == payment_condition)
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
            # Any invoice that has at least one entry in audit_flags JSON array and hasn't been reviewed
            query = query.filter(
                Invoice.processed.is_(True),
                Invoice.audit_flags.isnot(None),
                Invoice.audit_flags != "[]",
                Invoice.audit_flags != "null",
                or_(
                    Invoice.raw_extracted_data.is_(None),
                    not_(Invoice.raw_extracted_data.like('%"warnings_reviewed": true%')),
                ),
            )
        elif quality == "has_duplicates":
            query = query.filter(Invoice.audit_flags.ilike("%COMPROBANTE DUPLICADO%"))
        elif quality == "no_ncf":
            query = query.filter(
                Invoice.processed.is_(True),
                or_(
                    Invoice.invoice_number.is_(None),
                    Invoice.invoice_number == "",
                ),
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
        elif quality == "cancelled":
            query = query.filter(Invoice.cancelled_at.isnot(None))
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
                Invoice.is_deleted.is_(False),
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
                Invoice.is_deleted.is_(False),
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
                Invoice.is_deleted.is_(False),
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
                Invoice.is_deleted.is_(False),
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
                Invoice.is_deleted.is_(False),
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
            Invoice.is_deleted.is_(True),
        )
        total = query.count()
        invoices = query.order_by(desc(Invoice.deleted_at)).offset(skip).limit(limit).all()
        return invoices, total

    def hard_delete(self, db: Session, invoice: Invoice) -> None:
        db.delete(invoice)
        db.commit()

    def list_for_dgii_export(
        self,
        db: Session,
        tenant_id: UUID,
        org_id: UUID,
        transaction_type: Optional[str] = None,  # 'expense' | 'income'
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        categories: Optional[List[str]] = None,
        goods_types: Optional[List[str]] = None,  # ['01', '07', ...]
        vendor_search: Optional[str] = None,
        source_types: Optional[List[str]] = None,  # ['xml', 'pdf_text', ...]
        processed_only: bool = True,  # Por defecto solo procesadas
        include_no_ncf: bool = False,  # Incluir sin NCF
        invoice_ids: Optional[List[str]] = None,  # Override explícito de IDs
    ) -> List[Invoice]:
        """Query flexible para exportaciones DGII. Sin paginación — devuelve todos
        los registros que cumplan los criterios, ordenados por fecha de factura."""
        query = db.query(Invoice).filter(
            Invoice.tenant_id == tenant_id,
            Invoice.organization_id == org_id,
            Invoice.is_deleted.is_(False),
            Invoice.cancelled_at.is_(None),
            Invoice.status != "draft",
        )

        # Override: IDs explícitos tienen prioridad máxima
        if invoice_ids:
            query = query.filter(Invoice.id.in_(invoice_ids))
            return query.order_by(Invoice.invoice_date.asc()).all()

        if transaction_type:
            query = query.filter(Invoice.transaction_type == transaction_type)

        if date_from:
            if date_from.tzinfo is None:
                from datetime import timezone
                date_from = date_from.replace(tzinfo=timezone.utc)
            query = query.filter(Invoice.created_at >= date_from)

        if date_to:
            # Inclusivo hasta el final del día
            end_of_day = date_to.replace(hour=23, minute=59, second=59)
            if end_of_day.tzinfo is None:
                from datetime import timezone
                end_of_day = end_of_day.replace(tzinfo=timezone.utc)
            query = query.filter(Invoice.created_at <= end_of_day)

        if categories:
            query = query.filter(Invoice.category.in_(categories))

        if goods_types:
            query = query.filter(Invoice.goods_services_type.in_(goods_types))

        if vendor_search:
            pattern = f"%{vendor_search}%"
            query = query.filter(
                or_(
                    Invoice.vendor_name.ilike(pattern),
                    Invoice.vendor_tax_id.ilike(pattern),
                )
            )

        if source_types:
            resolved_sources = []
            for st in source_types:
                resolved_sources.append(st)
                if st == "xml":
                    resolved_sources.append("ecf")
            query = query.filter(Invoice.source_type.in_(resolved_sources))

        if processed_only:
            query = query.filter(Invoice.processed.is_(True))

        if not include_no_ncf:
            # Para reportes DGII excluimos las que no tienen NCF por defecto
            # (el caller puede sobreescribir esto para el 608)
            pass  # No filtrar aquí — dejar que el endpoint decida

        return query.order_by(Invoice.invoice_date.asc().nullslast()).all()

    def count_by_period(
        self,
        db: Session,
        tenant_id: UUID,
        org_id: UUID,
        transaction_type: Optional[str] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
    ) -> dict:
        """Devuelve conteos rápidos para el summary del período DGII."""
        query = db.query(Invoice).filter(
            Invoice.tenant_id == tenant_id,
            Invoice.organization_id == org_id,
            Invoice.is_deleted.is_(False),
            Invoice.processed.is_(True),
            Invoice.status != "draft",
        )
        if transaction_type:
            query = query.filter(Invoice.transaction_type == transaction_type)
        if date_from:
            if date_from.tzinfo is None:
                from datetime import timezone
                date_from = date_from.replace(tzinfo=timezone.utc)
            query = query.filter(Invoice.created_at >= date_from)
        if date_to:
            if date_to.tzinfo is None:
                from datetime import timezone
                date_to = date_to.replace(tzinfo=timezone.utc)
            query = query.filter(Invoice.created_at <= date_to)

        all_invoices = query.all()
        total = len(all_invoices)

        missing_ncf = sum(1 for inv in all_invoices if not (inv.invoice_number or "").strip())
        missing_rnc = sum(1 for inv in all_invoices if not (inv.vendor_tax_id or "").strip())
        missing_goods_type = sum(1 for inv in all_invoices if not (inv.goods_services_type or "").strip())
        complete = sum(
            1
            for inv in all_invoices
            if (inv.invoice_number or "").strip()
            and (inv.vendor_tax_id or "").strip()
            and (inv.goods_services_type or "").strip()
        )

        total_amount = sum(inv.total_amount or 0 for inv in all_invoices)
        total_tax = sum(inv.tax_amount or 0 for inv in all_invoices)

        return {
            "total": total,
            "complete": complete,
            "missing_ncf": missing_ncf,
            "missing_rnc": missing_rnc,
            "missing_goods_type": missing_goods_type,
            "issues": total - complete,
            "total_amount": round(total_amount, 2),
            "total_tax": round(total_tax, 2),
        }
