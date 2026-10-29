-- PORTAL ACCESS CODES (2026-10-29)
--
-- An invite link still means "AX approves every person". A CODE is for the
-- person Chase is already talking to: he reads it out / texts it, they type it
-- on the waiting screen (or after signing up with no link at all) and they're
-- in immediately, with the code's role (Owner or Team). Same end state as an
-- approval: user_profiles row, user_athlete_links row, and an APPROVED
-- portal_access_requests row so the person shows up in Locker access with
-- their answers like everyone else.
--
-- One active code per client per role. Making a new one switches the old off.
-- Codes are 8 characters from an alphabet without look-alikes (no 0/O/1/I/L),
-- shown as XXXX-XXXX; matching ignores case, spaces and dashes.

create table if not exists public.portal_access_codes (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  organization_id uuid not null,
  role text not null check (role in ('owner', 'team')),
  code text not null,
  active boolean not null default true,
  uses integer not null default 0,
  max_uses integer check (max_uses is null or max_uses > 0),
  expires_at timestamptz,
  last_used_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create unique index if not exists portal_access_codes_live_code
  on public.portal_access_codes (code) where active;
create index if not exists portal_access_codes_athlete on public.portal_access_codes (athlete_id);

alter table public.portal_access_codes enable row level security;
drop policy if exists "operators manage access codes" on public.portal_access_codes;
create policy "operators manage access codes" on public.portal_access_codes
  for all using (public.current_user_is_operator() and public.is_org_accessible(organization_id))
  with check (public.current_user_is_operator() and public.is_org_accessible(organization_id));

-- Which way in each person came (link approval vs code).
alter table public.portal_access_requests add column if not exists via_code_id uuid references public.portal_access_codes(id) on delete set null;

-- Operator: mint a fresh code for a client + role (switches the old one off).
create or replace function public.portal_new_access_code(_athlete_id uuid, _role text, _max_uses integer default null, _expires_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _org uuid;
  _alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  _code text;
  _row portal_access_codes;
  _tries int := 0;
begin
  if not public.current_user_is_operator() then
    raise exception 'operators only' using errcode = '42501';
  end if;
  if _role not in ('owner', 'team') then
    raise exception 'role must be owner or team' using errcode = '22023';
  end if;
  select organization_id into _org from athletes where id = _athlete_id;
  if _org is null or not public.is_org_accessible(_org) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  update portal_access_codes set active = false where athlete_id = _athlete_id and role = _role and active;
  loop
    _code := '';
    for i in 1..8 loop
      _code := _code || substr(_alphabet, 1 + floor(random() * length(_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from portal_access_codes where code = _code and active);
    _tries := _tries + 1;
    if _tries > 20 then raise exception 'could not mint a code'; end if;
  end loop;
  insert into portal_access_codes (athlete_id, organization_id, role, code, max_uses, expires_at)
  values (_athlete_id, _org, _role, _code, _max_uses, _expires_at)
  returning * into _row;
  return jsonb_build_object('id', _row.id, 'code', _row.code, 'role', _row.role);
end;
$$;

-- Wrong guesses are counted per person; 10 in an hour locks them out for the
-- hour (a bad code RETURNS an error instead of raising, so the count sticks).
create table if not exists public.portal_code_attempts (
  user_id uuid not null,
  attempted_at timestamptz not null default now()
);
create index if not exists portal_code_attempts_user on public.portal_code_attempts (user_id, attempted_at);
alter table public.portal_code_attempts enable row level security; -- no policies: only the function touches it

-- Signed-in person: redeem a code -> straight into that locker.
create or replace function public.portal_redeem_access_code(_code text, _full_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _norm text := upper(regexp_replace(coalesce(_code, ''), '[^A-Za-z0-9]', '', 'g'));
  _c portal_access_codes;
  _email text;
  _profile user_profiles;
  _req portal_access_requests;
  _name text;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  if (select count(*) from portal_code_attempts where user_id = auth.uid() and attempted_at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('status', 'locked', 'message', 'Too many tries. Wait an hour, or ask for the invite link instead.');
  end if;
  if length(_norm) <> 8 then
    return jsonb_build_object('status', 'invalid', 'message', 'That code doesn''t look right — it''s 8 letters and numbers.');
  end if;
  select * into _c from portal_access_codes where code = _norm and active for update;
  if _c.id is null
     or (_c.expires_at is not null and _c.expires_at < now())
     or (_c.max_uses is not null and _c.uses >= _c.max_uses) then
    insert into portal_code_attempts (user_id) values (auth.uid());
    return jsonb_build_object('status', 'invalid', 'message', 'That code isn''t valid. Check it, or ask for a new one.');
  end if;

  select email into _email from auth.users where id = auth.uid();
  select * into _req from portal_access_requests where user_id = auth.uid() and athlete_id = _c.athlete_id;
  _name := coalesce(nullif(trim(_full_name), ''), _req.full_name, _email);

  select * into _profile from user_profiles where id = auth.uid();
  if _profile.id is null then
    insert into user_profiles (id, organization_id, full_name, email, role)
    values (auth.uid(), _c.organization_id, _name, _email, 'client');
  elsif _profile.role = 'client' and _profile.organization_id <> _c.organization_id then
    raise exception 'This login already belongs to another organization. Use a different email.' using errcode = '23514';
  end if;

  insert into user_athlete_links (user_id, athlete_id, portal_role)
  values (auth.uid(), _c.athlete_id, _c.role)
  on conflict (user_id, athlete_id) do update set portal_role = excluded.portal_role;

  if _req.id is null then
    insert into portal_access_requests (athlete_id, organization_id, user_id, full_name, email, requested_role, granted_role, status, decided_at, via_code_id)
    values (_c.athlete_id, _c.organization_id, auth.uid(), _name, _email, _c.role, _c.role, 'approved', now(), _c.id);
  else
    update portal_access_requests
       set status = 'approved', requested_role = _c.role, granted_role = _c.role, decided_by = null, decided_at = now(),
           via_code_id = _c.id, full_name = coalesce(_name, full_name)
     where id = _req.id;
  end if;

  update portal_access_codes set uses = uses + 1, last_used_at = now() where id = _c.id;

  return jsonb_build_object(
    'status', 'approved', 'role', _c.role, 'athleteId', _c.athlete_id,
    'entityName', (select coalesce(nullif(display_name, ''), full_name) from athletes where id = _c.athlete_id)
  );
end;
$$;

revoke all on function public.portal_new_access_code(uuid, text, integer, timestamptz) from public;
grant execute on function public.portal_new_access_code(uuid, text, integer, timestamptz) to authenticated;
revoke all on function public.portal_redeem_access_code(text, text) from public;
grant execute on function public.portal_redeem_access_code(text, text) to authenticated;
