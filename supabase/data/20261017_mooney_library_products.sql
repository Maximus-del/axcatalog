-- ============================================================================
-- Mooney — connect the FINALIZED PRODUCTS Drive library to V2 (data only).
--
-- One DRAFT product per design × team × version × garment (33), each linked to
-- its Drive garment folder (products.metadata.drive.sources), so the existing
-- drive-sync-product-images function mirrors the FRONT/BACK mockups for every
-- color. Contact sheets, print files and JSON are skipped by the sync rules.
--
--   WRLD              9  (each team: Tee V1, Tee V2, Hoodie)
--   Unleashed         8  (ATL: Tee/Hoodie V1+V2; CHI, NYG: Tee, Hoodie)
--   Football Tour     6  (each team: Tee, Hoodie)
--   Signature Jersey 10  (ATL: Tee, Hoodie; CHI, NYG: Tee/Hoodie V1+V2)
--
-- Each product: Mooney linked (product_athletes), team locker (Falcons /
-- Bears / Giants collection), V2 blank (AXISM 7010 tee / CC HOD475 hoodie),
-- colors, needs_review, and metadata.library (design code, edition, version,
-- garment, Drive folder) so every product traces back to the manifest.
--
-- Status is DRAFT: the client sees nothing until AX flips a product Live in
-- V2 > Portal lineup. Prices are left empty on purpose (set in V2).
--
-- Also repoints the 3 LIVE combined "Signature Jersey #1 / #11 / #17"
-- products: their old concept folders were archived during the library
-- cleanup, so the next sync would have dropped their back pictures. The old
-- folder list is kept in metadata.drive.previous_sources for undo.
--
-- Additive. No schema changes. Safe to run twice (skips what exists).
-- Paste into Supabase > SQL Editor and Run.
--
-- UNDO (removes only what this file created):
--   delete from collection_products where product_id in (select id from products where metadata->'library'->>'imported_by' = 'library-connect-2026-10-17');
--   delete from product_athletes   where product_id in (select id from products where metadata->'library'->>'imported_by' = 'library-connect-2026-10-17');
--   delete from products where metadata->'library'->>'imported_by' = 'library-connect-2026-10-17' and status = 'draft';
--   update products set metadata = jsonb_set(metadata, '{drive,sources}', metadata->'drive'->'previous_sources') #- '{drive,previous_sources}'
--     where id in ('f8c3ddb2-e907-4949-9319-a866d23fec1f','cefb93f1-499f-4fac-ad3d-46357541368a','73051e91-bf08-4918-87c1-bcfd85364e18');
-- ============================================================================
begin;

