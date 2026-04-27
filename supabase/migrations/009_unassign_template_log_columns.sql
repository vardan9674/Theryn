-- ============================================================================
-- Theryn — Migration 009: unassign_template — also populate coaching_relationship_id
-- ============================================================================
-- The production coach_activity_log table has a NOT NULL column
-- coaching_relationship_id that is not present in any migration in this repo
-- (schema drift). The unassign_template insert only set coach_athlete_id and
-- so failed at runtime with:
--   null value in column "coaching_relationship_id" of relation
--   "coach_activity_log" violates not-null constraint
--
-- Best-guess fix: coaching_relationship_id is a renamed/parallel FK to
-- coach_athletes.id, so populate it with the same value as coach_athlete_id.
-- If that assumption is wrong (different referenced table), the next runtime
-- error will tell us.
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
  v_link_id    UUID;
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

    -- Activity log: populate both coach_athlete_id and coaching_relationship_id
    -- (production schema has both, latter NOT NULL).
    SELECT ca.id INTO v_link_id
    FROM coach_athletes ca
    WHERE ca.coach_id = v_coach_id
      AND ca.athlete_id = v_athlete_id
      AND ca.status = 'accepted'
    LIMIT 1;

    IF v_link_id IS NOT NULL THEN
      INSERT INTO coach_activity_log (coach_athlete_id, coaching_relationship_id, action, details)
      VALUES (v_link_id, v_link_id, 'template_unassigned',
              jsonb_build_object('template_id', p_template_id));
    END IF;

    v_succeeded := v_succeeded || v_athlete_id;
  END LOOP;

  RETURN jsonb_build_object('succeeded', to_jsonb(v_succeeded));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
