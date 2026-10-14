# AX Legacy Feature Map (V1 → V2)

Inventory of the existing operator dashboard, so V1 becomes an **intentional backlog** rather than something V2 blindly reproduces.

Audit base: `main` @ `c9c34a5` · 2026-08-26 · 41 admin pages across ~45 routes.

**Decision rule applied to every row**

```
Does this feature still matter?
  no  → RETIRE (do not migrate)
  yes → Is the existing backend good?
          yes → REUSE BACKEND, rebuild only the operator experience
          no  → document why, repair or replace deliberately, then add to V2
```

**Status key** — `KEEP` migrated or intentionally reused as-is · `REBUILD UI` backend good, operator experience to be rebuilt in V2 · `LATER` matters, not this pass · `RETIRE` candidate for deletion, needs your confirmation

---

## Migrated or reused in this pass

| Feature | V1 route | Backend | Integrations | V2 status |
|---|---|---|---|---|
| Operator overview | `/admin` (`AdminOverview`) | multiple | — | **REBUILD UI** — replaced by `/admin-v2` Overview (action-first, 4 stats) |
| Athletes list | `/admin/athletes` | `athletes` | — | **REBUILD UI** — replaced by `/admin-v2/people` (entity-aware, not athlete-only) |
| Athlete detail | `/admin/athletes/:id` | `athletes` + 8 joins | — | **REBUILD UI** — replaced by `/admin-v2/people/:id` entity workspace. V1 kept for tabs V2 has not built (Content / Access / Events / Drops) |
| Blanks list | `/admin/blanks` | `blanks` | — | **REBUILD UI** — replaced by the unified Blank Catalog |
| Blank detail | `/admin/blanks/:id` | `blanks`,`blank_colors`,`blank_sizes` | — | **KEEP** — V2 drawer links here to edit |
| Pricing master | `/admin/pricing` | `blanks` price columns | Drive sheet (manual) | **REBUILD UI** — folded into the Blank Catalog as an *attribute*, not a separate area |
| Designs list | `/admin/designs` | `designs`,`design_files` | `design-files` bucket | **REBUILD UI** — V2 Creative separates artwork from concept art |
| Design detail | `/admin/designs/:id` | `designs`,`design_files` | signed URLs | **KEEP** — V2 links here |
| Collections list / detail | `/admin/collections`, `/:id` | `collections`,`collection_products`,`collection_designs` | — | **KEEP backend, partial UI** — V2 shows collections; editing stays in V1 |
| Products list | `/admin/products` | `products`,`product_images` | Shopify | **REBUILD UI** (partial) — V2 Commerce shows a visual grid; bulk tag mode stays V1 |
| Product detail | `/admin/products/:id` | `products` + variants + designs | Shopify | **KEEP** — V2 links here |
| Orders list / detail | `/admin/orders`, `/:id` | `orders`,`order_line_items` | Shopify | **KEEP backend, thin V2 list** — fulfilment untouched |
| Mockups gallery | `/admin/mockups` | `mockups` | `mockups` bucket | **EXTENDED** — same table now also stores V2 Product Concepts (`kind='concept'`) |
| Print zones editor | `/admin/print-zones` | `print_zones` (7 rows) | — | **KEEP** — V2 placement presets merge over these rows |

---

## Deliberately not rebuilt (strong as they are)

| Feature | Location | Why | V2 status |
|---|---|---|---|
| **Athlete Dashboard** (portal) | `/portal/*` — 12 pages | Already strong | **KEEP** — V2 is the control layer underneath it |
| **Goat Farm Access** (fan) | `/feed`, `/a/:slug`, `/p/:id`, `/join` | Already strong | **KEEP** — V2 links to the fan profile from the entity workspace |
| **Design Template system** | `/admin/templates`, design template pages¹ | Style DNA, reference sets, master prompts, athlete best-fit, questionnaire matching | **KEEP — do not rebuild.** V2 Creative links out |
| Public wholesale catalog | `/catalog/*` | Tokenised customer links, working | **KEEP** |
| Affiliate surface | `/affiliate/*` | Working, 0 live rows | **LATER** |

¹ The Design Template Library pages (`/admin/design-templates`) ship in a patch that is **not on `main`**. See "Repository state" below.

---

## Parked — matter, but not this pass

