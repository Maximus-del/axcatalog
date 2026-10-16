-- ============================================================================
-- Portal stage 8 — product pictures from the Drive master library.
--
-- A product can name Drive folders as its picture source
-- (products.metadata.drive.sources). The edge function
-- drive-sync-product-images lists those folders and mirrors the showcase
-- images into product_images (metadata.source = 'drive'). When a product has
-- Drive pictures, the portal shows those instead of Shopify's.
--
-- 1. portal_drive_targets(_athlete_id, _product_id, _force)
--      Which of this client's products are due a Drive sync. Authorised by
--      portal_scope_athlete (client: own athlete; operator: org access).
--      Claims the sync by stamping synced_at, so two open tabs cannot run the
--      same sync at once, and nobody can make it run more than every 3 minutes
--      — except an operator pressing "Sync now".
--
-- 2. portal_ops_set_drive_sources(_product_id, _sources)
--      Operator-only, org-scoped. Sets the folders. Clears synced_at so the
--      next sync runs straight away.
--
-- 3. portal_drive_record(_product_id, _result)
--      Service role only: the edge function records the outcome.
--
-- Additive. No table changes. Paste into Supabase > SQL Editor and Run.
-- Safe to run twice.
-- ============================================================================

-- 1 -------------------------------------------------------------------------
create or replace function public.portal_drive_targets(_athlete_id uuid, _product_id uuid default null, _force boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  _aid uuid := public.portal_scope_athlete(_athlete_id);
  _op boolean := public.current_user_is_operator();
  _now timestamptz := now();
  _items jsonb;
begin
  if _aid is null then
    raise exception 'Not found' using errcode = 'P0002';
  end if;

  with due as (
    select p.id
    from products p
    join product_athletes pa on pa.product_id = p.id and pa.athlete_id = _aid
    where jsonb_typeof(p.metadata -> 'drive' -> 'sources') = 'array'
      and jsonb_array_length(p.metadata -> 'drive' -> 'sources') > 0
      and (_product_id is null or p.id = _product_id)
      and (_op or p.status::text in ('published', 'archived'))
      and ((_force and _op)
           or coalesce((p.metadata -> 'drive' ->> 'synced_at')::timestamptz, '-infinity'::timestamptz) < _now - interval '3 minutes')
    for update of p skip locked
  ), claimed as (
    update products p
    set metadata = jsonb_set(coalesce(p.metadata, '{}'::jsonb), '{drive,synced_at}', to_jsonb(_now), true)
    from due
    where p.id = due.id
    returning p.id, p.metadata -> 'drive' -> 'sources' as sources
  )
  select coalesce(jsonb_agg(jsonb_build_object('productId', c.id, 'sources', c.sources)), '[]'::jsonb)
  into _items
  from claimed c;

  return jsonb_build_object('items', _items);
end $$;

revoke all on function public.portal_drive_targets(uuid, uuid, boolean) from public, anon;
grant execute on function public.portal_drive_targets(uuid, uuid, boolean) to authenticated, service_role;

-- 2 -------------------------------------------------------------------------
create or replace function public.portal_ops_set_drive_sources(_product_id uuid, _sources jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  _org uuid;
  _clean jsonb := '[]'::jsonb;
  _e jsonb;
  _id text;
  _label text;
  _seen text[] := '{}';
begin
  perform public.portal_ops_guard();

  select organization_id into _org from products where id = _product_id;
  if _org is null or not public.is_org_accessible(_org) then
    raise exception 'Product not found' using errcode = 'P0002';
  end if;

  if _sources is null or jsonb_typeof(_sources) <> 'array' then
    raise exception 'Sources must be a list' using errcode = 'P0422';
  end if;
  if jsonb_array_length(_sources) > 12 then
    raise exception 'Up to 12 Drive folders per product' using errcode = 'P0422';
  end if;

  for _e in select value from jsonb_array_elements(_sources) loop
    _id := trim(coalesce(_e ->> 'id', ''));
    _label := nullif(left(trim(coalesce(_e ->> 'label', '')), 60), '');
    if _id !~ '^[A-Za-z0-9_-]{10,100}$' then
      raise exception 'That is not a Drive folder id: %', left(_id, 40) using errcode = 'P0422';
    end if;
    if _id = any(_seen) then continue; end if;
    _seen := _seen || _id;
    _clean := _clean || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('id', _id, 'label', _label)));
  end loop;

  update products
  set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{drive}',
                           (coalesce(metadata -> 'drive', '{}'::jsonb) - 'synced_at') || jsonb_build_object('sources', _clean), true)
  where id = _product_id;

  return (select coalesce(metadata -> 'drive', '{}'::jsonb) from products where id = _product_id);
end $$;

revoke all on function public.portal_ops_set_drive_sources(uuid, jsonb) from public, anon;
grant execute on function public.portal_ops_set_drive_sources(uuid, jsonb) to authenticated;

-- 3 -------------------------------------------------------------------------
create or replace function public.portal_drive_record(_product_id uuid, _result jsonb)
returns void
language sql
volatile
security definer
set search_path to 'public'
as $$
  update products
  set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{drive}',
                           coalesce(metadata -> 'drive', '{}'::jsonb)
                           || jsonb_build_object(
                                'synced_at', now(),
                                'shown', coalesce((_result ->> 'shown')::int, 0),
                                'error', _result -> 'error'),
                           true)
  where id = _product_id
$$;

revoke all on function public.portal_drive_record(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.portal_drive_record(uuid, jsonb) to service_role;
