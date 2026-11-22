-- "Your orders" = what AX charged the client (Shopify order totals at client
-- pricing), not retail value. $0 orders were billed outside Shopify on
-- purpose (Chase, 2026-11-21): they count units, not money.
-- retail_value is kept alongside for reference.
do $do$
declare _def text;
begin
  select pg_get_functiondef('public.portal_revenue_summary(uuid,timestamp with time zone,timestamp with time zone,text)'::regprocedure) into _def;
  _def := replace(_def, 'o.id as order_id, o.order_date,', 'o.id as order_id, o.total as order_total, o.order_date,');
  _def := replace(_def,
    '''gross'', (select round(coalesce(sum(line_total), 0), 2) from own)',
    '''gross'', (select round(coalesce(sum(order_total), 0), 2) from (select distinct order_id, order_total from own) x),
      ''retail_value'', (select round(coalesce(sum(line_total), 0), 2) from own),
      ''basis'', ''charged: what AX invoiced in Shopify (client pricing); $0 = billed outside Shopify''');
  if position('retail_value' in _def) = 0 or position('order_total' in _def) = 0 then raise exception 'patch did not apply'; end if;
  execute _def;
end
$do$;
