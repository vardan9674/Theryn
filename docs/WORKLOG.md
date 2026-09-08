# Work log

Newest first. One entry per working session. Record what was done, what was found, and what is still open.

## 2026-09-09 — Coach dashboard rebuild (Direction B), branch `feat/coach-dashboard-b`

**Done**
- New coach app under `src/coach/`: `CoachApp.jsx` shell (Clients · Plans · Payments · Messages), pages for the client table with side panel/drawer/full page, client detail tabs (Plan, Progress, Body, Payments), plan editor with drag reorder, Excel export dialog, plans library, payments ledger, messages, add-client and profile sheets.
- Data seam: `src/coach/data/CoachDataContext.jsx` with a Supabase implementation and an in-memory mock. `?coachPreview=1` renders the dashboard with sample data in dev, no sign-in needed. This is what QA runs against.
- Pure helpers with unit tests (vitest): `clientFacts.js` (last workout, this week, what to do, payment status), `exportPlan.ts` (one sheet per training day; last-lifted weights; optional blank columns), `format.js`. 23 tests.
- `useRoutine.ts` now persists and hydrates sets/reps (`target_sets`, `target_reps`) so the editor's numbers survive a reload.
- `ErrorBoundary` around the whole app in `main.jsx`. `npm run typecheck` and `npm test` scripts.
- Added `xlsx` (SheetJS) for the export and `@capacitor/filesystem` for native share of the file.
- `App.jsx` now mounts the new `CoachDashboard`; the old CoachApp and its tabs are still in the file and will be deleted in a follow-up PR once QA signs off.

**Found and fixed during verification**
- Checkbox rows in the export dialog rendered as light default buttons with invisible text.
- Top navigation overflowed at tablet width; search moved below the bar and Add client became icon-only there.
- Plans and Payments tables lost their action buttons at tablet width; both use cards below laptop width now.
- Phone chat input floated mid-screen because the pane was rendered outside its flex wrapper.

**Verified**
- Laptop 1440, tablet 790–900, phone 375: table/cards, drawer/panel/page, plan tab, export dialog, editor (2 columns tablet, day strip phone), plans, payments, messages with a sent message. No console errors. Typecheck, tests, production build pass.

**QA pass (agent, 13-point checklist at 375/790/1440)** — 15 findings, all fixed:
- Major: "Late" payment state was unreachable — `athletePaymentStatus` only looked at the cycle containing today. Now a fee is expected on each cycle's start date: Paid / Due today / Late by N days / Paused / No fee set.
- Major: sample data flagged every client; sessions now land on scheduled days so the preview has one urgent client, one PR, one late payment, and four on track.
- Minor: client detail forgot its tab after the plan editor closed (tab state lifted to the shell); push modal showed "Template saved ✓ … v." (copy props added); Plans export spoke of the plan as a person; 7 editor columns clipped names at 1440 (now 4 columns until 1560px); phone tap targets under 44px; paused fee read "No fee set"; autocomplete opened on empty input; BMI hint shown when BMI existed; plan cards missing version; toast covered the chat input on wide screens; grip handle too faint; old template editor back button had no label.
- Also: primary/danger button text was inheriting near-white (reported by the owner from the live page).

**Open**
- Owner to try the branch preview with a real account (Vercel preview URL on PR #38).
- Delete the old coach code from App.jsx (follow-up PR).
- "Send in chat" from the export dialog needs a storage bucket; not built. File goes via Download (web) or Share sheet (native).

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
