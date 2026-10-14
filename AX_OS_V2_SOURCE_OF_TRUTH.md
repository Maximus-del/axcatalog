# AX OS V2 — Source of Truth

Living architectural record for AthleteXclusive OS V2.
Last updated: 2026-08-31 · Audit base: `main` @ `c9c34a5` · Supabase `cuidofxidstqpgypxcop`

**Rules for this document**

- Record what IS, not what would be tidy.
- Where ownership has not been deliberately decided, write `TO RECONCILE` and stop. Do not invent an answer.
- Update it when a decision is made, not when code is written.

---

## 0. V2 Foundation Audit — summary

| Area | Verdict | Note |
|---|---|---|
| Supabase schema (110 tables) | **REUSE** | Broad, RLS-enforced, org-scoped. No rewrite warranted. |
| Auth / permissions | **REUSE** | `RequireAdmin` + `is_org_accessible(organization_id)`. V2 sits behind the same guard. |
| Entity model (`athletes` + `entity_type` + `roles[]`) | **REUSE** | Already the right shape. V2 is the first surface to use it properly. |
| Shopify integration (17 edge functions) | **REUSE** | Untouched this pass. |
| Blanks (`blanks`, `blank_colors`, `blank_sizes`, `blank_assortments`) | **REBUILD UI** | Data is good; V1 splits it across three operator areas. |
| Blank photography (`blank_images`, Drive) | **TO RECONCILE** | Table exists, **0 rows**. `drive_product_folder_id` null on all 48 blanks. |
| Blank inventory (`blank_variants`, `blank_inventory_levels`) | **TO RECONCILE** | Tables exist, **0 rows**. Scaffolded, never populated. |
| Pricing | **EXTEND** | Tier prices live on `blanks`. `pricing_rules` + `org_pricing_config` exist but are **empty**. |
| Designs | **TO RECONCILE** | 107 of 114 are concept art, not artwork. See §3. |
| Product Concept | **EXTEND (new columns, no new table)** | Modelled on `mockups`. See §5. |
| Collections | **REUSE** | Already Shopify-independent. |
| Products | **REUSE** | 217 rows, 168 Shopify-synced. |
| Orders | **REUSE backend / TO RECONCILE attribution** | See §8. |
| Design Templates system | **REUSE — do not rebuild** | V2 links out to it. |
| Athlete Dashboard / Goat Farm Access | **REUSE — do not rebuild** | V2 links out to them. |
| Google Drive | **TO RECONCILE** | No live Drive linkage in the database today. |

---

## 1. ENTITY SOURCE

| | |
|---|---|
| **Current source** | `public.athletes` (58 rows; 9 real, 49 seeded demo flagged `metadata.demo=true`). |
| **Intended canonical source** | Same table. **Decided.** |
| **Shape** | `entity_type` (person / organization / school / team / brand / facility / agency / other) and `roles[]` (athlete / client / partner / vendor / sponsor) are separate axes on one row. |
| **Dependencies** | Every `products`, `designs`, `collections`, `mockups`, `product_athletes`, `design_athletes` row FKs to `athletes.id`. |
| **Migration status** | No migration needed. V2 reads it directly. |
| **Known conflicts** | `athletes.full_name` is a GENERATED column and cannot be written — `display_name` is authoritative. Only 3 of 9 real entities have `display_name` set; the rest fall back to first+last, which produces junk for org-shaped rows (`Dashletics` + `.`, `Hearts  and` + `Hands`, `Moons` + `House`). |
| **Live composition** | person/athlete 55 (44 archived) · organization/client+partner 2 · school/client 1. |
| **Decisions** | The table name stays `athletes` despite modelling non-athletes. Renaming would break every FK and every V1 page for zero functional gain. V2 calls it **People** in the interface and never shows the table name. |

