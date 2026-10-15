-- Stage 2: quotes, idempotent order requests, credit, stock, refund lockdown, margin privacy.
\set ON_ERROR_STOP 0
\set QUIET 1

create or replace function t.raises(_sql text, _state text) returns boolean language plpgsql as $$
begin execute _sql; return false;
exception when others then return sqlstate = _state; end $$;
grant execute on function t.raises(text, text) to authenticated;

create or replace function t.sqlstate_of(_sql text) returns text language plpgsql as $$
begin execute _sql; return 'ok';
exception when others then return sqlstate || ' ' || sqlerrm || ' ' || coalesce(pg_exception_detail(), ''); end $$;

-- pg_exception_detail is not a builtin; replace with GET STACKED DIAGNOSTICS.
create or replace function t.sqlstate_of(_sql text) returns text language plpgsql as $$
declare st text; msg text; det text;
begin execute _sql; return 'ok';
exception when others then
  get stacked diagnostics st = returned_sqlstate, msg = message_text, det = pg_exception_detail;
  return st || ' | ' || msg || ' | ' || coalesce(det, '');
end $$;
grant execute on function t.sqlstate_of(text) to authenticated;

\set M '''00000000-0000-0000-0000-00000000000d'''
\set HOOD '00000000-0000-0000-0000-0000000001d1'
\set TEE '00000000-0000-0000-0000-0000000002d1'
\set MUG '00000000-0000-0000-0000-0000000003d1'
\set ARCH '00000000-0000-0000-0000-0000000004d1'
\set STOCK '00000000-0000-0000-0000-0000000005d1'
\set COLEMAN_TEE '00000000-0000-0000-0000-0000000001c1'

-- ======================================================= BEFORE: the hole exists
-- (stage2.extra.sql installed the live, vulnerable refund function; the
-- migration has already replaced it by the time this runs, so the "before"
-- state is asserted by run.sh separately. Here we assert the AFTER state.)

select t.as_user('00000000-0000-0000-0000-0000000000d1');

-- ---------------------------------------------------------------- sheet pricing
select t.check('quote: hoodie $35, tee $18, no discount under 50',
  (public.portal_quote_order(:M, '[{"productId":"00000000-0000-0000-0000-0000000001d1","color":"Black","size":"M","quantity":2},{"productId":"00000000-0000-0000-0000-0000000002d1","color":"Black","size":"L","quantity":3}]') ->> 'subtotal')::numeric = 124.00);
select t.check('quote: compare total uses $48 / $25',
  (public.portal_quote_order(:M, '[{"productId":"00000000-0000-0000-0000-0000000001d1","quantity":2},{"productId":"00000000-0000-0000-0000-0000000002d1","quantity":3}]') ->> 'compareTotal')::numeric = 171.00);
select t.check('quote: 50 units → 10% off ($31.50 each)',
  (public.portal_quote_order(:M, '[{"productId":"00000000-0000-0000-0000-0000000001d1","quantity":50}]') ->> 'subtotal')::numeric = 1575.00);
select t.check('quote: 500 units → 25% off',
  (public.portal_quote_order(:M, '[{"productId":"00000000-0000-0000-0000-0000000002d1","quantity":500}]') ->> 'subtotal')::numeric = 6750.00);
select t.check('quote: other product type falls back to the engine unit price',
  (public.portal_quote_order(:M, '[{"productId":"00000000-0000-0000-0000-0000000003d1","quantity":1}]') -> 'lines' -> 0 ->> 'unitPrice')::numeric = 30);
select t.check('quote: rush adds $40 flat',
  (public.portal_quote_order(:M, '[{"productId":"00000000-0000-0000-0000-0000000002d1","quantity":1}]', 'rush') ->> 'subtotal')::numeric = 58.00);
select t.check('quote: contains no cost or margin',
  public.portal_quote_order(:M, '[{"productId":"00000000-0000-0000-0000-0000000003d1","quantity":1}]')::text !~* '(true_cost|margin)');

