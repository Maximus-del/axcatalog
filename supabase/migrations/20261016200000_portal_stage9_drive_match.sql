-- ============================================================================
-- Portal stage 9 — a Drive folder link can carry a file-name filter.
--
-- One garment folder can hold several editions of a design side by side
-- (MW-WRLD-ATL1_…, MW-WRLD-CHI11_…, MW-WRLD-NYG17_…). Each product links the
-- same folder with its own "match" (CHI11), and the sync shows only those
-- files. This redefines portal_ops_set_drive_sources so it keeps `match`
-- (it used to keep only id and label). Same guards as stage 8.
--
-- Additive. Paste into Supabase > SQL Editor and Run. Safe to run twice.
-- ============================================================================
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
  _match text;
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
    _match := nullif(upper(trim(coalesce(_e ->> 'match', ''))), '');
    if _id !~ '^[A-Za-z0-9_-]{10,100}$' then
      raise exception 'That is not a Drive folder id: %', left(_id, 40) using errcode = 'P0422';
    end if;
    if _match is not null and _match !~ '^[A-Z0-9#_ -]{1,40}$' then
      raise exception 'Use letters, numbers, # - or _ in the file filter' using errcode = 'P0422';
    end if;
    -- The same folder may appear twice with different filters, not twice with the same one.
    if (_id || '|' || coalesce(_match, '')) = any(_seen) then continue; end if;
    _seen := _seen || (_id || '|' || coalesce(_match, ''));
    _clean := _clean || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('id', _id, 'label', _label, 'match', _match)));
  end loop;

  update products
  set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{drive}',
                           (coalesce(metadata -> 'drive', '{}'::jsonb) - 'synced_at') || jsonb_build_object('sources', _clean), true)
  where id = _product_id;

  return (select coalesce(metadata -> 'drive', '{}'::jsonb) from products where id = _product_id);
end $$;

revoke all on function public.portal_ops_set_drive_sources(uuid, jsonb) from public, anon;
grant execute on function public.portal_ops_set_drive_sources(uuid, jsonb) to authenticated;
