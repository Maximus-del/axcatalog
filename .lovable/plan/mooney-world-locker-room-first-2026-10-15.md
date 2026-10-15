# Mooney World — Locker Room first

## Scope
Redesign `/portal` to match the Locker Room reference. Apply the five-item navigation and global AX Team drawer across the portal, as requested. Stop after this screen; leave the other four screens’ content unchanged until their individual redesigns.

## Shared navigation
- Cinematic dark sidebar, Mooney World branding, and client identity resolved through `entityVoice(athlete)`.
- Exactly five primary entries: Locker Room, My Gear, Creative Studio, Content & Drops, Brand HQ. Keep other existing tools accessible contextually, not as extra primary items.
- Collapsible desktop sidebar with an always-visible toggle; mobile navigation drawer and compact header. Retain sign-out and existing order-sheet access.
- Keep the View-as banner visible above the shell. Preserve `?as=` and relevant filters in all links.
- Link to existing pages in this first pass; do not redesign their content.

## Locker Room home
- Reference-matched welcome heading and supporting line, using the resolved client name, never a hard-coded athlete name.
- Full-width collectible wall using the existing locker-room and locker-bay artwork. Contain and bottom-align figures, preserve their built-in platforms, and accommodate wider artwork without hard-coded city checks.
- Render destinations exclusively from `usePortalDestinations()`: live ordering, labels, jersey numbers, accents, artwork and collections. Missing/broken artwork receives a neutral fallback, not an invented collectible.
- Four live summary tiles from `usePortalSummary()`: AX Credit, lifetime gross revenue, orders, live products. Use `formatMoney`; unknowns display `—`. Never calculate credit or substitute screenshot numbers.
- Quick Plays: Order gear opens the existing order sheet; Start a design links to Studio; Get my code reveals/copies only an approved code from `usePortalProfile()`; Download content links to the existing content page.
- Your Next Move displays current non-archived projects and upcoming/draft drops from `usePortalProjects()` and `usePortalDrops()`. Independent loading, retry, error and empty states; no fabricated projects or dates.
- Read-only previews and working links only: no new checkout, approval or drop-planning forms in this pass. Any order pricing remains the existing server quote, never browser calculations.

## Global AX Team drawer
- Open the general conversation from desktop navigation or the mobile header on any portal page.
- Show real messages, author labels, timestamps and available attachments with `usePortalMessages(null)`.
- Send with `usePortalPostMessage()`; attach files through `usePortalUpload()` and existing file validation. Preserve drafts on errors, prevent duplicate sends, reuse an idempotency key when retrying.
- Disable sending/uploading in View-as mode and explain why. Keep reading and navigation available.
- Refetch expiring signed attachment/concept URLs rather than persist them; handle unavailable previews gracefully.

## Technical boundaries
- All implementation changes stay under `src/components/portal/**` and `src/pages/portal/**`, including a portal-local scoped stylesheet. Do not edit global CSS, routing, hooks, libraries, protected tests, authentication or admin files.
- Use the existing hooks and real contract; projects, drops and messages return paged results and must be read through `data.items`.
- Map presentation roles to existing client accent, dark, title, background, card, border and muted tokens. Live destination accents feed a dedicated glow variable, without overwriting the client’s `--accent`. No copied starter brand palette or fixed destination colours.
- Reuse existing design-system controls, keyboard focus states and minimum 44px touch targets. Restrained light/lift motion only; respect reduced motion.
- No adapter, custom data fetching, Supabase calls, backend modifications, security changes or new dependencies. Per-city revenue, wherever displayed, reads “Revenue not attributed”.

## Confirmed limitations
- **New addresses and redirects:** `App.tsx` registers products, analytics and profile, but not `/portal/gear` or `/portal/brand`. It is outside the allowed editing area. Keep current addresses working; translate destination gear links to the existing products address while retaining the collection filter. New aliases and consolidated redirects require the separately maintained routing work and are deferred, not silently added.
- **Global unread/search:** the hooks do not expose a global unread count or global search. Do not invent notification dots/counts or add a nonfunctional search field.
- **Referral:** an approved code can be supplied, but working checkout redemption/referral URLs are unavailable. No fabricated link or referral-setup action.
- **Preview blocker:** the latest build diagnostic reports a missing `IntersectionObserver.scrollMargin` member in `src/test/setup.ts`, outside the permitted files. Do not change it; report it if it still blocks validation for its maintainer to resolve.
- **Authenticated verification:** this project reports externally managed authentication, so automatic authenticated checks are unavailable. Do not request credentials. Report signed-in data and message-send checks as unverified unless an authorized session is available through the app’s normal flow.

## Acceptance and stopping point
- Check 375px (project rule), 390, 768, 1024 and 1440px: no sideways page scrolling, overlapping controls, clipped names or stretched artwork. Two destination columns where readable, one where necessary, four on sufficiently wide desktop screens.
- Verify sidebar collapse/reopen, mobile drawer, active navigation, preserved View-as context, destination links, order-sheet opening, approved-code copying, AX Team drawer and reduced motion wherever the current preview permits.
- With an authorized client session, check live destination/summary/project/drop data and confirm a sent message reads back through the drawer. Never treat signed-out, empty or demo checks as end-to-end verification.
- Summarize the Locker Room/shared navigation delivered and missing hook data or verification blockers, then stop before the next screen.