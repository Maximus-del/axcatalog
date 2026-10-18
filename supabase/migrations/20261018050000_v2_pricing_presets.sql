-- Pricing sheet v2: cost presets by blank, and front / front+back per product.
--
-- Additive only. Operators only (no client policy: costs never reach a client).
--
-- blank_cost_presets: one row per (blank, component). component is
--   'blank' — what the garment costs AX (NULL row = v2_blanks.cost)
--   'front' — front print
--   'back'  — back print
-- A product's print cost = front + (back if it is printed front and back),
-- unless that product overrides print_cost in product_pricing.
--
-- product_pricing.print_sides: 'front' | 'front_back'. NULL = read it from the
-- product's pictures (a BACK mockup means a back print).

create table if not exists public.blank_cost_presets (
  v2_blank_id uuid not null references public.v2_blanks(id) on delete cascade,
  component text not null check (component in ('blank', 'front', 'back')),
  cost numeric(10, 2) not null check (cost >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (v2_blank_id, component)
);

alter table public.blank_cost_presets enable row level security;
drop policy if exists "blank_cost_presets_operator_access" on public.blank_cost_presets;
create policy "blank_cost_presets_operator_access" on public.blank_cost_presets
  for all to authenticated
  using (public.current_user_is_operator())
  with check (public.current_user_is_operator());
grant select, insert, update, delete on public.blank_cost_presets to authenticated;

drop trigger if exists trg_blank_cost_presets_touch on public.blank_cost_presets;
create trigger trg_blank_cost_presets_touch before update on public.blank_cost_presets
  for each row execute function public.product_pricing_touch();

alter table public.product_pricing add column if not exists print_sides text;
do $$ begin
  alter table public.product_pricing
    add constraint product_pricing_print_sides_check check (print_sides is null or print_sides in ('front', 'front_back'));
exception when duplicate_object then null; end $$;
