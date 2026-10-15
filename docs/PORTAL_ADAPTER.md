# Portal adapter — the contract Lovable builds against

The Mooney World pack proposed a REST API at `/api/portal`. **There is no
separate API server, and none is needed.** The app talks to Supabase directly
and the database's row-level security already decides what each login may
see; a second API layer would duplicate that authority. Each operation in the
pack is instead a typed function in `src/lib/portal/api/*`, exposed to
components as a React hook in **`src/hooks/usePortalApi.ts`**.

**For Lovable: import hooks from `@/hooks/usePortalApi` and types from
`@/lib/portal/api/contract`. Do not call Supabase from portal components.**

Anything that needs server authority — whose portal this is, revenue, prices,
orders, approvals, uploads, downloads — is a Postgres function that resolves
the caller from their session (`portal_scope_athlete`), never from an id the
browser sends alone, or the `portal-files` edge function.

---

## Operation map

| Pack operation | Hook (`usePortalApi`) | Server | Notes |
|---|---|---|---|
| `GET /summary` | `usePortalSummary(period?)` | `portal_revenue_summary`, `athlete_credit_wallets`, `athlete_access_summary` | Lifetime and period are separate scopes — never reconcile them. `revenueBasis: "gross"`. `asOf` = last Shopify import. |
| `GET /collections` | `usePortalDestinations()` | `collections` (RLS) + `collection_products` | One destination per active collection; art/label/jersey/accent from `collections.metadata.portal_destination`. |
| `GET /products?collection=&hidden=` | `usePortalCatalog({collection, hidden})` | existing product load + `collection_products` | `unitPrice` = bulk-sheet price (display). Front/back from images. `publicUrl` only when a Shopify handle exists. |
| `GET /products/:id` | `usePortalData().products` | existing | Variants/sizes from the Shopify-synced `product_variants`. |
| *(quote)* | `usePortalQuote(items, {turnaround})` | `portal_quote_order` | **Show this price.** Server rules; field errors per line. |
| `POST /order-requests` | `usePortalSubmitOrder()` | `portal_submit_order_request` | One transaction. Idempotency key required. 409 if the price changed (carries the new quote). |
| `GET /bulk-order-sheet` | existing `BulkOrderSheet` (`openOrderSheet()`) | → `portal_submit_order_request` | Same format as today; now server-priced. |
| `GET /credit/activity` | existing `useAthleteCredit` | `athlete_credit_transactions` | Existing credit rules, unchanged. |
| `GET /orders` | `usePortalOrderHistory()` | `bulk_order_requests` (RLS) | Order requests (BR-…), newest first, cursor paging. |
| `GET /projects` | `usePortalProjects({status})` | `portal_list_projects` | A project is a Studio thread. |
| `POST /projects` | `usePortalCreateProject()` | `portal_create_project` | Idempotent. Inspiration = finished upload ids. |
| `GET /projects/:id` | `usePortalProject(id)` | `portal_get_project` | Concepts with signed 5-minute image URLs. |
| `POST /projects/:id/decision` | `usePortalDecideConcept()` | `portal_decide_concept` | Send `conceptVersion` + `expectedProjectVersion` exactly as shown. 409 = changed → refetch. |
| `GET /messages?projectId=` | `usePortalMessages(projectId \| null)` | `portal_list_messages` | `null` = the general AX Team thread. Polls every 30s. |
| `POST /messages` | `usePortalPostMessage()` | `portal_post_message` | Attachments must be finished uploads of this athlete (and this project). |
| `POST /uploads` + `/complete` | `usePortalUpload()` | `portal-files` edge fn | PNG/JPEG/WebP/GIF/HEIC/PDF ≤ 10 MB. Server checks the real bytes. Retries built in. |
| `GET /assets?kind=&collection=` | `usePortalAssets({kind, collection})` | `portal_list_assets` | Product photos, AX social assets, published posts. |
| `POST /assets/:id/download` | `assetDownload(asset)` (`@/lib/portal/api/brand`) | — / `portal-files` | All library media is public today: URL, no expiry. |
| `GET /drops` | `usePortalDrops()` | `portal_list_drops` | `draft` / `review` / `scheduled` / `live`. |
| `POST /drops` | `usePortalCreateDrop()` | `portal_create_drop` | Draft only. `scheduledLocal` + `timeZone` → UTC on the server. |
| `PATCH /drops/:id` | `usePortalUpdateDrop()` | `portal_update_drop` | Own drafts only; `submitForReview`. Scheduling/live stays with AX. |
| `GET /analytics` | `usePortalAnalytics(months)` | `portal_revenue_summary` + orders | `byDestination` values are always `null` today — see below. |
| `GET /profile` | `usePortalProfile()` | `portal_get_profile` | Referral code only if AX approved one; no URL yet. |
| `PATCH /profile` | `usePortalUpdateProfile()` | `portal_update_profile` | Only `bio`, `website` (https), `notificationDefaults`. |
| *(product approval)* | `PortalApprovals` component | `portal_decide_product` | Replaces the direct update that silently failed. |

