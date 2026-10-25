-- PORTAL CHECKOUT: PAY NOW (5% OFF) OR NET 30
--
-- An order still starts as a portal order request (portal_submit_order_request,
-- priced by the server). The owner then picks how to pay:
--   pay_now — 5% off what's due, paid right away through a Shopify invoice
--             checkout (cards, Apple Pay). Edge function portal-checkout makes it.
--   net_30  — the order goes ahead now, payment is due in 30 days (a Shopify
--             order with Net 30 terms). Only for clients AX has approved:
--             athletes.metadata.payment_terms.net30 = true.
-- Team logins keep the old path ("AX sends the invoice").
--
-- Also: print-on-demand (product_type 'pod') lines are priced per variant
-- (product_variants.metadata.client_price) and get no volume discount — the
-- Printful cost leaves no room for 10–25% off.
--
-- Additive only.

-- ── order columns ──────────────────────────────────────────────────────────
alter table public.bulk_order_requests
  add column if not exists payment_terms text,
  add column if not exists pay_now_discount numeric not null default 0,
  add column if not exists due_date date,
  add column if not exists shipping_address jsonb,
  add column if not exists payment_url text,
  add column if not exists shopify_draft_order_id text,
  add column if not exists shopify_order_id text,
  add column if not exists payment_error text;

do $$ begin
  alter table public.bulk_order_requests add constraint bulk_order_requests_payment_terms_check
    check (payment_terms is null or payment_terms in ('invoice', 'pay_now', 'net_30'));
exception when duplicate_object then null; end $$;

-- ── POD pricing inside the quote (body injection, idempotent) ─────────────
do $$
declare
  _def text := pg_get_functiondef('public.portal_quote_order(uuid,jsonb,text,integer)'::regprocedure);
  _nl text := case when position(chr(13) || chr(10) in _def) > 0 then chr(13) || chr(10) else chr(10) end;
