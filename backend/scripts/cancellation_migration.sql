ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cancellation_type VARCHAR(2);
CREATE INDEX IF NOT EXISTS ix_invoices_cancelled_at ON invoices(cancelled_at);
