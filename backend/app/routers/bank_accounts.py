from typing import List
from fastapi import APIRouter, Depends
from app.dependencies.tenant import TenantContext, require_tenant
from app.models import BankAccount, Invoice
from app.schemas.requests import BankAccountBulkSyncRequest

router = APIRouter()


@router.get("/api/bank-accounts", response_model=List[dict])
async def get_bank_accounts(ctx: TenantContext = Depends(require_tenant)):
    accounts = (
        ctx.db.query(BankAccount)
        .filter(
            BankAccount.tenant_id == ctx.tenant_id,
            BankAccount.organization_id == ctx.org_id,
        )
        .all()
    )

    if not accounts:
        # On-demand seeding of default accounts
        popular = BankAccount(
            tenant_id=ctx.tenant_id,
            organization_id=ctx.org_id,
            name="Banco Popular",
            balance=0.00,
        )
        bhd = BankAccount(
            tenant_id=ctx.tenant_id,
            organization_id=ctx.org_id,
            name="BHD León",
            balance=0.00,
        )
        ctx.db.add(popular)
        ctx.db.add(bhd)
        ctx.db.commit()
        ctx.db.refresh(popular)
        ctx.db.refresh(bhd)
        accounts = [popular, bhd]

    return [acc.to_dict() for acc in accounts]


@router.get("/api/bank-accounts/summary")
async def get_bank_accounts_summary(ctx: TenantContext = Depends(require_tenant)):
    accounts = (
        ctx.db.query(BankAccount)
        .filter(
            BankAccount.tenant_id == ctx.tenant_id,
            BankAccount.organization_id == ctx.org_id,
        )
        .all()
    )
    total_balance = sum(float(acc.balance or 0.0) for acc in accounts)

    # Cuentas por cobrar: income invoices not yet paid
    ar_invoices = (
        ctx.db.query(Invoice)
        .filter(
            Invoice.tenant_id == ctx.tenant_id,
            Invoice.organization_id == ctx.org_id,
            Invoice.transaction_type == "income",
            Invoice.payment_status != "paid",
            Invoice.deleted_at.is_(None),
        )
        .all()
    )
    total_ar = sum(inv.total_amount or 0.0 for inv in ar_invoices)

    # Cuentas por pagar: expense invoices not yet paid
    ap_invoices = (
        ctx.db.query(Invoice)
        .filter(
            Invoice.tenant_id == ctx.tenant_id,
            Invoice.organization_id == ctx.org_id,
            Invoice.transaction_type == "expense",
            Invoice.payment_status != "paid",
            Invoice.deleted_at.is_(None),
        )
        .all()
    )
    total_ap = sum(inv.total_amount or 0.0 for inv in ap_invoices)

    capital_neto = total_balance + total_ar - total_ap

    return {
        "total_balance": total_balance,
        "total_ar": total_ar,
        "total_ap": total_ap,
        "capital_neto": capital_neto,
        "accounts": [acc.to_dict() for acc in accounts],
        "recent_ar": [
            inv.to_dict() for inv in sorted(
                ar_invoices,
                key=lambda i: i.created_at or i.updated_at or i.invoice_date or i.id,
                reverse=True,
            )[:5]
        ],
        "recent_ap": [
            inv.to_dict() for inv in sorted(
                ap_invoices,
                key=lambda i: i.created_at or i.updated_at or i.invoice_date or i.id,
                reverse=True,
            )[:5]
        ],
    }


@router.post("/api/bank-accounts/bulk", response_model=List[dict])
async def bulk_sync_bank_accounts(
    payload: BankAccountBulkSyncRequest,
    ctx: TenantContext = Depends(require_tenant),
):
    # Fetch existing bank accounts
    existing_accounts = (
        ctx.db.query(BankAccount)
        .filter(
            BankAccount.tenant_id == ctx.tenant_id,
            BankAccount.organization_id == ctx.org_id,
        )
        .all()
    )
    existing_by_id = {acc.id: acc for acc in existing_accounts}
    existing_by_name = {acc.name.lower().strip(): acc for acc in existing_accounts}

    incoming_ids = set()
    updated_or_created = []

    for item in payload.accounts:
        acc = None
        if item.id and item.id in existing_by_id:
            # Match by ID
            acc = existing_by_id[item.id]
        elif item.name.lower().strip() in existing_by_name:
            # Match by name fallback
            acc = existing_by_name[item.name.lower().strip()]

        if acc:
            acc.name = item.name
            acc.balance = item.balance
            incoming_ids.add(acc.id)
            updated_or_created.append(acc)
        else:
            # Create new
            new_acc = BankAccount(
                tenant_id=ctx.tenant_id,
                organization_id=ctx.org_id,
                name=item.name,
                balance=item.balance,
            )
            ctx.db.add(new_acc)
            # We flush to get the ID generated
            ctx.db.flush()
            incoming_ids.add(new_acc.id)
            updated_or_created.append(new_acc)

    # Delete accounts not in incoming payload
    for acc in existing_accounts:
        if acc.id not in incoming_ids:
            ctx.db.delete(acc)

    ctx.db.commit()

    # Refresh updated items to ensure database sync
    for item in updated_or_created:
        ctx.db.refresh(item)

    return [acc.to_dict() for acc in updated_or_created]
