-- Removes coaching_relationships, a table from an earlier design of coaching
-- that never went anywhere.
--
-- It has no rows, no code reads or writes it, and no migration in this repo
-- creates it — 004_messaging.sql already carries a note that the app uses
-- coach_athletes instead. What it does still have is two policies on
-- coach_activity_log written against it:
--
--   "Coach activity visible to both parties" (SELECT)
--   "Coaches can insert activity"            (INSERT)
--
-- Both ask for an accepted row in coaching_relationships. There are none, and
-- there never will be, so both currently match nothing: no coach can read
-- their own activity log through the API today. The rows in it are written by
-- assign_template, push_template_update, unassign_template,
-- reset_athlete_to_template and fork_athlete_routine, which are all
-- SECURITY DEFINER and so never consulted these policies at all.
--
-- So this replaces them with one that works — a coach reads the log for an
-- athlete they actually coach — and then drops the table. Writes stay with the
-- functions; nothing inserts through the API.

-- ── coach_activity_log: policies that mean something ───────────────────────
DROP POLICY IF EXISTS "Coach activity visible to both parties" ON coach_activity_log;
DROP POLICY IF EXISTS "Coaches can insert activity"            ON coach_activity_log;

CREATE POLICY "Coach reads activity for own athletes" ON coach_activity_log
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM coach_athletes ca
                  WHERE ca.id = coach_activity_log.coach_athlete_id
                    AND ca.status = 'accepted'
                    AND (ca.coach_id = (SELECT auth.uid()) OR ca.athlete_id = (SELECT auth.uid()))));

-- The log is written by the template functions, which run as owner.
REVOKE INSERT, UPDATE, DELETE ON coach_activity_log FROM anon, authenticated;

-- ── The orphan itself ──────────────────────────────────────────────────────
-- Empty, unread, unwritten. The column on coach_activity_log that pointed at
-- it is left alone: it is nullable, every live row has it NULL, and dropping a
-- column is not worth the churn.
DROP TABLE IF EXISTS coaching_relationships;
