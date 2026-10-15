-- Stage 3: projects, concept versions, approvals, messages, uploads, file authorization, product approval.
\set ON_ERROR_STOP 0
\set QUIET 1

create or replace function t.raises(_sql text, _state text) returns boolean language plpgsql as $$
begin execute _sql; return false;
exception when others then return sqlstate = _state; end $$;
grant execute on function t.raises(text, text) to authenticated, service_role;
grant usage on schema t to service_role; grant execute on all functions in schema t to service_role; grant all on t.results to service_role;
create table if not exists t.kv (k text primary key, v text);
grant all on t.kv to authenticated, service_role;
create or replace function t.put(_k text, _v text) returns void language sql as $$ insert into t.kv values (_k, _v) on conflict (k) do update set v = excluded.v $$;
create or replace function t.get(_k text) returns text language sql as $$ select v from t.kv where k = _k $$;
grant execute on function t.put(text, text), t.get(text) to authenticated, service_role;

-- Read internal tables as the test's superuser, whatever role is active.
create or replace function t.peek(_sql text) returns text language plpgsql security definer as $$
declare r text; begin execute _sql into r; return r; end $$;
grant execute on function t.peek(text) to authenticated, service_role;

\set M '''00000000-0000-0000-0000-00000000000d'''

-- ================================================================ uploads (Mooney)
select t.as_user('00000000-0000-0000-0000-0000000000d1');
select t.put('up1', public.portal_begin_upload(:M, 'inspiration', 'giants ref.png', 'image/png', 2048) ->> 'uploadId');
select t.put('up_bad', public.portal_begin_upload(:M, 'inspiration', 'fake.png', 'image/png', 4096) ->> 'uploadId');
select t.put('up_pending', public.portal_begin_upload(:M, 'attachment', 'later.pdf', 'application/pdf', 100) ->> 'uploadId');
select t.check('upload: path is private, scoped to the athlete, and sanitised',
  t.peek(format($q$select path like '00000000-0000-0000-0000-00000000000d/general/%%/giants-ref.png' and bucket = 'portal-uploads' from portal_uploads where id = %L$q$, t.get('up1')))::boolean);
select t.check('upload: executable type refused', t.raises($$select public.portal_begin_upload('00000000-0000-0000-0000-00000000000d', 'inspiration', 'x.exe', 'application/x-msdownload', 10)$$, 'P0422'));
select t.check('upload: over 10 MB refused', t.raises($$select public.portal_begin_upload('00000000-0000-0000-0000-00000000000d', 'inspiration', 'big.png', 'image/png', 10485761)$$, 'P0422'));
select t.check('upload: a browser cannot finalize its own upload',
  t.raises(format('select public.portal_finalize_upload(%L, %L, %L, 2048)', t.get('up1'), '00000000-0000-0000-0000-0000000000d1', 'image/png'), '42501'));
select t.reset();

set role service_role;
select t.check('finalize (service): matching contents → finalized',
  public.portal_finalize_upload(t.get('up1')::uuid, '00000000-0000-0000-0000-0000000000d1', 'image/png', 2048) ->> 'status' = 'finalized');
select t.check('finalize (service): retried finalize is idempotent',
  (public.portal_finalize_upload(t.get('up1')::uuid, '00000000-0000-0000-0000-0000000000d1', 'image/png', 2048) ->> 'replayed')::boolean);
select t.check('finalize (service): a .png that is really something else → rejected',
  public.portal_finalize_upload(t.get('up_bad')::uuid, '00000000-0000-0000-0000-0000000000d1', 'application/pdf', 4096) ->> 'status' = 'rejected');
select t.check('finalize (service): wrong user id → not found',
  t.raises(format('select public.portal_finalize_upload(%L, %L, %L, 2048)', t.get('up1'), '00000000-0000-0000-0000-0000000000c1', 'image/png'), 'P0002'));
reset role;

-- ================================================================ projects (Mooney)
select t.as_user('00000000-0000-0000-0000-0000000000d1');
select t.put('p1', public.portal_create_project(:M, '55555555-0000-0000-0000-000000000001', 'Giants Inspired', 'new_merch',
  'Giants-inspired hoodie with my 17', array['Streetwear','Athletic'], 'Number 17, New York', 'atlanta', array[t.get('up1')::uuid]) ->> 'id');
