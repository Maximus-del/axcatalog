-- ============================================================================
-- Portal lineup: Live vs Archive
--
-- My Gear shows two tabs, decided by the product's store status (AX controls
-- it from V2), not by anything the client toggles:
--   Live    = published  (on the website)
--   Archive = archived   (off the website, still orderable — AX reprints it
--                         from the design file)
--   draft   = never shown to clients (unchanged)
--
-- The only server change: portal_quote_order (and so
-- portal_submit_order_request, which prices through it) accepts archived
-- products, and treats them as made to order — Shopify stock for a product
-- that is no longer on the store is not a reason to refuse it.
-- Nothing else about pricing, credit or idempotency changes. Safe to re-run.
-- ============================================================================

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
    if prod.status not in ('published', 'internal', 'archived') then
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
    -- Archived: off the website, so Shopify stock no longer applies. AX makes
    -- it again from the design file, like any made-to-order product.
    if prod.status = 'archived' then
      has_dims := false;
    end if;
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
