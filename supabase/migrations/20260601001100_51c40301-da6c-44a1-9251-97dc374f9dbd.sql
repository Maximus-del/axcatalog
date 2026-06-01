
-- =========================================================
-- product_attribution_rules
-- =========================================================
CREATE TABLE public.product_attribution_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  match_type text NOT NULL CHECK (match_type IN ('starts_with','contains','regex','exact')),
  match_pattern text NOT NULL,
  priority int NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_par_org_active_priority ON public.product_attribution_rules(organization_id, is_active, priority DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_attribution_rules TO authenticated;
GRANT ALL ON public.product_attribution_rules TO service_role;

ALTER TABLE public.product_attribution_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin read attribution rules" ON public.product_attribution_rules
  FOR SELECT TO authenticated
  USING (organization_id = current_user_org_id() AND current_user_is_admin());
CREATE POLICY "admin write attribution rules" ON public.product_attribution_rules
  FOR ALL TO authenticated
  USING (organization_id = current_user_org_id() AND current_user_is_admin())
  WITH CHECK (organization_id = current_user_org_id() AND current_user_is_admin());

CREATE TRIGGER trg_par_updated_at BEFORE UPDATE ON public.product_attribution_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- import_batches
-- =========================================================
CREATE TABLE public.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  file_name text NOT NULL,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  total_rows int NOT NULL DEFAULT 0,
  orders_imported int NOT NULL DEFAULT 0,
  orders_skipped int NOT NULL DEFAULT 0,
  line_items_imported int NOT NULL DEFAULT 0,
  line_items_attributed int NOT NULL DEFAULT 0,
  line_items_unattributed int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','complete','failed','partial')),
  error_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_import_batches_org_uploaded ON public.import_batches(organization_id, uploaded_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_batches TO authenticated;
GRANT ALL ON public.import_batches TO service_role;

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin read import batches" ON public.import_batches
  FOR SELECT TO authenticated
  USING (organization_id = current_user_org_id() AND current_user_is_admin());
CREATE POLICY "admin write import batches" ON public.import_batches
  FOR ALL TO authenticated
  USING (organization_id = current_user_org_id() AND current_user_is_admin())
  WITH CHECK (organization_id = current_user_org_id() AND current_user_is_admin());

CREATE TRIGGER trg_import_batches_updated_at BEFORE UPDATE ON public.import_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- orders (historical CSV imports)
-- distinct from shopify_orders, which is for live API sync
-- =========================================================
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,  -- org that owns the import (uploader's org)
  shopify_order_id text,
  shopify_order_name text,
  order_date timestamptz,
  customer_email text,
  customer_name text,
  subtotal numeric,
  shipping numeric,
  tax numeric,
  discount numeric,
  total numeric,
  currency text NOT NULL DEFAULT 'USD',
  financial_status text,
  fulfillment_status text,
  is_test boolean NOT NULL DEFAULT false,
  is_refund boolean NOT NULL DEFAULT false,
  raw_csv_row jsonb,
  import_batch_id uuid,
  imported_at timestamptz NOT NULL DEFAULT now(),
  attributed_org_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, shopify_order_id)
);
CREATE INDEX idx_orders_org_date ON public.orders(organization_id, order_date DESC);
CREATE INDEX idx_orders_attributed_org ON public.orders(attributed_org_id);
CREATE INDEX idx_orders_batch ON public.orders(import_batch_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin read orders" ON public.orders
  FOR SELECT TO authenticated
  USING (organization_id = current_user_org_id() AND current_user_is_admin());
CREATE POLICY "admin write orders" ON public.orders
  FOR ALL TO authenticated
  USING (organization_id = current_user_org_id() AND current_user_is_admin())
  WITH CHECK (organization_id = current_user_org_id() AND current_user_is_admin());

CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- order_line_items
-- =========================================================
CREATE TABLE public.order_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  order_id uuid NOT NULL,
  shopify_line_item_id text,
  product_id uuid,
  product_title text NOT NULL,
  variant_title text,
  sku text,
  quantity int NOT NULL DEFAULT 0,
  unit_price numeric,
  line_total numeric,
  attributed_org_id uuid,
  attribution_rule_id uuid,
  attribution_confidence text NOT NULL DEFAULT 'unattributed'
    CHECK (attribution_confidence IN ('matched','unattributed','manual_override')),
  raw_csv_row jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_oli_order ON public.order_line_items(order_id);
CREATE INDEX idx_oli_product ON public.order_line_items(product_id);
CREATE INDEX idx_oli_attributed_org ON public.order_line_items(attributed_org_id);
CREATE INDEX idx_oli_confidence ON public.order_line_items(organization_id, attribution_confidence);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_line_items TO authenticated;
GRANT ALL ON public.order_line_items TO service_role;

ALTER TABLE public.order_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin read order line items" ON public.order_line_items
  FOR SELECT TO authenticated
  USING (organization_id = current_user_org_id() AND current_user_is_admin());
CREATE POLICY "admin write order line items" ON public.order_line_items
  FOR ALL TO authenticated
  USING (organization_id = current_user_org_id() AND current_user_is_admin())
  WITH CHECK (organization_id = current_user_org_id() AND current_user_is_admin());

-- Allow linked athletes to read line items attributed to a product tied to their athlete
CREATE POLICY "athlete read attributed line items" ON public.order_line_items
  FOR SELECT TO authenticated
  USING (
    organization_id = current_user_org_id()
    AND NOT current_user_is_admin()
    AND EXISTS (
      SELECT 1
      FROM public.product_athletes pa
      JOIN public.user_athlete_links ual ON ual.athlete_id = pa.athlete_id
      WHERE pa.product_id = order_line_items.product_id
        AND ual.user_id = auth.uid()
    )
  );

-- Allow linked athletes to read parent orders for any line item they can see
CREATE POLICY "athlete read parent orders" ON public.orders
  FOR SELECT TO authenticated
  USING (
    organization_id = current_user_org_id()
    AND NOT current_user_is_admin()
    AND EXISTS (
      SELECT 1
      FROM public.order_line_items oli
      JOIN public.product_athletes pa ON pa.product_id = oli.product_id
      JOIN public.user_athlete_links ual ON ual.athlete_id = pa.athlete_id
      WHERE oli.order_id = orders.id
        AND ual.user_id = auth.uid()
    )
  );

CREATE TRIGGER trg_oli_updated_at BEFORE UPDATE ON public.order_line_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- Seed Mooney's attribution rules under Athlete Xclusive org
-- =========================================================
INSERT INTO public.product_attribution_rules (organization_id, match_type, match_pattern, priority, notes)
VALUES
  ('2d6f377e-4fe8-448b-84b3-42aed237f3da', 'starts_with', 'Mooney World',  100, 'Mooney'),
  ('2d6f377e-4fe8-448b-84b3-42aed237f3da', 'starts_with', 'MooneyWorld',   100, 'Mooney (no space)'),
  ('2d6f377e-4fe8-448b-84b3-42aed237f3da', 'starts_with', 'ATL Arrival',    90, 'Mooney'),
  ('2d6f377e-4fe8-448b-84b3-42aed237f3da', 'starts_with', 'Rise Up',        90, 'Mooney'),
  ('2d6f377e-4fe8-448b-84b3-42aed237f3da', 'starts_with', 'WR 11',          90, 'Mooney');