-- ---------------------------------------------------------------- validation
select t.check('quote: another athlete''s product is "Not available" (422)',
  t.sqlstate_of($$select public.portal_quote_order('00000000-0000-0000-0000-00000000000d', '[{"productId":"00000000-0000-0000-0000-0000000001c1","quantity":1}]')$$) like 'P0422%Not available%');
select t.check('quote: archived product refused',
  t.sqlstate_of($$select public.portal_quote_order('00000000-0000-0000-0000-00000000000d', '[{"productId":"00000000-0000-0000-0000-0000000004d1","quantity":1}]')$$) like 'P0422%No longer available%');
select t.check('quote: quantity 0 / 501 / "abc" refused with field errors',
  t.sqlstate_of($$select public.portal_quote_order('00000000-0000-0000-0000-00000000000d', '[{"productId":"00000000-0000-0000-0000-0000000001d1","quantity":0},{"productId":"00000000-0000-0000-0000-0000000001d1","quantity":501},{"productId":"00000000-0000-0000-0000-0000000001d1","quantity":"abc"}]')$$)
  like '%items[0].quantity%items[1].quantity%items[2].quantity%');
select t.check('quote: empty order refused',
  t.raises($$select public.portal_quote_order('00000000-0000-0000-0000-00000000000d', '[]')$$, 'P0422'));

-- ---------------------------------------------------------------- stock (Shopify variants)
select t.check('stock: in-stock variant prices fine',
  (public.portal_quote_order(:M, '[{"productId":"00000000-0000-0000-0000-0000000005d1","color":"Black","size":"M","quantity":5}]') -> 'lines' -> 0 ->> 'shopifyVariantId') = 'gid-1');
select t.check('stock: more than inventory refused',
  t.sqlstate_of($$select public.portal_quote_order('00000000-0000-0000-0000-00000000000d', '[{"productId":"00000000-0000-0000-0000-0000000005d1","color":"Black","size":"M","quantity":6}]')$$) like '%Only 5 left%');
select t.check('stock: out-of-stock variant refused',
  t.sqlstate_of($$select public.portal_quote_order('00000000-0000-0000-0000-00000000000d', '[{"productId":"00000000-0000-0000-0000-0000000005d1","color":"Black","size":"L","quantity":1}]')$$) like '%Out of stock%');
select t.check('stock: colour/size that does not exist refused',
  t.sqlstate_of($$select public.portal_quote_order('00000000-0000-0000-0000-00000000000d', '[{"productId":"00000000-0000-0000-0000-0000000005d1","color":"Red","size":"M","quantity":1}]')$$) like '%does not exist%');

-- ---------------------------------------------------------------- submit + idempotency
create temp table r (k text, v jsonb);
grant all on r to authenticated;

insert into r select 'first', public.portal_submit_order_request(:M, '11111111-0000-0000-0000-000000000001',
  '[{"productId":"00000000-0000-0000-0000-0000000001d1","color":"Black","size":"M","quantity":2},{"productId":"00000000-0000-0000-0000-0000000002d1","color":"Black","size":"L","quantity":3}]',
  100, 'standard', 'standard', 'For the camp', 124.00);
select t.check('submit: order created with server subtotal', (select (v ->> 'subtotal')::numeric from r where k = 'first') = 124.00, (select v::text from r where k='first'));
select t.check('submit: credit applied and amount due recorded on the row',
  (select credit_applied = 100 and amount_due = 24 and payment_method = 'split' from bulk_order_requests where id = (select (v ->> 'orderId')::uuid from r where k = 'first')));
select t.check('submit: units total recorded (trigger ran with authority)',
  (select total_units from bulk_order_requests where id = (select (v ->> 'orderId')::uuid from r where k = 'first')) = 5);
select t.check('submit: per-line charged price and line total saved',
  (select bool_and(unit_wholesale_price in (35, 18) and line_subtotal is not null) from bulk_order_items where order_request_id = (select (v ->> 'orderId')::uuid from r where k = 'first')));
select t.check('submit: channel portal, requester is the client',
  (select channel = 'portal' and requested_by = '00000000-0000-0000-0000-0000000000d1' from bulk_order_requests where id = (select (v ->> 'orderId')::uuid from r where k = 'first')));
