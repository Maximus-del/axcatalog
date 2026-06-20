# Phase 2 — Shopify Variants & Colorways

## 1. New `product_variants` table

One row per Shopify variant. Mirrors what Shopify returns from `/admin/api/products/{id}/variants.json` plus image link + cached availability.

```text
product_variants
─────────────────────────────────────────────
id                       uuid pk
product_id               uuid fk → products.id (cascade delete)
shopify_variant_id       text  unique per product, indexed
shopify_inventory_item_id text                    -- for inventory lookups
sku                      text
title                    text                     -- e.g. "Black / L"
position                 int                      -- Shopify ordering
option1_name             text                     -- usually "Color"
option1_value            text                     -- e.g. "Black"
option2_name             text                     -- usually "Size"
option2_value            text                     -- e.g. "L"
option3_name             text
option3_value            text
color                    text  generated/normalized (lower(trim(option_value where name ilike 'color')))
size                     text  generated/normalized
price                    numeric(10,2)            -- Shopify retail
compare_at_price         numeric(10,2)
currency                 text default 'USD'
weight_grams             int
barcode                  text
shopify_image_id         text                     -- links to product_images.shopify_image_id
inventory_quantity       int                      -- snapshot at last sync
inventory_policy         text                     -- 'deny' | 'continue'
available                bool generated as (inventory_policy='continue' OR coalesce(inventory_quantity,0) > 0)
requires_shipping        bool default true
taxable                  bool default true
metadata                 jsonb default '{}'
synced_at                timestamptz
created_at, updated_at   timestamptz default now()

unique (product_id, shopify_variant_id)
index  (product_id, color)
index  (product_id, size)
index  (shopify_variant_id)
```

Grants follow the standard pattern:
- `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated`
- `GRANT ALL ... TO service_role`
- No `anon` grant.

RLS:
- `SELECT`: any authenticated user whose org owns the parent product (same predicate already used on `product_images`).
- `INSERT/UPDATE/DELETE`: restricted to admins via `current_user_is_admin()`; sync edge function writes with the service role.

We keep `products.shopify_variant_ids` jsonb as-is for backward compatibility but stop reading from it once the table is populated.

## 2. How Shopify data is stored

| Concept | Storage |
|---|---|
| Variant id | `shopify_variant_id` (text — Shopify ids are bigints, kept as text) |
| Color | `option{N}_value` where corresponding `option{N}_name ilike 'color'`, plus `color` normalized column |
| Size | same pattern → `size` |
| Price / compare | `price`, `compare_at_price` |
| Inventory | `inventory_quantity` snapshot + `inventory_policy`; derived `available` bool |
| Image link | `shopify_image_id` joins to existing `product_images.shopify_image_id` so each colorway shows its own swatch |
| Stock fan-out | Live multi-location inventory is out of scope — we cache aggregate `inventory_quantity` Shopify returns, refreshed by the sync |

We do **not** store per-location inventory yet. If needed later, add `product_variant_inventory_levels` keyed by `shopify_location_id`.

## 3. Sync function changes

Extend the existing `shopify-sync-product-images` function (it already pulls the full product payload) **or** add a sibling `shopify-sync-product-variants` that shares the auth + fetcher helpers. Recommend a sibling to keep blast radius small:

`supabase/functions/shopify-sync-product-variants/index.ts`

Flow per product:
1. Resolve product → fetch `GET /products/{shopify_product_id}.json` once (returns `variants[]`, `options[]`, `images[]`).
2. Upsert each variant into `product_variants` on `(product_id, shopify_variant_id)`:
   - Map `option1/2/3_name+value` from product `options[]`.
   - Normalize `color`/`size` columns.
   - Copy `price`, `compare_at_price`, `inventory_quantity`, `inventory_policy`, `image_id` → `shopify_image_id`.
   - Set `synced_at = now()`.
3. Mark rows whose `shopify_variant_id` is no longer in the payload as orphaned (soft delete via `metadata.orphaned_at`, not a hard delete — preserves history for past orders).
4. Return `{ products_processed, variants_inserted, variants_updated, variants_orphaned, errors[] }` matching the existing image-sync response shape.

