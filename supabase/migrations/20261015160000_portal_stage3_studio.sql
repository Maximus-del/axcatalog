-- ============================================================================
-- Mooney World / portal adapter — STAGE 3: Creative Studio
--   projects, versioned concepts, exact-version approval, project chat,
--   private uploads, and the product Approve/Reject that stopped working.
--
-- Paste into Supabase > SQL Editor and Run. Safe to run twice.
-- Run AFTER stages 1 and 2 (uses portal_scope_athlete).
--
-- BUILT ON WHAT EXISTS
--   A project IS a portal_threads row (category 'design_feedback'), as the
--   Studio already creates them; its chat IS portal_messages. V1/V2 inboxes
--   keep working unchanged. Added: a version number, kind, destination and
--   brief on the thread; and three tables for what had no home —
--     portal_project_concepts   each shared concept image, per version
--     portal_project_decisions  every approve / request-changes, kept
--     portal_uploads            files a client uploads, private, verified
--   plus portal_message_attachments linking messages to finalized uploads.
--
-- WHAT WAS BROKEN
--   Approve/Reject on the client's profile wrote products.approval_state
--   directly. Since stage-0 role isolation a client has no UPDATE on products,
--   so the button silently did nothing. portal_decide_product() replaces it:
--   only a pending product, only the athlete's own, refuses a stale screen
--   (409), and logs to product_approvals.
--
-- PRIVATE FILES
--   New bucket 'portal-uploads' (private). Nothing can read it directly: files
--   are reached through short-lived signed URLs minted by the portal-files edge
--   function after portal_authorize_file() says this caller may have it.
--   NOTE the older Studio path uploads inspiration to 'design-references',
--   which is a PUBLIC bucket — left as is here (operators' links depend on it);
--   new uploads through the adapter never go there.
--
-- RULES ENFORCED IN EVERY FUNCTION
--   * whose portal: portal_scope_athlete() — linked client, or operator in org
--   * child belongs to parent: concept→project→athlete, upload→athlete(+project)
--   * "View as" is read-only: every client write refuses an operator
--   * not-yours and missing are the same "not found"
-- ============================================================================

-- ---------------------------------------------------------------- schema
alter table public.portal_threads add column if not exists version integer not null default 1;
alter table public.portal_threads add column if not exists kind text;
alter table public.portal_threads add column if not exists collection_id uuid references public.collections(id) on delete set null;
alter table public.portal_threads add column if not exists brief jsonb;

create table if not exists public.portal_project_concepts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.portal_threads(id) on delete cascade,
  -- every version of the same concept shares a concept_key
  concept_key uuid not null default gen_random_uuid(),
  version integer not null default 1,
  title text,
  storage_bucket text not null,
  storage_path text not null,
  mockup_id uuid,
  shared_by uuid,
  shared_at timestamptz not null default now(),
  superseded_at timestamptz,
  unique (concept_key, version)
);
create index if not exists portal_project_concepts_project on public.portal_project_concepts (project_id) where superseded_at is null;

create table if not exists public.portal_project_decisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.portal_threads(id) on delete cascade,
  concept_id uuid not null references public.portal_project_concepts(id) on delete cascade,
  concept_version integer not null,
  decision text not null check (decision in ('approve', 'request_changes')),
  feedback text,
  decided_by uuid not null,
  decided_at timestamptz not null default now(),
  project_version_before integer not null
);

create table if not exists public.portal_uploads (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  project_id uuid references public.portal_threads(id) on delete set null,
  uploaded_by uuid not null,
  purpose text not null check (purpose in ('inspiration', 'attachment')),
  bucket text not null default 'portal-uploads',
  path text not null unique,
  name text not null,
  declared_mime text not null,
  declared_size bigint not null,
  verified_mime text,
  verified_size bigint,
  status text not null default 'pending' check (status in ('pending', 'finalized', 'rejected')),
  reject_reason text,
  created_at timestamptz not null default now(),
  finalized_at timestamptz
);

create table if not exists public.portal_message_attachments (
  message_id uuid not null references public.portal_messages(id) on delete cascade,
  upload_id uuid not null references public.portal_uploads(id) on delete cascade,
  primary key (message_id, upload_id)
);

-- Reached only through the functions below.
alter table public.portal_project_concepts enable row level security;
alter table public.portal_project_decisions enable row level security;
alter table public.portal_uploads enable row level security;
alter table public.portal_message_attachments enable row level security;
revoke all on public.portal_project_concepts, public.portal_project_decisions,
  public.portal_uploads, public.portal_message_attachments from anon, authenticated;
