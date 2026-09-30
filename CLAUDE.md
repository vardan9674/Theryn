# Theryn — notes for Claude

Read this before changing anything. The map of the code is
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), the change log is
[docs/WORKLOG.md](docs/WORKLOG.md) and the decisions are in
[docs/decisions/](docs/decisions/). `CODEBASE.md` is stale (April 2026), so use it
only for design tokens and the Android build notes.

## What is live

- **theryn.fit is live and has real users.** Coaches use the web dashboard
  (`src/coach/`). Their clients use the public no-login link page `/f/<token>`
  (`src/link/`, RPCs `link_view` / `link_submit`). Vercel deploys `main`.
  theryn.fit redirects to www.theryn.fit, so pass `-L` to curl.
- **The native app (Capacitor, iOS/Android) has no users.** Athlete-app bugs are
  low priority. The app bundles its own copy of `dist` (`webDir: 'dist'`, no
  `server.url`), so a web deploy never updates an installed app.
- Almost every live client is a name-only client (`coach_manual_clients`). Their
  only channel is their link, and their data lives in `client_submissions` and the
  plan JSON on the manual row.
- To tell a deploy problem from a missing feature, fetch the live asset and grep
  it:
  `for a in $(curl -sL https://www.theryn.fit/ | grep -oE '/assets/[A-Za-z0-9_.-]+\.js'); do curl -sL "https://www.theryn.fit$a" | grep -qF "<string>" && echo "$a"; done`

## Commands

`npm run dev` · `npm test` (vitest) · `npm run typecheck` · `npm run build`.
Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (see `.env.example`;
`.env` is git-ignored).

## Working rules

- **Explain before touching the live database.** Before anything that executes
  SQL against production (project ref `rmzfisntgiodoadwaewx`), even a rolled-back
  dry run, tell the user in plain language what changes, whether it touches
  real client data, and the benefit. Then wait for "go ahead". Read-only
  diagnostics are fine.
- **Branch from a fresh `origin/main`.** Run `git fetch origin` and branch from
  `origin/main`, not from whatever is checked out. Before opening or merging a
  PR, rebase if `git rev-list --count <branch>..origin/main` is non-zero, then
  rebuild.
- **Never `git add -A` or `git commit -a`.** The main checkout often holds other
  people's unfinished work. Diff each file and commit only your own hunks. Do
  rebases in a throwaway `git worktree`, not by stashing.
- **Don't delete `claude/practical-hamilton-8b2f30`.** It holds the only
  reference fix for three athlete-log bugs that are still in `main`: the chat FAB
  under the rest timer, no athlete unread badge, and the timer covering the
  scroll bottom. The spec is in closed PR #5.
- **Mockups for athletes and coaches must be plain.** Name a real exercise or day
  with a number and a fix on every row. No jargon (not "1RM", "Epley" or
  "median"). Make every screen fit one phone height (390×844). Only show data the
  app already stores reliably. Anything that needs new data collection goes on a
  separate "after we add X" screen.
- **Never show data-quality status to users.** No "Muscles checked" badges.
  Muscle verification stays internal; users only see the "Wrong muscle?" report.

## Database and migrations

- **New migrations use full timestamps** (`supabase migration new`). A version
  that is a prefix of another (`004` vs `0041`) breaks `supabase db push`.
- **The live ledger records the early base files as `0040`, `0041`, `0050`,
  `0051`, `0052`, `0060`, `0061`, `0062`, `0071` and `0072`.** If this folder
  still shows `004_…`, `005_…` and so on, that rename hasn't landed on `main`
  yet, so don't run `db push` until it has.
- **The Supabase MCP `apply_migration` stamps its own version.** Rename the local
  file to the recorded version straight afterwards, or the next `db push`
  re-applies it. To keep an already-committed filename instead, run the DDL with
  `execute_sql` and insert `(version, name)` into
  `supabase_migrations.schema_migrations` yourself. First diff the live
  `pg_get_functiondef` against the file so an older definition doesn't replace a
  newer one.
- **A merged PR doesn't mean its migration was applied.** After merging SQL,
  compare `list_migrations` against `git ls-tree origin/main -- supabase/migrations`.
- **Leave `supabase/migrations/_recovered_push_notifications/` alone.** Its files
  are unapplied and unrecorded.
- **Some SQL is live in production but not on `main`.** It's on
  `origin/archive/applied-migrations-2026-09`: the advisor cleanup and the admin
  stack (`admin_users`, `health_checks`, `is_admin()`, `admin_stats()`…). Look
  there before recreating any of it. The admin stack's SQL and its app code
  should land together as one PR.
