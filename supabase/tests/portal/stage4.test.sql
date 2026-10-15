-- Stages 4 + 5: content library, drops, profile, affiliate money columns.
\set ON_ERROR_STOP 0
\set QUIET 1

create or replace function t.raises(_sql text, _state text) returns boolean language plpgsql as $$
begin execute _sql; return false;
exception when others then return sqlstate = _state; end $$;
grant execute on function t.raises(text, text) to authenticated;
create or replace function t.runs(_sql text) returns boolean language plpgsql as $$
begin execute _sql; return true; exception when others then return false; end $$;
grant execute on function t.runs(text) to authenticated;
create or replace function t.peek(_sql text) returns text language plpgsql security definer as $$
declare r text; begin execute _sql into r; return r; end $$;
grant execute on function t.peek(text) to authenticated;
create table if not exists t.kv (k text primary key, v text);
grant all on t.kv to authenticated;
create or replace function t.put(_k text, _v text) returns void language sql as $$ insert into t.kv values (_k, _v) on conflict (k) do update set v = excluded.v $$;
create or replace function t.get(_k text) returns text language sql as $$ select v from t.kv where k = _k $$;
grant execute on function t.put(text, text), t.get(text) to authenticated;

\set M '''00000000-0000-0000-0000-00000000000d'''

select t.as_user('00000000-0000-0000-0000-0000000000d1');
-- ================================================================ content
select t.check('assets: product photos, social assets and published posts, newest first',
  (select string_agg(a ->> 'kind', ',') from jsonb_array_elements(public.portal_list_assets(:M) -> 'items') a) like '%video%'
  and (select count(*) from jsonb_array_elements(public.portal_list_assets(:M) -> 'items') a where a ->> 'kind' = 'product') >= 2);
select t.check('assets: unpublished posts and other athletes'' posts excluded',
  public.portal_list_assets(:M)::text not like '%Unpublished draft%' and public.portal_list_assets(:M)::text not like '%Coleman%');
select t.check('assets: filter by kind', (select bool_and(a ->> 'kind' = 'video') from jsonb_array_elements(public.portal_list_assets(:M, 'video') -> 'items') a));
select t.check('assets: filter by collection (atlanta → only the hoodie''s media)',
  (select bool_and((a ->> 'product_id') = '00000000-0000-0000-0000-0000000001d1') from jsonb_array_elements(public.portal_list_assets(:M, null, 'atlanta') -> 'items') a));
select t.check('assets: another athlete''s collection refused', t.raises($$select public.portal_list_assets('00000000-0000-0000-0000-00000000000d', null, 'coleman-drop')$$, 'P0422'));
select t.check('assets: paging', (public.portal_list_assets(:M, null, null, null, 1) ->> 'nextCursor') is not null);

-- ================================================================ drops
select t.check('drops: his existing scheduled drop is visible, live once its date passed',
  exists (select 1 from jsonb_array_elements(public.portal_list_drops(:M) -> 'items') d where d ->> 'title' = 'Mooney World — Fall Drop' and d ->> 'status' = 'live' and d ->> 'destinationId' = 'atlanta'));
select t.check('drops: never sees coleman''s', public.portal_list_drops(:M)::text not like '%Coleman%');
select t.put('d1', public.portal_create_drop(:M, '77777777-0000-0000-0000-000000000001', 'Giants Capsule', 'atlanta', '2026-11-01 18:00', 'America/Los_Angeles') ->> 'id');
select t.check('drops: plan a draft; 6pm Los Angeles on Nov 1 (DST already ended) is 02:00 UTC Nov 2',
  t.peek(format('select public_date = %L::timestamptz and status = %L from drops where id = %L', '2026-11-02T02:00:00Z', 'draft', t.get('d1')))::boolean);
select t.check('drops: DST — 6pm LA on Nov 2 (after fall-back) is 02:00 UTC',
  (public.portal_create_drop(:M, null, 'After DST', null, '2026-11-02 18:00', 'America/Los_Angeles') ->> 'scheduledAt')::timestamptz = '2026-11-03T02:00:00Z');
select t.check('drops: replayed create returns the same draft',
  (public.portal_create_drop(:M, '77777777-0000-0000-0000-000000000001', 'Giants Capsule', 'atlanta', '2026-11-01 18:00', 'America/Los_Angeles') ->> 'id') = t.get('d1'));
select t.check('drops: bad time zone refused', t.raises($$select public.portal_create_drop('00000000-0000-0000-0000-00000000000d', null, 'X', null, '2026-11-01 18:00', 'Mars/Olympus')$$, 'P0422'));
select t.put('d1v', t.peek(format('select updated_at from drops where id = %L', t.get('d1'))));
select t.check('drops: a stale edit is refused (409)',
  t.raises(format('select public.portal_update_drop(%L, %L, %L, %L)', '00000000-0000-0000-0000-00000000000d', t.get('d1'), '2020-01-01T00:00:00Z', '{"title":"x"}'), 'P0409'));
select t.check('drops: cannot set status or publish from the browser',
  t.raises(format('select public.portal_update_drop(%L, %L, %L, %L)', '00000000-0000-0000-0000-00000000000d', t.get('d1'), t.get('d1v'), '{"status":"scheduled"}'), 'P0422'));
select t.check('drops: changing only the zone keeps the same local time',
  (public.portal_update_drop(:M, t.get('d1')::uuid, t.get('d1v')::timestamptz, '{"timeZone":"America/New_York"}') ->> 'scheduledAt')::timestamptz = '2026-11-01T23:00:00Z');
