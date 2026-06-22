CREATE OR REPLACE VIEW public.public_catalog AS
SELECT
  id,
  sku,
  name,
  garment_type::text AS garment_type,
  price_athlete,
  price_corporate,
  price_standard,
  image_url
FROM public.blanks
WHERE sellable_as_blank = true
  AND internal_only = false;

GRANT SELECT ON public.public_catalog TO anon, authenticated;