"""add_payment_proofs_table

Adds the payment_proofs table for bank transfer payment proof uploads.

Revision ID: 5287b38f0803
Revises: d76728d55ef4
Create Date: 2026-06-14 12:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from app.database import GUID


revision: str = "5287b38f0803"
down_revision: Union[str, Sequence[str], None] = "d76728d55ef4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "payment_proofs",
        sa.Column("id", GUID, primary_key=True),
        sa.Column("tenant_id", GUID, sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("organization_id", GUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", GUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("plan_name", sa.String(64), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(3), default="DOP", nullable=False),
        sa.Column("addons_json", sa.Text, nullable=True),
        sa.Column("status", sa.String(20), default="pending", nullable=False, index=True),
        sa.Column("file_path", sa.String(512), nullable=False),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("admin_notes", sa.Text, nullable=True),
        sa.Column("verified_by", GUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("payment_proofs")
