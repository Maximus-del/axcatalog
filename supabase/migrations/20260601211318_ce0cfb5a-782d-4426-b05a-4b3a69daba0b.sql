ALTER TABLE public.order_line_items
  DROP CONSTRAINT IF EXISTS order_line_items_attribution_confidence_check;
ALTER TABLE public.order_line_items
  ADD CONSTRAINT order_line_items_attribution_confidence_check
  CHECK (attribution_confidence = ANY (ARRAY['matched','unattributed','manual_override','upcharge_skipped']));

-- Steven Shareef rules
INSERT INTO public.product_attribution_rules (organization_id, match_type, match_pattern, priority, is_active)
VALUES
  ('11111111-1111-4111-8111-000000000002','contains','Shareef',100,true),
  ('11111111-1111-4111-8111-000000000002','contains','Shareef vs Goliath',100,true),
  ('11111111-1111-4111-8111-000000000002','contains','Shareef O''Neal',100,true);

-- Parker Boudreaux org + rules
INSERT INTO public.organizations (id, name, slug, pricing_tier_id)
VALUES (gen_random_uuid(), 'Parker Boudreaux', 'parker-boudreaux',
        '9dce7a20-3446-4084-bb19-155c09ccc359');

INSERT INTO public.product_attribution_rules (organization_id, match_type, match_pattern, priority, is_active)
SELECT id, 'contains', 'Parker Boudreaux', 100, true FROM public.organizations WHERE slug='parker-boudreaux'
UNION ALL
SELECT id, 'contains', 'Azul Rey Temido', 95, true FROM public.organizations WHERE slug='parker-boudreaux';

-- Athlete Xclusive extensions
INSERT INTO public.product_attribution_rules (organization_id, match_type, match_pattern, priority, is_active) VALUES
  ('2d6f377e-4fe8-448b-84b3-42aed237f3da','contains','Ravens World Tour',80,true),
  ('2d6f377e-4fe8-448b-84b3-42aed237f3da','contains','ND Black',80,true),
  ('2d6f377e-4fe8-448b-84b3-42aed237f3da','contains','Jesus Bless',80,true),
  ('2d6f377e-4fe8-448b-84b3-42aed237f3da','contains','Faith. Freeman. Football.',80,true),
  ('2d6f377e-4fe8-448b-84b3-42aed237f3da','contains','B''More SC',80,true);

-- Flag upcharge line items in target batch
WITH batch_orders AS (
  SELECT id FROM public.orders WHERE import_batch_id = '6cc38e35-84df-4edc-8fc0-2f5e2b3f13f3'
)
UPDATE public.order_line_items oli
SET is_upcharge = true,
    attributed_org_id = NULL,
    attribution_rule_id = NULL,
    attribution_confidence = 'upcharge_skipped'
WHERE oli.order_id IN (SELECT id FROM batch_orders)
  AND (
    lower(oli.product_title) LIKE '%square%'
    OR lower(oli.product_title) LIKE '%add-on%'
    OR lower(oli.product_title) LIKE '%add on%'
    OR lower(oli.product_title) LIKE '%upcharge%'
    OR lower(oli.product_title) LIKE '%embroidery upgrade%'
    OR lower(oli.product_title) LIKE '%expedited shipping%'
  );

-- Reset non-upcharge lines
WITH batch_orders AS (
  SELECT id FROM public.orders WHERE import_batch_id = '6cc38e35-84df-4edc-8fc0-2f5e2b3f13f3'
)
UPDATE public.order_line_items
SET attributed_org_id = NULL,
    attribution_rule_id = NULL,
    attribution_confidence = 'unattributed'
WHERE order_id IN (SELECT id FROM batch_orders)
  AND is_upcharge = false;

-- Apply rule matches
WITH batch_lines AS (
  SELECT oli.id AS line_id, oli.product_title, oli.sku,
         COALESCE(o.raw_csv_row->>'Tags','') AS tags
  FROM public.order_line_items oli
  JOIN public.orders o ON o.id = oli.order_id
  WHERE o.import_batch_id = '6cc38e35-84df-4edc-8fc0-2f5e2b3f13f3'
    AND oli.is_upcharge = false
),
matches AS (
  SELECT DISTINCT ON (bl.line_id)
    bl.line_id, r.id AS rule_id, r.organization_id
  FROM batch_lines bl
  JOIN public.product_attribution_rules r ON r.is_active = true
   AND (
     (r.match_type='contains'      AND lower(bl.product_title) LIKE '%' || lower(r.match_pattern) || '%')
  OR (r.match_type='starts_with'   AND lower(bl.product_title) LIKE lower(r.match_pattern) || '%')
  OR (r.match_type='exact'         AND lower(bl.product_title) = lower(r.match_pattern))
  OR (r.match_type='sku_exact'     AND lower(COALESCE(bl.sku,'')) = lower(r.match_pattern))
  OR (r.match_type='sku_contains'  AND lower(COALESCE(bl.sku,'')) LIKE '%' || lower(r.match_pattern) || '%')
  OR (r.match_type='tag_contains'  AND lower(bl.tags) LIKE '%' || lower(r.match_pattern) || '%')
   )
  ORDER BY bl.line_id, r.priority DESC, r.created_at ASC
)
UPDATE public.order_line_items oli
SET attributed_org_id = m.organization_id,
    attribution_rule_id = m.rule_id,
    attribution_confidence = 'matched'
FROM matches m
WHERE oli.id = m.line_id;

-- Product-title fallback
WITH batch_lines AS (
  SELECT oli.id AS line_id, oli.product_title, oli.sku
  FROM public.order_line_items oli
  JOIN public.orders o ON o.id = oli.order_id
  WHERE o.import_batch_id = '6cc38e35-84df-4edc-8fc0-2f5e2b3f13f3'
    AND oli.is_upcharge = false
    AND oli.attributed_org_id IS NULL
)
UPDATE public.order_line_items oli
SET attributed_org_id = p.organization_id,
    product_id = p.id,
    attribution_confidence = 'matched'
FROM batch_lines bl
JOIN public.products p ON lower(p.title) = lower(bl.product_title)
                       OR (bl.sku IS NOT NULL AND lower(p.sku) = lower(bl.sku))
WHERE oli.id = bl.line_id;

-- Order rollup
WITH batch_orders AS (
  SELECT id FROM public.orders WHERE import_batch_id = '6cc38e35-84df-4edc-8fc0-2f5e2b3f13f3'
),
ranked AS (
  SELECT order_id, attributed_org_id,
         ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY COUNT(*) DESC) AS rn
  FROM public.order_line_items
  WHERE order_id IN (SELECT id FROM batch_orders)
    AND attributed_org_id IS NOT NULL
  GROUP BY order_id, attributed_org_id
)
UPDATE public.orders o
SET attributed_org_id = r.attributed_org_id
FROM ranked r
WHERE o.id = r.order_id AND r.rn = 1;

-- Batch counters
UPDATE public.import_batches ib
SET line_items_attributed = sub.attr_count,
    line_items_unattributed = sub.unattr_count
FROM (
  SELECT
    COUNT(*) FILTER (WHERE oli.attributed_org_id IS NOT NULL) AS attr_count,
    COUNT(*) FILTER (WHERE oli.attributed_org_id IS NULL AND oli.is_upcharge = false) AS unattr_count
  FROM public.order_line_items oli
  JOIN public.orders o ON o.id = oli.order_id
  WHERE o.import_batch_id = '6cc38e35-84df-4edc-8fc0-2f5e2b3f13f3'
) sub
WHERE ib.id = '6cc38e35-84df-4edc-8fc0-2f5e2b3f13f3';