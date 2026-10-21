-- Live store orders -> Brand HQ (2026-10-21). PROPOSED — not applied.
--
-- WHY: Brand HQ reads `orders` / `order_line_items` (filled by the CSV import,
-- credited to a client by product_attribution_rules). The automatic Shopify
-- sync (shopify-sync-orders, which the shopify-webhook function calls) writes
-- to a different pair — `shopify_orders` / `shopify_order_line_items` — and
-- nothing carries those across. So switching the webhook on alone would never
-- move a client's numbers. This closes the gap inside the database:
--
--   Shopify order -> webhook -> shopify-sync-orders -> shopify_order_line_items
--                                                   -> (this trigger) -> orders + order_line_items, credited by the rules
--
-- Every line is credited the same way the import does it: the highest-priority
-- active "contains" rule whose pattern appears in "Title - Variant". No match =
-- left uncredited with confidence 'unattributed', exactly like the import
-- (checked against all 619 imported lines: same answer for every one).
-- Re-syncing an order replaces its live lines; CSV-imported rows (no
-- shopify_line_item_id) are never touched.
--
-- Also adds rules so Proactive's PSP and Provengers lines are credited to them
-- (their existing rules only match the word "Proactive").

begin;

insert into product_attribution_rules (organization_id, match_type, match_pattern, priority, is_active, notes)
select '11111111-1111-4111-8111-000000000003', 'contains', p, 90, true, 'Proactive lines (2026-10-21)'
from unnest(array['PSP University', 'Provengers', 'Ice Man']) as p
where not exists (select 1 from product_attribution_rules r where r.match_pattern = p);

create or replace function public.ax_credit_org_for(_title text)
returns table (org uuid, rule uuid)
language sql stable security definer set search_path to 'public'
as $$
  select r.organization_id, r.id
  from product_attribution_rules r
  where r.is_active and r.match_type = 'contains' and _title ilike '%' || r.match_pattern || '%'
  order by r.priority desc, length(r.match_pattern) desc
  limit 1
$$;

create or replace function public.ax_promote_shopify_order(_shopify_order_uuid uuid)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  _ax constant uuid := '2d6f377e-4fe8-448b-84b3-42aed237f3da';
  s shopify_orders%rowtype;
  _num text;
  _order uuid;
  _org uuid;
begin
  select * into s from shopify_orders where id = _shopify_order_uuid;
  if not found then return; end if;
  _num := regexp_replace(coalesce(s.shopify_order_id, ''), '\D', '', 'g');   -- gid://shopify/Order/123 -> 123, as the import stores it
  if _num = '' then return; end if;

  -- The order is credited where most of its money went.
  select c.org into _org
  from shopify_order_line_items li
  cross join lateral public.ax_credit_org_for(li.product_title || coalesce(' - ' || li.variant_title, '')) c
  where li.shopify_order_uuid = s.id
  group by c.org order by sum(coalesce(li.line_total, 0)) desc limit 1;

  insert into orders (organization_id, shopify_order_id, shopify_order_name, order_date, customer_email, customer_name,
                      subtotal, shipping, tax, discount, total, currency, financial_status, fulfillment_status,
                      is_test, is_refund, imported_at, attributed_org_id)
  values (_ax, _num, s.shopify_order_name, coalesce(s.shopify_created_at, s.created_at), s.customer_email,
          nullif(trim(coalesce(s.customer_first_name, '') || ' ' || coalesce(s.customer_last_name, '')), ''),
          s.subtotal_price, s.total_shipping, s.total_tax, s.total_discounts, s.total_price, coalesce(s.currency, 'USD'),
          s.financial_status, s.fulfillment_status, false,
          s.shopify_cancelled_at is not null or s.financial_status in ('refunded', 'voided'),
          now(), _org)
  on conflict (shopify_order_id) where shopify_order_id is not null do update set
    financial_status = excluded.financial_status,
    fulfillment_status = excluded.fulfillment_status,
    is_refund = excluded.is_refund,
    total = excluded.total, subtotal = excluded.subtotal, discount = excluded.discount, tax = excluded.tax, shipping = excluded.shipping,
    imported_at = now()
  returning id into _order;

  -- Live lines are rebuilt from Shopify; imported lines (no shopify_line_item_id) stay.
  if exists (select 1 from shopify_order_line_items where shopify_order_uuid = s.id) then
    delete from order_line_items where order_id = _order and shopify_line_item_id is not null;
    insert into order_line_items (organization_id, order_id, shopify_line_item_id, product_id, product_title, variant_title, sku,
                                  quantity, unit_price, line_total, attributed_org_id, attribution_rule_id, attribution_confidence, is_upcharge)
    select _ax, _order, regexp_replace(li.shopify_line_item_id, '\D', '', 'g'), li.product_id,
           li.product_title || coalesce(' - ' || li.variant_title, ''), li.variant_title, li.sku,
           li.quantity, li.price, li.line_total,
           c.org, c.rule, case when c.org is null then 'unattributed' else 'matched' end, false
    from shopify_order_line_items li
    left join lateral public.ax_credit_org_for(li.product_title || coalesce(' - ' || li.variant_title, '')) c on true
    where li.shopify_order_uuid = s.id
      -- an order already brought in by the CSV import keeps its imported lines; don't double them
      and not exists (select 1 from order_line_items x where x.order_id = _order and x.shopify_line_item_id is null);
  end if;
end
$$;

create or replace function public.ax_promote_shopify_lines()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
declare _id uuid;
begin
  for _id in select distinct shopify_order_uuid from new_rows where shopify_order_uuid is not null loop
    perform public.ax_promote_shopify_order(_id);
  end loop;
  return null;
end
$$;

drop trigger if exists ax_promote_shopify_lines on public.shopify_order_line_items;
create trigger ax_promote_shopify_lines
  after insert on public.shopify_order_line_items
  referencing new table as new_rows
  for each statement execute function public.ax_promote_shopify_lines();

-- Status-only updates (paid -> refunded, fulfilled) arrive as a shopify_orders update with the same lines.
create or replace function public.ax_promote_shopify_order_row()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  perform public.ax_promote_shopify_order(new.id);
  return null;
end
$$;

drop trigger if exists ax_promote_shopify_order_row on public.shopify_orders;
create trigger ax_promote_shopify_order_row
  after update of financial_status, fulfillment_status, shopify_cancelled_at on public.shopify_orders
  for each row execute function public.ax_promote_shopify_order_row();

revoke all on function public.ax_promote_shopify_order(uuid) from public, anon, authenticated;
revoke all on function public.ax_credit_org_for(text) from public, anon, authenticated;

commit;

-- AFTER APPLYING: register the Shopify webhooks (orders/create, orders/updated)
-- pointing at https://cuidofxidstqpgypxcop.supabase.co/functions/v1/shopify-webhook
-- and set SHOPIFY_WEBHOOK_SECRET on the function. That is a change to Shopify's
-- settings, so it is done with Chase's say-so, not by this file.
