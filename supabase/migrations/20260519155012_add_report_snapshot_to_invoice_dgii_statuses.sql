-- Adds report payload snapshot used by DGII submissions UI/API.
-- Safe to re-run.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'invoice_dgii_statuses'
    ) THEN
        ALTER TABLE public.invoice_dgii_statuses
            ADD COLUMN IF NOT EXISTS report_snapshot JSONB;

        UPDATE public.invoice_dgii_statuses
        SET report_snapshot = '{}'::jsonb
        WHERE report_snapshot IS NULL;
    END IF;
END $$;
