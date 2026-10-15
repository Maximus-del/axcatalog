-- ============================================================================
-- Mooney World / portal adapter — STAGE 2: orders, credit and pricing safety
--
-- Paste into Supabase > SQL Editor and Run. Safe to run twice.
-- Run AFTER AX-PORTAL-STAGE-1.sql (uses portal_scope_athlete).
--
-- WHAT WAS BROKEN
--   * refund_order_credit(order) had NO permission check: any signed-in login
--     could put any order's spent credit back into the wallet.
--   * refund_order_credit_partial let a client refund their own order's credit.
--     Together: spend credit on an order, then take it back. Nothing in the app
--     calls either function, so restricting them to AX staff removes nothing.
--   * compute_wholesale_price returned AX's TRUE COST and MARGIN to any login,
--     for any product, including a client's — readable from the browser console.
--   * Portal orders were four separate browser writes with no idempotency, the
--     price decided in the browser, and credit applied in a step whose failure
--     did not stop the order. For a real client the last step (recording what
--     is owed and how it is paid) and the units total were silently rejected by
--     row-level security, so those fields were never set.
--
-- WHAT THIS DOES
--   1. Refund functions: AX staff only. Logic otherwise byte-for-byte the same.
--   2. compute_wholesale_price: unchanged for staff. For a client: only their
--      own products, and true_cost / margin_per_unit / margin_percent are null.
--   3. portal_quote_order(): the server's price for a cart, using the BULK
--      SHEET's rules (decided 2026-10-15) — hoodie $35 (compare $48), tee $18
--      (compare $25), anything else the pricing-engine unit price or $18;
--      volume discount from volume_discount_tiers, else 50/10%, 100/15%,
--      250/20%, 500/25%; rush +$40 flat. Read-only.
--   4. portal_submit_order_request(): one transaction — validate, price, stock,
--      create the request + items, apply credit, record amount due and payment
--      method. Credit failure rolls the whole order back. An idempotency key
--      makes a double-click or retry return the SAME order. If the price
--      changed since the quote the client saw, it refuses (409) and returns the
--      new quote. No payment is captured: invoicing is unchanged.
--      "View as" cannot place orders.
-- ============================================================================

-- 1 ---------------------------------------------------------------- refunds
create or replace function public.refund_order_credit(_order_id uuid)
 returns numeric
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_athlete uuid;
  v_status public.bulk_order_status;
  v_applied numeric(10,2);
  v_wallet public.athlete_credit_wallets%rowtype;
  v_add numeric(10,2);
  v_new numeric(10,2);
begin
  -- AX staff only. This had no check at all.
  if not public.current_user_is_operator() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select athlete_id, status, coalesce(credit_applied,0)
    into v_athlete, v_status, v_applied
    from public.bulk_order_requests where id = _order_id;
  if v_athlete is null or v_applied <= 0 then return 0; end if;

  if v_status = 'draft' then raise exception 'Cannot refund credit on a draft cart'; end if;

  select * into v_wallet from public.athlete_credit_wallets where athlete_id = v_athlete for update;
  v_add := least(v_applied, greatest(v_wallet.max_balance - v_wallet.balance, 0));
  v_new := v_wallet.balance + v_add;

  update public.athlete_credit_wallets
    set balance = v_new, total_used = greatest(total_used - v_applied, 0)
    where id = v_wallet.id;

  update public.bulk_order_requests set credit_applied = 0 where id = _order_id;

  insert into public.athlete_credit_transactions
    (wallet_id, athlete_id, order_request_id, type, amount, balance_after, notes, created_by)
    values (v_wallet.id, v_athlete, _order_id, 'refund', v_add, v_new, 'Order cancelled refund', auth.uid());

  return v_new;
end $function$;

create or replace function public.refund_order_credit_partial(_order_id uuid, _amount numeric, _notes text default 'Order adjustment refund'::text)
 returns numeric
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_athlete uuid;
  v_applied numeric(10,2);
  v_wallet public.athlete_credit_wallets%rowtype;
  v_add numeric(10,2);
  v_new numeric(10,2);
