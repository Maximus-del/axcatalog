-- A CLIENT LOGIN MUST NOT BE AN OPERATOR
--
-- The portal has client-safe policies on the tables it was built alongside
-- (portal_threads, bulk_order_requests, saved_items, orders, athlete_credit_*,
-- fan_profiles, order_line_items...): each one is scoped to the viewer through
-- user_athlete_links, with a separate admin policy beside it.
--
-- The older catalog and design tables never got that treatment. Every policy on
-- them is a bare is_org_accessible(organization_id), which is org match only:
--
--   is_org_accessible(_org) := _org = current_user_org_id() OR platform_admin
--
-- admin-manage-users' new 'create_client' action files a client into the
-- ATHLETE's organisation -- the same organisation the designs belong to. So the
-- moment Darnell Mooney has a password, that password can run
--
--   GET /rest/v1/designs?select=*
--   DELETE /rest/v1/designs?id=eq....
--
-- and reach all 110 designs including the hidden ones, every mockup, every
-- other athlete's products in the org, and delete them. The portal UI never
-- shows any of it; PostgREST does not care what the UI shows. The whole
-- client-visibility contract -- design_client_visible(), the design-previews
-- bucket, client_design_shelf() -- lives above a table layer that gives a
-- client the same rights as an operator.
--
-- This splits the two apart, following the pattern the portal tables already
-- use. Every existing policy keeps its org clause and gains an operator gate;
-- narrow client read policies are added beside them for exactly the tables the
-- portal reads directly, scoped to the athletes the viewer is linked to.
--
-- No current user loses anything: all three user_profiles rows are role
-- 'admin'. Nothing has a client login yet -- that is the point of doing this
-- first.
--
-- The portal's other reads need no policy at all, because they go through
-- SECURITY DEFINER functions and owner-rights views that bypass RLS by design:
--   client_design_shelf(), design_client_visible(), athlete_access_summary(),
--   compute_wholesale_price(), mark_thread_read(), public_catalog*,
-- which is why designs, design_files and mockups below are operator-only.

-- ── helpers ────────────────────────────────────────────────────────────
--
-- SECURITY DEFINER on purpose. A policy's USING expression is evaluated as the
-- invoking user, so a subquery against product_athletes inside a policy on
-- products would itself be filtered by product_athletes' policies -- and once
-- those are operator-gated, a client's subquery returns nothing and the policy
-- silently denies. Routing every lookup through a definer function is the same
-- device design_client_visible() and is_org_accessible() already use.

create or replace function public.current_user_is_operator()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.current_user_is_admin() or public.current_user_is_platform_admin()
$$;

comment on function public.current_user_is_operator() is
  'True for AX staff. False for a client login. The gate between the two.';

create or replace function public.viewer_athlete_ids()
returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select athlete_id from user_athlete_links where user_id = auth.uid()
$$;

create or replace function public.viewer_product_ids()
returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select distinct pa.product_id
  from product_athletes pa
  where pa.athlete_id in (select athlete_id from user_athlete_links where user_id = auth.uid())
$$;

create or replace function public.viewer_team_ids()
returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select a.current_team_id
  from athletes a
  where a.id in (select athlete_id from user_athlete_links where user_id = auth.uid())
    and a.current_team_id is not null
  union
  select tm.team_id
  from team_memberships tm
  where tm.athlete_id in (select athlete_id from user_athlete_links where user_id = auth.uid())
$$;

-- The portal's blank picker already filters on these two flags. Putting them in
-- the policy means an internal-only blank is not merely hidden by the UI.
create or replace function public.viewer_blank_ids()
returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select b.id
  from blanks b
  where coalesce(b.sellable_as_blank, false) = true
    and coalesce(b.internal_only, false) = false
    and b.organization_id = public.current_user_org_id()
$$;

grant execute on function public.current_user_is_operator() to authenticated;
grant execute on function public.viewer_athlete_ids() to authenticated;
grant execute on function public.viewer_product_ids() to authenticated;
grant execute on function public.viewer_team_ids() to authenticated;
grant execute on function public.viewer_blank_ids() to authenticated;

