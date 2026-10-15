-- ============================================================================
-- Mooney World / portal adapter — STAGES 4 + 5
--   Content & Drops: media library, drop planning
--   Brand HQ: profile, allowlisted profile edits, referral code
--   and one money hole in the referral program.
--
-- Paste into Supabase > SQL Editor and Run. Safe to run twice.
-- Run AFTER stages 1–3.
--
-- WHAT WAS BROKEN
--   * affiliates: the policy named "affiliate updates own limited" was not
--     limited — an affiliate could set their OWN commission_percent,
--     buyer_discount_percent, balance_owed, total_earned, total_paid and
--     status. 0 affiliates exist today, so nothing has been exposed; it would
--     have been the moment the first one was created. A trigger now refuses
--     changes to those columns unless AX staff make them. Affiliates can still
--     edit their display name, email and payout notes. Admin screens unchanged.
--   * drops: staff-only, so the client's own drops (Mooney has "Mooney World —
--     Fall Drop") never reached the portal. Now readable through the adapter.
--
-- CONTENT LIBRARY = what already exists, nothing new to fill in:
--   product photos of the athlete's live products   (kind 'product')
--   product_social_assets AX uploads for them        (kind 'graphic'|'photo'|'video')
--   the athlete's own published content_assets       (kind 'photo'|'video')
--
-- DROPS: a client may plan a DRAFT (title, collection, date, time zone), edit
-- their own drafts, and send one for review. Scheduling and going live stay
-- with AX staff in V2 — a browser can never publish. Edits carry the version
-- they were made against (updated_at); a stale edit gets 409.
-- ============================================================================

-- ---------------------------------------------------------------- affiliates
create or replace function public.affiliates_protect_money_columns()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if public.current_user_is_operator() then return new; end if;
  if new.commission_percent is distinct from old.commission_percent
     or new.buyer_discount_percent is distinct from old.buyer_discount_percent
     or new.balance_owed is distinct from old.balance_owed
     or new.total_earned is distinct from old.total_earned
     or new.total_paid is distinct from old.total_paid
     or new.status is distinct from old.status
     or new.code is distinct from old.code
     or new.user_id is distinct from old.user_id
     or new.id is distinct from old.id then
    raise exception 'Only AX can change commission, balances, status or the code.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists affiliates_protect_money_columns on public.affiliates;
create trigger affiliates_protect_money_columns before update on public.affiliates
  for each row execute function public.affiliates_protect_money_columns();

-- ---------------------------------------------------------------- content
create or replace function public.portal_list_assets(
  _athlete_id uuid, _kind text default null, _collection text default null,
  _cursor timestamptz default null, _limit integer default 24
)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  _aid uuid := public.portal_scope_athlete(_athlete_id);
  _n int := least(greatest(coalesce(_limit, 24), 1), 100);
  _coll uuid;
  _rows jsonb;
begin
  if _kind is not null and _kind not in ('photo', 'video', 'graphic', 'product') then
    raise exception 'kind' using errcode = 'P0422', detail = '{"kind":"photo, video, graphic or product"}';
  end if;
  if _collection is not null and _collection <> 'all' then
    select id into _coll from collections where athlete_id = _aid and status = 'active'
      and (metadata -> 'portal_destination' ->> 'key' = _collection or slug = _collection);
    if _coll is null then
      raise exception 'collection' using errcode = 'P0422', detail = '{"collection":"Not one of your collections"}';
    end if;
  end if;

  with mine as (
    select p.id, p.title from products p
    join product_athletes pa on pa.product_id = p.id and pa.athlete_id = _aid
    where p.status::text = 'published'
      and (_coll is null or exists (select 1 from collection_products cp where cp.collection_id = _coll and cp.product_id = p.id))
  ),
  assets as (
    select 'pi_' || pi.id as id, m.title || case when pi.is_primary then '' else ' — ' || coalesce(pi.metadata ->> 'view', 'alt') end as title,
           'product' as kind, pi.storage_bucket as bucket, pi.storage_path as path, null::text as url,
           null::text as mime, m.id as product_id, null::text as caption, true as approved, pi.created_at
    from product_images pi join mine m on m.id = pi.product_id
    union all
    select 'sa_' || s.id, coalesce(s.file_name, m.title),
           case when s.mime_type like 'video/%' then 'video' when s.mime_type like 'image/%' then 'graphic' else 'graphic' end,
           s.storage_bucket, s.storage_path, null, s.mime_type, s.product_id, s.caption, true, s.created_at
    from product_social_assets s join mine m on m.id = s.product_id
    union all
    select 'ca_' || c.id, c.title, case when c.type::text = 'video' then 'video' else 'photo' end,
           null, null, c.hero_url, null, c.product_id, c.body, true, coalesce(c.publish_at, c.created_at)
    from content_assets c
    where (c.athlete_id = _aid or _aid = any(c.athlete_ids)) and c.status::text = 'published' and c.hero_url is not null
      and _coll is null
  )
  select jsonb_agg(to_jsonb(a) order by a.created_at desc, a.id) into _rows from (
    select * from assets
    where (_kind is null or kind = _kind) and (_cursor is null or created_at < _cursor)
    order by created_at desc, id limit _n + 1
  ) a;
  _rows := coalesce(_rows, '[]'::jsonb);
  return jsonb_build_object(
    'items', case when jsonb_array_length(_rows) > _n then _rows - _n else _rows end,
    'nextCursor', case when jsonb_array_length(_rows) > _n then _rows -> (_n - 1) ->> 'created_at' end
  );
