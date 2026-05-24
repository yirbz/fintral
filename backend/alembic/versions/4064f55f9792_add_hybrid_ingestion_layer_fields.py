"""add_hybrid_ingestion_layer_fields

Revision ID: 4064f55f9792
Revises: 3a1b2c3d4e5f
Create Date: 2026-05-24 13:47:55.654869

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import app

revision: str = '4064f55f9792'
down_revision: Union[str, Sequence[str], None] = '3a1b2c3d4e5f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('invoices', sa.Column('rnc_comprador', sa.String(), nullable=True))
    op.add_column('invoices', sa.Column('is_electronic', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    op.add_column('invoices', sa.Column('ingestion_source', sa.String(length=20), nullable=True))
    op.add_column('invoices', sa.Column('status', sa.String(length=20), server_default=sa.text("'draft'"), nullable=False))
    op.add_column('invoices', sa.Column('parent_invoice_id', app.database.GUID(length=32), nullable=True))
    op.add_column('invoices', sa.Column('accounting_account_id', sa.String(), nullable=True))
    op.add_column('invoices', sa.Column('cost_center_id', sa.String(), nullable=True))
    op.add_column('invoices', sa.Column('tags', sa.Text(), nullable=True))
    op.add_column('invoices', sa.Column('internal_notes', sa.Text(), nullable=True))
    op.add_column('invoices', sa.Column('payment_status', sa.String(length=20), nullable=True))
    op.create_index(op.f('ix_invoices_parent_invoice_id'), 'invoices', ['parent_invoice_id'], unique=False)
    op.create_index(op.f('ix_invoices_status'), 'invoices', ['status'], unique=False)
    op.create_foreign_key('fk_invoices_parent_invoice', 'invoices', 'invoices', ['parent_invoice_id'], ['id'])


def downgrade() -> None:
    op.drop_constraint('fk_invoices_parent_invoice', 'invoices', type_='foreignkey')
    op.drop_index(op.f('ix_invoices_status'), table_name='invoices')
    op.drop_index(op.f('ix_invoices_parent_invoice_id'), table_name='invoices')
    op.drop_column('invoices', 'payment_status')
    op.drop_column('invoices', 'internal_notes')
    op.drop_column('invoices', 'tags')
    op.drop_column('invoices', 'cost_center_id')
    op.drop_column('invoices', 'accounting_account_id')
    op.drop_column('invoices', 'parent_invoice_id')
    op.drop_column('invoices', 'status')
    op.drop_column('invoices', 'ingestion_source')
    op.drop_column('invoices', 'is_electronic')
    op.drop_column('invoices', 'rnc_comprador')
