
-- 1) Privilege escalation fix: remove self-insert into user_profiles.
DROP POLICY IF EXISTS "Users insert own profile non-admin" ON public.user_profiles;

-- 2) Hide sensitive Shopify columns on organizations from non-service roles.
REVOKE SELECT (shopify_access_token, shopify_webhook_secret) ON public.organizations FROM authenticated;
REVOKE SELECT (shopify_access_token, shopify_webhook_secret) ON public.organizations FROM anon;

-- 3) Restrict compute_wholesale_price to authenticated callers only.
REVOKE EXECUTE ON FUNCTION public.compute_wholesale_price(uuid, uuid, int) FROM anon, PUBLIC;

-- 4) Fix mutable search_path on internal helper/trigger functions.
ALTER FUNCTION public.blanks_touch_cost_timestamp()  SET search_path = public;
ALTER FUNCTION public.recalc_bulk_order_total()      SET search_path = public;
ALTER FUNCTION public.recalc_shopify_order_totals()  SET search_path = public;
ALTER FUNCTION public.set_sync_log_duration()        SET search_path = public;
ALTER FUNCTION public.set_updated_at()               SET search_path = public;
