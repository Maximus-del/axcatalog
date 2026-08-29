-- Three independent flags. They will normally agree during the MVP, which is
-- exactly why they are stored separately: collapsing them while they agree
-- makes the first disagreement inexpressible.
--
--   is_inventory_managed  do Shopify quantities and barcodes govern this blank?
--   is_main_rotation      is it in the printing and marketing catalogue?
--   internal_only         (existing) should the dashboard hide it?
--
-- Neither new flag is ever derived — not from Shopify status, title, vendor,
-- product type, barcode presence, quantity, Drive folder or assortment. A
-- person sets them or they are false. That is the safety property: there is no
-- inference path from "a Shopify product exists" to "it is tracked stock".
alter table public.blanks
  add column if not exists is_main_rotation boolean not null default false,
  add column if not exists is_inventory_managed boolean not null default false;

comment on column public.blanks.is_main_rotation is
  'Merchandising decision: part of the primary printing/marketing catalogue. Never derived.';
comment on column public.blanks.is_inventory_managed is
  'Explicit approval that Shopify quantities/barcodes govern this blank. Reconciliation and inventory webhooks operate on this allowlist alone.';

create index if not exists blanks_main_rotation_idx
  on public.blanks (is_main_rotation) where is_main_rotation;
create index if not exists blanks_inventory_managed_idx
  on public.blanks (is_inventory_managed) where is_inventory_managed;
create index if not exists blanks_managed_unlinked_idx
  on public.blanks (id) where is_inventory_managed and shopify_product_id is null;
