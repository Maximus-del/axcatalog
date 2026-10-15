-- Stage 2 fixtures: the order, credit and pricing objects as they exist in
-- production BEFORE the stage 2 migration (copied from the live definitions on
-- 2026-10-15), so the tests prove what the migration changes.

alter table public.products add column if not exists product_type text;
alter table public.products add column if not exists blank_id uuid;
alter table public.products add column if not exists wholesale_price numeric;

create table public.pricing_tiers (id uuid primary key, name text, is_default boolean default false);
alter table public.organizations add column pricing_tier_id uuid;
create table public.blanks (
  id uuid primary key, price_athlete numeric, price_corporate numeric, price_standard numeric,
  blank_cost numeric, decoration_cost numeric, additional_cost numeric
);
create table public.volume_discount_breaks (pricing_tier_id uuid, min_units int, max_units int, discount_percent numeric, label text);
create table public.volume_discount_tiers (organization_id uuid, min_qty int, discount_pct numeric);
create table public.product_variants (
  id uuid primary key default gen_random_uuid(), product_id uuid, shopify_variant_id text, sku text,
  color text, size text, price numeric, available boolean default true, inventory_quantity int,
  inventory_policy text default 'deny', metadata jsonb default '{}'
);

create type public.bulk_order_status as enum ('draft','submitted','acknowledged','in_production','ready','shipped','completed','cancelled');
create table public.bulk_order_requests (
  id uuid primary key default gen_random_uuid(), organization_id uuid, athlete_id uuid, team_id uuid,
  requested_by uuid, order_number text, status public.bulk_order_status default 'submitted', priority text,
  notes text, admin_notes text, total_units int, created_at timestamptz default now(), updated_at timestamptz default now(),
  wholesale_subtotal numeric, retail_equivalent numeric, total_savings numeric, credit_applied numeric default 0,
  amount_due numeric, payment_method text, channel text, customer_email text, customer_name text
);
create table public.bulk_order_items (
  id uuid primary key default gen_random_uuid(), order_request_id uuid references bulk_order_requests(id),
  product_id uuid, product_name_snapshot text, size text not null, color text, quantity int not null, notes text,
  unit_wholesale_price numeric, unit_retail_price numeric, line_subtotal numeric, customization jsonb,
  created_at timestamptz default now()
);
-- Live trigger: NOT security definer.
create function public.recalc_bulk_order_total() returns trigger language plpgsql set search_path = public as $$
declare v_order_id uuid;
begin
  v_order_id := coalesce(new.order_request_id, old.order_request_id);
  update bulk_order_requests set total_units = coalesce((select sum(quantity) from bulk_order_items where order_request_id = v_order_id), 0)
  where id = v_order_id;
  return null;
end $$;
create trigger trg_recalc_bulk_total after insert or update or delete on public.bulk_order_items for each row execute function public.recalc_bulk_order_total();

alter table public.bulk_order_requests enable row level security;
alter table public.bulk_order_items enable row level security;
create policy "client create own bulk orders" on public.bulk_order_requests for insert with check (
  organization_id = current_user_org_id() and requested_by = auth.uid()
  and exists (select 1 from user_athlete_links where user_id = auth.uid() and athlete_id = bulk_order_requests.athlete_id));
create policy "client read own bulk orders" on public.bulk_order_requests for select using (
  status <> 'draft' and organization_id = current_user_org_id() and not current_user_is_admin()
  and exists (select 1 from user_athlete_links ual where ual.user_id = auth.uid() and ual.athlete_id = bulk_order_requests.athlete_id));
create policy "admin read bulk orders" on public.bulk_order_requests for select using (
  (organization_id = current_user_org_id() and current_user_is_admin()) or current_user_is_platform_admin());
create policy "org read bulk order items" on public.bulk_order_items for select using (exists (
  select 1 from bulk_order_requests o where o.id = bulk_order_items.order_request_id
  and (current_user_is_admin() or exists (select 1 from user_athlete_links ual where ual.user_id = auth.uid() and ual.athlete_id = o.athlete_id))));
