-- Stage 9: Drive folder links keep a file-name filter.
\set ON_ERROR_STOP 0
\set QUIET 1
reset role;
insert into products (id, organization_id, title, status) values
  ('00000000-0000-0000-0000-0000000009d1', '00000000-0000-0000-0000-0000000000a1', 'WRLD Tee #11', 'published');
select t.as_user('00000000-0000-0000-0000-0000000000f1');
select t.check('drive match: filter kept and uppercased',
  (public.portal_ops_set_drive_sources('00000000-0000-0000-0000-0000000009d1', '[{"id":"1pXOEB1XAmvaYSyZ7_GN52skHAl6af2kU","match":"chi11"}]') -> 'sources' -> 0 ->> 'match') = 'CHI11');
select t.check('drive match: same folder with two filters kept twice',
  jsonb_array_length(public.portal_ops_set_drive_sources('00000000-0000-0000-0000-0000000009d1',
    '[{"id":"1pXOEB1XAmvaYSyZ7_GN52skHAl6af2kU","match":"CHI11"},{"id":"1pXOEB1XAmvaYSyZ7_GN52skHAl6af2kU","match":"NYG17"},{"id":"1pXOEB1XAmvaYSyZ7_GN52skHAl6af2kU","match":"chi11"}]') -> 'sources') = 2);
select t.check('drive match: junk filter refused',
  t.sqlstate_of($q$select public.portal_ops_set_drive_sources('00000000-0000-0000-0000-0000000009d1', '[{"id":"1pXOEB1XAmvaYSyZ7_GN52skHAl6af2kU","match":"<script>"}]')$q$) like 'P0422%');
select t.as_user('00000000-0000-0000-0000-0000000000d1');
select t.check('drive match: clients still refused',
  t.sqlstate_of($q$select public.portal_ops_set_drive_sources('00000000-0000-0000-0000-0000000009d1', '[]')$q$) like '42501%');
reset role;
