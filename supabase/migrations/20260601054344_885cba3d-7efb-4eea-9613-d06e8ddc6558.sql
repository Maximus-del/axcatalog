-- Partial unique: only enforce when shopify_order_id is present, so manually-created
-- orders (with NULL) are still allowed.
CREATE UNIQUE INDEX IF NOT EXISTS orders_shopify_order_id_unique
  ON public.orders (shopify_order_id)
  WHERE shopify_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_attributed_org_idx
  ON public.orders (attributed_org_id) WHERE attributed_org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS order_line_items_attributed_org_idx
  ON public.order_line_items (attributed_org_id);

CREATE INDEX IF NOT EXISTS order_line_items_order_idx
  ON public.order_line_items (order_id);

CREATE INDEX IF NOT EXISTS order_line_items_product_idx
  ON public.order_line_items (product_id) WHERE product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS product_attribution_rules_active_idx
  ON public.product_attribution_rules (is_active, priority DESC) WHERE is_active = true;