begin
  if position('AX_POD_PRICING' in _def) > 0 then
    return;
  end if;
  if position('  _vsku text;' in _def) = 0
     or position('select * into pr from public.portal_sheet_unit_price(pid, _org);' in _def) = 0 then
    raise exception 'portal_quote_order changed shape; POD pricing not injected';
  end if;
  _def := replace(_def, '  _vsku text;', '  _vsku text;' || _nl || '  _lpct numeric := 0;');
  _def := replace(_def,
    'select * into pr from public.portal_sheet_unit_price(pid, _org);',
    'select * into pr from public.portal_sheet_unit_price(pid, _org);' || _nl ||
    '    -- AX_POD_PRICING: print-on-demand uses the variant''s client price, no volume discount' || _nl ||
    '    _lpct := _pct;' || _nl ||
    '    if exists (select 1 from products px where px.id = pid and px.product_type::text = ''pod'') then' || _nl ||
    '      _lpct := 0;' || _nl ||
    '      pr.athlete_unit := coalesce((' || _nl ||
    '        select (pv.metadata ->> ''client_price'')::numeric from product_variants pv' || _nl ||
    '         where pv.product_id = pid and pv.metadata ? ''client_price''' || _nl ||
    '           and (_vid is null or pv.shopify_variant_id = _vid)' || _nl ||
    '         order by pv.position nulls last limit 1), pr.athlete_unit);' || _nl ||
    '    end if;');
  _def := replace(_def, 'line_total := round(pr.athlete_unit * qty * (1 - _pct / 100.0), 2);',
                        'line_total := round(pr.athlete_unit * qty * (1 - _lpct / 100.0), 2);');
  _def := replace(_def, '''effectiveUnitPrice'', round(pr.athlete_unit * (1 - _pct / 100.0), 2),',
                        '''effectiveUnitPrice'', round(pr.athlete_unit * (1 - _lpct / 100.0), 2),');
  execute _def;
end $$;

-- ── who may pay later ──────────────────────────────────────────────────────
create or replace function public.portal_net30_enabled(_athlete_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce((metadata -> 'payment_terms' ->> 'net30')::boolean, false) from athletes where id = _athlete_id
$$;
revoke all on function public.portal_net30_enabled(uuid) from public, anon;

-- The order this caller placed through the server (not a hand-made row), or an error.
create or replace function public.portal_checkout_order(_order_id uuid)
returns public.bulk_order_requests language plpgsql stable security definer set search_path to 'public' as $$
declare
  _o bulk_order_requests;
begin
  select * into _o from bulk_order_requests where id = _order_id;
  if _o.id is null or _o.requested_by is distinct from auth.uid() or _o.channel is distinct from 'portal'
     or not exists (select 1 from portal_idempotency_keys k
                     where k.user_id = auth.uid() and k.operation = 'order_request'
                       and k.result ->> 'orderId' = _o.id::text) then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;
  return _o;
end
$$;
revoke all on function public.portal_checkout_order(uuid) from public, anon, authenticated;

-- ── checkout options for the cart ─────────────────────────────────────────
create or replace function public.portal_checkout_options(_athlete_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  _aid uuid := public.portal_scope_athlete(_athlete_id);
begin
  return jsonb_build_object(
    'canChoose', public.portal_viewer_is_owner(_aid),
    'payNowPct', 5,
    'net30', public.portal_net30_enabled(_aid),
    'shipTo', (select r.shipping_address from bulk_order_requests r
                where r.athlete_id = _aid and r.shipping_address is not null
                order by r.created_at desc limit 1));
end
$$;
revoke all on function public.portal_checkout_options(uuid) from public, anon;
grant execute on function public.portal_checkout_options(uuid) to authenticated;

-- ── pick how to pay (owners, on their own fresh order) ────────────────────
create or replace function public.portal_choose_payment(_athlete_id uuid, _order_id uuid, _terms text, _ship_to jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  _aid uuid := public.portal_scope_athlete(_athlete_id);
  _o bulk_order_requests;
  _due numeric;
  _disc numeric := 0;
  _ship jsonb;
  _k text;
begin
  perform public.portal_require_owner(_aid);
  if public.current_user_is_operator() then
    raise exception 'AX staff can''t pay on a client''s behalf from View-as.' using errcode = '42501';
  end if;
  if coalesce((select (raw_user_meta_data ->> 'ax_demo')::boolean from auth.users where id = auth.uid()), false) then
    raise exception 'This is a read-only demo.' using errcode = '42501';
  end if;
  _o := public.portal_checkout_order(_order_id);
  if _o.athlete_id is distinct from _aid then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;
  if _o.shopify_draft_order_id is not null then
    raise exception 'Payment for this order is already set up.' using errcode = 'P0409';
  end if;
  if _o.status::text not in ('submitted', 'acknowledged') or _o.payment_status in ('paid', 'waived') then
    raise exception 'This order can''t be paid here.' using errcode = 'P0409';
  end if;
  if _terms not in ('pay_now', 'net_30') then
    raise exception 'Pick pay now or net 30.' using errcode = 'P0422';
  end if;
  if _terms = 'net_30' and not public.portal_net30_enabled(_aid) then
    raise exception 'Net 30 isn''t turned on for your account yet. Ask AX.' using errcode = '42501';
  end if;

  -- Shipping address: plain strings only, short, known keys.
  if _ship_to is not null and jsonb_typeof(_ship_to) = 'object' then
    _ship := '{}'::jsonb;
    foreach _k in array array['name', 'company', 'address1', 'address2', 'city', 'province', 'zip', 'country', 'phone'] loop
      if jsonb_typeof(_ship_to -> _k) = 'string' and length(trim(_ship_to ->> _k)) between 1 and 120 then
        _ship := _ship || jsonb_build_object(_k, trim(_ship_to ->> _k));
      end if;
    end loop;
    if not (_ship ? 'country') then _ship := _ship || '{"country":"US"}'; end if;
  end if;
  if _terms = 'net_30' and (_ship is null or not (_ship ? 'name' and _ship ? 'address1' and _ship ? 'city' and _ship ? 'province' and _ship ? 'zip')) then
    raise exception 'Add a shipping address for net 30 orders.' using errcode = 'P0422',
      detail = '{"shipTo":"Name, street, city, state and ZIP"}';
  end if;

  -- What's owed comes from the server's own record of the order, never the row.
  select (k.result ->> 'amountDue')::numeric into _due
    from portal_idempotency_keys k
   where k.user_id = auth.uid() and k.operation = 'order_request' and k.result ->> 'orderId' = _o.id::text
   limit 1;
  _due := coalesce(_due, 0);
  if _due <= 0 then
    raise exception 'Nothing to pay on this order.' using errcode = 'P0409';
  end if;
  if _terms = 'pay_now' then
    _disc := round(_due * 0.05, 2);
  end if;

  update bulk_order_requests set
    payment_terms = _terms,
    pay_now_discount = _disc,
    amount_due = _due - _disc,
    payment_method = 'invoice',
    due_date = case when _terms = 'net_30' then current_date + 30 end,
    payment_status = case when _terms = 'net_30' then 'invoiced' else 'unpaid' end,
    invoiced_at = case when _terms = 'net_30' then now() end,
    shipping_address = coalesce(_ship, shipping_address),
    payment_error = null,
    updated_at = now()
  where id = _o.id;

  return jsonb_build_object('orderId', _o.id, 'terms', _terms, 'payNowDiscount', _disc,
                            'amountDue', _due - _disc,
                            'dueDate', case when _terms = 'net_30' then current_date + 30 end);
end
$$;
revoke all on function public.portal_choose_payment(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.portal_choose_payment(uuid, uuid, text, jsonb) to authenticated;

-- ── what the portal-checkout edge function needs (called with the user's JWT) ──
create or replace function public.portal_checkout_payload(_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  _o bulk_order_requests;
  _r jsonb;
begin
  _o := public.portal_checkout_order(_order_id);
  perform public.portal_require_owner(_o.athlete_id);
  if _o.payment_terms not in ('pay_now', 'net_30') then
    raise exception 'Pick how to pay first.' using errcode = 'P0409';
  end if;
  select k.result into _r from portal_idempotency_keys k
   where k.user_id = auth.uid() and k.operation = 'order_request' and k.result ->> 'orderId' = _o.id::text limit 1;
  return jsonb_build_object(
    'orderId', _o.id,
    'orderNumber', _o.order_number,
    'organizationId', _o.organization_id,
    'terms', _o.payment_terms,
    'email', (select email from auth.users where id = auth.uid()),
    'shipTo', _o.shipping_address,
    'lines', coalesce(_r -> 'quote' -> 'lines', '[]'::jsonb),
    'surcharge', coalesce((_r -> 'quote' ->> 'surcharge')::numeric, 0),
    'creditApplied', coalesce((_r ->> 'creditApplied')::numeric, 0),
    'payNowDiscount', _o.pay_now_discount,
    'amountDue', _o.amount_due,
    'draftOrderId', _o.shopify_draft_order_id,
    'shopifyOrderId', _o.shopify_order_id,
    'paymentUrl', _o.payment_url,
    'paymentStatus', _o.payment_status);
end
$$;
revoke all on function public.portal_checkout_payload(uuid) from public, anon;
grant execute on function public.portal_checkout_payload(uuid) to authenticated;
