# Changelog

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
