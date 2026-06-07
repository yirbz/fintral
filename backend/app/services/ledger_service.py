import logging
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.invoice import Invoice
from app.models.ledger_entry import LedgerEntry

logger = logging.getLogger(__name__)


def record_modificatory_reversal(
    db: Session,
    *,
    tenant_id: UUID,
    organization_id: UUID,
    modificatory: Invoice,
    user_id: Optional[UUID] = None,
) -> LedgerEntry:
    """Create a debit LedgerEntry that reverses the original invoice's credit.

    The modificatory invoice itself is the source of the reversal.
    If linked to a parent invoice, it points back to any existing LedgerEntry.
    """
    amount = abs(Decimal(str(modificatory.total_amount or 0)))
    doc_type = "Nota de Crédito" if modificatory.modificatory_sign < 0 else "Nota de Débito"
    description = (
        f"Reversión por {doc_type} {modificatory.invoice_number or ''}"
        f" ({modificatory.modification_reason or doc_type})"
    ).strip()

    reversal_of: Optional[UUID] = None
    parent_invoice_id: Optional[UUID] = modificatory.parent_invoice_id

    if parent_invoice_id:
        parent_entry = (
            db.query(LedgerEntry)
            .filter(
                LedgerEntry.invoice_id == parent_invoice_id,
                LedgerEntry.is_reversal.is_(False),
                LedgerEntry.entry_type == "credit",
            )
            .order_by(LedgerEntry.created_at.desc())
            .first()
        )
        if parent_entry:
            reversal_of = parent_entry.id

    entry = LedgerEntry(
        tenant_id=tenant_id,
        organization_id=organization_id,
        invoice_id=parent_invoice_id,
        modificatory_invoice_id=modificatory.id,
        entry_type="debit",
        amount=amount,
        currency=modificatory.currency or "DOP",
        description=description,
        reversal_of=reversal_of,
        is_reversal=True,
        created_by=user_id,
    )
    db.add(entry)
    db.flush()
    return entry
