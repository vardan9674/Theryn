-- ============================================================================
-- Theryn — Migration 006: Fuzzy exercise search + coach/athlete sharing
-- ============================================================================
-- - Upgrades search_exercises() to fall back to trigram similarity so typos
--   like "Dumbell" surface "Dumbbell" results.
-- - Adds RLS so athletes can read user_exercises rows owned by their coaches
--   (no row duplication when a coach creates a custom exercise in a template).
-- - Adds source_user_exercise_id on routine_template_exercises so the editor
--   can pin a custom exercise by id, keeping renames coherent.
-- ============================================================================


-- ── Trigram index on user_exercises.name (matches public_exercises pattern) ──
CREATE INDEX IF NOT EXISTS idx_user_exercises_name_trgm
  ON user_exercises USING gin (name gin_trgm_ops);


-- ── RLS: athletes can read their coaches' custom exercises ──────────────────
-- The original "Users manage own custom exercises" policy on user_exercises
-- only covers the row owner. Add a sibling SELECT policy for the coach link.
CREATE POLICY "user_exercises_athlete_read_from_coach"
  ON user_exercises FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM coach_athletes
      WHERE coach_athletes.coach_id  = user_exercises.user_id
        AND coach_athletes.athlete_id = auth.uid()
        AND coach_athletes.status     = 'accepted'
    )
  );


-- ── Template FK to a custom exercise (id-stable across renames) ─────────────
ALTER TABLE routine_template_exercises
  ADD COLUMN IF NOT EXISTS source_user_exercise_id UUID
    REFERENCES user_exercises(id) ON DELETE SET NULL;


-- ── Replace search_exercises with a typo-tolerant version ───────────────────
-- Stage 1 (substring ILIKE) covers the common case fast.
-- Stage 2 (trigram similarity) supplements with fuzzy matches when Stage 1
-- returns few rows. Both stages now also consider user_exercises rows owned
-- by the searcher's coaches (matching the new RLS policy above).
DROP FUNCTION IF EXISTS search_exercises(TEXT, UUID);

CREATE OR REPLACE FUNCTION search_exercises(search_term TEXT, user_uid UUID)
RETURNS TABLE (
  id           UUID,
  name         TEXT,
  muscle_group TEXT,
  equipment    TEXT,
  is_custom    BOOLEAN,
  similarity   REAL
) AS $$
DECLARE
  trimmed TEXT := lower(trim(search_term));
BEGIN
  IF trimmed = '' OR trimmed IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH

  -- Custom exercises the user can see (own + accessible coach-owned).
  accessible_user_exercises AS (
    SELECT ue.id, ue.name, ue.muscle_group, ue.equipment
    FROM user_exercises ue
    WHERE ue.user_id = user_uid
       OR EXISTS (
         SELECT 1 FROM coach_athletes ca
         WHERE ca.coach_id  = ue.user_id
           AND ca.athlete_id = user_uid
           AND ca.status     = 'accepted'
       )
  ),

  -- Stage 1: substring matches on user-side custom library.
  custom_substring AS (
    SELECT aue.id, aue.name, aue.muscle_group, aue.equipment,
           true AS is_custom,
           1.0::real AS similarity
    FROM accessible_user_exercises aue
    WHERE lower(aue.name) LIKE '%' || trimmed || '%'
  ),

  -- Stage 1: substring matches on public library, including aliases.
  -- Excludes public rows the user already has a custom override for (matches
  -- the original behavior so duplicates don't show up).
  public_substring AS (
    SELECT pe.id, pe.name, pe.muscle_group, pe.equipment,
           false AS is_custom,
           1.0::real AS similarity
    FROM public_exercises pe
    WHERE (
            lower(pe.name) LIKE '%' || trimmed || '%'
         OR EXISTS (
              SELECT 1 FROM unnest(pe.aliases) alias
              WHERE lower(alias) LIKE '%' || trimmed || '%'
            )
          )
      AND NOT EXISTS (
        SELECT 1 FROM accessible_user_exercises aue
        WHERE lower(aue.name) = lower(pe.name)
      )
  ),

  stage1 AS (
    SELECT * FROM custom_substring
    UNION ALL
    SELECT * FROM public_substring
  ),

  -- Stage 2: trigram fuzzy fallback (only consulted if Stage 1 is sparse).
  -- Threshold 0.3 catches common typos ("Dumbell" -> "Dumbbell") without
  -- excessive noise. The trigram GIN index on public_exercises.name backs the
  -- `%` operator; user_exercises gets the same index above.
  custom_fuzzy AS (
    SELECT aue.id, aue.name, aue.muscle_group, aue.equipment,
           true AS is_custom,
           similarity(aue.name, trimmed) AS similarity
    FROM accessible_user_exercises aue
    WHERE aue.name % trimmed
      AND similarity(aue.name, trimmed) > 0.3
  ),
  public_fuzzy AS (
    SELECT pe.id, pe.name, pe.muscle_group, pe.equipment,
           false AS is_custom,
           similarity(pe.name, trimmed) AS similarity
    FROM public_exercises pe
    WHERE pe.name % trimmed
      AND similarity(pe.name, trimmed) > 0.3
      AND NOT EXISTS (
        SELECT 1 FROM accessible_user_exercises aue
        WHERE lower(aue.name) = lower(pe.name)
      )
  ),

  combined AS (
    SELECT * FROM stage1
    UNION
    SELECT cf.id, cf.name, cf.muscle_group, cf.equipment, cf.is_custom, cf.similarity
    FROM custom_fuzzy cf
    WHERE NOT EXISTS (SELECT 1 FROM stage1 s WHERE s.id = cf.id)
      AND (SELECT COUNT(*) FROM stage1) < 5
    UNION
    SELECT pf.id, pf.name, pf.muscle_group, pf.equipment, pf.is_custom, pf.similarity
    FROM public_fuzzy pf
    WHERE NOT EXISTS (SELECT 1 FROM stage1 s WHERE s.id = pf.id)
      AND (SELECT COUNT(*) FROM stage1) < 5
  )

  SELECT c.id, c.name, c.muscle_group, c.equipment, c.is_custom, c.similarity
  FROM combined c
  ORDER BY c.is_custom DESC, c.similarity DESC, c.name
  LIMIT 8;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
