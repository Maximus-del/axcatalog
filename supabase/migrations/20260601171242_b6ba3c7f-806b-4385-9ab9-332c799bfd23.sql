ALTER TABLE public.order_line_items
ADD COLUMN IF NOT EXISTS is_upcharge boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_order_line_items_is_upcharge
  ON public.order_line_items(is_upcharge) WHERE is_upcharge = true;