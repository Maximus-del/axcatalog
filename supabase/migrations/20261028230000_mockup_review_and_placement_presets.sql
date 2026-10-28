-- MOCKUP REVIEW + PLACEMENT PRESETS (2026-10-28)
--
-- Mockup review is the gate between a finished mockup and Shopify, the same
-- one-at-a-time flow as content review:
--   ✓ approved   -> that colour goes on (or stays on) the Shopify product
--   ✎ needs_fix  -> back to production with a note; kept off Shopify until fixed
--   ✕ archived   -> the colourway doesn't work; removed from Shopify
-- One row per design × garment × colour. Rows arrive from the Drive library
-- (mockup-review-intake, or seeded by an operator) and the decision is pushed
-- to Shopify only when the operator presses "Sync to Shopify"
-- (mockup-review-sync), never on each click.

create table if not exists public.mockup_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '2d6f377e-4fe8-448b-84b3-42aed237f3da',
  athlete_id uuid references public.athletes(id) on delete set null,
  design_code text not null,              -- e.g. PSP-ICEMAN (the library code)
  design_name text not null,              -- e.g. Ice Man
  product_title text,                     -- Shopify title to use / in use
  garment text not null,                  -- e.g. TEE V1 — AXISM 7010
  blank_style text,                       -- e.g. AXISM 7010
  color text not null,                    -- canonical colour name (Shopify option value)
  front_drive_id text,
  back_drive_id text,
  front_url text,                         -- picture shown in review
  back_url text,
  drive_folder_id text,                   -- the colour folder
  review_state text not null default 'pending'
    check (review_state in ('pending','approved','needs_fix','archived')),
  review_note text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  shopify_product_gid text,               -- product this design sells as (null = create on sync)
  shopify_state text,                     -- 'on' | 'off' after the last sync
  synced_at timestamptz,
  sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (design_code, garment, color)
);

create index if not exists mockup_reviews_state_idx on public.mockup_reviews (review_state);
create index if not exists mockup_reviews_design_idx on public.mockup_reviews (design_code);

alter table public.mockup_reviews enable row level security;

drop policy if exists "operators read mockup reviews" on public.mockup_reviews;
create policy "operators read mockup reviews" on public.mockup_reviews
  for select using (public.current_user_is_operator());
-- No direct insert/update/delete from the client: decisions go through the RPC
-- below, rows come from the intake function / operator SQL (service role).

create or replace function public.ax_mockup_review(_id uuid, _decision text, _note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _state text;
begin
  if not public.current_user_is_operator() then
    raise exception 'AX team only' using errcode = '42501';
  end if;
  _state := case _decision
    when 'approve' then 'approved'
    when 'fix' then 'needs_fix'
    when 'archive' then 'archived'
    when 'pending' then 'pending'
    else null end;
  if _state is null then
    raise exception 'unknown decision %', _decision using errcode = '22023';
  end if;
  if _state = 'needs_fix' and coalesce(btrim(_note), '') = '' then
    raise exception 'A fix needs a note' using errcode = '22023';
  end if;
  update public.mockup_reviews
     set review_state = _state,
         review_note = case when _state = 'pending' then review_note else nullif(btrim(_note), '') end,
         reviewed_at = case when _state = 'pending' then null else now() end,
         reviewed_by = case when _state = 'pending' then null else auth.uid() end,
         updated_at = now()
   where id = _id;
  if not found then
    raise exception 'mockup not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.ax_mockup_review(uuid, text, text) from public;
grant execute on function public.ax_mockup_review(uuid, text, text) to authenticated;

-- PLACEMENT PRESETS — where a print goes on a blank, in inches, saved so every
-- design prints in the same spot and GPT gets the same reference each time.
create table if not exists public.placement_presets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '2d6f377e-4fe8-448b-84b3-42aed237f3da',
  blank_style text not null,              -- e.g. AXISM 7010 (or "Any tee")
  view text not null check (view in ('front','back')),
  name text not null,                     -- e.g. Center chest logo 4x4
  width_in numeric not null check (width_in > 0),
  height_in numeric not null check (height_in > 0),
  top_in numeric not null,                -- top edge, inches below the collar
  center_x_in numeric not null default 0, -- 0 = centred; + = viewer's right (wearer's left chest)
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (blank_style, view, name)
);

alter table public.placement_presets enable row level security;
drop policy if exists "operators manage placement presets" on public.placement_presets;
create policy "operators manage placement presets" on public.placement_presets
  for all using (public.current_user_is_operator()) with check (public.current_user_is_operator());
