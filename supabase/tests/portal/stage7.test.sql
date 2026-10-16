-- Stage 7: the AX Client Desk. Operator-only, org-scoped; replies reach the client; drop review.
\set ON_ERROR_STOP 0
\set QUIET 1

reset role;
insert into portal_threads (id, organization_id, athlete_id, subject, category, status, created_by, created_by_role, last_message_at, last_message_role, admin_unread, kind, brief) values
  ('00000000-0000-0000-0000-0000000007a1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000d', 'Giants era hoodie', 'design_feedback', 'open',
   '00000000-0000-0000-0000-0000000000d1', 'portal', now(), 'portal', true, 'new_merch', '{"idea":"A Giants hoodie","vibes":["Clean"]}'),
  ('00000000-0000-0000-0000-0000000007c1', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000c', 'Coleman idea', 'design_feedback', 'open',
   '00000000-0000-0000-0000-0000000000c1', 'portal', now(), 'portal', true, 'new_merch', '{}');
insert into portal_messages (thread_id, organization_id, sender_user_id, sender_role, body) values
  ('00000000-0000-0000-0000-0000000007a1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1', 'portal', 'Here is my idea');
insert into drops (id, organization_id, athlete_id, name, slug, status, approval_state, metadata) values
  ('00000000-0000-0000-0000-0000000007d1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000d', 'Holiday drop', 'holiday-drop', 'draft', 'pending', '{"time_zone":"America/New_York"}');

-- Clients are refused everything here.
select t.as_user('00000000-0000-0000-0000-0000000000d1');
select t.check('desk: client cannot list threads', t.sqlstate_of('select public.portal_ops_threads()') like '42501%');
select t.check('desk: client cannot reply as AX', t.sqlstate_of($q$select public.portal_ops_reply('00000000-0000-0000-0000-0000000007a1', 'hi')$q$) like '42501%');
select t.check('desk: client cannot schedule drops', t.sqlstate_of($q$select public.portal_ops_update_drop('00000000-0000-0000-0000-0000000007d1', 'live')$q$) like '42501%');

-- Operator in Mooney's org.
select t.as_user('00000000-0000-0000-0000-0000000000f1');
select t.check('desk: operator sees Mooney''s project, waiting on AX, first',
  (public.portal_ops_threads() -> 'items' -> 0 ->> 'id') = '00000000-0000-0000-0000-0000000007a1'
  and (public.portal_ops_threads() -> 'items' -> 0 ->> 'waitingOnAx')::boolean
  and (public.portal_ops_threads() -> 'items' -> 0 ->> 'clientName') = 'Darnell Mooney');
select t.check('desk: operator never sees another org''s thread',
  not exists (select 1 from jsonb_array_elements(public.portal_ops_threads() -> 'items') e where e ->> 'id' = '00000000-0000-0000-0000-0000000007c1'));
select t.check('desk: other org''s thread is not found',
  t.sqlstate_of($q$select public.portal_ops_thread('00000000-0000-0000-0000-0000000007c1')$q$) like 'P0002%');
select t.check('desk: thread detail carries brief and messages',
  (public.portal_ops_thread('00000000-0000-0000-0000-0000000007a1') -> 'brief' ->> 'idea') = 'A Giants hoodie'
  and jsonb_array_length(public.portal_ops_thread('00000000-0000-0000-0000-0000000007a1') -> 'messages') = 1);
select t.check('desk: blank reply refused', t.sqlstate_of($q$select public.portal_ops_reply('00000000-0000-0000-0000-0000000007a1', '   ')$q$) like 'P0422%');

select public.portal_ops_reply('00000000-0000-0000-0000-0000000007a1', 'On it — concepts by Friday.', '22222222-0000-0000-0000-000000000001');
select t.check('desk: reply replays on the same key',
  (public.portal_ops_reply('00000000-0000-0000-0000-0000000007a1', 'On it — concepts by Friday.', '22222222-0000-0000-0000-000000000001') ->> 'replayed')::boolean);
