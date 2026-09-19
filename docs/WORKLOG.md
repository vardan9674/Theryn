# Work log

Newest first. One entry per working session. Record what was done, what was found, and what is still open.



## 2026-09-19 (late night) — Plans: empty-plan bug, keep or replace per client, plain guidance, branch `fix/plans-add-clients`

**Asked**
- "When we add a client to a plan it says added but doesn't add the client." Then: let a coach change one client's workout without touching the plan, with a way to choose, and make coaches with basic phone skills aware of how it works.

**Found** (production logs, 13:55 today): 2 name-only clients were added to a plan with no days. They were stamped with it, their week became 7 rest days, and the toast said "Added". The toast also counted picks, not what the server added.

**Done** (no database change)
- Empty plans can't be given out or updated (Plans page and data layer). The Added toast counts only real adds and names failures.
- Update pop-up: clients with their own changes are listed with **Keep theirs / Use plan** (default keep). "Use plan" sends them the plan with force, which clears their mark. Toast: "Updated 3 clients. Kept Ravi's own changes."
- Plans tab: a 4-step "How plans work" card (Got it hides it; a "How plans work" link brings it back). Each plan shows "N with their own changes".
- Editors say who a change reaches. A client's plan from a saved plan: "Changes here are only for Ravi. The plan and your other clients stay the same." The saved-plan editor: "Changes here are for all N clients on this plan…". Saving a client's plan adds "Your plan … didn't change."

**Verified**: coach preview: empty plan blocked; add Ravi; edit only Ravi; plan shows "1 with their own changes"; Update → Keep theirs → 3 updated, Ravi kept; Update → Use plan → 4 updated, mark gone. No overflow at 320. 110 tests, typecheck, build.
## 2026-09-19 (late night) — Link shows today only, branch `fix/link-today-only`

**Asked**
- "The client with the link should only have the week strip and be able to update or see today's workout; they need the app to see all the days' workouts, just like we had previously."

**Done** (no database change)
- The week strip on `/f/<token>` is display-only again (plain tiles, as before 394bd5c). Tapping a day does nothing; there's no "Earlier days" picker and no read-only "coming up" view.
- Under the strip: "Every day's workout is in the Theryn app. Get the app".
- Removed `loggableDays`, the day-picker state and its CSS. Today's workout, streak, last 7 days, per-set logging, feel, note and Finish are unchanged.

**Verified**
- `/f/preview` at 375: 7 plain day tiles, no day buttons, no "Earlier days", note fits on one line, no sideways scroll; tick an exercise → Finish → receipt. 109 tests, typecheck, build pass.

## 2026-09-19 (night) — Saved plans use the new plan editor, branch `feat/saved-plan-editor` (on top of `feat/plan-editor-v2`)

**Asked**
- "get it matched": the saved-plans editor (Plans page) should work like the new per-set plan editor.

**Done**
- The Plans page's "Edit plan" now opens `PlanEditor` (day strip, one-line cards, per-set reps and weight, Same for all, Add sheet, Copy day, sticky Save, laptop preview). It takes `title`, `status`, `onTitleChange` and `onSave` for a saved plan; no client, no history. Tap the name to rename. After saving, if the plan has clients, the existing "Update clients' plans" sheet opens.
- `lib/manualTemplates.js`: `planToTemplateDays` (editor week → template rows, keeping library links by name) and `templateDaysToPlan(days, units)` now carry `target_weight`, `set_list` and `weight_unit`, converting to the coach's units. Name-only clients given a saved plan get the per-set week; Excel export of a saved plan includes weights.
- **Migration `20260919120000_template_set_targets.sql`** (additive: three nullable columns on `routine_template_exercises`). Until it is run, saving still works: `saveTemplateTree` retries without the new columns and the editor says weights need the database update. `saveTemplateTree` also now throws when exercises fail to insert (it used to log and carry on after deleting the old days).
- Add sheet on a rest or custom day (a new saved plan starts all rest) offers popular lifts instead of nothing.
- The old `components/templates/TemplateEditor.jsx` is still used by the legacy app's `CoachTemplatesTab`; untouched.

**Not covered**
- App-account clients: `assign_template` / `push_template_update` copy into `routine_exercises`, which has no weight or per-set columns, so they get sets and reps ("12/10/8") only. The app isn't live.

**Verified**
- Coach preview at 375: open PPL Intermediate, Bench set 1 → 135 fills all, set 4 → 155, Save → v4 and the Update sheet → Update all 3 → Aisha's Plan tab reads "4 × 8 · 135–155 lb". Reopen keeps 135–155. Rename in the header. New plan → rest day → Popular → Add 3 → Save → v2. No overflow at 320; laptop shows the week, day and preview. 5 new tests; typecheck, 109 tests, build pass.

## 2026-09-19 (evening) — Plan editor rebuilt, per-set targets, branch `feat/plan-editor-v2`

**Asked**
- "Edit plan should be easy for coaches; they should be able to add sets, each set with its own lb and reps; easy enough for a kid, with cool animation, and better on mobile since most coaches use their phone." Mocked on the "Theryn Link Exercise Card" canvas (bottom two rows), then built.