-- ── existing org policies gain an operator gate ────────────────────────
--
-- ALTER rather than DROP + CREATE: the org clause is preserved exactly as it
-- was, so an admin of one org still cannot reach another org's rows. The only
-- change is that a non-operator no longer matches.

alter policy "org read athletes" on public.athletes
  using (current_user_is_operator() and is_org_accessible(organization_id));
alter policy "org write athletes" on public.athletes
  using (current_user_is_operator() and is_org_accessible(organization_id))
  with check (current_user_is_operator() and is_org_accessible(organization_id));

alter policy "org read designs" on public.designs
  using (current_user_is_operator() and is_org_accessible(organization_id));
alter policy "org write designs" on public.designs
  using (current_user_is_operator() and is_org_accessible(organization_id))
  with check (current_user_is_operator() and is_org_accessible(organization_id));

alter policy "org read design files" on public.design_files
  using (current_user_is_operator() and exists (
    select 1 from designs d where d.id = design_files.design_id and is_org_accessible(d.organization_id)));
alter policy "org write design files" on public.design_files
  using (current_user_is_operator() and exists (
    select 1 from designs d where d.id = design_files.design_id and is_org_accessible(d.organization_id)));

alter policy "org read design athletes" on public.design_athletes
  using (current_user_is_operator() and exists (
    select 1 from designs d where d.id = design_athletes.design_id and is_org_accessible(d.organization_id)));
alter policy "org write design athletes" on public.design_athletes
  using (current_user_is_operator() and exists (
    select 1 from designs d where d.id = design_athletes.design_id and is_org_accessible(d.organization_id)));

alter policy "mockups_org_access" on public.mockups
  using (current_user_is_operator() and is_org_accessible(organization_id))
  with check (current_user_is_operator() and is_org_accessible(organization_id));

alter policy "org read products" on public.products
  using (current_user_is_operator() and is_org_accessible(organization_id));
alter policy "org write products" on public.products
  using (current_user_is_operator() and is_org_accessible(organization_id))
  with check (current_user_is_operator() and is_org_accessible(organization_id));

alter policy "Variants visible to product's org or platform admin" on public.product_variants
  using (current_user_is_operator() and exists (
    select 1 from products p where p.id = product_variants.product_id and is_org_accessible(p.organization_id)));

alter policy "org read product athletes" on public.product_athletes
  using (current_user_is_operator() and exists (
    select 1 from products p where p.id = product_athletes.product_id and is_org_accessible(p.organization_id)));
alter policy "org write product athletes" on public.product_athletes
  using (current_user_is_operator() and exists (
    select 1 from products p where p.id = product_athletes.product_id and is_org_accessible(p.organization_id)));

alter policy "org read collections" on public.collections
  using (current_user_is_operator() and is_org_accessible(organization_id));
alter policy "org write collections" on public.collections
  using (current_user_is_operator() and is_org_accessible(organization_id))
  with check (current_user_is_operator() and is_org_accessible(organization_id));

alter policy "org read product collections" on public.product_collections
  using (current_user_is_operator() and exists (
    select 1 from products p where p.id = product_collections.product_id and is_org_accessible(p.organization_id)));
alter policy "org write product collections" on public.product_collections
  using (current_user_is_operator() and exists (
    select 1 from products p where p.id = product_collections.product_id and is_org_accessible(p.organization_id)))
  with check (current_user_is_operator() and exists (
    select 1 from products p where p.id = product_collections.product_id and is_org_accessible(p.organization_id)));

alter policy "org read blanks" on public.blanks
  using (current_user_is_operator() and is_org_accessible(organization_id));
alter policy "org write blanks" on public.blanks
  using (current_user_is_operator() and is_org_accessible(organization_id))
  with check (current_user_is_operator() and is_org_accessible(organization_id));

alter policy "org read blank sizes" on public.blank_sizes
  using (current_user_is_operator() and exists (
    select 1 from blanks b where b.id = blank_sizes.blank_id and is_org_accessible(b.organization_id)));
alter policy "org write blank sizes" on public.blank_sizes
  using (current_user_is_operator() and exists (
    select 1 from blanks b where b.id = blank_sizes.blank_id and is_org_accessible(b.organization_id)));

