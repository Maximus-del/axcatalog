-- The ONLY sanctioned client-facing read path for designs.
--
-- The security property here is structural, not procedural: production bucket
-- and path are not in the return type. There is no argument, no flag and no
-- crafted PostgREST filter that makes this function emit a `design-files`
-- location, because it has nowhere to put one.
--
-- The athlete dashboard is not built against this yet — that is the next pass.
-- Shipping the contract first means the dashboard has one obvious door to walk
-- through instead of reaching into `designs` directly.
create or replace function public.client_design_shelf(_athlete_id uuid)
returns table (
  design_id uuid,
  title text,
  design_number text,
  group_id uuid,
  group_name text,
  sort_order integer,
  preview_paths text[]
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    d.id as design_id,
    coalesce(nullif(btrim(d.title), ''), 'Untitled design') as title,
    -- Stable, shareable short code. Clients quote a number, not a UUID, and not
    -- a generator filename like 'ChatGPT Image Aug 16, 2026, 03 11 02 PM (1)'.
    upper(substr(replace(d.id::text, '-', ''), 1, 6)) as design_number,
    da.group_id,
    g.name as group_name,
    da.sort_order,
    coalesce(
      (
        select array_agg(df.storage_path order by df.sort_order, df.created_at)
        from design_files df
        where df.design_id = d.id
          and df.file_type = 'preview'
          and df.storage_bucket = 'design-previews'
      ),
      array[]::text[]
    ) as preview_paths
  from design_athletes da
  join designs d on d.id = da.design_id
  left join design_collections g on g.id = da.group_id
  where da.athlete_id = _athlete_id
    and public.design_client_visible(d.id, da.athlete_id)
    -- The caller must actually be this entity, or an operator.
    and (
      exists (
        select 1 from user_athlete_links ual
        where ual.user_id = auth.uid() and ual.athlete_id = _athlete_id
      )
      or public.current_user_is_admin()
      or public.current_user_is_platform_admin()
    )
  order by g.sort_order nulls last, da.sort_order, d.created_at
$function$;

comment on function public.client_design_shelf(uuid) is
  'AX OS V2. Client-safe design shelf for one entity. Returns preview paths only — production artwork locations are structurally absent from the return type.';

revoke all on function public.client_design_shelf(uuid) from public, anon;
grant execute on function public.client_design_shelf(uuid) to authenticated;
