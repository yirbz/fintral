"""add_items_json_to_payment_proofs

Adds items_json column to payment_proofs for structured cart items.

Revision ID: 6a7b8c9d0e1f
Revises: 5287b38f0803
Create Date: 2026-06-14 18:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "6a7b8c9d0e1f"
down_revision: Union[str, None] = "5287b38f0803"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("payment_proofs", sa.Column("items_json", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("payment_proofs", "items_json")
