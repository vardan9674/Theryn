# 0007 — Name-only clients bring their history into an account by their link or a verified email

- Date: 2026-09-18
- Status: accepted (step 1 built; step 2 when the app is close to launch)

## Context
Every real client today is name-only: the coach added them by name and they check in through their link (decision 0006). Their workouts (per set), measurements and notes live in `client_submissions`. The owner wants that history to follow the person when they sign in to the app, and to be kept for progress reports and analytics.

Two problems with what existed:
- `client_submissions` was `ON DELETE CASCADE` from the name-only row and from the link, so Remove, or the old "Connect to account" (which deleted the row), erased the history.
- "Connect to account" needed the coach to pick an existing app account. It was the coach's call, not the client's.

## Decision
**Step 1 (now), migration `20260918200000_keep_client_history.sql`:**
- Name-only clients are archived (`archived_at`), never deleted. Archived ones leave the list, their link is turned off, and their history stays.
- The database refuses to delete a name-only client who has check-ins (`ON DELETE RESTRICT`). A check-in outlives its link (`SET NULL`).
- Optional `email` on a name-only client, which the coach can add or change. `linked_athlete_id` is reserved for step 2.
- The "Connect to account" button is off the client page.

**Step 2 (with the app), one "claim" function behind two doors:**
- **The link is the proof.** On the link page: "Save my history to an account". The client signs in (Google, or an email code) and confirms. The link token shows they are the client, so no email is needed and nothing can be mistyped.
- **A verified email match is a suggestion, not a merge.** When someone signs in with an email (verified by Google or by a code sent to it) that matches a name-only client's `email`, they see "Coach X has N workouts saved for you. Bring them into your account?" Nothing moves until they say yes.
- Both run the same `SECURITY DEFINER` claim, which acts only on `auth.uid()`. It moves the plan, fee, payments and every submission onto the account (promoting workouts and sets, weights and measurements into the real tables), creates the accepted coach link, and sets `linked_athlete_id`. The old link keeps working.

## Why not merge automatically on email
A coach-typed email can be wrong, and then one person's data lands in someone else's account. The client has to consent, and only a sign-in proves they own the email.

## Consequences
- History is never lost by an action in the dashboard.
- Reports and analytics can read every set and measurement per client (by `coach_id` plus `manual_client_id`, or `athlete_id` after a claim).
- Step 2 needs client sign-in on the web or app (Google exists; an email code is roadmap 1.7) and a reviewed migration for the claim function.
