#!/usr/bin/env bash
set -e

# Usage: bash scripts/apply_migrations.sh <DATABASE_URL>
# Example: bash scripts/apply_migrations.sh "postgresql://invoice:change_me_db_password@localhost:5440/invoice"

DB_URL="${1:-postgresql://invoice:change_me_db_password@localhost:5440/invoice}"

echo "Applying migrations to: $DB_URL"

psql "$DB_URL" <<'SQL'
-- Soft delete columns
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS deleted_by UUID;
CREATE INDEX IF NOT EXISTS ix_invoices_deleted_at ON invoices(deleted_at);

-- Processed image path
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS processed_path VARCHAR;

-- Quality report JSON blob
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS quality_report TEXT;

-- Supabase UID for users
ALTER TABLE users ADD COLUMN IF NOT EXISTS supabase_uid VARCHAR(255);

-- Storage RLS policy for service_role (upload/read invoices)
-- If running on Supabase dashboard, use the SQL block below instead.
-- See: backend/scripts/supabase_storage_rls.sql
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_catalog.pg_tables WHERE schemaname = 'storage' AND tablename = 'objects') THEN
    DROP POLICY IF EXISTS service_role_all_invoices ON storage.objects;
    CREATE POLICY service_role_all_invoices ON storage.objects
      FOR ALL
      USING (
        bucket_id = 'invoices'
        AND auth.role() = 'service_role'
      );
    RAISE NOTICE 'RLS policy created for invoices bucket';
  END IF;
END $$;
SQL

echo "✅ Migrations applied successfully"
