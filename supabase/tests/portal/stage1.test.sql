-- Stage 1: scope, revenue aggregates, product images — as real clients and an operator.
\set ON_ERROR_STOP 0
\set QUIET 1

-- helper: did a call raise with a given SQLSTATE?
create or replace function t.raises(_sql text, _state text) returns boolean language plpgsql as $$
begin
  execute _sql;
  return false;
exception when others then
  return sqlstate = _state;
end $$;
grant execute on function t.raises(text, text) to authenticated;
create table if not exists t.snap (v jsonb);
grant all on t.snap to authenticated;

-- ---------------------------------------------------------------- Mooney client
select t.as_user('00000000-0000-0000-0000-0000000000d1');

select t.check('mooney: scope to self', public.portal_scope_athlete('00000000-0000-0000-0000-00000000000d') = '00000000-0000-0000-0000-00000000000d');
select t.check('mooney: other athlete id is NOT FOUND, not forbidden',
  t.raises($$select public.portal_scope_athlete('00000000-0000-0000-0000-00000000000c')$$, 'P0002'));
select t.check('mooney: random uuid is NOT FOUND (no existence leak)',
  t.raises($$select public.portal_scope_athlete('00000000-0000-0000-0000-999999999999')$$, 'P0002'));
select t.check('mooney: null athlete rejected',
  t.raises($$select public.portal_scope_athlete(null)$$, '22023'));

select t.check('mooney: lifetime gross includes refund-flagged, excludes test order',
  (public.portal_revenue_summary('00000000-0000-0000-0000-00000000000d') -> 'lifetime' ->> 'gross')::numeric = 135.00,
  public.portal_revenue_summary('00000000-0000-0000-0000-00000000000d')::text);
select t.check('mooney: refund-flagged part reported separately',
  (public.portal_revenue_summary('00000000-0000-0000-0000-00000000000d') -> 'lifetime' ->> 'refund_flagged')::numeric = 90.00);
select t.check('mooney: lifetime orders counts distinct real orders (2, not the test one)',
  (public.portal_revenue_summary('00000000-0000-0000-0000-00000000000d') -> 'lifetime' ->> 'orders')::int = 2);
select t.check('mooney: never sees coleman revenue',
  (public.portal_revenue_summary('00000000-0000-0000-0000-00000000000d') -> 'top_products')::text not like '%Coleman%');
select t.check('mooney: response carries no buyer email',
  public.portal_revenue_summary('00000000-0000-0000-0000-00000000000d', '2026-01-01', '2027-01-01', 'America/Los_Angeles')::text not like '%@%');

-- Timezone boundary: order at 2026-04-01T06:30Z is still MARCH 31 in Los Angeles.
select t.check('tz: LA puts the 06:30Z April-1 order in March',
  exists (select 1 from jsonb_array_elements(public.portal_revenue_summary('00000000-0000-0000-0000-00000000000d', '2026-01-01T08:00:00Z', '2026-07-01T07:00:00Z', 'America/Los_Angeles') -> 'monthly') m
          where m ->> 'month' = '2026-03' and (m ->> 'gross')::numeric = 135.00));
select t.check('tz: UTC puts it in April',
  exists (select 1 from jsonb_array_elements(public.portal_revenue_summary('00000000-0000-0000-0000-00000000000d', '2026-01-01', '2026-07-01', 'UTC') -> 'monthly') m
          where m ->> 'month' = '2026-04' and (m ->> 'gross')::numeric = 90.00));
select t.check('period: [from,to) excludes an order exactly at "to"',
  (public.portal_revenue_summary('00000000-0000-0000-0000-00000000000d', '2026-03-01', '2026-04-01T06:30:00Z', 'UTC') -> 'period' ->> 'gross')::numeric = 45.00);
select t.check('period: end before start rejected',
  t.raises($$select public.portal_revenue_summary('00000000-0000-0000-0000-00000000000d', '2026-05-01', '2026-04-01', 'UTC')$$, '22023'));
select t.check('tz: unknown zone rejected, not guessed',
  t.raises($$select public.portal_revenue_summary('00000000-0000-0000-0000-00000000000d', null, null, 'Mars/Olympus')$$, '22023'));

select t.check('mooney: sees own 2 product images', (select count(*) from product_images) = 2);
select t.check('mooney: still cannot read raw orders (buyer PII)', (select count(*) from orders) = 0);
insert into t.snap select public.portal_revenue_summary('00000000-0000-0000-0000-00000000000d', '2026-01-01', '2027-01-01', 'UTC');
select t.reset();

-- ---------------------------------------------------------------- Coleman client
select t.as_user('00000000-0000-0000-0000-0000000000c1');
select t.check('coleman: own revenue only',
  (public.portal_revenue_summary('00000000-0000-0000-0000-00000000000c') -> 'lifetime' ->> 'gross')::numeric = 60.00);
select t.check('coleman: cannot request mooney revenue',
  t.raises($$select public.portal_revenue_summary('00000000-0000-0000-0000-00000000000d')$$, 'P0002'));
select t.check('coleman: sees only own image', (select count(*) from product_images) = 1);
select t.reset();

-- ---------------------------------------------------------------- shared org
select t.as_user('00000000-0000-0000-0000-0000000005a1');
select t.check('shared org: revenue not attributable to one entity',
  (public.portal_revenue_summary('00000000-0000-0000-0000-00000000005a') ->> 'attributable')::boolean = false);
select t.reset();

-- ---------------------------------------------------------------- operator (View as)
select t.as_user('00000000-0000-0000-0000-0000000000f1');
select t.check('operator: may view as an athlete in an accessible org',
  public.portal_scope_athlete('00000000-0000-0000-0000-00000000000d') = '00000000-0000-0000-0000-00000000000d');
select t.check('operator: may NOT view as an athlete outside their orgs',
  t.raises($$select public.portal_scope_athlete('00000000-0000-0000-0000-00000000000c')$$, 'P0002'));
select t.check('operator: View-as numbers equal the client''s numbers',
  public.portal_revenue_summary('00000000-0000-0000-0000-00000000000d', '2026-01-01', '2027-01-01', 'UTC') = (select v from t.snap limit 1));
select t.reset();

-- ---------------------------------------------------------------- outsider / anon
select t.as_user('00000000-0000-0000-0000-0000000000e1');
select t.check('outsider: no athlete reachable',
  t.raises($$select public.portal_scope_athlete('00000000-0000-0000-0000-00000000000d')$$, 'P0002'));
select t.check('outsider: no images', (select count(*) from product_images) = 0);
select t.reset();

grant usage on schema t to anon; grant execute on all functions in schema t to anon; grant all on t.results to anon;
set role anon;
select t.check('anon: cannot execute the summary at all',
  t.raises($$select public.portal_revenue_summary('00000000-0000-0000-0000-00000000000d')$$, '42501'));
reset role;
