
-- 1) Hide Shopify credentials from non-service-role queries
REVOKE SELECT (shopify_access_token, shopify_webhook_secret) ON public.organizations FROM authenticated, anon;

-- 2) Prevent role self-escalation on user_profiles
DROP POLICY IF EXISTS "Users update own profile" ON public.user_profiles;
CREATE POLICY "Users update own profile"
  ON public.user_profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT role FROM public.user_profiles WHERE id = auth.uid())
    AND organization_id = (SELECT organization_id FROM public.user_profiles WHERE id = auth.uid())
  );

-- Admins can still change roles within their org
CREATE POLICY "Admins update profiles in own org"
  ON public.user_profiles
  FOR UPDATE
  USING (current_user_is_admin() AND organization_id = current_user_org_id())
  WITH CHECK (current_user_is_admin() AND organization_id = current_user_org_id());

-- 3) Storage: tighten product-social-assets bucket
DROP POLICY IF EXISTS "social assets auth insert" ON storage.objects;
DROP POLICY IF EXISTS "social assets public read" ON storage.objects;

-- Files uploaded under path "<product_id>/..."; verify caller is linked to that product's athlete.
CREATE POLICY "social assets scoped insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product-social-assets'
    AND EXISTS (
      SELECT 1
      FROM public.product_athletes pa
      JOIN public.user_athlete_links ual ON ual.athlete_id = pa.athlete_id
      WHERE ual.user_id = auth.uid()
        AND pa.product_id::text = (storage.foldername(name))[1]
    )
  );