**Done** (no database change; `setList` is a new optional key inside each plan exercise)
- `src/coach/lib/planSets.js`: the plan now holds per-set targets. An exercise is still `{ sets, reps, weight }` when every set is the same; when they differ it adds `setList: [{ reps, weight }, ...]`, and `reps` reads "12/10/8" so older readers and the Excel export still show something sensible. 8 tests.
- **Plan editor, phone:** a 7-day strip on top (type colour under each day, dashed when empty), one day at a time. Exercises are one-line closed cards ("3 sets · 12/10/8 reps · 60–70 kg", amber "no weight yet"); tap to open, the others close. Open card: one row per set with big reps and weight boxes; **+ Add set** copies the last set; × removes a set and the rest renumber; **Same for all** is on by default (type set 1, every set follows) and switches itself off when a later set is changed. Note field, "Aisha last did: …", Remove. **Add exercise** is a sheet: search, suggestions for the day's type, tap several, "Add 3". **Copy day** to any other days. Sticky Save at the bottom that pulses once when there are unsaved changes; the header counts them.
- **Tablet/laptop:** the week as a list on the left, the day in the middle; laptop adds a live "What Aisha sees" preview on the right.
- **Animations:** cards open with a small grow, new exercises slide in, a new set slides in and flashes green, dragged cards lift with a shadow, Save pulses. All off under prefers-reduced-motion.
- **Everywhere the plan is read:** the link page shows each set's own numbers (placeholders, "edited" check, fold summary); workouts sent back carry `plan_sets` so the coach's per-set chips and "changed" markers compare against that set's target; kg/lb conversion covers `setList` and `plan_sets`; the Plan tab reads "3 × 12/10/8 · 60–70 kg"; Excel's Weight cell reads "60/65/70".

**Verified**
- Coach preview at 375: open card, set 1 → all sets follow, change set 4 → "Same for all" turns off, add set (copies, flashes), remove set 2 (renumbers), add 2 suggestions + 1 custom, copy Monday to Friday, save → "Saved and sent to Aisha", Plan tab shows "4 × 8/8/6/10-12 · 60–137.5 lb". Layout audit clean at 320 / 414 / 790 / 1024 / 1280. Link preview: per-set placeholders 12/40, 10/42.5, 8/45 and the fold summary. 6 end-to-end tests (editor → plan → link → submission → coach, and kg ↔ lb). Typecheck, 104 tests, build pass.

## 2026-09-19 (later) — Streaks for clients and coaches, branch `feat/streaks`

**Asked**
- "Add the streak next to the date in a subtle way, with an animation so the user has some motivation; the coach should see their client's streak too." Mocked on the "Theryn Link Exercise Card" canvas (bottom row), then built.

**Done**
- `src/coach/lib/streak.js`: one rule for both sides. A day keeps the streak if a workout was done or the plan says Rest; a missed planned day ends it; today never ends it; a run of only rest days is not a streak. Returns current, best, atRisk (planned, not done, after 6 pm), brokeAt (a 3+ streak that ended in the last 7 days), thisMonth, and the last 14 days. `routineStreak` now delegates to it, so existing numbers and insights agree. 7 tests.
- **Link page:** a chip by the date from 2 days ("5-day streak"; amber "5 · tick today to keep it"; solid with one pulse after sending; "10 · new best"); one line of copy ("Tick today and that's 6 days in a row. Your best is 9."); last-7-days dots under the week strip. The receipt shows a ring that fills toward their best with the number counting up, Streak / Best / This month tiles, and "Tomorrow is Pull; tick it to make 7." Motion is off under prefers-reduced-motion.
- **Coach:** a Streak column in the clients table (flame + days, amber "at risk", grey "0 · was 9" for a week after one ends), the chip on phone cards and under the client's name (hidden when the status line already talks about the streak), the Workouts tile with "best N", and a 14-day strip (workout / rest / missed).
- **Data:** the link page counts from `done_dates` returned by `link_view` plus what this phone has sent. Migration `20260919100000_link_view_done_dates.sql` adds `done_dates` (dates only, last 400 days) to `link_view`; **not applied yet**. Without it the page still works and counts from this phone only. Decision 0006 amended.

