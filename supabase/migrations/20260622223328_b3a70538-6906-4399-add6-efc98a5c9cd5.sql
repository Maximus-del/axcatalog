
CREATE OR REPLACE VIEW public.public_catalog_colors
WITH (security_invoker = false) AS
SELECT bc.blank_id, bc.color_name, bc.sort_order
FROM public.blank_colors bc
JOIN public.blanks b ON b.id = bc.blank_id
WHERE b.sellable_as_blank = true
  AND b.internal_only = false
  AND bc.available = true;

CREATE OR REPLACE VIEW public.public_catalog_sizes
WITH (security_invoker = false) AS
SELECT bs.blank_id, bs.size, bs.sort_order
FROM public.blank_sizes bs
JOIN public.blanks b ON b.id = bs.blank_id
WHERE b.sellable_as_blank = true
  AND b.internal_only = false
  AND bs.available = true;

GRANT SELECT ON public.public_catalog_colors TO anon, authenticated;
GRANT SELECT ON public.public_catalog_sizes  TO anon, authenticated;
