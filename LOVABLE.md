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
   code. Use the data already provided by `usePortalData()`,
   `useCurrentAthlete()` and the existing hooks in `src/hooks` and
   `src/lib/portal`. If the data you need is not there, say so — do not query
   for it. A query the database refuses returns an **empty list, not an error**,
   so it looks like "no data" rather than a mistake.
3. Never edit `src/lib/portal/*.test.ts`, `src/lib/portal/client-designs.ts`,
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
6. Address the client through `entityVoice(athlete)` from
   `src/lib/portal/entity-voice.ts`, never by joining first and last name.
   Not every client is a player — some are schools and organisations.
7. Mobile first. Check every change at 375px wide.

---

## Why

- **Theme:** AX sets each client's colours and title card from the V2 entity
  page ("Portal look"). They are stored on the client's row and applied as the
  CSS variables above. A component that uses the tokens re-colours itself per
  client; one with a hard-coded hex does not.
- **Data:** client access is enforced in the database (see
  `AX_OS_V2_SOURCE_OF_TRUTH.md` and the guard tests in `src/lib/portal`). Those
  tests run in the Claude workflow, not on every Lovable sync — so a broken
  read from Lovable reaches production silently.
- **Anything beyond the look** — new data on a page, a new kind of content,
  changes to who can see what — goes through Claude, which builds it against
  the database and the tests, then Lovable styles the result.
