-- AX OS V2 — ASSET BRIEFS. Applied live to cuidofxidstqpgypxcop on 2026-08-31.
--
-- An Asset is creative derived FROM one or more mockups: a launch graphic, a
-- story frame, a lookbook page. The brief is the job: what is being made, from
-- what, in what shape, with what references and what instruction.
--
-- WHY NOT prompt_packages. A prompt package is a reusable TEMPLATE — a
-- snapshotted, rated, re-runnable prompt for a design direction. A brief is one
-- specific job for one entity on one day. Filing jobs in the template table
-- would make "which of these is worth reusing" unanswerable within a week.
-- A brief may POINT AT a package; it is never stored as one.
--
-- TWO TABLES, NOT FOUR. Mockups, reference images and generated outputs are all
-- "something attached to this brief", so they share one child table with a
-- `kind` discriminator — the same call `mockups.kind` already makes.

create table if not exists public.asset_briefs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  athlete_id uuid references public.athletes(id) on delete set null,
  title text not null default '',
  asset_type text not null default 'other',
  aspect_ratio text,
  instructions text,
  prompt_package_id uuid references public.prompt_packages(id) on delete set null,
  status text not null default 'draft',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.asset_briefs is
  'V2: one job — make an asset from mockups. Instance-specific. prompt_packages remain reusable templates and are referenced, never written to.';

create index if not exists asset_briefs_athlete_idx on public.asset_briefs (athlete_id, created_at desc);
create index if not exists asset_briefs_org_idx on public.asset_briefs (organization_id, created_at desc);

create table if not exists public.asset_brief_items (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references public.asset_briefs(id) on delete cascade,
  kind text not null,
  mockup_id uuid references public.mockups(id) on delete cascade,
  storage_bucket text,
  storage_path text,
  url text,
  is_selected boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint asset_brief_items_kind_check check (kind in ('mockup', 'reference', 'output')),
  constraint asset_brief_items_shape_check check (
    (kind = 'mockup' and mockup_id is not null)
    or (kind <> 'mockup' and (url is not null or storage_path is not null))
  )
);

comment on table public.asset_brief_items is
  'V2: everything attached to an asset brief — source mockups, reference images, generated outputs — discriminated by kind.';

create index if not exists asset_brief_items_brief_idx on public.asset_brief_items (brief_id, kind, sort_order);
create unique index if not exists asset_brief_items_one_mockup_idx
  on public.asset_brief_items (brief_id, mockup_id)
  where kind = 'mockup';

-- RLS: the same org boundary as every other operator table. Nothing here is
-- client-readable, and this adds no client-facing access anywhere.
alter table public.asset_briefs enable row level security;
alter table public.asset_brief_items enable row level security;

create policy "asset_briefs_org_access" on public.asset_briefs
  for all to authenticated
  using (is_org_accessible(organization_id))
  with check (is_org_accessible(organization_id));

create policy "asset_brief_items_org_access" on public.asset_brief_items
  for all to authenticated
  using (exists (select 1 from public.asset_briefs b where b.id = brief_id and is_org_accessible(b.organization_id)))
  with check (exists (select 1 from public.asset_briefs b where b.id = brief_id and is_org_accessible(b.organization_id)));

create or replace function public.touch_asset_brief()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists asset_briefs_touch on public.asset_briefs;
create trigger asset_briefs_touch before update on public.asset_briefs
  for each row execute function public.touch_asset_brief();
