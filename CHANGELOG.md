# Changelog

## [1.5.0] - 2026-04-17

### Added
- **Math-Based Coach Insights** (`src/lib/coachInsights.js`): Pure, deterministic detectors that surface non-obvious issues on the Coach dashboard — no AI, no guessing. New signals:
  - `detectAdherence` — 28-day completion %, urgent &lt;60%, warn 60–79%.
  - `detectAsymmetry` — L/R limb gap from the latest measurement (arms, thighs), warn at ≥8%, urgent at ≥12%.
  - `detectWHR` — waist-to-hip ratio flagged at ≥0.95 (gender-neutral WHO threshold).
  - `detectSessionDuration` — flags when recent avg session length drops ≥30% vs the 5 prior sessions.
  - `detectStaleMuscleGroup` — any routine-scheduled workout type not trained in 14+ days.
- **Numeric Stats Helper** (`computeStats`): Returns adherence %, 7-day volume, body-weight delta, avg session minutes, WHR — feeds the card stats strip.
- **BMI** (`computeBMI` + `bmiCategory`): WHO-band-classified, unit-aware (imperial or metric). Displayed on both the athlete's Body tab and the Coach Body tab, alongside the Weight card.
- **One-Screen Onboarding** (`FullNameSetup` rewrite): Single screen collects full name + height (ft+in OR cm toggle) + current weight (lb OR kg). Writes `profiles.display_name` + `profiles.height_cm` + `profiles.unit_system` + `profiles.onboarding_completed = true`, and seeds the first `body_weights` row.
- **Supabase Migration — 002\_onboarding** (`supabase/migrations/002_onboarding.sql`): Adds `profiles.height_cm NUMERIC(5,1)` and `profiles.onboarding_completed BOOLEAN NOT NULL DEFAULT false`. Must be applied (`supabase db push`) before v1.5.0 can run.
- **Haptic Feedback** on Coach athlete-card tap (light impact via `@capacitor/haptics`) for native iOS/Android.

### Changed
- **Athlete Card (`CoachAthleteRow`) — full redesign**:
  - Neutral 1px border at all times — no more urgent-red outline on whole cards.
  - 36px initials-on-surface avatar (lime initial on dark squircle, Linear-style) replaces the lime-filled circle.
  - Streak shown inline under the name as `· 12d streak` (muted text, no chip fill).
  - Insight rendered as one sentence with an optional 6px severity dot prefix — no more colored "Insight" pill.
  - 3-tile unboxed stats strip: **7d Volume** · **Body Weight** (with `↑`/`↓` delta arrow matching the Body tab convention) · **Avg Session**. Previous 4th "Adherence" tile removed (was duplicated inside the insight line).
  - Action row now 3 text links (`View routine →` etc.) with arrow-slide-and-lime hover on desktop. Divider hairlines replace hard borders.
  - Whole card tappable (keyboard-accessible) — routes to the most contextually useful tab given active signals (e.g., asymmetry → Body, adherence → Progress), falls back to Routines.
- **Severity Palette**: `SEVERITY_COLORS.urgent` swapped from alarm-red `#FF5A5A` to burnt-sienna `#D97757` for a premium feel; `warn` softened `#FFB454` → `#E0A95A`. Small-surface usage only — whole cards never tinted.
- **Intro Tour (`TourOverlay`)**: Cut from 7 slides to 3 — *Train.* · *Track.* · *Team up.* Shorter copy, one idea per slide.
- **Onboarding Gate**: Replaced per-device `localStorage` flag with a Supabase query on `profiles.onboarding_completed`. Single source of truth; no more re-prompt on a second device.
- **Initials**: Now re-derived from `profiles.display_name` on every sign-in — the name you typed at setup drives the avatar everywhere, overriding the Google metadata fallback.
- **Coach Athlete Data Loader** (`loadAthleteData`): Now also fetches the athlete's `height_cm` + `unit_system` (single extra round-trip), so the coach can render BMI without a second fetch.

### Fixed
- **Coach Routines tab crashed on "Save Note"**: Root cause was `saveRoutine` passing a whole exercise-object (`{name, coachNote}`) into `getExerciseId`, which called `.toLowerCase()` on an object and threw. The inner per-exercise `try/catch` silently dropped the edited exercise from the DB, and the `notes` column was never written. `saveRoutine` now accepts `string | {name, coachNote, ...}`, extracts `name`/`coachNote`, and writes to `routine_exercises.notes`. `loadRoutine` re-hydrates as an object when `notes` is present.
- **Optimistic update after note save did nothing**: `saveNote` was calling `setAthleteCache?.(prev => …)` but the parent exposes `setAthleteCache(id, data)`. The reducer function got stored as a key with `undefined` value; the real cache entry was untouched, so the background refetch immediately overwrote state with the stale DB row (which also had no note). Fixed to the correct `(id, data)` signature.
- **"Day-by-day" repaint after saving a note**: `athleteDataCache` was React state *and* a dep of the data-load effect, so every optimistic cache write retriggered a full `loadAthleteData` network round-trip (routine + history + weights + measurements in parallel). Moved the cache to a `useRef`; writes no longer fire the effect. Background refetches also now guard against the coach switching athletes mid-flight via a `selectedAthleteRef` compare.
- **Name prompt re-appeared on every device**: The old `theryn_name_setup_${userId}` localStorage flag was per-device. Fresh browser, second phone, or cleared cache all re-triggered the prompt even though the name was already in Supabase. Replaced with `profiles.onboarding_completed` (DB = truth).
- **Urgent-red dot on Quick Actions buttons**: Removed the 6px absolute-positioned dot from the athlete card's action footer.

