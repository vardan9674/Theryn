# Theryn architecture

Snapshot 2026-09-08, derived from source at commit `5a0d635`. The rich version with diagrams is the Claude artifact "Theryn Architecture"; this file is the tracked mirror. Update both when the system changes.

## What it is

One React codebase, two roles. Athletes follow a weekly routine, log sets with a rest timer, track weight and measurements, and chat with their coach. Coaches manage a roster, build and push routine templates, read rule-based insight signals, keep a manual payment ledger, and message athletes. Web renders a desktop coach layout and an athlete download wall; native renders bottom tabs.

There is no server of Theryn's own. Postgres row-level security is the authorization layer, PostgREST is the API, Realtime carries chat, and one Edge Function drains a push outbox to Firebase Cloud Messaging every minute.

## Stack

| Layer | Choice |
|---|---|
| UI | React 18.3, plain JSX, inline design tokens; no router, no state library |
| Build | Vite 5.4; TypeScript 5.5 for hooks and lib only |
| Native | Capacitor 8.3, app id `com.theryn.app`; plugins App, Browser, Haptics, Share, Local Notifications, Push Notifications |
| Backend | Supabase: Postgres 17.6, GoTrue, PostgREST, Realtime, Edge Functions (Deno), pg_cron, pg_net, pg_trgm |
| Auth | Google OAuth only, PKCE; native returns via `com.theryn.app://login-callback` |
| Push | FCM v1 for both platforms, APNs through FCM's apns block |
| Offline | IndexedDB (`idb`) outboxes plus localStorage caches |
| Hosting | Vercel with SPA rewrite, theryn.fit |

## Frontend

`src/main.jsx` mounts `<App />` with no providers or error boundary. `src/App.jsx` (7,695 lines, 47 components) holds both application roots.

Render cascade in `GymApp`, in order:
1. Auth loading → spinner
2. No user: web → `LandingPage`, native → `LoginScreen`
3. `profiles.onboarding_completed` false → `FullNameSetup`
4. No role → `RolePickerScreen` (role in localStorage per user, mirrored to `profiles.role`)
5. Athlete on web → `WebAthleteDownloadPage`
6. Coach → `CoachApp` (own tab state, own Android back handler)
7. Athlete tab shell: Log, Routine, Body, Progress, Records, hidden Profile

Navigation is tab state, not URLs. Android back is a handler stack in `src/lib/backStack.ts`.

| Path | Lines | Holds |
|---|---|---|
| `src/App.jsx` | 7,695 | GymApp, LogScreen (~1,000), all athlete screens, LoginScreen, tours, CoachApp and seven coach tabs, payment sheets |
| `src/components/LandingPage.jsx` | 1,443 | Marketing site, own theme context, pricing table |
| `src/components/coach/AthleteDepth.jsx` | 893 | Attendance calendar, heatmap, volume chart, PR timeline |
| `src/components/templates/*` | 1,702 | Template list, editor, exercise autocomplete, assign sheet, push modal, `tokens.js` |
| `src/components/ChatView.jsx` | 467 | Portal chat view |
| `src/lib/coachInsights.js` | 640 | Pure rule engine: 10 signals, 4 severities, BMI |
| `src/lib/offlineQueue.ts`, `actionRegistry.ts`, `backStack.ts`, `supabase.ts` | 230 | Outbox replay, import-cycle breaker, back stack, client |

Data modules in `src/hooks/` (only `useAuth`, `useChat`, `usePushNotifications` are React hooks):

| Module | Tables / RPCs | Note |
|---|---|---|
| `useRoutine.ts` | routines, routine_days, routine_exercises; `fork_athlete_routine`, `batch_resolve_exercises` | cache-first from localStorage |
| `useWorkouts.ts` | workout_sessions, workout_sets, exercises | offline SAVE_WORKOUT |
| `useBody.ts` | body_weights, body_measurements | offline SAVE_WEIGHT, SAVE_MEASUREMENT |
| `useCoach.ts` | profiles, coach_athletes, workout_sessions | invite codes, `loadAthleteData` |
| `useTemplates.ts` | template tree, assignments; assign, push, unassign, reset, soft_delete RPCs | |
| `useChat.ts` | conversations, messages, conversation_reads; `get_conversation_previews` | 3 realtime channels per conversation |
| `usePayments.ts` | coach_client_fees, coach_payments | manual ledger, no processor |
| `useNotifications.ts` | none | local notifications, id ranges 1000 to 7000 |
| `usePushNotifications.ts` | device_tokens, profiles.timezone | FCM registration, 15 deep-link types |
| `useAuth.ts` | auth | dead, zero importers |
| `useActiveSession.ts` | active_sessions | dead, zero importers |

