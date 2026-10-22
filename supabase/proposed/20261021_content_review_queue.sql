-- Content review queue (2026-10-21). APPLIED as migration content_review_queue_20261021.
--
-- Chase reviews every piece of content once, one picture at a time, before a
-- client sees it:
--   approve  -> live on the assigned client's Content & Drops (status published)
--   fix      -> back to production with a note on what to change (status draft)
--   archive  -> never shown, optional reason (status archived)
--   pending  -> undo: back in the queue (status draft)
--
-- Invariant: anything still waiting for review is a draft, so nothing reaches a
-- client before it is approved. Every decision is appended to review_log so the
-- fix notes stay as a record and redos stay consistent.
--
-- Who it is for is set when it arrives (from its Drive folder) and can be
-- changed in review. athlete_id null = AX's own (website, World Tour).

alter table public.content_assets
  add column if not exists review_state text check (review_state in ('pending', 'approved', 'needs_fix', 'archived')),
  add column if not exists review_note text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid,
  add column if not exists review_log jsonb not null default '[]'::jsonb,
  add column if not exists source_key text;

create unique index if not exists content_assets_source_key on public.content_assets (source_key) where source_key is not null;
create index if not exists content_assets_review_state on public.content_assets (review_state) where review_state is not null;

-- Pieces imported from Drive 06 are keyed by their Drive file, and wait for review.
update public.content_assets
set source_key = 'drive:' || (media -> 0 ->> 'drive_file_id'),
    review_state = 'pending',
    status = 'draft'
where media -> 0 ->> 'source' = 'drive-06' and review_state is null;

create or replace function public.ax_content_review(_id uuid, _decision text, _note text default null)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  _state text;
  _status content_status;
  _row content_assets%rowtype;
begin
  if not public.current_user_is_operator() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  case _decision
    when 'approve' then _state := 'approved'; _status := 'published';
    when 'fix' then _state := 'needs_fix'; _status := 'draft';
    when 'archive' then _state := 'archived'; _status := 'archived';
    when 'pending' then _state := 'pending'; _status := 'draft';
    else raise exception 'decision' using errcode = '22023', detail = 'approve, fix, archive or pending';
  end case;
  if _decision = 'fix' and coalesce(trim(_note), '') = '' then
    raise exception 'Say what needs fixing' using errcode = '22023';
  end if;

  update content_assets set
    review_state = _state,
    status = _status,
    review_note = case when _decision = 'pending' then review_note else nullif(trim(_note), '') end,
    reviewed_at = now(),
    reviewed_by = auth.uid(),
    publish_at = case when _decision = 'approve' and status <> 'published' then now() else publish_at end,
    review_log = review_log || jsonb_build_array(jsonb_build_object('at', now(), 'by', auth.uid(), 'decision', _decision, 'note', nullif(trim(_note), ''))),
    updated_at = now()
  where id = _id
  returning * into _row;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  return jsonb_build_object('id', _row.id, 'review_state', _row.review_state, 'status', _row.status);
end
$$;

-- Who a piece is for. Null = AX's own (website, World Tour); it then sits in AX's organization.
create or replace function public.ax_content_assign(_id uuid, _athlete_id uuid)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare _org uuid;
begin
  if not public.current_user_is_operator() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if _athlete_id is null then
    _org := '2d6f377e-4fe8-448b-84b3-42aed237f3da';
  else
    select organization_id into _org from athletes where id = _athlete_id;
    if _org is null then raise exception 'not found' using errcode = 'P0002'; end if;
  end if;
  update content_assets set athlete_id = _athlete_id, organization_id = _org, updated_at = now(),
    -- the product belonged to the old owner
    product_id = case when _athlete_id is distinct from athlete_id then null else product_id end
  where id = _id;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
end
$$;

revoke all on function public.ax_content_review(uuid, text, text) from public, anon;
revoke all on function public.ax_content_assign(uuid, uuid) from public, anon;
grant execute on function public.ax_content_review(uuid, text, text) to authenticated;
grant execute on function public.ax_content_assign(uuid, uuid) to authenticated;

-- Also applied (content_folders_for_intake_20261021): which Drive 06 top folders mean which client.
-- update athletes set metadata = metadata || '{"content_folders":["PROACTIVE"]}' where id = '972f0aa1-e9d7-490e-b73d-4644bbe2eacb';
-- update athletes set metadata = metadata || '{"content_folders":["DARNELL MOONEY","MOONEY"]}' where id = '74bb5183-5a2b-443b-9b07-bf52ef89c722';
-- A client whose display name matches its folder (e.g. STEVEN SHAREEF) needs nothing.