**TO RECONCILE**
- `display_name` is unset on 6 of 9 real entities. Backfill needed before V2 replaces V1 as the primary surface.
- Entity avatars: `athletes.metadata.avatar_url` is the only image field and is **null for every real entity**. No headshot/logo source is decided. Candidates: Drive, `brand-assets` bucket, per-entity upload.
- No per-entity contact records exist (`primary_contact` is a single free-text column).

---

## 2. BLANK SOURCE

| | |
|---|---|
| **Current source** | `public.blanks` (48) + `blank_colors` (489) + `blank_sizes` (245). |
| **Intended canonical source** | `public.blanks` as the single canonical Blank. **Decided.** |
| **Attributes that resolve back to it** | photography, colours, sizes, cost, tier prices, availability, assortment eligibility. |
| **Migration status** | V2 reads the canonical record already. Legacy duplicates not yet merged. |

**Live data quality (2026-08-26)**

- 46/48 have an `image_url`; 47/48 have a cost; 48/48 have all three tier prices.
- 0/48 have `shopify_product_id`. 0/48 have `drive_product_folder_id`.
- Brand identity is spread across **three columns** — `brand`, `supplier`, `vendor` — used inconsistently. V2 resolves `brand ?? supplier ?? vendor` in one place (`src/lib/v2/data.ts`).
- Suppliers present: AXISM, Cotton Collective, OttoCap, Independent (+1).

**TO RECONCILE**
- **Duplicate blanks.** At least one legacy record (`CC 7.5oz Tee` — brand set, no supplier/style/cost/colours) duplicates a properly-structured Cotton Collective record. A full duplicate sweep has not been run.
- **Brand column ownership.** `brand` vs `supplier` vs `vendor` — pick one, migrate, drop the others.
- **`blank_images` is empty.** The Drive-backed photography table has 0 rows while 46 blanks carry a `blanks`-bucket `image_url`. Two photography paths exist and neither is declared canonical.
- **`blank_variants` / `blank_inventory_levels` are empty.** Inventory has no live source.

---

## 3. DESIGN SOURCE

| | |
|---|---|
| **Current source** | `public.designs` (114) + `design_files` (110). |
| **Intended canonical source** | Same tables, with the meaning of a Design tightened. **Decided.** |
| **Definition (V2)** | A Design is **artwork** — production-ready, artwork-only, normally a transparent PNG. |

**This is the single most important finding of the audit.**

- **107 of 114** designs have `status = 'concept'`.
- **103 of 110** design files are `file_type = 'mockup'`. Only **7** are `file_type = 'export'`.
- Titles are generator filenames: `ChatGPT Image Aug 16, 2026, 03 11 02 PM (1)`.

The Designs library is, in practice, a dump of AI-generated **concept imagery**, not an artwork library. This is exactly the Design/Concept conflation V2 exists to separate.

**V2 behaviour:** `productionReady` is true only when an `export` file exists. The Creative area labels everything else *concept art* rather than silently treating it as artwork. Nothing was migrated or deleted.

**TO RECONCILE**
- Who owns the reclassification of the 107 concept-art designs? Options: (a) leave as designs and filter, (b) convert to Product Concepts, (c) archive. **Not decided.**
- **Two design→entity linking systems coexist:** `design_athletes` (67 rows) + `design_teams` (0) *and* `design_associations` (37 rows, polymorphic entity_type in {athlete, team}). V2 reads `design_athletes`. Which one wins is undecided.
- `design-files` is a **private** bucket; every read needs a signed URL. Fine, but it rules out plain `<img src>` from any surface.
- The existing global **PNG Creation** workflow was not touched and is not yet wired into V2's "upload my own design" path.

---

## 4. PRODUCT CONCEPT SOURCE

| | |
|---|---|
| **Current source** | `public.mockups`, `kind = 'concept'`. |
| **Intended canonical source** | Same. **Decided this session.** |
| **Migration status** | Live. 10 additive columns applied 2026-08-26 (migration `v2_product_concepts_on_mockups`). |

### Why `mockups` and not a new `product_concepts` table

