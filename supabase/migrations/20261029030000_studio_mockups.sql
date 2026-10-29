-- PLACEMENT STUDIO -> MOCKUP REVIEW (2026-10-29)
--
-- Placement Studio renders mockups (client art on a blank, every colour) and
-- saves them straight into the Mockup Review queue for that client. Approve
-- there -> Shopify (draft) -> client dashboards, the same gate as Drive mockups.
--
-- 1. studio-mockups: PUBLIC bucket, because Shopify fetches the image by URL
--    when an approved colour is synced. Only operators can write to it.
-- 2. Operators may insert/update mockup_reviews rows directly (the studio
--    upserts one row per design × garment × colour). Decisions still go
--    through ax_mockup_review().

insert into storage.buckets (id, name, public)
values ('studio-mockups', 'studio-mockups', true)
on conflict (id) do update set public = true;

drop policy if exists "operators write studio-mockups" on storage.objects;
create policy "operators write studio-mockups" on storage.objects
  for insert with check (bucket_id = 'studio-mockups' and public.current_user_is_operator());

drop policy if exists "operators update studio-mockups" on storage.objects;
create policy "operators update studio-mockups" on storage.objects
  for update using (bucket_id = 'studio-mockups' and public.current_user_is_operator());

drop policy if exists "operators delete studio-mockups" on storage.objects;
create policy "operators delete studio-mockups" on storage.objects
  for delete using (bucket_id = 'studio-mockups' and public.current_user_is_operator());

drop policy if exists "operators add mockup reviews" on public.mockup_reviews;
create policy "operators add mockup reviews" on public.mockup_reviews
  for insert with check (public.current_user_is_operator());

drop policy if exists "operators update mockup reviews" on public.mockup_reviews;
create policy "operators update mockup reviews" on public.mockup_reviews
  for update using (public.current_user_is_operator()) with check (public.current_user_is_operator());
