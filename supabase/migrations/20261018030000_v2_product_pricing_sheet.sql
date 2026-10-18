-- V2 pricing sheet: per-product costs, the client's bulk price, and the split.
--
-- Additive only.
--
-- 1. products.athlete_price — what the CLIENT pays per unit on a bulk order.
--    Lives on products (clients can already read their own products) because it
--    is their price, not a secret. NULL = the existing sheet rule
--    (hoodie $35 / tee $18 / engine), so nothing changes until AX sets one.
--
-- 2. product_pricing — AX's private numbers for a product: blank, print and
--    other cost, and a per-product revenue-share override. Operators only; no
--    client policy at all, so a client session can never read AX's costs.
--
-- 3. portal_sheet_unit_price reads products.athlete_price first. That one
--    function prices every portal quote and order, so the number AX types in the
--    sheet IS the number the client is charged.
--
-- 4. bulk_order_requests.payment_status / invoiced_at / paid_at — orders are paid
--    off-platform (Zelle or invoice) in phase 2; AX marks them here.

alter table public.products add column if not exists athlete_price numeric(10, 2);
comment on column public.products.athlete_price is
  'Per-unit bulk price the client pays (before the volume discount). NULL = sheet rule. Set from the V2 pricing sheet.';

create table if not exists public.product_pricing (
  product_id uuid primary key references public.products(id) on delete cascade,
  blank_cost numeric(10, 2),            -- NULL = the blank''s cost (v2_blanks.cost)
  print_cost numeric(10, 2),
  other_cost numeric(10, 2),            -- packaging, labels, labour
  athlete_share_percent numeric(5, 2),  -- NULL = the client''s Brand HQ terms
  notes text,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  constraint product_pricing_costs_nonneg check (
    coalesce(blank_cost, 0) >= 0 and coalesce(print_cost, 0) >= 0 and coalesce(other_cost, 0) >= 0),
  constraint product_pricing_share_range check (
    athlete_share_percent is null or (athlete_share_percent >= 0 and athlete_share_percent <= 100))
);

alter table public.product_pricing enable row level security;

drop policy if exists "product_pricing_operator_access" on public.product_pricing;
create policy "product_pricing_operator_access" on public.product_pricing
  for all to authenticated
  using (public.current_user_is_operator()
         and exists (select 1 from public.products p where p.id = product_id and public.is_org_accessible(p.organization_id)))
  with check (public.current_user_is_operator()
         and exists (select 1 from public.products p where p.id = product_id and public.is_org_accessible(p.organization_id)));

grant select, insert, update, delete on public.product_pricing to authenticated;

create or replace function public.product_pricing_touch() returns trigger
language plpgsql set search_path to 'public' as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;

drop trigger if exists trg_product_pricing_touch on public.product_pricing;
create trigger trg_product_pricing_touch before update on public.product_pricing
  for each row execute function public.product_pricing_touch();

-- The client's price, as set in the sheet, wins over the rule.
create or replace function public.portal_sheet_unit_price(_product_id uuid, _organization_id uuid, OUT athlete_unit numeric, OUT compare_unit numeric)
 returns record
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  p record;
  hay text;
  engine numeric;
begin
  select id, title, product_type, wholesale_price, price, athlete_price into p from products where id = _product_id;
  if p.id is null then return; end if;
  hay := lower(coalesce(p.product_type::text, '') || ' ' || coalesce(p.title, ''));
  if hay like '%hood%' then
    athlete_unit := 35; compare_unit := 48;
  elsif hay like '%tee%' or hay like '%tshirt%' or hay like '%t-shirt%' or hay like '%shirt%' then
    athlete_unit := 18; compare_unit := 25;
  else
    select coalesce(c.unit_price, c.tier_moq_price) into engine
      from public.compute_wholesale_price(_product_id, _organization_id, 10) c;
    athlete_unit := coalesce(engine, 18);
    compare_unit := coalesce(p.wholesale_price, p.price, 25);
  end if;
  if p.athlete_price is not null then
    athlete_unit := p.athlete_price;
    compare_unit := greatest(compare_unit, p.athlete_price);
  end if;
end $function$;

alter table public.bulk_order_requests
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists invoiced_at timestamptz,
  add column if not exists paid_at timestamptz;

do $$ begin
  alter table public.bulk_order_requests
    add constraint bulk_order_requests_payment_status_check check (payment_status in ('unpaid', 'invoiced', 'paid', 'waived'));
exception when duplicate_object then null; end $$;

-- Brand HQ: expose the split basis and payment instructions set in the sheet.
do $$
declare def text;
begin
  def := pg_get_functiondef('public.portal_brand_playbook(uuid)'::regprocedure);
  if position('splitBasis' in def) > 0 then return; end if;
  def := replace(def,
    $r$'note', _meta -> 'brand_terms' ->> 'note') end,$r$,
    $r$'note', _meta -> 'brand_terms' ->> 'note',
        'splitBasis', coalesce(_meta -> 'brand_terms' ->> 'split_basis', 'gross'),
        'paymentInstructions', _meta -> 'brand_terms' ->> 'payment_instructions') end,$r$);
  execute def;
end $$;
