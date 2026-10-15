# Rules for editing this project in Lovable

This project is live. Edits made in Lovable sync to `main`, and `main` is what
clients like Darnell Mooney open at the production URL — there is no preview
step between a Lovable prompt and what a client sees. These rules keep
prompt-based design work from breaking data access or client privacy.

Paste the block under **Project knowledge** into Lovable's project knowledge
settings so every prompt follows it.

---

## Project knowledge (paste into Lovable)

You are editing the **look** of the AX client portal (`/portal`). The data
layer, database and security are maintained separately and must not change.

**You may change:** layout, components, styling, spacing, typography,
animation, icons and images inside `src/components/portal/**` and
`src/pages/portal/**`.

**Never do any of these. If a request needs one, stop and say so instead:**

1. Never create, edit or suggest a Supabase migration, SQL, RLS policy,
   database function, storage policy or edge function. Never edit
   `supabase/**`.
2. Never add a new `supabase.from(...)`, `.rpc(...)` or `storage` call in portal
   code. Get data and actions from the hooks in `src/hooks/usePortalApi.ts`
   (usePortalSummary, usePortalDestinations, usePortalCatalog, usePortalQuote,
   usePortalSubmitOrder, usePortalOrderHistory, usePortalProjects,
   usePortalProject, usePortalCreateProject, usePortalDecideConcept,
   usePortalMessages, usePortalPostMessage, usePortalUpload, usePortalAssets,
   usePortalDrops, usePortalCreateDrop, usePortalUpdateDrop,
   usePortalAnalytics, usePortalProfile, usePortalUpdateProfile) and from
   `usePortalData()`. Types are in `src/lib/portal/api/contract.ts`; the full
   map is `docs/PORTAL_ADAPTER.md`. If the data you need is not there, say so —
   do not query for it. A query the database refuses returns an **empty list,
   not an error**, so it looks like "no data" rather than a mistake.
3. Never edit `src/lib/portal/*.test.ts`, `src/lib/portal/client-designs.ts`,
   `src/lib/portal/world.ts`, `src/lib/portal/portal-theme.ts`,
   `src/components/portal/PortalLayoutKind.tsx`,
   `src/integrations/supabase/client.ts`, `src/auth/**`, or anything under
   `src/pages/admin-v2/**`, `src/components/admin-v2/**`, `src/lib/v2/**`.
4. Never reference the `design-files` storage bucket. Clients only ever see
   `design-previews`.
5. Never hard-code brand colours in portal components. Each client has their
   own theme. Use the theme tokens:
   - `bg-accent`, `text-accent`, `border-accent`, `hsl(var(--accent))` — the
     client's accent colour
   - `text-accent-foreground` — text sitting on the accent
   - `hsl(var(--dark))` — the header band and deep sections
   - `bg-background` — the page
   - `hsl(var(--portal-title, var(--foreground)))` — the client's name and
     big titles
   - `bg-card`, `border-border`, `text-muted-foreground` — neutral surfaces
   Greys and white/black overlays (`bg-white/10`, `bg-black/40`) are fine.
   Destination (era) colours come from each destination's `accent` — use them
   only for that destination's glow, chip or card edge.
6. Address the client through `entityVoice(athlete)` from
   `src/lib/portal/entity-voice.ts`, never by joining first and last name.
   Not every client is a player — some are schools and organisations. Never
   write "Mooney", "Darnell" or "Mooney World" into a component; the world's
   name comes from `worldBrand(...)` in `src/lib/portal/world.ts`.
7. Mobile first. Check every change at 375px wide.
8. Money is `{amountMinor, currency}` — format with `formatMoney`. `null` means
   unknown (show "—"), never zero. Revenue is **gross** (before refunds) — say
   so where it is shown. Per-era revenue is always null today: show "Revenue
   not attributed", never split a total.
9. When `usePortalScope().viewingAs` is true (AX viewing as a client), every
   write is refused by the server. Disable write buttons and say why.
10. **Two shells.** The Mooney World / Locker Room shell
    (`src/components/portal/mooney/`, styled by `mooney.css`, every class
    prefixed `mw-`) is only for clients whose portal theme says
    `layout: "world"`. Every other client still gets the classic portal.
    `PortalLayout.tsx` chooses — never remove that choice or render
    `MooneyShell` unconditionally. Read the current shell with
    `usePortalLayoutKind()` from `src/components/portal/PortalLayoutKind.tsx`.
11. **Redesigning a room = a new component, not a replaced page.** Build each
    room in `src/components/portal/mooney/` and switch in the page file, the
    way `src/pages/portal/PortalHome.tsx` does:
    `usePortalLayoutKind() === "world" ? <MooneyGear /> : <ClassicPage />`.
    Never delete or rewrite the classic page — other clients use it.
    Room → page file: My Gear → `PortalProducts.tsx`; Creative Studio →
    `PortalStudio.tsx` (and `PortalMockups.tsx` as its "Made for you" tab);
    Content & Drops → `PortalContent.tsx` (and `PortalDrops.tsx`); Brand HQ →
    `PortalAnalytics.tsx` (and `PortalProfile.tsx`, `PortalEra.tsx`).
    `/portal/gear` and `/portal/brand` already redirect to products and
    analytics, keeping `?as=` and `?collection=`.
