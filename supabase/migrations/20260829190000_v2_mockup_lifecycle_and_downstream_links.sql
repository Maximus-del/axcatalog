-- MOCKUP LIFECYCLE.
--
-- `mockups.status` is the enum mockup_status (draft/approved/published) and is
-- used by V1's 42 photo mockups. Rather than overload it - and change meaning
-- under V1's feet - V2 gets its own operator-facing lifecycle in a separate
-- column. The two answer different questions: `status` is about publication,
-- `lifecycle` is about where the operator is in their own process.
--
-- Everything starts in the bin. A mockup is a scratch idea until someone says
-- otherwise, and defaulting anywhere else quietly asserts progress that has not
-- happened.
alter table public.mockups
  add column if not exists lifecycle text not null default 'bin';

alter table public.mockups drop constraint if exists mockups_lifecycle_check;
alter table public.mockups
  add constraint mockups_lifecycle_check
  check (lifecycle in ('bin', 'in_progress', 'ready', 'converted', 'archived'));

create index if not exists mockups_athlete_lifecycle_idx
  on public.mockups (athlete_id, lifecycle) where kind = 'concept';

comment on column public.mockups.lifecycle is
  'AX OS V2 operator lifecycle: bin -> in_progress -> ready -> converted -> archived. Separate from `status`, which is V1 publication state.';

-- DOWNSTREAM LINKS.
--
-- Both tables already exist and are in use - bulk_order_requests holds 10 live
-- rows with a full wholesale/retail/savings model, and content_assets is the
-- media object. Neither could point back at a mockup, which is the one
-- relationship the new detail-page actions need. One nullable column each.
alter table public.bulk_order_items
  add column if not exists mockup_id uuid references public.mockups(id) on delete set null;

comment on column public.bulk_order_items.mockup_id is
  'AX OS V2. The mockup this line was ordered from. SET NULL on delete: the order is a real commercial record and must outlive the mockup it came from.';

alter table public.content_assets
  add column if not exists mockup_id uuid references public.mockups(id) on delete set null;

comment on column public.content_assets.mockup_id is
  'AX OS V2. The mockup this asset was derived from, so an asset can always be traced back to the artwork and garment it came from.';

create index if not exists content_assets_mockup_idx on public.content_assets (mockup_id) where mockup_id is not null;
create index if not exists bulk_order_items_mockup_idx on public.bulk_order_items (mockup_id) where mockup_id is not null;

-- LOOKBOOKS are a kind of collection, not a new object.
--
-- `collections` is already the grouping object, already Shopify-independent and
-- already entity-scoped. A lookbook is one more type of grouping.
do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'collection_type' and e.enumlabel = 'lookbook'
  ) then
    alter type public.collection_type add value 'lookbook';
  end if;
end $$;
