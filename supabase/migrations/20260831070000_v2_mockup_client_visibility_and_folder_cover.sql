-- AX OS V2 — two additive columns. No data is moved, nothing is dropped, and
-- every existing read keeps working because both carry defaults.
-- Applied live to cuidofxidstqpgypxcop on 2026-08-31.

-- 1. Can the athlete/client see this mockup?
--
-- Deliberately a boolean, not the `design_client_visibility` enum that
-- design_athletes uses. That enum exists to answer "which rendition may the
-- client see" — the production PNG or a safe preview — and a mockup has only
-- one rendition: the flattened composite, which is already client-safe. The
-- only real question is shared or not.
alter table public.mockups
  add column if not exists client_visible boolean not null default false;

comment on column public.mockups.client_visible is
  'V2: has this mockup been shared with the athlete/client? Default false — a mockup is internal creative work until someone decides otherwise.';

-- 2. A folder may pin its cover instead of inheriting its first member.
alter table public.asset_folders
  add column if not exists cover_mockup_id uuid references public.mockups(id) on delete set null;

comment on column public.asset_folders.cover_mockup_id is
  'V2: explicitly chosen folder cover. NULL means "use the first member", which is the default behaviour.';

create index if not exists asset_folders_cover_mockup_id_idx
  on public.asset_folders (cover_mockup_id)
  where cover_mockup_id is not null;

create index if not exists mockups_client_visible_idx
  on public.mockups (athlete_id)
  where client_visible;
