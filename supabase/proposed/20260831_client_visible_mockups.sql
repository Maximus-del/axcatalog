-- ============================================================================
-- PROPOSAL — NOT APPLIED. Requires Chase's sign-off before it runs.
--
-- Lives in supabase/proposed/, not supabase/migrations/, so it cannot be picked
-- up by anything that applies migrations.
--
-- GOAL
--   An athlete/client session can read ONLY the mockups that
--     (a) belong to an entity they are permitted to act for, and
--     (b) are explicitly marked client_visible.
--   Nothing else about the mockup, and no production artwork, becomes readable.
--
-- SHAPE
--   Mirrors the design-preview mechanism that is already live:
--     design_client_visible(design_id, athlete_id)  +  a storage policy on
--     `design-previews` gated through user_athlete_links.
--   Same idea, same permission source, same "the database is authoritative"
--   stance — src/lib/v2/visibility.ts predicts it, it does not enforce it.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. THE PREDICATE
--
-- One place that decides, so the view and the storage policy cannot disagree.
-- STABLE + SECURITY DEFINER exactly like design_client_visible().
--
-- `lifecycle <> 'archived'` is deliberate: archiving is how an operator gets
-- something out of the way, and it should get it out of the client's way too.
-- ---------------------------------------------------------------------------
create or replace function public.mockup_client_visible(_mockup_id uuid, _athlete_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from mockups m
    where m.id = _mockup_id
      and m.athlete_id = _athlete_id
      and m.kind = 'concept'
      and m.client_visible
      and m.lifecycle <> 'archived'
  )
$$;

comment on function public.mockup_client_visible(uuid, uuid) is
  'May this athlete/client see this mockup? The only definition. Mirrors design_client_visible().';


-- ---------------------------------------------------------------------------
-- 2. THE READ SURFACE — A VIEW, NOT A POLICY ON `mockups`
--
-- NO policy is added to public.mockups. The operator table keeps exactly the
-- access it has today (mockups_org_access, authenticated, is_org_accessible).
-- The only new read path is this view, and the only thing a client can select
-- is the columns named here.
--
-- Columns deliberately NOT exposed:
--   design_id, blank_id, v2_blank_id      -- lineage into production artwork
--   description / notes                   -- internal commentary
--   approval_state, lifecycle, sort_order -- operator workflow state
--   folder_id, collection_id, product_id  -- internal filing
--   guides, created_from                  -- build metadata
--
-- blank_name comes from v2_blanks.display_name ONLY. `name` is the
-- MANUFACTURER's name and must never reach a client surface — see
-- AX_V2_NAMING.md. Null when no client name has been set, and the UI shows
-- nothing rather than falling back.
--
-- This view runs with its owner's rights (the Postgres default), which is the
-- same shape as public_athletes / public_content / public_drops already in
-- this database. That makes the WHERE clause below the entire security
-- boundary, which is why it is four conditions and no joins that could widen.
-- ---------------------------------------------------------------------------
create or replace view public.client_mockups as
select
  m.id,
  m.athlete_id,
  m.title,
  m.color_name,
  b.display_name as blank_name,
  m.storage_bucket,
  m.storage_path,
  -- Only ever the flattened composite in the private `mockups` bucket, or the
  -- blank's own public catalogue photo. Never a design file.
  m.image_url,
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
  'Client-facing mockups: only client_visible, non-archived concepts for an athlete the caller is linked to. No design lineage, no internal state.';

revoke all on public.client_mockups from public;
revoke all on public.client_mockups from anon;
grant select on public.client_mockups to authenticated;


-- ---------------------------------------------------------------------------
-- 3. STORAGE — THE COMPOSITE, AND ONLY THE COMPOSITE
--
-- The `mockups` bucket is private and holds one thing: the flattened
-- <mockup_id>/composite-*.jpg written by storeMockupComposite(). Artwork lives
-- in `design-files`, which this touches in no way at all and which no
-- client-facing policy grants.
--
-- ADDITIVE. The four existing org policies are unchanged; this is a fifth,
-- SELECT-only.
--
-- The regexp guard is not decoration: storage.foldername(name)[1]::uuid RAISES
-- on a non-UUID first segment rather than returning false, which would turn one
-- stray object into an error for every caller.
-- ---------------------------------------------------------------------------
create policy "mockups client read"
on storage.objects
for select
using (
  bucket_id = 'mockups'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  and exists (
    select 1
    from public.user_athlete_links ual
    where ual.user_id = auth.uid()
      and public.mockup_client_visible(((storage.foldername(name))[1])::uuid, ual.athlete_id)
  )
);


-- ============================================================================
-- WHAT THIS DOES NOT DO — stated so it can be checked rather than assumed
--
--   * No policy on public.mockups. Operator access is unchanged.
--   * No policy on product_print_placements. A client never sees placement
--     geometry, which means never a reason to fetch a design file.
--   * No policy on designs, design_files, or the `design-files` bucket.
--     Transparent production artwork stays exactly as unreachable as it is now.
--   * No grant to `anon`. A signed-out visitor gets nothing.
--   * Admin impersonation (?as=<athlete_id>) does NOT match this view — an
--     admin is not in user_athlete_links. The operator "preview as client"
--     path therefore reads through the operator query, not this one. That is
--     the honest behaviour; the alternative is teaching the security boundary
--     about impersonation, which is how boundaries get holes.
--
-- ROLLBACK
--   drop policy "mockups client read" on storage.objects;
--   drop view public.client_mockups;
--   drop function public.mockup_client_visible(uuid, uuid);
-- ============================================================================
