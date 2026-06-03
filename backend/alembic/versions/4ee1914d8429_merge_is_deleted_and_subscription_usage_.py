"""merge is_deleted and subscription/usage migrations

Revision ID: 4ee1914d8429
Revises: a1b2c3d4e5f6, dc5fa79d59cd
Create Date: 2026-06-03 13:49:58.260320

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4ee1914d8429'
down_revision: Union[str, Sequence[str], None] = ('a1b2c3d4e5f6', 'dc5fa79d59cd')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
