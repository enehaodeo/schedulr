# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Schedulr is a class time-management PWA a teacher built for their students: a private Gantt chart for long tasks, a private day schedule for short tasks, and public tasks published to students by course. The original spec is `应用需求.docx`. It works offline with no account (data in IndexedDB) and syncs to Supabase after login. UI strings and code comments are in Chinese; keep them that way.

## Commands

```bash
npm run dev                            # http://localhost:5173 (also the "dev" entry in .claude/launch.json)
npm run test                           # all tests, vitest run
npx vitest run tests/merge.test.ts     # one file
npx vitest run -t "keeps newer dirty"  # one test by name
npm run build                          # tsc -b && vite build; this is the only typecheck
```

There is no linter. `tsconfig` has `noUnusedLocals` and `noUnusedParameters` on, so unused code fails the build; prefix deliberately unused destructured values with `_`.

Tests run in the `node` environment and cover only pure logic (`autoSchedule`, `gantt`, `merge`). There are no component or IndexedDB tests. `fake-indexeddb` is installed but unused.

## Deployment

Pushing to `master` is a production release: `.github/workflows/deploy.yml` runs the tests and build, then publishes to GitHub Pages at `https://enehaodeo.github.io/schedulr/`, which students use. Vite env vars come from GitHub Actions repository variables there, and from `.env.local` locally.

The app is served from a sub-path via `BASE_PATH`. Use `import.meta.env.BASE_URL` for asset URLs rather than a leading `/`. The router gets it as `basename`, and `sw.ts` resolves push notification paths against the service worker scope, so server-sent `url` values stay app-relative (`/schedule`).

## Architecture

**Local-first.** Dexie (IndexedDB) is the source of truth for personal data and the UI never reads it from Supabase. Components read with `useLiveQuery` directly on `db`, and all personal-data writes go through `src/db/repo.ts`. Repo writes use `stamp()` to set `updated_at` and `dirty: 1`, then call `changed()`, which schedules a debounced sync. A write that bypasses the repo won't sync.

**`supabase` can be null.** `src/supabase/client.ts` exports null when env vars are missing, and the app must keep working in that local-only mode. `sessionStore` being null (guest) is handled the same way.

**Sync** (`src/sync/syncEngine.ts`) runs on local change, window focus, and coming back online. It syncs the profile, then pulls and pushes each table in `SYNC_TABLES`.
- Pull uses a per-table `cursor:<table>` in `meta`, compared against the server-set `synced_at`.
- Conflicts are last-write-wins on the client clock `updated_at` (`src/sync/merge.ts`).
- Push upserts every local column except `dirty`, so a new local-only field needs excluding there or the upsert fails. `synced_at` is stripped on pull and never stored locally.
- On login, `adoptUser` claims guest rows for the account, or wipes local data if it belonged to a different user. Sign-out wipes local data.
- Don't `await` Supabase calls inside `onAuthStateChange`; it deadlocks, which is why that callback defers with `setTimeout`.

**A schema change has several parts that must stay in step:** `src/db/types.ts`, a new `.version(n)` in `src/db/dexie.ts` when indexes change, and a new numbered file in `supabase/migrations/`. Migrations already there are applied to the live project (ref in `.mcp.json`), so add a new file rather than editing one.

**Deleted vs. trash.** `status: 'trash'` means done or discarded; the row shows in the trash page and can be restored. `deleted: true` is a permanent tombstone kept so the deletion syncs. Queries must filter `!t.deleted` as well as checking status.

**Rules enforced in two places.** The Postgres check `end_before_deadline` on `long_tasks` mirrors `fitsDeadline` in `src/features/longTasks/gantt.ts`. If the client lets through a row the database rejects, the upsert fails and the whole sync run stops with an error, so keep them identical.

**Time is represented three ways:** long tasks use local `yyyy-MM-dd` strings, short tasks use ms timestamps (`start_at`/`end_at`), and availability uses minutes since local midnight. Convert with `src/lib/dates.ts`. A `date` availability row replaces that day's weekly template (`slotsForDate`).

**Short task trees.** Subtasks are one level deep via `parent_id`. A parent stays in the pool until every child is finished, and only leaves are scheduled: `leafQueue` in `src/features/shortTasks/tree.ts` turns pool order into auto-schedule priority. After moving a child to trash, call `settleParent`.

**Dragging from a task pool** goes through `src/lib/taskDrag.ts`. Take the drop position from `useDropPointer`, not from `DragEndEvent.delta`: once the pointer is over a droppable inside a scroll container, `delta` includes that container's scroll offset. Drop areas need `data-drop-area` on their visible scroll container, because the droppable body is larger than what's on screen. Phones start a drag with a long press so swiping a card still scrolls. Writes made on drop go through `useOptimisticRows` so the result shows in the same render that clears the drag; otherwise cards jump back until `useLiveQuery` catches up. `DragOverlay` keeps `dropAnimation={null}` because the default animation hides the source card while it plays.

**Scheduling** (`src/features/scheduler/autoSchedule.ts`) is a greedy pure function: pool order first, earliest slot that fits, skip what doesn't. `canPlace` validates manual placement. Keep this logic in pure modules so it stays testable.

**Public tasks are online-only and never stored in Dexie.** The UI calls this area 白板; code, tables and the `/public` route keep the "public" name. `src/features/public/inbox.ts` reads `public_tasks` directly; RLS limits rows to those whose `scopes` overlap the reader's `profiles.courses`, or the author's own. Adding one copies it into a private row via `addFromPublic` (with `source_public_id`), and `public_task_actions` records added/trashed per user. Scopes are the course codes from `src/lib/courses.ts`, so renaming a code orphans existing data.

**Reminders come from two sources.** `ReminderWatcher` fires while the page is open; the `send-reminders` Edge Function fires from pg_cron every minute. Both use the 5-minute lead and the tag `${id}:${kind}:${at}` so the OS merges duplicates; `reminder_log` dedupes on the server. Change them together. Task expiry is client-only: `ExpiryWatcher` prompts done/not done.

**Edge Functions** (`supabase/functions/`) run on Deno with `npm:` imports and are outside `tsconfig`, so `npm run build` doesn't check them. They are deployed with `--no-verify-jwt` and authenticate with the `x-cron-secret` header. `supabase/setup_jobs.sql` holds the cron job and the insert trigger that calls them.

Global non-persistent state uses the tiny `createStore`/`useStore` in `src/lib/store.ts`, not a state library.
