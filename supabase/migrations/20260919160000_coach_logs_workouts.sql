-- The coach can log a workout for a client added by name (for when the client
-- trained but didn't tick it off on their link).
--
-- Adds one INSERT policy on client_submissions: a coach may insert a WORKOUT
-- row only for a name-only client that belongs to them. Rows are marked
-- payload.logged_by = 'coach' by the dashboard. Nothing else changes: no
-- columns, no functions, no existing rows. Coaches could already read and
-- delete their own submissions. Safe to run more than once.

DROP POLICY IF EXISTS "Coach logs workouts for own name-only clients" ON client_submissions;
CREATE POLICY "Coach logs workouts for own name-only clients" ON client_submissions
  FOR INSERT
  WITH CHECK (
    coach_id = auth.uid()
    AND kind = 'workout'
    AND athlete_id IS NULL
    AND manual_client_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM coach_manual_clients m
       WHERE m.id = client_submissions.manual_client_id
         AND m.coach_id = auth.uid()
    )
  );

GRANT INSERT ON client_submissions TO authenticated;
