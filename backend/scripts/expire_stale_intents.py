"""One-off script: expire all PENDING MioPaymentOrder records for a given email."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Use Supabase local DB directly
os.environ["DATABASE_URL"] = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

from app.database import SessionLocal
from app.models.user import User
from app.models.mio_payment_order import MioPaymentOrder
from app.utils.dates import utc_now

EMAIL = "yunielherrera2008@gmail.com"

db = SessionLocal()
try:
    user = db.query(User).filter(User.email == EMAIL).first()
    if not user:
        print(f"User {EMAIL} not found")
        sys.exit(1)

    pending = (
        db.query(MioPaymentOrder)
        .filter(
            MioPaymentOrder.user_id == user.id,
            MioPaymentOrder.status == "PENDING",
        )
        .all()
    )

    print(f"Found {len(pending)} PENDING intents for {EMAIL}")
    for p in pending:
        print(f"  {p.id}: order_uuid={p.order_uuid}, amount_cents={p.amount_cents}, "
              f"context={p.context_type}/{p.context_id or '—'}, created={p.created_at}")
        p.status = "EXPIRED"
        p.updated_at = utc_now()

    db.commit()
    print(f"Expired {len(pending)} intents.")
finally:
    db.close()
