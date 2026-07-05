"""
One-off: restore tax_amount=0 for invoices corrupted by old _fix_itbis_in_db.

The old code assumed all invoices have 18% ITBIS and overwrote stored values.
This script detects such corruption by checking:
  - tax_amount > 0  AND
  - abs(tax_amount - total * 18/118) <= 0.02  (matches old fix formula)  AND
  - raw_extracted_data.json.tax_amount == 0 or null/absent  (originally 0%)

Usage:
  cd backend && python scripts/restore_zero_itbis.py [--dry-run]
"""

import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database import SessionLocal
from app.models.invoice import Invoice

ITBIS_RATE_18 = 0.18
TOLERANCE = 0.02


def find_corrupted(db):
    invoices = (
        db.query(Invoice)
        .filter(
            Invoice.tax_amount > 0,
            Invoice.total_amount > 0,
            Invoice.total_amount.isnot(None),
        )
        .all()
    )

    corrupted = []
    for inv in invoices:
        expected = round(inv.total_amount * ITBIS_RATE_18 / (1 + ITBIS_RATE_18), 2)
        if abs(inv.tax_amount - expected) > TOLERANCE:
            continue

        try:
            raw = json.loads(inv.raw_extracted_data) if inv.raw_extracted_data else {}
        except (json.JSONDecodeError, TypeError):
            raw = {}

        raw_tax = raw.get("tax_amount")
        if raw_tax in (0, 0.0, "0", "0.0", None, "", "null"):
            corrupted.append(inv)

    return corrupted


def restore(dry_run: bool = True):
    db = SessionLocal()
    try:
        corrupted = find_corrupted(db)
        if not corrupted:
            print("No corrupted invoices found.")
            return

        print(f"Found {len(corrupted)} potentially corrupted invoices:\n")
        for inv in corrupted:
            print(
                f"  {inv.id}  {inv.invoice_number or '(no NCF)'}  "
                f"total={inv.total_amount:.2f}  "
                f"tax_amount={inv.tax_amount:.2f}  →  0.00"
            )

        if dry_run:
            print(f"\nDRY RUN — {len(corrupted)} invoices would be restored.")
            print("Run with --no-dry-run to apply.")
            return

        for inv in corrupted:
            inv.tax_amount = 0.0

        if corrupted:
            db.commit()
        print(f"\nRestored {len(corrupted)} invoices.")
    finally:
        db.close()


if __name__ == "__main__":
    dry_run = "--no-dry-run" not in sys.argv
    restore(dry_run)
