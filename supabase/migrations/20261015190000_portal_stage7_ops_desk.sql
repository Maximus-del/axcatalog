-- ============================================================================
-- Portal stage 7 — the AX side: Client Desk (V2)
--
-- Clients can send briefs, messages and drops for review (stages 3–5). This
-- gives AX the other half, operator-only, every call scoped to organisations
-- the operator can reach (is_org_accessible):
--
--   portal_ops_threads()            every client conversation and project,
--                                   the ones waiting on AX first
--   portal_ops_thread(id)           one thread: brief, inspiration, concepts,
--                                   decisions, messages
--   portal_ops_reply(id, body, key) answer as AX (idempotent per key)
--   portal_ops_mark_read(id)        clear the "waiting on AX" dot
--   portal_ops_set_closed(id, bool) archive / reopen a project or thread
--   portal_ops_drops(pending_only)  drops across clients, review first
--   portal_ops_update_drop(...)     schedule, send back, mark live, unschedule
--
-- Sharing a concept uses the existing portal_share_concept (stage 3).
-- Clients cannot call any of these (42501). Nothing here changes what a
-- client can see except through the documented actions. Safe to re-run.
-- ============================================================================

create or replace function public.portal_ops_guard()
returns void language plpgsql stable security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  if not public.current_user_is_operator() then raise exception 'Not authorized' using errcode = '42501'; end if;
end $$;
revoke all on function public.portal_ops_guard() from public, anon, authenticated;

create or replace function public.portal_ops_is_project(_t public.portal_threads)
returns boolean language sql immutable as $$
  select _t.category in ('design_feedback', 'order_request')
$$;

create or replace function public.portal_ops_thread_json(_t public.portal_threads)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'id', _t.id,
    'athleteId', _t.athlete_id,
    'clientName', (select coalesce(nullif(trim(a.display_name), ''), trim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')))
                   from athletes a where a.id = _t.athlete_id),
    'organizationId', _t.organization_id,
    'kind', case when public.portal_ops_is_project(_t) then 'project' else 'conversation' end,
    'projectKind', _t.kind,
    'title', coalesce(nullif(trim(_t.subject), ''), case when public.portal_ops_is_project(_t) then 'Project' else 'AX Team' end),
    'category', _t.category,
    'projectStatus', case when public.portal_ops_is_project(_t) then public.portal_project_status(_t) end,
    'closed', _t.status = 'closed',
    'waitingOnAx', coalesce(_t.admin_unread, false),
    'lastMessageAt', _t.last_message_at,
    'lastMessageRole', _t.last_message_role,
    'lastMessage', (select left(m.body, 160) from portal_messages m where m.thread_id = _t.id order by m.created_at desc limit 1),
    'conceptCount', (select count(*) from portal_project_concepts c where c.project_id = _t.id and c.superseded_at is null),
    'version', _t.version
  )
$$;
revoke all on function public.portal_ops_thread_json(public.portal_threads) from public, anon, authenticated;

-- Every thread an operator can reach. Waiting-on-AX first, then newest.
create or replace function public.portal_ops_threads(_include_closed boolean default false, _limit integer default 200)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare _rows jsonb;
begin
  perform public.portal_ops_guard();
  select coalesce(jsonb_agg(j order by (j ->> 'waitingOnAx')::boolean desc, (j ->> 'lastMessageAt') desc nulls last), '[]'::jsonb)
    into _rows
  from (
    select public.portal_ops_thread_json(t) as j
    from portal_threads t
    where public.is_org_accessible(t.organization_id)
      and (_include_closed or t.status <> 'closed')
    order by t.admin_unread desc nulls last, t.last_message_at desc nulls last
    limit least(greatest(coalesce(_limit, 200), 1), 500)
  ) x;
  return jsonb_build_object('items', _rows);
end $$;
revoke all on function public.portal_ops_threads(boolean, integer) from public, anon;
grant execute on function public.portal_ops_threads(boolean, integer) to authenticated;

create or replace function public.portal_ops_thread_row(_thread_id uuid, _lock boolean default false)
returns public.portal_threads language plpgsql volatile security definer set search_path to 'public' as $$
declare r public.portal_threads;
begin
  if _lock then
    select * into r from portal_threads where id = _thread_id for update;
  else
    select * into r from portal_threads where id = _thread_id;
  end if;
  if r.id is null or not public.is_org_accessible(r.organization_id) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  return r;
end $$;
revoke all on function public.portal_ops_thread_row(uuid, boolean) from public, anon, authenticated;

