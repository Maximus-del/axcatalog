# Mooney World handoff pack — read this first

This folder is the design pack as delivered (2026-10-15), kept for reference.
Two things in it are **superseded by the real integration**:

| Pack file | Use instead |
|---|---|
| `frontend/contracts.ts` | `src/lib/portal/api/contract.ts` (adapted: destination ids are strings, extra fields) |
| `frontend/destinations.json` (hard-coded cities) | `usePortalDestinations()` — the wall comes from Mooney's collections, so AX changes it without a deploy |
| `docs/original-api-contract.md` (`/api/portal/...` REST routes) | the hooks in `src/hooks/usePortalApi.ts`; map in `docs/PORTAL_ADAPTER.md` |

Everything else — `frontend/tokens.css`, `frontend/cards.tsx`,
`frontend/LockerRoom.tsx`, the screen map, design system and acceptance
checklist — is the presentation starter for Lovable. The artwork is already in
`public/mooney/assets/` (checksums match the pack).

When porting `tokens.css`: keep the per-client theme tokens (`--accent`,
`--dark`, `--portal-title`, see `LOVABLE.md`) as the source of colour; the
pack's per-destination accent comes from `destination.accent`.
