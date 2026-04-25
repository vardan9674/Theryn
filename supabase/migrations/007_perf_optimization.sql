-- ============================================================================
-- Migration 007 — Performance & integrity optimization
--
-- Goals:
--   1. Add indexes to cover RLS join hot paths (routines / routine_days /
--      routine_exercises / coach_athletes / coach_activity_log / profiles.role).
--   2. Add a batch_resolve_exercises RPC so saveRoutine no longer fires N
--      sequential public_exercises/user_exercises queries per routine save.
--   3. Add INSERT/UPDATE triggers asserting that exercise_id values point at
--      a real public_exercises or user_exercises row (these columns are NOT
--      NULL but had no FK because they reference one of two tables).
--
-- Idempotent (CREATE INDEX IF NOT EXISTS, CREATE OR REPLACE FUNCTION,
-- DROP TRIGGER IF EXISTS before CREATE TRIGGER) — safe to re-run.
--
-- Note: this migration was originally created as 005_perf_optimization.sql
-- and has already been applied to the project's Supabase under that name.
-- It was renumbered to 007 to coexist with 005_routine_templates.sql and
-- 005_messaging_previews.sql added to main in parallel. Re-running under
-- the new name is a no-op (everything is already there).
-- ============================================================================


-- ── INDEXES ─────────────────────────────────────────────────────────────────

-- Active routine lookup is the hottest RLS path: routine_days, routine_exercises,
-- and the coach-aware policies all join `routines` filtered by user_id and
-- typically is_active = true. Composite + partial keeps the index small.
CREATE INDEX IF NOT EXISTS idx_routines_user_active
  ON routines (user_id) WHERE is_active = true;

-- routine_days RLS predicate is "routine_days.routine_id = routines.id" — the
-- nested-EXISTS variant in 001 fires per row of routine_days. Without an index
-- on the FK column the planner does a seq scan on routine_days for every
-- coach view of an athlete's routine.
CREATE INDEX IF NOT EXISTS idx_routine_days_routine
  ON routine_days (routine_id);

-- Same shape, one level deeper.
CREATE INDEX IF NOT EXISTS idx_routine_exercises_day
  ON routine_exercises (routine_day_id);

-- coach_athletes RLS predicate "coach_id = auth.uid()" is unindexed. Common
-- read pattern (load my coaching links) is filtered by coach_id + status.
CREATE INDEX IF NOT EXISTS idx_coach_athletes_coach_status
  ON coach_athletes (coach_id, status);

-- coach_activity_log has an FK column with no supporting index AND audit views
-- order by created_at DESC. One composite covers both.
CREATE INDEX IF NOT EXISTS idx_coach_activity_log_link_date
  ON coach_activity_log (coach_athlete_id, created_at DESC);

-- profiles.role was added in migration 004_user_role.sql but never indexed.
-- The coach app filters profiles by role and several RLS policies branch on it.
CREATE INDEX IF NOT EXISTS idx_profiles_role
  ON profiles (role) WHERE role IS NOT NULL;


-- ── BATCH EXERCISE RESOLUTION (kills N+1 in saveRoutine) ────────────────────
--
-- Replaces a per-exercise round-trip loop in src/hooks/useRoutine.ts:
--   1. Look up by name in public_exercises (case-insensitive)
--   2. Else look up in user_exercises for the calling user
--   3. Else create a new user_exercises row
-- Returns one (name, id) pair per input name.
--
-- SECURITY DEFINER + auth.uid() check matches the pattern used by other
-- helper functions in 001_initial_schema.sql; we never trust the client-passed
-- p_user_id.

CREATE OR REPLACE FUNCTION batch_resolve_exercises(
  p_names    TEXT[],
  p_user_id  UUID
)
RETURNS TABLE (name TEXT, id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT;
  v_id   UUID;
BEGIN
  IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_names IS NULL THEN
    RETURN;
  END IF;

  FOREACH v_name IN ARRAY p_names LOOP
    v_id := NULL;

    IF v_name IS NULL OR length(trim(v_name)) = 0 THEN
      CONTINUE;
    END IF;

    SELECT pe.id INTO v_id
    FROM public_exercises pe
    WHERE lower(pe.name) = lower(v_name)
    LIMIT 1;

    IF v_id IS NULL THEN
      SELECT ue.id INTO v_id
      FROM user_exercises ue
      WHERE ue.user_id = p_user_id
        AND lower(ue.name) = lower(v_name)
      LIMIT 1;
    END IF;

    IF v_id IS NULL THEN
      INSERT INTO user_exercises (user_id, name)
      VALUES (p_user_id, v_name)
      RETURNING user_exercises.id INTO v_id;
    END IF;

    name := v_name;
    id := v_id;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION batch_resolve_exercises(TEXT[], UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION batch_resolve_exercises(TEXT[], UUID) TO authenticated;


-- ── EXERCISE_ID INTEGRITY TRIGGERS ──────────────────────────────────────────
--
-- routine_exercises.exercise_id, workout_sets.exercise_id, and
-- personal_records.exercise_id are NOT NULL but cannot have a real FK because
-- they reference one of two tables (public_exercises or user_exercises).
-- This validation trigger blocks orphaned IDs at write time. It does not
-- enforce ON DELETE cascades — callers must clean up themselves.

CREATE OR REPLACE FUNCTION assert_exercise_exists()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.exercise_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public_exercises WHERE id = NEW.exercise_id) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM user_exercises WHERE id = NEW.exercise_id) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'exercise_id % not found in public_exercises or user_exercises',
    NEW.exercise_id;
END;
$$;

DROP TRIGGER IF EXISTS trg_routine_exercises_check_exercise ON routine_exercises;
CREATE TRIGGER trg_routine_exercises_check_exercise
  BEFORE INSERT OR UPDATE OF exercise_id ON routine_exercises
  FOR EACH ROW EXECUTE FUNCTION assert_exercise_exists();

DROP TRIGGER IF EXISTS trg_workout_sets_check_exercise ON workout_sets;
CREATE TRIGGER trg_workout_sets_check_exercise
  BEFORE INSERT OR UPDATE OF exercise_id ON workout_sets
  FOR EACH ROW EXECUTE FUNCTION assert_exercise_exists();

DROP TRIGGER IF EXISTS trg_personal_records_check_exercise ON personal_records;
CREATE TRIGGER trg_personal_records_check_exercise
  BEFORE INSERT OR UPDATE OF exercise_id ON personal_records
  FOR EACH ROW EXECUTE FUNCTION assert_exercise_exists();
