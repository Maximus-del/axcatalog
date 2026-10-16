-- Stage 8: product pictures from the Drive library. Who may set folders, who may sync, throttling.
\set ON_ERROR_STOP 0
\set QUIET 1

reset role;
insert into products (id, organization_id, title, status) values
  ('00000000-0000-0000-0000-0000000008d1', '00000000-0000-0000-0000-0000000000a1', 'Signature Jersey #1', 'published'),
  ('00000000-0000-0000-0000-0000000008d2', '00000000-0000-0000-0000-0000000000a1', 'Signature Jersey draft', 'draft'),
  ('00000000-0000-0000-0000-0000000008c1', '00000000-0000-0000-0000-0000000000a2', 'Coleman jersey', 'published');
insert into product_athletes values
  ('00000000-0000-0000-0000-0000000008d1', '00000000-0000-0000-0000-00000000000d'),
  ('00000000-0000-0000-0000-0000000008d2', '00000000-0000-0000-0000-00000000000d'),
  ('00000000-0000-0000-0000-0000000008c1', '00000000-0000-0000-0000-00000000000c');

-- Clients cannot choose folders.
select t.as_user('00000000-0000-0000-0000-0000000000d1');
select t.check('drive: client cannot set folders',
  t.sqlstate_of($q$select public.portal_ops_set_drive_sources('00000000-0000-0000-0000-0000000008d1', '[{"id":"17Fqgs5bMcbRK2f9Ktcq49dFcwjxUtMhC"}]')$q$) like '42501%');

-- Operator sets them; bad ids and other orgs refused.
select t.as_user('00000000-0000-0000-0000-0000000000f1');
select t.check('drive: operator sets folders, duplicates dropped',
  jsonb_array_length(public.portal_ops_set_drive_sources('00000000-0000-0000-0000-0000000008d1',
    '[{"id":"17Fqgs5bMcbRK2f9Ktcq49dFcwjxUtMhC","label":"Shared front"},{"id":"1twvs5embP-bOCRH7JAd2LDY-uajAl4-A"},{"id":"17Fqgs5bMcbRK2f9Ktcq49dFcwjxUtMhC"}]') -> 'sources') = 2);
select public.portal_ops_set_drive_sources('00000000-0000-0000-0000-0000000008d2', '[{"id":"1twvs5embP-bOCRH7JAd2LDY-uajAl4-A"}]');
select t.check('drive: junk id refused',
  t.sqlstate_of($q$select public.portal_ops_set_drive_sources('00000000-0000-0000-0000-0000000008d1', '[{"id":"../../etc"}]')$q$) like 'P0422%');
select t.check('drive: other org''s product not found',
  t.sqlstate_of($q$select public.portal_ops_set_drive_sources('00000000-0000-0000-0000-0000000008c1', '[{"id":"1twvs5embP-bOCRH7JAd2LDY-uajAl4-A"}]')$q$) like 'P0002%');

-- Client sync: only their published product, then throttled.
select t.as_user('00000000-0000-0000-0000-0000000000d1');
select t.check('drive: client gets their live product to sync, not the draft',
  (select jsonb_agg(e ->> 'productId') from jsonb_array_elements(public.portal_drive_targets('00000000-0000-0000-0000-00000000000d') -> 'items') e)
    = '["00000000-0000-0000-0000-0000000008d1"]'::jsonb);
select t.check('drive: second sync within 3 minutes is skipped',
  jsonb_array_length(public.portal_drive_targets('00000000-0000-0000-0000-00000000000d') -> 'items') = 0);
select t.check('drive: client cannot force',
  jsonb_array_length(public.portal_drive_targets('00000000-0000-0000-0000-00000000000d', null, true) -> 'items') = 0);
select t.check('drive: client cannot sync another athlete',
  t.sqlstate_of($q$select public.portal_drive_targets('00000000-0000-0000-0000-00000000000c')$q$) <> '00000');

-- Operator can force, and sees drafts.
select t.as_user('00000000-0000-0000-0000-0000000000f1');
select t.check('drive: operator force syncs one product',
  jsonb_array_length(public.portal_drive_targets('00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-0000000008d1', true) -> 'items') = 1);
select t.check('drive: operator gets the draft too',
  exists (select 1 from jsonb_array_elements(public.portal_drive_targets('00000000-0000-0000-0000-00000000000d') -> 'items') e
          where e ->> 'productId' = '00000000-0000-0000-0000-0000000008d2'));

-- Recording is service-role only.
select t.check('drive: operator cannot record results',
  t.sqlstate_of($q$select public.portal_drive_record('00000000-0000-0000-0000-0000000008d1', '{"shown":3}')$q$) like '42501%');
reset role;
set role service_role;
select public.portal_drive_record('00000000-0000-0000-0000-0000000008d1', '{"shown":3}');
reset role;
select t.check('drive: result recorded, folders kept',
  (select (metadata -> 'drive' ->> 'shown')::int = 3 and jsonb_array_length(metadata -> 'drive' -> 'sources') = 2
   from products where id = '00000000-0000-0000-0000-0000000008d1'));

-- Changing folders clears the throttle.
select t.as_user('00000000-0000-0000-0000-0000000000f1');
select public.portal_ops_set_drive_sources('00000000-0000-0000-0000-0000000008d1', '[{"id":"1twvs5embP-bOCRH7JAd2LDY-uajAl4-A"}]');
select t.as_user('00000000-0000-0000-0000-0000000000d1');
select t.check('drive: new folders sync straight away',
  jsonb_array_length(public.portal_drive_targets('00000000-0000-0000-0000-00000000000d') -> 'items') = 1);
reset role;
