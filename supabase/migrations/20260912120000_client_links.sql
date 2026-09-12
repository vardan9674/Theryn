-- ============================================================================
-- Shareable client links (decision 0006)
-- One durable private link per client. The client opens it in any browser,
-- no account, and submits body measurements or ticks off today's workout.
--
-- Security model
--   * The raw token lives only in the URL. The table stores its SHA-256.
--   * anon has NO table access. It can only call link_view / link_submit,
--     which take the token as their only selector.
--   * Both functions are SECURITY DEFINER with a pinned search_path.
--   * Per-link daily caps: 5 measurement submissions, 3 workout submissions.
--
-- Apply in the Supabase SQL editor until migration history is reconciled
-- (roadmap 0.3). Requires 20260909120000_coach_manual_clients.sql.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Tables ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_links (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  athlete_id       UUID REFERENCES profiles(id) ON DELETE CASCADE,
  manual_client_id UUID REFERENCES coach_manual_clients(id) ON DELETE CASCADE,
  token_hash       TEXT NOT NULL UNIQUE,
  label            TEXT,
  -- Which measurements the coach wants right now. NULL = all.
  requested        TEXT[] DEFAULT ARRAY['chest','waist','hips','arm','thigh'],
  opens            INT NOT NULL DEFAULT 0,
  last_opened_at   TIMESTAMPTZ,
  submissions      INT NOT NULL DEFAULT 0,
  revoked_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_links_one_target CHECK (
    (athlete_id IS NOT NULL AND manual_client_id IS NULL) OR
    (athlete_id IS NULL AND manual_client_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_client_links_coach ON client_links(coach_id);
CREATE UNIQUE INDEX IF NOT EXISTS client_links_active_athlete
  ON client_links(coach_id, athlete_id) WHERE revoked_at IS NULL AND athlete_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS client_links_active_manual
  ON client_links(coach_id, manual_client_id) WHERE revoked_at IS NULL AND manual_client_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS client_submissions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id          UUID NOT NULL REFERENCES client_links(id) ON DELETE CASCADE,
  coach_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  athlete_id       UUID REFERENCES profiles(id) ON DELETE CASCADE,
  manual_client_id UUID REFERENCES coach_manual_clients(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL CHECK (kind IN ('measurements','workout')),
  payload          JSONB NOT NULL,
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent       TEXT
);
CREATE INDEX IF NOT EXISTS idx_client_submissions_coach_time ON client_submissions(coach_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_submissions_link_kind_time ON client_submissions(link_id, kind, submitted_at DESC);

-- Where a measurement or session came from ('app' or 'link').
ALTER TABLE body_measurements ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'app';
ALTER TABLE body_weights      ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'app';
ALTER TABLE workout_sessions  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'app';

-- ── RLS: coach only. anon gets nothing. ─────────────────────────────────────
ALTER TABLE client_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Coach manages own links" ON client_links;
CREATE POLICY "Coach manages own links" ON client_links
  FOR ALL USING (coach_id = auth.uid()) WITH CHECK (coach_id = auth.uid());
DROP POLICY IF EXISTS "Coach reads own submissions" ON client_submissions;
CREATE POLICY "Coach reads own submissions" ON client_submissions
  FOR SELECT USING (coach_id = auth.uid());
DROP POLICY IF EXISTS "Coach deletes own submissions" ON client_submissions;
CREATE POLICY "Coach deletes own submissions" ON client_submissions
  FOR DELETE USING (coach_id = auth.uid());
REVOKE ALL ON client_links, client_submissions FROM anon;

-- ── Public functions ────────────────────────────────────────────────────────
-- What the page needs, and nothing more. Never returns ids or history.
CREATE OR REPLACE FUNCTION link_view(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_link      client_links%ROWTYPE;
  v_first     TEXT;
  v_coach     TEXT;
  v_unit      TEXT := 'imperial';
  v_plan      JSONB := NULL;
  v_routine   UUID;
  v_today_idx INT;
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
    -- Active routine as { "Mon": { type, exercises: [{ name, sets, reps, note }] }, ... }
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

  UPDATE client_links SET opens = opens + 1, last_opened_at = now() WHERE id = v_link.id;

  RETURN jsonb_build_object(
    'ok', true,
    'first_name', coalesce(v_first, ''),
    'coach_name', v_coach,
    'unit_system', v_unit,
    'requested', to_jsonb(coalesce(v_link.requested, ARRAY['chest','waist','hips','arm','thigh'])),
    'plan', v_plan
  );
END;
$$;

-- Records a submission and promotes it into the real tables for app clients.
CREATE OR REPLACE FUNCTION link_submit(p_token TEXT, p_kind TEXT, p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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

  v_cap := CASE p_kind WHEN 'measurements' THEN 5 ELSE 3 END;
  SELECT count(*) INTO v_today FROM client_submissions
   WHERE link_id = v_link.id AND kind = p_kind AND submitted_at > now() - interval '24 hours';
  IF v_today >= v_cap THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'too_many');
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

  INSERT INTO client_submissions (link_id, coach_id, athlete_id, manual_client_id, kind, payload, user_agent)
  VALUES (v_link.id, v_link.coach_id, v_link.athlete_id, v_link.manual_client_id, p_kind,
          p_payload || jsonb_build_object('date', v_date), left(current_setting('request.headers', true)::jsonb->>'user-agent', 200))
  RETURNING id INTO v_id;
  UPDATE client_links SET submissions = submissions + 1 WHERE id = v_link.id;

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

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'date', v_date);
END;
$$;

REVOKE ALL ON FUNCTION link_view(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION link_submit(TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION link_view(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION link_submit(TEXT, TEXT, JSONB) TO anon, authenticated;

-- ── Coach helpers (authenticated only) ──────────────────────────────────────
-- Create or rotate the link for a client. Returns the row; the caller hashes the token.
CREATE OR REPLACE FUNCTION client_link_upsert(p_athlete_id UUID, p_manual_client_id UUID, p_token_hash TEXT, p_label TEXT, p_requested TEXT[])
RETURNS client_links
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_row client_links%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_athlete_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM coach_athletes WHERE coach_id = auth.uid() AND athlete_id = p_athlete_id AND status = 'accepted') THEN
    RAISE EXCEPTION 'not your client';
  END IF;
  IF p_manual_client_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM coach_manual_clients WHERE id = p_manual_client_id AND coach_id = auth.uid()) THEN
    RAISE EXCEPTION 'not your client';
  END IF;
  UPDATE client_links SET revoked_at = now()
   WHERE coach_id = auth.uid() AND revoked_at IS NULL
     AND ((p_athlete_id IS NOT NULL AND athlete_id = p_athlete_id) OR (p_manual_client_id IS NOT NULL AND manual_client_id = p_manual_client_id));
  INSERT INTO client_links (coach_id, athlete_id, manual_client_id, token_hash, label, requested)
  VALUES (auth.uid(), p_athlete_id, p_manual_client_id, p_token_hash, p_label, coalesce(p_requested, ARRAY['chest','waist','hips','arm','thigh']))
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION client_link_upsert(UUID, UUID, TEXT, TEXT, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION client_link_upsert(UUID, UUID, TEXT, TEXT, TEXT[]) TO authenticated;
