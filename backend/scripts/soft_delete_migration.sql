ALTER TABLE invoices ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS deleted_by UUID;
CREATE INDEX IF NOT EXISTS ix_invoices_deleted_at ON invoices(deleted_at);