create temp table _lib (design text, dcode text, team text, num int, garment text, ver text, multi boolean, folder text) on commit drop;
insert into _lib values
 ('WRLD','MW-WRLD','ATL',1,'TEE','V1',true,'17ErycqGY6D6uhlM1HdPAC_YGuirOJcuB'),
 ('WRLD','MW-WRLD','ATL',1,'TEE','V2',true,'1iDa2TeFzD0tW2-ZqxNKJ-ExXEEoXQlwl'),
 ('WRLD','MW-WRLD','ATL',1,'HOODIE','V2',false,'10dodzCxmBU6cF7W04jvoauz1yBSgtYmK'),
 ('WRLD','MW-WRLD','CHI',11,'TEE','V1',true,'1NvtTJbvQVWuN05RB-d8867F_HK0uY_j8'),
 ('WRLD','MW-WRLD','CHI',11,'TEE','V2',true,'1BowhKlxfIbvaq1Wekb11EV7tjMw2W3Cm'),
 ('WRLD','MW-WRLD','CHI',11,'HOODIE','V2',false,'1W7uYiMdrMVUMjJKS8e-xzUW0UUCq2pg_'),
 ('WRLD','MW-WRLD','NYG',17,'TEE','V1',true,'1YUKHI2a0rMMMF1sQ6Oja1dWo9HmgYRS7'),
 ('WRLD','MW-WRLD','NYG',17,'TEE','V2',true,'1Lfjwfk8LX0QKswJ0EIFniBAQmNdS798x'),
 ('WRLD','MW-WRLD','NYG',17,'HOODIE','V2',false,'1fGPZISR-vQiMsz3ekxK0aZ1h_32Y-vHy'),
 ('Unleashed','MW-UNLEASHED','ATL',1,'TEE','V1',true,'1SykCJFA1-XQ1wCZD42ioZS8Pvd6YXWUQ'),
 ('Unleashed','MW-UNLEASHED','ATL',1,'HOODIE','V1',true,'1Qn-w4DGqzGchkzYWH6M26J2kCWxhQJ9D'),
 ('Unleashed','MW-UNLEASHED','ATL',1,'TEE','V2',true,'15Hsdaf1t7QlHIObCV3i9LsupxeIbF9Io'),
 ('Unleashed','MW-UNLEASHED','ATL',1,'HOODIE','V2',true,'1vkMwwNX-SIr_nirWK22ToZUNyjdb6n8d'),
 ('Unleashed','MW-UNLEASHED','CHI',11,'TEE','V2',false,'1bIxO0soQaEx4SWdT6TOGBU6hNS5HDCwK'),
 ('Unleashed','MW-UNLEASHED','CHI',11,'HOODIE','V2',false,'1AQSHASChh61JG2AGnHhyuMJNNN0Hl5ne'),
 ('Unleashed','MW-UNLEASHED','NYG',17,'TEE','V2',false,'1eSzanNz4u1KBbHQBC1NB26CTbb3pn__0'),
 ('Unleashed','MW-UNLEASHED','NYG',17,'HOODIE','V2',false,'1hxbH5oBXu95qQyKSCBn3oJoGwxEesg7m'),
 ('Football Tour','MW-FOOTBALLTOUR','ATL',1,'TEE','V1',false,'1mB0lvDMpjwx9cF8rtlt_Bx0SBHsbumS-'),
 ('Football Tour','MW-FOOTBALLTOUR','ATL',1,'HOODIE','V1',false,'1yaWSGeadTf8HbEgdWu8HUzpSv3eQ2hW4'),
 ('Football Tour','MW-FOOTBALLTOUR','CHI',11,'TEE','V1',false,'1OM4WWr3UTKSmJG53wE-RuIadyTDR_YMt'),
 ('Football Tour','MW-FOOTBALLTOUR','CHI',11,'HOODIE','V1',false,'1OHCswgVnPf_wOy1CoyrRCNMpmrtEW8jo'),
 ('Football Tour','MW-FOOTBALLTOUR','NYG',17,'TEE','V1',false,'153bWowY-VWnzXuce_FvwmZp2z1J2PdOZ'),
 ('Football Tour','MW-FOOTBALLTOUR','NYG',17,'HOODIE','V1',false,'1xfYBirIusduyvYwVbKPnguHAKi0C-WZZ'),
 ('Signature Jersey','MW-SIGNATUREJERSEY','ATL',1,'TEE','V1',false,'1M9subceC0TWVkuKHTJE8pSvlqOqa4I-f'),
 ('Signature Jersey','MW-SIGNATUREJERSEY','ATL',1,'HOODIE','V1',false,'11bMCAUepcYAvet5jevg6ggXXxPczFZTg'),
 ('Signature Jersey','MW-SIGNATUREJERSEY','CHI',11,'TEE','V1',true,'1MCeLf-QMv0u2djSLPvqaOGm4bT1SU5gn'),
 ('Signature Jersey','MW-SIGNATUREJERSEY','CHI',11,'HOODIE','V1',true,'1bX8lN4U3PUmgZdRoMCujbE72yCw3F_Ff'),
 ('Signature Jersey','MW-SIGNATUREJERSEY','CHI',11,'TEE','V2',true,'19FjBdurW3sbTTlRMZd1GMdolvCaRZbqV'),
 ('Signature Jersey','MW-SIGNATUREJERSEY','CHI',11,'HOODIE','V2',true,'1rHZenZ5mTK8kUbfxDR4TpBjioSYJqUlL'),
 ('Signature Jersey','MW-SIGNATUREJERSEY','NYG',17,'TEE','V1',true,'1fa9oOGxIW1AfoOv2cjOeT2GQhQX0ED2b'),
 ('Signature Jersey','MW-SIGNATUREJERSEY','NYG',17,'HOODIE','V1',true,'101GbnxMzSJ1p2bm8I95iVj_jaUIGnjvk'),
 ('Signature Jersey','MW-SIGNATUREJERSEY','NYG',17,'TEE','V2',true,'1quj62M5vsKqGAqSD0godHVA9BAfjPcqo'),
 ('Signature Jersey','MW-SIGNATUREJERSEY','NYG',17,'HOODIE','V2',true,'1CPmdZ0z9giX5SULUfW8DOWvTW5eAB4ee');

create temp table _rows on commit drop as
select l.*,
  'Mooney World ' || design || ' #' || num || ' ' || initcap(garment) || case when multi then ' — ' || ver else '' end as title,
  case team when 'ATL' then 'ATL1' when 'CHI' then 'CHI11' else 'NYG17' end as edition,
  case team when 'ATL' then '368731e5-0c1e-4dd0-8039-37068787db11'
            when 'CHI' then 'b1a1e677-aa98-4ddf-97af-c2c5ac8f9cef'
            else '3b712c83-747b-4754-9be4-d0f72b77d553' end::uuid as coll,
  case garment when 'TEE' then 'da7d45ff-5f70-4cd6-959e-31955488290f'
               else 'cec81b15-e1ed-4a31-84eb-aaefd32bd184' end::uuid as blank,
  case garment when 'TEE' then 'TEE ' || ver || ' — AXISM 7010' else 'HOODIE ' || ver || ' — CC HOD475' end as gfolder,
  'lib-' || lower(dcode) || '-' || case team when 'ATL' then 'atl1' when 'CHI' then 'chi11' else 'nyg17' end
         || '-' || lower(garment) || '-' || lower(ver) as slug
