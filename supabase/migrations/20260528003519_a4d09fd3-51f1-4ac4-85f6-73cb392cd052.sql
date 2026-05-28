
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS wholesale_price numeric;

UPDATE public.products
  SET wholesale_price = ROUND((price * 0.5)::numeric, 2)
  WHERE wholesale_price IS NULL AND price IS NOT NULL;

ALTER TABLE public.bulk_order_items
  ADD COLUMN IF NOT EXISTS unit_wholesale_price numeric,
  ADD COLUMN IF NOT EXISTS unit_retail_price numeric,
  ADD COLUMN IF NOT EXISTS line_subtotal numeric;

ALTER TABLE public.bulk_order_requests
  ADD COLUMN IF NOT EXISTS wholesale_subtotal numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retail_equivalent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_savings numeric NOT NULL DEFAULT 0;
