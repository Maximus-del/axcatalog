-- AX OS V2 — products can name a V2 blank.
-- Applied live to cuidofxidstqpgypxcop on 2026-08-31.
--
-- SAME SHAPE AS THE MOCKUPS FIX in 6360180, and for the same reason.
-- `products.blank_id` means "a row in the legacy `blanks` table". The V2
-- catalog reads v2_blanks, so a product created from a V2-blank mockup was
-- about to store a v2_blanks id in a column that means something else. There
-- is no foreign key on products.blank_id, so nothing would have complained —
-- it would simply have been wrong, quietly, in the one field that says what
-- the garment is.
--
-- Additive. blank_id keeps its meaning and its rows; a product uses exactly one
-- of the two.

alter table public.products
  add column if not exists v2_blank_id uuid references public.v2_blanks(id) on delete set null;

comment on column public.products.v2_blank_id is
  'V2 catalog blank. Mutually exclusive with blank_id, which still means a row in the legacy `blanks` table.';

create index if not exists products_v2_blank_id_idx
  on public.products (v2_blank_id)
  where v2_blank_id is not null;
