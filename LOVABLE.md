# Rules for editing this project in Lovable

Edits made in Lovable sync to `main`, which is production: there is no
preview step between a prompt and what clients see. Paste everything below
the line into Lovable's project knowledge. It stays under the 10,000-character
limit. The detailed room spec is in `docs/MOONEY_WORLD_ROOMS.md`, which
Lovable reads from the project.

---

You are editing the **look** of the AX client portal (`/portal`). Data,
database and security are maintained separately and must not change.

**You may change:** layout, components, styling, typography, animation, icons
and images inside `src/components/portal/**` and `src/pages/portal/**`.

**Never do these. If a request needs one, stop and say so:**

1. No Supabase migrations, SQL, RLS, database functions, storage policies or
   edge functions. Never edit `supabase/**`.
2. No new `supabase.from(...)`, `.rpc(...)` or `storage` calls in portal code.
   Use the hooks in `src/hooks/usePortalApi.ts` and `usePortalData()`. Types
   are in `src/lib/portal/api/contract.ts`; the map is `docs/PORTAL_ADAPTER.md`.
   If the data you need isn't there, say so. A refused query returns an empty
   list, not an error.
3. Never edit `src/lib/portal/*.test.ts`, `src/lib/portal/client-designs.ts`,
   `src/lib/portal/world.ts`, `src/lib/portal/portal-theme.ts`,
   `src/components/portal/PortalLayoutKind.tsx`,
   `src/integrations/supabase/client.ts`, `src/auth/**`,
   `src/pages/admin-v2/**`, `src/components/admin-v2/**` or `src/lib/v2/**`.
4. Never reference the `design-files` bucket. Clients see only
   `design-previews`.
5. No hard-coded brand colours. Use the theme tokens: `hsl(var(--accent))`,
   `bg-accent` and `text-accent-foreground`; `hsl(var(--dark))`;
   `bg-background`; `hsl(var(--portal-title, var(--foreground)))`; `bg-card`,
   `border-border` and `text-muted-foreground`. Greys and black/white overlays
   are fine. A destination's `accent` is only for that destination's glow,
   chip or button.
6. Address the client with `entityVoice(athlete)`. Never write "Mooney",
   "Darnell" or "Mooney World" in a component. The world's name comes from
   `worldBrand(...)` in `src/lib/portal/world.ts`. Some clients are schools
   or organisations, not players.
7. Mobile first. Check every change at 375px.
8. Money is `{amountMinor, currency}`. Format it with `formatMoney`. `null`
   means unknown and shows "—". Revenue is gross (before refunds), so label it.
   Per-era revenue is always null: show "Revenue not attributed" and never
   split a total.
9. When `usePortalScope().viewingAs` is true, the server refuses every write.
   Disable write buttons and say why.
10. **Two shells.** The Locker Room shell (`src/components/portal/mooney/`,
    styles in `mooney.css` with `mw-` classes) is only for clients whose theme
    has `layout: "world"`. Everyone else gets the classic portal.
    `PortalLayout.tsx` chooses between them. Never remove that choice or render
    `MooneyShell` for everyone. Read the current shell with
    `usePortalLayoutKind()`.
11. **A redesigned room is a new component, not a replaced page.** Build it in
    `src/components/portal/mooney/` and switch in the page file the way
    `PortalHome.tsx` does:
    `usePortalLayoutKind() === "world" ? <New /> : <Classic />`. Never delete
    or rewrite a classic page.
12. **Orders and approvals.** Show `usePortalQuote`'s price and pass
    `quote.subtotalDollars` as `expectedSubtotal`. Use one
    `newIdempotencyKey()` per checkout and reuse it on retries. Approvals send
    the exact `concept.version` and `project.version` on screen; on a 409,
    refetch and show the latest. Never retry automatically. Clients draft
    drops and submit them for review; scheduling stays with AX.
13. **The look and each room's contents** are specified in
    `docs/MOONEY_WORLD_ROOMS.md`. Read it before any Locker Room shell work and
    follow it. The background continues behind the whole page and every panel
    is glass over it. Figures are transparent cutouts standing in the locker
    wall, with no cards behind them.
