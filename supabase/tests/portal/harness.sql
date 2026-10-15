-- ============================================================================
-- Local test harness for the portal adapter SQL.
--
-- A minimal stand-in for the parts of the live schema the portal functions
-- touch: same table and column names, same helper-function contracts
-- (auth.uid(), current_user_is_operator(), is_org_accessible(),
-- viewer_*_ids()). It is NOT the production schema and is never applied to it.
--
-- run.sh loads this, then a migration under test, then the matching *.test.sql.
-- Tests impersonate users exactly as PostgREST does: set role authenticated and
-- put the user id in request.jwt.claims.
-- ============================================================================
drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema public;
create schema auth;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
grant usage on schema public, auth to anon, authenticated;

create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;

create table auth.users (id uuid primary key, email text, last_sign_in_at timestamptz, raw_user_meta_data jsonb default '{}');

create table public.organizations (id uuid primary key, name text);
create table public.athletes (
  id uuid primary key, organization_id uuid references organizations(id),
  display_name text, first_name text, last_name text, metadata jsonb default '{}',
  jersey_number text, current_team_id uuid
);
create table public.user_profiles (id uuid primary key, organization_id uuid, role text, is_platform_admin boolean default false, email text);
create table public.user_athlete_links (user_id uuid, athlete_id uuid, primary key (user_id, athlete_id));

create function public.current_user_org_id() returns uuid language sql stable security definer set search_path = public as $$
  select organization_id from user_profiles where id = auth.uid()
$$;
create function public.current_user_is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from user_profiles where id = auth.uid()), false)
$$;
create function public.current_user_is_platform_admin() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_platform_admin from user_profiles where id = auth.uid()), false)
$$;
create function public.current_user_is_operator() returns boolean language sql stable security definer set search_path = public as $$
  select public.current_user_is_admin() or public.current_user_is_platform_admin()
$$;
-- Live version also consults organization_memberships; the contract that
-- matters here is "an operator can reach orgs they belong to, platform admins all".
create function public.is_org_accessible(_org uuid) returns boolean language sql stable security definer set search_path = public as $$
  select public.current_user_is_platform_admin() or _org = public.current_user_org_id()
$$;

create table public.products (id uuid primary key, organization_id uuid, title text, status text default 'published', price numeric, metadata jsonb default '{}');
create table public.product_athletes (product_id uuid, athlete_id uuid, primary key (product_id, athlete_id));
create table public.product_images (id uuid primary key default gen_random_uuid(), product_id uuid, storage_bucket text, storage_path text, is_primary boolean, sort_order int, metadata jsonb default '{}', created_at timestamptz default now());

create function public.viewer_athlete_ids() returns setof uuid language sql stable security definer set search_path = public as $$
  select athlete_id from user_athlete_links where user_id = auth.uid()
$$;
create function public.viewer_product_ids() returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct pa.product_id from product_athletes pa
  where pa.athlete_id in (select athlete_id from user_athlete_links where user_id = auth.uid())
$$;

create table public.orders (
  id uuid primary key, organization_id uuid, order_date timestamptz, currency text default 'USD',
  is_test boolean default false, is_refund boolean default false, imported_at timestamptz default now(),
  financial_status text, customer_email text, customer_name text, raw_csv_row jsonb
);
create table public.order_line_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid, order_id uuid references orders(id),
  product_id uuid, product_title text, quantity int, unit_price numeric, line_total numeric, attributed_org_id uuid
);

alter table public.product_images enable row level security;
alter table public.orders enable row level security;
alter table public.order_line_items enable row level security;
-- Mirrors the live operator policy shape.
create policy "org read product images" on public.product_images for select using (
  current_user_is_operator() and exists (select 1 from products p where p.id = product_images.product_id and is_org_accessible(p.organization_id)));
create policy "admin read orders" on public.orders for select using (
  (organization_id = current_user_org_id() and current_user_is_admin()) or current_user_is_platform_admin());
create policy "admin read order line items" on public.order_line_items for select using (
  (organization_id = current_user_org_id() and current_user_is_admin()) or current_user_is_platform_admin());

grant select on all tables in schema public to authenticated;
grant select on auth.users to authenticated;

