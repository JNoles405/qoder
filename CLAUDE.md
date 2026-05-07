# Qoder — Notes for Claude

Qoder is an Electron desktop app (React + Vite renderer, Supabase backend) with auto-update via `electron-updater` and GitHub releases.

## Do not remove these `dependencies` from package.json

These are required at **runtime in the packaged Electron main process**. They are imported by `main.js` via `require()` and must be shipped inside `app.asar`. If any of them go missing, the packaged app crashes on launch with `Cannot find module '...'`:

- `electron-log` — used by `main.js` for updater/main-process logging to `%APPDATA%\Qoder\logs\main.log`
- `electron-updater` — powers the auto-update flow (checkForUpdates, downloadUpdate, quitAndInstall)

**Do NOT** move these to `devDependencies`, and do NOT remove them on the theory that they "look unused" — they are consumed by `main.js`, which is never bundled by Vite and therefore has no static import graph that automated tools can follow.

There is a build guard in place: `npm run check:runtime-deps` (invoked automatically before every `electron:build/mac/win/linux`) will fail the build if either module is missing from `node_modules`. Do not disable or remove that script.

**Specifically, DO NOT change any of these four script lines** in `package.json`. The `npm run check:runtime-deps && ` prefix on each one is load-bearing — it's what actually runs the guard. An automated tool removed it once and shipped a broken installer:

```json
"electron:build": "npm run check:runtime-deps && npm run build && electron-builder",
"electron:mac":   "npm run check:runtime-deps && npm run build && electron-builder --mac",
"electron:win":   "npm run check:runtime-deps && npm run build && electron-builder --win --publish always",
"electron:linux": "npm run check:runtime-deps && npm run build && electron-builder --linux",
```

If you legitimately need to remove one of these deps, also remove its `require(...)` call from `main.js` in the same change, and update this file.

## Process split

- `main.js` — Electron main process. Runs in Node, uses CommonJS `require()`. NOT bundled by Vite. Anything imported here must be a real installed npm package.
- `preload.js` — Electron preload. Same rules as `main.js`.
- `src/**` — React renderer. Bundled by Vite into `dist/`. ES modules, can tree-shake.

When adding a dependency, ask: does `main.js` or `preload.js` use it? If yes → `dependencies`. If only `src/**` uses it → either works, but prefer `dependencies` for anything that ends up in the final bundle.

## NSIS installer customization

- `build/installer.nsh` is referenced by `package.json` `build.nsis.include`. It force-kills any orphaned `Qoder.exe` processes (GPU, renderer, crashpad helper, etc.) before install/uninstall so upgrades don't fail with "can't close Qoder".
- **The install-side macro MUST be `preInit`, NOT `customInit`.** `customInit` runs AFTER electron-builder's `CHECK_APP_RUNNING` macro inside `.onInit`, which means the "can't close Qoder" check has already fired by the time our taskkill would run — the fix would silently do nothing. `preInit` fires before `initMultiUser`/`CHECK_APP_RUNNING`, so it's the only correct hook. The uninstaller side uses `customUnInit` (no `preUnInit` macro exists).
- Do NOT delete `build/installer.nsh` or remove the `"include"` line from `nsis` config. The `nsis` block in `package.json` must contain all three of these keys:

```json
"nsis": {
  "oneClick": false,
  "allowToChangeInstallationDirectory": true,
  "include": "build/installer.nsh"
}
```

An automated tool removed the `"include"` line once, which silently disabled the fix — users started hitting "can't close Qoder" again on upgrades. If you're editing the `nsis` block for any reason, the `"include"` line stays.

## Auto-updater