-- One thread in full. File and concept images are signed separately through
-- portal-files (sign_many), which already lets operators sign within reach.
create or replace function public.portal_ops_thread(_thread_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare r public.portal_threads;
begin
  perform public.portal_ops_guard();
  r := public.portal_ops_thread_row(_thread_id, false);
  return public.portal_ops_thread_json(r) || jsonb_build_object(
    'brief', r.brief,
    'destinationId', (select coalesce(c.metadata -> 'portal_destination' ->> 'key', c.slug) from collections c where c.id = r.collection_id),
    'inspiration', coalesce((
      select jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name, 'mime', coalesce(u.verified_mime, u.declared_mime)) order by u.created_at)
      from portal_uploads u
      where u.project_id = r.id and u.purpose = 'inspiration' and u.status = 'finalized'), '[]'::jsonb),
    'concepts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'conceptKey', c.concept_key, 'version', c.version, 'title', c.title,
        'sharedAt', c.shared_at, 'superseded', c.superseded_at is not null,
        'decision', (select d.decision from portal_project_decisions d where d.concept_id = c.id order by d.decided_at desc limit 1),
        'feedback', (select d.feedback from portal_project_decisions d where d.concept_id = c.id order by d.decided_at desc limit 1)
      ) order by c.shared_at)
      from portal_project_concepts c where c.project_id = r.id), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'body', m.body, 'fromAx', m.sender_role = 'admin', 'createdAt', m.created_at,
        'attachments', coalesce((
          select jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name, 'mime', coalesce(u.verified_mime, u.declared_mime)))
          from portal_message_attachments ma join portal_uploads u on u.id = ma.upload_id
          where ma.message_id = m.id), '[]'::jsonb)
      ) order by m.created_at)
      from portal_messages m where m.thread_id = r.id), '[]'::jsonb)
  );
end $$;
revoke all on function public.portal_ops_thread(uuid) from public, anon;
grant execute on function public.portal_ops_thread(uuid) to authenticated;

-- Reply as AX. The client sees it in the portal (portal_unread) and the
-- thread stops waiting on AX.
create or replace function public.portal_ops_reply(_thread_id uuid, _body text, _idempotency_key uuid default null)
returns jsonb language plpgsql volatile security definer set search_path to 'public' as $$
declare
  r public.portal_threads;
  _prior jsonb;
  _mid uuid;
  _out jsonb;
begin
  perform public.portal_ops_guard();
  if coalesce(trim(_body), '') = '' then
    raise exception 'body' using errcode = 'P0422', detail = '{"body":"Write a message"}';
  end if;
  if length(_body) > 4000 then
    raise exception 'body' using errcode = 'P0422', detail = '{"body":"At most 4000 characters"}';
  end if;
  _prior := public.portal_idem_claim('ops_reply', _idempotency_key, md5(jsonb_build_object('t', _thread_id, 'b', _body)::text));
  if _prior is not null then return _prior; end if;

  r := public.portal_ops_thread_row(_thread_id, true);
  insert into portal_messages (thread_id, organization_id, sender_user_id, sender_role, body)
  values (r.id, r.organization_id, auth.uid(), 'admin', trim(_body))
  returning id into _mid;
  update portal_threads
     set last_message_at = now(), last_message_role = 'admin', portal_unread = true, admin_unread = false,
         status = case when status = 'open' then 'pending' else status end,
         updated_at = now()
   where id = r.id;

  _out := jsonb_build_object('id', _mid, 'threadId', r.id, 'createdAt', now(), 'replayed', false);
  perform public.portal_idem_store('ops_reply', _idempotency_key, _out);
  return _out;
end $$;
revoke all on function public.portal_ops_reply(uuid, text, uuid) from public, anon;
grant execute on function public.portal_ops_reply(uuid, text, uuid) to authenticated;

create or replace function public.portal_ops_mark_read(_thread_id uuid)
returns void language plpgsql volatile security definer set search_path to 'public' as $$
declare r public.portal_threads;
begin
  perform public.portal_ops_guard();
  r := public.portal_ops_thread_row(_thread_id, false);
  update portal_threads set admin_unread = false where id = r.id;
end $$;
revoke all on function public.portal_ops_mark_read(uuid) from public, anon;
grant execute on function public.portal_ops_mark_read(uuid) to authenticated;

-- Archive (closed) or reopen. A closed project shows as archived to the client.
create or replace function public.portal_ops_set_closed(_thread_id uuid, _closed boolean)
returns jsonb language plpgsql volatile security definer set search_path to 'public' as $$
declare r public.portal_threads;
begin
  perform public.portal_ops_guard();
  r := public.portal_ops_thread_row(_thread_id, true);
  update portal_threads
     set status = case when _closed then 'closed' else 'open' end,
         admin_unread = case when _closed then false else admin_unread end,
         version = version + 1, updated_at = now()
   where id = r.id returning * into r;
  return public.portal_ops_thread_json(r);
