"""add_permissions_to_user_organization

Revision ID: 2d8273d3ae1d
Revises: 994c7afd724e
Create Date: 2026-05-23 01:21:52.551914

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "2d8273d3ae1d"
down_revision: Union[str, Sequence[str], None] = "50c279d55c20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("user_organizations", sa.Column("permissions", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("user_organizations", "permissions")
