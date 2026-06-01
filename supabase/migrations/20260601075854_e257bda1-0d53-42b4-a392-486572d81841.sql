
-- TODO: Flag upcharge/add-on SKUs (e.g. "1 Square" $5 add-on) separately on order_line_items
-- rather than routing them through revenue attribution rules.

-- Part 1: Create Carnell Tate + Keon Coleman orgs
INSERT INTO public.organizations (id, name, slug, pricing_tier_id)
VALUES
  (gen_random_uuid(), 'Carnell Tate', 'carnell-tate', '9dce7a20-3446-4084-bb19-155c09ccc359'),
  (gen_random_uuid(), 'Keon Coleman', 'keon-coleman', '9dce7a20-3446-4084-bb19-155c09ccc359')
ON CONFLICT (slug) DO NOTHING;

-- Seed rules for new athlete orgs
INSERT INTO public.product_attribution_rules (organization_id, match_type, match_pattern, priority, is_active, notes)
SELECT id, 'contains', 'Carnell Tate', 100, true, 'Carnell Tate athlete merch'
FROM public.organizations WHERE slug = 'carnell-tate'
UNION ALL
SELECT id, 'contains', 'Keon Coleman', 100, true, 'Keon Coleman athlete merch'
FROM public.organizations WHERE slug = 'keon-coleman';

-- Part 2: Athlete Xclusive store-brand rule extensions
INSERT INTO public.product_attribution_rules (organization_id, match_type, match_pattern, priority, is_active, notes)
VALUES
  ('2d6f377e-4fe8-448b-84b3-42aed237f3da', 'contains', '"O" World Tour', 80, true, 'Ohio State store-brand (literal quotes)'),
  ('2d6f377e-4fe8-448b-84b3-42aed237f3da', 'contains', 'ND Our Mother', 80, true, 'Notre Dame God Country line'),
  ('2d6f377e-4fe8-448b-84b3-42aed237f3da', 'contains', 'Mia Mastrov', 80, true, 'Former athlete client - historical sales to store-brand'),
  ('2d6f377e-4fe8-448b-84b3-42aed237f3da', 'contains', 'Two Tone Miami', 80, true, 'Generic Miami fan merch');
