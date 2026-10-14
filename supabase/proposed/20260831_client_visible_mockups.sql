-- ============================================================================
-- PROPOSAL v3 — NOT APPLIED. Requires Chase's sign-off before it runs.
--
-- Lives in supabase/proposed/, not supabase/migrations/, so nothing that
-- applies migrations can pick it up.
--
-- v2 followed an adversarial review of v1. Three defects were found IN V1
-- ITSELF, and one that predates it. They are marked [FIX n] below.
--
-- v3 removes the prerequisite section, which has since been APPLIED on its own
-- as migration `harden_user_athlete_links_write_policy` (31 Aug 2026). What
-- remains below is the mockup work only, and it is still unapplied.
--
-- GOAL
--   An athlete/client session can read ONLY the mockups that
--     (a) belong to an entity they are permitted to act for, and
--     (b) are explicitly marked client_visible,
--   and of those, only the flattened composite image.
-- ============================================================================


-- ============================================================================
-- 0. PREREQUISITE — APPLIED SEPARATELY, 31 AUG 2026. NOT PART OF THIS FILE.
--
-- `user_athlete_links` was self-assignable: its write policy checked that the
-- USER row was org-accessible and never checked the ATHLETE, so any
-- authenticated user with a profile could insert (user_id = themselves,
-- athlete_id = anything) and become linked to any athlete. Demonstrated against
-- the live database before the fix, blocked after it.
--
-- That mattered beyond this proposal: user_athlete_links is the permission
-- source for the live `design-previews client read` storage policy, for
-- portal_hidden_products and for several portal views.
--
-- Applied as migration `harden_user_athlete_links_write_policy`. Writes now
-- additionally require current_user_is_admin() OR current_user_is_platform_admin().
-- Reads are untouched. Everything below ASSUMES that fix is in place; without
-- it, none of the following is a security boundary.
-- ============================================================================


-- ============================================================================
-- 1. THE PREDICATE — [FIX 1] OFF THE API, AND BOUND TO THE CALLER
--
-- v1 put `mockup_client_visible(_mockup_id, _athlete_id)` in `public` as a
-- SECURITY DEFINER function. Two problems, both real:
--
--   * PostgREST exposes every function in `public` as an RPC endpoint. The
--     live design_client_visible() has `=X/postgres` in its ACL — EXECUTE to
--     PUBLIC — so it is callable right now by anon. v1 would have shipped the
--     same thing.
--   * Taking an arbitrary _athlete_id makes it an oracle: POST
--     /rest/v1/rpc/mockup_client_visible with any pair and learn whether that
--     mockup is shared with that athlete, in any tenant.
--
-- v2 puts it in a schema PostgREST does not expose (the exposed set is
-- `public, graphql_public`), and drops the athlete argument entirely: the
-- function resolves the caller's own links from auth.uid(). It can now only
-- answer "may I see this", which the caller could determine anyway by asking
-- for it.
-- ============================================================================

create schema if not exists ax_private;
revoke all on schema ax_private from public;
grant usage on schema ax_private to authenticated;

create or replace function ax_private.mockup_client_visible(_mockup_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from mockups m
    join user_athlete_links ual
      on ual.athlete_id = m.athlete_id
     and ual.user_id = auth.uid()
    where m.id = _mockup_id
      and m.kind = 'concept'
      and m.client_visible
      and m.lifecycle <> 'archived'
  )
$$;

comment on function ax_private.mockup_client_visible(uuid) is
  'May the CALLER see this mockup? Deliberately not in `public`: functions there are RPC endpoints, and a two-argument version would be a cross-tenant oracle.';

revoke all on function ax_private.mockup_client_visible(uuid) from public;
grant execute on function ax_private.mockup_client_visible(uuid) to authenticated;


-- ============================================================================
-- 2. THE READ SURFACE — A VIEW, NOT A POLICY ON `mockups`
--
-- NO policy is added to public.mockups. The operator table keeps exactly the
-- access it has today (mockups_org_access, authenticated, is_org_accessible).
--
-- Columns deliberately NOT exposed:
--   design_id, blank_id, v2_blank_id      -- lineage into production artwork
--   description / notes                   -- internal commentary
--   approval_state, lifecycle, sort_order -- operator workflow state
--   folder_id, collection_id, product_id  -- internal filing
--   guides, created_from                  -- build metadata
--
-- [FIX 2] `image_url` is gone. v1 exposed it. It is uncontrolled free text on
-- an operator table — today it holds either a composite URL or the blank's
-- public catalogue photo, but nothing constrains it, and a client surface
-- should not render a column whose contents are not structurally guaranteed.
-- Dropping it also fixes a product bug: a mockup with no rendered composite
-- would have shown the client an empty garment. Now it shows nothing, which is
-- true, and the operator already gets warned at the moment they share it.
--
-- blank_name is v2_blanks.display_name ONLY. `name` is the MANUFACTURER's and
-- must never reach a client surface (AX_V2_NAMING.md). Null when unset; the UI
-- shows nothing rather than falling back.
--
-- security_barrier: the view runs with its owner's rights, so without it a
-- caller-supplied function in a WHERE clause could be evaluated before the
-- view's filter and leak rows. `authenticated` cannot CREATE in `public` on
-- this database, so that vector is closed today — this keeps it closed if that
-- ever changes.
-- ============================================================================

