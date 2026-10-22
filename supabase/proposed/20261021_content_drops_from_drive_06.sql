-- Content & Drops from Drive 06 (2026-10-21). APPLIED as migrations
--   portal_list_assets_graphics_and_collections_20261021 and content_drops_from_drive_06_20261021.
--
-- PROACTIVE folder -> Proactive Sports Performance; DARNELL MOONEY folder -> Darnell Mooney.
-- WEBSITE CONTENT, World Tour and ACTIVE SHOPIFY PRODUCTS are AX-side: nothing imported from them.
-- 40 pieces, read from each campaign's CONTENT-MANIFEST_v03.json. Pictures show straight from Drive
-- (the files are shared "anyone with the link"), so nothing was copied. Safe to run twice.
--
-- portal_list_assets: offer / repost / giveaway templates now file under Graphics, and a piece
-- tied to a product shows when that product's collection is picked (before: never with a collection).

-- Content & Drops: offer, repost and giveaway templates file under "Graphics", shots under "Photos".
-- Only the kind of content_assets rows changes; product photos and social assets are as before.
create or replace function public.portal_list_assets(_athlete_id uuid, _kind text default null::text, _collection text default null::text, _cursor timestamp with time zone default null::timestamp with time zone, _limit integer default 24)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  _aid uuid := public.portal_scope_athlete(_athlete_id);
  _n int := least(greatest(coalesce(_limit, 24), 1), 100);
  _coll uuid;
  _rows jsonb;
begin
  if _kind is not null and _kind not in ('photo', 'video', 'graphic', 'product') then
    raise exception 'kind' using errcode = 'P0422', detail = '{"kind":"photo, video, graphic or product"}';
  end if;
  if _collection is not null and _collection <> 'all' then
    select id into _coll from collections where athlete_id = _aid and status = 'active'
      and (metadata -> 'portal_destination' ->> 'key' = _collection or slug = _collection);
    if _coll is null then
      raise exception 'collection' using errcode = 'P0422', detail = '{"collection":"Not one of your collections"}';
    end if;
  end if;

  with mine as (
    select p.id, p.title from products p
    join product_athletes pa on pa.product_id = p.id and pa.athlete_id = _aid
    where p.status::text = 'published'
      and (_coll is null or exists (select 1 from collection_products cp where cp.collection_id = _coll and cp.product_id = p.id))
  ),
  assets as (
    select 'pi_' || pi.id as id, m.title || case when pi.is_primary then '' else ' — ' || coalesce(pi.metadata ->> 'view', 'alt') end as title,
           'product' as kind, pi.storage_bucket as bucket, pi.storage_path as path, null::text as url,
           null::text as mime, m.id as product_id, null::text as caption, true as approved, pi.created_at
    from product_images pi join mine m on m.id = pi.product_id
    union all
    select 'sa_' || s.id, coalesce(s.file_name, m.title),
           case when s.mime_type like 'video/%' then 'video' when s.mime_type like 'image/%' then 'graphic' else 'graphic' end,
           s.storage_bucket, s.storage_path, null, s.mime_type, s.product_id, s.caption, true, s.created_at
    from product_social_assets s join mine m on m.id = s.product_id
    union all
    select 'ca_' || c.id, c.title,
           case when c.type::text = 'video' then 'video'
                when c.category in ('discount', 'repost', 'giveaway', 'graphic') then 'graphic'
                else 'photo' end,
           null, null, c.hero_url, null, c.product_id, c.body, true, coalesce(c.publish_at, c.created_at)
    from content_assets c
    where (c.athlete_id = _aid or _aid = any(c.athlete_ids)) and c.status::text = 'published' and c.hero_url is not null
      and (_coll is null or exists (select 1 from collection_products cp where cp.collection_id = _coll and cp.product_id = c.product_id))
  )
  select jsonb_agg(to_jsonb(a) order by a.created_at desc, a.id) into _rows from (
    select * from assets
    where (_kind is null or kind = _kind) and (_cursor is null or created_at < _cursor)
    order by created_at desc, id limit _n + 1
  ) a;
  _rows := coalesce(_rows, '[]'::jsonb);
  return jsonb_build_object(
    'items', case when jsonb_array_length(_rows) > _n then _rows - _n else _rows end,
    'nextCursor', case when jsonb_array_length(_rows) > _n then _rows -> (_n - 1) ->> 'created_at' end
  );
end $function$;

