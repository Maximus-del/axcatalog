
-- Rule-based attribution for currently-unattributed line items in this batch
WITH batch_orders AS (
  SELECT id FROM public.orders WHERE import_batch_id = '6cc38e35-84df-4edc-8fc0-2f5e2b3f13f3'
),
candidates AS (
  SELECT li.id AS line_id, r.organization_id, r.id AS rule_id, r.priority
  FROM public.order_line_items li
  JOIN public.product_attribution_rules r
    ON r.is_active = true
   AND (
     (r.match_type = 'contains'     AND lower(li.product_title) LIKE '%' || lower(r.match_pattern) || '%') OR
     (r.match_type = 'starts_with'  AND lower(li.product_title) LIKE lower(r.match_pattern) || '%') OR
     (r.match_type = 'exact'        AND lower(li.product_title) = lower(r.match_pattern)) OR
     (r.match_type = 'sku_exact'    AND lower(coalesce(li.sku,'')) = lower(r.match_pattern)) OR
     (r.match_type = 'sku_contains' AND lower(coalesce(li.sku,'')) LIKE '%' || lower(r.match_pattern) || '%')
   )
  WHERE li.attributed_org_id IS NULL
    AND li.order_id IN (SELECT id FROM batch_orders)
),
picks AS (
  SELECT DISTINCT ON (line_id) line_id, organization_id, rule_id
  FROM candidates
  ORDER BY line_id, priority DESC
)
UPDATE public.order_line_items li
SET attributed_org_id = p.organization_id,
    attribution_rule_id = p.rule_id,
    attribution_confidence = 'matched'
FROM picks p
WHERE li.id = p.line_id;

-- Order-level rollup: assign attributed_org_id to majority org per order in batch
WITH batch_orders AS (
  SELECT id FROM public.orders WHERE import_batch_id = '6cc38e35-84df-4edc-8fc0-2f5e2b3f13f3'
),
counts AS (
  SELECT order_id, attributed_org_id, count(*) AS n
  FROM public.order_line_items
  WHERE order_id IN (SELECT id FROM batch_orders)
    AND attributed_org_id IS NOT NULL
  GROUP BY order_id, attributed_org_id
),
majority AS (
  SELECT DISTINCT ON (order_id) order_id, attributed_org_id
  FROM counts
  ORDER BY order_id, n DESC
)
UPDATE public.orders o
SET attributed_org_id = m.attributed_org_id
FROM majority m
WHERE o.id = m.order_id;

-- Refresh batch counters
UPDATE public.import_batches b
SET line_items_attributed = sub.attr,
    line_items_unattributed = sub.unattr
FROM (
  SELECT
    count(*) FILTER (WHERE li.attributed_org_id IS NOT NULL) AS attr,
    count(*) FILTER (WHERE li.attributed_org_id IS NULL) AS unattr
  FROM public.order_line_items li
  JOIN public.orders o ON o.id = li.order_id
  WHERE o.import_batch_id = '6cc38e35-84df-4edc-8fc0-2f5e2b3f13f3'
) sub
WHERE b.id = '6cc38e35-84df-4edc-8fc0-2f5e2b3f13f3';
