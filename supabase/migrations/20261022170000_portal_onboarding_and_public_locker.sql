-- ONBOARDING ANSWERS + THE PUBLIC LOCKER
--
-- 1. Someone who signs up through an invite answers a short questionnaire
--    while their request waits. The answers sit on their access request, so
--    the operator sees them when deciding (and which role to grant), and the
--    portal reads them back afterwards (their size pre-fills orders).
--
-- 2. public_locker(slug): the signed-out storefront for one entity. Retail
--    price only -- wholesale, athlete price and cost never leave the database
--    through it. Off until an operator switches it on per entity
--    (athletes.metadata.public_locker.enabled), and it honours public_date
--    and the entity's hidden-products list.
--
-- Additive only.

alter table public.portal_access_requests
  add column if not exists onboarding jsonb,
  add column if not exists onboarded_at timestamptz;

-- The requester may write their OWN answers -- nothing else on the row.
create or replace function public.portal_save_onboarding(_athlete_id uuid, _answers jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  _email text;
  _org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if _answers is null or jsonb_typeof(_answers) <> 'object' or length(_answers::text) > 8000 then
    raise exception 'answers must be a small object' using errcode = '22023';
  end if;

  update portal_access_requests
     set onboarding = _answers, onboarded_at = now()
   where user_id = auth.uid() and athlete_id = _athlete_id;
  if found then return; end if;

  -- Logins made by hand (no request row) can still answer once they are in.
  if exists (select 1 from user_athlete_links where user_id = auth.uid() and athlete_id = _athlete_id) then
    select email into _email from auth.users where id = auth.uid();
    select organization_id into _org from athletes where id = _athlete_id;
    insert into portal_access_requests
      (athlete_id, organization_id, user_id, email, requested_role, granted_role, status, onboarding, onboarded_at, decided_at)
    select _athlete_id, _org, auth.uid(), _email, l.portal_role, l.portal_role, 'approved', _answers, now(), now()
      from user_athlete_links l where l.user_id = auth.uid() and l.athlete_id = _athlete_id;
    return;
  end if;

  raise exception 'not found' using errcode = 'P0002';
end
$$;
revoke all on function public.portal_save_onboarding(uuid, jsonb) from public, anon;
grant execute on function public.portal_save_onboarding(uuid, jsonb) to authenticated;

-- ── the public locker ────────────────────────────────────────────────
create or replace function public.public_locker(_slug text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  _a athletes;
  _slug_clean text := lower(trim(coalesce(_slug, '')));
  _products jsonb;
  _collections jsonb;
begin
  select * into _a from athletes a
   where coalesce((a.metadata -> 'public_locker' ->> 'enabled')::boolean, false)
     and (lower(a.metadata -> 'public_locker' ->> 'slug') = _slug_clean or lower(a.slug) = _slug_clean)
   limit 1;
  if _a.id is null then
    return null;
  end if;

  with visible as (
    select p.*
      from products p
      join product_athletes pa on pa.product_id = p.id and pa.athlete_id = _a.id
     where p.status::text = 'published'
       and (p.public_date is null or p.public_date <= now())
       and p.price is not null
       and not exists (select 1 from portal_hidden_products h where h.athlete_id = _a.id and h.product_id = p.id)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', v.id,
           'title', v.title,
           'description', v.description,
           'price', v.price,
           'compareAt', case when v.compare_at_price > v.price then v.compare_at_price end,
           'handle', v.shopify_handle,
           'images', coalesce((
              select jsonb_agg(jsonb_build_object(
                       'bucket', i.storage_bucket, 'path', i.storage_path,
                       'color', i.metadata ->> 'color', 'view', i.metadata ->> 'portal_view',
                       'primary', i.is_primary)
                     order by i.is_primary desc, i.sort_order, i.created_at)
                from product_images i where i.product_id = v.id), '[]'::jsonb),
           'variants', coalesce((
              select jsonb_agg(jsonb_build_object(
                       'id', pv.shopify_variant_id, 'size', pv.size, 'color', pv.color,
                       'available', coalesce(pv.available, true), 'price', coalesce(pv.price, v.price))
                     order by pv.position nulls last, pv.created_at)
                from product_variants pv where pv.product_id = v.id and pv.shopify_variant_id is not null), '[]'::jsonb)
         ) order by v.created_at desc), '[]'::jsonb)
    into _products
    from visible v;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id,
           'name', c.name,
           'key', coalesce(nullif(c.metadata -> 'portal_destination' ->> 'key', ''), c.slug, c.id::text),
           'label', coalesce(nullif(c.metadata -> 'portal_destination' ->> 'label', ''), c.name),
           'caption', c.metadata -> 'portal_destination' ->> 'caption',
           'accent', c.metadata -> 'portal_destination' ->> 'accent',
           'images', coalesce(c.metadata -> 'portal_destination' -> 'images', '[]'::jsonb),
           'productIds', coalesce((
              select jsonb_agg(cp.product_id order by cp.sort_order nulls last, cp.created_at)
                from collection_products cp
               where cp.collection_id = c.id
                 and cp.product_id in (select (x ->> 'id')::uuid from jsonb_array_elements(_products) x)), '[]'::jsonb)
         ) order by coalesce((c.metadata -> 'portal_destination' ->> 'sort')::int, 1000), c.name), '[]'::jsonb)
    into _collections
    from collections c
   where c.athlete_id = _a.id
     and c.status = 'active'
     and coalesce((c.metadata -> 'portal_destination' ->> 'hidden')::boolean, false) = false;

  return jsonb_build_object(
    'entity', jsonb_build_object(
      'id', _a.id,
      'name', coalesce(nullif(_a.display_name, ''), _a.full_name),
      'slug', coalesce(nullif(_a.metadata -> 'public_locker' ->> 'slug', ''), _a.slug),
      'theme', coalesce(_a.metadata -> 'portal_theme', '{}'::jsonb),
      'locker', coalesce(_a.metadata -> 'public_locker', '{}'::jsonb)),
    'collections', _collections,
    'products', _products);
end
$$;
grant execute on function public.public_locker(text) to anon, authenticated;

-- The requester's own requests, with the entity's name and look -- they cannot
-- read the athletes row until they are approved.
create or replace function public.portal_my_requests()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id,
           'athleteId', r.athlete_id,
           'entityName', coalesce(nullif(a.display_name, ''), a.full_name),
           'theme', coalesce(a.metadata -> 'portal_theme', '{}'::jsonb),
           'status', r.status,
           'requestedRole', r.requested_role,
           'onboarding', r.onboarding,
           'onboardedAt', r.onboarded_at
         ) order by r.created_at desc), '[]'::jsonb)
    from portal_access_requests r
    join athletes a on a.id = r.athlete_id
   where r.user_id = auth.uid()
$$;
revoke all on function public.portal_my_requests() from public, anon;
grant execute on function public.portal_my_requests() to authenticated;
