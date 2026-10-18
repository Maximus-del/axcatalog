-- Pricing sheet v3: two layers per blank — AX's TRUE COST and what AX CHARGES
-- the client — plus a services line, and a per-product client-price override.
--
-- Additive. Operators only (no client policy). Costs never reach a client.
--
--   blank_cost_presets.cost   — what it costs AX (blank, front, back, services)
--   blank_cost_presets.price  — what AX charges the client for the same line
--   product_pricing.client_price — a per-product override of the client price
--
-- The client's unit price = blank price + front price (+ back price when printed
-- front and back) + services price. The sheet writes that number to
-- products.athlete_price when you Save, which is what portal_sheet_unit_price
-- charges every portal order. Nothing changes on the portal until you Save.

alter table public.blank_cost_presets alter column cost drop not null;
alter table public.blank_cost_presets add column if not exists price numeric(10, 2);

alter table public.blank_cost_presets drop constraint if exists blank_cost_presets_component_check;
alter table public.blank_cost_presets add constraint blank_cost_presets_component_check
  check (component in ('blank', 'front', 'back', 'services'));
alter table public.blank_cost_presets drop constraint if exists blank_cost_presets_cost_check;
alter table public.blank_cost_presets add constraint blank_cost_presets_values_check
  check ((cost is null or cost >= 0) and (price is null or price >= 0));

alter table public.product_pricing add column if not exists client_price numeric(10, 2);
do $$ begin
  alter table public.product_pricing add constraint product_pricing_client_price_check check (client_price is null or client_price >= 0);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- starting numbers
-- Chase's example numbers (Oct 17), so the sheet opens with something real.
-- Only written where nothing is set yet; every one is editable on the sheet.
--   AXISM tee:  blank $12 → $18 · front print $2 → $5 · back print $2 → $3 (front + back = $8)
--   Hoodie:     blank cost from the catalogue, same print lines; client prices left for Chase.
--   Mooney:     AX keeps 10% of the profit after his cost (he keeps 90%).
insert into public.blank_cost_presets (v2_blank_id, component, cost, price) values
  ('da7d45ff-5f70-4cd6-959e-31955488290f', 'blank', 12, 18),
  ('da7d45ff-5f70-4cd6-959e-31955488290f', 'front', 2, 5),
  ('da7d45ff-5f70-4cd6-959e-31955488290f', 'back', 2, 3),
  ('cec81b15-e1ed-4a31-84eb-aaefd32bd184', 'front', 2, 5),
  ('cec81b15-e1ed-4a31-84eb-aaefd32bd184', 'back', 2, 3)
on conflict (v2_blank_id, component) do nothing;

update public.athletes
   set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('brand_terms',
       jsonb_build_object('revenue_share_percent', 90, 'split_basis', 'profit'))
 where id = '74bb5183-5a2b-443b-9b07-bf52ef89c722'
   and (metadata -> 'brand_terms') is null;
