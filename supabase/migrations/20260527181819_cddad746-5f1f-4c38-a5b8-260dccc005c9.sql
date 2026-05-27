
-- 1) Per-portal hidden products (multi-select hide)
CREATE TABLE public.portal_hidden_products (
  athlete_id uuid NOT NULL,
  product_id uuid NOT NULL,
  hidden_by uuid,
  hidden_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (athlete_id, product_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_hidden_products TO authenticated;
GRANT ALL ON public.portal_hidden_products TO service_role;
ALTER TABLE public.portal_hidden_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin all portal_hidden_products"
  ON public.portal_hidden_products FOR ALL TO authenticated
  USING (current_user_is_admin()) WITH CHECK (current_user_is_admin());

CREATE POLICY "athlete read own portal_hidden_products"
  ON public.portal_hidden_products FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM user_athlete_links ual WHERE ual.user_id = auth.uid() AND ual.athlete_id = portal_hidden_products.athlete_id));

CREATE POLICY "athlete write own portal_hidden_products"
  ON public.portal_hidden_products FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM user_athlete_links ual WHERE ual.user_id = auth.uid() AND ual.athlete_id = portal_hidden_products.athlete_id));

CREATE POLICY "athlete delete own portal_hidden_products"
  ON public.portal_hidden_products FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_athlete_links ual WHERE ual.user_id = auth.uid() AND ual.athlete_id = portal_hidden_products.athlete_id));

-- 2) Per-product social assets (content gallery uploads)
CREATE TABLE public.product_social_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  product_id uuid NOT NULL,
  athlete_id uuid,
  uploaded_by uuid,
  storage_bucket text NOT NULL DEFAULT 'product-social-assets',
  storage_path text NOT NULL,
  file_name text,
  mime_type text,
  file_size_bytes bigint,
  caption text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_social_assets TO authenticated;
GRANT ALL ON public.product_social_assets TO service_role;
ALTER TABLE public.product_social_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin all product_social_assets"
  ON public.product_social_assets FOR ALL TO authenticated
  USING ((organization_id = current_user_org_id()) AND current_user_is_admin())
  WITH CHECK ((organization_id = current_user_org_id()) AND current_user_is_admin());

CREATE POLICY "athlete read own product_social_assets"
  ON public.product_social_assets FOR SELECT TO authenticated
  USING (
    organization_id = current_user_org_id() AND EXISTS (
      SELECT 1 FROM product_athletes pa
      JOIN user_athlete_links ual ON ual.athlete_id = pa.athlete_id
      WHERE pa.product_id = product_social_assets.product_id AND ual.user_id = auth.uid()
    )
  );

CREATE POLICY "athlete insert own product_social_assets"
  ON public.product_social_assets FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = current_user_org_id() AND EXISTS (
      SELECT 1 FROM product_athletes pa
      JOIN user_athlete_links ual ON ual.athlete_id = pa.athlete_id
      WHERE pa.product_id = product_social_assets.product_id AND ual.user_id = auth.uid()
    )
  );

CREATE POLICY "athlete delete own product_social_assets"
  ON public.product_social_assets FOR DELETE TO authenticated
  USING (
    organization_id = current_user_org_id()
    AND uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM product_athletes pa
      JOIN user_athlete_links ual ON ual.athlete_id = pa.athlete_id
      WHERE pa.product_id = product_social_assets.product_id AND ual.user_id = auth.uid()
    )
  );

CREATE INDEX idx_product_social_assets_product ON public.product_social_assets(product_id);

-- 3) Storage bucket for social assets (public for easy display)
INSERT INTO storage.buckets (id, name, public) VALUES ('product-social-assets', 'product-social-assets', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "social assets public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-social-assets');

CREATE POLICY "social assets auth insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-social-assets');

CREATE POLICY "social assets owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-social-assets' AND owner = auth.uid());

-- 4) Pricing config: base markup % + volume discount tiers per org
CREATE TABLE public.org_pricing_config (
  organization_id uuid PRIMARY KEY,
  base_markup_pct numeric NOT NULL DEFAULT 50,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.org_pricing_config TO authenticated;
GRANT ALL ON public.org_pricing_config TO service_role;
ALTER TABLE public.org_pricing_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org read pricing config"
  ON public.org_pricing_config FOR SELECT TO authenticated
  USING (organization_id = current_user_org_id());

CREATE POLICY "admin write pricing config"
  ON public.org_pricing_config FOR ALL TO authenticated
  USING ((organization_id = current_user_org_id()) AND current_user_is_admin())
  WITH CHECK ((organization_id = current_user_org_id()) AND current_user_is_admin());

CREATE TABLE public.volume_discount_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  min_qty int NOT NULL,
  discount_pct numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.volume_discount_tiers TO authenticated;
GRANT ALL ON public.volume_discount_tiers TO service_role;
ALTER TABLE public.volume_discount_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org read tiers"
  ON public.volume_discount_tiers FOR SELECT TO authenticated
  USING (organization_id = current_user_org_id());

CREATE POLICY "admin write tiers"
  ON public.volume_discount_tiers FOR ALL TO authenticated
  USING ((organization_id = current_user_org_id()) AND current_user_is_admin())
  WITH CHECK ((organization_id = current_user_org_id()) AND current_user_is_admin());

CREATE INDEX idx_tiers_org_qty ON public.volume_discount_tiers(organization_id, min_qty);
