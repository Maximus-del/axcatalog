
WITH batch_orders AS (
  SELECT id FROM orders WHERE import_batch_id = '6cc38e35-84df-4edc-8fc0-2f5e2b3f13f3'
)
UPDATE order_line_items SET attributed_org_id = NULL, attribution_rule_id = NULL, attribution_confidence = 'unattributed'
WHERE order_id IN (SELECT id FROM batch_orders);

-- Apply rule-based attribution (highest priority rule wins per line item, case-insensitive)
WITH batch_lis AS (
  SELECT li.id, li.product_title, li.sku
  FROM order_line_items li
  JOIN orders o ON o.id = li.order_id
  WHERE o.import_batch_id = '6cc38e35-84df-4edc-8fc0-2f5e2b3f13f3'
),
matches AS (
  SELECT DISTINCT ON (li.id) li.id AS line_item_id, r.organization_id, r.id AS rule_id
  FROM batch_lis li
  JOIN product_attribution_rules r ON r.is_active = true
   AND (
     (r.match_type = 'contains'      AND lower(li.product_title) LIKE '%' || lower(r.match_pattern) || '%') OR
     (r.match_type = 'starts_with'   AND lower(li.product_title) LIKE lower(r.match_pattern) || '%') OR
     (r.match_type = 'exact'         AND lower(li.product_title) = lower(r.match_pattern)) OR
     (r.match_type = 'sku_exact'     AND lower(coalesce(li.sku,'')) = lower(r.match_pattern)) OR
     (r.match_type = 'sku_contains'  AND lower(coalesce(li.sku,'')) LIKE '%' || lower(r.match_pattern) || '%')
   )
  ORDER BY li.id, r.priority DESC, r.created_at ASC
)
UPDATE order_line_items li
SET attributed_org_id = m.organization_id,
    attribution_rule_id = m.rule_id,
    attribution_confidence = 'matched'
FROM matches m
WHERE li.id = m.line_item_id;

-- Product-title fallback for still-unattributed
WITH batch_lis AS (
  SELECT li.id, li.product_title, li.sku
  FROM order_line_items li
  JOIN orders o ON o.id = li.order_id
  WHERE o.import_batch_id = '6cc38e35-84df-4edc-8fc0-2f5e2b3f13f3'
    AND li.attributed_org_id IS NULL
),
prod_match AS (
  SELECT DISTINCT ON (li.id) li.id AS line_item_id, p.organization_id, p.id AS product_id
  FROM batch_lis li
  JOIN products p ON lower(p.title) = lower(li.product_title)
                 OR (li.sku IS NOT NULL AND lower(p.sku) = lower(li.sku))
  ORDER BY li.id, p.created_at ASC
)
UPDATE order_line_items li
SET attributed_org_id = pm.organization_id,
    product_id = pm.product_id,
    attribution_confidence = 'matched'
FROM prod_match pm
WHERE li.id = pm.line_item_id;

-- Order-level rollup: majority org per order
WITH batch_orders AS (
  SELECT id FROM orders WHERE import_batch_id = '6cc38e35-84df-4edc-8fc0-2f5e2b3f13f3'
),
order_majority AS (
  SELECT DISTINCT ON (li.order_id) li.order_id, li.attributed_org_id
  FROM order_line_items li
  WHERE li.order_id IN (SELECT id FROM batch_orders)
    AND li.attributed_org_id IS NOT NULL
  GROUP BY li.order_id, li.attributed_org_id
  ORDER BY li.order_id, COUNT(*) DESC
)
UPDATE orders o
SET attributed_org_id = om.attributed_org_id
FROM order_majority om
WHERE o.id = om.order_id;

-- Update batch counters
UPDATE import_batches SET
  line_items_attributed = (SELECT COUNT(*) FROM order_line_items li JOIN orders o ON o.id = li.order_id
                            WHERE o.import_batch_id = '6cc38e35-84df-4edc-8fc0-2f5e2b3f13f3' AND li.attributed_org_id IS NOT NULL),
  line_items_unattributed = (SELECT COUNT(*) FROM order_line_items li JOIN orders o ON o.id = li.order_id
                              WHERE o.import_batch_id = '6cc38e35-84df-4edc-8fc0-2f5e2b3f13f3' AND li.attributed_org_id IS NULL)
WHERE id = '6cc38e35-84df-4edc-8fc0-2f5e2b3f13f3';
