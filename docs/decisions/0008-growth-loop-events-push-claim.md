# 0008 — Growth loop: first-party events, check-in push to coaches, claim by link, email-code sign-in

- Date: 2026-09-21
- Status: accepted (code on `feat/growth-loop`; migration `20260921120000_growth_loop.sql`)

## Context
Theryn has 13 accounts and 2 active coaches. Growth is coach-led: one coach brings many clients, and each client's link page is Theryn's most-seen screen. There was no way to see the funnel, coaches only learned about check-ins by opening the dashboard, clients had no way to own their history, and sign-in needed a Google account.

## Decision
1. **Events in our own Postgres, not a third-party SDK.** One `events` table, written only by `SECURITY DEFINER` code. The database logs what it already sees (`client_added`, `link_created`, `checkin_submitted`, `client_claimed`); the browser sends only what it alone knows through `track_event()` with a fixed allow-list (`coach_signup`, `active_day`, `link_shared`, `signin_email_code`). No RLS policies, so no client can read or write the table; `admin_growth_funnel()` returns counts and week-2 return. Existing rows were backfilled. No cookies, no third party, nothing new to disclose.
2. **Check-in push through the existing outbox, delivered as standard Web Push.** Coaches use the website, so FCM tokens don't reach them. An `AFTER INSERT` trigger on `client_submissions` enqueues a `high` push to the coach (not for workouts the coach logs). The browser subscribes with a VAPID key and stores the subscription in `device_tokens` (`platform = 'web'`); `process-outbox` sends it with `web-push`. Turning alerts on also saves the browser's time zone, because quiet hours use it.
3. **Claim keeps the coach's side unchanged.** A claim sets `coach_manual_clients.linked_athlete_id` and copies every check-in into the account's own tables (`workout_sessions`, `workout_sets`, `body_weights`, `body_measurements`). Later check-ins from the same link are copied too. The coach still manages the person as a name-only client: plan, fee, payments and the link stay where they are.
   - This differs from 0007, which moved plan, fee and payments and created an accepted `coach_athletes` link. That would have turned the client into an "app client" in the dashboard, where links, coach-logged workouts and name-only plans don't apply, and the app is not live. Moving the coaching relationship waits for the app launch.
   - Both doors from 0007 exist: `claim_link(token)` (the link is the proof) and `claim_suggestions()` / `claim_by_email(id)` (a verified email that matches, offered and never automatic).
4. **Email-code sign-in** uses Supabase's built-in OTP (`signInWithOtp` + `verifyOtp`). The code is typed on the page, so it works inside WhatsApp's browser. The email's link also works; it returns through `/oauth/consent`, the redirect URL already allowed, and `src/lib/authReturn.ts` remembers where to go back to.

## Consequences
- Tracking or pushes can never lose a check-in: both are wrapped so their errors are swallowed. Copying into an account is part of the check-in, as before.
- Promotion moved from `link_submit` into the trigger, so app clients, claimed clients and coach-logged workouts share one path. `client_submissions.promoted_at` stops anything from being copied twice.
- Email sign-in needs dashboard setup before it reaches real users: custom SMTP (the built-in sender only mails team members and is rate-limited) and `{{ .Token }}` in the Magic Link and Confirm signup templates.
- iPhone coaches get web push only from a Home Screen install (iOS 16.4+); the opt-in says so.