- Publish target: GitHub releases on `JNoles405/qoder` (configured in `package.json` `build.publish`).
- `npm run electron:win` builds + publishes (requires `GH_TOKEN` env var with `repo` scope).
- `autoDownload = false` in `main.js` — the renderer explicitly calls `start-download` IPC after a user clicks the download button so progress can be shown.
- `allowDowngrade = false` — if the installed version is ever ahead of the GitHub release, no update will apply. Bump and publish in order.
- Version comparison in `check-for-updates` IPC uses a local `isNewer()` semver helper, not `!==`, so older remote versions don't get reported as "available".

## Login / Supabase

- Config (URL + anon key) is stored in localforage under `qoder-cfg-v2`.
- `AuthScreen` is a **single unified screen** combining email/password + collapsible Supabase URL/key fields. There is no separate `SetupScreen` — do not re-add one. Boot routes everyone without a session straight to `AuthScreen`.
- `handleAuth(email, pw, isSignUp, url, key)` takes the URL/key as parameters and persists `cfg` to localforage *before* calling Supabase, so the saved cfg always matches what was authenticated against.
- `AuthScreen` catches thrown errors from `handleAuth` and displays them inline — do not revert `handleAuth` to swallow errors into toasts.
- `"Failed to fetch"` in the auth screen means the Supabase host is unreachable (wrong URL, paused project, or network issue) — it's not a code bug.

### Local-only mode (implemented)

