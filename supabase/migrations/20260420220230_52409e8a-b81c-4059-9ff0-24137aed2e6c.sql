-- Resilient queue for Shopify writes that failed or need retry
create table if not exists public.shopify_sync_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null check (entity_type in ('product')),
  entity_id uuid not null,
  changes jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','succeeded','failed')),
  attempts int not null default 0,
  last_attempt_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shopify_sync_queue_pending_idx
  on public.shopify_sync_queue (organization_id, status, created_at)
  where status in ('pending','failed');

alter table public.shopify_sync_queue enable row level security;

create policy "admin read sync queue"
  on public.shopify_sync_queue
  for select
  using (organization_id = current_user_org_id() and current_user_is_admin());

create policy "admin write sync queue"
  on public.shopify_sync_queue
  for all
  using (organization_id = current_user_org_id() and current_user_is_admin())
  with check (organization_id = current_user_org_id() and current_user_is_admin());

create trigger shopify_sync_queue_set_updated_at
  before update on public.shopify_sync_queue
  for each row execute function public.set_updated_at();