begin
  if _amount is null or _amount <= 0 then return 0; end if;

  -- AX staff only. A client could previously refund their own order's credit.
  if not public.current_user_is_operator() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select athlete_id, coalesce(credit_applied,0) into v_athlete, v_applied
    from public.bulk_order_requests where id = _order_id;
  if v_athlete is null then raise exception 'Order not found'; end if;

  if _amount > v_applied then
    raise exception 'Refund amount (%) exceeds credit applied (%)', _amount, v_applied;
  end if;

  select * into v_wallet from public.athlete_credit_wallets where athlete_id = v_athlete for update;
  v_add := least(_amount, greatest(v_wallet.max_balance - v_wallet.balance, 0));
  v_new := v_wallet.balance + v_add;

  update public.athlete_credit_wallets
    set balance = v_new, total_used = greatest(total_used - _amount, 0)
    where id = v_wallet.id;

  update public.bulk_order_requests
    set credit_applied = greatest(coalesce(credit_applied,0) - _amount, 0)
    where id = _order_id;

  insert into public.athlete_credit_transactions
    (wallet_id, athlete_id, order_request_id, type, amount, balance_after, notes, created_by)
    values (v_wallet.id, v_athlete, _order_id, 'refund', v_add, v_new, _notes, auth.uid());

  return v_new;
end $function$;

-- 2 ---------------------------------------------------------------- pricing engine
create or replace function public.compute_wholesale_price(_product_id uuid, _organization_id uuid, _unit_count integer)
 returns table(unit_price numeric, tier_moq_price numeric, tier_name text, volume_modifier_percent numeric, volume_break_label text, true_cost numeric, margin_per_unit numeric, margin_percent numeric, pricing_incomplete boolean)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
DECLARE
  v_blank_id uuid;
  v_blank public.blanks%ROWTYPE;
  v_tier_id uuid;
  v_tier_name text;
  v_tier_moq numeric;
  v_modifier numeric := 0;
  v_label text;
  v_cost numeric;
  v_price numeric;
  v_staff boolean := public.current_user_is_operator();
BEGIN
  -- A client may price only their own products, and never sees cost or margin.
  IF NOT v_staff AND _product_id NOT IN (SELECT public.viewer_product_ids()) THEN
    RETURN;
  END IF;

  SELECT blank_id INTO v_blank_id FROM public.products WHERE id = _product_id;
  IF v_blank_id IS NULL THEN RETURN; END IF;

  SELECT * INTO v_blank FROM public.blanks WHERE id = v_blank_id;

  SELECT t.id, t.name INTO v_tier_id, v_tier_name
    FROM public.organizations o
    JOIN public.pricing_tiers t ON t.id = o.pricing_tier_id
   WHERE o.id = _organization_id;

  IF v_tier_id IS NULL THEN
    SELECT id, name INTO v_tier_id, v_tier_name
      FROM public.pricing_tiers WHERE is_default = true LIMIT 1;
  END IF;

  v_tier_moq := CASE lower(coalesce(v_tier_name,'standard'))
    WHEN 'athlete'   THEN v_blank.price_athlete
    WHEN 'corporate' THEN v_blank.price_corporate
    ELSE v_blank.price_standard
  END;

  v_cost := round((COALESCE(v_blank.blank_cost,0)
                 + COALESCE(v_blank.decoration_cost,0)
                 + COALESCE(v_blank.additional_cost,0))::numeric, 2);

  SELECT vdb.discount_percent, vdb.label
    INTO v_modifier, v_label
    FROM public.volume_discount_breaks vdb
   WHERE (vdb.pricing_tier_id = v_tier_id OR vdb.pricing_tier_id IS NULL)
     AND vdb.min_units <= COALESCE(_unit_count, 0)
     AND COALESCE(_unit_count, 0) <= COALESCE(vdb.max_units, 2147483647)
   ORDER BY vdb.pricing_tier_id NULLS LAST, vdb.min_units DESC
   LIMIT 1;

  v_modifier := COALESCE(v_modifier, 0);

  IF v_tier_moq IS NULL THEN
    unit_price := NULL;
    tier_moq_price := NULL;
    tier_name := v_tier_name;
    volume_modifier_percent := v_modifier;
    volume_break_label := v_label;
    true_cost := CASE WHEN v_staff THEN v_cost END;
    margin_per_unit := NULL;
    margin_percent := NULL;
    pricing_incomplete := true;
    RETURN NEXT;
    RETURN;
  END IF;

  v_price := round((v_tier_moq * (1 + v_modifier/100.0))::numeric, 2);

  unit_price := v_price;
  tier_moq_price := round(v_tier_moq::numeric, 2);
  tier_name := v_tier_name;
  volume_modifier_percent := v_modifier;
  volume_break_label := v_label;
  true_cost := CASE WHEN v_staff THEN v_cost END;
  margin_per_unit := CASE WHEN v_staff THEN round((v_price - v_cost)::numeric, 2) END;
  margin_percent := CASE WHEN v_staff AND v_price > 0
    THEN round((((v_price - v_cost) / v_price) * 100)::numeric, 2)
    ELSE NULL END;
  pricing_incomplete := false;
  RETURN NEXT;
