
ALTER TABLE public.blanks DROP COLUMN IF EXISTS markup_multiplier;

DROP FUNCTION IF EXISTS public.blanks_ripple_wholesale_price() CASCADE;
DROP FUNCTION IF EXISTS public.products_compute_wholesale_price() CASCADE;

CREATE OR REPLACE FUNCTION public.blanks_touch_cost_timestamp()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.blank_cost IS DISTINCT FROM OLD.blank_cost
     OR NEW.decoration_cost IS DISTINCT FROM OLD.decoration_cost
     OR NEW.additional_cost IS DISTINCT FROM OLD.additional_cost THEN
    NEW.cost_last_updated := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS blanks_touch_cost_timestamp ON public.blanks;
CREATE TRIGGER blanks_touch_cost_timestamp
BEFORE UPDATE ON public.blanks
FOR EACH ROW EXECUTE FUNCTION public.blanks_touch_cost_timestamp();

CREATE TABLE public.pricing_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  base_markup_multiplier numeric NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pricing_tiers TO anon, authenticated;
GRANT ALL ON public.pricing_tiers TO service_role;
ALTER TABLE public.pricing_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone authed can read pricing tiers"
  ON public.pricing_tiers FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage pricing tiers"
  ON public.pricing_tiers FOR ALL TO authenticated
  USING (current_user_is_admin()) WITH CHECK (current_user_is_admin());
CREATE UNIQUE INDEX pricing_tiers_only_one_default
  ON public.pricing_tiers ((is_default)) WHERE is_default;

INSERT INTO public.pricing_tiers (name, base_markup_multiplier, sort_order, is_default) VALUES
  ('Athlete',   1.6, 1, false),
  ('Corporate', 2.0, 2, false),
  ('Standard',  2.5, 3, true);

CREATE TABLE public.volume_discount_breaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pricing_tier_id uuid NULL REFERENCES public.pricing_tiers(id) ON DELETE CASCADE,
  min_units int NOT NULL CHECK (min_units > 0),
  discount_percent numeric NOT NULL CHECK (discount_percent >= 0 AND discount_percent <= 100),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX volume_discount_breaks_tier_idx
  ON public.volume_discount_breaks (pricing_tier_id, min_units);
GRANT SELECT ON public.volume_discount_breaks TO anon, authenticated;
GRANT ALL ON public.volume_discount_breaks TO service_role;
ALTER TABLE public.volume_discount_breaks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone authed can read volume breaks"
  ON public.volume_discount_breaks FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage volume breaks"
  ON public.volume_discount_breaks FOR ALL TO authenticated
  USING (current_user_is_admin()) WITH CHECK (current_user_is_admin());

INSERT INTO public.volume_discount_breaks (pricing_tier_id, min_units, discount_percent) VALUES
  (NULL, 25,  5),
  (NULL, 50,  10),
  (NULL, 100, 15),
  (NULL, 250, 20);

ALTER TABLE public.organizations
  ADD COLUMN pricing_tier_id uuid NULL REFERENCES public.pricing_tiers(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.products.wholesale_price_source IS
  'manual = no blank linked, wholesale_price is static. computed_from_blank = price derived via compute_wholesale_price().';

UPDATE public.products SET wholesale_price_source = 'computed_from_blank' WHERE blank_id IS NOT NULL;
UPDATE public.products SET wholesale_price_source = 'manual' WHERE blank_id IS NULL;

CREATE OR REPLACE FUNCTION public.compute_wholesale_price(
  _product_id uuid,
  _organization_id uuid,
  _unit_count int
)
RETURNS TABLE (
  unit_price numeric,
  tier_name text,
  base_tier_price numeric,
  volume_discount_percent numeric,
  true_cost numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_blank_id uuid;
  v_true_cost numeric;
  v_tier_id uuid;
  v_tier_name text;
  v_markup numeric;
  v_base numeric;
  v_discount numeric := 0;
BEGIN
  SELECT p.blank_id INTO v_blank_id FROM public.products p WHERE p.id = _product_id;
  IF v_blank_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(b.blank_cost,0) + COALESCE(b.decoration_cost,0) + COALESCE(b.additional_cost,0)
    INTO v_true_cost FROM public.blanks b WHERE b.id = v_blank_id;

  SELECT t.id, t.name, t.base_markup_multiplier
    INTO v_tier_id, v_tier_name, v_markup
    FROM public.organizations o
    JOIN public.pricing_tiers t ON t.id = o.pricing_tier_id
   WHERE o.id = _organization_id;

  IF v_tier_id IS NULL THEN
    SELECT t.id, t.name, t.base_markup_multiplier
      INTO v_tier_id, v_tier_name, v_markup
      FROM public.pricing_tiers t WHERE t.is_default = true LIMIT 1;
  END IF;

  v_base := round((v_true_cost * COALESCE(v_markup, 1))::numeric, 2);

  SELECT vdb.discount_percent INTO v_discount
    FROM public.volume_discount_breaks vdb
   WHERE vdb.min_units <= COALESCE(_unit_count, 0)
     AND (vdb.pricing_tier_id = v_tier_id OR vdb.pricing_tier_id IS NULL)
   ORDER BY vdb.min_units DESC LIMIT 1;

  v_discount := COALESCE(v_discount, 0);

  unit_price := round((v_base * (1 - v_discount/100.0))::numeric, 2);
  tier_name := v_tier_name;
  base_tier_price := v_base;
  volume_discount_percent := v_discount;
  true_cost := round(v_true_cost::numeric, 2);
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_wholesale_price(uuid, uuid, int) TO authenticated, anon, service_role;
