
WITH matched AS (
  SELECT DISTINCT ON (oli.id)
    oli.id AS li_id,
    r.organization_id AS org_id,
    r.id AS rule_id
  FROM order_line_items oli
  JOIN orders o ON o.id = oli.order_id
  JOIN product_attribution_rules r ON r.is_active = true
  WHERE oli.attributed_org_id IS NULL
    AND (
      (r.match_type = 'contains'     AND lower(oli.product_title) LIKE '%' || lower(r.match_pattern) || '%') OR
      (r.match_type = 'starts_with'  AND lower(oli.product_title) LIKE lower(r.match_pattern) || '%') OR
      (r.match_type = 'exact'        AND lower(oli.product_title) = lower(r.match_pattern)) OR
      (r.match_type = 'sku_exact'    AND oli.sku IS NOT NULL AND lower(oli.sku) = lower(r.match_pattern)) OR
      (r.match_type = 'sku_contains' AND oli.sku IS NOT NULL AND lower(oli.sku) LIKE '%' || lower(r.match_pattern) || '%') OR
      (r.match_type = 'tag_contains' AND lower(coalesce(o.raw_csv_row->>'Tags','')) LIKE '%' || lower(r.match_pattern) || '%')
    )
  ORDER BY oli.id, r.priority DESC, r.id
)
UPDATE order_line_items oli
SET attributed_org_id = m.org_id,
    attribution_rule_id = m.rule_id,
    attribution_confidence = 'matched'
FROM matched m
WHERE oli.id = m.li_id;

UPDATE order_line_items oli
SET attributed_org_id = p.organization_id,
    product_id = COALESCE(oli.product_id, p.id),
    attribution_confidence = 'matched'
FROM products p
WHERE oli.attributed_org_id IS NULL
  AND lower(p.title) = lower(oli.product_title);

UPDATE orders o
SET attributed_org_id = sub.only_org
FROM (
  SELECT order_id, (array_agg(DISTINCT attributed_org_id))[1] AS only_org
  FROM order_line_items
  WHERE attributed_org_id IS NOT NULL
  GROUP BY order_id
  HAVING COUNT(DISTINCT attributed_org_id) = 1
) sub
WHERE o.id = sub.order_id;

UPDATE import_batches b
SET line_items_imported = sub.total,
    line_items_attributed = sub.attr,
    line_items_unattributed = sub.total - sub.attr,
    orders_imported = sub.orders
FROM (
  SELECT
    o.import_batch_id,
    COUNT(oli.*) AS total,
    COUNT(oli.attributed_org_id) AS attr,
    COUNT(DISTINCT o.id) AS orders
  FROM orders o
  LEFT JOIN order_line_items oli ON oli.order_id = o.id
  WHERE o.import_batch_id IS NOT NULL
  GROUP BY o.import_batch_id
) sub
WHERE b.id = sub.import_batch_id;
