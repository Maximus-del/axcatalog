-- BRAND HQ SALES DETAIL: every product a client has sold (current and
-- archived), their recent fan orders with what was in them, and their own
-- orders as invoices. Owner-only, same gate as portal_revenue_summary.
-- No customer names or emails leave the server.
--
-- House account: the AX house athlete shares the AX organisation with other
-- records, which portal_revenue_summary refuses ("shared_organization") so
-- one athlete never sees another's sales. All AX house sales are credited to
-- that organisation on purpose, so an athlete flagged
-- metadata.house_account = true may read them.

create or replace function public.portal_is_house_account(_aid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce((select (metadata::jsonb->>'house_account')::boolean from athletes where id = _aid), false)
$$;
revoke all on function public.portal_is_house_account(uuid) from public, anon;

-- Let the house account through the shared-organisation guard on the summary.
do $do$
declare _def text;
begin
  select pg_get_functiondef('public.portal_revenue_summary(uuid,timestamp with time zone,timestamp with time zone,text)'::regprocedure) into _def;
  if position('portal_is_house_account' in _def) = 0 then
    _def := replace(_def, 'if _entities <> 1 then', 'if _entities <> 1 and not public.portal_is_house_account(_aid) then');
    if position('portal_is_house_account' in _def) = 0 then raise exception 'patch did not apply'; end if;
    execute _def;
  end if;
end
$do$;

create or replace function public.portal_sales_detail(_athlete_id uuid, _orders_limit int default 50)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  _aid uuid := public.portal_scope_athlete(_athlete_id);
  _org uuid;
  _entities int;
  _out jsonb;
  _lim int := least(greatest(coalesce(_orders_limit, 50), 1), 200);
begin
  if not public.portal_viewer_is_owner(_athlete_id) then
    return jsonb_build_object('attributable', false, 'reason', 'owner_only');
  end if;
  select organization_id into _org from athletes where id = _aid;
  select count(*) into _entities from athletes where organization_id = _org;
  if _entities <> 1 and not public.portal_is_house_account(_aid) then
    return jsonb_build_object('attributable', false, 'reason', 'shared_organization');
  end if;

  with lines as (
    select li.order_id, li.product_id, li.quantity, li.line_total,
           nullif(trim(regexp_replace(li.product_title, '\s+-\s+[^-]*$', '')), '') as base_title,
           nullif(trim(coalesce(li.variant_title, substring(li.product_title from '\s+-\s+([^-]*)$'))), '') as variant,
           o.shopify_order_name as number, o.order_date, o.total as order_total, o.is_refund,
           (o.purchased_by_org_id is not distinct from _org) as own_order,
           p.title as product_name, p.status::text as product_status
    from order_line_items li
    join orders o on o.id = li.order_id
    left join products p on p.id = li.product_id
    where li.attributed_org_id = _org and not o.is_test and not coalesce(li.is_upcharge, false)
  ),
  fan as (select * from lines where not own_order),
  prod as (
    select coalesce(product_id::text, lower(base_title)) as k,
           max(product_id::text) as product_id,
           coalesce(max(product_name), max(base_title)) as title,
           case when bool_or(product_status = 'published') then 'current'
                when bool_or(product_id is not null) then 'archived'
                else 'retired' end as status,
           sum(coalesce(quantity, 0)) as units,
           round(sum(coalesce(line_total, 0)), 2) as gross,
           count(distinct order_id) as orders,
           min(order_date) as first_sale,
           max(order_date) as last_sale
    from fan group by 1
  ),
  fan_orders as (
    select order_id, max(number) as number, max(order_date) as order_date, bool_or(is_refund) as refunded,
           sum(coalesce(quantity, 0)) as units, round(sum(coalesce(line_total, 0)), 2) as gross,
           jsonb_agg(jsonb_build_object('productId', product_id, 'title', coalesce(product_name, base_title), 'variant', variant,
                                        'quantity', quantity, 'total', round(coalesce(line_total, 0), 2)) order by line_total desc nulls last) as items
    from fan group by order_id
    order by max(order_date) desc nulls last
    limit _lim
  ),
  inv as (
    select order_id, max(number) as number, max(order_date) as order_date,
           max(order_total) as charged, sum(coalesce(quantity, 0)) as units,
           jsonb_agg(jsonb_build_object('productId', product_id, 'title', coalesce(product_name, base_title), 'variant', variant,
                                        'quantity', quantity) order by base_title, variant) as items
    from lines where own_order group by order_id
  )
  select jsonb_build_object(
    'attributable', true,
    'products', coalesce((select jsonb_agg(jsonb_build_object('productId', product_id, 'title', title, 'status', status, 'units', units,
                 'gross', gross, 'orders', orders, 'firstSale', first_sale, 'lastSale', last_sale) order by gross desc) from prod), '[]'::jsonb),
    'fanOrders', coalesce((select jsonb_agg(jsonb_build_object('id', order_id, 'number', number, 'date', order_date, 'refunded', refunded,
                 'units', units, 'gross', gross, 'items', items) order by order_date desc nulls last) from fan_orders), '[]'::jsonb),
    'fanOrderCount', (select count(distinct order_id) from fan),
    'invoices', coalesce((select jsonb_agg(jsonb_build_object('id', order_id, 'number', number, 'date', order_date,
                 'charged', round(coalesce(charged, 0), 2), 'billedOutside', coalesce(charged, 0) = 0, 'units', units, 'items', items)
                 order by order_date desc nulls last) from inv), '[]'::jsonb)
  ) into _out;
  return _out;
end
$function$;
revoke all on function public.portal_sales_detail(uuid, int) from public, anon;
grant execute on function public.portal_sales_detail(uuid, int) to authenticated;
