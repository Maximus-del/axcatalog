
-- 1. Blanks: per-tier MOQ prices
ALTER TABLE public.blanks
  ADD COLUMN IF NOT EXISTS price_athlete numeric,
  ADD COLUMN IF NOT EXISTS price_corporate numeric,
  ADD COLUMN IF NOT EXISTS price_standard numeric;

-- 2. Drop multiplier from pricing_tiers
ALTER TABLE public.pricing_tiers
  DROP COLUMN IF EXISTS base_markup_multiplier;

-- 3. volume_discount_breaks: add label + max_units
ALTER TABLE public.volume_discount_breaks
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS max_units integer;

-- 4. system_settings (singleton k/v)
CREATE TABLE IF NOT EXISTS public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authed read system_settings"
  ON public.system_settings FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "admin write system_settings"
  ON public.system_settings FOR ALL
  TO authenticated
  USING (current_user_is_admin())
  WITH CHECK (current_user_is_admin());

INSERT INTO public.system_settings (key, value)
VALUES ('moq_units', '10'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 5. Rewrite compute_wholesale_price
DROP FUNCTION IF EXISTS public.compute_wholesale_price(uuid, uuid, integer);

CREATE OR REPLACE FUNCTION public.compute_wholesale_price(
  _product_id uuid,
  _organization_id uuid,
  _unit_count integer
)
RETURNS TABLE (
  unit_price numeric,
  tier_moq_price numeric,
  tier_name text,
  volume_modifier_percent numeric,
  volume_break_label text,
  true_cost numeric,
  margin_per_unit numeric,
  margin_percent numeric,
  pricing_incomplete boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_blank_id uuid;
  v_blank public.blanks%ROWTYPE;
  v_tier_id uuid;
  v_tier_name text;
  v_tier_moq numeric;
  v_modifier numeric := 0;
  v_label text;
  v_cost numeric;
  v_price numeric;
BEGIN
  SELECT blank_id INTO v_blank_id FROM public.products WHERE id = _product_id;
  IF v_blank_id IS NULL THEN RETURN; END IF;

  SELECT * INTO v_blank FROM public.blanks WHERE id = v_blank_id;

  SELECT t.id, t.name INTO v_tier_id, v_tier_name
    FROM public.organizations o
    JOIN public.pricing_tiers t ON t.id = o.pricing_tier_id
   WHERE o.id = _organization_id;

  IF v_tier_id IS NULL THEN
    SELECT id, name INTO v_tier_id, v_tier_name
      FROM public.pricing_tiers WHERE is_default = true LIMIT 1;
  END IF;

  v_tier_moq := CASE lower(coalesce(v_tier_name,'standard'))
    WHEN 'athlete'   THEN v_blank.price_athlete
    WHEN 'corporate' THEN v_blank.price_corporate
    ELSE v_blank.price_standard
  END;

  v_cost := round((COALESCE(v_blank.blank_cost,0)
                 + COALESCE(v_blank.decoration_cost,0)
                 + COALESCE(v_blank.additional_cost,0))::numeric, 2);

  SELECT vdb.discount_percent, vdb.label
    INTO v_modifier, v_label
    FROM public.volume_discount_breaks vdb
   WHERE (vdb.pricing_tier_id = v_tier_id OR vdb.pricing_tier_id IS NULL)
     AND vdb.min_units <= COALESCE(_unit_count, 0)
     AND COALESCE(_unit_count, 0) <= COALESCE(vdb.max_units, 2147483647)
   ORDER BY vdb.pricing_tier_id NULLS LAST, vdb.min_units DESC
   LIMIT 1;

  v_modifier := COALESCE(v_modifier, 0);

  IF v_tier_moq IS NULL THEN
    unit_price := NULL;
    tier_moq_price := NULL;
    tier_name := v_tier_name;
    volume_modifier_percent := v_modifier;
    volume_break_label := v_label;
    true_cost := v_cost;
    margin_per_unit := NULL;
    margin_percent := NULL;
    pricing_incomplete := true;
    RETURN NEXT;
    RETURN;
  END IF;

  v_price := round((v_tier_moq * (1 + v_modifier/100.0))::numeric, 2);

  unit_price := v_price;
  tier_moq_price := round(v_tier_moq::numeric, 2);
  tier_name := v_tier_name;
  volume_modifier_percent := v_modifier;
  volume_break_label := v_label;
  true_cost := v_cost;
  margin_per_unit := round((v_price - v_cost)::numeric, 2);
  margin_percent := CASE WHEN v_price > 0
    THEN round((((v_price - v_cost) / v_price) * 100)::numeric, 2)
    ELSE NULL END;
  pricing_incomplete := false;
  RETURN NEXT;
END;
$$;
