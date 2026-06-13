import pytest
from app.models import Invoice
from app.routers.invoices import _expected_dgii_format

def test_expected_dgii_format_physical():
    # Physical expenses should always be 606
    inv_expense = Invoice(is_electronic=False, transaction_type="expense")
    assert _expected_dgii_format(inv_expense, is_ecf_authorized=False) == "606"
    assert _expected_dgii_format(inv_expense, is_ecf_authorized=True) == "606"

    # Physical income should always be 607
    inv_income = Invoice(is_electronic=False, transaction_type="income")
    assert _expected_dgii_format(inv_income, is_ecf_authorized=False) == "607"
    assert _expected_dgii_format(inv_income, is_ecf_authorized=True) == "607"

    # Physical cancelled income should always be 608
    from datetime import datetime
    inv_cancelled = Invoice(
        is_electronic=False,
        transaction_type="income",
        cancelled_at=datetime.utcnow()
    )
    assert _expected_dgii_format(inv_cancelled, is_ecf_authorized=False) == "608"
    assert _expected_dgii_format(inv_cancelled, is_ecf_authorized=True) == "608"

def test_expected_dgii_format_electronic_expense():
    # Electronic expense for non-electronic issuer -> should return 606
    inv_elec_expense = Invoice(is_electronic=True, transaction_type="expense")
    assert _expected_dgii_format(inv_elec_expense, is_ecf_authorized=False) == "606"

    # Electronic expense for electronic issuer -> should return None
    assert _expected_dgii_format(inv_elec_expense, is_ecf_authorized=True) is None

def test_expected_dgii_format_electronic_income():
    # Electronic income for non-electronic issuer -> should return None
    inv_elec_income = Invoice(is_electronic=True, transaction_type="income")
    assert _expected_dgii_format(inv_elec_income, is_ecf_authorized=False) is None

    # Electronic income for electronic issuer -> should return None
    assert _expected_dgii_format(inv_elec_income, is_ecf_authorized=True) is None
