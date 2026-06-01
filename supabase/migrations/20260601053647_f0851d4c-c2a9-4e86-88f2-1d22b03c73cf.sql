-- ============================================================
-- Migration B: org split (Mooney / Shareef / Proactive)
-- ============================================================

-- 1) Create the three new orgs
INSERT INTO public.organizations (id, name, slug, pricing_tier_id, shopify_connected)
VALUES
  ('11111111-1111-4111-8111-000000000001'::uuid,
   'Darnell Mooney', 'darnell-mooney',
   '9dce7a20-3446-4084-bb19-155c09ccc359'::uuid,  -- Athlete tier
   false),
  ('11111111-1111-4111-8111-000000000002'::uuid,
   'Steven Shareef', 'steven-shareef',
   '9dce7a20-3446-4084-bb19-155c09ccc359'::uuid,  -- Athlete tier
   false),
  ('11111111-1111-4111-8111-000000000003'::uuid,
   'Proactive Sports Performance', 'proactive-sports-performance',
   'bb1cf37a-6b1e-482b-b82e-dfbf3514c8d6'::uuid,  -- Corporate tier
   false);

-- Also set Athlete Xclusive to Standard tier if not yet set (avoids
-- compute_wholesale_price falling through to the default-tier path
-- inconsistently when admin-context queries hit it).
UPDATE public.organizations
   SET pricing_tier_id = 'dc3e19b4-3209-4317-9b17-4d7a7bcfb41f'::uuid
 WHERE id = '2d6f377e-4fe8-448b-84b3-42aed237f3da'::uuid
   AND pricing_tier_id IS NULL;

-- 2) Repoint athlete rows
UPDATE public.athletes
   SET organization_id = '11111111-1111-4111-8111-000000000001'::uuid
 WHERE id = '74bb5183-5a2b-443b-9b07-bf52ef89c722'::uuid;  -- Mooney

UPDATE public.athletes
   SET organization_id = '11111111-1111-4111-8111-000000000002'::uuid
 WHERE id = '1c285274-b064-4a61-8cd0-04f898952c40'::uuid;  -- Shareef

-- 3) Repoint products via product_athletes membership
UPDATE public.products p
   SET organization_id = '11111111-1111-4111-8111-000000000001'::uuid
  FROM public.product_athletes pa
 WHERE pa.product_id = p.id
   AND pa.athlete_id = '74bb5183-5a2b-443b-9b07-bf52ef89c722'::uuid;

UPDATE public.products p
   SET organization_id = '11111111-1111-4111-8111-000000000002'::uuid
  FROM public.product_athletes pa
 WHERE pa.product_id = p.id
   AND pa.athlete_id = '1c285274-b064-4a61-8cd0-04f898952c40'::uuid;

-- 4) Repoint designs by primary_athlete_id
UPDATE public.designs
   SET organization_id = '11111111-1111-4111-8111-000000000001'::uuid
 WHERE primary_athlete_id = '74bb5183-5a2b-443b-9b07-bf52ef89c722'::uuid;

-- (Shareef currently has no designs with primary_athlete_id set; skip.)

-- 5) Repoint collections by athlete_id
UPDATE public.collections
   SET organization_id = '11111111-1111-4111-8111-000000000001'::uuid
 WHERE athlete_id = '74bb5183-5a2b-443b-9b07-bf52ef89c722'::uuid;

UPDATE public.collections
   SET organization_id = '11111111-1111-4111-8111-000000000002'::uuid
 WHERE athlete_id = '1c285274-b064-4a61-8cd0-04f898952c40'::uuid;

-- 6) Repoint bulk order requests by athlete_id
UPDATE public.bulk_order_requests
   SET organization_id = '11111111-1111-4111-8111-000000000001'::uuid
 WHERE athlete_id = '74bb5183-5a2b-443b-9b07-bf52ef89c722'::uuid;

-- 7) Repoint product attribution rules (all 5 are Mooney's patterns)
UPDATE public.product_attribution_rules
   SET organization_id = '11111111-1111-4111-8111-000000000001'::uuid
 WHERE notes ILIKE 'Mooney%'
    OR match_pattern IN ('Mooney World','MooneyWorld','ATL Arrival','Rise Up','WR 11');

-- 8) product_images, product_videos, product_social_assets, orders,
--    order_line_items, revenue_splits, import_batches, org_pricing_config
--    are all empty for the moved athletes today — no rows to repoint.
--    Future inserts will inherit org_id from the parent product / order /
--    athlete-link path correctly.

-- 9) Blanks, design_collections, ingestion_jobs, and unassigned designs
--    remain on Athlete Xclusive (shared operator pool).
