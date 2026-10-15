-- Stages 4+5 fixtures, shaped like production.
alter table public.athletes add column if not exists position text;
alter table public.athletes add column if not exists league text;
alter table public.athletes add column if not exists entity_type text;
alter table public.athletes add column if not exists website text;
alter table public.athletes add column if not exists updated_at timestamptz default '2026-10-01T00:00:00Z';
create table if not exists public.teams (id uuid primary key default gen_random_uuid(), name text);
create table if not exists public.collection_products (collection_id uuid, product_id uuid, primary key (collection_id, product_id));
create table public.drops (
  id uuid primary key default gen_random_uuid(), organization_id uuid, athlete_id uuid, collection_id uuid,
  name text, slug text unique, description text, campaign_image_url text, status text default 'draft',
  access_date timestamptz, public_date timestamptz, notify jsonb, approval_state public.product_approval,
  approval_note text, metadata jsonb default '{}', created_by uuid, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table public.product_social_assets (
  id uuid primary key default gen_random_uuid(), organization_id uuid, product_id uuid, athlete_id uuid, uploaded_by uuid,
  storage_bucket text, storage_path text, file_name text, mime_type text, file_size_bytes bigint, caption text, sort_order int, created_at timestamptz default now()
);
create table public.content_assets (
  id uuid primary key default gen_random_uuid(), organization_id uuid, athlete_id uuid, athlete_ids uuid[] default '{}',
  type text, title text, body text, hero_url text, media jsonb, status text, product_id uuid, publish_at timestamptz, created_at timestamptz default now()
);
create table public.affiliates (
  id uuid primary key default gen_random_uuid(), user_id uuid, display_name text, email text, code text, status text,
  commission_percent numeric, buyer_discount_percent numeric, payout_method_notes text, total_earned numeric default 0,
  total_paid numeric default 0, balance_owed numeric default 0, notes text, created_at timestamptz default now(), updated_at timestamptz default now()
);
alter table public.affiliates enable row level security;
-- The live policy, verbatim: not actually limited.
create policy "affiliate updates own limited" on public.affiliates for update using ((user_id = auth.uid()) or current_user_is_admin()) with check ((user_id = auth.uid()) or current_user_is_admin());
create policy "affiliate sees own" on public.affiliates for select using ((user_id = auth.uid()) or current_user_is_admin());
grant select, update on public.affiliates to authenticated;

-- Mooney: Falcons collection holds the hoodie; a social asset; a published post; his existing drop.
insert into collection_products values ('00000000-0000-0000-0000-0000000c0a71', '00000000-0000-0000-0000-0000000001d1');
insert into product_social_assets (product_id, athlete_id, storage_bucket, storage_path, file_name, mime_type, caption, created_at) values
  ('00000000-0000-0000-0000-0000000001d1', '00000000-0000-0000-0000-00000000000d', 'product-social-assets', 'm/reel.mp4', 'Hoodie reel', 'video/mp4', 'The 1 Hoodie is here', '2026-09-01');
insert into content_assets (athlete_id, type, title, hero_url, status, publish_at) values
  ('00000000-0000-0000-0000-00000000000d', 'video', 'Offseason Episode 01', 'https://cdn.example/ep1.jpg', 'published', '2026-08-14'),
  ('00000000-0000-0000-0000-00000000000d', 'update', 'Unpublished draft', 'https://cdn.example/x.jpg', 'draft', '2026-08-15'),
  ('00000000-0000-0000-0000-00000000000c', 'update', 'Coleman post', 'https://cdn.example/c.jpg', 'published', '2026-08-15');
insert into drops (id, organization_id, athlete_id, collection_id, name, slug, status, access_date, public_date, approval_state) values
  ('00000000-0000-0000-0000-00000000d401', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000d',
   '00000000-0000-0000-0000-0000000c0a71', 'Mooney World — Fall Drop', 'fall-drop', 'scheduled', '2026-08-16', '2026-08-18', null),
  ('00000000-0000-0000-0000-00000000d4c1', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000c',
   null, 'Coleman drop', 'coleman-drop', 'draft', null, null, null);
insert into affiliates (user_id, display_name, code, status, commission_percent, buyer_discount_percent) values
  ('00000000-0000-0000-0000-0000000000d1', 'Mooney', 'MOONEY10', 'active', 10, 10);
