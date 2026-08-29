-- Applied live 2026-08-25 via the Supabase MCP; this file exists so a fresh
-- deploy from the repository reproduces the same schema. Every statement is
-- idempotent, so re-running against the live database is a no-op.
--
-- See supabase/functions/shopify-reconcile-blanks for why availability_status
-- is NOT stored: it is a pure function of is_hidden, is_inventory_managed and
-- the summed levels, and blanks.availability_status already means something
-- different (supplier stock state).
alter table public.blanks
  add column if not exists shopify_product_id text,
  add column if not exists shopify_status text
    check (shopify_status is null or shopify_status in ('active','draft','archived')),
  add column if not exists drive_product_folder_id text,
  add column if not exists drive_product_folder_url text,
  add column if not exists image_match_status text not null default 'unmatched'
    check (image_match_status in ('unmatched','matched','confirmed','image_match_required','no_match')),
  add column if not exists last_shopify_sync_at timestamptz,
  add column if not exists last_drive_sync_at timestamptz;

create unique index if not exists blanks_shopify_product_id_key
  on public.blanks (shopify_product_id) where shopify_product_id is not null;

create table if not exists public.blank_variants (
  id uuid primary key default gen_random_uuid(),
  blank_id uuid not null references public.blanks(id) on delete cascade,
  shopify_variant_id text not null,
  shopify_inventory_item_id text,
  color text, normalized_color text, size text, sku text, barcode text,
  cost numeric, retail_price numeric,
  last_shopify_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (blank_id, shopify_variant_id)
);
create index if not exists blank_variants_blank_idx on public.blank_variants (blank_id);
-- Barcode is indexed but NOT unique: duplicates are a state we must be able to
-- store and report, not one that kills a sync.
create index if not exists blank_variants_barcode_idx on public.blank_variants (barcode) where barcode is not null;
create index if not exists blank_variants_inventory_item_idx
  on public.blank_variants (shopify_inventory_item_id) where shopify_inventory_item_id is not null;

create table if not exists public.blank_inventory_levels (
  id uuid primary key default gen_random_uuid(),
  blank_variant_id uuid not null references public.blank_variants(id) on delete cascade,
  shopify_location_id text not null,
  location_name text,
  available_quantity integer not null default 0,
  last_shopify_sync_at timestamptz,
  created_at timestamptz not null default now(),
  unique (blank_variant_id, shopify_location_id)
);
create index if not exists blank_inventory_levels_variant_idx
  on public.blank_inventory_levels (blank_variant_id);

create table if not exists public.blank_images (
  id uuid primary key default gen_random_uuid(),
  blank_id uuid not null references public.blanks(id) on delete cascade,
  color text, normalized_color text,
  view_type text not null,
  drive_file_id text not null,
  drive_folder_id text, filename text, mime_type text, drive_url text,
  modified_at timestamptz,
  is_primary boolean not null default false,
  missing boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (blank_id, drive_file_id)
);
create index if not exists blank_images_lookup_idx
  on public.blank_images (blank_id, normalized_color, view_type);

create table if not exists public.blank_inventory_audit (
  id uuid primary key default gen_random_uuid(),
  blank_id uuid references public.blanks(id) on delete set null,
  blank_variant_id uuid references public.blank_variants(id) on delete set null,
  kind text not null check (kind in ('inventory','barcode','hidden','mapping','sync_failure')),
  before jsonb, after jsonb, source text, actor uuid,
  created_at timestamptz not null default now()
);
create index if not exists blank_inventory_audit_blank_idx
  on public.blank_inventory_audit (blank_id, created_at desc);

alter table public.blank_variants enable row level security;
alter table public.blank_inventory_levels enable row level security;
alter table public.blank_images enable row level security;
alter table public.blank_inventory_audit enable row level security;

drop policy if exists "org access blank_variants" on public.blank_variants;
create policy "org access blank_variants" on public.blank_variants for all
  using (exists (select 1 from public.blanks b where b.id = blank_id and public.is_org_accessible(b.organization_id)))
  with check (exists (select 1 from public.blanks b where b.id = blank_id and public.is_org_accessible(b.organization_id)));

drop policy if exists "org access blank_inventory_levels" on public.blank_inventory_levels;
create policy "org access blank_inventory_levels" on public.blank_inventory_levels for all
  using (exists (select 1 from public.blank_variants v join public.blanks b on b.id = v.blank_id
                  where v.id = blank_variant_id and public.is_org_accessible(b.organization_id)))
  with check (exists (select 1 from public.blank_variants v join public.blanks b on b.id = v.blank_id
                  where v.id = blank_variant_id and public.is_org_accessible(b.organization_id)));

drop policy if exists "org access blank_images" on public.blank_images;
create policy "org access blank_images" on public.blank_images for all
  using (exists (select 1 from public.blanks b where b.id = blank_id and public.is_org_accessible(b.organization_id)))
  with check (exists (select 1 from public.blanks b where b.id = blank_id and public.is_org_accessible(b.organization_id)));

drop policy if exists "org read blank_inventory_audit" on public.blank_inventory_audit;
create policy "org read blank_inventory_audit" on public.blank_inventory_audit for select
  using (exists (select 1 from public.blanks b where b.id = blank_id and public.is_org_accessible(b.organization_id)));