grant select, insert on public.bulk_order_requests, public.bulk_order_items to authenticated;

create type public.credit_txn_type as enum ('accrual','used','adjustment','refund');
create table public.athlete_credit_wallets (
  id uuid primary key default gen_random_uuid(), athlete_id uuid unique, balance numeric(10,2) default 0,
  monthly_credit numeric default 500, max_balance numeric default 3000, total_earned numeric default 0, total_used numeric default 0
);
create table public.athlete_credit_transactions (
  id uuid primary key default gen_random_uuid(), wallet_id uuid, athlete_id uuid, order_request_id uuid,
  type public.credit_txn_type, amount numeric, balance_after numeric, notes text, created_by uuid, created_at timestamptz default now()
);
alter table public.athlete_credit_wallets enable row level security;
create policy wallet_self_read on public.athlete_credit_wallets for select using (
  current_user_is_admin() or exists (select 1 from user_athlete_links l where l.athlete_id = athlete_credit_wallets.athlete_id and l.user_id = auth.uid()));
grant select on public.athlete_credit_wallets, public.athlete_credit_transactions to authenticated;

-- Live definitions, verbatim, BEFORE stage 2.
create or replace function public.apply_credit_to_order(_order_id uuid, _amount numeric) returns numeric
 language plpgsql security definer set search_path to 'public' as $function$
declare
  v_athlete uuid; v_status public.bulk_order_status; v_wallet public.athlete_credit_wallets%rowtype; v_new numeric(10,2);
begin
  if _amount is null or _amount <= 0 then return 0; end if;
  select athlete_id, status into v_athlete, v_status from public.bulk_order_requests where id = _order_id;
  if v_athlete is null then raise exception 'Order not found'; end if;
  if v_status = 'draft' then raise exception 'Cannot apply credit to a draft cart'; end if;
  if not public.current_user_is_admin() and not exists (
    select 1 from public.user_athlete_links where athlete_id = v_athlete and user_id = auth.uid()
  ) then raise exception 'Not authorized'; end if;
  select * into v_wallet from public.athlete_credit_wallets where athlete_id = v_athlete for update;
  if _amount > v_wallet.balance then raise exception 'Insufficient credit'; end if;
  v_new := v_wallet.balance - _amount;
  update public.athlete_credit_wallets set balance = v_new, total_used = total_used + _amount where id = v_wallet.id;
  update public.bulk_order_requests set credit_applied = coalesce(credit_applied,0) + _amount where id = _order_id;
  insert into public.athlete_credit_transactions (wallet_id, athlete_id, order_request_id, type, amount, balance_after, notes, created_by)
    values (v_wallet.id, v_athlete, _order_id, 'used', -_amount, v_new, 'Applied to order', auth.uid());
  return v_new;
end $function$;

create or replace function public.refund_order_credit(_order_id uuid) returns numeric
 language plpgsql security definer set search_path to 'public' as $function$
declare v_athlete uuid; v_status public.bulk_order_status; v_applied numeric(10,2); v_wallet public.athlete_credit_wallets%rowtype; v_add numeric(10,2); v_new numeric(10,2);
begin
  select athlete_id, status, coalesce(credit_applied,0) into v_athlete, v_status, v_applied from public.bulk_order_requests where id = _order_id;
  if v_athlete is null or v_applied <= 0 then return 0; end if;
  if v_status = 'draft' then raise exception 'Cannot refund credit on a draft cart'; end if;
  select * into v_wallet from public.athlete_credit_wallets where athlete_id = v_athlete for update;
  v_add := least(v_applied, greatest(v_wallet.max_balance - v_wallet.balance, 0));
  v_new := v_wallet.balance + v_add;
  update public.athlete_credit_wallets set balance = v_new, total_used = greatest(total_used - v_applied, 0) where id = v_wallet.id;
  update public.bulk_order_requests set credit_applied = 0 where id = _order_id;
  insert into public.athlete_credit_transactions (wallet_id, athlete_id, order_request_id, type, amount, balance_after, notes, created_by)
    values (v_wallet.id, v_athlete, _order_id, 'refund', v_add, v_new, 'Order cancelled refund', auth.uid());
  return v_new;