end $$;
revoke all on function public.portal_ops_set_closed(uuid, boolean) from public, anon;
grant execute on function public.portal_ops_set_closed(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------- drops

-- The client's drop JSON gains the note AX left when sending a drop back.
create or replace function public.portal_drop_json(d public.drops)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'id', d.id,
    'title', d.name,
    'status', case
      when d.status = 'draft' and d.approval_state::text = 'pending' then 'review'
      when d.status = 'draft' then 'draft'
      when d.status = 'scheduled' and d.public_date is not null and d.public_date <= now() then 'live'
      when d.status = 'scheduled' then 'scheduled'
      when d.status in ('live', 'published') then 'live'
      else 'draft' end,
    'scheduledAt', d.public_date,
    'accessAt', d.access_date,
    'timeZone', coalesce(d.metadata ->> 'time_zone', 'UTC'),
    'destinationId', (select coalesce(c.metadata -> 'portal_destination' ->> 'key', c.slug) from collections c where c.id = d.collection_id),
    'version', d.updated_at,
    'editable', d.status = 'draft' and coalesce(d.approval_state::text, 'none') <> 'pending',
    'reviewNote', case when d.status = 'draft' then d.metadata ->> 'review_note' end
  )
$$;
revoke all on function public.portal_drop_json(public.drops) from public, anon, authenticated;

create or replace function public.portal_ops_drops(_pending_only boolean default false)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare _rows jsonb;
begin
  perform public.portal_ops_guard();
  select coalesce(jsonb_agg(j order by (j ->> 'status' = 'review') desc, (j ->> 'sortAt') desc nulls last), '[]'::jsonb) into _rows
  from (
    select public.portal_drop_json(d) || jsonb_build_object(
      'athleteId', d.athlete_id,
      'clientName', (select coalesce(nullif(trim(a.display_name), ''), trim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')))
                     from athletes a where a.id = d.athlete_id),
      'reviewNote', d.metadata ->> 'review_note',
      'sortAt', coalesce(d.public_date, d.updated_at, d.created_at)
    ) as j
    from drops d
    where public.is_org_accessible(d.organization_id)
  ) x
  where not _pending_only or j ->> 'status' = 'review';
  return jsonb_build_object('items', _rows);
end $$;
revoke all on function public.portal_ops_drops(boolean) from public, anon;
grant execute on function public.portal_ops_drops(boolean) to authenticated;

-- _action:
--   'schedule'   approve and schedule. Uses _scheduled_local in _time_zone, or
--                the date the client asked for. A date is required.
--   'return'     send back to the client as an editable draft, with a note.
--   'live'       mark it live now (keeps an earlier public date if set).
--   'unschedule' back to an AX-held draft.
create or replace function public.portal_ops_update_drop(
  _drop_id uuid, _action text, _scheduled_local text default null, _time_zone text default null, _note text default null
)
returns jsonb language plpgsql volatile security definer set search_path to 'public' as $$
declare
  d public.drops;
  _tz text;
  _when timestamptz;
begin
  perform public.portal_ops_guard();
  select * into d from drops where id = _drop_id for update;
  if d.id is null or not public.is_org_accessible(d.organization_id) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  _tz := coalesce(nullif(_time_zone, ''), d.metadata ->> 'time_zone', 'UTC');

  if _action = 'schedule' then
    if nullif(_scheduled_local, '') is not null then
      _when := public.portal_local_to_utc(_scheduled_local::timestamp, _tz);
    else
      _when := d.public_date;
    end if;
    if _when is null then
      raise exception 'date' using errcode = 'P0422', detail = '{"scheduledLocal":"Pick a date and time"}';
    end if;
    update drops set status = 'scheduled', approval_state = 'approved', public_date = _when,
      metadata = (coalesce(metadata, '{}'::jsonb) || jsonb_build_object('time_zone', _tz)) - 'review_note',
      updated_at = now()
    where id = d.id returning * into d;
  elsif _action = 'return' then
    if coalesce(trim(_note), '') = '' then
      raise exception 'note' using errcode = 'P0422', detail = '{"note":"Say what should change"}';
    end if;
    update drops set status = 'draft', approval_state = 'rejected',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('review_note', trim(_note)),
      updated_at = now()
    where id = d.id returning * into d;
  elsif _action = 'live' then
    update drops set status = 'live', approval_state = 'approved', public_date = coalesce(public_date, now()), updated_at = now()
    where id = d.id returning * into d;
  elsif _action = 'unschedule' then
    update drops set status = 'draft', approval_state = 'none', updated_at = now()
    where id = d.id returning * into d;
  else
    raise exception 'action' using errcode = 'P0422', detail = '{"action":"schedule, return, live or unschedule"}';
  end if;
  return public.portal_drop_json(d) || jsonb_build_object('reviewNote', d.metadata ->> 'review_note');
end $$;
revoke all on function public.portal_ops_update_drop(uuid, text, text, text, text) from public, anon;
grant execute on function public.portal_ops_update_drop(uuid, text, text, text, text) to authenticated;