END;
$function$;

-- 3 ---------------------------------------------------------------- idempotency
create table if not exists public.portal_idempotency_keys (
  user_id uuid not null,
  operation text not null,
  key uuid not null,
  request_hash text not null,
  result jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, operation, key)
);
alter table public.portal_idempotency_keys enable row level security;
-- No policies on purpose: only the SECURITY DEFINER portal functions touch it.
revoke all on public.portal_idempotency_keys from anon, authenticated;

comment on table public.portal_idempotency_keys is
  'One row per (user, operation, client key). A replay with the same request returns the stored result; with a different request it is refused.';

-- 4 ---------------------------------------------------------------- sheet pricing
-- The bulk sheet's per-product rule, server-side. Returns the athlete unit
-- price (what they pay before volume discount) and the comparison price shown
-- as "what you'd pay elsewhere".
create or replace function public.portal_sheet_unit_price(_product_id uuid, _organization_id uuid,
  out athlete_unit numeric, out compare_unit numeric)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  p record;
  hay text;
  engine numeric;
begin
  select id, title, product_type, wholesale_price, price into p from products where id = _product_id;
  if p.id is null then return; end if;
  hay := lower(coalesce(p.product_type::text, '') || ' ' || coalesce(p.title, ''));
  if hay like '%hood%' then
    athlete_unit := 35; compare_unit := 48; return;
  end if;
  if hay like '%tee%' or hay like '%tshirt%' or hay like '%t-shirt%' or hay like '%shirt%' then
    athlete_unit := 18; compare_unit := 25; return;
  end if;
  select coalesce(c.unit_price, c.tier_moq_price) into engine
    from public.compute_wholesale_price(_product_id, _organization_id, 10) c;
  athlete_unit := coalesce(engine, 18);
  compare_unit := coalesce(p.wholesale_price, p.price, 25);
end $function$;

revoke all on function public.portal_sheet_unit_price(uuid, uuid) from public, anon, authenticated;

-- 5 ---------------------------------------------------------------- quote
-- _items: [{"productId": uuid, "color": text|null, "size": text|null, "quantity": int, "customization": {}?}]
create or replace function public.portal_quote_order(
  _athlete_id uuid,
  _items jsonb,
  _turnaround text default 'standard',
  _units_override integer default null
)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  _aid uuid := public.portal_scope_athlete(_athlete_id);
  _org uuid;
  _errors jsonb := '{}'::jsonb;
  _lines jsonb := '[]'::jsonb;
  _units int := 0;
  _pct numeric := 0;
  _subtotal numeric := 0;
  _compare numeric := 0;
  _surcharge numeric := 0;
  _i int := 0;
  it jsonb;
  pid uuid;
  qty int;
  prod record;
  pr record;
  v record;
  has_dims boolean;
  line_total numeric;
  _vid text;
  _vsku text;
