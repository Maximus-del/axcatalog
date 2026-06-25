-- Allow anonymous catalog buyers to upload PNG mockups to the design-files bucket
-- ONLY under the catalog-uploads/ prefix. Reads stay restricted to org members /
-- service role; this is write-only for anon.
CREATE POLICY "anon upload catalog-uploads"
  ON storage.objects
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    bucket_id = 'design-files'
    AND (storage.foldername(name))[1] = 'catalog-uploads'
  );

-- Allow service role / admin tools to read catalog uploads via signed URLs.
CREATE POLICY "service role read catalog-uploads"
  ON storage.objects
  FOR SELECT
  TO service_role
  USING (
    bucket_id = 'design-files'
    AND (storage.foldername(name))[1] = 'catalog-uploads'
  );