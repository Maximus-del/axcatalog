-- Sales catch-up + best sellers by product (2026-10-21). PROPOSED — not applied.
--
-- 1. The three store orders placed after the last import (#1648-#1650), copied
--    from Shopify exactly as the June 1 import stored its rows. #1648 is a
--    Proactive sale and is credited to Proactive's organization, the same way
--    #1647 was. #1649 and #1650 stay with AX, matching how those products'
--    earlier sales were filed. Safe to run twice: skips orders already there.
--
-- 2. portal_revenue_summary groups best sellers by product instead of by
--    product + size ("Strength Club Tee - M" and "- L" were separate rows).
--    The size/colour suffix after " - " is dropped for the grouping only;
--    every total is unchanged. Affects every client's Brand HQ the same way.

begin;

with v(name, shopify_id, order_date, subtotal, shipping, tax, discount, total, fulfillment, org, lid, title, variant, sku, price, line_total) as (values
  ('#1648','7812507566270','2026-06-10T02:39:44Z'::timestamptz, 48::numeric, 4.9::numeric, 4.47::numeric, 0::numeric, 52.9::numeric, 'fulfilled',
   '11111111-1111-4111-8111-000000000003'::uuid, '17260506185918', 'Proactive Strength Club: Performance Tee - L / Black', 'L / Black', null, 48::numeric, 48::numeric),
  ('#1649','7851086971070','2026-06-23T04:47:12Z', 39.99, 6.9, 3.38, 0, 46.89, 'fulfilled',
   '2d6f377e-4fe8-448b-84b3-42aed237f3da', '17327513174206', 'Miami Fin City World Tour Black - XL', 'XL', 'FCVWTOUR_OFB_AX7010_BLACK_XL', 39.99, 39.99),
  ('#1650','7925073674430','2026-07-18T04:12:43Z', 0, 0, 0, 45, 0, 'unfulfilled',
   '2d6f377e-4fe8-448b-84b3-42aed237f3da', '17456433922238', '"Jesus Bless" + Prayer Hands - Small / Black', 'Small / Black', 'notredame', 45, 0)
),
o as (
  insert into orders (organization_id, shopify_order_id, shopify_order_name, order_date, subtotal, shipping, tax, discount, total, currency,
                      financial_status, fulfillment_status, is_test, is_refund, imported_at, attributed_org_id)
  select '2d6f377e-4fe8-448b-84b3-42aed237f3da', v.shopify_id, v.name, v.order_date, v.subtotal, v.shipping, v.tax, v.discount, v.total, 'USD',
         'paid', v.fulfillment, false, false, now(), v.org
  from v
  where not exists (select 1 from orders x where x.shopify_order_id = v.shopify_id)
  returning id, shopify_order_name, attributed_org_id
)
insert into order_line_items (organization_id, order_id, shopify_line_item_id, product_title, variant_title, sku, quantity, unit_price, line_total,
                              attributed_org_id, attribution_confidence, is_upcharge)
select '2d6f377e-4fe8-448b-84b3-42aed237f3da', o.id, v.lid, v.title, v.variant, v.sku, 1, v.price, v.line_total, o.attributed_org_id, 'matched', false
from o join v on v.name = o.shopify_order_name;

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

  with lines as (
    select li.line_total, li.quantity,
           -- "Strength Club Tee - L / Black" -> "Strength Club Tee": best sellers count the product, not each size.
           nullif(trim(regexp_replace(li.product_title, '\s+-\s+[^-]*$', '')), '') as product_title,
           o.id as order_id, o.order_date, o.is_refund, o.imported_at,
           (_from is null or o.order_date >= _from) and (_to is null or o.order_date < _to)
             and o.order_date is not null as in_period
    from order_line_items li
    join orders o on o.id = li.order_id
    where li.attributed_org_id = _org and not o.is_test
  ),
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
           round(sum(coalesce(line_total, 0)), 2) as gross
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
    'as_of', (select max(imported_at) from lines),
    'basis_note', 'gross = Shopify line totals after line discounts, before refunds; refund_flagged = the part from orders Shopify marked cancelled or refunded',
    'lifetime', jsonb_build_object(
      'gross', (select round(coalesce(sum(line_total), 0), 2) from lines),
      'refund_flagged', (select round(coalesce(sum(line_total) filter (where is_refund), 0), 2) from lines),
      'orders', (select count(distinct order_id) from lines),
      'refund_flagged_orders', (select count(distinct order_id) filter (where is_refund) from lines),
      'units', (select coalesce(sum(quantity), 0) from lines)
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

commit;
