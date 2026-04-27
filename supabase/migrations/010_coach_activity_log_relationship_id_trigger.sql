-- ============================================================================
-- Theryn — Migration 010: coach_activity_log relationship_id back-fill trigger
-- ============================================================================
-- The production coach_activity_log table has a NOT NULL column
-- coaching_relationship_id that is not in any repo migration (schema drift).
-- Five RPCs in 005_routine_templates.sql write to coach_activity_log and only
-- set coach_athlete_id, so each one fails the moment its code path runs:
--
--   - assign_template            (line ~463)
--   - push_template_update       (line ~675)
--   - fork_athlete_routine       (line ~732)
--   - reset_athlete_to_template  (line ~786)
--   - unassign_template          (line ~832, also fixed in 008/009)
--
-- Rather than re-create every function, install a BEFORE INSERT trigger that
-- copies coach_athlete_id → coaching_relationship_id whenever the latter is
-- NULL. Same value either way (best evidence is they reference the same row),
-- and this also catches any future RPC that forgets the new column.
-- ============================================================================

CREATE OR REPLACE FUNCTION coach_activity_log_fill_relationship_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.coaching_relationship_id IS NULL THEN
    NEW.coaching_relationship_id := NEW.coach_athlete_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS coach_activity_log_fill_relationship_id_tr ON coach_activity_log;

CREATE TRIGGER coach_activity_log_fill_relationship_id_tr
  BEFORE INSERT ON coach_activity_log
  FOR EACH ROW
  EXECUTE FUNCTION coach_activity_log_fill_relationship_id();
