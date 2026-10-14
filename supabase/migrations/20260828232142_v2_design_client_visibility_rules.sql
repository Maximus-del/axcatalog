-- THE rule for "may this client see this design", in one place.
--
-- A group is a CEILING, not a default: a design is visible only if it is itself
-- marked visible AND its group (if any) is too. Rationale — an operator who
-- hides a folder must be able to trust that nothing inside it leaks, and
-- promoting a folder must never silently expose a design they deliberately hid.
--
-- Both the storage policy and the client read path call this, so they cannot
-- drift apart.
create or replace function public.design_client_visible(_design_id uuid, _athlete_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from design_athletes da
    left join design_collections g on g.id = da.group_id
    where da.design_id = _design_id
      and da.athlete_id = _athlete_id
      and da.client_visibility = 'preview'
      and (da.group_id is null or g.client_visibility = 'preview')
  )
$function$;

comment on function public.design_client_visible(uuid, uuid) is
  'AX OS V2. Effective client visibility of a design for one entity. Group visibility is a ceiling over the per-design setting.';

-- The storage policy resolves an object name back to its design_files row.
create index if not exists design_files_bucket_path_idx
  on public.design_files (storage_bucket, storage_path);

-- Operators keep full control of the preview bucket.
drop policy if exists "design-previews admin all" on storage.objects;
create policy "design-previews admin all"
  on storage.objects
  for all
  using (
    bucket_id = 'design-previews'
    and (public.current_user_is_admin() or public.current_user_is_platform_admin())
  )
  with check (
    bucket_id = 'design-previews'
    and (public.current_user_is_admin() or public.current_user_is_platform_admin())
  );

-- A client may read a preview only for a design that is (a) linked to an entity
-- they are linked to and (b) effectively visible. Mirrors the existing
-- product_videos_storage_athlete_read pattern.
--
-- Note what is NOT here: no policy grants any client access to `design-files`.
-- The production asset is unreachable from a client session by construction,
-- not by the absence of a button.
drop policy if exists "design-previews client read" on storage.objects;
create policy "design-previews client read"
  on storage.objects
  for select
  using (
    bucket_id = 'design-previews'
    and exists (
      select 1
      from public.design_files df
      where df.storage_bucket = 'design-previews'
        and df.storage_path = storage.objects.name
        and df.file_type = 'preview'
        and exists (
          select 1
          from public.user_athlete_links ual
          where ual.user_id = auth.uid()
            and public.design_client_visible(df.design_id, ual.athlete_id)
        )
    )
  );