Realtime channels: `messages:<conv>`, `reads:<conv>`, `typing:<conv>`, `routine-sync`, `assignment-sync:<uid>`, `coach-live-data`, `coach-msgs`.

Offline: IndexedDB `theryn-offline` v2 with `message-outbox` (backoff) and `action-outbox` (no backoff). Replay on boot, on `online`, after each chat send. In-progress workouts persist only in localStorage.

## Backend

26 tables, all with RLS. Owner-scoped base policies plus additive coach policies through `is_coach_of(athlete, permission)`.

| Domain | Tables | Note |
|---|---|---|
| Identity | profiles | hub table; role, units, height, onboarding, timezone, quiet hours, push prefs |
| Exercises | public_exercises (513), user_exercises | `exercise_id` columns are polymorphic, no FK, trigger-validated |
| Routines | routines → routine_days → routine_exercises | source template, version, overridden flag; soft delete via `removed_at` |
| Training | workout_sessions → workout_sets, personal_records, ai_imports | |
| Body | body_weights, body_measurements | one row per user per day |
| Coaching | coach_athletes, coach_activity_log | invite code per link; permission view / edit_routine / full |
| Templates | routine_templates → days → exercises, assignments, routines_archive | exercises stored by name; assign archives prior routine |
| Messaging | conversations, messages, conversation_reads | only tables in the Realtime publication |
| Payments | coach_client_fees, coach_payments | bookkeeping only |
| Presence | active_sessions | read by push_template_update, never written by the app |
| Push | device_tokens, notify_outbox | defined only in `supabase/migrations/_recovered_push_notifications/` |

Client-called RPCs: `search_exercises`, `batch_resolve_exercises`, `get_last_set_values`, `get_conversation_previews`, `assign_template`, `push_template_update`, `unassign_template`, `reset_athlete_to_template`, `fork_athlete_routine`, `soft_delete_template`.

Triggers: profile on auth user insert; conversation on coach link accepted; unassign on revoke; exercise existence on three tables; recovered set enqueues notifications on workout complete, PR, routine change, message, connection change, streak milestone.

Migration state: local 001 to 011 with duplicates at 004 to 007; remote 001, 002, 003, 004, 0041, 005, 006 where 005 and 006 came from the worktree push files.

## Push pipeline

1. App upserts FCM token into `device_tokens`.
2. Triggers and four pg_cron producers call `enqueue_notification`.
3. Gates: push disabled, muted channel, 24h dedup key; quiet hours defer unless critical.
4. pg_cron posts to the Edge Function every minute with the service-role key.
5. `claim_outbox_batch(100)`: recover stale sending rows, drop over-budget low priority (5/day coaches, 3/day athletes), claim with `FOR UPDATE SKIP LOCKED`.
6. One FCM v1 request per token.
7. Mark sent, or backoff up to 3 attempts, then failed. Dead tokens deleted.

## Auth

Web: `signInWithOAuth` redirect → Google → Supabase callback → `/oauth/consent` → session detected in URL.
Native: `skipBrowserRedirect`, system browser, deep link `com.theryn.app://login-callback?code=` → `appUrlOpen` → `exchangeCodeForSession`, with fallbacks to full-URL exchange and implicit `setSession`.

## Risks, ranked

See WORKLOG.md 2026-09-08 for the full list with locations. Top: live service-role JWT in a cron migration; push schema was untracked; DEFINER functions without `search_path`; cross-tenant reads in two RPCs; open `routines_archive` insert; `assign_template` FK failure for athletes with history; FCM INVALID_ARGUMENT treated as dead token; duplicate migration numbers; no CI or error boundary.

## Target architecture

Decided in `decisions/0001` to `0004`:
- Postgres, defined by timestamped migrations in git, is the system of record.
- Staging and production Supabase projects; GitHub Actions deploys migrations and edge functions; Vercel deploys web.
- `App.jsx` split into `components/coach/` and `components/athlete/` with one token file.
- Databricks Free Edition downstream for analytics on exported tables.
- Self-hosted Supabase on Oracle Cloud Always Free only when there is a concrete reason.