begin
  select organization_id into _org from athletes where id = _aid;

  if _items is null or jsonb_typeof(_items) <> 'array' then
    raise exception 'items must be a list' using errcode = 'P0422', detail = '{"items":"Expected a list"}';
  end if;
  if jsonb_array_length(_items) > 200 then
    raise exception 'too many lines' using errcode = 'P0422', detail = '{"items":"At most 200 lines"}';
  end if;
  if _turnaround not in ('standard', 'rush') then
    raise exception 'bad turnaround' using errcode = 'P0422', detail = '{"turnaround":"standard or rush"}';
  end if;

  -- total units first: the volume discount depends on the whole order
  for it in select * from jsonb_array_elements(_items) loop
    begin
      qty := (it ->> 'quantity')::int;
    exception when others then qty := null;
    end;
    if qty is null or qty < 1 or qty > 500 then
      _errors := _errors || jsonb_build_object('items[' || _i || '].quantity', 'Must be 1–500');
    else
      _units := _units + qty;
    end if;
    _i := _i + 1;
  end loop;

  if jsonb_array_length(_items) = 0 then
    if _units_override is null or _units_override < 1 or _units_override > 100000 then
      raise exception 'empty order' using errcode = 'P0422', detail = '{"items":"Add at least one item"}';
    end if;
    _units := _units_override;
  end if;

  select coalesce(max(discount_pct), 0) into _pct
    from volume_discount_tiers where organization_id = _org and min_qty <= _units;
  if not exists (select 1 from volume_discount_tiers where organization_id = _org) then
    _pct := case when _units >= 500 then 25 when _units >= 250 then 20 when _units >= 100 then 15 when _units >= 50 then 10 else 0 end;
  end if;

  _i := 0;
  for it in select * from jsonb_array_elements(_items) loop
    begin
      pid := (it ->> 'productId')::uuid;
    exception when others then pid := null;
    end;
    begin
      qty := (it ->> 'quantity')::int;
    exception when others then qty := null;
    end;
    if qty is null or qty < 1 or qty > 500 then
      _i := _i + 1; continue;  -- already reported in the first pass
    end if;

    select p.id, p.title, p.status::text as status into prod
      from products p
      join product_athletes pa on pa.product_id = p.id and pa.athlete_id = _aid
      where p.id = pid;
    if prod.id is null then
      -- Same message for "missing" and "not yours".
      _errors := _errors || jsonb_build_object('items[' || _i || '].productId', 'Not available');
      _i := _i + 1; continue;
    end if;
    if prod.status not in ('published', 'internal') then
      _errors := _errors || jsonb_build_object('items[' || _i || '].productId', 'No longer available');
      _i := _i + 1; continue;
    end if;

    -- Stock: Shopify-synced variants are the authority when the product has
    -- real colour/size variants. A product with none is made to order (as the
    -- bulk sheet treats it).
    select exists (
      select 1 from product_variants pv
      where pv.product_id = pid and pv.metadata ->> 'orphaned_at' is null
        and (coalesce(pv.color, '') <> '' or coalesce(pv.size, '') <> '')
    ) into has_dims;
    if has_dims then
      select pv.id, pv.shopify_variant_id, pv.sku,
             (pv.available or pv.inventory_policy = 'continue' or coalesce(pv.inventory_quantity, 0) > 0) as ok,
             pv.inventory_policy, pv.inventory_quantity
        into v
        from product_variants pv
        where pv.product_id = pid and pv.metadata ->> 'orphaned_at' is null
          and coalesce(pv.color, '') = coalesce(it ->> 'color', '')
          and coalesce(pv.size, '') = coalesce(it ->> 'size', '')
        limit 1;
      if v.id is null then
        _errors := _errors || jsonb_build_object('items[' || _i || '].variant', 'That colour/size does not exist');
        _i := _i + 1; continue;
      end if;
      if not v.ok then
        _errors := _errors || jsonb_build_object('items[' || _i || '].variant', 'Out of stock');
        _i := _i + 1; continue;
      end if;
      if v.inventory_policy is distinct from 'continue' and v.inventory_quantity is not null
         and v.inventory_quantity > 0 and qty > v.inventory_quantity then
        _errors := _errors || jsonb_build_object('items[' || _i || '].quantity', 'Only ' || v.inventory_quantity || ' left');
        _i := _i + 1; continue;
      end if;
      _vid := v.shopify_variant_id::text;
      _vsku := v.sku;
    else
      _vid := null;
      _vsku := null;
    end if;

    select * into pr from public.portal_sheet_unit_price(pid, _org);
    line_total := round(pr.athlete_unit * qty * (1 - _pct / 100.0), 2);
    _subtotal := _subtotal + line_total;
    _compare := _compare + pr.compare_unit * qty;
    _lines := _lines || jsonb_build_object(
      'productId', pid,
      'title', prod.title,
      'color', nullif(it ->> 'color', ''),
      'size', nullif(it ->> 'size', ''),
      'quantity', qty,
      'unitPrice', pr.athlete_unit,
      'effectiveUnitPrice', round(pr.athlete_unit * (1 - _pct / 100.0), 2),
      'compareUnitPrice', pr.compare_unit,
      'lineTotal', line_total,
      'shopifyVariantId', _vid,
      'sku', _vsku,
      'customization', coalesce(it -> 'customization', 'null'::jsonb)
    );
    _i := _i + 1;
  end loop;

  if _errors <> '{}'::jsonb then
    raise exception 'order has problems' using errcode = 'P0422', detail = _errors::text;
  end if;

  if _turnaround = 'rush' then _surcharge := 40; end if;
  _subtotal := round(_subtotal + _surcharge, 2);

  return jsonb_build_object(
    'currency', 'USD',
    'units', _units,
    'discountPct', _pct,
    'surcharge', _surcharge,
    'subtotal', _subtotal,
    'compareTotal', round(_compare, 2),
    'savings', greatest(round(_compare - (_subtotal - _surcharge), 2), 0),
    'lines', _lines,
    'creditAvailable', (select coalesce(balance, 0) from athlete_credit_wallets where athlete_id = _aid),
    'quoteHash', md5(_lines::text || _subtotal::text)
  );
