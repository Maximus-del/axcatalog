-- Portal messaging: threads + messages, mirroring bulk_order_requests RLS

create table if not exists public.portal_threads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  subject text not null,
  category text not null default 'general' check (category in ('general','question','order_request','design_feedback')),
  status text not null default 'open' check (status in ('open','pending','resolved','closed')),
  created_by uuid,
  created_by_role text not null default 'portal' check (created_by_role in ('portal','admin')),
  last_message_at timestamptz not null default now(),
  last_message_role text check (last_message_role in ('portal','admin')),
  admin_unread boolean not null default false,
  portal_unread boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_portal_threads_org on public.portal_threads(organization_id);
create index if not exists idx_portal_threads_athlete on public.portal_threads(athlete_id);
create index if not exists idx_portal_threads_status on public.portal_threads(status);
create index if not exists idx_portal_threads_last_msg on public.portal_threads(last_message_at desc);

create table if not exists public.portal_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.portal_threads(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sender_user_id uuid,
  sender_role text not null check (sender_role in ('portal','admin')),
  body text not null check (length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_portal_messages_thread on public.portal_messages(thread_id, created_at);
create index if not exists idx_portal_messages_org on public.portal_messages(organization_id);

drop trigger if exists trg_portal_threads_updated on public.portal_threads;
create trigger trg_portal_threads_updated before update on public.portal_threads
  for each row execute function public.set_updated_at();

create or replace function public.portal_thread_on_message()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.portal_threads t
  set last_message_at = now(),
      last_message_role = new.sender_role,
      updated_at = now(),
      admin_unread = case when new.sender_role = 'portal' then true else t.admin_unread end,
      portal_unread = case when new.sender_role = 'admin' then true else t.portal_unread end
  where t.id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists trg_portal_message_bump on public.portal_messages;
create trigger trg_portal_message_bump after insert on public.portal_messages
  for each row execute function public.portal_thread_on_message();

create or replace function public.mark_thread_read(_thread_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.portal_threads t
  set admin_unread  = case when public.current_user_is_admin() then false else t.admin_unread end,
      portal_unread = case when not public.current_user_is_admin() then false else t.portal_unread end
  where t.id = _thread_id
    and (
      public.is_org_accessible(t.organization_id)
      or exists (select 1 from public.user_athlete_links ual
                 where ual.user_id = auth.uid() and ual.athlete_id = t.athlete_id)
    );
end;
$$;

alter table public.portal_threads enable row level security;
alter table public.portal_messages enable row level security;

create policy "admin all portal_threads" on public.portal_threads
  for all
  using (((organization_id = public.current_user_org_id()) and public.current_user_is_admin()) or public.current_user_is_platform_admin())
  with check (((organization_id = public.current_user_org_id()) and public.current_user_is_admin()) or public.current_user_is_platform_admin());

create policy "client read own portal_threads" on public.portal_threads
  for select
  using (
    organization_id = public.current_user_org_id()
    and exists (select 1 from public.user_athlete_links ual
                where ual.user_id = auth.uid() and ual.athlete_id = portal_threads.athlete_id)
  );

create policy "client create own portal_threads" on public.portal_threads
  for insert
  with check (
    organization_id = public.current_user_org_id()
    and created_by = auth.uid()
    and created_by_role = 'portal'
    and exists (select 1 from public.user_athlete_links ual
                where ual.user_id = auth.uid() and ual.athlete_id = portal_threads.athlete_id)
  );

create policy "admin all portal_messages" on public.portal_messages
  for all
  using (((organization_id = public.current_user_org_id()) and public.current_user_is_admin()) or public.current_user_is_platform_admin())
  with check (((organization_id = public.current_user_org_id()) and public.current_user_is_admin()) or public.current_user_is_platform_admin());

create policy "client read own portal_messages" on public.portal_messages
  for select
  using (
    exists (
      select 1 from public.portal_threads t
      join public.user_athlete_links ual on ual.athlete_id = t.athlete_id
      where t.id = portal_messages.thread_id and ual.user_id = auth.uid()
    )
  );

create policy "client create own portal_messages" on public.portal_messages
  for insert
  with check (
    sender_user_id = auth.uid()
    and sender_role = 'portal'
    and exists (
      select 1 from public.portal_threads t
      join public.user_athlete_links ual on ual.athlete_id = t.athlete_id
      where t.id = portal_messages.thread_id and ual.user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.portal_threads to authenticated;
grant select, insert, update, delete on public.portal_messages to authenticated;
grant execute on function public.mark_thread_read(uuid) to authenticated;