- "Continue locally" on `AuthScreen` calls `handleLocal`, which sets `cfg = {url: LOCAL_URL, key: "local", localOnly: true}` and a synthetic session, persists both to localforage, and loads data via the same `loadProjects`/`loadUserTags`/`loadUserGroups` path as cloud mode.
- **Architecture:** every `sb.get/post/patch/del/upsertSettings/uploadFile/signIn/signUp/refresh/signOut` method checks `u === LOCAL_URL` first and dispatches to a `localDb` module backed by `localStorage`. This means every existing call site (~130 of them) works unchanged in both modes — do not refactor them to branch on mode at the call site. If you add a new Supabase call, route it through `sb.*` rather than raw `fetch` and it will automatically work in local mode.
- **Storage layout:** one row per table at `qoder-local-table:<tableName>` (e.g. `qoder-local-table:projects`, `qoder-local-table:todos`). The primary backend is **IndexedDB** (object store `tables` in DB `qoder-local`) with a localStorage fallback for environments where IDB is unavailable or for legacy data not yet migrated. `localDb._read` reads from IDB first, then localStorage; `localDb._write` always writes IDB and removes the localStorage copy if present, so the system converges on a single backend over time.
- **Boot migration:** `migrateLocalStorageToIdb()` runs once at startup and copies any legacy `qoder-local-table:*` localStorage entries into IDB. Idempotent — no-ops if IDB already has matching keys. The fallback in `_read` covers the brief window where the migration hasn't completed yet but the app is already loading data.
- Files uploaded via `sb.uploadFile` in local mode become base64 `data:` URLs stored inline (works in `<img src>`, persists across reloads). After local→cloud sync, those data URLs are converted to real Supabase Storage URLs (see Phase 3 → File migration below).
- **Query support:** `localDb._parseQuery` handles `?field=eq.value`, `?field=in.(a,b,c)`, and `&order=field.asc|desc`. If you need a new operator (gt/lt/like/etc.), extend `_parseQuery` and `_match` in lockstep.
- **Composite-key mutations:** two call sites (`unassignTag`, `refreshGitHub`'s github_cache PATCH) use multi-field filters that don't fit `sb.del(table,id)` / `sb.patch(table,id,body)`. They branch on `cfg.url===LOCAL_URL` and use `localDb._read`/`_write` directly. If you add another composite-key mutation, follow the same pattern.
- **Boot flow:** `cfg.localOnly === true` on startup skips the Supabase refresh path entirely, synthesizes a session, and loads data through `sb.* → localDb`.
- **Sign-out from local mode** clears the session and persists `{localOnly: true}` only — local data in `qoder-local-table:*` stays intact, so signing back in lands the user on the same data.
### Local → Cloud sync (Phase 3, implemented)

- A `Sync to Supabase` button appears in the sidebar footer **only when `cfg.localOnly`** is true. It opens `SyncToCloudModal`.
- `SyncToCloudModal` collects Supabase URL + key + email + password, signs in or signs up against Supabase, then calls `migrateLocalToCloud(url, key, token, newUserId, onProgress)`. On success, the orchestrator `handleSyncToCloud` switches the running app into cloud mode and reloads projects from the server.
- **`migrateLocalToCloud` walks `MIGRATION_ORDER` table-by-table** in foreign-key-safe order: `tags → project_groups → user_settings → project_templates → projects → child tables (versions/milestones/notes/todos/etc.) → project_tags → issue_comments`. Modify `MIGRATION_ORDER` if you add a new table; parents must come before children that reference them via foreign key.
- **`TABLES_WITH_USER_ID`** lists the tables whose `user_id` column gets rewritten from `LOCAL_USER_ID` to the freshly-authenticated Supabase `user.id`. Add new user-scoped tables here when introducing them.
- **`user_settings` is special-cased**: it goes through `sb.upsertSettings` (merge-duplicates) rather than a plain `sb.post`, because Supabase auto-creates a default settings row for new users that would otherwise trip the unique constraint.
- **Pre-flight allows resumed syncs:** the check refuses migration only when the cloud account has projects whose ids aren't in the local set. If every cloud project id ⊆ local project ids, this is a previous partial-sync remnant and the migration proceeds (emitting `phase: "resume"` so the UI can label it accordingly). Empty accounts always proceed.
- **Resumable via upsert:** every batch insert during migration goes through `sb.post(..., {upsert: true})`, which sends `Prefer: resolution=merge-duplicates`. Rows are idempotent on primary key — re-running a partially-failed sync is safe; matching ids merge, new ones insert.
- **File migration:** `rewriteDataUrls(value, replaceFn)` recursively walks each row, finds `data:` URL strings (any depth, any field shape), and replaces them via `replaceFn`. The migration uses it to upload base64 inline files to Supabase Storage and substitute the public URL. Add new tables that store data URLs to `MIGRATION_ORDER` and they're handled automatically — the rewriter is field-agnostic.
- **Local tables are NOT deleted after migration.** They stay in IDB (and any legacy localStorage entries) as a backup so the user can recover if something is wrong. The "Clear local backup" banner (Phase 3.5) is the in-app UI to clean them up.
- **IDs are kept as-is** during migration. `localDb._uuid()` uses `crypto.randomUUID()` (standard UUIDs) on every modern browser/Electron we ship to. The fallback `"loc-..."` IDs would fail Supabase UUID column type checks — if a user reports migration failures with "invalid input syntax for type uuid", that's the cause and we'd need to add ID remapping with FK rewrites.

### Local backup banner (Phase 3.5, implemented)

- After a successful local→cloud sync, `qoder-local-table:*` keys still sit in `localStorage` as a safety net. A banner at the top of the main content area surfaces this fact so the user can clear or dismiss.
- Banner shows iff: `!cfg.localOnly && localBackupCount > 0 && !localBackupDismissed`.
- `getLocalBackupCount()` and `clearLocalBackup()` are async — they walk both IDB and localStorage to count/remove `qoder-local-table:*` entries from whichever backend(s) hold data. The clear function also wipes `LOCAL_BACKUP_DISMISSED_KEY` so a future sync starts with a fresh banner.
- `handleSyncToCloud` resets `localBackupDismissed` to false after sync — every fresh sync deserves a fresh notification, even if the user dismissed an earlier one.
- Two-step confirmation on Clear: first click expands "Are you sure?" with explicit Cancel / "Yes, delete" buttons. The second click is the destructive one.
- Hide is persistent (writes `LOCAL_BACKUP_DISMISSED_KEY=1` to localStorage). Don't conflate with Clear — Hide keeps the data, Clear removes it.