create or replace view public.client_mockups
with (security_barrier = true) as
select
  m.id,
  m.athlete_id,
  m.title,
  m.color_name,
  b.display_name as blank_name,
  -- The flattened composite in the private `mockups` bucket. Nothing else.
  m.storage_bucket,
  m.storage_path,
  m.created_at,
  m.updated_at
from public.mockups m
left join public.v2_blanks b on b.id = m.v2_blank_id
where m.kind = 'concept'
  and m.client_visible
  and m.lifecycle <> 'archived'
  and exists (
    select 1
    from public.user_athlete_links ual
    where ual.user_id = auth.uid()
      and ual.athlete_id = m.athlete_id
  );

comment on view public.client_mockups is
  'Client-facing mockups: only client_visible, non-archived concepts for an athlete the caller is linked to. No design lineage, no internal state, no free-text image URL.';

-- [FIX 3] REVOKE FROM `authenticated`, NOT JUST `public` AND `anon`.
--
-- Supabase default privileges grant ALL on new objects in `public` to anon and
-- authenticated. Every existing public_* view in this database carries
-- INSERT/UPDATE/DELETE for both roles — verified. v1 revoked from `public` and
-- `anon` and then granted SELECT to authenticated, which would have left
-- authenticated holding write privileges on an owner-rights view.
--
-- The LEFT JOIN makes this view non-auto-updatable today, so those writes would
-- error rather than reach `mockups`. That is luck, not design: remove the join
-- and it silently becomes a write path into an RLS-protected table.
revoke all on public.client_mockups from public;
revoke all on public.client_mockups from anon;
revoke all on public.client_mockups from authenticated;
grant select on public.client_mockups to authenticated;


-- ============================================================================
-- 3. STORAGE — [FIX 4] THE COMPOSITE, BY NAME, NOT "THE FOLDER"
--
-- v1 allowed reading ANY object under a client-visible mockup's folder. The
-- assumption behind that — "the bucket holds one thing, the composite" — is
-- false: the `mockups` bucket currently holds 48 objects and ZERO of them are
-- composites. They are `<uuid>/<uuid>.png` uploads from V1's mockup photo
-- library. The org write policy lets an operator put any file under any mockup
-- folder, so "the folder" is not a safe unit.
--
-- This matches the exact name storeMockupComposite() writes:
--     <mockup-uuid>/composite-<epoch-ms>.jpg
--
-- The regexp also guards the ::uuid cast: storage.foldername(name)[1]::uuid
-- RAISES on a non-UUID first segment rather than returning false, which would
-- turn one stray object into an error for every caller of this policy.
--
-- ADDITIVE. The four existing org policies are untouched. Permissive policies
-- are OR'ed, so this adds one narrow alternative path and cannot widen or
-- alter theirs.
-- ============================================================================

create policy "mockups client read composite"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'mockups'
  and name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/composite-[0-9]+\.jpg$'
  and ax_private.mockup_client_visible(((storage.foldername(name))[1])::uuid)
);


-- ============================================================================
-- WHAT THIS DOES NOT DO — stated so it can be checked rather than assumed
--
--   * No policy on public.mockups. Operator access is unchanged.
--   * No policy on product_print_placements. A client never sees placement
--     geometry, so never has a reason to fetch a design file.
--   * No policy on designs, design_files, or the `design-files` bucket.
--     Production artwork stays exactly as unreachable as it is now.
--   * No grant to `anon` anywhere. A signed-out visitor gets nothing.
--   * Admin impersonation (?as=<athlete_id>) does NOT match the view — an
--     admin is not in user_athlete_links. "Preview as client" therefore reads
--     through the operator query. That is deliberate: teaching a security
--     boundary about impersonation is how boundaries grow holes.
--
-- KNOWN AND ACCEPTED: SIGNED URLS OUTLIVE REVOCATION
--   Toggling client_visible off, or archiving, takes effect on the next query
--   — both the view and the storage policy are evaluated per request. But a
--   signed URL already handed to a browser is an HMAC token that the storage
--   API validates WITHOUT re-checking RLS. It stays valid until it expires.
--   The app currently signs for 3600s, so a mockup un-shared at 10:00 can be
--   re-fetched with an existing link until 11:00.
--   REQUIRED FOLLOW-UP (app change, not in this file):
--   src/hooks/useClientMockups.ts createSignedUrls(paths, 3600) -> 300.
--   Un-sharing is not a takedown mechanism and should not be described as one.
--
-- ROLLBACK
--   drop policy "mockups client read composite" on storage.objects;
--   drop view public.client_mockups;
--   drop function ax_private.mockup_client_visible(uuid);
--   drop schema ax_private;
--   -- and, if the prerequisite is being reverted, restore the original
--   -- "org write user athlete links" USING expression.
-- ============================================================================
