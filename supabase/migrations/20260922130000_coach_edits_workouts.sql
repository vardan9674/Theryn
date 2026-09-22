-- The coach can correct the numbers in a client's workout (75 kg that
-- should have been 7.5).
--
-- Adds one UPDATE policy on client_submissions: a coach may update a
-- WORKOUT row that belongs to them (coach_id = their own id). The dashboard
-- only rewrites the sets' numbers, marks the row edited_by_coach_at, and keeps
-- the client's first version in payload.original_exercises.
--
-- Nothing else changes: no columns, no functions, no existing rows. Coaches
-- could already read, add (for name-only clients) and delete their own
-- submissions. Safe to run more than once.

DROP POLICY IF EXISTS "Coach corrects own clients' workouts" ON client_submissions;
CREATE POLICY "Coach corrects own clients' workouts" ON client_submissions
  FOR UPDATE
  USING (coach_id = auth.uid() AND kind = 'workout')
  WITH CHECK (coach_id = auth.uid() AND kind = 'workout');

GRANT UPDATE ON client_submissions TO authenticated;
