"""add monthly_charges table

Revision ID: 2c926896b066
Revises: 639473f7d133
Create Date: 2026-06-15

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "2c926896b066"
down_revision: Union[str, None] = "639473f7d133"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "monthly_charges",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("cycle", sa.Integer(), nullable=False),
        sa.Column("charge_type", sa.String(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("unit_price_cents", sa.Integer(), nullable=False),
        sa.Column("total_price_cents", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("paid", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("payment_proof_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("payment_proofs.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_monthly_charges_org_cycle", "monthly_charges", ["organization_id", "cycle"])


def downgrade() -> None:
    op.drop_index("ix_monthly_charges_org_cycle", table_name="monthly_charges")
    op.drop_table("monthly_charges")
