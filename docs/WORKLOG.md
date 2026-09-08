# Work log

Newest first. One entry per working session. Record what was done, what was found, and what is still open.

## 2026-09-08 — Restart after four months idle

**Context.** Last commit was 2026-04-30. Goal: understand the current state, get the app running, and set up tracking so future work is visible.

**Done**
- Verified the app runs: `npm run dev` on port 5173, landing page renders with no console errors, "Start Free" reaches Google OAuth against the live Supabase project `rmzfisntgiodoadwaewx`.
- `tsc --noEmit` passes. `vite build` passes (one 1.28 MB chunk). `npx cap doctor` passes for iOS and Android.
- Reverted an uncommitted edit in `.claude/launch.json` that pointed the preview at port 5174.
- Rescued five push-notification migrations that existed only inside the gitignored worktree `.claude/worktrees/festive-ishizaka-148a08/`. Copied to `supabase/migrations/_recovered_push_notifications/` with the embedded service-role JWT redacted. The CLI ignores subfolders, so nothing is applied automatically.
- Wrote `docs/` (this folder), four decision records, and the roadmap.
- Published the architecture page as a Claude artifact and mirrored it in `docs/ARCHITECTURE.md`.

**Found**
- `CODEBASE.md` describes the codebase as of 2026-04-19 and is wrong about size, files, and features.
- Migration drift: remote history is 001, 002, 003, 004, 0041, 005, 006. Local has 001 to 011 with two files each for 004, 005, 006, 007. The remote 005 and 006 rows came from the worktree's push files, not from the local files of the same number.
- The recovered cron migration embedded a live service-role JWT (expires 2090). It is also stored in the database's `cron.job` table. Must be rotated.
- 17 of 18 SECURITY DEFINER functions have no `SET search_path`.
- `search_exercises` and `get_last_set_values` trust a client-supplied user id.
- `routines_archive` INSERT policy is `WITH CHECK (true)`.
- `assign_template` deletes routine_days, but `workout_sessions.routine_day_id` has no ON DELETE action.
- `_shared/fcm.ts` treats FCM `INVALID_ARGUMENT` as a dead token.
- Dead code: `useAuth.ts`, `useActiveSession.ts`, `components/LoginScreen.jsx`, `CoachRecordsTab`, a second `SwipeRow`.
- No CI, tests, lint, or error boundary. `.github/workflows/` is empty.
- 18 leftover agent worktrees (386 MB), 31 merged `claude/*` branches.
- `og-image.png` is referenced in `index.html` but missing. PWA manifest exists without a service worker.

**Decided** (see `decisions/`)
- 0001 Postgres stays the system of record.
- 0002 Databricks is for analytics downstream, never for live app data.
- 0003 Stay on Supabase cloud free tier; self-host only with a concrete reason.
- 0004 Google sign-in stays; Apple sign-in is required before iOS App Store submission.

**Design**
- Audited the coach web UI: 7 tabs, no home, picker disappears after selection, edit hidden behind a chip, jargon, no export.
- Mocked three directions (A Today-first, B table + side panel, C six verbs) on the Claude Design canvas "Theryn Coach Dashboard". Owner chose B. Built B out to 6 laptop + 6 phone screens including Export to Excel. Decision 0005.

**Open**
- Rotate the service-role key and move the cron job secret to Vault (Roadmap 0.2).
- Reconcile migration history (Roadmap 0.3).
- Decide whether `active_sessions` gets wired up or dropped.
