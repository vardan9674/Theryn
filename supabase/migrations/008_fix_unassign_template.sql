-- ============================================================================
-- Theryn — Migration 008: Fix unassign_template RPC
-- ============================================================================
-- The original unassign_template (in 005_routine_templates.sql) used a bare
-- SELECT without INTO to gate on template ownership:
--
--     SELECT owner_coach_id FROM routine_templates WHERE ...;
--     IF NOT FOUND THEN RAISE EXCEPTION 'Template not found'; END IF;
--
-- That's invalid PL/pgSQL — a SELECT in a function body must either use INTO
-- or be wrapped in PERFORM. Calling the function throws
-- "query has no destination for result data", which surfaced in the coach UI
-- as 'unable to remove an athlete from a template'.
--
-- Replace with PERFORM 1 FROM ... so FOUND is set correctly. Behaviour is
-- otherwise identical to the original definition.
-- ============================================================================

CREATE OR REPLACE FUNCTION unassign_template(
  p_template_id UUID,
  p_athlete_ids UUID[]
)
RETURNS JSONB AS $$
DECLARE
  v_coach_id   UUID := auth.uid();
  v_athlete_id UUID;
  v_succeeded  UUID[] := ARRAY[]::UUID[];
BEGIN
  PERFORM 1 FROM routine_templates
  WHERE id = p_template_id
    AND owner_coach_id = v_coach_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN RAISE EXCEPTION 'Template not found'; END IF;

  FOREACH v_athlete_id IN ARRAY p_athlete_ids LOOP
    UPDATE routine_template_assignments SET
      unassigned_at = now()
    WHERE template_id = p_template_id
      AND athlete_id  = v_athlete_id
      AND unassigned_at IS NULL;

    -- Detach routine from template so future edits don't affect it
    UPDATE routines SET
      is_overridden      = true,
      source_template_id = NULL,
      updated_at         = now()
    WHERE user_id = v_athlete_id AND is_active = true
      AND source_template_id = p_template_id;

    INSERT INTO coach_activity_log (coach_athlete_id, action, details)
    SELECT ca.id, 'template_unassigned',
           jsonb_build_object('template_id', p_template_id)
    FROM coach_athletes ca
    WHERE ca.coach_id = v_coach_id
      AND ca.athlete_id = v_athlete_id
      AND ca.status = 'accepted'
    LIMIT 1;

    v_succeeded := v_succeeded || v_athlete_id;
  END LOOP;

  RETURN jsonb_build_object('succeeded', to_jsonb(v_succeeded));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