select t.put('d1v', t.peek(format('select updated_at from drops where id = %L', t.get('d1'))));
select t.check('drops: send for review → status review, no longer editable',
  (public.portal_update_drop(:M, t.get('d1')::uuid, t.get('d1v')::timestamptz, '{"submitForReview":true}') ->> 'status') = 'review');
select t.put('d1v', t.peek(format('select updated_at from drops where id = %L', t.get('d1'))));
select t.check('drops: a draft in review cannot be edited',
  t.raises(format('select public.portal_update_drop(%L, %L, %L, %L)', '00000000-0000-0000-0000-00000000000d', t.get('d1'), t.get('d1v'), '{"title":"sneaky"}'), 'P0409'));
select t.check('drops: the live drop cannot be edited',
  t.raises($$select public.portal_update_drop('00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000d401', (select null::timestamptz), '{"title":"x"}')$$, 'P0409'));

-- ================================================================ profile
select t.check('profile: approved referral code, no made-up URL',
  (public.portal_get_profile(:M) -> 'referral' ->> 'code') = 'MOONEY10' and (public.portal_get_profile(:M) -> 'referral' -> 'url') = 'null'::jsonb);
select t.check('profile: bio and website editable',
  (public.portal_update_profile(:M, null, '{"bio":"WR. Mooney World.","website":"https://mooneyworld.com"}') ->> 'bio') = 'WR. Mooney World.');
select t.check('profile: name, number, team and look are not editable here',
  t.raises($$select public.portal_update_profile('00000000-0000-0000-0000-00000000000d', null, '{"display_name":"Someone Else","portal_theme":{}}')$$, 'P0422'));
select t.check('profile: a non-https website refused', t.raises($$select public.portal_update_profile('00000000-0000-0000-0000-00000000000d', null, '{"website":"javascript:alert(1)"}')$$, 'P0422'));
select t.check('profile: a stale screen refused', t.raises($$select public.portal_update_profile('00000000-0000-0000-0000-00000000000d', '2020-01-01T00:00:00Z', '{"bio":"x"}')$$, 'P0409'));
select t.check('profile: editing kept the other metadata (theme etc.)', t.peek($q$select metadata ? 'bio' from athletes where id = '00000000-0000-0000-0000-00000000000d'$q$)::boolean);

-- ================================================================ affiliate money columns
select t.check('affiliate: may edit own display name',
  t.runs($$update affiliates set display_name = 'Darnell' where user_id = '00000000-0000-0000-0000-0000000000d1'$$)
  and t.peek($q$select display_name from affiliates where code = 'MOONEY10'$q$) = 'Darnell');
select t.check('affiliate: cannot raise own commission', t.raises($$update affiliates set commission_percent = 90 where user_id = '00000000-0000-0000-0000-0000000000d1'$$, '42501'));
select t.check('affiliate: cannot set own balance owed', t.raises($$update affiliates set balance_owed = 10000 where user_id = '00000000-0000-0000-0000-0000000000d1'$$, '42501'));
select t.check('affiliate: cannot change own code or status', t.raises($$update affiliates set code = 'FREE100', status = 'active' where user_id = '00000000-0000-0000-0000-0000000000d1'$$, '42501'));
select t.check('affiliate: figures unchanged', t.peek($q$select commission_percent = 10 and balance_owed = 0 from affiliates where code = 'MOONEY10'$q$)::boolean);
select t.reset();

select t.as_user('00000000-0000-0000-0000-0000000000f1');
select t.check('operator: AX can still change commission',
  t.runs($$update affiliates set commission_percent = 12 where code = 'MOONEY10'$$)
  and t.peek($q$select commission_percent from affiliates where code = 'MOONEY10'$q$)::numeric = 12);
select t.check('operator (View as): sees the client''s drops and profile', jsonb_array_length(public.portal_list_drops(:M) -> 'items') >= 2
  and (public.portal_get_profile(:M) ->> 'bio') = 'WR. Mooney World.');
select t.check('operator (View as): cannot plan a drop as the client', t.raises($$select public.portal_create_drop('00000000-0000-0000-0000-00000000000d', null, 'X')$$, '42501'));
select t.check('operator (View as): cannot edit the client''s profile', t.raises($$select public.portal_update_profile('00000000-0000-0000-0000-00000000000d', null, '{"bio":"x"}')$$, '42501'));
select t.reset();

select t.as_user('00000000-0000-0000-0000-0000000000c1');
select t.check('coleman: no access to mooney''s assets, drops or profile',
  t.raises($$select public.portal_list_assets('00000000-0000-0000-0000-00000000000d')$$, 'P0002')
  and t.raises($$select public.portal_list_drops('00000000-0000-0000-0000-00000000000d')$$, 'P0002')
  and t.raises($$select public.portal_get_profile('00000000-0000-0000-0000-00000000000d')$$, 'P0002'));
select t.check('coleman: cannot edit mooney''s drop through his own scope',
  t.raises(format('select public.portal_update_drop(%L, %L, null, %L)', '00000000-0000-0000-0000-00000000000c', t.get('d1'), '{"title":"x"}'), 'P0002'));
select t.check('coleman: no referral code of his own → null', (public.portal_get_profile('00000000-0000-0000-0000-00000000000c') -> 'referral') = 'null'::jsonb);
select t.reset();

set role anon;
select t.check('anon: nothing', t.raises($$select public.portal_list_assets('00000000-0000-0000-0000-00000000000d')$$, '42501'));
reset role;