select t.check('submit: wallet debited once to 2400', (select balance from athlete_credit_wallets where athlete_id = :M) = 2400.00);

insert into r select 'replay', public.portal_submit_order_request(:M, '11111111-0000-0000-0000-000000000001',
  '[{"productId":"00000000-0000-0000-0000-0000000001d1","color":"Black","size":"M","quantity":2},{"productId":"00000000-0000-0000-0000-0000000002d1","color":"Black","size":"L","quantity":3}]',
  100, 'standard', 'standard', 'For the camp', 124.00);
select t.check('idempotency: replay returns the SAME order, flagged replayed',
  (select v ->> 'orderId' from r where k = 'replay') = (select v ->> 'orderId' from r where k = 'first')
  and (select (v ->> 'replayed')::boolean from r where k = 'replay'));
select t.check('idempotency: still exactly one order', (select count(*) from bulk_order_requests where athlete_id = :M) = 1);
select t.check('idempotency: credit NOT debited twice', (select balance from athlete_credit_wallets where athlete_id = :M) = 2400.00);
select t.check('idempotency: same key, different order → 409',
  t.raises($$select public.portal_submit_order_request('00000000-0000-0000-0000-00000000000d', '11111111-0000-0000-0000-000000000001', '[{"productId":"00000000-0000-0000-0000-0000000001d1","quantity":9}]')$$, 'P0409'));

-- changed price: client saw 100, server says 124
select t.check('price changed: refused with 409 and the new quote',
  t.sqlstate_of($$select public.portal_submit_order_request('00000000-0000-0000-0000-00000000000d', '11111111-0000-0000-0000-000000000002', '[{"productId":"00000000-0000-0000-0000-0000000001d1","quantity":2},{"productId":"00000000-0000-0000-0000-0000000002d1","quantity":3}]', 0, 'standard', 'standard', null, 100.00)$$)
  like 'P0409%"subtotal": 124.00%');
select t.check('price changed: no order was created', (select count(*) from bulk_order_requests where athlete_id = :M) = 1);
insert into r select 'retry', public.portal_submit_order_request(:M, '11111111-0000-0000-0000-000000000002',
  '[{"productId":"00000000-0000-0000-0000-0000000001d1","quantity":2},{"productId":"00000000-0000-0000-0000-0000000002d1","quantity":3}]', 0, 'standard', 'standard', null, 124.00);
select t.check('price changed: retry with the same key and the new price succeeds', (select v ->> 'orderNumber' from r where k = 'retry') like 'BR-____-_____');
select t.check('no credit requested → invoice', (select payment_method = 'invoice' and amount_due = 124 from bulk_order_requests where id = (select (v ->> 'orderId')::uuid from r where k = 'retry')));

-- credit capped at the order total
insert into r select 'allcredit', public.portal_submit_order_request(:M, '11111111-0000-0000-0000-000000000003',
  '[{"productId":"00000000-0000-0000-0000-0000000002d1","quantity":2}]', 99999, 'vip');
select t.check('credit capped at the order: applies 36, due 0, method credit',
  (select credit_applied = 36 and amount_due = 0 and payment_method = 'credit' from bulk_order_requests where id = (select (v ->> 'orderId')::uuid from r where k = 'allcredit')));
select t.check('credit: wallet 2400 → 2364', (select balance from athlete_credit_wallets where athlete_id = :M) = 2364.00);
select t.check('package recorded in notes', (select notes like 'Package: vip%' from bulk_order_requests where id = (select (v ->> 'orderId')::uuid from r where k = 'allcredit')));

-- camp: no lines, unit count only
insert into r select 'camp', public.portal_submit_order_request(:M, '11111111-0000-0000-0000-000000000004', '[]', 0, 'camp', 'standard', 'Camp, 75 kids', null, 75);
select t.check('camp: units-only request recorded', (select total_units = 75 and amount_due = 0 from bulk_order_requests where id = (select (v ->> 'orderId')::uuid from r where k = 'camp')));