-- AX staff read them in V2 through the operator gate.
drop policy if exists "operator reads project concepts" on public.portal_project_concepts;
create policy "operator reads project concepts" on public.portal_project_concepts for select to authenticated
  using (public.current_user_is_operator() and exists (select 1 from portal_threads t where t.id = project_id and public.is_org_accessible(t.organization_id)));
drop policy if exists "operator reads project decisions" on public.portal_project_decisions;
create policy "operator reads project decisions" on public.portal_project_decisions for select to authenticated
  using (public.current_user_is_operator() and exists (select 1 from portal_threads t where t.id = project_id and public.is_org_accessible(t.organization_id)));
drop policy if exists "operator reads portal uploads" on public.portal_uploads;
create policy "operator reads portal uploads" on public.portal_uploads for select to authenticated
  using (public.current_user_is_operator() and exists (select 1 from athletes a where a.id = athlete_id and public.is_org_accessible(a.organization_id)));
grant select on public.portal_project_concepts, public.portal_project_decisions, public.portal_uploads to authenticated;

-- Private bucket. No storage policies on purpose: signed URLs only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portal-uploads', 'portal-uploads', false, 10485760,
        array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------- helpers
create or replace function public.portal_client_write_guard()
returns void language plpgsql stable security definer set search_path to 'public' as $$
begin
  if public.current_user_is_operator() then
    raise exception 'View as is read-only.' using errcode = '42501';
  end if;
end $$;
revoke all on function public.portal_client_write_guard() from public, anon;
grant execute on function public.portal_client_write_guard() to authenticated;

-- The project, only if it belongs to the scoped athlete. Same error for missing and not-yours.
create or replace function public.portal_project_row(_aid uuid, _project_id uuid, _lock boolean default false)
returns public.portal_threads language plpgsql volatile security definer set search_path to 'public' as $$
declare r public.portal_threads;
begin
  if _lock then
    select * into r from portal_threads where id = _project_id and athlete_id = _aid
      and category in ('design_feedback', 'order_request') for update;
  else
    select * into r from portal_threads where id = _project_id and athlete_id = _aid
      and category in ('design_feedback', 'order_request');
  end if;
  if r.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  return r;
end $$;
revoke all on function public.portal_project_row(uuid, uuid, boolean) from public, anon, authenticated;

create or replace function public.portal_project_status(_t public.portal_threads)
returns text language sql stable security definer set search_path to 'public' as $$
  select case
    when _t.status = 'closed' then 'archived'
    when exists (
      select 1 from portal_project_decisions d join portal_project_concepts c on c.id = d.concept_id
      where d.project_id = _t.id and d.decision = 'approve' and c.superseded_at is null and d.concept_version = c.version
    ) then 'approved'
    when exists (
      select 1 from portal_project_concepts c
      where c.project_id = _t.id and c.superseded_at is null
        and not exists (select 1 from portal_project_decisions d where d.concept_id = c.id)
    ) then 'feedback'
    when _t.status = 'pending' or _t.last_message_role = 'admin'
      or exists (select 1 from portal_project_concepts c where c.project_id = _t.id) then 'in_progress'
    else 'requested'
  end
$$;
revoke all on function public.portal_project_status(public.portal_threads) from public, anon, authenticated;

create or replace function public.portal_project_json(_t public.portal_threads)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'id', _t.id,
    'title', _t.subject,
    'kind', _t.kind,
    'destinationId', (select coalesce(c.metadata -> 'portal_destination' ->> 'key', c.slug) from collections c where c.id = _t.collection_id),
    'status', public.portal_project_status(_t),
    'version', _t.version,
    'brief', _t.brief,
    'updatedAt', greatest(_t.updated_at, _t.last_message_at),
    'unread', _t.portal_unread,
    'concepts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'conceptKey', c.concept_key, 'version', c.version, 'title', c.title, 'sharedAt', c.shared_at,
        'decision', (select d.decision from portal_project_decisions d where d.concept_id = c.id order by d.decided_at desc limit 1)
      ) order by c.shared_at)
      from portal_project_concepts c where c.project_id = _t.id and c.superseded_at is null), '[]'::jsonb)
  )
$$;
revoke all on function public.portal_project_json(public.portal_threads) from public, anon, authenticated;