`mockups` already carried `design_id`, `blank_id`, `athlete_id`, `product_id`, `team_id`, org-scoped RLS (`mockups_org_access`), a storage bucket and an upload edge function (`mockup-upload-url`). Its declared purpose — a visual of a design on a blank — **is** the Product Concept definition. Creating a parallel table would have been creating a duplicate backend object because the existing one was inconveniently named.

**Columns added (all additive, all reversible):**

`kind` ('photo' | 'concept', default 'photo') · `collection_id` · `color_name` · `surface` · `zone_id` · `placement_label` · `approval_state` ('none'|'pending'|'approved'|'changes_requested') · `approval_note` · `image_url` · `created_from` (jsonb provenance)

Plus three indexes and two check constraints. No column was altered or dropped. The 42 existing rows became `kind='photo'` and are unaffected.

**Consequences accepted**
- V1's `/admin/mockups` gallery will list V2 concepts alongside photos. It still works; it is just less tidy. V1 was not modified.
- If the two concepts genuinely diverge later, splitting `kind='concept'` into its own table is a mechanical migration — the FKs are already right.

**Concept stage is DERIVED, never stored** (`stageOf()` in `src/lib/v2/concepts.ts`): idea → specified → awaiting_approval → approved / changes_requested → productized. A stored stage column would drift from the underlying relationships, the same call V1 made for product lifecycle.

**A concept requires nothing but an image and an entity.** Not a Shopify product, not variants, not inventory, not final pricing, not a production PNG.

---

## 5. PRODUCT SOURCE

| | |
|---|---|
| **Current source** | `public.products` (217) + `product_images` (565) + `product_variants` (1006) + `product_athletes` (81). |
| **Intended canonical source** | Same. **Decided.** AX owns the product; Shopify is the storefront. |
| **Live state** | 98 published · 103 draft · 16 archived. 168 Shopify-synced, 49 not. `approval_state='none'` on all 217. |

**Known conflicts**
- `product_variants.shopify_variant_id` is `NOT NULL`, so AX-native products cannot use the variants table and keep colours/sizes in `products.metadata` instead. Two representations of the same thing.
- `product_images` covers 180 of 217 products.
- `product_collections` (0 rows) and `collection_products` (14 rows) are two tables for the same relationship. `collection_products` is the live one.

---

## 6. COLLECTION SOURCE

| | |
|---|---|
| **Current source** | `public.collections` (5) + `collection_products` (14) + `collection_designs` (7). |
| **Intended canonical source** | Same. **Decided.** |
| **Rule** | A Collection is a permanent grouping and **must never require a Shopify product**. It already does not. |
| **Live** | Proactive Sports Performance · Darnell Mooney x Bears · Darnell Mooney x Falcons · Steven Shareef · Mooney World. 4 of 5 are entity-scoped. |

V2 adds concepts to what a collection can contain, via `mockups.collection_id`. No schema conflict: a Collection may now hold Designs, Product Concepts and Products at once.

**TO RECONCILE** — `design_collections` (2 rows) is a *separate* table from `collection_designs` (7 rows) and unrelated to `collections`. Two grouping systems for designs.

---

## 7. INVENTORY SOURCE

| | |
|---|---|
| **Current source** | **None live.** `blank_variants` (0) and `blank_inventory_levels` (0) are empty. `blank_colors.current_stock` and `blank_sizes.current_stock` exist and are the only populated-capable fields. `product_variants.inventory_quantity` mirrors Shopify. |
| **Intended canonical source** | `TO RECONCILE` |
| **Note** | A table comment already declares the intent: *"quantities live in blank_inventory_levels and come from Shopify only."* That intent has never been executed. V2 shows no inventory numbers rather than showing wrong ones. |

---

## 8. ORDER SOURCE

| | |
|---|---|
| **Current source** | `public.orders` (646) + `order_line_items` (626). `shopify_orders` (637) + `shopify_order_line_items` (866) are the raw sync mirror. |
| **Intended canonical source** | `orders` / `order_line_items`. **Decided.** |
| **Attribution** | `orders.attributed_org_id` → `organizations`, driven by `product_attribution_rules` (49 rows) matching SKU/title text. |

