-- Portal orders could never be submitted.
--
-- portal_submit_order_request inserted the request row with
--   total_units = case when <no lines> then <units> end
-- which is NULL whenever the order HAS lines, and bulk_order_requests.total_units
-- is NOT NULL. Passing an explicit NULL overrides the column default, so every
-- portal order with products in it raised 23502 and rolled back. Zero portal
-- orders exist as a result.
--
-- Fix: start at 0. The existing trg_recalc_bulk_total trigger on
-- bulk_order_items sets the real sum as each line is inserted.
-- Only that one expression changes; the rest of the function is untouched.
do $$
declare def text;
begin
  def := pg_get_functiondef('public.portal_submit_order_request(uuid,uuid,jsonb,numeric,text,text,text,numeric,integer)'::regprocedure);
  if position('then (_quote ->> ''units'')::int end' in def) = 0 then
    raise notice 'portal_submit_order_request already patched';
    return;
  end if;
  def := replace(def,
    'then (_quote ->> ''units'')::int end',
    'then (_quote ->> ''units'')::int else 0 end');
  execute def;
end $$;
