# AX V1 — Decommissioning

What V2 has taken over, what V1 still owns, and what can safely be deleted.

Last updated: 2026-08-31 · Branch `feature/ax-os-v2`

**V1 is not being removed.** It stays live at `/admin` and remains the
reference library. This document tracks the boundary so the two do not quietly
grow a second copy of the same thing.

---

## 1. Fully replaced — V2 reads none of it

| V1 thing | Replaced by | Safe to drop? |
|---|---|---|
| `blanks`, `blank_colors`, `blank_sizes`, `blank_assortment_items` | `v2_blanks` / `v2_blank_colors` / `v2_blank_images`, fed from the Drive | **Not yet** — mockups created before the V2 catalog still carry V1 `blank_id`s, and `fetchMockupLibrary` falls back to `blanks` to name them. Drop after those rows are migrated to `v2_blank_id`; the fallback query is commented with exactly that condition. |
| The `blanks` storage bucket | Drive URLs on `v2_blank_images` | Same condition as above. |
| V1's three separate blank areas (`/admin/blanks`, `/blanks/list`, `/blanks/inventory`, `/blanks/import-images`) | One catalog at `/admin-v2/commerce?tab=blanks` | UI only — no data to drop. V1 routes stay reachable. |
| Print-zone presets in the mockup flow | Freeform placement with alignment lines | `print_zones` stays: V1's editor maintains it and older `product_print_placements` rows still carry `zone_id`. Nothing in `/admin-v2` reads it — see the header of `src/lib/v2/placements.ts`. |

## 2. Still V1's job — V2 deliberately links out

Rebuilding any of these would be duplication, not progress.

| Job | V1 route | Reached from |
|---|---|---|
| Create/edit a person, roles, org assignment | `/admin/athletes`, `/admin/athletes/:id` | People header, entity workspace |
| Design detail, PNG creation, upload | `/admin/designs/:id`, `/admin/designs/new` | Creative → Designs |
| Design Templates: Style DNA, master prompts, reference sets, best-fit | `/admin/design-templates` | Creative → Design templates (V2 shows a read-only index) |
| Product configuration and Shopify push | `/admin/products/:id` | Commerce → Products, entity workspace |
| Collection detail | `/admin/collections/:id` | Commerce → Collections |
| Order detail and fulfilment | `/admin/orders/:id` | Orders |
| Brand assets | `/admin/brand-assets` | Creative → Overview |

## 3. Known duplication to resolve

- **Blank photography** lives in `v2_blank_images` (Drive) and, historically, in
  `blank_colors.image_url` (Supabase bucket). Fronts and backs served from
  different systems is what produced the colourway mismatch the photography
  audit now catches. One source per colourway is the goal.
- **Two cost columns.** `blanks.blank_cost` and `blanks.cost` are both
  populated and disagree on one row. V2 reads `v2_blanks.cost`. The V1 pair
  should be reconciled before V1's pricing surfaces are trusted again.
- **`pricing_rules` is empty**, so V1's margin engine runs on hard-coded
  defaults (2.50× / 2.00× / 1.72×) that contradict the Drive sheet's
  1.40× / 1.80× / 2.20×. It has never fired because typed prices override it —
  but it will, on the first Drive-imported blank with no typed price. V2 shows
  "—" rather than a number it cannot justify.

## 4. Before anything is deleted

1. Migrate `mockups.blank_id` → `mockups.v2_blank_id` for every row that still
   points at a V1 blank, and the same for `product_print_placements`.
2. Delete the fallback query in `fetchMockupLibrary` and its comment.
3. Confirm no V1 route still reads the table (V1 pages are not being removed,
   so this usually means the V1 page goes first).
4. Only then drop the table.

Nothing in this document authorises a destructive migration. Dropping anything
is a decision for Chase, taken with a backup, in daylight.
