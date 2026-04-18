# Qoder — Notes for Claude

Qoder is an Electron desktop app (React + Vite renderer, Supabase backend) with auto-update via `electron-updater` and GitHub releases.

## Do not remove these `dependencies` from package.json

These are required at **runtime in the packaged Electron main process**. They are imported by `main.js` via `require()` and must be shipped inside `app.asar`. If any of them go missing, the packaged app crashes on launch with `Cannot find module '...'`:

- `electron-log` — used by `main.js` for updater/main-process logging to `%APPDATA%\Qoder\logs\main.log`
- `electron-updater` — powers the auto-update flow (checkForUpdates, downloadUpdate, quitAndInstall)

**Do NOT** move these to `devDependencies`, and do NOT remove them on the theory that they "look unused" — they are consumed by `main.js`, which is never bundled by Vite and therefore has no static import graph that automated tools can follow.

There is a build guard in place: `npm run check:runtime-deps` (invoked automatically before every `electron:build/mac/win/linux`) will fail the build if either module is missing from `node_modules`. Do not disable or remove that script.

If you legitimately need to remove one of these deps, also remove its `require(...)` call from `main.js` in the same change, and update this file.

## Process split

- `main.js` — Electron main process. Runs in Node, uses CommonJS `require()`. NOT bundled by Vite. Anything imported here must be a real installed npm package.
- `preload.js` — Electron preload. Same rules as `main.js`.
- `src/**` — React renderer. Bundled by Vite into `dist/`. ES modules, can tree-shake.

When adding a dependency, ask: does `main.js` or `preload.js` use it? If yes → `dependencies`. If only `src/**` uses it → either works, but prefer `dependencies` for anything that ends up in the final bundle.

## Auto-updater

- Publish target: GitHub releases on `JNoles405/qoder` (configured in `package.json` `build.publish`).
- `npm run electron:win` builds + publishes (requires `GH_TOKEN` env var with `repo` scope).
- `autoDownload = false` in `main.js` — the renderer explicitly calls `start-download` IPC after a user clicks the download button so progress can be shown.
- `allowDowngrade = false` — if the installed version is ever ahead of the GitHub release, no update will apply. Bump and publish in order.
- Version comparison in `check-for-updates` IPC uses a local `isNewer()` semver helper, not `!==`, so older remote versions don't get reported as "available".

## Login / Supabase

- Config (URL + anon key) is stored in localforage under `qoder-cfg-v2`.
- `AuthScreen` catches thrown errors from `handleAuth` and displays them inline — do not revert `handleAuth` to swallow errors into toasts.
- `"Failed to fetch"` in the auth screen means the Supabase host is unreachable (wrong URL, paused project, or network issue) — it's not a code bug.