insert into content_assets (organization_id, athlete_id, type, title, body, hero_url, media, category, visibility, product_id, status, publish_at, content_purpose, content_format)
select a.organization_id, a.id, 'photo', v.title,
       case when v.cat in ('discount','giveaway') then 'Ready-made template. Tell AX before you post it so the code or giveaway is switched on.' end,
       'https://drive.google.com/thumbnail?id=' || v.fid || '&sz=w1600',
       jsonb_build_array(jsonb_build_object('source','drive-06','drive_file_id',v.fid,'campaign',v.camp,'creative_type',v.ct)),
       v.cat, 'access', v.pid::uuid, 'published', now() - make_interval(secs => v.rank), 'marketing',
       case when v.title like '%(Story)' then 'IG-STORY 9x16' else 'IG-FEED 4x5' end
from (values
('p','1ceec62d-d175-4a5c-88f7-b17d0ef83f8f','1UJFpEOZLAOkjNKEmxR1GSpB2KPvlBSU7','PSP-STRENGTHCLUB_ECRU_2026-10','EVERGREEN','Strength Club · Ecru — Model shot (Feed post)','model',0),
('p','1ceec62d-d175-4a5c-88f7-b17d0ef83f8f','1U2F8IONKkxxjS2i5uNTo03-ex5xvlNBT','PSP-STRENGTHCLUB_ECRU_2026-10','EVERGREEN','Strength Club · Ecru — Model shot (Story)','model',51),
('p','1ceec62d-d175-4a5c-88f7-b17d0ef83f8f','1yMqD_glh-EdPuWSymFpv-tEhrsyL50PC','PSP-STRENGTHCLUB_ECRU_2026-10','SAVE10','Strength Club · Ecru — Save 10% (Feed post)','discount',402),
('p','1ceec62d-d175-4a5c-88f7-b17d0ef83f8f','10n52xbTWL6lJJG62dpP_7JjG10CdojqN','PSP-STRENGTHCLUB_ECRU_2026-10','SAVE15','Strength Club · Ecru — Save 15% (Feed post)','discount',403),
('p','1ceec62d-d175-4a5c-88f7-b17d0ef83f8f','1eZkKdgflfuWf_Ld3CPdCFnSxTg7wPzd3','PSP-STRENGTHCLUB_ECRU_2026-10','SAVE20','Strength Club · Ecru — Save 20% (Feed post)','discount',404),
('p','1ceec62d-d175-4a5c-88f7-b17d0ef83f8f','1GojwqXvznZ67FUZfavNGEeUVi_lIuM_D','PSP-STRENGTHCLUB_ECRU_2026-10','REPOST','Strength Club · Ecru — Repost (Feed post)','repost',305),
('p','1ceec62d-d175-4a5c-88f7-b17d0ef83f8f','16lDBUGyjk36zHmA7sfdhx2ibEK7BtBue','PSP-STRENGTHCLUB_ECRU_2026-10','GIVEAWAY','Strength Club · Ecru — Giveaway (Feed post)','giveaway',506),
('p','1ceec62d-d175-4a5c-88f7-b17d0ef83f8f','1lArfHhwpMpt24JKAf_fIOCBM61UbDSTJ','PSP-STRENGTHCLUB_ECRU_2026-10','EDITORIAL','Strength Club · Ecru — Editorial (Feed post)','model',7),
('p','1ceec62d-d175-4a5c-88f7-b17d0ef83f8f','1IkcNKKzWrklQR6hYfwXBEEqy2KvRMNC1','PSP-STRENGTHCLUB_ECRU_2026-10','SAVE10','Strength Club · Ecru — Save 10% (Story)','discount',458),
('p','1ceec62d-d175-4a5c-88f7-b17d0ef83f8f','1Sxk2GmwHAU37unh56OBEzjg4ZLOkQGNJ','PSP-STRENGTHCLUB_ECRU_2026-10','SAVE15','Strength Club · Ecru — Save 15% (Story)','discount',459),
('p','1ceec62d-d175-4a5c-88f7-b17d0ef83f8f','1foOr6BYVBCph9QyyCE_5YOgqIMM9PRGX','PSP-STRENGTHCLUB_ECRU_2026-10','SAVE20','Strength Club · Ecru — Save 20% (Story)','discount',460),
('p','1ceec62d-d175-4a5c-88f7-b17d0ef83f8f','1Hg2Icd7AQktaXn6C21fXZI4Y2_GYzB6t','PSP-STRENGTHCLUB_ECRU_2026-10','REPOST','Strength Club · Ecru — Repost (Story)','repost',361),
('p','1ceec62d-d175-4a5c-88f7-b17d0ef83f8f','1TIm9-KGJpy1ECLKDXHPvqsdgXwwRGZsJ','PSP-STRENGTHCLUB_ECRU_2026-10','GIVEAWAY','Strength Club · Ecru — Giveaway (Story)','giveaway',562),
('p','1ceec62d-d175-4a5c-88f7-b17d0ef83f8f','1uKuCczVuSDJ1ZNI8LG3O0xrGI08gevIa','PSP-STRENGTHCLUB_ECRU_2026-10','EDITORIAL','Strength Club · Ecru — Editorial (Story)','model',63),
('p','1ceec62d-d175-4a5c-88f7-b17d0ef83f8f','12-ST00XCuOp8-an0VwdRPMCoWw3Ri9T0','PSP-STRENGTHCLUB_ECRU_2026-10','ATELIER-LEVITATION','Strength Club · Ecru — Atelier, floating (Story)','ghost',164),
('p','1ceec62d-d175-4a5c-88f7-b17d0ef83f8f','1Ds4WTRADjlt7n-E4av43L8Lva30x_ScT','PSP-STRENGTHCLUB_ECRU_2026-10','ATELIER-SCULPTURE','Strength Club · Ecru — Atelier, sculpture (Story)','ghost',165),
('p','1ceec62d-d175-4a5c-88f7-b17d0ef83f8f','1ju9vztj6kAXljV9BhjiEK4BntuIC6AnW','PSP-STRENGTHCLUB_ECRU_2026-10','ATELIER-FLATLAY','Strength Club · Ecru — Atelier, flat lay (Story)','flatlay',266),
('m','52495558-9e7c-4974-be11-7449aaf079b3','1ERxTR7tBvj5Zysmjc-hGnhRWv279Yae8','MW-FOOTBALLTOUR_NYG17_BLACK_2026-10','EVERGREEN','Football Tour #17 · Black — Product shot (Feed post)','ghost',100),
('m','52495558-9e7c-4974-be11-7449aaf079b3','1XQtwBGx34HFjROLKccYkxp4yVGKsiIAu','MW-FOOTBALLTOUR_NYG17_BLACK_2026-10','EVERGREEN','Football Tour #17 · Black — Product shot (Story)','ghost',151),
('m','52495558-9e7c-4974-be11-7449aaf079b3','1WdF7leiiawgIuAf2scW9gxw0bIYh573h','MW-FOOTBALLTOUR_NYG17_BLACK_2026-10','SAVE10','Football Tour #17 · Black — Save 10% (Feed post)','discount',402),
('m','52495558-9e7c-4974-be11-7449aaf079b3','19XNxYF2JjV4CfWYnagsLDIWUBIb-Q7sg','MW-FOOTBALLTOUR_NYG17_BLACK_2026-10','SAVE15','Football Tour #17 · Black — Save 15% (Feed post)','discount',403),
('m','52495558-9e7c-4974-be11-7449aaf079b3','1_2KlLb5-iAj2VwF6etE8c3Q4xKm0pmfC','MW-FOOTBALLTOUR_NYG17_BLACK_2026-10','SAVE20','Football Tour #17 · Black — Save 20% (Feed post)','discount',404),
('m','52495558-9e7c-4974-be11-7449aaf079b3','19be4N-rm552X6V6exSEuqhB8E7HjpBNJ','MW-FOOTBALLTOUR_NYG17_BLACK_2026-10','REPOST','Football Tour #17 · Black — Repost (Feed post)','repost',305),
('m','52495558-9e7c-4974-be11-7449aaf079b3','1UDWMeiiHc69qpuVl2EpYlzRUJMQDUZ4S','MW-FOOTBALLTOUR_NYG17_BLACK_2026-10','GIVEAWAY','Football Tour #17 · Black — Giveaway (Feed post)','giveaway',506),
('m','52495558-9e7c-4974-be11-7449aaf079b3','1n1aZB4E0qZuLDPao1wwjETHx6ya2FeXm','MW-FOOTBALLTOUR_NYG17_BLACK_2026-10','EDITORIAL','Football Tour #17 · Black — Editorial (Feed post)','flatlay',207),
('m','52495558-9e7c-4974-be11-7449aaf079b3','1kxguvComHWDJQH9AwRwjx6GqP02Bnntb','MW-FOOTBALLTOUR_NYG17_BLACK_2026-10','SAVE10','Football Tour #17 · Black — Save 10% (Story)','discount',458),
('m','52495558-9e7c-4974-be11-7449aaf079b3','1fW6kGuypdHH7AqP8EcHtVwO2CUUQIeP4','MW-FOOTBALLTOUR_NYG17_BLACK_2026-10','SAVE15','Football Tour #17 · Black — Save 15% (Story)','discount',459),
('m','52495558-9e7c-4974-be11-7449aaf079b3','1s9MNIzPP_bAetbsjmJ39i-HJZJSn1K6A','MW-FOOTBALLTOUR_NYG17_BLACK_2026-10','SAVE20','Football Tour #17 · Black — Save 20% (Story)','discount',460),
('m','52495558-9e7c-4974-be11-7449aaf079b3','1LbYK8v3MCC0e9_7PrYu_zFYwfPpx2FtJ','MW-FOOTBALLTOUR_NYG17_BLACK_2026-10','REPOST','Football Tour #17 · Black — Repost (Story)','repost',361),
('m','52495558-9e7c-4974-be11-7449aaf079b3','1E721Nej2bdf2WbtN7IvTAJevfgSjfG5H','MW-FOOTBALLTOUR_NYG17_BLACK_2026-10','GIVEAWAY','Football Tour #17 · Black — Giveaway (Story)','giveaway',562),
('m','52495558-9e7c-4974-be11-7449aaf079b3','1bDRZoN3XraNz4lMPhYdvCjEKrMRFXKk3','MW-FOOTBALLTOUR_NYG17_BLACK_2026-10','EDITORIAL','Football Tour #17 · Black — Editorial (Story)','flatlay',263),
('m','52495558-9e7c-4974-be11-7449aaf079b3','1L4e5X47jgfC2w9vRU2eYN1oNFLOafOxW','MW-FOOTBALLTOUR_NYG17_BLACK_2026-10','ATELIER-LEVITATION','Football Tour #17 · Black — Atelier, floating (Story)','ghost',164),
('m','52495558-9e7c-4974-be11-7449aaf079b3','1wJEqd39SFNL5D_HMH8IpHf8TChJJbGP2','MW-FOOTBALLTOUR_NYG17_BLACK_2026-10','ATELIER-SCULPTURE','Football Tour #17 · Black — Atelier, sculpture (Story)','ghost',165),
('m','52495558-9e7c-4974-be11-7449aaf079b3','1NYla0vMFtVhYBw1at5QK7SjzEJoTg7ZI','MW-FOOTBALLTOUR_NYG17_BLACK_2026-10','ATELIER-FLATLAY','Football Tour #17 · Black — Atelier, flat lay (Story)','flatlay',266),
('p','79d98037-77ae-477a-b241-88ece9119e03','1fWa_pOZ6r2WN7kN1wjjCWSli4cQ_KUF8','PSP-UNIVERSITYHERITAGE_TOBACCO-BROWN_2026-10','ATELIER-LEVITATION','University Heritage · Tobacco Brown — Atelier, floating (Story)','ghost',150),
('p','79d98037-77ae-477a-b241-88ece9119e03','12N52wqnouoRaPsJY_0t4KfOcDb0RErSC','PSP-UNIVERSITYHERITAGE_TOBACCO-BROWN_2026-10','ATELIER-SCULPTURE','University Heritage · Tobacco Brown — Atelier, sculpture (Story)','ghost',151),
('p','79d98037-77ae-477a-b241-88ece9119e03','1oMpuFjibMxUNBRcEvWETUdtCJ9ZsrS9N','PSP-UNIVERSITYHERITAGE_TOBACCO-BROWN_2026-10','ATELIER-FLATLAY','University Heritage · Tobacco Brown — Atelier, flat lay (Story)','flatlay',252),
('m','4bfaf877-3ed7-4a75-8528-e1432aa7d5fc','1JmAvhr-eS2vq3Zv6JW8tF2ScVT2GAiNn','MW-WRLD_NYG17_BLACK_2026-10','ATELIER-LEVITATION','WRLD #17 · Black — Atelier, floating (Story)','ghost',150),
('m','4bfaf877-3ed7-4a75-8528-e1432aa7d5fc','1zyxKUoRrteuV9MKcSaxxHlY6wQj3cIyS','MW-WRLD_NYG17_BLACK_2026-10','ATELIER-SCULPTURE','WRLD #17 · Black — Atelier, sculpture (Story)','ghost',151),
('m','4bfaf877-3ed7-4a75-8528-e1432aa7d5fc','1uDGvnOekzOGG3OA6tJBuFxPikHrggF7-','MW-WRLD_NYG17_BLACK_2026-10','ATELIER-FLATLAY','WRLD #17 · Black — Atelier, flat lay (Story)','flatlay',252)
) as v(who, pid, fid, camp, ct, title, cat, rank)
join athletes a on a.id = case v.who when 'p' then '972f0aa1-e9d7-490e-b73d-4644bbe2eacb'::uuid else '74bb5183-5a2b-443b-9b07-bf52ef89c722'::uuid end
where not exists (select 1 from content_assets c where c.media->0->>'drive_file_id' = v.fid);
