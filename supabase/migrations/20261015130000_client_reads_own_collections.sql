-- ============================================================================
-- AX - let a client see their own collections
--
-- Paste this whole file into Supabase > SQL Editor and press Run.
-- Safe to run twice.
--
-- WHY: the app stores which products are in a collection in
-- `collection_products` (14 rows). The client permission was written against
-- `product_collections`, an older table that is empty. So a client could
-- see none of their collections - Mooney's Bears, Falcons and Mooney World
-- collections were invisible to him.
--
-- WHAT A CLIENT CAN NOW SEE:
--   * active collections that belong to them
--   * active collections that belong to nobody and hold one of their products
--   * inside those, only the rows for their OWN products
-- Another athlete's collection never qualifies, even if it shares a product.
-- AX staff access is unchanged. Nothing is deleted.
-- ============================================================================

create or replace function public.viewer_collection_ids()
 returns setof uuid
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with me as (
    select athlete_id from user_athlete_links where user_id = auth.uid()
  ), my_products as (
    select pa.product_id from product_athletes pa where pa.athlete_id in (select athlete_id from me)
  )
  select c.id
  from collections c
  where c.status = 'active'
    and (
      c.athlete_id in (select athlete_id from me)
      or (
        c.athlete_id is null
        and (
          exists (select 1 from collection_products cp
                  where cp.collection_id = c.id and cp.product_id in (select product_id from my_products))
          or exists (select 1 from product_collections pc
                     where pc.collection_id = c.id and pc.product_id in (select product_id from my_products))
        )
      )
    )
$function$;

drop policy if exists "client reads own collection products" on public.collection_products;

create policy "client reads own collection products"
  on public.collection_products
  for select
  to authenticated
  using (
    collection_id in (select public.viewer_collection_ids())
    and product_id in (select public.viewer_product_ids())
  );

select 'Collections fix applied' as result;