Old routes keep working: `/portal`, `/portal/products`, `/portal/studio`,
`/portal/content`, `/portal/drops`, `/portal/analytics`, `/portal/profile`,
`/portal/messages`, `/portal/build/*`. The pack's `/portal/gear` and
`/portal/brand` are new screens; when Lovable adds them, keep the old paths
as redirects so existing links still land.

## Contract changes from the pack (`src/lib/portal/api/contract.ts`)

- `DestinationId` is a **string**, not a fixed union of Mooney's four cities —
  destinations are per-athlete data. Mooney's keys are still `atlanta`,
  `chicago`, `new-york`, `moons-house`.
- `Destination` adds `collectionId`, `productCount`, `teamName`; `image` may be
  `null` (render a fallback, never a broken image).
- `Summary` adds `refundFlaggedRevenue` and `revenueAttributable`.
- Concept and attachment URLs are signed and **expire in 5 minutes**. Refetch
  instead of storing them. An image that could not be signed is `""`.
- Package values include `custom` (the existing custom builder).

## Rules the UI must follow

- **Scope comes from the shell.** Every hook reads it from `usePortalData()`;
  never pass an athlete id from the URL.
- **View as.** `usePortalScope().viewingAs` is true for AX staff viewing a
  client. Show the banner (`ImpersonationBanner` already does). Every write is
  refused by the server with 403 — disable write buttons and say why.
- **Null vs zero.** `null` = unknown → "—" or "Not available". `0` = known zero.
- **Money** is `{amountMinor, currency}`. Format with `formatMoney` from
  `@/lib/portal/api/money`. Never add different currencies.
- **Per-era revenue.** Shopify lines carry no product or collection link, so
  per-destination revenue is `null`. Show **"Revenue not attributed"**. Never
  divide a total across eras.
- **Orders.** Make one idempotency key (`newIdempotencyKey()`) when a
  checkout opens; reuse it for every retry of that checkout; make a new one
  only after success or when the cart changes. Show `usePortalQuote`'s price
  and pass `quote.subtotalDollars` as `expectedSubtotal`. On 409 show the new
  price from the error's quote (`quoteFromConflict`).
- **Approvals.** Send exactly the `concept.version` and `project.version` on
  screen. On 409, refetch and show the latest; do not retry automatically.
- **Errors** are `PortalApiError` with `.status` (401/403/404/409/422/429)
  and `.error.fieldErrors` for per-field messages. 404 means "not found or not
  yours" — do not distinguish.
- **Uploads:** pre-check with `uploadProblem(file)` for a friendly message;
  the server checks again on the actual bytes.

## Error codes

| Status | Code | Meaning |
|---|---|---|
| 401 | `28000` | Not signed in |
| 403 | `42501` | Not allowed (e.g. View as tried to write) |
| 404 | `P0002` | Not found or not yours |
| 409 | `P0409` | Stale: changed since loaded, price changed, key reused |
| 422 | `P0422`, `22023` | Validation; see `fieldErrors` |
| 429 | `P0429` | Too many uploads in progress |

## Deployment

Database — run once, in order, in the Supabase SQL editor (each is safe to
re-run): `supabase/migrations/20261015140000_portal_stage1_reads.sql`,
`…150000_portal_stage2_orders.sql`, `…160000_portal_stage3_studio.sql`,
`…170000_portal_stage4_5_content_brand.sql`. Data for Mooney's wall:
`AX-MOONEY-WORLD-DATA.sql` (in the handoff folder).

Edge function — `portal-files` (deployed). Uses the platform-provided
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Nothing to set.

Frontend — no new configuration. Uses the existing `VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`. The service key
never reaches the browser.

Artwork — copy the pack's `public/mooney/` into the app's `public/`, so
`/mooney/assets/*.png` resolves. The wall data already points there.

Order of operations: SQL first, then ship the code. The code falls back to
the previous behaviour where a server function is not deployed yet, so the
order is safe either way, but the new behaviour only exists after the SQL.

## Tests

- `supabase/tests/portal/run.sh stage4` — 169 checks against a local Postgres
  stand-in of the relevant schema: two athletes, a shared org, operator scope
  in and out of org, an outsider, anon, timezone and DST boundaries, stale
  versions, idempotent replays, refunds, margins, uploads.
- `supabase/tests/portal/concurrency.sh` — two real sessions: duplicate
  order key, two orders racing for the same credit, two simultaneous approvals.
- `npx vitest run src/lib/portal` — adapter unit tests.

## Known, not changed

- The sheet prices any title containing "shirt" as a tee ($18), including
  sweatshirts.
- Older Studio inspiration uploads live in the public `design-references`
  bucket. New uploads are private.
- `admin-manage-users` actions `reset_password` and `delete` accept any user id
  from any AX admin, across orgs.
- `athlete_access_summary` and `design_client_visible` are callable by anyone,
  including signed-out visitors (follower counts; a yes/no about designs).
- Referral codes have no redemption at checkout, so no referral URL is shown.
