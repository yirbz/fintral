-- =============================================================
-- Storage RLS Policy for service_role
-- Run this in your Supabase Dashboard → SQL Editor
-- =============================================================

-- Allow service_role full access to the invoices bucket
DROP POLICY IF EXISTS service_role_all_invoices ON storage.objects;
CREATE POLICY service_role_all_invoices
  ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'invoices'
    AND auth.role() = 'service_role'
  );

-- Optional: Allow authenticated users to read their own invoices
DROP POLICY IF EXISTS authenticated_read_invoices ON storage.objects;
CREATE POLICY authenticated_read_invoices
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'invoices'
    AND auth.role() = 'authenticated'
  );
