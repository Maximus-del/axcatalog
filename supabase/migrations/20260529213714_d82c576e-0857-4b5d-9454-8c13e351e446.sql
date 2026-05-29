-- Cost & pricing fields for products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS blank_supplier text,
  ADD COLUMN IF NOT EXISTS blank_sku text,
  ADD COLUMN IF NOT EXISTS blank_url text,
  ADD COLUMN IF NOT EXISTS blank_cost numeric,
  ADD COLUMN IF NOT EXISTS decoration_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS additional_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS markup_multiplier numeric NOT NULL DEFAULT 2.5,
  ADD COLUMN IF NOT EXISTS fabric text,
  ADD COLUMN IF NOT EXISTS garment_title text,
  ADD COLUMN IF NOT EXISTS cost_last_updated timestamptz,
  ADD COLUMN IF NOT EXISTS wholesale_price_source text NOT NULL DEFAULT 'manual';

-- Constrain source values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_wholesale_price_source_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_wholesale_price_source_check
      CHECK (wholesale_price_source IN ('manual','computed'));
  END IF;
END$$;

-- Trigger: when cost fields are set, compute wholesale_price and flip source to 'computed'.
-- If cost fields are cleared, leave existing wholesale_price as-is (manual fallback).
CREATE OR REPLACE FUNCTION public.products_compute_wholesale_price()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_total numeric;
BEGIN
  IF NEW.blank_cost IS NOT NULL AND NEW.markup_multiplier IS NOT NULL THEN
    v_total := (COALESCE(NEW.blank_cost,0) + COALESCE(NEW.decoration_cost,0) + COALESCE(NEW.additional_cost,0))
               * NEW.markup_multiplier;
    NEW.wholesale_price := round(v_total::numeric, 2);
    NEW.wholesale_price_source := 'computed';

    IF (TG_OP = 'INSERT')
       OR NEW.blank_cost IS DISTINCT FROM OLD.blank_cost
       OR NEW.decoration_cost IS DISTINCT FROM OLD.decoration_cost
       OR NEW.additional_cost IS DISTINCT FROM OLD.additional_cost
       OR NEW.markup_multiplier IS DISTINCT FROM OLD.markup_multiplier THEN
      NEW.cost_last_updated := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_compute_wholesale_price ON public.products;
CREATE TRIGGER trg_products_compute_wholesale_price
BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.products_compute_wholesale_price();