alter policy "org read blank colors" on public.blank_colors
  using (current_user_is_operator() and exists (
    select 1 from blanks b where b.id = blank_colors.blank_id and is_org_accessible(b.organization_id)));
alter policy "org write blank colors" on public.blank_colors
  using (current_user_is_operator() and exists (
    select 1 from blanks b where b.id = blank_colors.blank_id and is_org_accessible(b.organization_id)));

alter policy "org read teams" on public.teams
  using (current_user_is_operator() and is_org_accessible(organization_id));
alter policy "org write teams" on public.teams
  using (current_user_is_operator() and is_org_accessible(organization_id))
  with check (current_user_is_operator() and is_org_accessible(organization_id));

alter policy "org read memberships" on public.team_memberships
  using (current_user_is_operator() and is_org_accessible(organization_id));
alter policy "org write memberships" on public.team_memberships
  using (current_user_is_operator() and is_org_accessible(organization_id))
  with check (current_user_is_operator() and is_org_accessible(organization_id));

alter policy "tasks_org_access" on public.tasks
  using (current_user_is_operator() and is_org_accessible(organization_id))
  with check (current_user_is_operator() and is_org_accessible(organization_id));

alter policy "org read pricing config" on public.org_pricing_config
  using (current_user_is_operator() and is_org_accessible(organization_id));

alter policy "org read tiers" on public.volume_discount_tiers
  using (current_user_is_operator() and is_org_accessible(organization_id));

alter policy "read global or org curves" on public.size_distribution_curves
  using (current_user_is_operator() and (organization_id is null or is_org_accessible(organization_id)));

-- ── what a client may read, and nothing more ───────────────────────────
--
-- One SELECT policy per table the portal reads directly, each scoped to the
-- athletes the viewer is linked to. There are no client write policies here on
-- purpose: a client's writes all land in tables that already have their own
-- viewer-scoped policies (bulk_order_requests, bulk_order_items, saved_items,
-- portal_messages, portal_hidden_products, athlete_follows).
--
-- designs, design_files, mockups, tasks and size_distribution_curves get no
-- client policy at all. The portal reaches design work only through
-- client_design_shelf(), which is SECURITY DEFINER and applies
-- design_client_visible() itself -- so the shelf keeps working while a direct
-- REST call against designs returns an empty set.

create or replace function public.viewer_collection_ids()
returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select distinct pc.collection_id
  from product_collections pc
  where pc.product_id in (
    select pa.product_id from product_athletes pa
    where pa.athlete_id in (select athlete_id from user_athlete_links where user_id = auth.uid())
  )
$$;

grant execute on function public.viewer_collection_ids() to authenticated;

create policy "client reads own athlete" on public.athletes
  for select to authenticated
  using (id in (select viewer_athlete_ids()));

create policy "client reads own teams" on public.teams
  for select to authenticated
  using (id in (select viewer_team_ids()));

create policy "client reads own memberships" on public.team_memberships
  for select to authenticated
  using (athlete_id in (select viewer_athlete_ids()));

create policy "client reads own products" on public.products
  for select to authenticated
  using (id in (select viewer_product_ids()));

create policy "client reads own product athletes" on public.product_athletes
  for select to authenticated
  using (athlete_id in (select viewer_athlete_ids()));

create policy "client reads own product variants" on public.product_variants
  for select to authenticated
  using (product_id in (select viewer_product_ids()));

-- Needed by the era storefront: a collection is visible to a client when it
-- holds at least one of their own products.
create policy "client reads own collections" on public.collections
  for select to authenticated
  using (id in (select viewer_collection_ids()));

create policy "client reads own product collections" on public.product_collections
  for select to authenticated
  using (product_id in (select viewer_product_ids()));

-- The blank catalogue, minus anything internal. viewer_blank_ids() enforces
-- sellable_as_blank and not internal_only in the policy itself.
create policy "client reads sellable blanks" on public.blanks
  for select to authenticated
  using (id in (select viewer_blank_ids()));

create policy "client reads sellable blank sizes" on public.blank_sizes
  for select to authenticated
  using (blank_id in (select viewer_blank_ids()));

create policy "client reads sellable blank colors" on public.blank_colors
  for select to authenticated
  using (blank_id in (select viewer_blank_ids()));

