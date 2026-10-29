-- Placement Studio: where the collar / body edges sit on each blank's photos,
-- saved once per blank + side so every design on that blank measures the same.
create table if not exists public.studio_blank_calibrations (
  blank_style text not null,
  view text not null check (view in ('front','back')),
  collar_x numeric not null default 0.5,
  collar_y numeric not null,
  chest_left numeric not null,
  chest_right numeric not null,
  chest_width_in numeric not null,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (blank_style, view)
);
alter table public.studio_blank_calibrations enable row level security;
drop policy if exists "operators manage blank calibrations" on public.studio_blank_calibrations;
create policy "operators manage blank calibrations" on public.studio_blank_calibrations
  for all using (public.current_user_is_operator()) with check (public.current_user_is_operator());
