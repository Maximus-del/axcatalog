-- AX V2 CATALOG — a new, deliberately separate catalog built from the Drive.
--
-- This is NOT a duplicate of `blanks` for convenience, and it is not an
-- enrichment of it. It is a new generation. The physical range was re-done and
-- re-photographed; the "AX Blank Photography" Drive is the record of what AX
-- actually has. The 48 rows in `blanks` are the previous generation and stay
-- exactly where they are, serving V1, untouched and unreferenced from here.
--
-- Nothing in these tables has a foreign key to `blanks`, `blank_colors` or
-- `blank_images`, and nothing here is matched against them. That is the point:
-- a V2 blank is not "the V1 blank, corrected". Reconciling the two generations
-- is the work this schema exists to avoid.
--
-- OWNERSHIP, decided:
--   Drive    -> which blanks and colourways exist, and what they are called.
--   Shopify  -> cost, price and quantity. Columns exist and stay NULL until the
--               connector is live; they are never guessed.
--   Later    -> a naming pass over `display_name`, leaving `name` as the Drive
--               record so the two can always be compared.

create table if not exists public.v2_blanks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier text not null,
  name text not null,
  style_code text,
  drive_folder_id text not null unique,
  drive_folder_url text,
  display_name text,
  garment_type text,
  shopify_product_id text,
  shopify_handle text,
  cost numeric,
  price numeric,
  last_drive_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.v2_blank_colors (
  id uuid primary key default gen_random_uuid(),
  blank_id uuid not null references public.v2_blanks(id) on delete cascade,
  name text not null,
  display_name text,
  drive_folder_id text,
  hex text,
  sort_order integer not null default 0,
  shopify_variant_id text,
  quantity integer,
  available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (blank_id, name)
);

create table if not exists public.v2_blank_images (
  id uuid primary key default gen_random_uuid(),
  blank_id uuid not null references public.v2_blanks(id) on delete cascade,
  color_id uuid references public.v2_blank_colors(id) on delete cascade,
  view_type text not null check (view_type in ('front','back')),
  variant text,
  is_primary boolean not null default false,
  drive_file_id text not null,
  drive_folder_id text,
  drive_url text not null,
  filename text,
  mime_type text,
  modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (blank_id, drive_file_id)
);

create index if not exists v2_blank_colors_blank_idx on public.v2_blank_colors (blank_id, sort_order);
create index if not exists v2_blank_images_lookup_idx on public.v2_blank_images (blank_id, color_id, view_type, is_primary);

comment on table public.v2_blanks is
  'AX V2 catalog. Built from the AX Blank Photography Drive, which owns identity and naming. Deliberately unlinked from the V1 `blanks` table.';
comment on column public.v2_blanks.name is
  'Verbatim Drive folder name. display_name overrides it for presentation once a naming pass has happened.';
comment on column public.v2_blanks.cost is
  'Shopify-owned. NULL until the Shopify connector is live - never inferred.';

alter table public.v2_blanks enable row level security;
alter table public.v2_blank_colors enable row level security;
alter table public.v2_blank_images enable row level security;

drop policy if exists v2_blanks_org_access on public.v2_blanks;
create policy v2_blanks_org_access on public.v2_blanks
  for all using (public.is_org_accessible(organization_id))
  with check (public.is_org_accessible(organization_id));

drop policy if exists v2_blank_colors_org_access on public.v2_blank_colors;
create policy v2_blank_colors_org_access on public.v2_blank_colors
  for all using (exists (select 1 from public.v2_blanks b where b.id = v2_blank_colors.blank_id and public.is_org_accessible(b.organization_id)))
  with check (exists (select 1 from public.v2_blanks b where b.id = v2_blank_colors.blank_id and public.is_org_accessible(b.organization_id)));

drop policy if exists v2_blank_images_org_access on public.v2_blank_images;
create policy v2_blank_images_org_access on public.v2_blank_images
  for all using (exists (select 1 from public.v2_blanks b where b.id = v2_blank_images.blank_id and public.is_org_accessible(b.organization_id)))
  with check (exists (select 1 from public.v2_blanks b where b.id = v2_blank_images.blank_id and public.is_org_accessible(b.organization_id)));
