-- ============================================================
--  QODER — Schema v4 Migration
--  Run AFTER supabase-schema-v3.sql
-- ============================================================

-- 1. Project position (synced ordering)
alter table projects add column if not exists position integer not null default 0;

with ranked as (
  select id, row_number() over (partition by user_id order by created_at desc) - 1 as rn
  from projects
)
update projects set position = ranked.rn from ranked where projects.id = ranked.id;

-- 2. Project links
alter table projects add column if not exists git_url      text;
alter table projects add column if not exists supabase_url text;
alter table projects add column if not exists vercel_url   text;

-- 3. User settings (synced tab order)
create table if not exists user_settings (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  tab_order  jsonb,
  updated_at timestamptz not null default now()
);

alter table user_settings enable row level security;

create policy "users_own_settings" on user_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4. Storage bucket for file uploads
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('qoder-files', 'qoder-files', true, 52428800, array['image/*','audio/*'])
on conflict (id) do nothing;

create policy "Authenticated upload qoder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'qoder-files');

create policy "Public read qoder"
  on storage.objects for select to public
  using (bucket_id = 'qoder-files');

create policy "Owner delete qoder"
  on storage.objects for delete to authenticated
  using (bucket_id = 'qoder-files' and auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================
-- Done! New in v4:
--   project order  — synced via projects.position
--   project links  — git_url, supabase_url, vercel_url
--   user_settings  — tab order synced across devices
--   qoder-files    — Supabase Storage for cross-device uploads
-- ============================================================
