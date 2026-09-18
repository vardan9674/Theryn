-- ============================================================================
-- link_view also returns the days the client trained, so their streak on the
-- link page is right on any phone (until now the page only knew what that one
-- phone had sent).
--
-- What is added to the response: "done_dates": ["2026-09-14", ...] for the last
-- 400 days. Dates only: no exercises, weights, notes or measurements. This
-- widens decision 0006 ("no history is shown") by exactly that much.
--
-- Everything else in the function is unchanged from 20260912120000 (with the
-- 20260912180000 search_path fix). Same signature, so grants are kept. Safe to
-- run more than once. Apply in the Supabase SQL editor.
-- ============================================================================

CREATE OR REPLACE FUNCTION link_view(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp   -- extensions: pgcrypto's digest()
AS $$
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
                 SELECT jsonb_agg(jsonb_build_object(
                          'name', coalesce(pe.name, ue.name),
                          'sets', re.target_sets,
                          'reps', re.target_reps,
                          'note', re.notes) ORDER BY re.sort_order)
                 FROM routine_exercises re
                 LEFT JOIN public_exercises pe ON pe.id = re.exercise_id
                 LEFT JOIN user_exercises  ue ON ue.id = re.exercise_id
                 WHERE re.routine_day_id = d.id AND re.removed_at IS NULL
               ), '[]'::jsonb)))
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
$$;

-- Check after applying (uses a token that doesn't exist, so it touches nothing):
--   SELECT link_view('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');   -> {"ok": false, "reason": "revoked"}
-- Then open any real client link: it should load as before, and the streak shows from 2 days.