- **Revoke grants explicitly.** New objects in `public` get broad grants by
  default:
  - Functions get EXECUTE for `anon` explicitly and through PUBLIC, so revoke
    both: `REVOKE ALL ON FUNCTION f(args) FROM PUBLIC;` and
    `REVOKE EXECUTE ON FUNCTION f(args) FROM anon;`.
  - Tables get `GRANT ALL`, which includes **TRUNCATE**, and RLS doesn't stop
    TRUNCATE. For read-only tables:
    `REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON … FROM authenticated;`
    plus `REVOKE ALL … FROM anon;`.
  - Verify with `has_table_privilege` / `has_function_privilege`.
- **Prove a migration offline first.** There is no Docker here.
  `@electric-sql/pglite` runs roles, RLS and SECURITY DEFINER like Postgres 17.
  Stub `auth.uid()` from `current_setting('request.jwt.claim.sub')`.

## Access rules (don't loosen these)

- **Coach access** (since PR #92 / #121):
  - `profiles` SELECT covers only yourself and the other side of a
    `coach_athletes` row. Use a SECURITY DEFINER RPC to read anyone else.
  - Coaches insert `coach_athletes` only as pending. Accepting by code goes
    through `coach_connect_by_code`, and only `status` can change via the API.
  - `client_links` has no direct INSERT (use `client_link_upsert`), and a
    trigger freezes the link fields.
  - Plan writes go through the plan RPCs.
  - `process-outbox` needs the `x-cron-secret` header (Vault
    `outbox_cron_secret`).
- **Client connect** (since PR #128): a client gets an account only through their
  own link (`?join=<code>` → `link_connect`, or `link_request_connect` → coach
  approves). **Never create a `coach_athletes` row on connect.** The client list
  is accepted `coach_athletes` ∪ `coach_manual_clients`, so the client would
  appear twice. Connecting only stamps `client_links.connected_*` and
  `coach_manual_clients.linked_athlete_id`, and moves no data.
- **Timezones** (since PR #96): coach-dashboard facts about a client use the
  client's clock. Pass `clientNow(data)` (`src/coach/lib/clientClock.js`) as
  `now`. Payments stay on the coach's clock. Day keys come from local
  `isoDate`, **never `toISOString().slice(0,10)`**, which puts India a day
  behind until 5:30 am.

## Exercises

- **Identity is name-based and fragile.** Plans store free-text names, and
  `resolve_exercise_id` fuzzy-matches with `ILIKE '%name%' LIMIT 1`. Athlete
  logging creates a new private exercise for any unmatched name, and records
  group by display name. Fix identity (pass IDs through, rename in place, group
  by ID) before building anything per-exercise such as PRs, trends or stalls.
  Spec: https://claude.ai/artifact/LpD2yRz5yJ8aL55DzBGJyL
- **There are two exercise lists.**
  - Coach plans use `public_exercises` (513 rows, via `search_exercises`) plus
    `user_exercises`.
  - The athlete app uses `public/exercises.json` (873 rows, free-exercise-db,
    public domain; its photos are *not* cleared).
  - Any pick that crosses from one list to the other must go through
    `checkNewExercise()` (`src/coach/lib/exerciseMatch.js`). Never add a library
    name to a plan directly.
  - Matching rules: equipment is a hard separator, and a typo-corrected match
    means "ask", never "same".
- **The muscle heat map** (`src/lib/muscleHeat.js`):
  - It counts sets ticked, not sets planned.
  - The name reducer never drops body-part or direction words (`leg`,
    `overhead`, …), and `normalizeExerciseName` must stay idempotent.
  - Unknown exercises are named, never guessed.
  - After changing aliases or `exercises.json`, regenerate with
    `node scripts/build-muscle-map.mjs`.
- **Body drawing** comes from react-native-body-highlighter (MIT). Keep the
  licence header in `src/lib/bodyMap/bodyPaths.js`.
- **The link page's load kind is decided by name.** `src/lib/exerciseLoad.js`
  sorts exercises into body, band and weight. The signed-in athlete app
  (`src/App.jsx`) doesn't yet have swap, reps-only or band handling.

## Weekly report (PR #156)

`src/coach/lib/weeklyReport.js`, `ReportsTab.jsx`, `src/link/LinkReport.jsx`,
table `coach_reports`.

- Say whether a pattern comes from the *plan* or the *client*.
- Split each pattern into "Seen:" (a stored fact) and "Worth asking:" (a
  question, never an invented reason).
- It stays a draft until the coach shares it. Body weight and waist are off by
  default.
- With fewer than 2 workouts, give no "most trained" verdict.
- Turning up isn't the same as finishing.
