-- AX OS V2 — point the remaining mockups at the V2 blank catalog.
-- Applied live to cuidofxidstqpgypxcop on 2026-08-31.
--
-- WHAT MAKES THIS SAFE, AND WHY IT IS NOT NAME MATCHING.
--
-- The V2 catalog was deliberately built without reconciling against the 48 V1
-- blanks: the range was physically re-done and re-photographed, and matching
-- "SPECIAL HOODIE 14 OZ" to "Garment-Wash Hoodie 14oz" by name is guesswork.
-- This does not do that. It joins on the MANUFACTURER'S STYLE CODE — CCHOD475
-- is CCHOD475 whoever photographed it — and only where that code resolves to
-- EXACTLY ONE V2 blank. Anything ambiguous, or with no match at all, is left
-- exactly as it is.
--
-- Idempotent and re-runnable: rows already carrying v2_blank_id are skipped, so
-- this can run again when more old mockups turn up.
--
-- Result on the live database: 1 concept mockup and 2 placements moved,
-- 0 left pointing at a V1 blank.

with mapping as (
  select b.id as v1_id, min(v.id::text)::uuid as v2_id
  from public.blanks b
  join public.v2_blanks v
    on upper(trim(v.style_code)) = upper(trim(b.style_number))
  where b.style_number is not null and trim(b.style_number) <> ''
  group by b.id
  having count(v.id) = 1
)
update public.mockups m
set v2_blank_id = mapping.v2_id,
    blank_id = null
from mapping
where m.kind = 'concept'
  and m.v2_blank_id is null
  and m.blank_id = mapping.v1_id;

-- The placements carry the same reference and must move with their mockup.
with mapping as (
  select b.id as v1_id, min(v.id::text)::uuid as v2_id
  from public.blanks b
  join public.v2_blanks v
    on upper(trim(v.style_code)) = upper(trim(b.style_number))
  where b.style_number is not null and trim(b.style_number) <> ''
  group by b.id
  having count(v.id) = 1
)
update public.product_print_placements p
set v2_blank_id = mapping.v2_id,
    blank_id = null
from mapping
where p.mockup_id is not null
  and p.v2_blank_id is null
  and p.blank_id = mapping.v1_id;
