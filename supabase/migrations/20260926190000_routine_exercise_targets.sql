-- A client's plan keeps weights, per-set targets, timed sets, supersets and rest (#129).
--
-- An app client's plan is stored as rows in routine_exercises, which only had
-- target_sets, target_reps and notes. The plan editor also sets weights, a
-- different target per set, timed sets, supersets and rest, so saving an app
-- client's plan silently dropped all of those. Saved plans
-- (routine_template_exercises) gained the same fields on 2026-09-19 and
-- 2026-09-22; this gives a client's own plan the same four columns:
--   target_weight  the weight when every set is the same (or set 1's)
--   set_list       [{ "reps": "12", "weight": 60 }, { "secs": 45 }, ...] when sets differ
--   weight_unit    'kg' or 'lb': the unit the weights were typed in
--   extra          { "mode": "time", "secs": 45, "superset": "A", "rest": 90 }
--
-- 1. Four new nullable columns. Existing rows are untouched and read as before.
-- 2. A trigger fills them from the saved plan a row came from, when
--    assign_template creates it or push_template_update creates or refreshes
--    it, so assigning or updating a saved plan carries its weights too. Those
--    two functions are not changed.
-- 3. link_view includes the new fields, so a client's link shows them.
--
-- Nothing is deleted. Safe to run more than once.

ALTER TABLE public.routine_exercises
  ADD COLUMN IF NOT EXISTS target_weight NUMERIC,
  ADD COLUMN IF NOT EXISTS set_list      JSONB,
  ADD COLUMN IF NOT EXISTS weight_unit   TEXT,
  ADD COLUMN IF NOT EXISTS extra         JSONB;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'routine_exercises_weight_unit_check') THEN
    ALTER TABLE public.routine_exercises
      ADD CONSTRAINT routine_exercises_weight_unit_check CHECK (weight_unit IS NULL OR weight_unit IN ('kg', 'lb'));
  END IF;
END $$;

-- 2. Copy the targets from the saved plan a row came from.
--    INSERT: assign_template and push_template_update create rows with
--    template_exercise_id set and the new columns empty; fill them.
--    UPDATE: push_template_update refreshes an existing row (sets, reps, note,
--    removed_at = NULL) without knowing the new columns; refresh them too, so
--    "Update clients" carries changed weights. An update that sets any of the
--    four itself, or soft-deletes the row, is left alone.
--    Runs as the caller (not SECURITY DEFINER): inside those functions that is
--    the function owner; anyone else only copies from saved plans their own
--    policies already let them read.
CREATE OR REPLACE FUNCTION public.routine_exercise_copy_template_targets()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.template_exercise_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.target_weight IS NOT NULL OR NEW.set_list IS NOT NULL
       OR NEW.weight_unit IS NOT NULL OR NEW.extra IS NOT NULL THEN
      RETURN NEW;
    END IF;
  ELSE
    IF NEW.removed_at IS NOT NULL
       OR NEW.target_weight IS DISTINCT FROM OLD.target_weight
       OR NEW.set_list      IS DISTINCT FROM OLD.set_list
       OR NEW.weight_unit   IS DISTINCT FROM OLD.weight_unit
       OR NEW.extra         IS DISTINCT FROM OLD.extra THEN
      RETURN NEW;
    END IF;
  END IF;
  SELECT t.target_weight, t.set_list, t.weight_unit, t.extra
    INTO NEW.target_weight, NEW.set_list, NEW.weight_unit, NEW.extra
    FROM routine_template_exercises t
   WHERE t.id = NEW.template_exercise_id;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.routine_exercise_copy_template_targets() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.routine_exercise_copy_template_targets() FROM anon;
REVOKE EXECUTE ON FUNCTION public.routine_exercise_copy_template_targets() FROM authenticated;

DROP TRIGGER IF EXISTS routine_exercises_copy_template_targets ON public.routine_exercises;
CREATE TRIGGER routine_exercises_copy_template_targets
  BEFORE INSERT OR UPDATE ON public.routine_exercises
  FOR EACH ROW EXECUTE FUNCTION public.routine_exercise_copy_template_targets();

