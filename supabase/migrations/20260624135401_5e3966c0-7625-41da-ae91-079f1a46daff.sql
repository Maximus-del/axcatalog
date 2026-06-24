CREATE OR REPLACE VIEW public.public_catalog_colors AS
SELECT bc.blank_id, bc.color_name, bc.sort_order, bc.hex_code, bc.image_url, bc.image_url_back
FROM public.blank_colors bc
JOIN public.blanks b ON b.id = bc.blank_id
WHERE b.sellable_as_blank = true AND b.internal_only = false AND bc.available = true;

GRANT SELECT ON public.public_catalog_colors TO anon, authenticated;