reset role;
select t.check('desk: one AX message stored, flags flipped',
  (select count(*) from portal_messages where thread_id = '00000000-0000-0000-0000-0000000007a1' and sender_role = 'admin') = 1
  and (select portal_unread and not admin_unread from portal_threads where id = '00000000-0000-0000-0000-0000000007a1'));

-- The client sees the reply and the project moves to in progress.
select t.as_user('00000000-0000-0000-0000-0000000000d1');
select t.check('desk: client sees AX reply',
  (public.portal_list_messages('00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-0000000007a1') -> 'items' -> 0 ->> 'body') = 'On it — concepts by Friday.');
select t.check('desk: client project is in progress after AX replies',
  (public.portal_get_project('00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-0000000007a1') ->> 'status') = 'in_progress');

select t.as_user('00000000-0000-0000-0000-0000000000f1');
select public.portal_ops_set_closed('00000000-0000-0000-0000-0000000007a1', true);
select t.check('desk: archived project shows archived',
  (public.portal_ops_thread('00000000-0000-0000-0000-0000000007a1') ->> 'projectStatus') = 'archived');
select t.check('desk: archived hidden from default list',
  not exists (select 1 from jsonb_array_elements(public.portal_ops_threads() -> 'items') e where e ->> 'id' = '00000000-0000-0000-0000-0000000007a1'));
select public.portal_ops_set_closed('00000000-0000-0000-0000-0000000007a1', false);

-- Drops: review queue, schedule, send back, live.
select t.check('desk: pending drop listed for review',
  exists (select 1 from jsonb_array_elements(public.portal_ops_drops(true) -> 'items') e where e ->> 'id' = '00000000-0000-0000-0000-0000000007d1' and e ->> 'status' = 'review'));
select t.check('desk: scheduling needs a date',
  t.sqlstate_of($q$select public.portal_ops_update_drop('00000000-0000-0000-0000-0000000007d1', 'schedule')$q$) like 'P0422%');
select t.check('desk: sending back needs a note',
  t.sqlstate_of($q$select public.portal_ops_update_drop('00000000-0000-0000-0000-0000000007d1', 'return')$q$) like 'P0422%');
select t.check('desk: send back makes it the client''s editable draft with the note',
  (public.portal_ops_update_drop('00000000-0000-0000-0000-0000000007d1', 'return', null, null, 'Move it to a Friday') ->> 'editable')::boolean);
select t.as_user('00000000-0000-0000-0000-0000000000d1');
select t.check('desk: client sees the review note',
  exists (select 1 from jsonb_array_elements(public.portal_list_drops('00000000-0000-0000-0000-00000000000d') -> 'items') e
          where e ->> 'id' = '00000000-0000-0000-0000-0000000007d1' and e ->> 'reviewNote' = 'Move it to a Friday'));
select t.as_user('00000000-0000-0000-0000-0000000000f1');
select t.check('desk: schedule at 6pm New York lands at 22:00Z',
  (public.portal_ops_update_drop('00000000-0000-0000-0000-0000000007d1', 'schedule', '2027-06-04T18:00', 'America/New_York') ->> 'scheduledAt')::timestamptz = '2027-06-04T22:00:00Z'::timestamptz);
reset role;
select t.check('desk: scheduled drop is scheduled and note cleared',
  (select status = 'scheduled' and approval_state::text = 'approved' and metadata ->> 'review_note' is null from drops where id = '00000000-0000-0000-0000-0000000007d1'));
select t.as_user('00000000-0000-0000-0000-0000000000f1');
select t.check('desk: mark live',
  (public.portal_ops_update_drop('00000000-0000-0000-0000-0000000007d1', 'live') ->> 'status') = 'live');
select t.check('desk: other org''s drop is not found',
  t.sqlstate_of($q$select public.portal_ops_update_drop('00000000-0000-0000-0000-00000000d4c1', 'live')$q$) like 'P0002%');
reset role;
