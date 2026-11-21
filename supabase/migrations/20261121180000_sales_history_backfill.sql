-- SALES HISTORY: every Shopify order counted, credited to the right client,
-- and a client's own bulk orders kept apart from fan sales.
--
-- Decided with Chase 2026-11-21:
--   * Credit: the product's owner (Mooney, Proactive, Shareef) → else the
--     title says so (Mooney / WRLD, Proactive / Provengers, Shareef / Bear
--     Killer) → else AX house, no split. City lines (World Tour, Strength
--     Club …) and other named athletes (Keon, Carnell, Parker …) are AX house.
--   * A client's own orders (entered for them, tagged client-bulk) are "Your
--     orders", not fan sales: the 20% applies to fan sales only.
--   * Lifetime fan sales show current lineup vs archived products.
--
-- Source of the lines: the Shopify sync copy (shopify_order_line_items). The
-- CSV import missed the lines on 141 orders, incl. #1606 (225 Unleashed tees).
-- Re-runnable: ax_rebuild_sales_attribution() only adds what's missing, then
-- re-credits every line. Lines it adds carry raw_csv_row.source =
-- 'shopify_sync_backfill' so they can be told apart (or removed).

alter table public.orders
  add column if not exists purchased_by_org_id uuid references public.organizations(id);
comment on column public.orders.purchased_by_org_id is
  'Set when the client itself bought this order (bulk / own merch). Counted as the client''s own orders, not fan sales.';
create index if not exists orders_purchased_by_org_idx on public.orders(purchased_by_org_id) where purchased_by_org_id is not null;
create index if not exists oli_attributed_org_idx on public.order_line_items(attributed_org_id);

create or replace function public.ax_rebuild_sales_attribution()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _ax uuid := '2d6f377e-4fe8-448b-84b3-42aed237f3da';       -- Athlete Xclusive (house)
  _mooney uuid := '11111111-1111-4111-8111-000000000001';
  _shareef uuid := '11111111-1111-4111-8111-000000000002';
  _proactive uuid := '11111111-1111-4111-8111-000000000003';
  _added int := 0;
  _linked int := 0;
  _own int := 0;
  _orders int := 0;