select t.check('project: created as a design thread with brief', t.peek(format($q$select category = 'design_feedback' and kind = 'new_merch' and brief ->> 'idea' like 'Giants%%' from portal_threads where id = %L$q$, t.get('p1')))::boolean);
select t.check('project: status requested, version 1', (public.portal_get_project(:M, t.get('p1')::uuid) ->> 'status') = 'requested' and (public.portal_get_project(:M, t.get('p1')::uuid) ->> 'version')::int = 1);
select t.check('project: destination resolved from the collection', (public.portal_get_project(:M, t.get('p1')::uuid) ->> 'destinationId') = 'atlanta');
select t.check('project: first message carries the brief and the inspiration', t.peek(format('select count(*) from portal_message_attachments a join portal_messages m on m.id = a.message_id where m.thread_id = %L', t.get('p1')))::int = 1);
select t.check('project: replay of the same request returns the same project',
  (public.portal_create_project(:M, '55555555-0000-0000-0000-000000000001', 'Giants Inspired', 'new_merch',
    'Giants-inspired hoodie with my 17', array['Streetwear','Athletic'], 'Number 17, New York', 'atlanta', array[t.get('up1')::uuid]) ->> 'id') = t.get('p1')
  and t.peek($q$select count(*) from portal_threads where athlete_id = '00000000-0000-0000-0000-00000000000d' and category = 'design_feedback'$q$)::int = 1);
select t.check('project: bad kind → 422', t.raises($$select public.portal_create_project('00000000-0000-0000-0000-00000000000d', null, 'X', 'lasers', 'idea')$$, 'P0422'));
select t.check('project: another athlete''s collection → 422', t.raises($$select public.portal_create_project('00000000-0000-0000-0000-00000000000d', null, 'X', 'other', 'idea', '{}', null, 'coleman-drop')$$, 'P0422'));
select t.check('project: a rejected upload cannot be used as inspiration',
  t.raises(format('select public.portal_create_project(%L, null, %L, %L, %L, %L, null, null, array[%L::uuid])', '00000000-0000-0000-0000-00000000000d', 'X', 'other', 'idea', '{}', t.get('up_bad')), 'P0422'));
select t.check('project: an unfinished upload cannot be used either',
  t.raises(format('select public.portal_create_project(%L, null, %L, %L, %L, %L, null, null, array[%L::uuid])', '00000000-0000-0000-0000-00000000000d', 'X', 'other', 'idea', '{}', t.get('up_pending')), 'P0422'));
select t.reset();

-- ================================================================ operator shares a concept
select t.as_user('00000000-0000-0000-0000-0000000000f1');
select t.check('share: production artwork bucket refused',
  t.raises(format('select public.portal_share_concept(%L, %L, %L)', t.get('p1'), 'design-files', 'x.png'), 'P0422'));
select t.put('c1', public.portal_share_concept(t.get('p1')::uuid, 'design-previews', 'mooney/giants-v1.png', 'Giants Hoodie') ->> 'conceptId');
select t.check('share: project now waits for feedback, client unread', (public.portal_get_project(:M, t.get('p1')::uuid) ->> 'status') = 'feedback'
  and t.peek(format('select portal_unread from portal_threads where id = %L', t.get('p1')))::boolean);
select t.check('operator (View as) cannot decide for the client',
  t.raises(format('select public.portal_decide_concept(%L, %L, %L, 1, 2, %L)', '00000000-0000-0000-0000-00000000000d', t.get('p1'), t.get('c1'), 'approve'), '42501'));
select t.reset();

-- ================================================================ decisions (Mooney)
select t.as_user('00000000-0000-0000-0000-0000000000d1');
select t.check('decide: stale project version → 409',
  t.raises(format('select public.portal_decide_concept(%L, %L, %L, 1, 1, %L)', '00000000-0000-0000-0000-00000000000d', t.get('p1'), t.get('c1'), 'approve'), 'P0409'));
select t.check('decide: request changes needs feedback → 422',
  t.raises(format('select public.portal_decide_concept(%L, %L, %L, 1, 2, %L)', '00000000-0000-0000-0000-00000000000d', t.get('p1'), t.get('c1'), 'request_changes'), 'P0422'));
select t.check('decide: request changes with feedback',
  public.portal_decide_concept(:M, t.get('p1')::uuid, t.get('c1')::uuid, 1, 2, 'request_changes', 'Bigger 17 on the back') ->> 'status' = 'in_progress');
select t.check('decide: feedback posted into the project chat for AX', t.peek(format('select admin_unread from portal_threads where id = %L', t.get('p1')))::boolean
  and t.peek(format($q$select count(*) from portal_messages where thread_id = %L and body like 'Changes requested%%Bigger 17%%'$q$, t.get('p1')))::int = 1);
select t.reset();