**Then, on the same branch** (owner's notes while reviewing)
- **Nothing overlaps or clips as the screen shrinks.** Audited the link page at 320 / 360 / 375 / 414 and the coach dashboard at 1280 / 1024 / 900 / 790 / 600 / 375 / 320 (every client tab and the four main pages) with a script that checks for elements past the viewport, overlapping siblings, clipped inputs and clipped containers. Found and fixed: set-row numbers cut off at 320 and under (label becomes "1", numerals tighten); the weekly volume chart's fixed 160px sparkline made its rows wider than the card on phones (now scales); attendance calendar day cells were a fixed 32px and cut the Sunday column at 320 (now shrink); the four client tabs now fit at 320 without scrolling.
- Hint lines removed from the link page ("Tap a day to see its workout", "Tap a set when it's done…").
- "How did it feel?" is three taps, **Easy / Medium / Hard**, plus a one-line note. Sent as `feel` in the payload (no database change); the coach sees "Felt hard" on the workout and "felt hard" in the notification.
- The at-risk chip reads "5 days · keep it going today".
- Migration `20260919100000_link_view_done_dates.sql` **applied to production 2026-09-19** by the owner; `link_view` answers normally from outside.

**Verified**
- Preview at 375: chip (at-risk state, since it was after 6 pm), copy, dots; send → ring 3, "4 more days to match your best of 7", tiles, tomorrow nudge; back → solid "3-day streak". Coach preview at 1024: column values 28 / 26 / "0 was 18", chip, tile, strip. Typecheck, 89 tests, build pass.

## 2026-09-19 — Link exercise card, Direction A, branch `feat/link-card-a`

**Asked**
- "Make this UI look good, simple but efficient; once they tick, collapse the card; people should feel like ticking." Three directions were mocked on the canvas "Theryn Link Exercise Card" (A tap-the-row, B set pills, C one set at a time, plus lifecycle boards for A and B). Owner chose A.

**Done** (client code only; the submission payload is unchanged)
- Each set is one full-width tappable row: circle, "Set 1", then the coach's reps and weight as editable numbers (dashed underline until done). Tap the row = done as planned; tap a number to change it, which also ticks the set. A changed set shows its numbers in green with EDITED under the label.
- When every set is ticked (or the exercise is skipped) the card folds to one 66px line: green check, name, "3 sets · 8×40, 6×37.5, 8×40 kg" with changed sets in green. Tap to reopen; the arrow folds it again. The next exercise becomes current and gets the "Tap a set when it's done" hint.
- Header progress reads "1 of 5 done · 3 of 15 sets"; the bar tracks sets.
- Set rows are 301px wide on a 375 phone (inside the card padding), so numerals are 17px tabular and the marker sits under the label rather than after the numbers; nothing clips at "10-12" or "37.5".

**Verified**
- Preview at 375: tick, edit (6 × 37.5 → EDITED), tick last → folds; tap → reopens with all rows filled; collapse; Skip exercise → "Skipped · tap to undo"; send → receipt. `workoutPayload` output identical to before (per-set detail only where typed). Typecheck, 82 tests, build pass.

## 2026-09-18 (late night) — Keep every client's history; email for joining later, branch `feat/keep-client-history`

**Decided** (decision 0007): no automatic merge on email. Later, a client brings their history into an account either through their link ("Save my history", with sign-in) or when a verified sign-in email matches, always with their confirmation.

**Built now**
- Migration `20260918200000_keep_client_history.sql` (additive, idempotent; **applied to production 2026-09-18** via the SQL editor, foreign keys verified): `coach_manual_clients.email` (format-checked, indexed on `lower(email)`), `archived_at`, `linked_athlete_id`. `client_submissions.link_id` is now nullable with `ON DELETE SET NULL`, and `manual_client_id` is `ON DELETE NO ACTION` (blocks deleting a client with check-ins; a coach-account delete still cascades).
- Remove on a name-only client archives it (and turns off its link) instead of deleting. Before the migration is applied, it refuses when the client has check-ins. The list hides archived clients.
- The name-only client's page has an optional **Email** (add, change, clear; lower-cased) and no longer has "Connect to account".
- The dashboard works with or without the migration (falls back to the old columns).

**Verified**
- Coach preview: Ravi → Add email → "Email ravi@example.com", no Connect button. Typecheck, 82 tests, build pass. The SQL was reviewed by hand; no local Postgres to run it against.

**Open**
- Apply the migration in the SQL editor, then check the two foreign keys with the query at the bottom of the file.
- Step 2 (claim flow) when the app is close.

## 2026-09-18 (late) — Reps and weight per set on the link, branch `feat/link-per-set-reps`

**Asked**
- "Reps should be more elaborate. Right now it's only a tick. When the coach adds reps and lbs, the client can update them if they didn't do exactly that."

**Done** (no schema change; `sets` is a new optional key inside each workout exercise in the `client_submissions` payload)
- Link page: tapping the box still means "all done as planned". **Change reps or weight** (replaces "Used a different weight?") opens one row per set with Reps and weight boxes, the coach's reps and weight as placeholders, and a Done tick. Typing into a set ticks it. Blank means as planned. Closed, the card says "You logged: 7×40, 6×37.5 kg". Drafts keep the rows and convert typed weights on a kg/lb switch.
- Payload: exercises carry `sets: [{ n, done, reps?, weight? }]` only when the client typed something (link_submit caps payloads at 20,000 characters); `weight_used` is the first typed weight, for the promotion path and older readers.
- Coach: the Workouts tab shows `2/3 sets · kg × reps` then one chip per done set (`45×10`, `40×6`), highlighting sets that differ from the plan (reps outside the range, or a different weight). History, volume, PRs and the plan editor's Last use the per-set numbers; a blank set counts at the planned weight. Per-set weights convert between kg and lb like the rest.

**Then, asked:** "Remove 1, 2, 3; let the weight and reps show so they know what to do; show the previous weights for both client and coach; make sure everything is stored."
- The squares are gone. Every exercise always shows its set rows (reps, weight, done) with the coach's numbers in grey; later days show them read-only.
- **Last time**: the link page shows "Last time (Mon 14): 8×40, 8×40, 6×37.5 kg" per exercise, remembered on the client's phone when they send (the link page has no server history by design, see decision 0006). The coach's Plan tab shows "Last time (Sep 17): 10×45, 6×40 kg" under each exercise from the client's history.
- **Found: check-ins are deleted with the name-only client.** `client_submissions.manual_client_id` is `ON DELETE CASCADE`, so Remove and "Connect to account" (which deletes the name-only row) wipe every link check-in. Until a migration fixes it: Connect to account refuses when the client has check-ins, and Remove says plainly what gets deleted. Proposed fix (needs approval, it changes the database): keep submissions when the row goes, move them onto the account on connect, and have `link_view` return last-time sets so they show on any phone.

**Verified**
- Link page at 375: rows with 8-10 / 40 placeholders, typed sets tick, summary when closed. Coach preview: Ravi's Bench Press shows `45×10` and a highlighted `40×6`. 5 new tests (one caught blank sets taking the typed weight instead of the planned one). Typecheck, 76 tests, build pass.

## 2026-09-18 (night) — Saved plans for name-only clients, branch `feat/plans-for-name-only-clients`

**Asked**
- "Adding users to a plan doesn't show the clients the coach added by full name." The Plans page was given only app clients (`realClients`), because `routine_template_assignments` references profiles.

**Done** (no schema change)
- `src/coach/lib/manualTemplates.js`: a name-only client "has" a saved plan when the plan JSON on their `coach_manual_clients` row carries a `template` stamp on its days (`{ id, name, version, overridden }`). `templateDaysToPlan` moved here from PlansPage.
- `supabaseCoachData` routes every template call by client kind: **Give to a client** copies the saved week into the client's plan (stamped, in the coach's units); **taking it away** removes the stamp and keeps the week; **Send update** copies it again, skipping weeks the coach has since edited unless forced; **Who has it** / counts / "Assigned to …" locks include them. Mock data does the same.
- The plan editor keeps the stamp on a name-only client's week and marks it `overridden` (like `is_overridden` for app clients). The client's Plan tab says `from your plan "PPL Intermediate"` (and "edited for them").
- The template editor still gets app clients only: it calls the assignment RPCs directly.