**TO RECONCILE — order attribution is the biggest structural gap V2 found.**

- **0 of 626** line items have a non-null `product_id`. There is no link from an order line to a product record.
- Consequently per-entity revenue cannot be derived at all.
- Attribution resolves to an *organisation*. Only entities that own an organisation (Darnell Mooney → 114 orders, Steven Shareef → 3) resolve. Entities inside the shared Athlete Xclusive org (Abbotsford, Dash Letics, Hearts and Hands…) all "match" the same 351 org orders, which is meaningless.
- 11 orders have no attribution at all.

V2 states this limitation in the interface rather than showing a plausible-looking wrong number.

---

## 9. MEDIA SOURCE

| Asset | Live source | Bucket visibility |
|---|---|---|
| Design artwork | `design-files` bucket via `design_files` | **private** (signed URL) |
| Product photography | `product-images` bucket via `product_images` | public |
| Blank photography | `blanks` bucket via `blanks.image_url` / `blank_colors.image_url` | public |
| Mockups / concepts | `mockups` bucket | **private** (signed URL) |
| Content media | `content-media` | public |
| Design references | `design-references` | — |
| Brand assets | `brand-assets` (`brand_assets` table: **0 rows**) | — |

**GOOGLE DRIVE RESPONSIBILITY — `TO RECONCILE`**

There is **no live Google Drive linkage in the database**. `blank_images` (the Drive-backed table, with `drive_file_id` / `drive_folder_id` / `drive_url`) has 0 rows. `blanks.drive_product_folder_id` is null on all 48 rows. `blanks.last_drive_sync_at` is null.

The intent — Drive as canonical for blank photography, athlete assets, product assets, brand assets — is recorded and **not yet executed**. Nothing was migrated this pass. Before any migration: inventory the Drive sources, compare against the `blanks`-bucket copies, and decide which wins per asset class.

---

## 10. PRICING SOURCE

| | |
|---|---|
| **Current source in-app** | `blanks.blank_cost` + `blanks.price_athlete` / `price_corporate` / `price_standard`. Populated for all 48 blanks. |
| **Current source of record (external)** | Google Drive workbook **"Blanks-Master-Pricing"** — chosen as master, not connected to the app. |
| **Intended canonical source** | `TO RECONCILE` — the Drive master is the business source; `blanks` is the runtime source. The sync direction is undecided. |
| **Empty scaffolding** | `pricing_rules` (0), `org_pricing_config` (0), `volume_discount_tiers` (0). `pricing_tiers` (3: Athlete/Corporate/Standard) and `volume_discount_breaks` (4) are populated. |

Observed markup on live data: Athlete ≈ cost × 1.4, Corporate ≈ × 1.8, Standard ≈ × 2.2 — consistent with the Tier 1/2/3 +40/+80/+120% model, applied to blank cost only. Print/decoration pricing lives in a *separate* external sheet and is not in the database.

**ACCESS AND PRICE ARE SEPARATE — decided and implemented.**
Access is `blank_assortment_items` → `blank_assortments`. Price is the tier columns. A blank is never duplicated to give an audience a different number. Live assortments: Athlete Catalog (6 blanks), Client Catalog (6), Subscriber Catalog (0), Standard Catalog (46).

**TO RECONCILE** — 42 of 48 blanks sit only in the Standard catalog; the Athlete and Client catalogs are barely populated and the Subscriber catalog is empty. Curation is a business decision, not a data fix.

---

## 11. SHOPIFY RESPONSIBILITY

**Decided.** Shopify is the customer-facing commerce and checkout layer. AX owns the richer internal context: entity, design, design template, product concept, collection, approval, blank, product configuration, drop, creative lineage, access relationships, assortments.

Intended flow (unchanged by V2):
`AX Product Configuration → Approval → Push/Sync to Shopify → store Shopify ID / handle / URL back on the AX Product → surface in athlete / client / fan experiences`

