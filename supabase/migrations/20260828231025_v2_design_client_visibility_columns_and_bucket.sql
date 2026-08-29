-- Visibility is per (design, entity), not per design.
--
-- The same artwork can be shared with one athlete and withheld from another, and
-- `design_athletes` is already the per-entity link that carries group_id and
-- sort_order. Putting visibility anywhere else would force a second source of
-- truth for "what does THIS client see".
alter table public.design_athletes
  add column if not exists client_visibility public.design_client_visibility not null default 'hidden';

-- Groups. `design_athletes.group_id` already FKs to design_collections, so that
-- table is the V2 group. Visibility on the group is a CEILING, not a default —
-- see public.design_client_visible() below.
alter table public.design_collections
  add column if not exists client_visibility public.design_client_visibility not null default 'hidden';

comment on column public.design_athletes.client_visibility is
  'AX OS V2. Whether this entity''s client-facing surfaces may show this design. Gated further by the group ceiling — always read through public.design_client_visible().';
comment on column public.design_collections.client_visibility is
  'AX OS V2. Ceiling for every design in this group. Hidden here hides all members regardless of their own setting.';

-- Client-safe renditions. PRIVATE: a preview is still AX property, it is just not
-- the production asset. Public would make it scrapeable without a session.
insert into storage.buckets (id, name, public)
values ('design-previews', 'design-previews', false)
on conflict (id) do nothing;

-- Index the lookup the storage policy and the client RPC both perform.
create index if not exists design_athletes_athlete_visibility_idx
  on public.design_athletes (athlete_id, client_visibility);