Trigger points:
- Manual: new admin button "Refresh Variants" on the product detail drawer, plus a bulk "Refresh All Variants" on the dashboard (mirrors the existing image refresh UI).
- Auto: extend `shopify-sync-pending` to call this function for every product it touches, so newly linked Shopify products arrive with variants on first sync (closes audit item C5).
- Webhook (later): `products/update` already routes through `shopify_webhooks` — add a handler branch that enqueues a variant resync.

Auth: `verify_jwt = true`, admin-only callable. Service role used internally for writes.

## 4. `usePortalProducts` exposure

Add a `variants` array to each `PortalProduct`:

```ts
interface PortalVariant {
  id: string;
  shopifyVariantId: string;
  color: string | null;
  size: string | null;
  price: number | null;
  available: boolean;
  inventoryQuantity: number | null;
  imageId: string | null;   // links to PortalProductImage.shopifyImageId
}

interface PortalProduct {
  // …existing fields
  variants: PortalVariant[];
  colors: string[];   // distinct, ordered by position
  sizes:  string[];   // distinct, ordered by Shopify position
}
```

Implementation:
- One extra `supabase.from('product_variants').select(...).in('product_id', ids)` call in the same batch as `product_images`. No N+1.
- Derive `colors` / `sizes` client-side from the variants array (memoized).
- If a product has zero variants, fall back to the existing `blank_colors` / `blank_sizes` path so non-Shopify products keep working.

## 5. `ProductOrderDialog` changes

Today: pulls colors from `blank_colors` (generic catalog). Swap to:

1. If `product.variants.length > 0`:
   - **Color picker** = distinct `variants[].color`, each swatch keyed to its variant image (`shopify_image_id` → image URL) so picking "Charcoal" actually shows the charcoal hero.
   - **Size picker** = `variants` filtered by selected color, grouped by `size`. Disable sizes where `available === false` with a "Out of stock" tag.
   - **Unit price** = variant `price` (already wholesale-adjusted upstream by `usePortalPricing`).
   - Order line item carries `shopify_variant_id` so the bulk order request maps cleanly downstream.
2. Else fall back to current `blank_colors` / `blank_sizes` UI unchanged.

No schema changes to `bulk_order_items` needed today — the existing `variant_id` / `sku` columns can hold the Shopify variant id.

## 6. `BulkOrderSheet` changes

Two fixes:

a. **Variants** — same swap as the order dialog: build the color × size grid from `product.variants`, gray out unavailable cells, store `shopify_variant_id` per cell.

b. **Tiers** — stop using hardcoded `VOLUME_TIERS`. Read from the org's `volume_discount_tiers` (joined through `volume_discount_breaks` → `org_pricing_config`) which is what `config.tiers` already references in `PortalDataContext`. Concretely:
   - Add a `useVolumeTiers(orgId)` hook returning `[{ minQty, discountPct }, …]` sorted ascending.
   - Replace the literal `VOLUME_TIERS` constant with the hook's value.
   - Fallback to a sensible default (10/25/50/100 at 0/5/10/15%) only when the org has no tiers configured, behind a clear `Using default tiers` notice.

## Rollout order

1. Migration (schema + RLS + grants only — empty table).
2. New `shopify-sync-product-variants` edge function + admin "Refresh Variants" button.
3. One-time backfill (admin clicks "Refresh All").
4. Extend `usePortalProducts` to read variants.
5. Switch `ProductOrderDialog` to variants (with fallback).
6. Switch `BulkOrderSheet` to variants + real tiers.
7. Wire `shopify-sync-pending` to call the variant sync.

Steps 1–3 are safe to ship independently of 4–7 (data appears, UI ignores it until ready).

## Open questions before I write the migration

1. **Inventory truthiness** — OK to treat `inventory_policy='continue'` as "always available" (Shopify's "allow oversell" setting)? That's standard but worth confirming.
2. **Orphaned variants** — soft delete via `metadata.orphaned_at` (recommended, keeps past-order joins working) or hard delete?
3. **Currency** — assume USD everywhere or read `presentment_currencies` per variant?