-- failure leaves nothing behind
select t.check('bad line: whole order refused, nothing written',
  t.raises($$select public.portal_submit_order_request('00000000-0000-0000-0000-00000000000d', '11111111-0000-0000-0000-000000000005', '[{"productId":"00000000-0000-0000-0000-0000000002d1","quantity":1},{"productId":"00000000-0000-0000-0000-0000000004d1","quantity":1}]')$$, 'P0422')
  and (select count(*) from bulk_order_requests where athlete_id = :M) = 4);

-- ---------------------------------------------------------------- refund hole closed
select t.check('refund hole: client cannot refund an order''s credit',
  t.raises(format('select public.refund_order_credit(%L)', (select v ->> 'orderId' from r where k = 'allcredit')), '42501'));
select t.check('refund hole: client cannot partially refund either',
  t.raises(format('select public.refund_order_credit_partial(%L, 10)', (select v ->> 'orderId' from r where k = 'allcredit')), '42501'));
select t.check('refund hole: wallet unchanged by the attempts', (select balance from athlete_credit_wallets where athlete_id = :M) = 2364.00);

-- ---------------------------------------------------------------- margins hidden
select t.check('pricing engine: client sees own price…',
  (select unit_price from public.compute_wholesale_price('00000000-0000-0000-0000-0000000003d1', '00000000-0000-0000-0000-0000000000a1', 10)) = 30);
select t.check('pricing engine: …but not cost or margin',
  (select true_cost is null and margin_per_unit is null and margin_percent is null from public.compute_wholesale_price('00000000-0000-0000-0000-0000000003d1', '00000000-0000-0000-0000-0000000000a1', 10)));
select t.check('pricing engine: client gets nothing for a product that is not theirs',
  (select count(*) from public.compute_wholesale_price('00000000-0000-0000-0000-0000000001c1', '00000000-0000-0000-0000-0000000000a2', 10)) = 0);
select t.check('direct helper is not callable by clients',
  t.raises($$select * from public.portal_sheet_unit_price('00000000-0000-0000-0000-0000000001d1', '00000000-0000-0000-0000-0000000000a1')$$, '42501'));
select t.reset();

-- ---------------------------------------------------------------- other identities
select t.as_user('00000000-0000-0000-0000-0000000000c1');
select t.check('coleman: cannot order as mooney',
  t.raises($$select public.portal_submit_order_request('00000000-0000-0000-0000-00000000000d', '22222222-0000-0000-0000-000000000001', '[{"productId":"00000000-0000-0000-0000-0000000001d1","quantity":1}]')$$, 'P0002'));
select t.check('coleman: the same idempotency key value is independent per user',
  (public.portal_submit_order_request('00000000-0000-0000-0000-00000000000c', '11111111-0000-0000-0000-000000000001', '[{"productId":"00000000-0000-0000-0000-0000000001c1","quantity":1}]') ->> 'replayed')::boolean = false);
select t.reset();

select t.as_user('00000000-0000-0000-0000-0000000000f1');
select t.check('operator (View as): cannot place a portal order',
  t.raises($$select public.portal_submit_order_request('00000000-0000-0000-0000-00000000000d', '33333333-0000-0000-0000-000000000001', '[{"productId":"00000000-0000-0000-0000-0000000001d1","quantity":1}]')$$, '42501'));
select t.check('operator: may still quote (to see what the client sees)',
  (public.portal_quote_order('00000000-0000-0000-0000-00000000000d', '[{"productId":"00000000-0000-0000-0000-0000000001d1","quantity":1}]') ->> 'subtotal')::numeric = 35);
select t.check('operator: refunds still work for staff',
  (select public.refund_order_credit(id) from bulk_order_requests where notes like 'Package: vip%') = 2400.00);
select t.check('operator: pricing engine still shows cost and margin to staff',
  (select true_cost is not null from public.compute_wholesale_price('00000000-0000-0000-0000-0000000003d1', '00000000-0000-0000-0000-0000000000a1', 10)));
select t.reset();

set role anon;
select t.check('anon: cannot quote or submit',
  t.raises($$select public.portal_quote_order('00000000-0000-0000-0000-00000000000d', '[]')$$, '42501'));
reset role;
