# AX OS V2 — Naming

What each object IS, what the interface CALLS it, and what it is stored in.

Last updated: 2026-08-31 · Branch `feature/ax-os-v2`

The rule: **the interface never shows a table name, and one object never has
two names.** V2 inherited a schema whose table names predate the model it now
expresses, and that is fine — renaming a table breaks every foreign key and
every V1 page for zero functional gain. What is not fine is the interface
leaking the old vocabulary, or two V2 screens using different words for the
same row.

---

## The object model

| Interface word | What it is | Stored in |
|---|---|---|
| **Design** | The artwork itself. Production artwork is a transparent PNG; most live rows are still concept art. | `designs` + `design_files` |
| **Blank** | The garment. Reusable, shared, never owned by a person. | `v2_blanks` + `v2_blank_colors` + `v2_blank_images` |
| **Mockup** | A Design placed on a Blank in a colour, at a position. Finished work in its own right. | `mockups` WHERE `kind='concept'`, arrangement in `product_print_placements` |
| **Product** | A configured, sellable thing: price, variants, commerce details. | `products` |
| **Collection** | A permanent grouping. Never requires Shopify. | `collections` |
| **Person** (or the entity's own type) | Athlete, client, organisation, school, team, brand, facility, agency. | `athletes` + `entity_type` + `roles[]` |
| **Folder** | Organisation only. Never changes what is inside it. | `asset_folders` WHERE `scope='mockups'` / `scope='designs'` |
| **Asset** | Creative derived FROM a mockup — a post, a story, a launch graphic. | Not yet persisted. See AssetsDrawer. |

## Words that are banned in the interface

| Never show | Show instead | Why |
|---|---|---|
| "Product Concept" | **Mockup** | Same row. `kind='concept'` is a storage discriminator, not a word for a person. Creative used to say "Product concepts" in its tab bar while the entity workspace said "Mockups" for the identical list. |
| "Athlete" as the word for every entity | **People**, or the entity's own type | The table is called `athletes` and models schools and organisations. The directory is People. |
| "Concept" as a stage | **Idea** / **Specified** / … | `stageOf()` owns the labels. |
| Table names, `kind`, `scope`, `lifecycle` values | The label from the matching `*_LABELS` map | Raw enum values are for the database. |
| `blanks` (the V1 table) | The V2 catalog reads `v2_blanks` | See AX_V1_DECOMMISSIONING.md. |

## Two names for a blank, on purpose

`v2_blanks.name` is the **manufacturer's** name and is overwritten on every
Drive sync. `v2_blanks.display_name` is the **client-facing** name, set by hand
and never touched by the sync.

- An operator surface shows `catalogTitle()` — the client name if one is set,
  the manufacturer's otherwise, with the manufacturer's shown beneath it.
- A client surface shows `displayName` **or nothing**. Never a fallback to
  `name`, because that leaks the manufacturer.

## Derived, never stored

These are computed on read and must not be given columns:

- **Mockup stage** — `stageOf()` in `src/lib/v2/concepts.ts`.
- **Product lifecycle** — `lifecycleOf()` in `src/lib/ecosystem/merch.ts`.
- **Whether a mockup is "specified"** — `isConfigurable()`. Note this tests
  `surface`, not `zone_id`: placement is freeform and the canvas clears the
  zone the moment artwork is dragged.

A stored copy of any of these drifts from the relationships underneath it
within a week. That is a decision, not an oversight.
