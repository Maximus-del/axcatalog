
do $$ begin create type public.task_status as enum ('todo','in_progress','blocked','done'); exception when duplicate_object then null; end $$;
do $$ begin create type public.brand_asset_type as enum ('logo','wordmark','style_guide','palette','print_material','typography','other'); exception when duplicate_object then null; end $$;
do $$ begin create type public.mockup_shot_type as enum ('flat_lay','model_front','model_back','detail_close_up','lookbook','action','other'); exception when duplicate_object then null; end $$;
do $$ begin create type public.mockup_status as enum ('draft','approved','published'); exception when duplicate_object then null; end $$;
do $$ begin create type public.material_category as enum ('packaging','sticker','magnet','card','mailer','filler','other'); exception when duplicate_object then null; end $$;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null, description text,
  priority int not null default 2 check (priority between 1 and 3),
  due_date timestamptz,
  status public.task_status not null default 'todo',
  tags text[] not null default '{}',
  assigned_to uuid references public.user_profiles(id) on delete set null,
  created_by uuid references public.user_profiles(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_org_status_idx on public.tasks(organization_id, status);
create index if not exists tasks_org_due_idx on public.tasks(organization_id, due_date);
grant select, insert, update, delete on public.tasks to authenticated;
grant all on public.tasks to service_role;
alter table public.tasks enable row level security;
drop policy if exists "tasks_org_access" on public.tasks;
create policy "tasks_org_access" on public.tasks for all to authenticated
  using (public.is_org_accessible(organization_id)) with check (public.is_org_accessible(organization_id));
drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at before update on public.tasks for each row execute function public.set_updated_at();

create table if not exists public.task_activity (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  action text not null,
  actor_id uuid references public.user_profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists task_activity_task_idx on public.task_activity(task_id, created_at desc);
grant select, insert on public.task_activity to authenticated;
grant all on public.task_activity to service_role;
alter table public.task_activity enable row level security;
drop policy if exists "task_activity_org_access" on public.task_activity;
create policy "task_activity_org_access" on public.task_activity for all to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id and public.is_org_accessible(t.organization_id)))
  with check (exists (select 1 from public.tasks t where t.id = task_id and public.is_org_accessible(t.organization_id)));

create table if not exists public.design_associations (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null references public.designs(id) on delete cascade,
  entity_type text not null check (entity_type in ('athlete','team')),
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  unique (design_id, entity_type, entity_id)
);
create index if not exists design_associations_entity_idx on public.design_associations(entity_type, entity_id);
grant select, insert, update, delete on public.design_associations to authenticated;
grant all on public.design_associations to service_role;
alter table public.design_associations enable row level security;
drop policy if exists "design_associations_org_access" on public.design_associations;
create policy "design_associations_org_access" on public.design_associations for all to authenticated
  using (exists (select 1 from public.designs d where d.id = design_id and public.is_org_accessible(d.organization_id)))
  with check (exists (select 1 from public.designs d where d.id = design_id and public.is_org_accessible(d.organization_id)));

-- Backfill from existing design_athletes join and design primary refs
insert into public.design_associations (design_id, entity_type, entity_id)
select design_id, 'athlete', athlete_id from public.design_athletes
on conflict do nothing;
insert into public.design_associations (design_id, entity_type, entity_id)
select id, 'athlete', primary_athlete_id from public.designs where primary_athlete_id is not null
on conflict do nothing;
insert into public.design_associations (design_id, entity_type, entity_id)
select id, 'team', primary_team_id from public.designs where primary_team_id is not null
on conflict do nothing;

create table if not exists public.asset_folders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  parent_folder_id uuid references public.asset_folders(id) on delete cascade,
  scope text not null default 'brand' check (scope in ('brand','mockup')),
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists asset_folders_org_scope_idx on public.asset_folders(organization_id, scope);
grant select, insert, update, delete on public.asset_folders to authenticated;
grant all on public.asset_folders to service_role;
alter table public.asset_folders enable row level security;
drop policy if exists "asset_folders_org_access" on public.asset_folders;
create policy "asset_folders_org_access" on public.asset_folders for all to authenticated
  using (public.is_org_accessible(organization_id)) with check (public.is_org_accessible(organization_id));
drop trigger if exists asset_folders_set_updated_at on public.asset_folders;
create trigger asset_folders_set_updated_at before update on public.asset_folders for each row execute function public.set_updated_at();

create table if not exists public.brand_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  folder_id uuid references public.asset_folders(id) on delete set null,
  storage_bucket text not null default 'brand-assets',
  storage_path text, file_name text, file_type text, file_size bigint,
  thumbnail_path text,
  title text not null, description text,
  asset_type public.brand_asset_type not null default 'other',
  color_scheme jsonb,
  version_number int not null default 1,
  is_primary boolean not null default false,
  tags text[] not null default '{}',
  uploaded_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists brand_assets_org_idx on public.brand_assets(organization_id);
