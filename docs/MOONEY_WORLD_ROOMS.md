# Mooney World — look and room spec

Read this before redesigning any Locker Room shell (`src/components/portal/mooney/`)
screen. Data comes only from the hooks in `src/hooks/usePortalApi.ts`.

## The look (every room)

- **Ground:** `/mooney/assets/locker-room.png` (the 4-bay wall, 1536×1024)
  continues behind the whole content area, polished floor and reflected light
  included, darkened toward the bottom with a gradient to
  `hsl(var(--dark) / .85)`. No flat grey page and no hard edge under the hero.
  The sidebar and top bar stay solid `hsl(var(--dark))`.
- **Panels are glass over that ground:** `hsl(var(--dark) / .55)`,
  `backdrop-filter: blur(6px)`, 1px warm bronze border
  `hsl(30 60% 55% / .35)`, 6px radius, no drop shadow. KPI tiles reuse
  `.mw-stat`.
- **Type:** room titles use the heavy display face of `.mw-heading`
  (uppercase), with a widely letter-spaced tagline. Section titles use the
  display face, uppercase, ~0.2em letter-spacing, title colour.
- **Colour:** client accent for primary actions, active nav, focus and key
  numbers; `.mw-pill` outline buttons for secondary actions; a destination's
  `accent` only on that destination's glow, chip or button.
- **Motion:** only the small hover lift on figures; respect reduced motion.
- **States:** skeletons shaped like content; empty states name what will
  appear plus the next action; errors say what failed plus "Try again".
- **Phone:** 2 columns where readable, 1 under 380px, 44px touch targets,
  nothing scrolls sideways.

## Locker Room — the locker wall

- No card behind each destination: no box, border, panel or `locker-bay.png`
  tile. The hero is one scene: `locker-room.png` as the background of one
  container with `aspect-ratio: 3 / 2`, cover, centered, never stretched.
  The heading and tagline sit over the dark ceiling band.
- Figures are the transparent cutouts from `usePortalDestinations()`
  (`destination.image`); never add a background, frame or second platform.
  An absolutely positioned layer places them over the bays with tunable
  variables: bay centers `--bay-1: 16.3%`, `--bay-2: 38.8%`, `--bay-3: 61.3%`,
  `--bay-4: 84%`; floor line `--bay-floor: 62%`; figure height
  `--bay-figure-h: 46%` (wide artwork such as Moon's House at 80% of that).
  `object-fit: contain`, bottom-aligned on the floor line. A soft radial glow
  in the destination accent sits behind each figure, like light in the cubby.
- Below the scene: a 4-column row on the same bay centers with the name, the
  jersey number (`#1`), and an **Open collection** pill outlined in the
  destination accent. The figure also links to the collection.
- Fallback when there aren't exactly 4 destinations or the width is under 768px:
  `locker-bay.png` per destination, 2 columns (1 under 380px), figure in the
  bay, name, number and button below, still no card styling.

## Other rooms

- **My Gear** (page `PortalProducts.tsx`): header "Your Live Product Lineup"
  with the live count. Tabs **Live** / **Archive** come from
  `usePortalCatalog({ collection, lifecycle: "live" | "archive", hidden: "include" })`,
  and the tab counts from its `liveCount` / `archiveCount`. Live means on the
  website; Archive means AX took it off the website but it is still orderable
  (say "Reprinted from the design file"). The client does not hide products in
  this shell: no Hide or Hidden (n) controls. Destination chips (All plus each
  destination with an accent dot and jersey number) filter both tabs.
  Product cards have a front/back toggle, unit price, Copy link (Live only,
  when `publicUrl` exists), View and Order (`ProductOrderDialog`; for Archive
  the product comes from `usePortalData().archivedProducts`). Include the Bulk
  order sheet (`openOrderSheet()`). Side rail: the active destination figure,
  Order for your crew (Game Day, Camp and VIP lead to the existing builders),
  and AX credit with Use credit.
- **Creative Studio** (`PortalStudio.tsx`; `PortalMockups.tsx` is its Made for
  you tab): Projects / Made for you / New request. Project list with
  thumbnail, title, status, date and unread dot. The selected project shows
  concepts (large view plus thumbnails), a Brief tab, and Approve concept /
  Request changes (feedback required). The brief composer has kind chips,
  idea, inspiration uploads (`usePortalUpload` plus `uploadProblem`), vibe
  chips, details and era. The right column holds the project conversation
  (`usePortalMessages(projectId)`). Concept URLs expire after 5 minutes:
  refetch rather than store them. Hero: "Build your next chapter."
- **Content & Drops** (`PortalContent.tsx`, `PortalDrops.tsx`): For you /
  Photos / Videos / Graphics / Products filters, search and collection;
  asset cards with Download and Copy link; a selected-asset bar with Copy
  caption and Copy product link. The Drop planner has a list, status badges
  and a Plan a drop dialog (name, era, date and time in the viewer's zone;
  Save draft or Send to AX for review), plus a Draft → Review → Scheduled →
  Live stepper and This week's plays. Hero: "Ready for the spotlight."
- **Brand HQ** (`PortalAnalytics.tsx`, `PortalProfile.tsx`, `PortalEra.tsx`):
  the numbers live here. KPI tiles are AX credit, Lifetime gross revenue and
  Orders (`usePortalSummary`). Then come an attributed revenue chart (12
  months, gross, "Updated" from `asOf`, or "Revenue not attributed"), recent
  orders (`usePortalOrderHistory`), top products (each carries `productId` and `imageUrl` when it matches one of the client's own products, so show the photo and link it to the product, or a neutral placeholder when null), Your journey era cards (each
  showing "Revenue not attributed"), community (followers, access, VIP), and a
  profile with level progress, the approved referral code with Copy, and Edit
  profile (bio and an https website only). Hero: "Your brand. The big
  picture."

The Locker Room has **no KPI row**. Numbers live in Brand HQ, and the live
product count lives in My Gear's header. Below the locker wall come only
Quick Plays and Your Next Move.

Build one room per prompt. Check it at 375, 768, 1024 and 1440px, then stop.
