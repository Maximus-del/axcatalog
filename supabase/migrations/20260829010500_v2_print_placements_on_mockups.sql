-- Free placement for mockups, on the table that already models it.
--
-- `product_print_placements` already had exactly the right shape — design,
-- blank, surface, zone, colour, x/y/w/h percentages and rotation — and zero
-- rows. It was simply keyed to a Product, which is the wrong end of the
-- pipeline: placement is a CREATIVE decision made at mockup time, long before
-- anything sellable exists.
--
-- So the parent becomes either/or rather than product-only. A placement now
-- hangs off a mockup (a Product Concept) or a Product. When a concept is later
-- productized its placements are already in the table the product side reads —
-- no copy, no second geometry model, and no drift between "where the art sat on
-- the mockup" and "where it prints".

alter table public.product_print_placements
  add column if not exists mockup_id uuid references public.mockups(id) on delete cascade;

-- Several placements can share a surface (a chest hit and a sleeve hit), so
-- they need a defined stacking and listing order.
alter table public.product_print_placements
  add column if not exists sort_order integer not null default 0;

alter table public.product_print_placements
  alter column product_id drop not null;

-- Exactly one parent. Without this a row with neither parent is unreachable by
-- every policy and invisible to every query — a silent orphan.
alter table public.product_print_placements
  drop constraint if exists product_print_placements_one_parent;
alter table public.product_print_placements
  add constraint product_print_placements_one_parent
  check (num_nonnulls(product_id, mockup_id) = 1);

create index if not exists product_print_placements_mockup_idx
  on public.product_print_placements (mockup_id, surface, sort_order)
  where mockup_id is not null;

comment on column public.product_print_placements.mockup_id is
  'AX OS V2. Parent when this placement belongs to a Product Concept rather than a Product. Exactly one of product_id / mockup_id is set.';
comment on column public.product_print_placements.x_pct is
  'AX OS V2. Percentage of the garment image box (0-100), matching PlacementPreset units — NOT the 0-1 fractions print_zones stores.';

-- The existing policies only reach product-parented rows; mockup-parented rows
-- would be invisible without these. Same org test, walked through mockups.
drop policy if exists product_print_placements_mockup_read on public.product_print_placements;
create policy product_print_placements_mockup_read
  on public.product_print_placements
  for select
  using (
    mockup_id is not null
    and exists (
      select 1 from public.mockups m
      where m.id = product_print_placements.mockup_id
        and public.is_org_accessible(m.organization_id)
    )
  );

drop policy if exists product_print_placements_mockup_write on public.product_print_placements;
create policy product_print_placements_mockup_write
  on public.product_print_placements
  for all
  using (
    mockup_id is not null
    and exists (
      select 1 from public.mockups m
      where m.id = product_print_placements.mockup_id
        and public.is_org_accessible(m.organization_id)
    )
  )
  with check (
    mockup_id is not null
    and exists (
      select 1 from public.mockups m
      where m.id = product_print_placements.mockup_id
        and public.is_org_accessible(m.organization_id)
    )
  );
