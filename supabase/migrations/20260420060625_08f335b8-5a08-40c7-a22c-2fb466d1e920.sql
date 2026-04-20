alter table products
  add column if not exists is_hidden_from_dashboard boolean default false not null;

create index if not exists idx_products_visibility
  on products(organization_id, status, is_hidden_from_dashboard);

create table if not exists public.product_collections (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  collection_id uuid not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(product_id, collection_id)
);

alter table public.product_collections enable row level security;

create policy "org read product collections"
  on public.product_collections for select
  using (exists (select 1 from products p where p.id = product_collections.product_id and p.organization_id = current_user_org_id()));

create policy "org write product collections"
  on public.product_collections for all
  using (exists (select 1 from products p where p.id = product_collections.product_id and p.organization_id = current_user_org_id()))
  with check (exists (select 1 from products p where p.id = product_collections.product_id and p.organization_id = current_user_org_id()));
