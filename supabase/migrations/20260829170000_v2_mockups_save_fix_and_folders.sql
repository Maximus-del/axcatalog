-- THE SAVE BUG.
--
-- `zone_id` was NOT NULL, from when a placement could only ever be one of the
-- predefined print zones. Free placement is now the normal case and deliberately
-- clears the zone — artwork dragged by hand is not in "left chest", and saying
-- otherwise would be a false claim on the record. Every freely-placed mockup
-- therefore failed on insert, the batch rolled the mockup back, and the operator
-- saw "Nothing could be saved".
--
-- A mockup with no zone is not incomplete. It is the ordinary case.
alter table public.product_print_placements alter column zone_id drop not null;

comment on column public.product_print_placements.zone_id is
  'Optional. Set only when the artwork was fitted to a named print zone; NULL for free placement, which is the normal case.';

-- FOLDERS - reusing the table that already exists for exactly this.
--
-- `asset_folders` was built for organising assets and has had 0 rows since it
-- was created; `mockups.folder_id` already points at it. It only lacked a way to
-- scope a folder to one entity, which is what makes "Darnell's folders" distinct
-- from everyone else's. One nullable column rather than a second folder table.
alter table public.asset_folders
  add column if not exists athlete_id uuid references public.athletes(id) on delete cascade;

create index if not exists asset_folders_scope_athlete_idx
  on public.asset_folders (scope, athlete_id, sort_order);

comment on column public.asset_folders.athlete_id is
  'Scopes a folder to one entity. NULL means an organisation-wide folder.';

-- ALIGNMENT GUIDES - part of the composition, so they reopen with it.
--
-- Movable X/Y reference lines, per surface, as {"front":{"x":50,"y":34},...}.
-- They guide the eye and never move artwork, but where the operator put them is
-- part of how the mockup was composed and should come back with it.
alter table public.mockups
  add column if not exists guides jsonb not null default '{}'::jsonb;

comment on column public.mockups.guides is
  'AX OS V2. Per-surface alignment guide positions, e.g. {"front":{"x":50,"y":34}}. Visual references only - they never constrain artwork.';