### Internal
- **`ExerciseItem` type** added to `useRoutine.ts`: `string | { name, coachNote?, sets?, reps?, weight? }`. All consumers already tolerate both shapes via `typeof ex === "object" ? ex.name : ex`.
- **`coach-athlete-card` class** added to `index.css` with iOS/Android press-scale active state (`transform: scale(0.985)`, transparent tap highlight), suppressed on desktop so it doesn't fight the existing card-lift hover.
- **`coach-card-link` hover rule** brightens the text link and slides the arrow 2px right with a 0.15s transition.

### Migration notes for existing users
`profiles.onboarding_completed` defaults to `false` — existing users will see the new 3-field setup screen *once* on next sign-in, which gives us their height + re-confirms weight. BMI won't render for them until this is captured. If you'd rather skip returning users, uncomment the `UPDATE profiles SET onboarding_completed = true WHERE display_name IS NOT NULL` block in the migration file, but they'll have no `height_cm` → no BMI until they log it manually.

## [1.4.0] - 2026-04-17

### Added
- **Coach-to-Athlete Note Sync**: Coaches can now write notes per exercise (e.g. "Breathe out when you lift") that sync to Supabase and display inline in the athlete's Log screen on all platforms (iOS, Android, Web).
- **Premium Particle Canvas**: Rebuilt ambient particle system with 3 depth layers, radial glow halos, sine-wave pulsing, and real-time mouse repulsion.
- **Web Exercise Search Modal**: ExercisePicker is now a centered floating modal on desktop with a search icon, result count, and hover states — no longer a mobile-only bottom sheet.

### Changed
- **Coach Dashboard — Web Buttons**: Constrained full-width mobile buttons to compact auto-width on desktop; role picker cards display side-by-side.
- **Coach Routines Tab**: Completely removed localStorage note storage in favour of writing directly into the athlete's Supabase routine payload.
- **Profile Avatar — Native**: Moved the floating coach profile avatar off the content area on mobile (it was overlapping athlete cards); it now lives inline in the Athletes tab header.
- **Athlete Routine Screen**: Removed the embedded "Coach Access" athlete editor from the athlete app — coaches manage all athletes exclusively from the Coach Dashboard.

### Fixed
- **Coach Notes — Text Disappearing**: Replaced uncontrolled `ref`-based textarea (which reset on every re-render) with a controlled `noteText` state.
- **Coach Notes — Page Flicker on Save**: Fixed stale closure in `setAthleteCache` that caused the view to switch athlete mid-save.
- **Exercise Search — Web**: Fixed `ExercisePicker` z-index and focus so the search input works correctly inside the athlete-view modal on desktop.
- **Android Sign-in**: Added missing `intent-filter` for `com.theryn.app://` deep-link scheme in `AndroidManifest.xml` so Google OAuth completes correctly on Android.
- **Android Build**: Corrected AGP (8.9.1), Gradle wrapper (8.11.1), and `compileSdkVersion` (36) to satisfy androidx dependency requirements.

## [1.3.0] - 2026-04-07

### Added
- **Dynamic Coach Athlete Dashboard**: In the Routine tab, coaches now see a dynamic board for their athletes showing real-time workout status (e.g., "Pushed yesterday", "Rest day") and streak metrics (e.g., "5-week streak").
- **Exercise Reordering (Log Tab)**: Added functional drag-and-drop reordering for exercises in the active Log session.
- **Add Exercise (Log Tab)**: Implemented an exercise picker modal to add new exercises directly to an active workout.
- **Native Sharing**: Added a dedicated "Share" button for Coach/Athlete invite codes using the native share sheet (WhatsApp, iMessage, etc.).
- **Undo Deletion**: Added a toast notification with an "Undo" action for accidentally deleted exercises.

### Changed
- **Coaching Restrictions**: Enforced a strict 1:1 relationship for athletes (one athlete can only have one active coach, while a coach can manage multiple athletes).
- **Routine Configuration UI**: Updated exercise configuration display to the requested "Sets, Lbs * Reps" format.
- **Swipe-to-Delete UX**: Refined the swipe interaction to be cleaner and more premium; eliminated the red background "bleed" glitch and removed instructional labels.

### Fixed
- **UI Glitches**: Fixed alignment and background issues in `SwipeRow` where the red delete zone was visible behind exercise cards when dragging.
- **Drag Handle Interaction**: Resolved issues with the drag handle in the Log tab by utilizing a render-prop pattern for `LogSortableItem`.
- **Routine Status Display**: Fixed display issues in Routine exercises when specific fields (like weight or reps) were missing.
