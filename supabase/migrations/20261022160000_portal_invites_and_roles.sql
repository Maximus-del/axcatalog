-- PORTAL INVITES, ACCESS REQUESTS AND OWNER / TEAM ROLES
--
-- Before this, the only way into a client portal was an operator creating the
-- account by hand (admin-manage-users 'create_client'). Every linked user saw
-- the same portal, financials included.
--
-- Now:
--   * An operator mints a role-carrying invite link per entity (owner | team).
--   * Anyone with the link signs up (ordinary Supabase auth) and files an
--     access request. Nothing is granted by the link alone.
--   * An operator approves (optionally switching the role) or denies. Approval
--     does exactly what create_client does -- a 'client' user_profiles row in
--     the entity's organisation plus a user_athlete_links row -- and records
--     the portal role on the link.
--   * 'team' links never reach money: revenue, playbook, credit wallet,
--     Shopify orders, and other people's bulk orders are owner-only at the
--     database, not just hidden in the UI.
--
-- Additive. Every existing link defaults to 'owner', so no current user loses
-- anything.

-- ── role on the link ──────────────────────────────────────────────────
alter table public.user_athlete_links
  add column if not exists portal_role text not null default 'owner'
  check (portal_role in ('owner', 'team'));

-- ── invites ───────────────────────────────────────────────────────────
create table if not exists public.portal_invites (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  organization_id uuid not null,
  role text not null check (role in ('owner', 'team')),
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  label text,
  active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists portal_invites_athlete_idx on public.portal_invites(athlete_id);
alter table public.portal_invites enable row level security;

drop policy if exists "operators manage portal invites" on public.portal_invites;
create policy "operators manage portal invites" on public.portal_invites
  for all
  using (public.current_user_is_operator() and public.is_org_accessible(organization_id))
  with check (public.current_user_is_operator() and public.is_org_accessible(organization_id));

-- ── access requests ───────────────────────────────────────────────────
create table if not exists public.portal_access_requests (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid references public.portal_invites(id) on delete set null,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  organization_id uuid not null,
  user_id uuid not null,
  full_name text,
  email text,
  requested_role text not null check (requested_role in ('owner', 'team')),
  granted_role text check (granted_role in ('owner', 'team')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, athlete_id)
);
create index if not exists portal_access_requests_pending_idx
  on public.portal_access_requests(athlete_id) where status = 'pending';
alter table public.portal_access_requests enable row level security;

drop policy if exists "operators manage access requests" on public.portal_access_requests;
create policy "operators manage access requests" on public.portal_access_requests
  for all
  using (public.current_user_is_operator() and public.is_org_accessible(organization_id))
  with check (public.current_user_is_operator() and public.is_org_accessible(organization_id));

drop policy if exists "requester reads own access requests" on public.portal_access_requests;
create policy "requester reads own access requests" on public.portal_access_requests
  for select using (user_id = auth.uid());

-- ── public: what does this link open? ─────────────────────────────────
-- Callable signed-out. Returns only what the join screen shows.
create or replace function public.portal_invite_info(_token text)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'role', i.role,
    'entityName', coalesce(nullif(a.display_name, ''), a.full_name),
    'theme', coalesce(a.metadata -> 'portal_theme', '{}'::jsonb)
  )
  from portal_invites i
  join athletes a on a.id = i.athlete_id
  where i.token = _token and i.active
$$;
grant execute on function public.portal_invite_info(text) to anon, authenticated;

