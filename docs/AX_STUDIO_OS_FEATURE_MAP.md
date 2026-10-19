# AX Studio OS — feature map and preservation checklist

Inspection of `main` @ 7be071e (Oct 17 2026) before integrating the approved
AX Studio OS design (prototype snapshot 08d7384) into `/admin-v2`.
Branch: `claude/ax-studio-os`. V1 at `/admin` and the client portal at
`/portal` are not touched.

## Section map

| Section | Route(s) | Existing source of truth reused |
|---|---|---|
| **Today** | `/admin-v2` | `useOverview` (derived Action Required, recent mockups, recent orders), `tasks` table via `useTasks`, portal project threads + waiting count via `useDeskThreads` / `useDeskWaitingCount`, `drops` via `useDeskDrops` |
| **Projects & Tasks** | `/admin-v2/work`, `/admin-v2/desk` | `tasks` (+ V1 `TaskFormDialog` for create/edit), client projects = `portal_threads` that `portal_ops_is_project()` marks as projects, replies/sharing through the existing Desk RPCs |
| **Client Spaces** | `/admin-v2/people`, `/people/:id` (+ `/library`, `/cart`, `/lineup`, `/pricing`) | `athletes` entities, `display_name`, roles, `user_athlete_links`; **View Portal = `entityPortalHref()` → `/portal?as=<id>`** |
| **Creative Studio** | `/admin-v2/creative` | Asset briefs (`asset_briefs`), Production prompts (`MASTER_PROMPT` + `buildBrief`), Design templates index, V1 Create design / PNG Creation, ConceptBuilder (mockup creation lives on the client's library) |
| **Asset Library** | `/admin-v2/library` | `designs`/`design_files` (private bucket, signed URLs), Design Inbox, `mockups` with `approval_state` + `client_visible`, folders, lookbooks |
| **Releases** | `/admin-v2/releases` | `collections` (independent of Shopify), `drops` (draft/review/scheduled/live) via Desk RPCs, per-client Lineup |
| **Business** | `/admin-v2/commerce`, `/commerce/blanks/:id`, `/products/:id`, `/orders`, `/people/:id/pricing` | `v2_blanks` (access and price kept separate), `products`, `bulk_order_requests`, Shopify-sourced `orders`, pricing sheet |

Every pre-existing V2 address still resolves. Old `/admin-v2/creative?tab=designs|mockups`
links forward to the Library with their filters intact.

## Preservation checklist

- [x] V1 `/admin` untouched: the light theme is a token swap scoped to `.admin-os.ax-studio`, in a stylesheet only the V2 layout imports.
- [x] Portal untouched: View Portal still opens `/portal?as=<id>` in a new tab; `RequireAdmin` → `RequirePortal` → `useCurrentAthlete` → `portal_scope_athlete()`; portal write RPCs still refuse operators ("View as is read-only").
- [x] View Portal (read-only look as the client) is visually separate from Edit client (V1 person editor) and from Client login (create/reset through `admin-manage-users`).
- [x] Mockup creation, upload, design inbox, productize, cart, lineup, pricing sheet, Desk replies/share concept — same components and hooks, re-housed.
- [x] Approval (`mockups.approval_state`) stays separate from portal visibility (`client_visible`), which stays separate from Shopify.
- [x] Productize still creates AX `products` only; Shopify remains the inventory/fulfilment master; Shopify push stays in V1 (`shopify-update-product`).
- [x] Collections are not tied to Shopify publication.
- [x] No prototype sample records, localStorage persistence, sample financials or simulated publication imported.
- [x] No fake generation: Creative Studio says plainly that prompts are compiled and handed off; nothing is shown as generated until a real file exists.

## Functionality in the app but not in the prototype — where it went

| Existing feature | Placement |
|---|---|
| Client Desk (portal messages, briefs, share concept) | Projects & Tasks → Client requests (rail sub-link + Today count) |
| Cart / draft orders, invoices, payment status | Client Space (unchanged) |
| Pricing sheet, brand terms | Client Space + Business |
| Blank catalog + blank detail | Business |
| Orders list (V1 order detail/fulfilment) | Business |
| Command search (⌘K) | Shell header |
| Design templates, PNG Creation, prompts library, print zones, brand assets | Creative Studio links to the V1 tools |
| V1 dashboard link | Rail footer |

## Gaps (not built — smallest additive fix proposed)

1. **Tasks have no client/project link.** `tasks` is org-scoped only. Proposed: `supabase/proposed/20261019_tasks_client_project_links.sql` — nullable `athlete_id` + `portal_thread_id` FKs and indexes. Until applied, tasks show on Today/Projects but cannot be filtered by client.
2. **No "In review" task status.** `task_status` = todo / in_progress / blocked / done. Board shows Blocked in red. Proposal adds `in_review` to the enum in the same file (additive).
3. **No AI provider.** No generation jobs exist (no queue, status, cost). Creative Studio keeps the honest prompt → ChatGPT → upload loop. Adding real generation needs a job table + edge function; out of scope here.
4. **Shopify create-product has no UI and is unverified against the live store.** Left as is.
5. **`client_mockups` view is still a proposal** (`supabase/proposed/20260831_client_visible_mockups.sql`), so `client_visible` mockups do not reach the portal yet. Unchanged.
6. **Order line items carry no product_id**, so per-client revenue cannot be derived; Business shows only existing definitions.
