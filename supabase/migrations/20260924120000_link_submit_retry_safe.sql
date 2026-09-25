-- Finishing a workout on a phone that drops its connection, and fixing one
-- that has already gone.
--
-- Three changes to link_submit, nothing else:
--
--   1. A retry is the same workout. The page now sends a `client_key` that
--      stays the same until the coach has the workout, even across a reload.
--      If a send did land and the phone never heard back, the retry returns
--      the first one instead of making a second entry.
--   2. A connected client can send more than three workouts a day. They can
--      open any day of the week now, so catching up on a few days at once is
--      normal. Links that nobody has connected keep the old limit of three.
--   3. "Change what I sent" replaces the workout instead of adding a second
--      one, so the coach reads one workout per day rather than two that
--      disagree. Only the client's own recent workout through this link, and
--      never one the coach has already corrected by hand.
--
-- Everything else — the checks, the ranges, the promotion into the athlete's
-- own tables — is exactly as it was.

CREATE OR REPLACE FUNCTION public.link_submit(p_token text, p_kind text, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_link   client_links%ROWTYPE;
  v_today  INT;
  v_cap    INT;
  v_date   DATE;
  v_unit   TEXT;
  v_f      NUMERIC;   -- factor to the athlete's stored unit
  v_w      NUMERIC;
  v_ex     JSONB;
  v_sess   UUID;
  v_setn   INT;
  v_exid   UUID;
  v_name   TEXT;
  v_set    JSONB;
  v_sets_done INT;
  v_id     UUID;
  v_key    TEXT;
  v_prev   client_submissions%ROWTYPE;
  v_repl   TEXT;
  v_fixed  BOOLEAN := false;   -- a correction, not a new workout
BEGIN
  IF p_token IS NULL OR length(p_token) < 20 OR length(p_token) > 128 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  IF p_kind NOT IN ('measurements','workout') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_kind');
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR length(p_payload::text) > 20000 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_payload');
  END IF;

  SELECT * INTO v_link FROM client_links WHERE token_hash = encode(digest(p_token, 'sha256'), 'hex') FOR UPDATE;
  IF NOT FOUND OR v_link.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'revoked');
  END IF;

  -- Already had this one: the connection dropped on the way back, not on the
  -- way in. Give them the first answer again rather than a second entry.
  v_key := nullif(p_payload->>'client_key', '');
  IF v_key IS NOT NULL AND length(v_key) <= 64 THEN
    SELECT * INTO v_prev FROM client_submissions
     WHERE link_id = v_link.id AND kind = p_kind
       AND payload->>'client_key' = v_key
       AND submitted_at > now() - interval '24 hours'
     ORDER BY submitted_at DESC LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('ok', true, 'id', v_prev.id, 'date', (v_prev.payload->>'date')::date, 'again', true);
    END IF;
  END IF;

  -- ── Are they changing a workout they already sent? ──
  -- Their own, through this link, in the last two days, and not one the coach
  -- has corrected by hand — the coach's fix is the one that stands.
  v_repl := nullif(p_payload->>'replaces', '');
  IF p_kind = 'workout' AND v_repl ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT * INTO v_prev FROM client_submissions
     WHERE id = v_repl::uuid
       AND link_id = v_link.id
       AND kind = 'workout'
       AND submitted_at > now() - interval '48 hours'
       AND NOT (payload ? 'edited_by_coach_at');
    IF FOUND THEN v_id := v_prev.id; v_fixed := true; END IF;
  END IF;

  -- A connected client opens any day of the week, so catching up on several
  -- days in one sitting is normal; a plain link still sends three a day.
  -- Correcting one they already sent doesn't count: it adds nothing.
  IF v_id IS NULL THEN
    v_cap := CASE
               WHEN p_kind = 'measurements' THEN 5
               WHEN v_link.connected_user_id IS NOT NULL OR v_link.athlete_id IS NOT NULL THEN 12
               ELSE 3
             END;
    SELECT count(*) INTO v_today FROM client_submissions
     WHERE link_id = v_link.id AND kind = p_kind AND submitted_at > now() - interval '24 hours';
    IF v_today >= v_cap THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'too_many');
    END IF;
  END IF;

  -- Date: today unless a valid past date (max 60 days back) is given.
  v_date := CURRENT_DATE;
  BEGIN
    IF p_payload ? 'date' THEN v_date := (p_payload->>'date')::date; END IF;
  EXCEPTION WHEN others THEN v_date := CURRENT_DATE; END;
  IF v_date > CURRENT_DATE OR v_date < CURRENT_DATE - 60 THEN v_date := CURRENT_DATE; END IF;

  -- ── Validate ranges ──
  IF p_kind = 'measurements' THEN
    v_unit := coalesce(p_payload->>'unit', 'imperial');
    IF v_unit NOT IN ('imperial','metric') THEN RETURN jsonb_build_object('ok', false, 'reason', 'bad_unit'); END IF;
    -- every numeric field, in the client's unit
    FOR v_name IN SELECT unnest(ARRAY['weight','chest','waist','hips','arm','thigh']) LOOP
      IF p_payload ? v_name AND (p_payload->>v_name) IS NOT NULL AND (p_payload->>v_name) <> '' THEN
        BEGIN v_w := (p_payload->>v_name)::numeric; EXCEPTION WHEN others THEN RETURN jsonb_build_object('ok', false, 'reason', 'bad_number', 'field', v_name); END;
        IF v_name = 'weight' THEN
          IF (v_unit = 'metric' AND (v_w < 20 OR v_w > 400)) OR (v_unit = 'imperial' AND (v_w < 44 OR v_w > 880)) THEN
            RETURN jsonb_build_object('ok', false, 'reason', 'out_of_range', 'field', v_name);
          END IF;
        ELSE
          IF (v_unit = 'metric' AND (v_w < 10 OR v_w > 250)) OR (v_unit = 'imperial' AND (v_w < 4 OR v_w > 100)) THEN
            RETURN jsonb_build_object('ok', false, 'reason', 'out_of_range', 'field', v_name);
          END IF;
        END IF;
      END IF;
    END LOOP;
  ELSE
    IF jsonb_typeof(p_payload->'exercises') <> 'array' OR jsonb_array_length(p_payload->'exercises') > 30 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'bad_payload');
    END IF;
  END IF;

  IF v_id IS NOT NULL THEN
    -- Their correction stands in place of the first one.
    UPDATE client_submissions
       SET payload = (p_payload - 'replaces') || jsonb_build_object('date', v_date, 'edited_by_client_at', to_jsonb(now())),
           submitted_at = now()
     WHERE id = v_id;
    -- An app athlete's promoted session for that day goes with it, so their
    -- own history matches what the coach now reads.
    IF v_link.athlete_id IS NOT NULL THEN
      DELETE FROM workout_sessions
       WHERE user_id = v_link.athlete_id AND source = 'link'
         AND started_at >= (v_date + time '00:00')::timestamptz
         AND started_at <  ((v_date + 1) + time '00:00')::timestamptz;
    END IF;
  ELSE
  INSERT INTO client_submissions (link_id, coach_id, athlete_id, manual_client_id, kind, payload, user_agent)
  VALUES (v_link.id, v_link.coach_id, v_link.athlete_id, v_link.manual_client_id, p_kind,
          p_payload || jsonb_build_object('date', v_date), left(current_setting('request.headers', true)::jsonb->>'user-agent', 200))
  RETURNING id INTO v_id;
  UPDATE client_links SET submissions = submissions + 1 WHERE id = v_link.id;
  END IF;

  -- ── Promote into the real tables for app clients ──
  IF v_link.athlete_id IS NOT NULL THEN
    IF p_kind = 'measurements' THEN
      -- Convert to the athlete's stored unit (body tables store whatever the athlete uses).
      SELECT coalesce(unit_system, 'imperial') INTO v_name FROM profiles WHERE id = v_link.athlete_id;
      v_f := CASE WHEN v_unit = v_name THEN 1
                  WHEN v_unit = 'metric' AND v_name = 'imperial' THEN 0.393700787   -- cm → in
                  ELSE 2.54 END;                                                    -- in → cm
      IF p_payload ? 'weight' AND (p_payload->>'weight') <> '' THEN
        v_w := (p_payload->>'weight')::numeric * (CASE WHEN v_unit = v_name THEN 1 WHEN v_unit = 'metric' THEN 2.20462262 ELSE 0.45359237 END);
        INSERT INTO body_weights (user_id, weight, logged_at, source) VALUES (v_link.athlete_id, round(v_w, 1), v_date, 'link')
        ON CONFLICT (user_id, logged_at) DO UPDATE SET weight = EXCLUDED.weight, source = 'link';
      END IF;
      IF (p_payload ? 'chest') OR (p_payload ? 'waist') OR (p_payload ? 'hips') OR (p_payload ? 'arm') OR (p_payload ? 'thigh') THEN
        INSERT INTO body_measurements (user_id, logged_at, chest, waist, hips, bicep_l, thigh_l, source)
        VALUES (v_link.athlete_id, v_date,
                nullif(p_payload->>'chest','')::numeric * v_f,
                nullif(p_payload->>'waist','')::numeric * v_f,
                nullif(p_payload->>'hips','')::numeric * v_f,
                nullif(p_payload->>'arm','')::numeric * v_f,
                nullif(p_payload->>'thigh','')::numeric * v_f, 'link')
        ON CONFLICT (user_id, logged_at) DO UPDATE SET
          chest = coalesce(EXCLUDED.chest, body_measurements.chest),
          waist = coalesce(EXCLUDED.waist, body_measurements.waist),
          hips = coalesce(EXCLUDED.hips, body_measurements.hips),
          bicep_l = coalesce(EXCLUDED.bicep_l, body_measurements.bicep_l),
          thigh_l = coalesce(EXCLUDED.thigh_l, body_measurements.thigh_l),
          source = 'link';
      END IF;
    ELSE
      -- One completed session with a set row per ticked set.
      INSERT INTO workout_sessions (user_id, workout_type, started_at, completed_at, notes, source)
      VALUES (v_link.athlete_id, left(coalesce(p_payload->>'type', 'Workout'), 40),
              (v_date + time '18:00')::timestamptz, (v_date + time '18:45')::timestamptz,
              jsonb_build_object('viaLink', true, 'note', left(coalesce(p_payload->>'note',''), 500))::text, 'link')
      RETURNING id INTO v_sess;
      FOR v_ex IN SELECT * FROM jsonb_array_elements(p_payload->'exercises') LOOP
        v_name := left(coalesce(v_ex->>'name',''), 80);
        v_sets_done := least(greatest(coalesce((v_ex->>'sets_done')::int, 0), 0), 20);
        IF v_name = '' OR v_sets_done = 0 THEN CONTINUE; END IF;
        SELECT id INTO v_exid FROM public_exercises WHERE lower(name) = lower(v_name) LIMIT 1;
        IF v_exid IS NULL THEN SELECT id INTO v_exid FROM user_exercises WHERE user_id = v_link.athlete_id AND lower(name) = lower(v_name) LIMIT 1; END IF;
        IF v_exid IS NULL THEN
          INSERT INTO user_exercises (user_id, name) VALUES (v_link.athlete_id, v_name) RETURNING id INTO v_exid;
        END IF;
        v_w := nullif(v_ex->>'weight_used','')::numeric;
        FOR v_setn IN 1..v_sets_done LOOP
          INSERT INTO workout_sets (session_id, exercise_id, set_number, weight, reps)
          VALUES (v_sess, v_exid, v_setn, v_w, nullif(regexp_replace(coalesce(v_ex->>'reps',''), '[^0-9].*$', ''), '')::int);
        END LOOP;
      END LOOP;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'date', v_date, 'replaced', v_fixed);
END;
$function$;
