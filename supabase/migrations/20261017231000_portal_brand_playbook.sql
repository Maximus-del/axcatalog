-- Brand HQ playbook: the live numbers behind the client one-pagers
-- ("How your money works", "Level up", "Your code", "AX credit", "Promote").
--
-- Read-only, additive. Everything is derived from data that already drives
-- ordering, so a one-pager can never promise a different number than the
-- order sheet charges:
--   * volume breaks  — the same ladder portal_quote_order applies
--   * bulk prices    — portal_sheet_unit_price on one of the client's own tees / hoodies
--   * credit         — athlete_credit_wallets
--   * code           — the affiliates row of a (non-operator) login linked to this client
--   * terms          — athletes.metadata.brand_terms, set by AX; null until agreed
create or replace function public.portal_brand_playbook(_athlete_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  _aid uuid := public.portal_scope_athlete(_athlete_id);
  _org uuid;
  _meta jsonb;
  _breaks jsonb;
  _samples jsonb := '[]'::jsonb;
  _wallet record;
  _aff record;
  s record;
  pr record;
begin
  select organization_id, coalesce(metadata, '{}'::jsonb) into _org, _meta from athletes where id = _aid;

  -- Mirror portal_quote_order: org tiers when configured, else its fallback ladder.
  if exists (select 1 from volume_discount_tiers where organization_id = _org) then
    select coalesce(jsonb_agg(jsonb_build_object('minUnits', min_qty, 'percent', discount_pct) order by min_qty), '[]'::jsonb)
      into _breaks from volume_discount_tiers where organization_id = _org;
  else
    _breaks := '[{"minUnits":50,"percent":10},{"minUnits":100,"percent":15},{"minUnits":250,"percent":20},{"minUnits":500,"percent":25}]'::jsonb;
  end if;

  -- One real tee and one real hoodie of this client's, priced exactly as the sheet prices them.
  for s in
    select distinct on (kind) kind, id, title, price from (
      select case when lower(p.title) like '%hood%' then 'hoodie'
                  when lower(p.title) like '%tee%' or lower(p.title) like '%shirt%' then 'tee' end as kind,
             p.id, p.title, p.price, p.created_at
        from products p join product_athletes pa on pa.product_id = p.id and pa.athlete_id = _aid
       where p.status::text = 'published'
    ) x where kind is not null order by kind, created_at desc
  loop
    select * into pr from public.portal_sheet_unit_price(s.id, _org);
    _samples := _samples || jsonb_build_object(
      'kind', s.kind, 'productId', s.id, 'title', s.title,
      'retail', s.price, 'athleteUnit', pr.athlete_unit, 'compareUnit', pr.compare_unit);
  end loop;

  select balance, monthly_credit, max_balance into _wallet from athlete_credit_wallets where athlete_id = _aid;

  -- The client's own code: a login linked to this client that is not an AX operator.
  select a.code, a.status::text as status, a.buyer_discount_percent, a.commission_percent into _aff
    from affiliates a
    join user_athlete_links l on l.user_id = a.user_id and l.athlete_id = _aid
   where not exists (select 1 from organization_memberships m
                      where m.user_id = a.user_id and m.role::text in ('admin', 'executive'))
   order by (a.status::text = 'active') desc, a.created_at
   limit 1;

  return jsonb_build_object(
    'terms', case when jsonb_typeof(_meta -> 'brand_terms') = 'object' then jsonb_build_object(
        'revenueSharePercent', (_meta -> 'brand_terms' ->> 'revenue_share_percent')::numeric,
        'payoutSchedule', _meta -> 'brand_terms' ->> 'payout_schedule',
        'note', _meta -> 'brand_terms' ->> 'note') end,
    'volumeBreaks', _breaks,
    'rushSurcharge', 40,
    'bulkSamples', _samples,
    'credit', case when _wallet is null then null else jsonb_build_object(
        'balance', _wallet.balance, 'monthly', _wallet.monthly_credit, 'max', _wallet.max_balance) end,
    'code', case when _aff.code is null then null else jsonb_build_object(
        'code', _aff.code, 'live', _aff.status = 'active',
        'fanDiscountPercent', _aff.buyer_discount_percent, 'commissionPercent', _aff.commission_percent) end
  );
end $$;

revoke all on function public.portal_brand_playbook(uuid) from public, anon;
grant execute on function public.portal_brand_playbook(uuid) to authenticated;
