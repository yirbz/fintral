-- Migration: Invoice DGII status tracking + submission status
-- 2026-05-18

-- 1. Add status column to existing dgii_submissions
ALTER TABLE dgii_submissions ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending_confirm';

-- 2. Create invoice_dgii_statuses table
CREATE TABLE IF NOT EXISTS invoice_dgii_statuses (
    id UUID PRIMARY KEY,
    invoice_id UUID NOT NULL REFERENCES invoices(id),
    format VARCHAR(3) NOT NULL,
    period VARCHAR(6) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'reported',
    submission_id UUID REFERENCES dgii_submissions(id),
    error_detail TEXT,
    notes TEXT,
    report_snapshot JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.b Add snapshot column for environments where table already exists
ALTER TABLE invoice_dgii_statuses
    ADD COLUMN IF NOT EXISTS report_snapshot JSONB;

-- 3. Indexes
CREATE INDEX IF NOT EXISTS ix_inv_dgii_status_invoice_id ON invoice_dgii_statuses(invoice_id);
CREATE INDEX IF NOT EXISTS ix_inv_dgii_status_lookup ON invoice_dgii_statuses(invoice_id, format, status);
CREATE INDEX IF NOT EXISTS ix_inv_dgii_status_format_period ON invoice_dgii_statuses(format, period);
CREATE INDEX IF NOT EXISTS ix_inv_dgii_status_submission_id ON invoice_dgii_statuses(submission_id);

-- 4. Backfill: mark existing submissions as confirmed (they were all "accepted")
UPDATE dgii_submissions SET status = 'confirmed' WHERE status = 'pending_confirm';

-- 5. Backfill invoice_dgii_statuses from existing submissions
INSERT INTO invoice_dgii_statuses (id, invoice_id, format, period, status, submission_id, created_at, updated_at)
SELECT
    gen_random_uuid() as id,
    unnest(sub.invoice_ids::uuid[]) as invoice_id,
    sub.format,
    sub.period,
    'reported' as status,
    sub.id as submission_id,
    sub.created_at,
    sub.created_at as updated_at
FROM dgii_submissions sub
WHERE sub.invoice_ids IS NOT NULL
  AND jsonb_typeof(sub.invoice_ids::jsonb) = 'array'
  AND jsonb_array_length(sub.invoice_ids::jsonb) > 0
ON CONFLICT DO NOTHING;