-- ── signed-in: ask for access through a link ──────────────────────────
create or replace function public.portal_request_access(_token text, _full_name text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  _inv portal_invites;
  _email text;
  _existing portal_access_requests;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into _inv from portal_invites where token = _token and active;
  if _inv.id is null then
    raise exception 'This invite link is no longer active.' using errcode = 'P0002';
  end if;

  if exists (select 1 from user_athlete_links where user_id = auth.uid() and athlete_id = _inv.athlete_id) then
    return jsonb_build_object('status', 'approved');
  end if;

  select email into _email from auth.users where id = auth.uid();

  select * into _existing from portal_access_requests
   where user_id = auth.uid() and athlete_id = _inv.athlete_id;

  if _existing.id is not null then
    -- A denied request can be re-filed through a fresh link; a pending one
    -- just refreshes its name.
    update portal_access_requests
       set full_name = coalesce(nullif(trim(_full_name), ''), full_name),
           invite_id = _inv.id,
           requested_role = _inv.role,
           status = case when status = 'denied' then 'pending' else status end,
           decided_by = case when status = 'denied' then null else decided_by end,
           decided_at = case when status = 'denied' then null else decided_at end
     where id = _existing.id;
    return jsonb_build_object('status', case when _existing.status = 'denied' then 'pending' else _existing.status end);
  end if;

  insert into portal_access_requests (invite_id, athlete_id, organization_id, user_id, full_name, email, requested_role)
  values (_inv.id, _inv.athlete_id, _inv.organization_id, auth.uid(), nullif(trim(_full_name), ''), _email, _inv.role);
  return jsonb_build_object('status', 'pending');
end
$$;
revoke all on function public.portal_request_access(text, text) from public, anon;
grant execute on function public.portal_request_access(text, text) to authenticated;

-- ── operator: approve / deny ──────────────────────────────────────────
create or replace function public.portal_decide_access(_request_id uuid, _decision text, _role text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  _r portal_access_requests;
  _role_final text;
  _profile user_profiles;
  _entity_name text;
begin
  if not public.current_user_is_operator() then
    raise exception 'operators only' using errcode = '42501';
  end if;
  select * into _r from portal_access_requests where id = _request_id for update;
  if _r.id is null or not public.is_org_accessible(_r.organization_id) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if _decision not in ('approve', 'deny') then
    raise exception 'decision must be approve or deny' using errcode = '22023';
  end if;

  if _decision = 'deny' then
    update portal_access_requests
       set status = 'denied', granted_role = null, decided_by = auth.uid(), decided_at = now()
     where id = _r.id;
    return jsonb_build_object('status', 'denied');
  end if;

  _role_final := coalesce(_role, _r.requested_role);
  if _role_final not in ('owner', 'team') then
    raise exception 'role must be owner or team' using errcode = '22023';
  end if;

  select * into _profile from user_profiles where id = _r.user_id;
  if _profile.id is null then
    select coalesce(nullif(display_name, ''), full_name) into _entity_name from athletes where id = _r.athlete_id;
    insert into user_profiles (id, organization_id, full_name, email, role)
    values (_r.user_id, _r.organization_id, coalesce(_r.full_name, _r.email), _r.email, 'client');
  elsif _profile.role = 'client' and _profile.organization_id <> _r.organization_id then
    -- A client login is scoped to one organisation (current_user_org_id()).
    raise exception 'This person already has a client login with another organization.' using errcode = '23514';
  end if;

  insert into user_athlete_links (user_id, athlete_id, portal_role)
  values (_r.user_id, _r.athlete_id, _role_final)
  on conflict (user_id, athlete_id) do update set portal_role = excluded.portal_role;

  update portal_access_requests
     set status = 'approved', granted_role = _role_final, decided_by = auth.uid(), decided_at = now()
   where id = _r.id;
  return jsonb_build_object('status', 'approved', 'role', _role_final);
end
$$;
revoke all on function public.portal_decide_access(uuid, text, text) from public, anon;
grant execute on function public.portal_decide_access(uuid, text, text) to authenticated;

-- ── operator: change an existing person's role ───────────────────────
create or replace function public.portal_set_link_role(_user_id uuid, _athlete_id uuid, _role text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.current_user_is_operator() then
    raise exception 'operators only' using errcode = '42501';
  end if;
  if _role not in ('owner', 'team') then
    raise exception 'role must be owner or team' using errcode = '22023';
  end if;
  update user_athlete_links l set portal_role = _role
   where l.user_id = _user_id and l.athlete_id = _athlete_id
     and exists (select 1 from athletes a where a.id = l.athlete_id and public.is_org_accessible(a.organization_id));
end
$$;
revoke all on function public.portal_set_link_role(uuid, uuid, text) from public, anon;
grant execute on function public.portal_set_link_role(uuid, uuid, text) to authenticated;

-- ── owner gate ────────────────────────────────────────────────────────
create or replace function public.viewer_owner_athlete_ids()
returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select athlete_id from user_athlete_links where user_id = auth.uid() and portal_role = 'owner'
$$;

create or replace function public.portal_viewer_is_owner(_athlete_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.current_user_is_operator()
      or exists (select 1 from user_athlete_links
                  where user_id = auth.uid() and athlete_id = _athlete_id and portal_role = 'owner')
$$;
grant execute on function public.portal_viewer_is_owner(uuid) to authenticated;

create or replace function public.portal_require_owner(_athlete_id uuid)
returns void language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.portal_viewer_is_owner(_athlete_id) then
    raise exception 'owner access only' using errcode = '42501';
  end if;
end
$$;

-- ── money tables: owner links only (altered in place, nothing dropped) ────────────────────────────────────
alter policy wallet_self_read on public.athlete_credit_wallets
  using (current_user_is_admin() or athlete_id in (select public.viewer_owner_athlete_ids()));

alter policy txn_self_read on public.athlete_credit_transactions
  using (current_user_is_admin() or athlete_id in (select public.viewer_owner_athlete_ids()));

alter policy "athlete read attributed line items" on public.order_line_items
  using ((organization_id = current_user_org_id()) and (not current_user_is_admin()) and exists (
    select 1 from product_athletes pa
     where pa.product_id = order_line_items.product_id
       and pa.athlete_id in (select public.viewer_owner_athlete_ids())));

alter policy "athlete read parent orders" on public.orders
  using ((organization_id = current_user_org_id()) and (not current_user_is_admin()) and exists (
    select 1 from order_line_items oli join product_athletes pa on pa.product_id = oli.product_id
     where oli.order_id = orders.id
       and pa.athlete_id in (select public.viewer_owner_athlete_ids())));

alter policy "client read order items via athlete link" on public.shopify_order_line_items
  using ((organization_id = current_user_org_id()) and (not current_user_is_admin()) and exists (
    select 1 from product_athletes pa
     where pa.product_id = shopify_order_line_items.product_id
       and pa.athlete_id in (select public.viewer_owner_athlete_ids())));

alter policy "client read shopify orders via athlete link" on public.shopify_orders
  using ((organization_id = current_user_org_id()) and (not current_user_is_admin()) and exists (
    select 1 from shopify_order_line_items li join product_athletes pa on pa.product_id = li.product_id
     where li.shopify_order_uuid = shopify_orders.id
       and pa.athlete_id in (select public.viewer_owner_athlete_ids())));

-- Bulk orders: owners see the entity's; team see only the ones they raised.
alter policy "client read own bulk orders" on public.bulk_order_requests
  using ((status <> 'draft'::bulk_order_status) and (organization_id = current_user_org_id())
    and (not current_user_is_admin())
    and (athlete_id in (select public.viewer_owner_athlete_ids())
         or (requested_by = auth.uid() and athlete_id in (select public.viewer_athlete_ids()))));

alter policy "org read bulk order items" on public.bulk_order_items
  using (exists (
    select 1 from bulk_order_requests o
     where o.id = bulk_order_items.order_request_id
       and is_org_accessible(o.organization_id)
       and (current_user_is_admin() or current_user_is_platform_admin()
            or o.athlete_id in (select public.viewer_owner_athlete_ids())
            or (o.requested_by = auth.uid() and o.athlete_id in (select public.viewer_athlete_ids())))));

-- ── money RPCs: owner gate injected at the top of each body ───────────
-- Done by rewriting the live definition so the rest of each function stays
-- byte-for-byte what it was. Each injection is guarded so a re-run is a no-op.
do $mig$
declare
  _def text;
  _fn regprocedure;
  _inj text;
begin
  foreach _fn in array array[
    'public.portal_revenue_summary(uuid, timestamptz, timestamptz, text)'::regprocedure,
    'public.portal_brand_playbook(uuid)'::regprocedure,
    'public.portal_submit_order_request(uuid, uuid, jsonb, numeric, text, text, text, numeric, integer)'::regprocedure
  ] loop
    _def := pg_get_functiondef(_fn);
    continue when _def like '%AX_OWNER_GATE%';
    _inj := case _fn
      when 'public.portal_revenue_summary(uuid, timestamptz, timestamptz, text)'::regprocedure then
        E'  -- AX_OWNER_GATE\n  if not public.portal_viewer_is_owner(_athlete_id) then\n    return jsonb_build_object(''attributable'', false, ''reason'', ''owner_only'');\n  end if;\n'
      when 'public.portal_brand_playbook(uuid)'::regprocedure then
        E'  -- AX_OWNER_GATE\n  perform public.portal_require_owner(_athlete_id);\n'
      else
        E'  -- AX_OWNER_GATE: credit is the owner''s money\n  if coalesce(_credit, 0) > 0 then\n    perform public.portal_require_owner(_athlete_id);\n  end if;\n'
    end;
    _def := regexp_replace(_def, E'\\nbegin\\r?\\n', E'\nbegin\n' || _inj);
    if _def not like '%AX_OWNER_GATE%' then
      raise exception 'owner gate injection failed for %', _fn;
    end if;
    execute _def;
  end loop;
end
$mig$;