end $function$;

create or replace function public.compute_wholesale_price(_product_id uuid, _organization_id uuid, _unit_count integer)
 returns table(unit_price numeric, tier_moq_price numeric, tier_name text, volume_modifier_percent numeric, volume_break_label text, true_cost numeric, margin_per_unit numeric, margin_percent numeric, pricing_incomplete boolean)
 language plpgsql stable security definer set search_path to 'public' as $function$
declare v_blank public.blanks%rowtype; v_cost numeric;
begin
  select b.* into v_blank from products p join blanks b on b.id = p.blank_id where p.id = _product_id;
  if v_blank.id is null then return; end if;
  v_cost := coalesce(v_blank.blank_cost,0) + coalesce(v_blank.decoration_cost,0) + coalesce(v_blank.additional_cost,0);
  unit_price := v_blank.price_standard; tier_moq_price := v_blank.price_standard; tier_name := 'standard';
  volume_modifier_percent := 0; true_cost := v_cost; margin_per_unit := v_blank.price_standard - v_cost;
  margin_percent := round((v_blank.price_standard - v_cost) / v_blank.price_standard * 100, 2); pricing_incomplete := false;
  return next;
end $function$;

-- ---------------------------------------------------------------- fixtures
insert into pricing_tiers values ('00000000-0000-0000-0000-0000000000b1', 'standard', true);
insert into blanks values ('00000000-0000-0000-0000-0000000000b9', 30, 28, 30, 9, 4, 1);

update products set product_type = 'hoodie', wholesale_price = 48 where id = '00000000-0000-0000-0000-0000000001d1';
insert into products (id, organization_id, title, status, product_type, wholesale_price, price, blank_id) values
  ('00000000-0000-0000-0000-0000000002d1', '00000000-0000-0000-0000-0000000000a1', 'Mooney World Tee', 'published', 'apparel', 25, 30, null),
  ('00000000-0000-0000-0000-0000000003d1', '00000000-0000-0000-0000-0000000000a1', 'Moon''s House Mug', 'published', 'accessory', null, 22, '00000000-0000-0000-0000-0000000000b9'),
  ('00000000-0000-0000-0000-0000000004d1', '00000000-0000-0000-0000-0000000000a1', 'Old Archived Hat', 'archived', 'hat', null, 20, null),
  ('00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000000a1', 'Stocked Hoodie', 'published', 'hoodie', 48, 60, null),
  ('00000000-0000-0000-0000-0000000006d1', '00000000-0000-0000-0000-0000000000a1', 'Unapproved Draft Tee', 'draft', 'tee', null, 20, null);
insert into product_athletes values
  ('00000000-0000-0000-0000-0000000002d1', '00000000-0000-0000-0000-00000000000d'),
  ('00000000-0000-0000-0000-0000000003d1', '00000000-0000-0000-0000-00000000000d'),
  ('00000000-0000-0000-0000-0000000004d1', '00000000-0000-0000-0000-00000000000d'),
  ('00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-00000000000d'),
  ('00000000-0000-0000-0000-0000000006d1', '00000000-0000-0000-0000-00000000000d');
-- Real Shopify variants on the stocked hoodie only.
insert into product_variants (product_id, shopify_variant_id, sku, color, size, available, inventory_quantity, inventory_policy) values
  ('00000000-0000-0000-0000-0000000005d1', 'gid-1', 'SH-BLK-M', 'Black', 'M', true, 5, 'deny'),
  ('00000000-0000-0000-0000-0000000005d1', 'gid-2', 'SH-BLK-L', 'Black', 'L', false, 0, 'deny');

insert into athlete_credit_wallets (athlete_id, balance) values
  ('00000000-0000-0000-0000-00000000000d', 2500.00),
  ('00000000-0000-0000-0000-00000000000c', 100.00);