create index if not exists brand_assets_folder_idx on public.brand_assets(folder_id);
grant select, insert, update, delete on public.brand_assets to authenticated;
grant all on public.brand_assets to service_role;
alter table public.brand_assets enable row level security;
drop policy if exists "brand_assets_org_access" on public.brand_assets;
create policy "brand_assets_org_access" on public.brand_assets for all to authenticated
  using (public.is_org_accessible(organization_id)) with check (public.is_org_accessible(organization_id));
drop trigger if exists brand_assets_set_updated_at on public.brand_assets;
create trigger brand_assets_set_updated_at before update on public.brand_assets for each row execute function public.set_updated_at();

create table if not exists public.mockups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  folder_id uuid references public.asset_folders(id) on delete set null,
  storage_bucket text not null default 'mockups',
  storage_path text, file_name text, file_type text, file_size bigint,
  thumbnail_path text,
  title text not null, description text,
  shot_type public.mockup_shot_type not null default 'other',
  product_id uuid references public.products(id) on delete set null,
  design_id uuid references public.designs(id) on delete set null,
  blank_id uuid references public.blanks(id) on delete set null,
  athlete_id uuid references public.athletes(id) on delete set null,
  team_id uuid references public.teams(id) on delete set null,
  drop_name text, photographer text,
  status public.mockup_status not null default 'draft',
  published_to_shopify boolean not null default false,
  tags text[] not null default '{}',
  uploaded_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mockups_org_idx on public.mockups(organization_id);
create index if not exists mockups_product_idx on public.mockups(product_id);
grant select, insert, update, delete on public.mockups to authenticated;
grant all on public.mockups to service_role;
alter table public.mockups enable row level security;
drop policy if exists "mockups_org_access" on public.mockups;
create policy "mockups_org_access" on public.mockups for all to authenticated
  using (public.is_org_accessible(organization_id)) with check (public.is_org_accessible(organization_id));
drop trigger if exists mockups_set_updated_at on public.mockups;
create trigger mockups_set_updated_at before update on public.mockups for each row execute function public.set_updated_at();

create table if not exists public.fulfillment_materials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  category public.material_category not null default 'other',
  description text,
  supplier text default 'Sticker Mule',
  supplier_url text, supplier_sku text,
  unit_cost numeric(10,2), unit_cost_currency text not null default 'USD',
  artwork_path text, image_path text, notes text,
  tags text[] not null default '{}',
  last_ordered_at timestamptz, last_received_at timestamptz,
  order_history jsonb not null default '[]'::jsonb,
  updated_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists fulfillment_materials_org_idx on public.fulfillment_materials(organization_id);
grant select, insert, update, delete on public.fulfillment_materials to authenticated;
grant all on public.fulfillment_materials to service_role;
alter table public.fulfillment_materials enable row level security;
drop policy if exists "fulfillment_materials_org_access" on public.fulfillment_materials;
create policy "fulfillment_materials_org_access" on public.fulfillment_materials for all to authenticated
  using (public.is_org_accessible(organization_id)) with check (public.is_org_accessible(organization_id));
drop trigger if exists fulfillment_materials_set_updated_at on public.fulfillment_materials;
create trigger fulfillment_materials_set_updated_at before update on public.fulfillment_materials for each row execute function public.set_updated_at();

alter table public.blank_colors
  add column if not exists easy_scan_barcode text,
  add column if not exists easy_scan_url text,
  add column if not exists current_stock int;
alter table public.blank_sizes
  add column if not exists easy_scan_barcode text,
  add column if not exists easy_scan_url text,
  add column if not exists current_stock int;

create or replace view public.blank_variant_barcodes as
select
  b.id as blank_id, b.name as blank_name, b.organization_id,
  bc.id as color_id, bc.color_name as color_name, bc.hex_code as color_hex,
  bs.id as size_id, bs.size as size_name,
  coalesce(bs.easy_scan_barcode, bc.easy_scan_barcode) as easy_scan_barcode,
  coalesce(bs.easy_scan_url, bc.easy_scan_url) as easy_scan_url,
  coalesce(bs.current_stock, bc.current_stock) as current_stock
from public.blanks b
left join public.blank_colors bc on bc.blank_id = b.id
left join public.blank_sizes  bs on bs.blank_id = b.id;
grant select on public.blank_variant_barcodes to authenticated;

drop policy if exists "brand-assets read own org" on storage.objects;
drop policy if exists "brand-assets write own org" on storage.objects;
drop policy if exists "brand-assets update own org" on storage.objects;
drop policy if exists "brand-assets delete own org" on storage.objects;
create policy "brand-assets read own org" on storage.objects for select to authenticated
using (bucket_id = 'brand-assets' and public.is_org_accessible((split_part(name,'/',1))::uuid));
create policy "brand-assets write own org" on storage.objects for insert to authenticated
with check (bucket_id = 'brand-assets' and public.is_org_accessible((split_part(name,'/',1))::uuid));
create policy "brand-assets update own org" on storage.objects for update to authenticated
using (bucket_id = 'brand-assets' and public.is_org_accessible((split_part(name,'/',1))::uuid));
create policy "brand-assets delete own org" on storage.objects for delete to authenticated
using (bucket_id = 'brand-assets' and public.is_org_accessible((split_part(name,'/',1))::uuid));
