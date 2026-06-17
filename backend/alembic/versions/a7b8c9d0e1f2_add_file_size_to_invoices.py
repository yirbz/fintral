"""add_file_size_to_invoices

Revision ID: a7b8c9d0e1f2
Revises: fed6f8641e4a
Create Date: 2026-06-15 03:25:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, Sequence[str], None] = "fed6f8641e4a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("invoices", sa.Column("file_size", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("invoices", "file_size")
