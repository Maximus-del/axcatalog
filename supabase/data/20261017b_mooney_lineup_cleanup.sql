-- ============================================================================
-- Mooney lineup cleanup — 2026-10-17 (data only, run after 20261017_mooney_library_products.sql)
--
-- 1. Archive ATL Arrival Hoodie, ATL Arrival Tee (Black, White), Rise Up 1
--    Hoodie, Rise Up 1 Tee. Archived, not deleted: they move to the client's
--    Archive tab and can be restored in V2.
-- 2. Put the 33 Drive library products LIVE, priced like the existing
--    Mooney World line: tee $45 (wholesale $22.50), hoodie $65 ($32.50).
--    Each team locker gets 11-12 products.
-- 3. Archive the 3 combined "Signature Jersey #1 / #11 / #17" products,
--    which the per-garment Signature Jersey products now duplicate.
--
-- Safe to run twice. Paste into Supabase > SQL Editor and Run.
-- UNDO: set status back with the ids below (1, 3) or
--   update products set status='draft' where metadata->'library'->>'imported_by'='library-connect-2026-10-17';
-- ============================================================================
begin;

-- 1 -------------------------------------------------------------------------
update products set status = 'archived', updated_at = now(),
  metadata = metadata || jsonb_build_object('archived_note', 'Archived 2026-10-17 at Chase''s request')
where id in ('1322fd7c-c474-4fa7-be9e-8951fc7f5ffa',  -- ATL Arrival Hoodie
             '6c4284c5-f16d-4b71-8819-063abf40553a',  -- ATL Arrival Tee - Black
             '0ad1b3be-6359-47e8-8846-1d8f83dded8b',  -- ATL Arrival Tee - White
             '3367077b-734b-4754-9be4-d0f72b77d553',  -- Rise Up 1 Hoodie
             'ee0bd2df-fb9a-4bd6-a527-f158632627ad')  -- Rise Up 1 Tee
  and status = 'published';

-- 2 -------------------------------------------------------------------------
update products set status = 'published', updated_at = now(),
  price           = case metadata->'library'->>'garment' when 'TEE' then 45   else 65   end,
  wholesale_price = case metadata->'library'->>'garment' when 'TEE' then 22.5 else 32.5 end,
  wholesale_price_source = 'manual',
  -- clear the sync stamp so the pictures pull from Drive on the next portal load
  metadata = jsonb_set(metadata, '{drive}', coalesce(metadata->'drive', '{}'::jsonb) - 'synced_at'::text, true)
where metadata->'library'->>'imported_by' = 'library-connect-2026-10-17'
  and status = 'draft';

-- 3 -------------------------------------------------------------------------
update products set status = 'archived', updated_at = now(),
  metadata = metadata || jsonb_build_object('archived_note', 'Archived 2026-10-17: replaced by per-garment Signature Jersey products')
where id in ('f8c3ddb2-e907-4949-9319-a866d23fec1f',  -- Signature Jersey #1
             'cefb93f1-499f-4fac-ad3d-46357541368a',  -- Signature Jersey #11
             '73051e91-bf08-4918-87c1-bcfd85364e18')  -- Signature Jersey #17
  and status = 'published';

commit;

-- Check: live products per team locker
select c.name as locker, count(*) as live
from products p
join product_athletes pa on pa.product_id = p.id and pa.athlete_id = '74bb5183-5a2b-443b-9b07-bf52ef89c722'
join collection_products cp on cp.product_id = p.id
join collections c on c.id = cp.collection_id
where p.status = 'published'
group by c.name order by c.name;
