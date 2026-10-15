-- Stage 6: Live vs Archive. Archived products quote and order as made to order; drafts still refused.
\set ON_ERROR_STOP 0
\set QUIET 1
\set M '''00000000-0000-0000-0000-00000000000d'''

select t.as_user('00000000-0000-0000-0000-0000000000d1');

-- The archived hat (no variants) now quotes at the sheet price.
select t.check('archive: archived product quotes',
  (public.portal_quote_order(:M, '[{"productId":"00000000-0000-0000-0000-0000000004d1","quantity":2}]') ->> 'errors') is null
  and jsonb_array_length(public.portal_quote_order(:M, '[{"productId":"00000000-0000-0000-0000-0000000004d1","quantity":2}]') -> 'lines') = 1);

-- An archived product whose Shopify variant is sold out is still orderable: made from the design file.
reset role;
update products set status = 'archived' where id = '00000000-0000-0000-0000-0000000005d1';
select t.as_user('00000000-0000-0000-0000-0000000000d1');
select t.check('archive: sold-out Shopify variant does not block an archived product',
  (public.portal_quote_order(:M, '[{"productId":"00000000-0000-0000-0000-0000000005d1","color":"Black","size":"L","quantity":3}]') ->> 'errors') is null);
select t.check('archive: archived line carries no Shopify variant',
  (public.portal_quote_order(:M, '[{"productId":"00000000-0000-0000-0000-0000000005d1","color":"Black","size":"L","quantity":3}]') -> 'lines' -> 0 ->> 'shopifyVariantId') is null);

-- A published product's stock rules are unchanged.
reset role;
update products set status = 'published' where id = '00000000-0000-0000-0000-0000000005d1';
select t.as_user('00000000-0000-0000-0000-0000000000d1');
select t.check('archive: published product still respects stock',
  t.sqlstate_of($q$select public.portal_quote_order('00000000-0000-0000-0000-00000000000d', '[{"productId":"00000000-0000-0000-0000-0000000005d1","color":"Black","size":"L","quantity":3}]')$q$) like 'P0422%Out of stock%');

-- Drafts stay unorderable.
reset role;
update products set status = 'draft' where id = '00000000-0000-0000-0000-0000000004d1';
select t.as_user('00000000-0000-0000-0000-0000000000d1');
select t.check('archive: draft still refused',
  t.sqlstate_of($q$select public.portal_quote_order('00000000-0000-0000-0000-00000000000d', '[{"productId":"00000000-0000-0000-0000-0000000004d1","quantity":1}]')$q$) like 'P0422%No longer available%');
reset role;
update products set status = 'archived' where id = '00000000-0000-0000-0000-0000000004d1';

-- Another athlete's archived product is still "Not available" (scope unchanged).
select t.as_user('00000000-0000-0000-0000-0000000000c1');
select t.check('archive: other client cannot quote Mooney''s archived product',
  t.sqlstate_of($q$select public.portal_quote_order('00000000-0000-0000-0000-00000000000d', '[{"productId":"00000000-0000-0000-0000-0000000004d1","quantity":1}]')$q$) like 'P0002%');
reset role;