**Verified**
- Coach preview: Ravi (name-only) listed in Give to a client with "Not on app, gets it through their link"; give → count 3 → 4, "Plan sent to 1 client"; Ravi's Plan tab shows the PPL week "from your plan"; Send update lists all 4 and "Update sent to 4 clients". 4 new tests. Typecheck, 75 tests, build pass.

**Open**
- Saving a plan inside the template editor offers to push only to app clients; name-only clients get it from Send update on the Plans list.

## 2026-09-18 (evening) — Everyone in their own kg/lb, branch `feat/universal-units`

**Asked**
- "Universal lb/kg in the profile: the coach in India types kg, a US client sees lb; the client logs lb, the coach sees kg."

**Done** (no schema change; the coach's choice goes in the existing `profiles.unit_system`)
- `src/coach/lib/units.js`: `convertWeight` (gym weights to the nearest 0.5, body weight to 0.1), `convertLength`, `convertPlan` (targets converted, every day stamped with `units`), `convertSubmission` (measurements by their `unit`, workouts by a new `weight_unit`; older workouts are taken to be in the plan's units, which is what the page showed). Stored numbers keep the unit they were typed in and say which; conversion happens on read.
- **Coach:** a "Weights and measurements" choice in the profile sheet (kg + cm or lb + inches), saved to `profiles.unit_system`. Name-only clients' plan, workouts, weigh-ins, measurements, the plan editor's Last column, the Excel export and the notification centre all show in it; switching reloads the loaded clients. Because the column defaults to imperial and many coaches never chose, the dashboard asks once, "Kilograms or pounds?", suggesting kg when the browser is on Indian time (`theryn_coach_units_confirmed_<id>` in localStorage). The first-visit tour waits for it.
- **Client:** a kg | lb switch next to the coach's name on the link page, remembered on the phone. Targets are converted into it, "weight used" is typed in it, the Measurements tab's unit follows it, and each workout is sent with `weight_unit`. A half-ticked workout's typed weights are converted if the switch changes mid-session.
- Also fixed on the way: the root keeps the column as `profile.units`, so the dashboard now reads that first.

**Verified**
- Link page at 375: 40 kg target → 88 lb after switching; the Measurements tab follows; the choice persists. Coach preview: asked once, then no tour clash; Ravi 74 kg ↔ 163.1 lb, chest 96 cm ↔ 37.8 in; a 100 lb target saved in lb reads 45.5 kg after switching. No console errors. 8 new tests in `units.test.js` (including a US client + Indian coach round trip). Typecheck, 71 tests, build pass.

**Open**
- App clients (the native app, not live) still show in the athlete's own units on the coach side.
- A plan saved before 2026-09-18 carries no `units` stamp and is read as the coach's current units. Opening and saving it in the editor stamps it.

## 2026-09-18 (later) — Week strip opens any day; optional measurements, branch `fix/link-week-and-optional-measurements`

**Asked**
- "I'm still not able to see the old days' workout, it only shows Friday and measurements." The "Log another day" control from PR #53 was a small text link, and only past days with a planned workout were listed. The week strip looked tappable but wasn't.
- "If the coach unticks a measurement I want it optional, not gone; the coach chooses which are required." Unticked measurements used to disappear from the client's page, and at least one had to stay ticked.

**Done** (client code only, no database change)
- Every day in "This week" is a button. Past days and today open that day's plan, ready to tick and send with that date. Later days show the plan read-only ("Coming up · Saturday… You can tick it off on the day", with "Back to today"). The selected day is outlined. "Earlier days" keeps the chips for last week's days.
- The Measurements tab always shows all five. The coach's ticks, now labelled **Required measurements**, are required (`*`); the rest say Optional. Unticking all makes everything optional (`requested = []`; a missing list still means all, as before). Sending nothing is blocked with "Add at least one measurement to send." Saving shows "Saved. X sees it next time they open the link." The link reads `requested` from `link_view` every time it opens, so no new link is needed.

**Verified**
- `/f/preview` at 375: Mon opens "Logging Monday…" with "Send Monday's workout"; Sat is read-only with "Back to today"; Measurements shows three required and two optional, and the empty send is blocked. Coach preview: all five unticked, saved. Typecheck, 63 tests, build pass.

## 2026-09-18 — Client link reliability for India, branch `fix/link-reliability` (on top of PR #52)

**Context**
- The native app is not live. The live product is the website: coaches on the dashboard, clients on `/f/<token>`. Web athletes can't connect to a coach, so every real client is name-only and the link is their only channel. Coaches and clients are in India (UTC+5:30).
- Constraint from the owner: no database changes. Everything below is client code; no migration, no RPC change.

**Found and fixed**
- **A coach could kill a client's link by opening the dashboard on another device.** The raw token lived only in the browser that made it, so elsewhere the Share link sheet said "doesn't have a link yet" and "Make a link" revoked the one pinned in the client's WhatsApp. Now the token is also kept in `client_links.label` as `tok:<token>` (coach-only under RLS, never returned by `link_view`, previously write-only). Older links sync up the first time the coach opens the sheet on the device that made them (checked against `token_hash` first). A device that still can't read it shows "X's link is working… made on another phone or computer" and replacing it goes through the existing warning.
- **Early-morning check-ins landed on the day before.** `link_submit` replaces a date later than its UTC `CURRENT_DATE` with `CURRENT_DATE`, which in India is every submission from midnight to 5:30 am. The page now also sends `local_date` (kept in the stored payload); the coach side reads it via `submissionDate()`, and recovers older rows from `submitted_at` when the stored date is just the UTC day it was sent. Manual fee/payment defaults and the "Done via link" age use local dates too.
- **Ticks were lost if the page reloaded mid-workout** (WhatsApp's browser drops pages when you switch apps). The workout draft (ticks, weights, skips, note) is saved to the client's localStorage on every change and restored for the same day and plan.
- **Only today's workout could be sent.** "Missed sending a workout? Log another day" offers the last six planned training days; the page shows that day's plan and sends it with that date.
- **Accidental double sends.** After sending, the page remembers it: "You sent today's workout to Coach X at 6:12 am. Sending again gives your coach a second entry", and the button reads "Send again".
- **Units.** Name-only clients defaulted to lb everywhere (editor, link page) because they have no profile, and the dashboard also read `profile.unit_system` while the root stores it as `profile.units`, so every coach looked imperial. The plan editor now stamps `units` on each plan day; the link page labels weights and defaults measurement units from it; the dashboard picks one unit per name-only client (plan, else latest measurements, else the coach's) and converts every entry to it, so the 2-week weight change compares like with like. The Body tab's measurement card skips weight-only check-ins.

**Verified**
- Link page at 375 (`/f/preview`): tick + note survive a reload; send → receipt → back shows the sent note and "Send again"; log another day shows "Logging Wednesday…", "Wednesday's plan", the real today still marked in the week strip.
- Coach preview: Ravi (name-only) Body/Workouts in kg, plan editor "Weight (kg)", save shows "50 kg"; Share link sheet normal state and the "made on another device" state (`?coachPreview=1&linkElsewhere=1`).
- 10 new tests (`linkDates.test.js`, run in Asia/Kolkata). Typecheck, 61 tests, build pass.

**Open**
- Not exercised against production: token sync (`label`) with a real coach session. Check: open Share link on the laptop that made a link, then on a phone; the phone should show the same URL.
- The receipt's "Get the app" points at the marketing site while the app isn't published.

## 2026-09-15 — Workout detail for the coach and a notification centre, branch `feat/coach-workouts-notifications`

**Asked**
- "Once the client ticks the workout and sends it, the coach should be able to see the workout and details." And: "a notification centre within the coach dashboard."

**Found**
- A link workout only surfaced as a one-line "8 of 9 sets done · weights: …" under the day on the Plan tab, and for app clients not even that: `loadWorkoutHistory` never read the `source` column, so promoted link sessions looked like app sessions and the "Done via link" tag never showed. Nowhere could the coach open a workout and see what was actually done.

**Done**
- `loadWorkoutHistory` selects `source` and parses `viaLink`/`note` out of the session notes; entries carry `source` and `note`.
- `src/coach/lib/workouts.js`: `attachSubmissions` pairs each link session with the submission that produced it (same id for name-only clients; date + best exercise overlap for app clients, since `link_submit` promotes without a back-reference), `workoutDetail` gives one shape for both (done/planned sets, reps, weight used vs target, skipped, note, duration), `workoutSummary`. 5 tests.
- Progress tab renamed **Workouts**: stats, then "Recent workouts" (one expandable row per session: date, type, via link / in app, "5 of 9 sets · 1 skipped"; open → per-exercise `3/3 sets × 8-12 · 60 kg`, skipped rows dimmed, "(changed)" when the client used a different weight than prescribed, app sessions as set chips `205×6 225×5`, and the client's note), then the existing charts.
- Notification centre: bell in the top nav (laptop/tablet) and the phone clients header with an unread badge; sheet grouped Today / Yesterday / Earlier; items are link workouts ("Vaishnavi finished Full Body via their link · 5 of 6 sets · 'note'"), measurements sent ("168 lb · chest 36, waist 28 in") and workouts logged in the app ("12 sets · 48 min"). Tap → that client on the Workouts or Body tab. Built from rows that already exist (`client_submissions` + app-sourced `workout_sessions`, last 30 days) by `src/coach/lib/notifications.js` (2 tests). Refreshes on the realtime events and on focus.
- Seen watermark: `20260915120000_coach_notifications_seen.sql` adds `profiles.coach_notifications_seen_at` (applied to production) so the badge agrees across devices; localStorage mirror as fallback. The badge clears when the centre opens; rows keep their unread highlight until it closes.
- Clearing (asked for after the first pass): **Clear all** at the top of the sheet hides everything up to now (`profiles.coach_notifications_cleared_at`, same migration, applied; also resets seen) and an **×** on each row dismisses that one (ids kept in localStorage, per device, capped at 300). Empty state reads "You're all caught up". Verified from a scratch worktree on port 5199 because another session's in-progress landing-page edit broke the main dev bundle at the time: badge 8 → open → dismiss one (20 → 19 rows) → Clear all → 0 rows, toast, badge gone.

**Verified**
- Coach preview (1280 and 375): bell shows 8 unread → sheet grouped by day → tap → client opens on Workouts; Ravi (name-only) shows the link workout with planned/done, weights, skipped and note; Marcus (app) shows set chips. No console errors. Typecheck, 50 tests, build pass.

**Also done: "Show me around", a first-visit tour for coaches who aren't technical**
- The old `CoachTourOverlay` in App.jsx describes the previous dashboard (Athletes / Templates / Routines tabs) and is never mounted by Direction B. New `src/coach/pages/CoachTour.jsx`: 11 short steps, each spotlighting a real element found by `data-tour="…"` (Clients tab, first client row, Add client, Share link, Plans, Payments, Messages, bell, profile picture) with a plain-language card (no jargon: "Your people, one row each", "Every client gets their own private link. They open it on their phone, no app and no password…"). Steps adapt: no clients → "Add your first client" instead of the row step; on laptop/tablet the Share link step opens the first client so the green button is really on screen (on the phone an open client hides the tab bar, so the card sits in the middle instead). Card goes under the target when there is room, else above; Back / Next / Skip, arrow keys, Escape, Android back. Progress dots.
- Shown once per coach per device (`theryn_coach_tour_done_<coachId>` in localStorage) after the client list loads; **Show me around** in the profile sheet replays it any time.
- Verified at 1280 and 375: all 11 steps spotlight the right element (or fall back cleanly), Done marks it seen, replay from the profile sheet works, Back works. Typecheck, 51 tests, build pass.

**Note on the working tree**
- Another session was editing the landing page (`LandingPage.jsx`, `landing-motion.jsx`, `landing-motion.css`) in this checkout at the same time. A temporary stash of mine briefly reset those files while it was writing; everything was restored from the stash and verified identical to its work-in-progress, but if that session sees something odd, the three files as of 21:07 are also in this session's scratchpad.

**Open**
- Realtime delivery to a signed-in coach still unexercised (needs a coach session).
- Push notification on submission (roadmap 1.12) would complete this: the centre is in-app only.
- Tour "seen" flag is per device; a coach who signs in on a second device sees it once more (one tap on Skip).

## 2026-09-12 (evening) — Links did not open, name-only clients vanished after add, branch `fix/client-list-sync` (PR #43); target weight and coach data freshness, branch `fix/coach-submissions-target-weight`

**Found**
- Every real link failed: `link_view` / `link_submit` raised `function digest(text, unknown) does not exist` (42883). On Supabase, pgcrypto lives in the `extensions` schema, and both functions pinned `search_path = public, pg_temp`. The earlier smoke test used a made-up token shorter than 20 characters, which returns `{ok:false, reason:"invalid"}` before `digest()` is reached, so it looked fine. Live evidence: two links created today with `opens = 0`.
- "Add client" by name wrote the row (`senha g`, 23:11 UTC) but the client never appeared. `CoachShell` seeded its list from the root's `coachLinks` (coach_athletes only) and only called `data.loadClients()`, the one that merges `coach_manual_clients`, when that seed was null, which never happens when signed in. After an add, `refreshClients()` → `onLinksChanged()` → root `setCoachLinks` → the seed effect overwrote the merged list without the new client, and the selection guard then cleared the selection. Same cause hid name-only clients on cold load. Those lines predate the name-only feature (Direction B rebuild, `dc99d48`).

**Done**
- Search path fix: the same `ALTER FUNCTION ... SET search_path = public, extensions, pg_temp` was found and merged in parallel as PR #42 (`20260912180000_client_links_digest_fix.sql`), so that file is the one that stays; a duplicate from this session was dropped. It is applied to production (via `supabase db query --linked -f`). `20260912120000_client_links.sql` updated to match for fresh installs. `20260913110000_client_link_upsert_anon.sql` revokes anon EXECUTE on `client_link_upsert` (Supabase's default privileges had granted it; the function already raised `forbidden`), also applied.
- `CoachShell` now always loads from `data.loadClients()`; the root's links only seed the first paint and trigger a refetch when they change.

**Verified**
- From outside with the anon key: a well-formed unknown token now returns `{ok:false, reason:"revoked"}` from both RPCs (was 42883). A throwaway link for the name-only client "Test Subject1" returned `ok:true` with first name, coach name, unit and requested fields, and `opens` went to 1; the row was deleted afterwards. `client_link_upsert` as anon is now `permission denied`.
- Coach preview: add by name → client appears in the table, is selected, and opens on the Plan tab. Typecheck and build pass.

**Also done: target weight in the plan editor**
- "Coach is not able to edit the lbs?" — the editor's "Last (lb)" box was read-only by design (heaviest weight from the client's last session) and there was no field to prescribe a weight, although the template type, the Excel export and the link page already carried `weight`. Added a **Weight** input (decimal, last-lifted as the placeholder hint) next to Sets / Reps / Last; `toTemplates` stores it as a number via `parseWeight` (0 < w ≤ 2000, 2 dp); the Plan tab shows "4 × 8 · 50 kg"; the export keeps the coach's target and only fills blanks from history. Persists for name-only clients (plan JSON). App clients need a `target_weight` column on `routine_exercises` before it survives a save (roadmap).

**Also done: link submissions now reach the coach**
- Submissions were landing (4 rows in `client_submissions`, measurements promoted into `body_weights`/`body_measurements`, sessions into `workout_sessions`) but the dashboard never showed them. Two causes:
  1. `subscribeLiveData` listened on `workout_sessions`, `body_weights`, `body_measurements`, but only `messages`, `conversation_reads`, `routines` were in the `supabase_realtime` publication, so no event ever arrived. `20260913120000_realtime_client_data.sql` adds those three plus `client_submissions` (applied to production; a subscription probe returns SUBSCRIBED). The coach now also subscribes to `client_submissions` (`coach_id=eq.<me>`), which is the only data name-only clients have.
  2. `loadAthleteData` read through the athlete app's stale-while-revalidate loaders (`loadWorkoutHistory`, `loadBodyWeights`, `loadMeasurements`, `loadRoutine`), which return the localStorage snapshot and only refresh it for the *next* load, so the coach was always one reload behind. Loaders take `{ fresh: true }` (routine: `forceNetwork`) and the coach path uses it; the athlete app keeps its offline cache.
- Safety net: on `visibilitychange`/`focus` the shell re-fetches every client already loaded (throttled to 20s) for when the realtime socket dropped in the background. Live-data and focus effects depend on the cache's stable callbacks, not the `cache` object (its identity changes on every bump, which would have torn down the channel on every refresh).

**Open**
- Not exercised: a realtime event delivered to a signed-in coach (needs a coach session; the anon probe only proves the channel subscribes).
- Target weight for app clients: `routine_exercises.target_weight` + `saveRoutineAsCoach` + `link_view` + athlete app.
- Not exercised: the signed-in add path against production (needs a coach session). Reload the coach dashboard after the deploy and check "senha g" and "Test Subject1" are in the table, then open "Vardan's link" from the share message.

## 2026-09-12 — Shareable client links (decision 0006), branch `feat/client-links`

**Done**
- Public page at `/f/<token>`: a small auth-free bundle (19 KB) that mounts before the main app. Two tabs, Today's workout (week strip, today's plan, tap the numbered box to tick an exercise, per-set squares, "Used a different weight?", Skip/Undo, note, Finish workout) and Measurements (date, units, the front body figure from `mockups/share-links/` with callout labels and a per-site guide, starred required fields, optional body weight, Send). Receipt screen with a keep-this-link reminder and a get-the-app nudge. Revoked/invalid/offline states. Dev preview at `/f/preview`.
- Migration `20260912120000_client_links.sql`: `client_links` (hashed token, requested measurements, opens/submissions counters, revoke), `client_submissions` (append-only), `source` column on body_weights/body_measurements/workout_sessions. Two anon-callable SECURITY DEFINER RPCs with pinned search_path: `link_view` (returns first name, coach name, unit, today's plan; never ids or history) and `link_submit` (validates ranges, per-link daily caps 5/3, records, and promotes into the real tables for app clients). `client_link_upsert` for coaches.
- Coach side: **Share link** on every client page → sheet with the URL, Copy, WhatsApp, system Share, the message, which measurements to ask for, opens/sent counters, New link, Turn off. The raw token lives only in the coach's localStorage (DB has the hash). Name-only clients now have all four tabs; link submissions feed Last workout / This week on the table, "Done via link" with sets, weights and the client's note on the Plan tab, and "via link" tags on the Body tab.
- Helpers with 10 tests in `src/coach/lib/clientLinks.js` (token, url, message, today-from-plan with rest-day next-up, validation, payload shapes, submission → dashboard shapes). 41 tests total.

**Decided**
- One durable link per client that always opens today (not a link per day). Front-view figure only. Coach picks requested measurements per link. Rest days show the next training day and offer the Measurements tab.

**Verified**
- Public page at 375 wide: workout tick/undo/skip/weight/note/send, measurements tap-label → guide + focus, validation (missing, out of range), send → receipt → back. Coach preview: Ravi (name-only) shows link data on table, Plan and Body; Share link sheet opens with URL, buttons, requested checkboxes, counters. Typecheck, tests, build pass.

**QA round (background agent, 375 / 790 / 1440) — 14 findings, 13 fixed**
- Share link sheet carried one client's "measurements to ask for" over to the next client's new link. Now resets to all five whenever the sheet opens for a client or a link is turned off.
- Progress tab said "lbs" for metric link data (hard-coded in `AthleteDepth.jsx`). Volume chart, PR timeline and session drawer now take a `unit` prop from the client's unit system.
- PR timeline showed the day before the workout in negative-offset time zones (`new Date("YYYY-MM-DD")` is UTC). Dates are parsed as local midday.
- Body figure: tapping inside a dashed band now selects that site (bands had no fill so they were not hit-tested); labels 13px and hit areas ≥44px; figure a little larger.
- Tapping a figure label only changes the guide now. It used to focus the field, which scrolled the figure off screen and opened the keyboard.
- Eyebrow captions and the "Today" chip are 12px (were 11/10). Date picker uses the dark colour scheme. Skip/Undo are ≥44px wide and a skipped exercise gets an "Undo skip" control. "Get the app" no longer wraps mid-link. Page tabs are capped at 280px each on wide screens. Dead ternary removed; mock submission day matches its date.
- Every sheet has a visible Close button (44px, top right) in addition to Escape / backdrop / Android back.
- Not fixed: at 790 wide the preview opens with a drawer already open; pre-existing and not link-related, tracked for the old-code cleanup.
- Could not be tested in the pane: clipboard success path, Web Share / native share, real RPC paths (needs the migration), real-device keyboard behaviour with the sticky footer.

**Shipped**
- PR #40 merged to main and deployed to production by Vercel. Cold load of `https://theryn.fit/f/<anything>` serves the link page (not a 404), so links opened from WhatsApp work.
- Migration `20260912120000_client_links.sql` applied in the SQL editor. A direct select on `client_links` with the anon key is refused (401), as intended.

**Broken on the first real link, and the fix**
- Every real token came back "This link doesn't work." Cause: `digest()` from pgcrypto lives in the `extensions` schema on Supabase, and both RPCs pin `search_path = public, pg_temp`, so Postgres raised `function digest(text, unknown) does not exist`. My probe after the migration used a short token, which is rejected by the length check *before* `digest()` runs, so it looked fine. Lesson recorded: probe with a full-length token.
- Fix migration `20260912180000_client_links_digest_fix.sql`: `ALTER FUNCTION ... SET search_path = public, extensions, pg_temp` for both RPCs (search_path stays pinned; nothing else changes). Needs to be run in the SQL editor.
- The page also blamed the link for a server error. It now says "Couldn't load this right now… Your link is fine. Try again in a minute." for server/network failures, and keeps "This link doesn't work" for genuinely bad tokens.

**Open**
- Push notification on submission (trigger into `notify_outbox`) not built yet (roadmap 1.12).
- First real link: open a client, Share link, send it to your own phone, tick a workout and send measurements, then check the client page shows them.

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

**Added: name-only clients (owner request)**
- Coach can add a client by first and last name for people who don't have the app. New table `coach_manual_clients` (migration `20260909120000_coach_manual_clients.sql`) holds the plan, fee and payments as JSON. They appear in the Clients table with a "Not on app" tag; Plan (editor + Excel export) and Payments work; Progress, Body and Messages are hidden. "Connect to account" moves plan, fee and payments onto a real account once the person joins with the coach's code, then removes the name-only row.
- The data layer degrades if the table is missing: the list loads without name-only clients and adding one shows the exact migration file to run. Apply it in the SQL editor (see OBSERVABILITY.md) until migration history is reconciled (Roadmap 0.3).
- Verified in the preview: add by name, table tag, detail tabs, editor labels, connect flow (plan + fee + 1 payment moved). Unit tests for the id/shape helpers. Typecheck, tests, build pass.

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