-- ---------------------------------------------------------------- fixtures
-- Two athletes in two single-athlete orgs, one shared org with two entities,
-- an AX org with an operator.
insert into organizations values
  ('00000000-0000-0000-0000-0000000000a1', 'Mooney org'),
  ('00000000-0000-0000-0000-0000000000a2', 'Coleman org'),
  ('00000000-0000-0000-0000-0000000000a3', 'Shared team org'),
  ('00000000-0000-0000-0000-0000000000aa', 'AX');

insert into athletes (id, organization_id, display_name) values
  ('00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-0000000000a1', 'Darnell Mooney'),
  ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000a2', 'Keon Coleman'),
  ('00000000-0000-0000-0000-00000000005a', '00000000-0000-0000-0000-0000000000a3', 'Shared A'),
  ('00000000-0000-0000-0000-00000000005b', '00000000-0000-0000-0000-0000000000a3', 'Shared B');

-- users: mooney client, coleman client, shared-A client, AX operator (Mooney's org
-- accessible), outsider with no links.
insert into user_profiles (id, organization_id, role, is_platform_admin) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', 'client', false),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a2', 'client', false),
  ('00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-0000000000a3', 'client', false),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1', 'admin', false),
  ('00000000-0000-0000-0000-0000000000e1', null, 'client', false);
insert into user_athlete_links values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000000d'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000c'),
  ('00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-00000000005a');

insert into products (id, organization_id, title) values
  ('00000000-0000-0000-0000-0000000001d1', '00000000-0000-0000-0000-0000000000a1', 'Mooney hoodie'),
  ('00000000-0000-0000-0000-0000000001c1', '00000000-0000-0000-0000-0000000000a2', 'Coleman tee');
insert into product_athletes values
  ('00000000-0000-0000-0000-0000000001d1', '00000000-0000-0000-0000-00000000000d'),
  ('00000000-0000-0000-0000-0000000001c1', '00000000-0000-0000-0000-00000000000c');
insert into product_images (product_id, storage_bucket, storage_path, is_primary, sort_order) values
  ('00000000-0000-0000-0000-0000000001d1', 'product-images', 'm/front.png', true, 0),
  ('00000000-0000-0000-0000-0000000001d1', 'product-images', 'm/back.png', false, 1),
  ('00000000-0000-0000-0000-0000000001c1', 'product-images', 'c/front.png', true, 0);

-- Mooney: lines WITHOUT product_id (as in production), one refunded order,
-- one test order, one order straddling a Los Angeles month boundary.
insert into orders (id, organization_id, order_date, is_test, is_refund, financial_status, customer_email) values
  ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-0000000000aa', '2026-03-10T18:00:00Z', false, false, 'paid', 'buyer1@example.com'),
  ('00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-0000000000aa', '2026-04-01T06:30:00Z', false, true,  'refunded', 'buyer2@example.com'),
  ('00000000-0000-0000-0000-00000000a003', '00000000-0000-0000-0000-0000000000aa', '2026-04-05T12:00:00Z', true,  false, 'paid', 'tester@example.com'),
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000aa', '2026-04-05T12:00:00Z', false, false, 'paid', 'buyer3@example.com');
insert into order_line_items (organization_id, order_id, product_id, product_title, quantity, unit_price, line_total, attributed_org_id) values
  ('00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-00000000a001', null, 'Mooney World Tee', 2, 22.50, 45.00, '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-00000000a002', null, 'Mooney World Hoodie', 1, 90.00, 90.00, '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-00000000a003', null, 'Mooney World Hoodie', 1, 999.00, 999.00, '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-00000000c001', null, 'Coleman Tee', 3, 20.00, 60.00, '00000000-0000-0000-0000-0000000000a2');

-- Test helpers ---------------------------------------------------------------
create schema if not exists t;
grant usage on schema t to authenticated;
create function t.as_user(_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', _uid, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $$;
create function t.reset() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', false);
end $$;
create table t.results (name text, ok boolean, detail text);
grant all on t.results to authenticated;
create function t.check(_name text, _ok boolean, _detail text default null) returns void language sql as $$
  insert into t.results values (_name, coalesce(_ok, false), _detail)
$$;
grant execute on all functions in schema t to authenticated;
