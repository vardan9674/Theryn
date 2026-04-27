-- ============================================================================
-- Theryn — Migration 011: drop coaching_relationship_id constraints + trigger
-- ============================================================================
-- The coaching_relationship_id column on coach_activity_log was added to the
-- production database outside the repo migrations and references a table that
-- the application code does not know about. Migration 010's back-fill trigger
-- guessed wrong — it populated the column with coach_athletes.id, which then
-- failed the FK constraint
-- (coach_activity_log_coaching_relationship_id_fkey).
--
-- Since no application code reads or writes this column, the safest fix is to
-- drop the NOT NULL and the FK so INSERTs from the template RPCs always
-- succeed. The column itself is left in place (data preservation) — drop it
-- in a follow-up if you confirm it's truly unused.
--
-- Also remove the back-fill trigger from 010 so it stops setting wrong values.
-- ============================================================================

-- 1) Remove the trigger and helper function from migration 010.
DROP TRIGGER  IF EXISTS coach_activity_log_fill_relationship_id_tr ON coach_activity_log;
DROP FUNCTION IF EXISTS coach_activity_log_fill_relationship_id();

-- 2) Drop the foreign key on coaching_relationship_id (name comes from the
--    runtime error: coach_activity_log_coaching_relationship_id_fkey).
ALTER TABLE coach_activity_log
  DROP CONSTRAINT IF EXISTS coach_activity_log_coaching_relationship_id_fkey;

-- 3) Drop the NOT NULL constraint so existing INSERTs that omit the column
--    succeed.
ALTER TABLE coach_activity_log
  ALTER COLUMN coaching_relationship_id DROP NOT NULL;