-- 3. link_view, as live, plus the new fields on each exercise and the unit the
--    weights were typed in on each day (the link converts them to the client's).
CREATE OR REPLACE FUNCTION public.link_view(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_link      client_links%ROWTYPE;
  v_first     TEXT;
  v_coach     TEXT;
  v_unit      TEXT := 'imperial';
  v_plan      JSONB := NULL;
  v_routine   UUID;
  v_done      JSONB := '[]'::jsonb;
BEGIN
  IF p_token IS NULL OR length(p_token) < 20 OR length(p_token) > 128 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  SELECT * INTO v_link FROM client_links WHERE token_hash = encode(digest(p_token, 'sha256'), 'hex');
  IF NOT FOUND OR v_link.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'revoked');
  END IF;

  SELECT split_part(coalesce(display_name, 'Coach'), ' ', 1) INTO v_coach FROM profiles WHERE id = v_link.coach_id;
  IF v_coach IS NULL OR v_coach = '' THEN v_coach := 'Coach'; END IF;

  IF v_link.athlete_id IS NOT NULL THEN
    SELECT split_part(coalesce(display_name, ''), ' ', 1), coalesce(unit_system, 'imperial')
      INTO v_first, v_unit FROM profiles WHERE id = v_link.athlete_id;
    SELECT id INTO v_routine FROM routines WHERE user_id = v_link.athlete_id AND is_active = true LIMIT 1;
    IF v_routine IS NOT NULL THEN
      SELECT jsonb_object_agg(d.label, jsonb_build_object(
               'type', d.workout_type,
               'exercises', coalesce((
                 SELECT jsonb_agg(
                          jsonb_build_object(
                            'name', coalesce(pe.name, ue.name),
                            'sets', re.target_sets,
                            'reps', re.target_reps,
                            'note', re.notes)
                          || jsonb_strip_nulls(jsonb_build_object(
                            'weight', re.target_weight,
                            'setList', CASE WHEN jsonb_typeof(re.set_list) = 'array' AND jsonb_array_length(re.set_list) > 0 THEN re.set_list END,
                            'mode', CASE WHEN re.extra->>'mode' = 'time' THEN 'time' END,
                            'secs', CASE WHEN re.extra->>'mode' = 'time' AND jsonb_typeof(re.extra->'secs') = 'number' THEN re.extra->'secs' END,
                            'superset', CASE WHEN jsonb_typeof(re.extra->'superset') = 'string' THEN re.extra->'superset' END,
                            'rest', CASE WHEN jsonb_typeof(re.extra->'rest') = 'number' THEN re.extra->'rest' END))
                          ORDER BY re.sort_order)
                 FROM routine_exercises re
                 LEFT JOIN public_exercises pe ON pe.id = re.exercise_id
                 LEFT JOIN user_exercises  ue ON ue.id = re.exercise_id
                 WHERE re.routine_day_id = d.id AND re.removed_at IS NULL
               ), '[]'::jsonb))
               || jsonb_strip_nulls(jsonb_build_object('units', (
                 SELECT CASE min(re.weight_unit) WHEN 'kg' THEN 'metric' WHEN 'lb' THEN 'imperial' END
                   FROM routine_exercises re
                  WHERE re.routine_day_id = d.id AND re.removed_at IS NULL AND re.weight_unit IS NOT NULL))))
        INTO v_plan
      FROM routine_days d WHERE d.routine_id = v_routine;
    END IF;
  ELSE
    SELECT first_name, plan INTO v_first, v_plan FROM coach_manual_clients WHERE id = v_link.manual_client_id;
  END IF;

  -- Days with a workout, for the streak. The client's own date (local_date) is
  -- used only when it is within a day of the server's, the same rule the coach
  -- dashboard applies. Any bad value just means no dates; the link still opens.
  BEGIN
    SELECT coalesce(jsonb_agg(DISTINCT x.d), '[]'::jsonb) INTO v_done FROM (
      SELECT CASE
               WHEN s.payload->>'local_date' ~ '^\d{4}-\d{2}-\d{2}$'
                AND s.payload->>'date' ~ '^\d{4}-\d{2}-\d{2}$'
                AND abs((s.payload->>'local_date')::date - (s.payload->>'date')::date) <= 1
               THEN s.payload->>'local_date'
               ELSE s.payload->>'date'
             END AS d
        FROM client_submissions s
       WHERE s.kind = 'workout'
         AND s.submitted_at > now() - interval '400 days'
         AND ((v_link.manual_client_id IS NOT NULL AND s.manual_client_id = v_link.manual_client_id)
           OR (v_link.athlete_id IS NOT NULL AND s.athlete_id = v_link.athlete_id))
      UNION
      SELECT to_char(w.completed_at, 'YYYY-MM-DD')
        FROM workout_sessions w
       WHERE v_link.athlete_id IS NOT NULL AND w.user_id = v_link.athlete_id
         AND w.completed_at IS NOT NULL AND w.completed_at > now() - interval '400 days'
    ) x WHERE x.d ~ '^\d{4}-\d{2}-\d{2}$';
  EXCEPTION WHEN others THEN
    v_done := '[]'::jsonb;
  END;

  UPDATE client_links SET opens = opens + 1, last_opened_at = now() WHERE id = v_link.id;

  RETURN jsonb_build_object(
    'ok', true,
    'first_name', coalesce(v_first, ''),
    'coach_name', v_coach,
    'unit_system', v_unit,
    'requested', to_jsonb(coalesce(v_link.requested, ARRAY['chest','waist','hips','arm','thigh'])),
    'plan', v_plan,
    'done_dates', v_done
  );
END;
$function$;

NOTIFY pgrst, 'reload schema';
