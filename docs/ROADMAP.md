# Roadmap

Status: `todo` · `doing` · `done` · `dropped`. Update the status in place and add a line to WORKLOG.md when it changes.

## Phase 0 — Stabilize (blocks everything else)

| # | Task | Status | Notes |
|---|---|---|---|
| 0.1 | Commit the rescued push migrations and `docs/` | done | 2026-09-08, branch `chore/tracking-foundation` |
| 0.2 | Rotate the Supabase service-role key; re-create the cron job reading the key from Vault; re-set `FCM_SERVICE_ACCOUNT_JSON` | todo | Do in the dashboard. See OBSERVABILITY.md for the cron query |
| 0.3 | Reconcile migration history: `supabase db pull`, compare, `supabase migration repair`, renumber to timestamps | todo | Do not run `db push` before this is clean |
| 0.4 | Remove the 18 agent worktrees and 31 merged `claude/*` branches | todo | Only after 0.1 is merged |
| 0.5 | Add `typecheck` script, GitHub Actions workflow (typecheck + build on PR), and an error boundary around `<App />` | todo | First CI |
| 0.6 | Database hardening migration: `SET search_path` on all DEFINER functions; `auth.uid()` checks in `search_exercises` and `get_last_set_values`; `routines_archive` insert policy to `WITH CHECK (false)`; FCM dead-token detection narrowed; `workout_sessions.routine_day_id ON DELETE SET NULL` | todo | One migration, reviewed |
| 0.7 | Delete dead code: `useAuth.ts`, `useActiveSession.ts` (or wire it), `components/LoginScreen.jsx`, `CoachRecordsTab`, duplicate `SwipeRow`, root prototypes | todo | |

## Phase 1 — Make it sustainable

| # | Task | Status | Notes |
|---|---|---|---|
| 1.1 | Create a staging Supabase project; `.env.staging`; CI deploys migrations and edge functions to staging on PR | todo | Second free project |
| 1.2 | CI deploys migrations and edge functions to production on merge to main | todo | Needs `SUPABASE_ACCESS_TOKEN` and project ref as GitHub secrets |
| 1.3 | Split `App.jsx`: `components/coach/`, `components/athlete/`, one `tokens.js` for all files | todo | Move, do not rewrite |
| 1.4 | First tests: `coachInsights.js`, `usePayments.ts` cycle math, `offlineQueue.ts` | todo | Vitest |
| 1.5 | Fix content: add `og-image.png`, remove the email sign-in claim, decide on the PWA manifest | todo | |
| 1.6 | Sign in with Apple on iOS | todo | Required by App Store guideline 4.8 |
| 1.7 | Email/password signup | todo | Supported by the existing auth server |
| 1.8 | Mobile build workflow (Fastlane or EAS-style script) | todo | |

## Phase 2 — Analytics lakehouse (learning project, runs in parallel after 0.3)

| # | Task | Status | Notes |
|---|---|---|---|
| 2.1 | Databricks Free Edition workspace | todo | $0 |
| 2.2 | Nightly export of Postgres tables to Delta tables (start with CSV via a GitHub Actions cron, later CDC) | todo | Read-only against production |
| 2.3 | Port `coachInsights.js` rules to a notebook; compare results to the client | todo | |
| 2.4 | Adherence, volume, retention dashboards across all athletes | todo | |
| 2.5 | Optional: write computed insights back to a `coach_insights` table the app reads | todo | Only after 2.3 matches |

## Phase 3 — Self-host (only with a reason)

| # | Task | Status | Notes |
|---|---|---|---|
| 3.1 | Trigger: outgrow free tier, or need data ownership | todo | Not before Phase 1 |
| 3.2 | Oracle Cloud Always Free ARM VM with the Supabase Docker stack | todo | Same schema, same client code |
| 3.3 | Restore from a production dump, point `.env` at the new host, run the stress tests | todo | |
| 3.4 | Backups to object storage, uptime monitor | todo | |