end $function$;

revoke all on function public.portal_quote_order(uuid, jsonb, text, integer) from public, anon;
grant execute on function public.portal_quote_order(uuid, jsonb, text, integer) to authenticated;

-- 6 ---------------------------------------------------------------- submit
create or replace function public.portal_submit_order_request(
  _athlete_id uuid,
  _idempotency_key uuid,
  _items jsonb,
  _credit numeric default 0,
  _package text default 'standard',
  _turnaround text default 'standard',
  _notes text default null,
  _expected_subtotal numeric default null,
  _units_override integer default null
)
 returns jsonb
 language plpgsql
 volatile security definer
 set search_path to 'public'
as $function$
declare
  _aid uuid := public.portal_scope_athlete(_athlete_id);
  _org uuid;
  _hash text;
  _prior public.portal_idempotency_keys%rowtype;
  _quote jsonb;
  _subtotal numeric;
  _credit_to_apply numeric := 0;
  _balance numeric;
  _due numeric;
  _order_id uuid;
  _number text;
  _tries int := 0;
  _result jsonb;
  ln jsonb;
begin
  if public.current_user_is_operator() then
    raise exception 'View as is read-only. Place orders from the dashboard.' using errcode = '42501';
  end if;
  if _idempotency_key is null then
    raise exception 'idempotency key required' using errcode = 'P0422', detail = '{"idempotencyKey":"Required"}';
  end if;
  if _package not in ('standard', 'game_day', 'camp', 'vip', 'custom') then
    raise exception 'bad package' using errcode = 'P0422', detail = '{"package":"standard, game_day, camp, vip or custom"}';
  end if;
  if _credit is null or _credit < 0 then
    raise exception 'bad credit' using errcode = 'P0422', detail = '{"useCredit":"Must be zero or more"}';
  end if;

  _hash := md5(jsonb_build_object(
    'a', _aid, 'i', coalesce(_items, '[]'::jsonb), 'c', round(_credit, 2), 'p', _package,
    't', _turnaround, 'n', coalesce(_notes, ''), 'u', _units_override)::text);

  -- Claim the key. A concurrent duplicate blocks here until the first commits,
  -- then finds the row and returns the same result.
  insert into portal_idempotency_keys (user_id, operation, key, request_hash)
  values (auth.uid(), 'order_request', _idempotency_key, _hash)
  on conflict do nothing;
  if not found then
    select * into _prior from portal_idempotency_keys
      where user_id = auth.uid() and operation = 'order_request' and key = _idempotency_key;
    if _prior.request_hash <> _hash then
      raise exception 'This request key was already used for a different order.' using errcode = 'P0409';
    end if;
    return coalesce(_prior.result, '{}'::jsonb) || jsonb_build_object('replayed', true);
  end if;

  select organization_id into _org from athletes where id = _aid;
  _quote := public.portal_quote_order(_aid, coalesce(_items, '[]'::jsonb), _turnaround, _units_override);
  _subtotal := (_quote ->> 'subtotal')::numeric;

  if _expected_subtotal is not null and round(_expected_subtotal, 2) <> _subtotal then
    raise exception 'The price changed since you last saw it.' using errcode = 'P0409',
      detail = jsonb_build_object('quote', _quote)::text;
  end if;

  -- Credit: never more than the balance or the order. Lock the wallet now so a
  -- second order racing this one cannot spend the same dollars.
  select balance into _balance from athlete_credit_wallets where athlete_id = _aid for update;
  _credit_to_apply := least(round(_credit, 2), coalesce(_balance, 0), _subtotal);

  loop
    _number := 'BR-' || to_char(now(), 'YYYY') || '-' || lpad((floor(random() * 100000))::int::text, 5, '0');
    exit when not exists (select 1 from bulk_order_requests where order_number = _number);
    _tries := _tries + 1;
    if _tries > 20 then raise exception 'could not allocate an order number'; end if;
  end loop;

  insert into bulk_order_requests (
    organization_id, athlete_id, requested_by, status, order_number, channel, notes,
    wholesale_subtotal, retail_equivalent, total_savings, total_units
  ) values (
    _org, _aid, auth.uid(), 'submitted', _number, 'portal',
    nullif(trim(both from concat_ws(E'\n',
      case when _package <> 'standard' then 'Package: ' || _package end,
      case when _turnaround = 'rush' then 'Turnaround: rush (+$40)' end,
      _notes)), ''),
    _subtotal, (_quote ->> 'compareTotal')::numeric, (_quote ->> 'savings')::numeric,
    case when jsonb_array_length(_quote -> 'lines') = 0 then (_quote ->> 'units')::int end
  ) returning id into _order_id;

  for ln in select * from jsonb_array_elements(_quote -> 'lines') loop
    insert into bulk_order_items (
      order_request_id, product_id, product_name_snapshot, size, color, quantity,
      unit_wholesale_price, unit_retail_price, line_subtotal, customization, notes
    ) values (
      _order_id, (ln ->> 'productId')::uuid, ln ->> 'title', coalesce(ln ->> 'size', ''), ln ->> 'color',
      (ln ->> 'quantity')::int,
      (ln ->> 'effectiveUnitPrice')::numeric, (ln ->> 'compareUnitPrice')::numeric, (ln ->> 'lineTotal')::numeric,
      case when ln -> 'customization' = 'null'::jsonb then null else ln -> 'customization' end,
      case when ln ->> 'shopifyVariantId' is not null
        then jsonb_build_object('shopify_variant_id', ln ->> 'shopifyVariantId', 'sku', ln ->> 'sku')::text end
    );
  end loop;

  if _credit_to_apply > 0 then
    -- The existing credit rule. If it raises, this whole order rolls back.
    perform public.apply_credit_to_order(_order_id, _credit_to_apply);
  end if;

  _due := round(_subtotal - _credit_to_apply, 2);
  update bulk_order_requests
    set amount_due = _due,
        payment_method = case when _credit_to_apply <= 0 then 'invoice' when _due <= 0.01 then 'credit' else 'split' end
    where id = _order_id;

  _result := jsonb_build_object(
    'orderId', _order_id,
    'orderNumber', _number,
    'status', 'submitted',
    'subtotal', _subtotal,
    'creditApplied', _credit_to_apply,
    'amountDue', _due,
    'currency', 'USD',
    'quote', _quote,
    'replayed', false
  );
  update portal_idempotency_keys set result = _result
    where user_id = auth.uid() and operation = 'order_request' and key = _idempotency_key;
  return _result;
end $function$;

revoke all on function public.portal_submit_order_request(uuid, uuid, jsonb, numeric, text, text, text, numeric, integer) from public, anon;
grant execute on function public.portal_submit_order_request(uuid, uuid, jsonb, numeric, text, text, text, numeric, integer) to authenticated;

select 'Portal stage 2 applied' as result;
