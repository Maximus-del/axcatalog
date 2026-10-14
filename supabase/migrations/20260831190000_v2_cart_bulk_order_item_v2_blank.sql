-- AX OS V2 cart: bulk_order_items needs its own pointer at v2_blanks.
--
-- bulk_order_items.blank_id is FK'd to the LEGACY `blanks` table. Every V2
-- caller has a v2_blanks id, so useCreateBulkOrder was already writing a
-- `v2_blank_id` column that did not exist: every "Raise bulk order" from a V2
-- mockup failed with 42703, deleted the request it had just made, and threw.
-- Same shape as the fix already applied to mockups and products.
--
-- Additive: a nullable column and an index. Nothing is renamed or dropped, and
-- the legacy blank_id is left exactly as it is for V1's rows.
alter table public.bulk_order_items
  add column if not exists v2_blank_id uuid
  references public.v2_blanks(id) on delete set null;

create index if not exists bulk_order_items_v2_blank_id_idx
  on public.bulk_order_items (v2_blank_id);

-- The cart reads its lines by mockup constantly; V1 never did.
create index if not exists bulk_order_items_mockup_id_idx
  on public.bulk_order_items (mockup_id);

-- One open cart per operator per entity is found by this predicate on every
-- V2 screen that shows a cart badge.
create index if not exists bulk_order_requests_draft_idx
  on public.bulk_order_requests (athlete_id, requested_by)
  where status = 'draft';
