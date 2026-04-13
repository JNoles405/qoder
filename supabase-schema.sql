-- ============================================================
--  QODER — Supabase Schema
--  Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. Extensions
create extension if not exists "uuid-ossp";

-- ============================================================
-- 2. Tables
-- ============================================================

create table if not exists projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  name        text not null,
  description text,
  status      text not null default 'planning',
  tech_stack  text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists versions (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid references projects(id) on delete cascade not null,
  version       text not null,
  release_notes text,
  date          timestamptz not null default now(),
  file_links    text[] not null default '{}',
  created_at    timestamptz not null default now()
);

create table if not exists milestones (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references projects(id) on delete cascade not null,
  title       text not null,
  description text,
  date        date,
  completed   boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- 3. Row Level Security
-- ============================================================

alter table projects   enable row level security;
alter table versions   enable row level security;
alter table milestones enable row level security;

-- Projects: users can only see and modify their own
create policy "users_own_projects"
  on projects for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Versions: accessible if the parent project belongs to the user
create policy "users_own_versions"
  on versions for all
  using (
    project_id in (
      select id from projects where user_id = auth.uid()
    )
  );

-- Milestones: same pattern
create policy "users_own_milestones"
  on milestones for all
  using (
    project_id in (
      select id from projects where user_id = auth.uid()
    )
  );

-- ============================================================
-- 4. Auto-update `updated_at` on projects
-- ============================================================

create or replace function handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_updated_at
  before update on projects
  for each row execute function handle_updated_at();

-- ============================================================
-- 5. Indexes (performance)
-- ============================================================

create index if not exists idx_projects_user_id    on projects(user_id);
create index if not exists idx_versions_project_id on versions(project_id);
create index if not exists idx_milestones_project_id on milestones(project_id);

-- ============================================================
-- Done! Next steps:
--   1. Enable Email auth in: Authentication → Providers → Email
--   2. Copy your Project URL and anon key from: Settings → API
--   3. Paste both into Qoder's setup screen
-- ============================================================