create or replace function public.portal_idem_claim(_operation text, _key uuid, _hash text)
returns jsonb language plpgsql volatile security definer set search_path to 'public' as $$
declare p public.portal_idempotency_keys;
begin
  if _key is null then return null; end if;
  insert into portal_idempotency_keys (user_id, operation, key, request_hash) values (auth.uid(), _operation, _key, _hash)
  on conflict do nothing;
  if found then return null; end if;
  select * into p from portal_idempotency_keys where user_id = auth.uid() and operation = _operation and key = _key;
  if p.request_hash <> _hash then
    raise exception 'This request key was already used for a different request.' using errcode = 'P0409';
  end if;
  return coalesce(p.result, '{}'::jsonb) || jsonb_build_object('replayed', true);
end $$;
revoke all on function public.portal_idem_claim(text, uuid, text) from public, anon, authenticated;

create or replace function public.portal_idem_store(_operation text, _key uuid, _result jsonb)
returns void language sql volatile security definer set search_path to 'public' as $$
  update portal_idempotency_keys set result = _result where user_id = auth.uid() and operation = _operation and key = _key
$$;
revoke all on function public.portal_idem_store(text, uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- projects
create or replace function public.portal_list_projects(_athlete_id uuid, _cursor timestamptz default null, _limit integer default 24, _status text default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  _aid uuid := public.portal_scope_athlete(_athlete_id);
  _n int := least(greatest(coalesce(_limit, 24), 1), 100);
  _rows jsonb;
begin
  with t as (
    select th, greatest(th.updated_at, th.last_message_at) as sort_at
    from portal_threads th
    where th.athlete_id = _aid and th.category in ('design_feedback', 'order_request')
      and (_cursor is null or greatest(th.updated_at, th.last_message_at) < _cursor)
  ), j as (
    select public.portal_project_json(th) as p, sort_at from t
  )
  select jsonb_agg(p order by sort_at desc) into _rows from (
    select p, sort_at from j where _status is null or p ->> 'status' = _status order by sort_at desc limit _n + 1
  ) x;
  _rows := coalesce(_rows, '[]'::jsonb);
  return jsonb_build_object(
    'items', case when jsonb_array_length(_rows) > _n then _rows - _n else _rows end,
    'nextCursor', case when jsonb_array_length(_rows) > _n then _rows -> (_n - 1) ->> 'updatedAt' end
  );
end $$;

create or replace function public.portal_get_project(_athlete_id uuid, _project_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  _aid uuid := public.portal_scope_athlete(_athlete_id);
  r public.portal_threads;
begin
  select * into r from portal_threads where id = _project_id and athlete_id = _aid and category in ('design_feedback', 'order_request');
  if r.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  return public.portal_project_json(r) || jsonb_build_object(
    'decisions', coalesce((select jsonb_agg(jsonb_build_object('conceptId', d.concept_id, 'conceptVersion', d.concept_version,
        'decision', d.decision, 'feedback', d.feedback, 'decidedAt', d.decided_at) order by d.decided_at)
      from portal_project_decisions d where d.project_id = r.id), '[]'::jsonb));
end $$;

create or replace function public.portal_create_project(
  _athlete_id uuid, _idempotency_key uuid, _title text, _kind text, _idea text,
  _vibes text[] default '{}', _details text default null, _destination_id text default null,
  _inspiration_upload_ids uuid[] default '{}'
)
returns jsonb language plpgsql volatile security definer set search_path to 'public' as $$
declare
  _aid uuid := public.portal_scope_athlete(_athlete_id);
  _org uuid;
  _prior jsonb;
  _coll uuid;
  _tid uuid;
  _body text;
  _mid uuid;
  _bad int;
  _out jsonb;
begin
  perform public.portal_client_write_guard();
  if coalesce(trim(_title), '') = '' or length(_title) > 120 then
    raise exception 'title' using errcode = 'P0422', detail = '{"title":"1–120 characters"}';
  end if;
  if _kind not in ('new_merch', 'game_day', 'football_camp', 'personal_brand', 'collection', 'other') then
    raise exception 'kind' using errcode = 'P0422', detail = '{"kind":"new_merch, game_day, football_camp, personal_brand, collection or other"}';
  end if;
  if coalesce(trim(_idea), '') = '' or length(_idea) > 4000 then
    raise exception 'idea' using errcode = 'P0422', detail = '{"idea":"1–4000 characters"}';
  end if;
  if cardinality(coalesce(_vibes, '{}')) > 12 or cardinality(coalesce(_inspiration_upload_ids, '{}')) > 8 then
    raise exception 'too many' using errcode = 'P0422', detail = '{"vibes":"At most 12","inspirationIds":"At most 8"}';
  end if;

  _prior := public.portal_idem_claim('create_project', _idempotency_key,
    md5(jsonb_build_object('a', _aid, 't', _title, 'k', _kind, 'i', _idea, 'v', _vibes, 'd', _details, 'x', _destination_id, 'u', _inspiration_upload_ids)::text));
  if _prior is not null then return _prior; end if;

  select organization_id into _org from athletes where id = _aid;
  if _destination_id is not null then
    select c.id into _coll from collections c
      where c.athlete_id = _aid and c.status = 'active'
        and (c.metadata -> 'portal_destination' ->> 'key' = _destination_id or c.slug = _destination_id);
    if _coll is null then
      raise exception 'destination' using errcode = 'P0422', detail = '{"destinationId":"Not one of your collections"}';
    end if;
  end if;

  -- Inspiration must be this athlete's own finalized, unattached uploads.
  select count(*) into _bad from unnest(coalesce(_inspiration_upload_ids, '{}')) u(id)
    where not exists (select 1 from portal_uploads p where p.id = u.id and p.athlete_id = _aid
                      and p.status = 'finalized' and p.project_id is null);
  if _bad > 0 then
    raise exception 'uploads' using errcode = 'P0422', detail = '{"inspirationIds":"Upload not found or not finished"}';
  end if;

  insert into portal_threads (organization_id, athlete_id, subject, category, created_by, created_by_role,
                              status, kind, collection_id, brief, last_message_at, last_message_role, admin_unread, portal_unread)
  values (_org, _aid, trim(_title), 'design_feedback', auth.uid(), 'portal', 'open', _kind, _coll,
          jsonb_build_object('idea', _idea, 'vibes', coalesce(_vibes, '{}'), 'details', _details),
          now(), 'portal', true, false)
  returning id into _tid;

  _body := concat_ws(E'\n',
    'New request: ' || trim(_title),
    'Type: ' || replace(_kind, '_', ' '),
    case when _coll is not null then 'Collection: ' || _destination_id end,
    case when cardinality(coalesce(_vibes, '{}')) > 0 then 'Vibe: ' || array_to_string(_vibes, ', ') end,
    '', _idea,
    case when coalesce(_details, '') <> '' then E'\nInclude: ' || _details end);
  insert into portal_messages (thread_id, organization_id, sender_user_id, sender_role, body)
  values (_tid, _org, auth.uid(), 'portal', _body) returning id into _mid;

  update portal_uploads set project_id = _tid where id = any(coalesce(_inspiration_upload_ids, '{}'));
  insert into portal_message_attachments (message_id, upload_id)
    select _mid, unnest(coalesce(_inspiration_upload_ids, '{}'));

  select public.portal_project_json(t) into _out from portal_threads t where t.id = _tid;
  _out := _out || jsonb_build_object('replayed', false);
  perform public.portal_idem_store('create_project', _idempotency_key, _out);
  return _out;
end $$;

-- Exact-version approval. The project row is locked, so two decisions on the
-- same project are serialised; the second sees the bumped version → 409.
create or replace function public.portal_decide_concept(
  _athlete_id uuid, _project_id uuid, _concept_id uuid, _concept_version integer,
  _expected_project_version integer, _decision text, _feedback text default null
)
returns jsonb language plpgsql volatile security definer set search_path to 'public' as $$
declare
  _aid uuid := public.portal_scope_athlete(_athlete_id);
  r public.portal_threads;
  c public.portal_project_concepts;
  _msg text;
begin
  perform public.portal_client_write_guard();
  if _decision not in ('approve', 'request_changes') then
    raise exception 'decision' using errcode = 'P0422', detail = '{"decision":"approve or request_changes"}';
  end if;
  if _decision = 'request_changes' and coalesce(trim(_feedback), '') = '' then
    raise exception 'feedback' using errcode = 'P0422', detail = '{"feedback":"Say what should change"}';
  end if;
  if length(coalesce(_feedback, '')) > 4000 then
    raise exception 'feedback' using errcode = 'P0422', detail = '{"feedback":"At most 4000 characters"}';
  end if;

  r := public.portal_project_row(_aid, _project_id, true);
  if r.version <> _expected_project_version then
    raise exception 'This project changed since you opened it. Reload to see the latest.' using errcode = 'P0409';
  end if;

  select * into c from portal_project_concepts where id = _concept_id and project_id = r.id;
  if c.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if c.superseded_at is not null or c.version <> _concept_version then
    raise exception 'A newer version of this concept was shared. Review it first.' using errcode = 'P0409';
  end if;
  if exists (select 1 from portal_project_decisions d where d.concept_id = c.id and d.decision = 'approve') then
    raise exception 'This concept version is already approved.' using errcode = 'P0409';
  end if;

  insert into portal_project_decisions (project_id, concept_id, concept_version, decision, feedback, decided_by, project_version_before)
  values (r.id, c.id, c.version, _decision, nullif(trim(_feedback), ''), auth.uid(), r.version);

  _msg := case when _decision = 'approve'
    then 'Approved: ' || coalesce(c.title, 'concept') || ' (version ' || c.version || ')' || coalesce(E'\n' || nullif(trim(_feedback), ''), '')
    else 'Changes requested on ' || coalesce(c.title, 'concept') || ' (version ' || c.version || '):' || E'\n' || trim(_feedback) end;
  insert into portal_messages (thread_id, organization_id, sender_user_id, sender_role, body)
  values (r.id, r.organization_id, auth.uid(), 'portal', _msg);

  update portal_threads set version = version + 1, updated_at = now(), last_message_at = now(),
    last_message_role = 'portal', admin_unread = true,
    status = case when _decision = 'approve' then status else 'open' end
  where id = r.id returning * into r;

  return public.portal_project_json(r);
end $$;

-- AX staff share a concept (or a new version of one) into a project.
create or replace function public.portal_share_concept(
  _project_id uuid, _storage_bucket text, _storage_path text, _title text default null,
  _replaces_concept_id uuid default null, _mockup_id uuid default null
)
returns jsonb language plpgsql volatile security definer set search_path to 'public' as $$
declare
  r public.portal_threads;
  prev public.portal_project_concepts;
  _key uuid := gen_random_uuid();
  _ver int := 1;
  _cid uuid;
  _prev_title text;
begin
  if not public.current_user_is_operator() then raise exception 'Not authorized' using errcode = '42501'; end if;
  select * into r from portal_threads where id = _project_id for update;
  if r.id is null or not public.is_org_accessible(r.organization_id) then raise exception 'not found' using errcode = 'P0002'; end if;
  if _storage_bucket not in ('design-previews', 'mockups', 'portal-uploads') then
    -- Never production artwork: design-files is not a client bucket.
    raise exception 'bucket' using errcode = 'P0422', detail = '{"storageBucket":"design-previews, mockups or portal-uploads"}';
  end if;
  if _replaces_concept_id is not null then
    select * into prev from portal_project_concepts where id = _replaces_concept_id and project_id = r.id and superseded_at is null for update;
    if prev.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
    _key := prev.concept_key; _ver := prev.version + 1; _prev_title := prev.title;
    update portal_project_concepts set superseded_at = now() where id = prev.id;
  end if;
  insert into portal_project_concepts (project_id, concept_key, version, title, storage_bucket, storage_path, mockup_id, shared_by)
  values (r.id, _key, _ver, coalesce(_title, _prev_title), _storage_bucket, _storage_path, _mockup_id, auth.uid())
  returning id into _cid;
  update portal_threads set version = version + 1, updated_at = now(), status = 'pending',
    portal_unread = true, last_message_at = now(), last_message_role = 'admin' where id = r.id returning * into r;
  insert into portal_messages (thread_id, organization_id, sender_user_id, sender_role, body)
  values (r.id, r.organization_id, auth.uid(), 'admin',
    case when _ver = 1 then 'New concept to review: ' else 'Updated concept (version ' || _ver || '): ' end || coalesce(_title, _prev_title, 'concept'));
  return public.portal_project_json(r) || jsonb_build_object('conceptId', _cid);
end $$;

-- ---------------------------------------------------------------- messages
create or replace function public.portal_general_thread(_aid uuid)
returns uuid language plpgsql volatile security definer set search_path to 'public' as $$
declare _tid uuid; _org uuid;
begin
  perform pg_advisory_xact_lock(hashtext('portal_general:' || _aid::text));
  select id into _tid from portal_threads where athlete_id = _aid and category = 'general' and status <> 'closed'
    order by last_message_at desc nulls last limit 1;
  if _tid is null then
    select organization_id into _org from athletes where id = _aid;
    insert into portal_threads (organization_id, athlete_id, subject, category, created_by, created_by_role, status, last_message_at, last_message_role)
    values (_org, _aid, 'AX Team', 'general', auth.uid(), 'portal', 'open', now(), 'portal') returning id into _tid;
  end if;
  return _tid;
end $$;
revoke all on function public.portal_general_thread(uuid) from public, anon, authenticated;

create or replace function public.portal_list_messages(_athlete_id uuid, _project_id uuid default null, _cursor timestamptz default null, _limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  _aid uuid := public.portal_scope_athlete(_athlete_id);
  _n int := least(greatest(coalesce(_limit, 50), 1), 100);
  _threads uuid[];
  _rows jsonb;
begin
  if _project_id is not null then
    perform public.portal_project_row(_aid, _project_id, false);
    _threads := array[_project_id];
  else
    select coalesce(array_agg(id), '{}') into _threads from portal_threads where athlete_id = _aid and category not in ('design_feedback', 'order_request');
  end if;
  select jsonb_agg(m order by (m ->> 'createdAt') desc) into _rows from (
    select jsonb_build_object(
      'id', pm.id,
      'projectId', case when _project_id is null then null else pm.thread_id end,
      'threadId', pm.thread_id,
      'body', pm.body,
      'authorLabel', case when pm.sender_role = 'admin' then 'AX Team' else 'You' end,
      'mine', pm.sender_user_id = auth.uid(),
      'createdAt', pm.created_at,
      'attachments', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name, 'mime', u.verified_mime, 'size', u.verified_size))
                               from portal_message_attachments a join portal_uploads u on u.id = a.upload_id
                               where a.message_id = pm.id and u.status = 'finalized'), '[]'::jsonb)
    ) as m
    from portal_messages pm
    where pm.thread_id = any(_threads) and (_cursor is null or pm.created_at < _cursor)
    order by pm.created_at desc
    limit _n + 1
  ) x;
  _rows := coalesce(_rows, '[]'::jsonb);
  return jsonb_build_object(
    'items', case when jsonb_array_length(_rows) > _n then _rows - _n else _rows end,
    'nextCursor', case when jsonb_array_length(_rows) > _n then _rows -> (_n - 1) ->> 'createdAt' end
  );
