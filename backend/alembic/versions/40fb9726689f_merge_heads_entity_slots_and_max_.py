"""merge heads: entity_slots and max_products branches

Revision ID: 40fb9726689f
Revises: 40fb9726689d, 90e1f2a3b4c6
Create Date: 2026-06-29 00:00:00.000000

"""
from typing import Sequence, Union



# revision identifiers, used by Alembic.
revision: str = "40fb9726689f"
down_revision: Union[str, Sequence[str], None] = ("40fb9726689d", "90e1f2a3b4c6")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
