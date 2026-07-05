"""add payment intent fields to mio_payment_orders

Revision ID: 5a6b7c8d9e0f
Revises: 47a1b2c3d4e5
Create Date: 2026-07-03 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "5a6b7c8d9e0f"
down_revision: Union[str, None] = "47a1b2c3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("mio_payment_orders", sa.Column("context_type", sa.String(50), nullable=True, index=True))
    op.add_column("mio_payment_orders", sa.Column("context_id", sa.String(255), nullable=True, index=True))
    op.add_column("mio_payment_orders", sa.Column("idempotency_key", sa.String(128), nullable=True, unique=True, index=True))
    op.add_column("mio_payment_orders", sa.Column("replaced_by_id", sa.Integer, sa.ForeignKey("mio_payment_orders.id"), nullable=True))
    op.add_column("mio_payment_orders", sa.Column("replaced_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("mio_payment_orders", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_mio_payment_orders_status", "mio_payment_orders", ["status"])


def downgrade() -> None:
    op.drop_index("ix_mio_payment_orders_status", table_name="mio_payment_orders")
    op.drop_column("mio_payment_orders", "expires_at")
    op.drop_column("mio_payment_orders", "replaced_at")
    op.drop_column("mio_payment_orders", "replaced_by_id")
    op.drop_column("mio_payment_orders", "idempotency_key")
    op.drop_column("mio_payment_orders", "context_id")
    op.drop_column("mio_payment_orders", "context_type")