end $$;

-- ---------------------------------------------------------------- drops
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
    'editable', d.status = 'draft' and coalesce(d.approval_state::text, 'none') <> 'pending'
  )
$$;
revoke all on function public.portal_drop_json(public.drops) from public, anon, authenticated;

create or replace function public.portal_list_drops(_athlete_id uuid, _status text default null, _cursor timestamptz default null, _limit integer default 24)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  _aid uuid := public.portal_scope_athlete(_athlete_id);
  _n int := least(greatest(coalesce(_limit, 24), 1), 100);
  _rows jsonb;
begin
  select jsonb_agg(j order by (j ->> 'sortAt') desc) into _rows from (
    select public.portal_drop_json(d) || jsonb_build_object('sortAt', coalesce(d.public_date, d.created_at)) as j
    from drops d
    where d.athlete_id = _aid and (_cursor is null or coalesce(d.public_date, d.created_at) < _cursor)
  ) x where _status is null or j ->> 'status' = _status;
  _rows := coalesce(_rows, '[]'::jsonb);
  if jsonb_array_length(_rows) > _n then
    return jsonb_build_object('items', (select jsonb_agg(e) from jsonb_array_elements(_rows) with ordinality t(e, i) where i <= _n),
                              'nextCursor', _rows -> (_n - 1) ->> 'sortAt');
  end if;
  return jsonb_build_object('items', _rows, 'nextCursor', null);
end $$;

-- Local wall-clock time in a zone → UTC. Rejects an unknown zone.
create or replace function public.portal_local_to_utc(_local timestamp, _time_zone text)
returns timestamptz language plpgsql immutable as $$
begin
  if _time_zone is null or not exists (select 1 from pg_timezone_names where name = _time_zone) then
    raise exception 'time zone' using errcode = 'P0422', detail = '{"timeZone":"Use an IANA zone like America/Los_Angeles"}';
  end if;
  return _local at time zone _time_zone;
end $$;

create or replace function public.portal_create_drop(
  _athlete_id uuid, _idempotency_key uuid, _title text, _destination_id text default null,
  _scheduled_local timestamp default null, _time_zone text default 'UTC'
)
returns jsonb language plpgsql volatile security definer set search_path to 'public' as $$
declare
  _aid uuid := public.portal_scope_athlete(_athlete_id);
  _prior jsonb;
  _coll uuid;
  _org uuid;
  _when timestamptz;
  d public.drops;
  _out jsonb;
begin
  perform public.portal_client_write_guard();
  if coalesce(trim(_title), '') = '' or length(_title) > 120 then
    raise exception 'title' using errcode = 'P0422', detail = '{"title":"1–120 characters"}';
  end if;
  _prior := public.portal_idem_claim('create_drop', _idempotency_key,
    md5(jsonb_build_object('a', _aid, 't', _title, 'd', _destination_id, 's', _scheduled_local, 'z', _time_zone)::text));
  if _prior is not null then return _prior; end if;
  if _scheduled_local is not null then
    _when := public.portal_local_to_utc(_scheduled_local, _time_zone);
  elsif _time_zone is not null then
    perform public.portal_local_to_utc(now()::timestamp, _time_zone); -- validate the zone anyway
  end if;
  if _destination_id is not null then
    select id into _coll from collections where athlete_id = _aid and status = 'active'
      and (metadata -> 'portal_destination' ->> 'key' = _destination_id or slug = _destination_id);
    if _coll is null then raise exception 'destination' using errcode = 'P0422', detail = '{"destinationId":"Not one of your collections"}'; end if;
  end if;
  select organization_id into _org from athletes where id = _aid;
  insert into drops (organization_id, athlete_id, collection_id, name, slug, status, public_date, created_by, metadata)
  values (_org, _aid, _coll, trim(_title),
          left(regexp_replace(lower(trim(_title)), '[^a-z0-9]+', '-', 'g'), 60) || '-' || substr(md5(random()::text), 1, 6),
          'draft', _when, auth.uid(),
          jsonb_build_object('time_zone', coalesce(_time_zone, 'UTC'), 'planned_by', 'portal'))
  returning * into d;
  _out := public.portal_drop_json(d) || jsonb_build_object('replayed', false);
  perform public.portal_idem_store('create_drop', _idempotency_key, _out);
  return _out;
