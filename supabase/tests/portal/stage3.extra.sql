-- Stage 3 fixtures: messaging, collections, product approval and storage as in production.
create table public.collections (
  id uuid primary key default gen_random_uuid(), organization_id uuid, athlete_id uuid, team_id uuid,
  name text, slug text, status text default 'active', metadata jsonb default '{}'
);
create table public.portal_threads (
  id uuid primary key default gen_random_uuid(), organization_id uuid, athlete_id uuid, subject text,
  category text, status text default 'open', created_by uuid, created_by_role text,
  last_message_at timestamptz default now(), last_message_role text, admin_unread boolean default false,
  portal_unread boolean default false, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table public.portal_messages (
  id uuid primary key default gen_random_uuid(), thread_id uuid references portal_threads(id) on delete cascade,
  organization_id uuid, sender_user_id uuid, sender_role text, body text, created_at timestamptz default clock_timestamp()
);
alter table public.portal_threads enable row level security;
alter table public.portal_messages enable row level security;
create policy "client read own portal_threads" on public.portal_threads for select using (
  organization_id = current_user_org_id() and exists (select 1 from user_athlete_links ual where ual.user_id = auth.uid() and ual.athlete_id = portal_threads.athlete_id));
create policy "client read own portal_messages" on public.portal_messages for select using (exists (
  select 1 from portal_threads t join user_athlete_links ual on ual.athlete_id = t.athlete_id where t.id = portal_messages.thread_id and ual.user_id = auth.uid()));
grant select on public.portal_threads, public.portal_messages, public.collections to authenticated;

create type public.product_approval as enum ('draft', 'pending', 'approved', 'rejected');
alter table public.products add column if not exists approval_state public.product_approval;
alter table public.products add column if not exists approval_note text;
alter table public.products add column if not exists updated_at timestamptz default now();
create table public.product_approvals (
  id uuid primary key default gen_random_uuid(), organization_id uuid, product_id uuid, athlete_id uuid,
  state text, note text, snapshot jsonb, decided_by uuid, created_at timestamptz default now()
);

create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
grant usage on schema public to service_role;

insert into collections (id, organization_id, athlete_id, name, slug, metadata) values
  ('00000000-0000-0000-0000-0000000c0a71', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000d',
   'Darnell Mooney x Falcons', 'darnell-mooney-falcons', '{"portal_destination":{"key":"atlanta"}}'),
  ('00000000-0000-0000-0000-0000000c0c01', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000c',
   'Coleman Drop', 'coleman-drop', '{}');

-- A product waiting for Mooney's approval.
update products set approval_state = 'pending', updated_at = '2026-10-01T00:00:00Z' where id = '00000000-0000-0000-0000-0000000002d1';
update products set approval_state = 'approved' where id = '00000000-0000-0000-0000-0000000003d1';