begin
  -- 0. Orders the CSV import never saw (anything after the last import):
  --    create them from the Shopify sync so new sales keep counting.
  with ins as (
    insert into orders (organization_id, shopify_order_id, shopify_order_name, order_date, customer_email, customer_name,
                        subtotal, shipping, tax, discount, total, currency, financial_status, fulfillment_status,
                        is_test, is_refund, raw_csv_row, imported_at)
    select s.organization_id, s.shopify_order_id, s.shopify_order_name, coalesce(s.shopify_processed_at, s.shopify_created_at),
           s.customer_email, nullif(trim(coalesce(s.customer_first_name, '') || ' ' || coalesce(s.customer_last_name, '')), ''),
           s.subtotal_price, s.total_shipping, s.total_tax, s.total_discounts, s.total_price, coalesce(s.currency, 'USD'),
           lower(s.financial_status::text), lower(s.fulfillment_status::text),
           ('test' = any(coalesce(s.tags, '{}'))),
           (s.shopify_cancelled_at is not null or s.financial_status::text ilike '%refund%'),
           jsonb_build_object('source', 'shopify_sync_backfill', 'shopify_order_uuid', s.id, 'tags', array_to_string(s.tags, ',')), now()
    from shopify_orders s
    where not exists (select 1 from orders o where o.shopify_order_name = s.shopify_order_name or o.shopify_order_id = s.shopify_order_id)
    returning 1
  )
  select count(*) into _orders from ins;

  -- 1. Lines the CSV import missed: copy them from the Shopify sync.
  with ins as (
    insert into order_line_items (organization_id, order_id, shopify_line_item_id, product_title, variant_title, sku,
                                  quantity, unit_price, line_total, raw_csv_row)
    select o.organization_id, o.id, x.shopify_line_item_id,
           x.product_title || coalesce(' - ' || nullif(x.variant_title, ''), ''),
           x.variant_title, x.sku, x.quantity, x.price, x.line_total,
           jsonb_build_object('source', 'shopify_sync_backfill', 'shopify_product_id', x.shopify_product_id, 'soli_id', x.id)
    from orders o
    join shopify_orders s on s.shopify_order_name = o.shopify_order_name
    join shopify_order_line_items x on x.shopify_order_uuid = s.id
    where not exists (select 1 from order_line_items l where l.order_id = o.id)
    returning 1
  )
  select count(*) into _added from ins;

  -- 2. Link lines to products (current and archived).
  with base as (
    select l.id,
           regexp_replace(coalesce(l.raw_csv_row->>'shopify_product_id', ''), '\D', '', 'g') as pid,
           lower(trim(regexp_replace(l.product_title, '\s+-\s+[^-]*$', ''))) as t
    from order_line_items l
    where l.product_id is null
  ),
  pick as (
    select b.id,
           coalesce(
             (select p.id from products p where b.pid <> '' and regexp_replace(coalesce(p.shopify_product_id, ''), '\D', '', 'g') = b.pid limit 1),
             (select p.id from products p where lower(trim(p.title)) = b.t
                order by (p.status::text = 'published') desc, p.updated_at desc limit 1)
           ) as product_id
    from base b
  ),
  upd as (
    update order_line_items l set product_id = pick.product_id, updated_at = now()
    from pick where pick.id = l.id and pick.product_id is not null
    returning 1
  )
  select count(*) into _linked from upd;

  -- 3. Credit every line: product owner → title → AX house.
  update order_line_items l set
    attributed_org_id = c.org,
    attribution_rule_id = null,
    attribution_confidence = c.how,
    updated_at = now()
  from (
    select l2.id,
           coalesce(own.org,
             case when l2.product_title ~* 'mooney|wrld' then _mooney
                  when l2.product_title ~* 'proactive|provengers|\mpsp\M|ice man|zay libre|crimzyn' then _proactive
                  when l2.product_title ~* 'shareef|bear killer|killer bear|goliath' then _shareef
                  else _ax end) as org,
           case when own.org is not null then 'product_owner'
                when l2.product_title ~* 'mooney|wrld|proactive|provengers|\mpsp\M|ice man|zay libre|crimzyn|shareef|bear killer|killer bear|goliath' then 'title_rule'
                else 'house_default' end as how
    from order_line_items l2
    left join lateral (
      select a.organization_id as org
      from product_athletes pa join athletes a on a.id = pa.athlete_id
      where pa.product_id = l2.product_id and a.organization_id in (_mooney, _proactive, _shareef)
      limit 1
    ) own on true
  ) c
  where c.id = l.id
    and (l.attributed_org_id is distinct from c.org or l.attribution_confidence is distinct from c.how);

  -- Order credit = the client with the most money on it.
  update orders o set attributed_org_id = t.org, updated_at = now()
  from (
    select distinct on (order_id) order_id, attributed_org_id as org
    from order_line_items group by order_id, attributed_org_id
    order by order_id, sum(coalesce(line_total, 0)) desc
  ) t
  where t.order_id = o.id and o.attributed_org_id is distinct from t.org;

  -- 4. The client's own orders: entered in their name with no customer email,
  --    or tagged client-bulk / client-<name>. Family and friends who paid
  --    retail stay fan sales.
  --    Chase's rule (2026-11-21): placed by the client or by Chase / AX, or an
  --    outlier: over $500 or 10+ units (a camp order entered wrong). Fans buy
  --    1–6 units.
  with own as (
    update orders o set purchased_by_org_id = o.attributed_org_id, updated_at = now()
    from (select order_id, sum(coalesce(quantity, 0)) as u, sum(coalesce(line_total, 0)) as v
          from order_line_items group by order_id) q
    where q.order_id = o.id
      and o.attributed_org_id in (_mooney, _proactive, _shareef)
      and o.purchased_by_org_id is null
      and (
        exists (select 1 from shopify_orders s where s.shopify_order_name = o.shopify_order_name
                  and s.tags && array['client-bulk', 'ax-portal-wholesale'])
        or coalesce(o.raw_csv_row->>'tags', '') ~* 'client-bulk|ax-portal-wholesale'
        or trim(coalesce(o.customer_name, '')) ~* '^(darnell mooney|chase claypool|steven shareef|proactive.*)$'
        or coalesce(o.customer_email, '') ~* '@athletexclusive\.com$|chaseclaypool|teamclaypool'
        or greatest(coalesce(o.total, 0), q.v) > 500
        or q.u >= 10
      )
    returning 1
  )
  select count(*) into _own from own;

  return jsonb_build_object('orders_added', _orders, 'lines_added', _added, 'lines_linked', _linked, 'own_orders_marked', _own);
end
$$;
revoke all on function public.ax_rebuild_sales_attribution() from public, anon, authenticated;

-- Keep it current: after each Shopify sync writes line items, re-credit.
create or replace function public.ax_after_shopify_lines_sync()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.ax_rebuild_sales_attribution();
  return null;
end $$;
revoke all on function public.ax_after_shopify_lines_sync() from public, anon, authenticated;
drop trigger if exists ax_rebuild_sales_after_sync on public.shopify_order_line_items;
create trigger ax_rebuild_sales_after_sync
  after insert on public.shopify_order_line_items
  for each statement execute function public.ax_after_shopify_lines_sync();