end $$;

create or replace function public.portal_post_message(_athlete_id uuid, _project_id uuid, _body text, _attachment_ids uuid[] default '{}', _idempotency_key uuid default null)
returns jsonb language plpgsql volatile security definer set search_path to 'public' as $$
declare
  _aid uuid := public.portal_scope_athlete(_athlete_id);
  _tid uuid;
  _org uuid;
  _mid uuid;
  _bad int;
  _prior jsonb;
  _out jsonb;
begin
  perform public.portal_client_write_guard();
  if coalesce(trim(_body), '') = '' and cardinality(coalesce(_attachment_ids, '{}')) = 0 then
    raise exception 'empty' using errcode = 'P0422', detail = '{"body":"Write a message or attach a file"}';
  end if;
  if length(coalesce(_body, '')) > 8000 or cardinality(coalesce(_attachment_ids, '{}')) > 10 then
    raise exception 'too long' using errcode = 'P0422', detail = '{"body":"At most 8000 characters","attachmentIds":"At most 10"}';
  end if;
  _prior := public.portal_idem_claim('post_message', _idempotency_key,
    md5(jsonb_build_object('a', _aid, 'p', _project_id, 'b', _body, 'f', _attachment_ids)::text));
  if _prior is not null then return _prior; end if;

  if _project_id is not null then
    _tid := (public.portal_project_row(_aid, _project_id, false)).id;
  else
    _tid := public.portal_general_thread(_aid);
  end if;

  -- Attachments: this athlete's, finalized, and either unattached to a project
  -- or attached to THIS project.
  select count(*) into _bad from unnest(coalesce(_attachment_ids, '{}')) u(id)
    where not exists (select 1 from portal_uploads p where p.id = u.id and p.athlete_id = _aid and p.status = 'finalized'
                      and (p.project_id is null or p.project_id = _project_id));
  if _bad > 0 then
    raise exception 'attachments' using errcode = 'P0422', detail = '{"attachmentIds":"Attachment not found or not finished uploading"}';
  end if;

  select organization_id into _org from portal_threads where id = _tid;
  insert into portal_messages (thread_id, organization_id, sender_user_id, sender_role, body)
  -- portal_messages requires a non-blank body; a files-only message says so.
  values (_tid, _org, auth.uid(), 'portal',
          coalesce(nullif(trim(_body), ''),
                   'Shared ' || cardinality(_attachment_ids) || case when cardinality(_attachment_ids) = 1 then ' file' else ' files' end))
  returning id into _mid;
  insert into portal_message_attachments (message_id, upload_id) select _mid, unnest(coalesce(_attachment_ids, '{}'));
  if _project_id is not null then
    update portal_uploads set project_id = _project_id where id = any(coalesce(_attachment_ids, '{}')) and project_id is null;
  end if;
  update portal_threads set last_message_at = now(), last_message_role = 'portal', admin_unread = true, updated_at = now() where id = _tid;

  _out := jsonb_build_object('id', _mid, 'projectId', _project_id, 'threadId', _tid, 'createdAt', now(), 'replayed', false);
  perform public.portal_idem_store('post_message', _idempotency_key, _out);
  return _out;
