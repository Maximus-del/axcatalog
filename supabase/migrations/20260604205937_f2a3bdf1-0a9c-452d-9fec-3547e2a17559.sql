
-- Enums
do $$ begin
  create type public.affiliate_status as enum ('pending','active','paused','rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.affiliate_request_status as enum ('pending','approved','rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.affiliate_sale_status as enum ('pending','approved','paid','void');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.affiliate_payout_method as enum ('venmo','ach','paypal','other');
exception when duplicate_object then null; end $$;

-- AFFILIATES
create table if not exists public.affiliates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null,
  email text,
  code text not null unique,
  status public.affiliate_status not null default 'pending',
  commission_percent numeric(5,2) not null default 20,
  buyer_discount_percent numeric(5,2) not null default 10,
  payout_method_notes text,
  total_earned numeric(10,2) not null default 0,
  total_paid numeric(10,2) not null default 0,
  balance_owed numeric(10,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.affiliates to authenticated;
grant all on public.affiliates to service_role;
alter table public.affiliates enable row level security;

create policy "affiliate sees own" on public.affiliates
  for select to authenticated
  using (user_id = auth.uid() or public.current_user_is_admin());
create policy "affiliate inserts own" on public.affiliates
  for insert to authenticated
  with check (user_id = auth.uid());
create policy "affiliate updates own limited" on public.affiliates
  for update to authenticated
  using (user_id = auth.uid() or public.current_user_is_admin())
  with check (user_id = auth.uid() or public.current_user_is_admin());
create policy "admin delete" on public.affiliates
  for delete to authenticated using (public.current_user_is_admin());

create trigger affiliates_set_updated_at
  before update on public.affiliates
  for each row execute function public.set_updated_at();

-- PRODUCT REQUESTS
create table if not exists public.affiliate_product_requests (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  status public.affiliate_request_status not null default 'pending',
  notes text,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id),
  unique(affiliate_id, product_id)
);
grant select, insert, update, delete on public.affiliate_product_requests to authenticated;
grant all on public.affiliate_product_requests to service_role;
alter table public.affiliate_product_requests enable row level security;

create policy "req owner or admin select" on public.affiliate_product_requests
  for select to authenticated
  using (
    public.current_user_is_admin()
    or exists (select 1 from public.affiliates a where a.id = affiliate_id and a.user_id = auth.uid())
  );
create policy "req owner insert" on public.affiliate_product_requests
  for insert to authenticated
  with check (exists (select 1 from public.affiliates a where a.id = affiliate_id and a.user_id = auth.uid() and a.status = 'active'));
create policy "admin update req" on public.affiliate_product_requests
  for update to authenticated using (public.current_user_is_admin()) with check (public.current_user_is_admin());
create policy "admin delete req" on public.affiliate_product_requests
  for delete to authenticated using (public.current_user_is_admin());

-- SALES
create table if not exists public.affiliate_sales (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id) on delete cascade,
  code text not null,
  shopify_order_uuid uuid references public.shopify_orders(id) on delete set null,
  shopify_order_line_item_id uuid unique references public.shopify_order_line_items(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  gross_amount numeric(10,2) not null default 0,
  commission_amount numeric(10,2) not null default 0,
  status public.affiliate_sale_status not null default 'pending',
  attributed_at timestamptz not null default now(),
  notes text
);
grant select on public.affiliate_sales to authenticated;
grant all on public.affiliate_sales to service_role;
alter table public.affiliate_sales enable row level security;

create policy "sale owner or admin" on public.affiliate_sales
  for select to authenticated
  using (
    public.current_user_is_admin()
    or exists (select 1 from public.affiliates a where a.id = affiliate_id and a.user_id = auth.uid())
  );

-- PAYOUTS
create table if not exists public.affiliate_payouts (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  method public.affiliate_payout_method not null default 'venmo',
  reference text,
  notes text,
  paid_at timestamptz not null default now(),
  paid_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
grant select on public.affiliate_payouts to authenticated;
grant all on public.affiliate_payouts to service_role;
alter table public.affiliate_payouts enable row level security;

create policy "payout owner or admin" on public.affiliate_payouts
  for select to authenticated
  using (
    public.current_user_is_admin()
    or exists (select 1 from public.affiliates a where a.id = affiliate_id and a.user_id = auth.uid())
  );

-- FUNCTIONS

create or replace function public.generate_affiliate_code(_name text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_base text;
  v_code text;
  v_attempt int := 0;
begin
  v_base := upper(regexp_replace(coalesce(_name,'AFF'), '[^a-zA-Z0-9]', '', 'g'));
  if length(v_base) < 3 then v_base := v_base || 'AFF'; end if;
  v_base := left(v_base, 8);
  loop
    v_code := v_base || lpad(floor(random()*10000)::int::text, 4, '0');
    exit when not exists (select 1 from public.affiliates where code = v_code) or v_attempt > 20;
    v_attempt := v_attempt + 1;
  end loop;
  return v_code;
end $$;

create or replace function public.affiliate_signup(_display_name text, _email text default null, _payout_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_code text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if exists (select 1 from public.affiliates where user_id = auth.uid()) then
    raise exception 'Already an affiliate';
  end if;
  v_code := public.generate_affiliate_code(_display_name);
  insert into public.affiliates (user_id, display_name, email, code, payout_method_notes)
    values (auth.uid(), _display_name, _email, v_code, _payout_notes)
    returning id into v_id;
  return v_id;
end $$;

create or replace function public.set_affiliate_status(_affiliate_id uuid, _status public.affiliate_status)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.current_user_is_admin() then raise exception 'Admin only'; end if;
  update public.affiliates set status = _status where id = _affiliate_id;
end $$;

create or replace function public.decide_affiliate_request(_request_id uuid, _approve boolean, _notes text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.current_user_is_admin() then raise exception 'Admin only'; end if;
  update public.affiliate_product_requests
    set status = case when _approve then 'approved'::public.affiliate_request_status else 'rejected'::public.affiliate_request_status end,
        decided_at = now(),
        decided_by = auth.uid(),
        notes = coalesce(_notes, notes)
    where id = _request_id;
end $$;

create or replace function public.record_affiliate_payout(_affiliate_id uuid, _amount numeric, _method public.affiliate_payout_method, _reference text default null, _notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.current_user_is_admin() then raise exception 'Admin only'; end if;
  insert into public.affiliate_payouts (affiliate_id, amount, method, reference, notes, paid_by)
    values (_affiliate_id, _amount, _method, _reference, _notes, auth.uid())
    returning id into v_id;
  update public.affiliates
    set total_paid = total_paid + _amount,
        balance_owed = greatest(balance_owed - _amount, 0)
    where id = _affiliate_id;
  return v_id;
end $$;

create or replace function public.record_affiliate_sale(
  _code text,
  _shopify_order_uuid uuid,
  _shopify_order_line_item_id uuid,
  _product_id uuid,
  _gross_amount numeric
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_affiliate public.affiliates%rowtype;
  v_commission numeric(10,2);
  v_id uuid;
begin
  select * into v_affiliate from public.affiliates where code = _code;
  if v_affiliate.id is null then return null; end if;
  if v_affiliate.status <> 'active' then return null; end if;

  v_commission := round((coalesce(_gross_amount,0) * v_affiliate.commission_percent / 100.0)::numeric, 2);

  insert into public.affiliate_sales
    (affiliate_id, code, shopify_order_uuid, shopify_order_line_item_id, product_id, gross_amount, commission_amount, status)
    values (v_affiliate.id, _code, _shopify_order_uuid, _shopify_order_line_item_id, _product_id, _gross_amount, v_commission, 'approved')
    on conflict (shopify_order_line_item_id) do nothing
    returning id into v_id;

  if v_id is not null then
    update public.affiliates
      set total_earned = total_earned + v_commission,
          balance_owed = balance_owed + v_commission
      where id = v_affiliate.id;
  end if;
  return v_id;
end $$;

create or replace function public.void_affiliate_sale(_sale_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_sale public.affiliate_sales%rowtype;
begin
  if not public.current_user_is_admin() then raise exception 'Admin only'; end if;
  select * into v_sale from public.affiliate_sales where id = _sale_id;
  if v_sale.id is null or v_sale.status = 'void' then return; end if;
  update public.affiliate_sales set status = 'void' where id = _sale_id;
  if v_sale.status in ('pending','approved') then
    update public.affiliates
      set total_earned = greatest(total_earned - v_sale.commission_amount, 0),
          balance_owed = greatest(balance_owed - v_sale.commission_amount, 0)
      where id = v_sale.affiliate_id;
  end if;
end $$;
