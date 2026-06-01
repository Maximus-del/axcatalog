WITH batch_orders AS (
  SELECT id FROM orders WHERE import_batch_id = '6cc38e35-84df-4edc-8fc0-2f5e2b3f13f3'
),
unattributed AS (
  SELECT oli.id, oli.product_title, oli.sku
  FROM order_line_items oli
  WHERE oli.order_id IN (SELECT id FROM batch_orders)
    AND oli.attributed_org_id IS NULL
),
ranked AS (
  SELECT DISTINCT ON (u.id)
    u.id AS oli_id, r.organization_id, r.id AS rule_id
  FROM unattributed u
  JOIN product_attribution_rules r ON r.is_active = true
   AND (
     (r.match_type = 'contains'    AND lower(u.product_title) LIKE '%' || lower(r.match_pattern) || '%') OR
     (r.match_type = 'starts_with' AND lower(u.product_title) LIKE lower(r.match_pattern) || '%') OR
     (r.match_type = 'exact'       AND lower(u.product_title) = lower(r.match_pattern)) OR
     (r.match_type = 'sku_exact'   AND lower(coalesce(u.sku,'')) = lower(r.match_pattern)) OR
     (r.match_type = 'sku_contains' AND lower(coalesce(u.sku,'')) LIKE '%' || lower(r.match_pattern) || '%')
   )
  ORDER BY u.id, r.priority DESC, r.created_at ASC
)
UPDATE order_line_items oli
SET attributed_org_id = ranked.organization_id,
    attribution_rule_id = ranked.rule_id,
    attribution_confidence = 'matched',
    updated_at = now()
FROM ranked
WHERE oli.id = ranked.oli_id;

-- Refresh batch counters
UPDATE import_batches ib
SET line_items_attributed = sub.attributed,
    line_items_unattributed = sub.unattributed,
    updated_at = now()
FROM (
  SELECT
    count(*) FILTER (WHERE oli.attributed_org_id IS NOT NULL) AS attributed,
    count(*) FILTER (WHERE oli.attributed_org_id IS NULL) AS unattributed
  FROM order_line_items oli
  JOIN orders o ON o.id = oli.order_id
  WHERE o.import_batch_id = '6cc38e35-84df-4edc-8fc0-2f5e2b3f13f3'
) sub
WHERE ib.id = '6cc38e35-84df-4edc-8fc0-2f5e2b3f13f3';

-- Roll up order-level attributed_org_id (majority org per order)
WITH order_org AS (
  SELECT DISTINCT ON (oli.order_id)
    oli.order_id, oli.attributed_org_id, count(*) AS c
  FROM order_line_items oli
  JOIN orders o ON o.id = oli.order_id
  WHERE o.import_batch_id = '6cc38e35-84df-4edc-8fc0-2f5e2b3f13f3'
    AND oli.attributed_org_id IS NOT NULL
  GROUP BY oli.order_id, oli.attributed_org_id
  ORDER BY oli.order_id, count(*) DESC
)
UPDATE orders o
SET attributed_org_id = order_org.attributed_org_id,
    updated_at = now()
FROM order_org
WHERE o.id = order_org.order_id;