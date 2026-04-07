# Changelog

## [1.3.0] - 2026-04-07

### Added
- **Dynamic Coach Athlete Dashboard**: In the Routine tab, coaches now see a dynamic board for their athletes showing real-time workout status (e.g., "Pushed yesterday", "Rest day") and streak metrics (e.g., "5-week streak").
- **Exercise Reordering (Log Tab)**: Added functional drag-and-drop reordering for exercises in the active Log session.
- **Add Exercise (Log Tab)**: Implemented an exercise picker modal to add new exercises directly to an active workout.
- **Undo Deletion**: Added a toast notification with an "Undo" action for accidentally deleted exercises.

### Changed
- **Coaching Restrictions**: Enforced a strict 1:1 relationship for athletes (one athlete can only have one active coach, while a coach can manage multiple athletes).
- **Routine Configuration UI**: Updated exercise configuration display to the requested "Sets, Lbs * Reps" format.
- **Swipe-to-Delete UX**: Refined the swipe interaction to be cleaner and more premium; eliminated the red background "bleed" glitch and removed instructional labels.

### Fixed
- **UI Glitches**: Fixed alignment and background issues in `SwipeRow` where the red delete zone was visible behind exercise cards when dragging.
- **Drag Handle Interaction**: Resolved issues with the drag handle in the Log tab by utilizing a render-prop pattern for `LogSortableItem`.
- **Routine Status Display**: Fixed display issues in Routine exercises when specific fields (like weight or reps) were missing.