-- Portal revenue: fan sales (current lineup vs archived) + the client's own orders.
create or replace function public.portal_revenue_summary(_athlete_id uuid, _from timestamp with time zone default null, _to timestamp with time zone default null, _time_zone text default 'UTC')
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  _aid uuid := public.portal_scope_athlete(_athlete_id);
  _org uuid;
  _entities int;
  _currencies text[];
  _out jsonb;
begin
  -- AX_OWNER_GATE
  if not public.portal_viewer_is_owner(_athlete_id) then
    return jsonb_build_object('attributable', false, 'reason', 'owner_only');
  end if;
  perform now() at time zone _time_zone;
  if _from is not null and _to is not null and _to <= _from then
    raise exception 'period end must be after start' using errcode = '22023';
  end if;

  select organization_id into _org from athletes where id = _aid;
  select count(*) into _entities from athletes where organization_id = _org;
  if _entities <> 1 then
    return jsonb_build_object('attributable', false, 'reason', 'shared_organization');
  end if;

  select coalesce(array_agg(distinct coalesce(o.currency, 'USD')), '{}')
  into _currencies
  from order_line_items li
  join orders o on o.id = li.order_id
  where li.attributed_org_id = _org and not o.is_test;

  with all_lines as (
    select li.line_total, li.quantity,
           nullif(trim(regexp_replace(li.product_title, '\s+-\s+[^-]*$', '')), '') as product_title,
           o.id as order_id, o.order_date, o.is_refund, o.imported_at,
           (o.purchased_by_org_id is not distinct from _org) as own_order,
           coalesce(p.status::text = 'published', false) as current_product,
           (_from is null or o.order_date >= _from) and (_to is null or o.order_date < _to)
             and o.order_date is not null as in_period
    from order_line_items li
    join orders o on o.id = li.order_id
    left join products p on p.id = li.product_id
    where li.attributed_org_id = _org and not o.is_test
  ),
  lines as (select * from all_lines where not own_order),
  own as (select * from all_lines where own_order),
  monthly as (
    select to_char(date_trunc('month', order_date at time zone _time_zone), 'YYYY-MM') as month,
           round(sum(coalesce(line_total, 0)), 2) as gross,
           round(sum(coalesce(line_total, 0)) filter (where is_refund), 2) as refund_flagged
    from lines
    where in_period
    group by 1
  ),
  tops as (
    select product_title as title,
           sum(coalesce(quantity, 0)) as units,
           round(sum(coalesce(line_total, 0)), 2) as gross,
           bool_or(current_product) as current
    from lines
    where in_period and product_title is not null
    group by product_title
    order by 3 desc
    limit 6
  )
  select jsonb_build_object(
    'attributable', true,
    'currency', case when cardinality(_currencies) <= 1 then coalesce(_currencies[1], 'USD') else null end,
    'currencies', to_jsonb(_currencies),
    'as_of', (select max(imported_at) from all_lines),
    'basis_note', 'gross = fan sales: Shopify line totals after line discounts, before refunds; the client''s own orders are in own_orders, not here; refund_flagged = the part from orders Shopify marked cancelled or refunded',
    'lifetime', jsonb_build_object(
      'gross', (select round(coalesce(sum(line_total), 0), 2) from lines),
      'refund_flagged', (select round(coalesce(sum(line_total) filter (where is_refund), 0), 2) from lines),
      'orders', (select count(distinct order_id) from lines),
      'refund_flagged_orders', (select count(distinct order_id) filter (where is_refund) from lines),
      'units', (select coalesce(sum(quantity), 0) from lines),
      'current_gross', (select round(coalesce(sum(line_total) filter (where current_product), 0), 2) from lines),
      'archived_gross', (select round(coalesce(sum(line_total) filter (where not current_product), 0), 2) from lines),
      'first_sale', (select min(order_date) from lines)
    ),
    'own_orders', jsonb_build_object(
      'gross', (select round(coalesce(sum(line_total), 0), 2) from own),
      'orders', (select count(distinct order_id) from own),
      'units', (select coalesce(sum(quantity), 0) from own),
      'last', (select max(order_date) from own)
    ),
    'period', case when _from is null and _to is null then null else jsonb_build_object(
      'gross', (select round(coalesce(sum(line_total), 0), 2) from lines where in_period),
      'refund_flagged', (select round(coalesce(sum(line_total) filter (where is_refund), 0), 2) from lines where in_period),
      'orders', (select count(distinct order_id) from lines where in_period)
    ) end,
    'monthly', coalesce((select jsonb_agg(jsonb_build_object('month', month, 'gross', gross, 'refund_flagged', coalesce(refund_flagged, 0)) order by month) from monthly), '[]'::jsonb),
    'top_products', coalesce((select jsonb_agg(to_jsonb(tops)) from tops), '[]'::jsonb)
  ) into _out;

  return _out;
end
$function$;