| Feature | V1 route | Backend | V2 status | Why parked |
|---|---|---|---|---|
| Content management | `/admin/content` | `content_assets` (2 rows) | **LATER** | Fan-surface feature; V2 north star is People→Creative→Commerce→Orders |
| Access / memberships | `/admin/access` | `membership_plans`,`subscriptions` | **LATER** | Explicitly out of first-pass scope |
| Events | `/admin/events` | `events` (1 row) | **LATER** | Same |
| Drops | athlete-detail tab | `drops` (2), `drop_products` (6) | **LATER** | Commerce sub-area when it earns one |
| Analytics | `/admin/analytics` | derived | **LATER** | Overview covers "what needs attention"; charts are a separate question |
| Inbox / messages | `/admin/inbox` | `portal_threads`,`portal_messages` (1 each) | **LATER** | Real feature, barely used yet |
| Tasks | `/admin/tasks` | `tasks` (1 row) | **LATER** | Overlaps with Overview → Action Required. Decide which survives |
| Fulfilment | `/admin/fulfillment` | `fulfillment_materials` (0) | **LATER** | Do not rewrite fulfilment |
| Print queue | `/admin/print-queue` | derived | **LATER** | Production workflow, needs its own pass |
| Brand assets | `/admin/brand-assets` | `brand_assets` (**0 rows**) | **LATER** | Empty. Revisit with the Drive decision |
| Credits | `/admin/credits` | `athlete_credit_wallets` (58) | **LATER** | Populated but unused in workflows |
| Questionnaires | `/admin/questionnaires`, `/:id` | `questionnaires` (2), 8 questions | **LATER** | Feeds design-template matching; keep in V1 for now |
| Customer pricing links | `/admin/pricing-links` | `catalog_access_tokens` (3) | **LATER** | Works; belongs with the assortment/audience model eventually |
| Order CSV imports | `/admin/imports/orders`, `/:id` | `import_batches`,`product_attribution_rules` (49) | **KEEP in V1** | Historical backfill tool. No V2 need |
| Ingestion queue | `/admin/ingestion`, `/:id` | `ingestion_jobs` (5) | **LATER** | Product-scraping pipeline |
| Teams | `/admin/teams`, `/:id` | `teams` (3) | **TO RECONCILE** | Overlaps `entity_type='team'`. Two ways to model a team |
| Organizations | `/admin/organizations`, `/:id` | `organizations` (15) | **KEEP in V1** | Tenant administration, not day-to-day operating |
| Users / team | `/admin/users`, `/admin/team` | `user_profiles`,`organization_memberships` | **KEEP in V1** | System administration |
| Settings | `/admin/settings` | `system_settings` | **KEEP in V1** | System administration |
| Pulse dashboard | `/admin/pulse` | derived | **RETIRE?** | Second overview page. V2 Overview supersedes it — confirm |
| Affiliates admin | `/admin/affiliates` | `affiliates` (0) | **RETIRE?** | Zero rows across all four affiliate tables — confirm before deleting |

---

## Retire candidates — need your confirmation

Nothing here has been deleted. These are proposals.

| Item | Evidence | Proposal |
|---|---|---|
| `/admin/pulse` | Duplicate of the overview concept | Retire once V2 Overview is trusted |
| Affiliate admin + 4 tables | `affiliates`, `affiliate_product_requests`, `affiliate_sales`, `affiliate_payouts` — all 0 rows | Retire or formally park |
| `product_collections` table | 0 rows; `collection_products` (14) is the live one | Drop the empty duplicate |
| `design_teams` table | 0 rows | Drop |
| `design_collections` table | 2 rows, separate from `collection_designs` | Reconcile, then drop one |
| `volume_discount_tiers`, `org_pricing_config`, `pricing_rules` | 0 rows each; superseded by tier columns + order-level discounts | Confirm the pricing model, then drop |
| `blank_mvp_snapshot_20260821`, `blank_rotation_snapshot_20260822` | Dated snapshot tables | Archive/drop once reconciliation is done |
| 44 archived demo athletes | `metadata.demo=true`, seeded for Goat Farm Access | Keep while the fan surface is in development; deletable by that flag |

---

## Repository state — read this before building further

`origin/main` is at **`c9c34a5` (Commerce architecture phase)** and is the only branch on the remote.

Several completed phases were delivered as **patch files and were never pushed**: Design Template Library, Rapid Collection Generation, Reference Set Prompts, Athlete Merch Control Center, and the Entity System. Their **database changes are live** (`athletes.entity_type` / `roles` / `display_name`, `blank_assortments`, `product_approvals`, `product_print_placements`, `design_template_prompts`, `reference_sets`… all present in the live schema), but their **frontend code is not in the repository**.

Practical consequences:

- The live database is **ahead of `main`**. Generated `src/integrations/supabase/types.ts` is stale for those columns, which is why V2 (and existing V1 code) casts with `as never`.
- V2 was written to depend on **none** of the unpushed code, so its patch applies cleanly to `main` *and* to a local tree with those patches applied. The only shared file it touches is `src/App.tsx` (two small hunks).
- Links from V2 to `/admin/design-templates` only resolve if the Design Template Library patch is applied locally. Every other V2 deep link targets a route that exists on `main`.

**Recommendation:** get the outstanding patches onto `main` and regenerate `types.ts` before V2 expands further. Continuing to build against a repository that trails the database is the largest structural risk in this project.