17 edge functions handle this today. **`shopify-create-product` has never been verified against the live store** — first push needs supervision. V2 touched none of it.

---

## 12. MEMBERSHIP / ACCESS

Reused as-is: `organization_memberships`, `membership_plans` (2), `subscriptions` (0), `fan_profiles`, `athlete_follows` (10). **No billing infrastructure was built and none should be until deliberately scheduled.**

---

## 13. LEGACY FEATURES NOT YET MIGRATED

See `AX_LEGACY_FEATURE_MAP.md` for the full inventory and per-feature decision.

V2 depends on V1 today for: design upload / PNG creation, design templates, collection editing, product editing, blank editing, order detail, Shopify push, imports, questionnaires, print zones, users/settings. Every V2 deep-link into `/admin/...` is deliberate and marked in the interface.

---

## 14. OPEN DECISIONS QUEUE

Ordered by how much downstream work they unblock.

1. **Order → product linkage.** Nothing about per-entity revenue works until line items carry a product id.
2. **Blank photography canonical source** — Drive vs `blanks` bucket.
3. **Design library reclassification** — what happens to the 107 concept-art designs.
4. **Pricing sync direction** — Drive master → `blanks`, or `blanks` becomes the master.
5. **Entity avatars** — no source exists at all.
6. **Brand column** — `brand` / `supplier` / `vendor` collapse to one.
7. **Design linking** — `design_athletes` vs `design_associations`.
8. **Inventory** — whether `blank_inventory_levels` is ever populated or the tables are dropped.

---

## 15. DECISIONS — 31 August 2026

Recorded because they were decided, not because code was written.

**Placement is `surface`, not `zone_id`.** `isConfigurable()` tested `zone_id`
for "has a placement". V2 placement is freeform and the canvas clears the zone
the instant artwork is dragged — which is every real mockup — so a finished,
hand-positioned mockup reported as an unspecified "Idea" and both
ready-to-configure queues could never fire. Placement is now `surface`, which
is written whenever anything is actually placed.

**Print zones are out of the V2 interface.** The last path that forced one
(uploading artwork onto the back) no longer does. `print_zones` and
`src/lib/v2/placements.ts` stay: the table is still maintained by V1's editor,
older `product_print_placements` rows still carry `zone_id`, and
zones-as-suggestions is the likely next use. Nothing in `/admin-v2` reads them.

**`mockups.client_visible` (boolean, default false).** Additive, applied live.
Deliberately not the `design_client_visibility` enum: that enum answers "which
rendition may the client see" — production PNG or safe preview — and a mockup
has one rendition, the flattened composite, which is already client-safe.

  **TO RECONCILE / BLOCKED.** Nothing client-facing reads it yet. Designs have
  the equivalent switch enforced in Postgres by `design_client_visible()` plus
  storage policies; mockups need the same before a client session can see one.
  That policy widens what a client may read and is Chase's decision, not an
  autonomous one. Until it exists the operator interface says "marked for the
  client — the athlete-facing view is not built yet".

**`asset_folders.cover_mockup_id` and `design_collections.cover_design_id` are
both writable.** Both were read by `coverOf()` and neither could ever be set,
so choosing a folder cover meant reordering the shelf until the right item was
first.

**Naming is settled and written down.** See `AX_V2_NAMING.md`. The interface
word for a `mockups` row with `kind='concept'` is **Mockup**, everywhere.
"Product concept" is a storage discriminator and does not appear on screen.

**Every V2 write checks its error.** Supabase returns errors rather than
throwing them, and most writes in `src/lib/v2/data.ts` ignored the result — a
rejected change resolved happily, toasted success, refetched and put the old
value back. All of them now go through `must()`.

**V1 decommissioning has its own document.** `AX_V1_DECOMMISSIONING.md`: what
V2 has taken over, what V1 still owns on purpose, and the four steps that must
happen before any table is dropped. It authorises no deletion.
