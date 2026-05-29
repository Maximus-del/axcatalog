-- 1) Extend blanks table with supplier/cost fields
ALTER TABLE public.blanks
  ADD COLUMN IF NOT EXISTS supplier text,
  ADD COLUMN IF NOT EXISTS garment_title text,
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS color text,
  ADD COLUMN IF NOT EXISTS fabric text,
  ADD COLUMN IF NOT EXISTS url text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS blank_cost numeric,
  ADD COLUMN IF NOT EXISTS decoration_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS additional_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS markup_multiplier numeric NOT NULL DEFAULT 2.5,
  ADD COLUMN IF NOT EXISTS cost_last_updated timestamptz;

-- 2) Drop the previously-added product-level cost columns
ALTER TABLE public.products
  DROP COLUMN IF EXISTS blank_supplier,
  DROP COLUMN IF EXISTS blank_sku,
  DROP COLUMN IF EXISTS blank_url,
  DROP COLUMN IF EXISTS blank_cost,
  DROP COLUMN IF EXISTS decoration_cost,
  DROP COLUMN IF EXISTS additional_cost,
  DROP COLUMN IF EXISTS markup_multiplier,
  DROP COLUMN IF EXISTS fabric,
  DROP COLUMN IF EXISTS garment_title,
  DROP COLUMN IF EXISTS cost_last_updated;

-- products.blank_id already exists per schema; ensure FK
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_blank_id_fkey'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_blank_id_fkey
      FOREIGN KEY (blank_id) REFERENCES public.blanks(id) ON DELETE SET NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_products_blank_id ON public.products(blank_id);

-- 3) Update wholesale_price_source CHECK to include new value
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_wholesale_price_source_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_wholesale_price_source_check
  CHECK (wholesale_price_source IN ('manual', 'computed', 'computed_from_blank'));

-- 4) Replace trigger function: compute from linked blank
CREATE OR REPLACE FUNCTION public.products_compute_wholesale_price()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  b record;
  v_total numeric;
BEGIN
  IF NEW.blank_id IS NOT NULL THEN
    SELECT blank_cost, decoration_cost, additional_cost, markup_multiplier
      INTO b
      FROM public.blanks
     WHERE id = NEW.blank_id;

    IF FOUND AND b.blank_cost IS NOT NULL AND b.markup_multiplier IS NOT NULL THEN
      v_total := (COALESCE(b.blank_cost,0) + COALESCE(b.decoration_cost,0) + COALESCE(b.additional_cost,0))
                 * b.markup_multiplier;
      NEW.wholesale_price := round(v_total::numeric, 2);
      NEW.wholesale_price_source := 'computed_from_blank';
    END IF;
  ELSE
    -- No blank linked: keep existing wholesale_price, mark as manual
    IF NEW.wholesale_price_source = 'computed_from_blank' THEN
      NEW.wholesale_price_source := 'manual';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_compute_wholesale_price ON public.products;
CREATE TRIGGER trg_products_compute_wholesale_price
BEFORE INSERT OR UPDATE OF blank_id, wholesale_price ON public.products
FOR EACH ROW EXECUTE FUNCTION public.products_compute_wholesale_price();

-- 5) When a blank's cost fields change, ripple to all linked products
CREATE OR REPLACE FUNCTION public.blanks_ripple_wholesale_price()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_total numeric;
BEGIN
  IF NEW.blank_cost IS DISTINCT FROM OLD.blank_cost
     OR NEW.decoration_cost IS DISTINCT FROM OLD.decoration_cost
     OR NEW.additional_cost IS DISTINCT FROM OLD.additional_cost
     OR NEW.markup_multiplier IS DISTINCT FROM OLD.markup_multiplier THEN

    NEW.cost_last_updated := now();

    IF NEW.blank_cost IS NOT NULL AND NEW.markup_multiplier IS NOT NULL THEN
      v_total := (COALESCE(NEW.blank_cost,0) + COALESCE(NEW.decoration_cost,0) + COALESCE(NEW.additional_cost,0))
                 * NEW.markup_multiplier;
      UPDATE public.products
         SET wholesale_price = round(v_total::numeric, 2),
             wholesale_price_source = 'computed_from_blank'
       WHERE blank_id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_blanks_ripple_wholesale_price ON public.blanks;
CREATE TRIGGER trg_blanks_ripple_wholesale_price
BEFORE UPDATE ON public.blanks
FOR EACH ROW EXECUTE FUNCTION public.blanks_ripple_wholesale_price();