end $$;

-- _change: {"title"?, "destinationId"?, "scheduledLocal"?: "2026-11-01T18:00", "timeZone"?, "submitForReview"?: true}
create or replace function public.portal_update_drop(_athlete_id uuid, _drop_id uuid, _expected_version timestamptz, _change jsonb)
returns jsonb language plpgsql volatile security definer set search_path to 'public' as $$
declare
  _aid uuid := public.portal_scope_athlete(_athlete_id);
  d public.drops;
  _tz text;
  _coll uuid;
  _when timestamptz;
  _bad text;
begin
  perform public.portal_client_write_guard();
  select * into d from drops where id = _drop_id and athlete_id = _aid for update;
  if d.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if d.updated_at is distinct from _expected_version then
    raise exception 'This drop changed since you opened it. Reload to see the latest.' using errcode = 'P0409';
  end if;
  if d.status <> 'draft' or coalesce(d.approval_state::text, 'none') = 'pending' then
    raise exception 'Only a draft you have not sent for review can be edited.' using errcode = 'P0409';
  end if;
  select string_agg(k, ', ') into _bad from jsonb_object_keys(coalesce(_change, '{}')) k
    where k not in ('title', 'destinationId', 'scheduledLocal', 'timeZone', 'submitForReview');
  if _bad is not null then
    raise exception 'fields' using errcode = 'P0422', detail = jsonb_build_object('change', 'Not editable here: ' || _bad)::text;
  end if;

  if _change ? 'title' then
    if coalesce(trim(_change ->> 'title'), '') = '' or length(_change ->> 'title') > 120 then
      raise exception 'title' using errcode = 'P0422', detail = '{"title":"1–120 characters"}';
    end if;
    d.name := trim(_change ->> 'title');
  end if;
  if _change ? 'destinationId' then
    if _change ->> 'destinationId' is null then d.collection_id := null;
    else
      select id into _coll from collections where athlete_id = _aid and status = 'active'
        and (metadata -> 'portal_destination' ->> 'key' = _change ->> 'destinationId' or slug = _change ->> 'destinationId');
      if _coll is null then raise exception 'destination' using errcode = 'P0422', detail = '{"destinationId":"Not one of your collections"}'; end if;
      d.collection_id := _coll;
    end if;
  end if;
  _tz := coalesce(_change ->> 'timeZone', d.metadata ->> 'time_zone', 'UTC');
  if _change ? 'scheduledLocal' or _change ? 'timeZone' then
    if _change ? 'scheduledLocal' and _change ->> 'scheduledLocal' is null then
      _when := null;
      perform public.portal_local_to_utc(now()::timestamp, _tz);
    elsif _change ? 'scheduledLocal' then
      _when := public.portal_local_to_utc((_change ->> 'scheduledLocal')::timestamp, _tz);
    else
      -- zone changed, keep the same local wall-clock time
      _when := case when d.public_date is null then null
        else public.portal_local_to_utc(d.public_date at time zone coalesce(d.metadata ->> 'time_zone', 'UTC'), _tz) end;
    end if;
    d.public_date := _when;
    d.metadata := coalesce(d.metadata, '{}'::jsonb) || jsonb_build_object('time_zone', _tz);
  end if;
  if coalesce((_change ->> 'submitForReview')::boolean, false) then
    d.approval_state := 'pending';
  end if;

  update drops set name = d.name, collection_id = d.collection_id, public_date = d.public_date,
    metadata = d.metadata, approval_state = d.approval_state, updated_at = now()
  where id = d.id returning * into d;
  return public.portal_drop_json(d);
