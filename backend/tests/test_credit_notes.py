"""Tests for unified credit/debit notes as Invoice modificatories.

Credit and debit notes are now Invoices with:
  - ecf_type "34" (crédito) / "33" (débito) — or NCF prefix B04/E34 / B03/E33
  - parent_invoice_id → FK to parent Invoice
  - modified_ncf → NCF of the parent
  - modification_reason → DGII 2-char reason code
"""

from uuid import uuid4

import pytest

from app.database import SessionLocal
from app.models import Invoice
from app.utils.dates import utc_now


@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def test_invoice(db_session, test_tenant, test_org):
    inv = Invoice(
        tenant_id=test_tenant.id,
        organization_id=test_org.id,
        invoice_number=f"INV-{uuid4().hex[:8].upper()}",
        vendor_name="ACME SRL",
        vendor_tax_id="131000111",
        invoice_date=utc_now().date(),
        total_amount=1176.00,
        tax_amount=176.00,
        currency="DOP",
        transaction_type="expense",
        status="verified",
        processed=True,
        is_electronic=True,
        ecf_type="31",
    )
    db_session.add(inv)
    db_session.commit()
    db_session.refresh(inv)
    return inv


def _make_modificatory_kwargs(test_tenant, test_org, **overrides):
    base = {
        "tenant_id": test_tenant.id,
        "organization_id": test_org.id,
        "invoice_number": f"E34{uuid4().hex[:10].upper()}",
        "ecf_type": "34",
        "is_electronic": True,
        "invoice_date": utc_now(),
        "modified_ncf": f"E31{uuid4().hex[:10].upper()}",
        "total_amount": -100.00,
        "tax_amount": -16.00,
        "currency": "DOP",
        "vendor_name": "ACME SRL",
        "vendor_tax_id": "131000111",
        "status": "verified",
        "transaction_type": "expense",
    }
    base.update(overrides)
    return base


# ── Property tests ──────────────────────────────────────────────────────────


def test_invoice_has_parent_invoice_id_column(test_tenant, test_org):
    cols = {c.name for c in Invoice.__table__.columns}
    assert "parent_invoice_id" in cols
    assert "modified_ncf" in cols
    assert "modification_reason" in cols


def test_is_modificatory_true_for_credit_note():
    inv = Invoice(ecf_type="34", is_electronic=True, total_amount=-100.0)
    assert inv.is_modificatory is True


def test_is_modificatory_true_for_debit_note():
    inv = Invoice(ecf_type="33", is_electronic=True, total_amount=100.0)
    assert inv.is_modificatory is True


def test_is_modificatory_false_for_regular_invoice():
    inv = Invoice(ecf_type="31", is_electronic=True, total_amount=1000.0)
    assert inv.is_modificatory is False


def test_modificatory_sign_credit():
    inv = Invoice(ecf_type="34", is_electronic=True, total_amount=-100.0)
    assert inv.modificatory_sign == -1


def test_modificatory_sign_debit():
    inv = Invoice(ecf_type="33", is_electronic=True, total_amount=100.0)
    assert inv.modificatory_sign == 1


def test_modificatory_sign_normal():
    inv = Invoice(ecf_type="31", is_electronic=True, total_amount=1000.0)
    assert inv.modificatory_sign == 0


def test_modificatory_sign_via_ncf_prefix_b04():
    inv = Invoice(invoice_number="B0400000001", ecf_type=None, total_amount=-100.0)
    assert inv.modificatory_sign == -1
    assert inv.is_modificatory is True


def test_modificatory_sign_via_ncf_prefix_b03():
    inv = Invoice(invoice_number="B0300000001", ecf_type=None, total_amount=100.0)
    assert inv.modificatory_sign == 1


def test_modificatory_sign_via_ncf_prefix_e34():
    inv = Invoice(invoice_number="E340000000001", ecf_type=None, total_amount=-50.0)
    assert inv.modificatory_sign == -1


def test_modificatory_sign_via_ncf_prefix_e33():
    inv = Invoice(invoice_number="E330000000001", ecf_type=None, total_amount=50.0)
    assert inv.modificatory_sign == 1


# ── Parent-child relationship ────────────────────────────────────────────────


def test_modificatory_linked_to_parent(db_session, test_tenant, test_org, test_invoice):
    mod = Invoice(
        **_make_modificatory_kwargs(
            test_tenant, test_org,
            parent_invoice_id=test_invoice.id,
        )
    )
    db_session.add(mod)
    db_session.commit()
    db_session.refresh(mod)

    db_session.refresh(test_invoice)
    assert mod.parent_invoice_id == test_invoice.id
    assert mod.parent_invoice.invoice_number == test_invoice.invoice_number
    assert mod.id in {c.id for c in test_invoice.child_invoices}


def test_modificatory_to_dict_includes_fields(db_session, test_tenant, test_org, test_invoice):
    mod = Invoice(
        **_make_modificatory_kwargs(
            test_tenant, test_org,
            parent_invoice_id=test_invoice.id,
            modification_reason="01",
        )
    )
    db_session.add(mod)
    db_session.commit()
    db_session.refresh(mod)

    d = mod.to_dict()
    assert d["parent_invoice_id"] == str(test_invoice.id)
    assert d["modified_ncf"] == mod.modified_ncf
    assert d["modification_reason"] == "01"
    assert d["is_modificatory"] is True
    assert d["modificatory_sign"] == -1


def test_parent_invoice_to_dict_includes_child_modificatories(db_session, test_tenant, test_org, test_invoice):
    mod = Invoice(
        **_make_modificatory_kwargs(
            test_tenant, test_org,
            parent_invoice_id=test_invoice.id,
        )
    )
    db_session.add(mod)
    db_session.commit()

    d = test_invoice.to_dict()
    assert "child_modificatories" in d
    assert len(d["child_modificatories"]) >= 1
    child = d["child_modificatories"][0]
    assert child["id"] == str(mod.id)
    assert child["modificatory_sign"] in (-1, 1)
    assert child["total_amount"] is not None


def test_soft_delete_excludes_modificatories_from_query(db_session, test_tenant, test_org, test_invoice):
    mod = Invoice(
        **_make_modificatory_kwargs(
            test_tenant, test_org,
            parent_invoice_id=test_invoice.id,
        )
    )
    db_session.add(mod)
    db_session.commit()

    mod.is_deleted = True
    mod.deleted_at = utc_now()
    db_session.commit()

    visible = db_session.query(Invoice).filter(
        Invoice.tenant_id == test_tenant.id,
        Invoice.organization_id == test_org.id,
        Invoice.is_deleted.is_(False),
    ).all()
    assert all(i.id != mod.id for i in visible)