from _lib l;

-- 1. Products (skip any slug that already exists) --------------------------
insert into products (organization_id, title, slug, status, product_type, needs_review, v2_blank_id, metadata)
select '11111111-1111-4111-8111-000000000001', r.title, r.slug, 'draft', 'athlete_merch', true, r.blank,
  jsonb_build_object(
    'drive', jsonb_build_object('sources', jsonb_build_array(jsonb_build_object('id', r.folder, 'label', r.gfolder))),
    'colors', case r.garment when 'TEE' then '["Black","Graphite","Tobacco Brown"]'::jsonb
                             else '["Jet Black","Charcoal Oil Wash","Cub"]'::jsonb end,
    'library', jsonb_build_object(
      'source', 'drive_finalized', 'athlete', 'DARNELL MOONEY',
      'design_code', r.dcode, 'edition', r.edition, 'version', r.ver, 'garment', r.garment,
      'maker', case r.garment when 'TEE' then 'AXISM' else 'CC' end,
      'style', case r.garment when 'TEE' then '7010' else 'HOD475' end,
      'garment_folder', r.gfolder, 'drive_folder_id', r.folder,
      'imported_at', now(), 'imported_by', 'library-connect-2026-10-17'))
from _rows r
where not exists (select 1 from products p where p.slug = r.slug);

-- 2. Link to Mooney ---------------------------------------------------------
insert into product_athletes (product_id, athlete_id)
select p.id, '74bb5183-5a2b-443b-9b07-bf52ef89c722'
from _rows r join products p on p.slug = r.slug
where not exists (select 1 from product_athletes pa
                  where pa.product_id = p.id and pa.athlete_id = '74bb5183-5a2b-443b-9b07-bf52ef89c722');

-- 3. Team locker (Falcons / Bears / Giants) ---------------------------------
insert into collection_products (collection_id, product_id)
select r.coll, p.id
from _rows r join products p on p.slug = r.slug
where not exists (select 1 from collection_products cp where cp.collection_id = r.coll and cp.product_id = p.id);

-- 4. Repoint the 3 live combined Signature Jersey products (once) ------------
update products set metadata = jsonb_set(products.metadata, '{drive}',
    (coalesce(products.metadata->'drive', '{}'::jsonb) - 'synced_at'::text)
    || jsonb_build_object('previous_sources', products.metadata->'drive'->'sources', 'sources', v.sources::jsonb), true)
from (values
 ('f8c3ddb2-e907-4949-9319-a866d23fec1f', '[{"id":"1M9subceC0TWVkuKHTJE8pSvlqOqa4I-f","label":"TEE V1 — AXISM 7010"},{"id":"11bMCAUepcYAvet5jevg6ggXXxPczFZTg","label":"HOODIE V1 — CC HOD475"}]'),
 ('cefb93f1-499f-4fac-ad3d-46357541368a', '[{"id":"1MCeLf-QMv0u2djSLPvqaOGm4bT1SU5gn","label":"TEE V1 — AXISM 7010"},{"id":"1bX8lN4U3PUmgZdRoMCujbE72yCw3F_Ff","label":"HOODIE V1 — CC HOD475"},{"id":"19FjBdurW3sbTTlRMZd1GMdolvCaRZbqV","label":"TEE V2 — AXISM 7010"},{"id":"1rHZenZ5mTK8kUbfxDR4TpBjioSYJqUlL","label":"HOODIE V2 — CC HOD475"}]'),
 ('73051e91-bf08-4918-87c1-bcfd85364e18', '[{"id":"1fa9oOGxIW1AfoOv2cjOeT2GQhQX0ED2b","label":"TEE V1 — AXISM 7010"},{"id":"101GbnxMzSJ1p2bm8I95iVj_jaUIGnjvk","label":"HOODIE V1 — CC HOD475"},{"id":"1quj62M5vsKqGAqSD0godHVA9BAfjPcqo","label":"TEE V2 — AXISM 7010"},{"id":"1CPmdZ0z9giX5SULUfW8DOWvTW5eAB4ee","label":"HOODIE V2 — CC HOD475"}]')
) v(id, sources)
where products.id = v.id::uuid
  and not coalesce(products.metadata->'drive', '{}'::jsonb) ? 'previous_sources';

commit;

-- Check: expect 33 rows, all draft, each with 1 athlete link and 1 locker.
select p.title, p.status,
       (select count(*) from product_athletes pa where pa.product_id = p.id) as athlete_links,
       (select count(*) from collection_products cp where cp.product_id = p.id) as lockers
from products p
where p.metadata->'library'->>'imported_by' = 'library-connect-2026-10-17'
order by p.title;