12. **Orders, approvals, drops.** Show `usePortalQuote`'s price and pass
    `quote.subtotalDollars` as `expectedSubtotal`; make one idempotency key per
    checkout (`newIdempotencyKey()`) and reuse it on retry. Approve / request
    changes sends the exact `concept.version` and `project.version` on screen;
    on a 409, refetch and show the latest — never retry automatically. Clients
    draft drops and submit for review; scheduling and going live stay with AX.

### Mooney World look — make every room match the Locker Room

The Locker Room hero is the reference. Below it, and on the other four rooms,
the page must not fall back to a flat grey app. Keep one world:

- **Ground:** the warm locker room continues down the page — `hsl(var(--dark))`
  base with a soft warm overhead glow at the top (a low-opacity radial
  gradient of warm light) instead of a flat `bg-background` band. No hard seam
  between the hero and the content below.
- **Room heroes:** each room opens like the Locker Room — big uppercase title
  in the same heavy display face and size scale as `.mw-heading`, a widely
  letter-spaced tagline under it, and the room's artwork behind or beside it
  (`/mooney/assets/locker-room.png`, `locker-bay.png`, or the active
  destination's figure from `usePortalDestinations()`), under the same
  `--mw-veil`. Titles: My Gear "Your gear. Your legacy."; Creative Studio
  "Build your next chapter."; Content & Drops "Ready for the spotlight.";
  Brand HQ "Your brand. The big picture."
- **Panels:** every section sits on the `--mw-glass` surface with `--mw-line`
  borders and one radius (6px). Section titles use the display face,
  uppercase, wide letter-spacing (about 0.2em) and the title colour — not the
  small grey labels used now.
- **Accent:** `hsl(var(--accent))` for primary buttons, active nav, focus and
  key numbers; pill-shaped outline buttons (`.mw-pill`) for secondary actions.
  Destination colour only on that destination's chip, card edge or glow.
- **Numbers:** KPI tiles reuse `.mw-stat` from the Locker Room on every room
  that shows numbers — same icon box, same label and value sizes.
- **Motion:** only the small hover lift already used on lockers; respect
  reduced motion. No entrance animations.
- **States:** loading uses skeletons shaped like the content; empty states say
  what will appear and offer the next action; errors say what failed and offer
  "Try again".
- **Phone:** two columns of cards where they stay readable, one otherwise;
  44px minimum touch targets; nothing scrolls sideways.

### What each room shows (all data from the hooks above)

- **My Gear** — destination chips (All + `usePortalDestinations()`, each with
  its accent dot and jersey number) filter `usePortalCatalog({ collection })`;
  tabs My Products / My Designs (`DesignsGrid`); product cards with a
  front/back toggle (`frontImage` / `backImage`), price per unit, Copy link
  (only when `publicUrl`), View, Order (disabled unless `orderable`); Bulk
  order sheet (`openOrderSheet()`); Hidden (n) with hide/unhide. Side rail:
  the active destination's figure, "Order for your crew" (Game Day, Camp,
  VIP → the existing builders) and AX credit with Use credit.
- **Creative Studio** — tabs Projects / Made for you / New request. Project
  list (thumbnail, title, status, date, unread dot); the selected project's
  concepts (large view + thumbnails), Brief tab, Approve concept / Request
  changes (feedback required); brief composer: kind chips, idea, inspiration
  uploads (`usePortalUpload`, `uploadProblem` for friendly errors), vibe
  chips, details, era. Right column: that project's conversation
  (`usePortalMessages(projectId)`). Concept URLs expire in 5 minutes —
  refetch, never store them.
- **Content & Drops** — filters For you / Photos / Videos / Graphics /
  Products, search, collection; asset cards with Download and Copy link; a
  selected-asset bar with Copy caption and Copy product link. Side: Drop
  planner (list, status badges, Plan a drop dialog with name, era and
  date/time in the viewer's time zone, Save draft / Send to AX for review)
  with the Draft → Review → Scheduled → Live stepper; "This week's plays".
- **Brand HQ** — four KPI tiles; Attributed revenue chart (12 months, gross,
  "Updated" time from `asOf`; if not attributable show "Revenue not
  attributed"); recent orders (`usePortalOrderHistory`); top products; Your
  journey (era cards, each "Revenue not attributed"); community (followers,
  access, VIP); profile with level progress, the approved referral code with
  Copy, and Edit profile (bio, https website only).

Build one room per prompt, check it at 375px and 1440px, then stop.

---

## Why

- **Theme:** AX sets each client's colours, title card, portal style (Classic
  or Locker Room) and world name from the V2 entity page ("Portal look"). They
  are stored on the client's row and applied as the CSS variables above. A
  component that uses the tokens re-colours itself per client; one with a
  hard-coded hex does not.
- **Data:** client access is enforced in the database (see
  `AX_OS_V2_SOURCE_OF_TRUTH.md` and the guard tests in `src/lib/portal`). Those
  tests run in the Claude workflow, not on every Lovable sync — so a broken
  read from Lovable reaches production silently.
- **Anything beyond the look** — new data on a page, a new kind of content,
  changes to who can see what — goes through Claude, which builds it against
  the database and the tests, then Lovable styles the result.
