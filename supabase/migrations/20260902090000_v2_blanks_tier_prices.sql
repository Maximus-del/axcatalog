-- AX OS V2 — tier prices land on v2_blanks.
--
-- V2 read pricing as null on purpose: Shopify was declared the owner of price,
-- cost and quantity, and serving V1's numbers would have made V1 the source of
-- truth again for the one field we least wanted it to be. That decision holds
-- for Shopify's retail price. It does not help an operator quoting a bulk run
-- today, where the tier price IS the number, and V1's `blanks` already carries
-- it for the garments that exist in both.
--
-- So the number is COPIED, not read across: v2_blanks owns its own prices from
-- here, and nothing in V2 reads a V1 table to render one. Additive only.
alter table public.v2_blanks
  add column if not exists price_standard numeric,
  add column if not exists price_athlete numeric,
  add column if not exists price_corporate numeric;

comment on column public.v2_blanks.price_standard is
  'Tier price. Seeded once from blanks.price_standard where style codes matched; V2 owns it now.';

-- Seed only where the style code matches exactly. 7 of 13 do. The other 6 have
-- no V1 counterpart (five SHKTBD placeholders and FULL ZIP UP HOOD 10 OZ) and
-- stay null: an em dash is honest, a borrowed price is a guess wearing a real
-- number's clothes.
update public.v2_blanks v
set price_standard  = b.price_standard,
    price_athlete   = b.price_athlete,
    price_corporate = b.price_corporate,
    cost            = coalesce(v.cost, b.cost)
from public.blanks b
where upper(trim(b.style_number)) = upper(trim(v.style_code))
  and b.price_standard is not null
  and v.price_standard is null;