end $$;

-- ---------------------------------------------------------------- uploads
-- Step 1 (edge function, AS THE CALLER): reserve a private path.
create or replace function public.portal_begin_upload(_athlete_id uuid, _purpose text, _name text, _mime text, _size bigint, _project_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path to 'public' as $$
declare
  _aid uuid := public.portal_scope_athlete(_athlete_id);
  _id uuid := gen_random_uuid();
  _safe text;
  _path text;
begin
  perform public.portal_client_write_guard();
  if _purpose not in ('inspiration', 'attachment') then
    raise exception 'purpose' using errcode = 'P0422', detail = '{"purpose":"inspiration or attachment"}';
  end if;
  if _mime not in ('image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'application/pdf') then
    raise exception 'mime' using errcode = 'P0422', detail = '{"mime":"PNG, JPEG, WebP, GIF, HEIC or PDF"}';
  end if;
  if _size is null or _size < 1 or _size > 10485760 then
    raise exception 'size' using errcode = 'P0422', detail = '{"size":"Up to 10 MB"}';
  end if;
  if _project_id is not null then perform public.portal_project_row(_aid, _project_id, false); end if;
  -- Pending uploads per athlete are capped so a loop cannot fill the bucket.
  if (select count(*) from portal_uploads where athlete_id = _aid and status = 'pending' and created_at > now() - interval '1 hour') >= 50 then
    raise exception 'Too many uploads in progress. Try again shortly.' using errcode = 'P0429';
  end if;
  _safe := left(regexp_replace(coalesce(nullif(trim(_name), ''), 'file'), '[^A-Za-z0-9._-]+', '-', 'g'), 80);
  _path := _aid || '/' || coalesce(_project_id::text, 'general') || '/' || _id || '/' || _safe;
  insert into portal_uploads (id, athlete_id, project_id, uploaded_by, purpose, path, name, declared_mime, declared_size)
  values (_id, _aid, _project_id, auth.uid(), _purpose, _path, left(coalesce(nullif(trim(_name), ''), 'file'), 200), _mime, _size);
  return jsonb_build_object('uploadId', _id, 'bucket', 'portal-uploads', 'path', _path);
end $$;

-- Step 3 (edge function, SERVICE ROLE ONLY, after it has inspected the stored
-- object's real size and leading bytes). A browser cannot call this.
create or replace function public.portal_finalize_upload(_upload_id uuid, _user_id uuid, _verified_mime text, _verified_size bigint)
returns jsonb language plpgsql volatile security definer set search_path to 'public' as $$
declare u public.portal_uploads;
begin
  select * into u from portal_uploads where id = _upload_id and uploaded_by = _user_id for update;
  if u.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if u.status = 'finalized' then
    return jsonb_build_object('uploadId', u.id, 'status', u.status, 'replayed', true);
  end if;
  if _verified_mime is null or _verified_size is null then
    update portal_uploads set status = 'rejected', reject_reason = 'not uploaded' where id = u.id;
    return jsonb_build_object('uploadId', u.id, 'status', 'rejected', 'reason', 'not uploaded');
  end if;
  if _verified_mime <> u.declared_mime or _verified_size > 10485760 or _verified_size <> u.declared_size then
    update portal_uploads set status = 'rejected', reject_reason = 'contents do not match what was declared',
      verified_mime = _verified_mime, verified_size = _verified_size where id = u.id;
    return jsonb_build_object('uploadId', u.id, 'status', 'rejected', 'reason', 'contents do not match what was declared');
  end if;
  update portal_uploads set status = 'finalized', verified_mime = _verified_mime, verified_size = _verified_size, finalized_at = now()
  where id = u.id;
  return jsonb_build_object('uploadId', u.id, 'status', 'finalized', 'name', u.name, 'mime', _verified_mime, 'size', _verified_size, 'replayed', false);
end $$;
revoke all on function public.portal_finalize_upload(uuid, uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.portal_finalize_upload(uuid, uuid, text, bigint) to service_role;

-- What the edge function may sign for THIS caller. Returns no row when not allowed.
create or replace function public.portal_authorize_file(_kind text, _id uuid)
returns table(bucket text, path text, name text) language plpgsql stable security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then return; end if;
  if _kind = 'upload' then
    return query
      select u.bucket, u.path, u.name from portal_uploads u join athletes a on a.id = u.athlete_id
      where u.id = _id and u.status = 'finalized'
        and ((not public.current_user_is_operator() and u.athlete_id in (select public.viewer_athlete_ids()))
          or (public.current_user_is_operator() and public.is_org_accessible(a.organization_id)));
  elsif _kind = 'concept' then
    return query
      select c.storage_bucket, c.storage_path, coalesce(c.title, 'concept') from portal_project_concepts c join portal_threads t on t.id = c.project_id
      where c.id = _id and c.storage_bucket <> 'design-files'
        and ((not public.current_user_is_operator() and t.athlete_id in (select public.viewer_athlete_ids()))
          or (public.current_user_is_operator() and public.is_org_accessible(t.organization_id)));
  end if;
end $$;
revoke all on function public.portal_authorize_file(text, uuid) from public, anon;
grant execute on function public.portal_authorize_file(text, uuid) to authenticated;

-- ---------------------------------------------------------------- product approval (was broken)
create or replace function public.portal_decide_product(_athlete_id uuid, _product_id uuid, _decision text, _note text default null, _expected_updated_at timestamptz default null)
returns jsonb language plpgsql volatile security definer set search_path to 'public' as $$
declare
  _aid uuid := public.portal_scope_athlete(_athlete_id);
  p record;
  _state text;
begin
  perform public.portal_client_write_guard();
  if _decision not in ('approve', 'reject') then
    raise exception 'decision' using errcode = 'P0422', detail = '{"decision":"approve or reject"}';
  end if;
  if _decision = 'reject' and coalesce(trim(_note), '') = '' then
    raise exception 'note' using errcode = 'P0422', detail = '{"note":"Say what should change"}';
  end if;
  select pr.id, pr.organization_id, pr.title, pr.approval_state::text as approval_state, pr.updated_at into p
    from products pr join product_athletes pa on pa.product_id = pr.id and pa.athlete_id = _aid
    where pr.id = _product_id for update of pr;
  if p.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if p.approval_state is distinct from 'pending' then
    raise exception 'This product is not waiting for your approval.' using errcode = 'P0409';
  end if;
  if _expected_updated_at is not null and p.updated_at is distinct from _expected_updated_at then
    raise exception 'This product changed since you opened it. Reload to see the latest.' using errcode = 'P0409';
  end if;
  _state := case when _decision = 'approve' then 'approved' else 'rejected' end;
  update products set approval_state = _state::product_approval, approval_note = nullif(trim(_note), ''), updated_at = now()
    where id = p.id;
  insert into product_approvals (organization_id, product_id, athlete_id, state, note, snapshot, decided_by)
  values (p.organization_id, p.id, _aid, _state, nullif(trim(_note), ''),
          jsonb_build_object('title', p.title, 'updated_at', p.updated_at, 'via', 'portal'), auth.uid());
  return jsonb_build_object('productId', p.id, 'approvalState', _state);
end $$;

-- ---------------------------------------------------------------- grants
do $$
declare f text;
begin
  foreach f in array array[
    'portal_list_projects(uuid, timestamptz, integer, text)',
    'portal_get_project(uuid, uuid)',
    'portal_create_project(uuid, uuid, text, text, text, text[], text, text, uuid[])',
    'portal_decide_concept(uuid, uuid, uuid, integer, integer, text, text)',
    'portal_share_concept(uuid, text, text, text, uuid, uuid)',
    'portal_list_messages(uuid, uuid, timestamptz, integer)',
    'portal_post_message(uuid, uuid, text, uuid[], uuid)',
    'portal_begin_upload(uuid, text, text, text, bigint, uuid)',
    'portal_decide_product(uuid, uuid, text, text, timestamptz)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

select 'Portal stage 3 applied' as result;
