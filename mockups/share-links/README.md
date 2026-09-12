# Shared links — design preview

Approval-stage mockup only. No feature backend, production route, database migration, authentication change, persistent storage, or real sharing is implemented.

Run the existing Vite development server and open `/mockups/share-links/`. The independent HTML entry is not included in the normal production build. Existing application files and design tokens are imported without modification.

## Review

- Switch between Coach, Measurements, and Workout using the preview toolbar.
- Switch Mobile/Desktop to inspect the layout; the page also adapts to an actual small browser viewport.
- Coach: request fields, prepare a simulated private link, preview the recipient page, or share a dated workout.
- Measurements: select body points, enter measurements, change units, submit, and inspect the coach's updated view.
- Workout: check or skip exercises, optionally enter actual weights and feedback, submit partial/full progress, and inspect the coach's Plan / Check-ins tabs.
- Reset clears the in-memory sample data. Reloading also clears it.

Sample date: September 14, 2026. Sample people: Alex Morgan and Coach Sam Taylor.

The approved conversation design is the reference: separate scoped requests and dated workouts, explicit target weights, self-reported completion, and browser access without an account. The unrelated existing proposed decision document is not modified by this mockup.

Wait for the owner's green light before implementing the feature.
