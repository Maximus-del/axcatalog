-- BLANK CATALOG IN THE CLIENT PORTAL
--
-- Owners browse AX's approved blanks (v2_blanks with a client-facing name and
-- a tier price) at THEIR price, and request one for their shop. AX turns the
-- request into a product. Cost never leaves the database; the manufacturer's
-- name is never shown (display_name only).
--
-- Tier: athletes.metadata.pricing_tier ('athlete' | 'corporate' | 'standard')
-- when set; otherwise a person is 'athlete' and anything else 'corporate'.
--
-- Additive only.

create or replace function public.portal_client_tier(_athlete_id uuid)
returns text language sql stable security definer set search_path to 'public' as $$
  select case
    when a.metadata ->> 'pricing_tier' in ('athlete', 'corporate', 'standard') then a.metadata ->> 'pricing_tier'
    when coalesce(a.entity_type, 'person') = 'person' then 'athlete'
    else 'corporate'
  end
  from athletes a where a.id = _athlete_id
$$;

create table if not exists public.blank_requests (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  organization_id uuid not null,
  blank_id uuid not null references public.v2_blanks(id) on delete cascade,
  color_ids uuid[] not null default '{}',
  quantity integer check (quantity is null or (quantity > 0 and quantity <= 10000)),
  notes text check (notes is null or length(notes) <= 1000),
  tier text not null,
  quoted_unit_price numeric,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'added', 'declined')),
  requested_by uuid not null default auth.uid(),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists blank_requests_athlete_idx on public.blank_requests(athlete_id, created_at desc);
alter table public.blank_requests enable row level security;

create policy "operators manage blank requests" on public.blank_requests for all
  using (public.current_user_is_operator() and public.is_org_accessible(organization_id))
  with check (public.current_user_is_operator() and public.is_org_accessible(organization_id));

-- The catalog, priced for this client. Owners only.
create or replace function public.portal_blank_catalog(_athlete_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  _aid uuid := public.portal_scope_athlete(_athlete_id);
  _tier text;
begin
  perform public.portal_require_owner(_aid);
  _tier := public.portal_client_tier(_aid);

  return jsonb_build_object(
    'tier', _tier,
    'blanks', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', b.id,
               'name', b.display_name,
               'type', b.garment_type,
               'price', case _tier when 'athlete' then b.price_athlete when 'corporate' then b.price_corporate else b.price_standard end,
               'retail', b.price_standard,
               'colors', coalesce((
                  select jsonb_agg(jsonb_build_object(
                           'id', c.id,
                           'name', coalesce(nullif(c.display_name, ''), c.name),
                           'hex', c.hex,
                           'available', coalesce(c.available, true),
                           'front', (select i.drive_file_id from v2_blank_images i where i.color_id = c.id and i.view_type = 'front' order by i.is_primary desc nulls last limit 1),
                           'back', (select i.drive_file_id from v2_blank_images i where i.color_id = c.id and i.view_type = 'back' order by i.is_primary desc nulls last limit 1))
                         order by c.sort_order nulls last, c.name)
                    from v2_blank_colors c where c.blank_id = b.id), '[]'::jsonb)
             ) order by array_position(array['tee','long_sleeve','crewneck','hoodie','zip_hoodie','shorts','sweatpants'], b.garment_type) nulls last, b.display_name)
        from v2_blanks b
       where nullif(trim(b.display_name), '') is not null
         and (case _tier when 'athlete' then b.price_athlete when 'corporate' then b.price_corporate else b.price_standard end) is not null
    ), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'blankId', r.blank_id, 'status', r.status, 'createdAt', r.created_at) order by r.created_at desc)
        from blank_requests r where r.athlete_id = _aid
    ), '[]'::jsonb)
  );
end
$$;
revoke all on function public.portal_blank_catalog(uuid) from public, anon;
grant execute on function public.portal_blank_catalog(uuid) to authenticated;

-- "Add to my shop". Owners only; read-only demo/View-as sessions are refused.
create or replace function public.portal_request_blank(_athlete_id uuid, _blank_id uuid, _color_ids uuid[], _quantity integer, _notes text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  _aid uuid := public.portal_scope_athlete(_athlete_id);
  _org uuid;
  _tier text;
  _price numeric;
  _id uuid;
begin
  perform public.portal_require_owner(_aid);
  if public.current_user_is_operator() then
    raise exception 'AX staff can''t request on a client''s behalf from View-as.' using errcode = '42501';
  end if;
  if coalesce((select (raw_user_meta_data ->> 'ax_demo')::boolean from auth.users where id = auth.uid()), false) then
    raise exception 'This is a read-only demo.' using errcode = '42501';
  end if;
  select organization_id into _org from athletes where id = _aid;
  _tier := public.portal_client_tier(_aid);
  select case _tier when 'athlete' then price_athlete when 'corporate' then price_corporate else price_standard end
    into _price from v2_blanks where id = _blank_id and nullif(trim(display_name), '') is not null;
  if _price is null then
    raise exception 'That blank isn''t in the catalog.' using errcode = 'P0002';
  end if;
  insert into blank_requests (athlete_id, organization_id, blank_id, color_ids, quantity, notes, tier, quoted_unit_price)
  values (_aid, _org, _blank_id,
          coalesce((select array_agg(c.id) from v2_blank_colors c where c.blank_id = _blank_id and c.id = any(coalesce(_color_ids, '{}'))), '{}'),
          _quantity, nullif(trim(_notes), ''), _tier, _price)
  returning id into _id;
  return jsonb_build_object('id', _id, 'status', 'pending');
end
$$;
revoke all on function public.portal_request_blank(uuid, uuid, uuid[], integer, text) from public, anon;
grant execute on function public.portal_request_blank(uuid, uuid, uuid[], integer, text) to authenticated;
