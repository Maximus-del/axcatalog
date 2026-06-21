-- 1) Table
CREATE TABLE public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  shopify_variant_id text NOT NULL,
  shopify_inventory_item_id text,
  sku text,
  title text,
  position int,
  option1_name text,
  option1_value text,
  option2_name text,
  option2_value text,
  option3_name text,
  option3_value text,
  color text GENERATED ALWAYS AS (
    lower(nullif(trim(
      CASE
        WHEN option1_name ILIKE 'color%' THEN option1_value
        WHEN option2_name ILIKE 'color%' THEN option2_value
        WHEN option3_name ILIKE 'color%' THEN option3_value
        ELSE NULL
      END
    ), ''))
  ) STORED,
  size text GENERATED ALWAYS AS (
    nullif(trim(
      CASE
        WHEN option1_name ILIKE 'size%' THEN option1_value
        WHEN option2_name ILIKE 'size%' THEN option2_value
        WHEN option3_name ILIKE 'size%' THEN option3_value
        ELSE NULL
      END
    ), '')
  ) STORED,
  price numeric(10,2),
  compare_at_price numeric(10,2),
  currency text NOT NULL DEFAULT 'USD',
  weight_grams int,
  barcode text,
  shopify_image_id text,
  inventory_quantity int,
  inventory_policy text,
  available boolean GENERATED ALWAYS AS (
    inventory_policy = 'continue' OR COALESCE(inventory_quantity, 0) > 0
  ) STORED,
  requires_shipping boolean NOT NULL DEFAULT true,
  taxable boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_variants_product_variant_unique UNIQUE (product_id, shopify_variant_id)
);

CREATE INDEX product_variants_product_id_idx ON public.product_variants (product_id);
CREATE INDEX product_variants_product_color_idx ON public.product_variants (product_id, color);
CREATE INDEX product_variants_product_size_idx ON public.product_variants (product_id, size);
CREATE INDEX product_variants_shopify_variant_id_idx ON public.product_variants (shopify_variant_id);
CREATE INDEX product_variants_orphaned_idx ON public.product_variants ((metadata->>'orphaned_at'));

-- 2) Grants (no anon; auth-scoped reads via RLS, admin writes via RLS, service_role for edge functions)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variants TO authenticated;
GRANT ALL ON public.product_variants TO service_role;

-- 3) RLS
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

-- 4) Policies — mirror the predicate pattern used for product_images
CREATE POLICY "Variants visible to product's org or platform admin"
ON public.product_variants
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_variants.product_id
      AND public.is_org_accessible(p.organization_id)
  )
);

CREATE POLICY "Admins can insert variants"
ON public.product_variants
FOR INSERT
TO authenticated
WITH CHECK (public.current_user_is_admin());

CREATE POLICY "Admins can update variants"
ON public.product_variants
FOR UPDATE
TO authenticated
USING (public.current_user_is_admin())
WITH CHECK (public.current_user_is_admin());

CREATE POLICY "Admins can delete variants"
ON public.product_variants
FOR DELETE
TO authenticated
USING (public.current_user_is_admin());

-- 5) updated_at trigger (reuses existing set_updated_at function)
CREATE TRIGGER product_variants_set_updated_at
BEFORE UPDATE ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