select t.as_user('00000000-0000-0000-0000-0000000000f1');
select t.put('c2', public.portal_share_concept(t.get('p1')::uuid, 'design-previews', 'mooney/giants-v2.png', null, t.get('c1')::uuid) ->> 'conceptId');
select t.reset();

select t.as_user('00000000-0000-0000-0000-0000000000d1');
select t.check('versions: v2 replaced v1 and kept its title',
  t.peek(format($q$select version = 2 and title = 'Giants Hoodie' from portal_project_concepts where id = %L$q$, t.get('c2')))::boolean
  and t.peek(format('select superseded_at is not null from portal_project_concepts where id = %L', t.get('c1')))::boolean);
select t.check('versions: approving the old v1 is refused (409)',
  t.raises(format('select public.portal_decide_concept(%L, %L, %L, 1, 4, %L)', '00000000-0000-0000-0000-00000000000d', t.get('p1'), t.get('c1'), 'approve'), 'P0409'));
select t.check('versions: claiming v1 of the v2 row is refused (409)',
  t.raises(format('select public.portal_decide_concept(%L, %L, %L, 1, 4, %L)', '00000000-0000-0000-0000-00000000000d', t.get('p1'), t.get('c2'), 'approve'), 'P0409'));
select t.check('approve: exact version v2 at project version 4',
  public.portal_decide_concept(:M, t.get('p1')::uuid, t.get('c2')::uuid, 2, 4, 'approve') ->> 'status' = 'approved');
select t.check('approve: the decision records the exact asset version and the author',
  t.peek(format($q$select concept_version = 2 and decided_by = '00000000-0000-0000-0000-0000000000d1' from portal_project_decisions where concept_id = %L and decision = 'approve'$q$, t.get('c2')))::boolean);
select t.check('approve: a second approval of the same version is refused',
  t.raises(format('select public.portal_decide_concept(%L, %L, %L, 2, 5, %L)', '00000000-0000-0000-0000-00000000000d', t.get('p1'), t.get('c2'), 'approve'), 'P0409'));
select t.check('decide: a concept id from no project of theirs → 404',
  t.raises(format('select public.portal_decide_concept(%L, %L, %L, 1, 5, %L)', '00000000-0000-0000-0000-00000000000d', t.get('p1'), gen_random_uuid(), 'approve'), 'P0002'));

-- ================================================================ messages (Mooney)
select t.put('g1', public.portal_post_message(:M, null, 'Hey AX team') ->> 'threadId');
select t.check('messages: a general message makes one AX Team thread, and reuses it',
  (public.portal_post_message(:M, null, 'Second note') ->> 'threadId') = t.get('g1')
  and t.peek($q$select count(*) from portal_threads where athlete_id = '00000000-0000-0000-0000-00000000000d' and category = 'general'$q$)::int = 1);
select t.check('messages: replayed key does not post twice',
  (public.portal_post_message(:M, null, 'Once only', '{}', '66666666-0000-0000-0000-000000000001') ->> 'id') =
  (public.portal_post_message(:M, null, 'Once only', '{}', '66666666-0000-0000-0000-000000000001') ->> 'id'));
select t.check('messages: general list excludes project chat', (select bool_and(m ->> 'projectId' is null) from jsonb_array_elements(public.portal_list_messages(:M) -> 'items') m)
  and jsonb_array_length(public.portal_list_messages(:M) -> 'items') = 3);
select t.check('messages: project list is the project''s chat only',
  (select bool_and(m ->> 'projectId' = t.get('p1')) from jsonb_array_elements(public.portal_list_messages(:M, t.get('p1')::uuid) -> 'items') m));
select t.check('messages: inspiration attachment shown on the project''s first message',
  exists (select 1 from jsonb_array_elements(public.portal_list_messages(:M, t.get('p1')::uuid) -> 'items') m, jsonb_array_elements(m -> 'attachments') a where a ->> 'name' = 'giants ref.png'));
select t.check('messages: a pending upload cannot be attached',
  t.raises(format('select public.portal_post_message(%L, null, %L, array[%L::uuid])', '00000000-0000-0000-0000-00000000000d', 'see file', t.get('up_pending')), 'P0422'));
select t.put('up_att', public.portal_begin_upload(:M, 'attachment', 'tag.png', 'image/png', 64) ->> 'uploadId');
select t.reset();
set role service_role;
select public.portal_finalize_upload(t.get('up_att')::uuid, '00000000-0000-0000-0000-0000000000d1', 'image/png', 64);
reset role;
select t.as_user('00000000-0000-0000-0000-0000000000d1');
select t.check('messages: a files-only message gets a readable body (body may not be blank)',
  t.peek(format('select body from portal_messages where id = %L', public.portal_post_message(:M, null, '   ', array[t.get('up_att')::uuid]) ->> 'id')) = 'Shared 1 file');
