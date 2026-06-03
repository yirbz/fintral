"""add_is_deleted_to_invoices

Revision ID: a1b2c3d4e5f6
Revises: e76f5b7bbbee
Create Date: 2026-06-03 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'e76f5b7bbbee'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('invoices', sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    op.create_index(op.f('ix_invoices_is_deleted'), 'invoices', ['is_deleted'])

    op.execute("UPDATE invoices SET is_deleted = true WHERE deleted_at IS NOT NULL")


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_invoices_is_deleted'), table_name='invoices')
    op.drop_column('invoices', 'is_deleted')
