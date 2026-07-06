# Sidebar Feature Buildout — Phased Plan

This is a large scope. I'll ship it in **8 sequential phases**, one per turn, so each can be verified in the preview before the next. Nothing goes out in a single mega-commit.

## Phase 0 — Foundational migration
One migration file that creates every new table used across the features, in dependency order:
- `tasks`, `task_activity`
- `design_associations` (join table; backfill from `designs.athlete_id`; keep column for BC)
- `asset_folders`, `brand_assets`
- `mockups` (new table; extends existing `mockups` bucket)
- `fulfillment_materials`
- Columns on `blank_colors` / `blank_sizes`: `easy_scan_barcode`, `easy_scan_url`, `current_stock`
- View `blank_variant_barcodes`
- New storage buckets: `brand-assets` (private)
- All tables: GRANTs to authenticated + service_role, RLS enabled, org-scoped policies via `is_org_accessible(organization_id)`, `updated_at` triggers where applicable.

## Phase 1 — Tasks
- Routes: `/admin/tasks` (list + kanban toggle), task detail drawer.
- Filters panel, `+ New Task` modal, drag between kanban columns updates `status`, bulk actions.
- Extend homepage "Today's Priorities" to read from `tasks` (due today OR priority=1 OR in_progress).

## Phase 2 — Fulfillment 6A: Blanks Master Catalog
- New route `/admin/fulfillment` with sub-tabs `Blanks` / `Materials`.
- Blanks tab: expandable list of blanks → variants (color/size) with barcode column, per-row "Generate Label" (browser print of a barcode via JsBarcode), "Print Full Binder" (client-side PDF via jsPDF).
- Sidebar "Fulfillment" points here; "Blanks" stays under Operations for the existing detail editor.

## Phase 3 — Teams
- Route `/admin/teams` — grid of orgs/teams from existing `teams` table, entity-type badges, athletes/products counts.
- `+ Add Organization` modal, click-through detail drawer with Athletes / Products / Designs / History tabs. Terminology switches on `entity_type`.

## Phase 4 — Designs admin
- Route `/admin/designs` refactor: grid with association badges, filter sidebar (athlete/team/brand/status), upload modal writing to `design_associations`, bulk selection.
- Detail view already exists — add associations editor and "Used on products" list.

## Phase 5 — Fulfillment 6B: Materials
- Materials tab on `/admin/fulfillment`. Grid of material cards, filter/search, add/edit modal (photo + artwork uploads to `brand-assets` bucket under `materials/`), detail view with Reorder button, order-history log, "Add to next order" → creates a Task.

## Phase 6 — Brand Assets
- Route `/admin/brand-assets`. Folder tree (`asset_folders`) + file grid (`brand_assets`). Seed suggested folders on first visit per org. Upload dialog with `asset_type`, version_number, is_primary. Palette assets render as swatches with copy-hex buttons.

## Phase 7 — Mockups
- Route `/admin/mockups`. Folder tree + grid. Metadata form with shot_type/drop/photographer/status. Link to product/design/blank/athlete/team. "Send to Shopify" wired to existing `shopify-sync-product-images` (or a new small function) — will confirm scope before wiring push.

---

## Technical notes
- All new tables org-scoped via `current_user_org_id()` + `is_org_accessible()` (patterns already in project).
- Storage: new `brand-assets` bucket (private). Reuse existing `mockups` bucket for Phase 7.
- PDF/barcodes: `jspdf` + `jsbarcode` (client-side only, no server work).
- UI reuses `ax-card`, `ax-section-header`, existing shadcn primitives, `ProductImage`, `useFileDropZone`, `useSignedUrl`.
- Mobile: kanban horizontal-scroll on <md; grids collapse to 1–2 cols.

## Out of scope (per your list)
Sticker Mule API, recurring tasks/subtasks/notifications, real-time Easy Scan sync, cross-section bulk ops, fancy label layout.

---

**Confirm and I'll start with Phase 0 (the migration).** Each subsequent phase ships in its own turn so you can review the preview between steps.