select t.check('messages: paging returns a cursor',
  (public.portal_list_messages(:M, null, null, 1) ->> 'nextCursor') is not null);

-- ================================================================ files
select t.check('files: own finalized upload is signable', (select count(*) from public.portal_authorize_file('upload', t.get('up1')::uuid)) = 1);
select t.check('files: rejected upload is not', (select count(*) from public.portal_authorize_file('upload', t.get('up_bad')::uuid)) = 0);
select t.check('files: current concept is signable', (select bucket from public.portal_authorize_file('concept', t.get('c2')::uuid)) = 'design-previews');
select t.check('files: raw upload rows are not readable by a client', (select count(*) from portal_uploads) = 0);

-- ================================================================ product approval (was broken)
select t.check('product: approve a pending product',
  public.portal_decide_product(:M, '00000000-0000-0000-0000-0000000002d1', 'approve', null, '2026-10-01T00:00:00Z') ->> 'approvalState' = 'approved');
select t.check('product: decision logged to product_approvals', t.peek($q$select count(*) from product_approvals where product_id = '00000000-0000-0000-0000-0000000002d1' and state = 'approved'$q$)::int = 1);
select t.check('product: deciding again → 409 (no longer pending)',
  t.raises($$select public.portal_decide_product('00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-0000000002d1', 'approve')$$, 'P0409'));
select t.check('product: reject needs a note', t.raises($$select public.portal_decide_product('00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-0000000005d1', 'reject')$$, 'P0422'));
select t.reset();

-- stale screen on a product decision
update products set approval_state = 'pending', updated_at = '2026-10-02T00:00:00Z' where id = '00000000-0000-0000-0000-0000000005d1';
select t.as_user('00000000-0000-0000-0000-0000000000d1');
select t.check('product: a stale screen (old updated_at) → 409',
  t.raises($$select public.portal_decide_product('00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-0000000005d1', 'approve', null, '2026-09-01T00:00:00Z')$$, 'P0409'));
select t.reset();

-- ================================================================ another athlete
select t.as_user('00000000-0000-0000-0000-0000000000c1');
select t.check('coleman: cannot open mooney''s project (404)', t.raises(format('select public.portal_get_project(%L, %L)', '00000000-0000-0000-0000-00000000000d', t.get('p1')), 'P0002'));
select t.check('coleman: cannot read it through his own scope either (404)', t.raises(format('select public.portal_get_project(%L, %L)', '00000000-0000-0000-0000-00000000000c', t.get('p1')), 'P0002'));
select t.check('coleman: cannot post into it', t.raises(format('select public.portal_post_message(%L, %L, %L)', '00000000-0000-0000-0000-00000000000c', t.get('p1'), 'hi'), 'P0002'));
select t.check('coleman: cannot attach mooney''s upload', t.raises(format('select public.portal_post_message(%L, null, %L, array[%L::uuid])', '00000000-0000-0000-0000-00000000000c', 'x', t.get('up1')), 'P0422'));
select t.check('coleman: cannot sign mooney''s files', (select count(*) from public.portal_authorize_file('upload', t.get('up1')::uuid)) = 0
  and (select count(*) from public.portal_authorize_file('concept', t.get('c2')::uuid)) = 0);
select t.check('coleman: lists none of mooney''s projects', jsonb_array_length(public.portal_list_projects('00000000-0000-0000-0000-00000000000c') -> 'items') = 0);
select t.check('coleman: cannot approve mooney''s product', t.raises($$select public.portal_decide_product('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000005d1', 'approve')$$, 'P0002'));
select t.reset();

-- ================================================================ operator scope
select t.as_user('00000000-0000-0000-0000-0000000000f1');
select t.check('operator: sees the client''s projects (View as)', jsonb_array_length(public.portal_list_projects(:M) -> 'items') = 1);
select t.check('operator: can sign the client''s files', (select count(*) from public.portal_authorize_file('upload', t.get('up1')::uuid)) = 1);
select t.check('operator: cannot post as the client', t.raises($$select public.portal_post_message('00000000-0000-0000-0000-00000000000d', null, 'hi')$$, '42501'));
select t.reset();

set role anon;
select t.check('anon: nothing', t.raises($$select public.portal_list_projects('00000000-0000-0000-0000-00000000000d')$$, '42501'));
reset role;
