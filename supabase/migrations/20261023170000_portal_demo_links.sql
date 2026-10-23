-- Demo links: a no-sign-in, read-only walk through a client's real portal.
-- The edge function demo-session turns an active token into a session for a
-- dedicated demo account (user_metadata.ax_demo = true -> portal is read-only).
-- Revoke: set active = false and delete the demo user; that ends its sessions.
create table if not exists public.portal_demo_links (
  token text primary key default replace(gen_random_uuid()::text, '-', ''),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'team')),
  user_id uuid,
  active boolean not null default true,
  expires_at timestamptz not null default now() + interval '7 days',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.portal_demo_links enable row level security;
create policy "operators manage demo links" on public.portal_demo_links for all
  using (public.current_user_is_operator()) with check (public.current_user_is_operator());
