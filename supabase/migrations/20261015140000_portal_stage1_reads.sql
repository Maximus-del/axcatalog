-- ============================================================================
-- Mooney World / portal adapter — STAGE 1: reads a real client can actually see
--
-- Found by reading the portal AS a real client login (teamclaypool+mooney,
-- role 'client', linked to Darnell Mooney). "View as" from an AX account hid
-- all of this, because operator policies saw everything:
--
--   product_images   no client policy at all -> 0 of 126 photos visible
--   order_line_items client policy requires a product_id link, and 0 of the
--   orders           org's Shopify lines carry a product_id -> $0 lifetime,
--                    0 orders, empty charts
--
-- WHAT THIS ADDS (nothing is removed, no operator access changes):
--
-- 1. portal_scope_athlete(_athlete_id)
--      The one place that decides whose portal a request is for.
--      A client may only name an athlete they are linked to.
--      An operator ("View as") may name any athlete in an org they can access.
--      Anything else: not found — never reveals that the athlete exists.
--
-- 2. portal_revenue_summary(_athlete_id, _from, _to, _time_zone)
--      Aggregates only. A client never receives an order row, so buyers'
--      names and emails (on `orders`) stay out of the portal entirely.
--      Reports BOTH gross (what the portal shows today) and the part of it
--      that comes from refund- or cancel-flagged orders, so the basis can be
--      chosen without another migration. Returns attributable=false when the
--      organisation holds more than one entity: Shopify attribution is
--      per-organisation, and a shared org's revenue is not this athlete's.
--
-- 3. "client reads own product images"
--      SELECT on product_images for products linked to the caller — the same
--      viewer_product_ids() door products and variants already use.
--
-- Paste into Supabase > SQL Editor and Run. Safe to run twice.
-- ============================================================================

-- 1 -------------------------------------------------------------------------
create or replace function public.portal_scope_athlete(_athlete_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  _id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if _athlete_id is null then
    raise exception 'athlete required' using errcode = '22023';
  end if;

  if public.current_user_is_operator() then
    select a.id into _id
    from athletes a
    where a.id = _athlete_id and public.is_org_accessible(a.organization_id);
  else
    select l.athlete_id into _id
    from user_athlete_links l
    where l.user_id = auth.uid() and l.athlete_id = _athlete_id;
  end if;

  if _id is null then
    -- Same answer whether it does not exist or is not theirs.
    raise exception 'not found' using errcode = 'P0002';
  end if;
  return _id;
end
$$;

comment on function public.portal_scope_athlete(uuid) is
  'Whose portal is this request for? Client: only a linked athlete. Operator (View as): any athlete in an accessible org. Otherwise not found.';

revoke all on function public.portal_scope_athlete(uuid) from public, anon;
grant execute on function public.portal_scope_athlete(uuid) to authenticated;

-- 2 -------------------------------------------------------------------------
create or replace function public.portal_revenue_summary(
  _athlete_id uuid,
  _from timestamptz default null,
  _to timestamptz default null,
  _time_zone text default 'UTC'
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  _aid uuid := public.portal_scope_athlete(_athlete_id);
  _org uuid;
  _entities int;
  _currencies text[];
  _out jsonb;
begin
  -- Rejects an unknown zone name with an error rather than guessing.
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
    select li.line_total, li.quantity, li.product_title,
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
    limit 5
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
$$;

comment on function public.portal_revenue_summary(uuid, timestamptz, timestamptz, text) is
  'Portal revenue aggregates for one scoped athlete. Never returns order rows or buyer details.';

revoke all on function public.portal_revenue_summary(uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.portal_revenue_summary(uuid, timestamptz, timestamptz, text) to authenticated;

-- 3 -------------------------------------------------------------------------
drop policy if exists "client reads own product images" on public.product_images;
create policy "client reads own product images"
  on public.product_images
  for select
  to authenticated
  using (product_id in (select public.viewer_product_ids()));

select 'Portal stage 1 applied' as result;
