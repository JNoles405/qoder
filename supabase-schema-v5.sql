-- ============================================================
--  QODER — Schema v5 Migration
--  Run AFTER supabase-schema-v4.sql
--  Covers ALL planned features so schema is done in one shot
-- ============================================================

-- ── 1. Priority on existing tables ───────────────────────────────────────────
alter table issues add column if not exists priority text not null default 'medium';
alter table todos  add column if not exists priority text not null default 'medium';

-- ── 2. Build logs ─────────────────────────────────────────────────────────────
create table if not exists build_logs (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid references projects(id) on delete cascade not null,
  version_id   uuid references versions(id) on delete set null,
  platform     text not null default 'android', -- android|ios|windows|web|macos|linux
  build_number text,
  build_size   text,
  status       text not null default 'building', -- building|signed|submitted|rejected|live
  store        text,
  notes        text,
  built_at     timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
alter table build_logs enable row level security;
create policy "users_own_build_logs" on build_logs for all
  using (project_id in (select id from projects where user_id = auth.uid()));
create index if not exists idx_build_logs_project_id on build_logs(project_id);

-- ── 3. Environments ───────────────────────────────────────────────────────────
create table if not exists environments (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  name       text not null,
  url        text,
  color      text not null default '#8B8FA8',
  variables  jsonb not null default '[]',  -- [{key,value,masked}]
  notes      text,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
alter table environments enable row level security;
create policy "users_own_environments" on environments for all
  using (project_id in (select id from projects where user_id = auth.uid()));
create index if not exists idx_environments_project_id on environments(project_id);

-- ── 4. Dependencies ───────────────────────────────────────────────────────────
create table if not exists dependencies (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid references projects(id) on delete cascade not null,
  name           text not null,
  current_version text,
  latest_version text,
  type           text not null default 'npm', -- npm|pip|gradle|cocoapods|cargo|gem|other
  status         text not null default 'ok',  -- ok|outdated|deprecated|conflict
  notes          text,
  created_at     timestamptz not null default now()
);
alter table dependencies enable row level security;
create policy "users_own_dependencies" on dependencies for all
  using (project_id in (select id from projects where user_id = auth.uid()));
create index if not exists idx_dependencies_project_id on dependencies(project_id);

-- ── 5. Tags ───────────────────────────────────────────────────────────────────
create table if not exists tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade not null,
  name       text not null,
  color      text not null default '#00D4FF',
  created_at timestamptz not null default now(),
  unique(user_id, name)
);
alter table tags enable row level security;
create policy "users_own_tags" on tags for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists project_tags (
  project_id uuid references projects(id) on delete cascade,
  tag_id     uuid references tags(id) on delete cascade,
  primary key (project_id, tag_id)
);
alter table project_tags enable row level security;
create policy "users_own_project_tags" on project_tags for all
  using (project_id in (select id from projects where user_id = auth.uid()));

-- ── 6. Project templates ──────────────────────────────────────────────────────
create table if not exists project_templates (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade not null,
  name          text not null,
  description   text,
  template_data jsonb not null default '{}',
  created_at    timestamptz not null default now()
);
alter table project_templates enable row level security;
create policy "users_own_templates" on project_templates for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 7. Public project pages ───────────────────────────────────────────────────
alter table projects add column if not exists is_public    boolean not null default false;
alter table projects add column if not exists public_slug  text unique;

-- Public read policy for public projects
create policy "public_read_projects" on projects for select
  to anon using (is_public = true);

-- ── 8. GitHub integration cache ───────────────────────────────────────────────
create table if not exists github_cache (
  project_id  uuid primary key references projects(id) on delete cascade,
  data        jsonb not null default '{}',
  fetched_at  timestamptz not null default now()
);
alter table github_cache enable row level security;
create policy "users_own_github_cache" on github_cache for all
  using (project_id in (select id from projects where user_id = auth.uid()));

-- ── 9. Activity log (for cross-project dashboard feed) ────────────────────────
-- Note: activity is derived from existing tables — no separate table needed.
-- We aggregate at query time from versions, milestones, todos, notes, issues.

-- ============================================================
-- Done! Schema v5 covers:
--   priority        — on issues + todos
--   build_logs      — per-project/version build tracking
--   environments    — dev/staging/prod with masked env vars
--   dependencies    — npm/pip/gradle etc with status
--   tags            — user-defined color labels on projects
--   project_tags    — many-to-many junction
--   project_templates — saved project starting configs
--   is_public + public_slug — public project pages
--   github_cache    — GitHub API response cache
-- ============================================================