end $$;

-- ---------------------------------------------------------------- profile
create or replace function public.portal_get_profile(_athlete_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  _aid uuid := public.portal_scope_athlete(_athlete_id);
  a record;
  aff record;
begin
  select at.id, at.display_name, at.first_name, at.last_name, at.position, at.jersey_number, at.league::text as league,
         at.entity_type, at.website, at.metadata, t.name as team_name
    into a
    from athletes at left join teams t on t.id = at.current_team_id where at.id = _aid;
  -- The caller's own referral code, only if AX has approved it.
  select code, buyer_discount_percent, status::text as status into aff
    from affiliates where user_id = auth.uid() and status::text = 'active' limit 1;
  return jsonb_build_object(
    'id', a.id,
    'name', coalesce(nullif(a.display_name, ''), trim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, ''))),
    'position', a.position,
    'jerseyNumber', a.jersey_number,
    'league', a.league,
    'team', a.team_name,
    'entityType', a.entity_type,
    'avatarUrl', a.metadata ->> 'avatar_url',
    'bio', a.metadata ->> 'bio',
    'website', a.website,
    'notificationDefaults', a.metadata -> 'notif_defaults',
    -- No referral URL yet: the storefront has no ?ref= redemption, and a link
    -- that does nothing is worse than none. The UI shows the code only.
    'referral', case when aff.code is null then null else jsonb_build_object(
      'code', aff.code, 'buyerDiscountPercent', aff.buyer_discount_percent, 'url', null) end
  );
end $$;

-- Only these may be changed from the portal. Name, number, team, look,
-- financial figures and roles are AX's.
create or replace function public.portal_update_profile(_athlete_id uuid, _expected_version timestamptz, _patch jsonb)
returns jsonb language plpgsql volatile security definer set search_path to 'public' as $$
declare
  _aid uuid := public.portal_scope_athlete(_athlete_id);
  a public.athletes;
  _bad text;
begin
  perform public.portal_client_write_guard();
  select string_agg(k, ', ') into _bad from jsonb_object_keys(coalesce(_patch, '{}')) k
    where k not in ('bio', 'website', 'notificationDefaults');
  if _bad is not null then
    raise exception 'fields' using errcode = 'P0422', detail = jsonb_build_object('patch', 'Not editable here: ' || _bad)::text;
  end if;
  select * into a from athletes where id = _aid for update;
  if _expected_version is not null and a.updated_at is distinct from _expected_version then
    raise exception 'Your profile changed since you opened it. Reload to see the latest.' using errcode = 'P0409';
  end if;
  if _patch ? 'bio' and length(coalesce(_patch ->> 'bio', '')) > 500 then
    raise exception 'bio' using errcode = 'P0422', detail = '{"bio":"At most 500 characters"}';
  end if;
  if _patch ? 'website' and _patch ->> 'website' is not null and (_patch ->> 'website') !~* '^https://[^\s]{3,200}$' then
    raise exception 'website' using errcode = 'P0422', detail = '{"website":"A full https:// address"}';
  end if;
  if _patch ? 'notificationDefaults' and jsonb_typeof(_patch -> 'notificationDefaults') not in ('object', 'null') then
    raise exception 'notifications' using errcode = 'P0422', detail = '{"notificationDefaults":"Expected an object"}';
  end if;
  update athletes set
    website = case when _patch ? 'website' then nullif(trim(_patch ->> 'website'), '') else website end,
    metadata = coalesce(metadata, '{}'::jsonb)
      || case when _patch ? 'bio' then jsonb_build_object('bio', nullif(trim(_patch ->> 'bio'), '')) else '{}'::jsonb end
      || case when _patch ? 'notificationDefaults' then jsonb_build_object('notif_defaults', _patch -> 'notificationDefaults') else '{}'::jsonb end,
    updated_at = now()
  where id = _aid;
  return public.portal_get_profile(_aid);
end $$;

-- ---------------------------------------------------------------- grants
do $$
declare f text;
begin
  foreach f in array array[
    'portal_list_assets(uuid, text, text, timestamptz, integer)',
    'portal_list_drops(uuid, text, timestamptz, integer)',
    'portal_create_drop(uuid, uuid, text, text, timestamp, text)',
    'portal_update_drop(uuid, uuid, timestamptz, jsonb)',
    'portal_get_profile(uuid)',
    'portal_update_profile(uuid, timestamptz, jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

select 'Portal stages 4 + 5 applied' as result;