-- Their own organisation's pricing. In AX's model each client has their own
-- organisation, so this is their own markup and their own discount ladder.
create policy "client reads own pricing config" on public.org_pricing_config
  for select to authenticated
  using (organization_id = current_user_org_id());

create policy "client reads own tiers" on public.volume_discount_tiers
  for select to authenticated
  using (organization_id = current_user_org_id());

-- usePortalStats counts designs attributed to them. The join row only, never
-- the design itself.
create policy "client reads own design links" on public.design_athletes
  for select to authenticated
  using (athlete_id in (select viewer_athlete_ids()));

-- ── the same hole, everywhere else ─────────────────────────────────────
--
-- The tables above are the ones the portal touches. An audit of the whole
-- schema found 80 more policies across 48 further tables with the identical
-- bare is_org_accessible() shape: asset_briefs, design_submissions,
-- design_templates, drops, drop_products, pricing_rules, revenue_splits,
-- system_prompts, prompt_packages, product_images, v2_blanks, v2_blank_colors,
-- v2_blank_images, brand_assets, collection_designs, task_activity and the
-- rest. None of them is read by the portal, so none needs a client policy --
-- they only need the gate.
--
-- Generated rather than transcribed: the loop wraps each existing expression
-- in the operator gate and leaves it otherwise byte-identical, so no org
-- boundary is rewritten by hand and nothing is dropped. It is idempotent --
-- a policy that already mentions the gate, an admin check, user_athlete_links
-- or a viewer_* helper is skipped.
do $$
declare
  r record;
  gate text := 'current_user_is_operator()';
  stmt text;
  n int := 0;
begin
  for r in
    select c.relname as tbl, p.polname,
           pg_get_expr(p.polqual, p.polrelid)      as q,
           pg_get_expr(p.polwithcheck, p.polrelid) as w
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace nsp on nsp.oid = c.relnamespace
    where nsp.nspname = 'public'
      and c.relname <> 'user_profiles'   -- handled below: it keeps a self-read
      and (coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%is_org_accessible%'
        or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') like '%is_org_accessible%')
      and coalesce(pg_get_expr(p.polqual, p.polrelid), '')      not like '%current_user_is_operator%'
      and coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') not like '%current_user_is_operator%'
      and coalesce(pg_get_expr(p.polqual, p.polrelid), '')      not like '%current_user_is_admin%'
      and coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') not like '%current_user_is_admin%'
      and coalesce(pg_get_expr(p.polqual, p.polrelid), '')      not like '%user_athlete_links%'
      and coalesce(pg_get_expr(p.polqual, p.polrelid), '')      not like '%viewer_%'
  loop
    stmt := format('alter policy %I on public.%I', r.polname, r.tbl);
    if r.q is not null then stmt := stmt || format(' using (%s and (%s))', gate, r.q); end if;
    if r.w is not null then stmt := stmt || format(' with check (%s and (%s))', gate, r.w); end if;
    execute stmt;
    n := n + 1;
  end loop;
  raise notice 'operator gate added to % policies', n;
end $$;

-- user_profiles keeps its self-read: a client must be able to load their own
-- profile row (useTasks and the auth bootstrap both read it by auth.uid()).
-- Only the org-wide listing becomes operator-only, so a client can no longer
-- enumerate AX staff.
alter policy "Users see profiles in own org" on public.user_profiles
  using ((current_user_is_operator() and is_org_accessible(organization_id)) or id = auth.uid());

-- ── what this was verified against ─────────────────────────────────────
--
-- Impersonating cclarke4@alumni.nd.edu (role admin, is_platform_admin false --
-- the weakest operator) with request.jwt.claims set and role authenticated:
--   operator true, designs 97, mockups 47, products 175, athletes 8,
--   blanks 48, v2_blanks 13, user_profiles 3.  Unchanged.
--
-- Evaluating the client predicates for a login linked to Darnell Mooney:
--   athletes 1 (him, not 8), products 36 (his, not 175), team_memberships 2,
--   blanks 36 (the sellable ones, not 48), designs 0, mockups 0.
--
-- product_variants, product_collections, org_pricing_config and
-- volume_discount_tiers return 0 rows for him because those tables hold no
-- rows for his org yet, not because the policy denies them.
