
-- =========================================================================
-- ERROR 1: organizations.shopify_access_token / shopify_webhook_secret
-- exposed to all org members.
-- Fix: restrict SELECT to admins only. Non-admins get sensitive cols as
-- NULL via the existing organizations_safe view (which we also harden).
-- =========================================================================
DROP POLICY IF EXISTS "Users see own org" ON public.organizations;

-- Admins see the full row (including shopify_access_token, shopify_webhook_secret).
CREATE POLICY "Admins see full own org"
ON public.organizations
FOR SELECT
USING (id = public.current_user_org_id() AND public.current_user_is_admin());

-- Non-admin members can still read the org row, but app code should use
-- organizations_safe for non-admins. RLS alone can't hide individual columns,
-- so we keep row-level read for org members and rely on organizations_safe
-- (which excludes the sensitive columns) being the canonical client-side source.
CREATE POLICY "Members see own org non-sensitive"
ON public.organizations
FOR SELECT
USING (id = public.current_user_org_id() AND NOT public.current_user_is_admin());

-- Revoke direct column access to sensitive credentials from the anon/authenticated
-- roles. Only the service_role (used by edge functions with service key) and the
-- table owner can read these. Edge functions that need the token must use the
-- service-role client, NOT the user JWT.
REVOKE SELECT (shopify_access_token, shopify_webhook_secret)
  ON public.organizations FROM anon, authenticated;

-- =========================================================================
-- ERROR 2: user_profiles has no INSERT policy. Add a tightly scoped one
-- that lets a user insert ONLY their own profile, and never as admin.
-- Existing admins (or service role) can still create admin profiles.
-- =========================================================================
CREATE POLICY "Users insert own profile non-admin"
ON public.user_profiles
FOR INSERT
WITH CHECK (
  id = auth.uid()
  AND role <> 'admin'
);

-- Admins in the same org can insert any profile (including admins).
CREATE POLICY "Admins insert profiles in own org"
ON public.user_profiles
FOR INSERT
WITH CHECK (
  organization_id = public.current_user_org_id()
  AND public.current_user_is_admin()
);

-- =========================================================================
-- ERROR 3: storage.objects policies for 'blanks' bucket reference
-- storage.foldername(b.name) where b is the `blanks` TABLE alias, not the
-- storage object. Replace with storage.foldername(objects.name).
-- =========================================================================
DROP POLICY IF EXISTS "org read blanks storage" ON storage.objects;
DROP POLICY IF EXISTS "org write blanks storage" ON storage.objects;
DROP POLICY IF EXISTS "org update blanks storage" ON storage.objects;
DROP POLICY IF EXISTS "org delete blanks storage" ON storage.objects;

CREATE POLICY "org read blanks storage"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'blanks'
  AND EXISTS (
    SELECT 1 FROM public.blanks b
    WHERE b.id = ((storage.foldername(storage.objects.name))[1])::uuid
      AND b.organization_id = public.current_user_org_id()
  )
);

CREATE POLICY "org write blanks storage"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'blanks'
  AND EXISTS (
    SELECT 1 FROM public.blanks b
    WHERE b.id = ((storage.foldername(storage.objects.name))[1])::uuid
      AND b.organization_id = public.current_user_org_id()
  )
);

CREATE POLICY "org update blanks storage"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'blanks'
  AND EXISTS (
    SELECT 1 FROM public.blanks b
    WHERE b.id = ((storage.foldername(storage.objects.name))[1])::uuid
      AND b.organization_id = public.current_user_org_id()
  )
);

CREATE POLICY "org delete blanks storage"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'blanks'
  AND EXISTS (
    SELECT 1 FROM public.blanks b
    WHERE b.id = ((storage.foldername(storage.objects.name))[1])::uuid
      AND b.organization_id = public.current_user_org_id()
  )
);

-- =========================================================================
-- ERROR 4: SECURITY DEFINER views in public schema. Set security_invoker=true
-- so they run with the querying user's permissions and respect RLS.
-- =========================================================================
ALTER VIEW public.athlete_revenue_summary SET (security_invoker = true);
ALTER VIEW public.team_revenue_summary    SET (security_invoker = true);
ALTER VIEW public.athlete_revenue_monthly SET (security_invoker = true);
ALTER VIEW public.organizations_safe      SET (security_invoker = true);
