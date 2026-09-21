-- ============================================================================
-- Theryn — growth loop (decision 0008)
--
--  1. events: a small first-party event log (no third-party analytics).
--     Written only by SECURITY DEFINER code: triggers for what the database
--     already knows (client added, link made, check-in sent, account claimed),
--     track_event() for what only the browser knows (link shared, active day,
--     coach signup). Read only through admin_growth_funnel().
--  2. A push to the coach when a client checks in through their link
--     (roadmap 1.12). Goes through the existing notify_outbox pipeline.
--  3. Claim (decision 0007 step 2): a name-only client saves their history to
--     an account, through their link (claim_link) or a verified email match
--     (claim_suggestions / claim_by_email). Their check-ins are copied into
--     the account's own tables; the coach's view does not change.
--
-- Every trigger body that is not the row's own job (events, pushes, copying)
-- is wrapped so a failure there can never block a client's check-in.
-- ============================================================================

-- ── 1. Events ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.events (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name             TEXT NOT NULL CHECK (name ~ '^[a-z][a-z0-9_]{1,40}$'),
  user_id          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  coach_id         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  manual_client_id UUID REFERENCES public.coach_manual_clients(id) ON DELETE SET NULL,
  props            JSONB NOT NULL DEFAULT '{}'::jsonb,
  day              DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.events IS
  'First-party product events (decision 0008). Written by triggers and track_event(); read via admin_growth_funnel().';

CREATE INDEX IF NOT EXISTS events_name_created_idx ON public.events (name, created_at);
CREATE INDEX IF NOT EXISTS events_user_day_idx     ON public.events (user_id, day);
-- Once per user ever / once per user per day.
CREATE UNIQUE INDEX IF NOT EXISTS events_coach_signup_once ON public.events (user_id) WHERE name = 'coach_signup';
CREATE UNIQUE INDEX IF NOT EXISTS events_active_day_once   ON public.events (user_id, day) WHERE name = 'active_day';

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;  -- no policies: nobody reads or writes it directly
REVOKE ALL ON public.events FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public._log_event(
  p_name TEXT, p_user UUID, p_coach UUID, p_manual UUID,
  p_props JSONB DEFAULT '{}'::jsonb, p_at TIMESTAMPTZ DEFAULT now()
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO events (name, user_id, coach_id, manual_client_id, props, day, created_at)
  VALUES (p_name, p_user, p_coach, p_manual, coalesce(p_props, '{}'::jsonb), (p_at AT TIME ZONE 'UTC')::date, p_at)
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN others THEN
  NULL;  -- tracking never breaks the action it describes
END;
$$;
REVOKE ALL ON FUNCTION public._log_event(TEXT, UUID, UUID, UUID, JSONB, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

-- Events only the browser knows about. Signed-in users only; a short allow-list.
CREATE OR REPLACE FUNCTION public.track_event(p_name TEXT, p_props JSONB DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  IF p_name NOT IN ('coach_signup', 'active_day', 'link_shared', 'signin_email_code') THEN RETURN; END IF;
  IF p_props IS NULL OR jsonb_typeof(p_props) <> 'object' OR length(p_props::text) > 1000 THEN p_props := '{}'::jsonb; END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_uid) THEN RETURN; END IF;
  -- A runaway client can't fill the table.
  IF (SELECT count(*) FROM events WHERE user_id = v_uid AND day = CURRENT_DATE) >= 200 THEN RETURN; END IF;
  PERFORM _log_event(p_name, v_uid,
                     CASE WHEN p_name IN ('coach_signup', 'link_shared') THEN v_uid END,
                     NULL, p_props);
END;
$$;
REVOKE ALL ON FUNCTION public.track_event(TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.track_event(TEXT, JSONB) TO authenticated;

-- client_added / link_created, straight from the rows.
CREATE OR REPLACE FUNCTION public.events_on_manual_client()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM _log_event('client_added', NEW.coach_id, NEW.coach_id, NEW.id, '{}'::jsonb, NEW.created_at);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_events_manual_client ON public.coach_manual_clients;
CREATE TRIGGER trg_events_manual_client AFTER INSERT ON public.coach_manual_clients
  FOR EACH ROW EXECUTE FUNCTION public.events_on_manual_client();

CREATE OR REPLACE FUNCTION public.events_on_client_link()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM _log_event('link_created', NEW.coach_id, NEW.coach_id, NEW.manual_client_id,
                     jsonb_build_object('app_client', NEW.athlete_id IS NOT NULL), NEW.created_at);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_events_client_link ON public.client_links;
CREATE TRIGGER trg_events_client_link AFTER INSERT ON public.client_links
  FOR EACH ROW EXECUTE FUNCTION public.events_on_client_link();

-- ── 3a. Copying a check-in into an account's own tables ────────────────────
-- Moved out of link_submit so the claim can reuse it. Same rules as before.
ALTER TABLE public.client_submissions ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMPTZ;
COMMENT ON COLUMN public.client_submissions.promoted_at IS
  'When this check-in was copied into the athlete''s own tables (workout_sessions / body_*). NULL = not copied.';

CREATE OR REPLACE FUNCTION public._promote_submission(p_id UUID, p_athlete UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_sub   client_submissions%ROWTYPE;
  v_p     JSONB;
  v_date  DATE;
  v_unit  TEXT;
  v_mine  TEXT;
  v_f     NUMERIC;
  v_w     NUMERIC;
  v_ex    JSONB;
  v_sess  UUID;
  v_setn  INT;
  v_exid  UUID;
  v_name  TEXT;
  v_sets_done INT;
BEGIN
  SELECT * INTO v_sub FROM client_submissions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR v_sub.promoted_at IS NOT NULL OR p_athlete IS NULL THEN RETURN; END IF;
  v_p := v_sub.payload;
  BEGIN v_date := (v_p->>'date')::date; EXCEPTION WHEN others THEN v_date := NULL; END;
  v_date := coalesce(v_date, (v_sub.submitted_at AT TIME ZONE 'UTC')::date);

  IF v_sub.kind = 'measurements' THEN
    v_unit := coalesce(v_p->>'unit', 'imperial');
    -- Convert to the athlete's stored unit (body tables store whatever the athlete uses).
    SELECT coalesce(unit_system, 'imperial') INTO v_mine FROM profiles WHERE id = p_athlete;
    v_mine := coalesce(v_mine, 'imperial');
    v_f := CASE WHEN v_unit = v_mine THEN 1
                WHEN v_unit = 'metric' AND v_mine = 'imperial' THEN 0.393700787   -- cm → in
                ELSE 2.54 END;                                                    -- in → cm
    IF v_p ? 'weight' AND (v_p->>'weight') <> '' THEN
      v_w := (v_p->>'weight')::numeric * (CASE WHEN v_unit = v_mine THEN 1 WHEN v_unit = 'metric' THEN 2.20462262 ELSE 0.45359237 END);
      INSERT INTO body_weights (user_id, weight, logged_at, source) VALUES (p_athlete, round(v_w, 1), v_date, 'link')
      ON CONFLICT (user_id, logged_at) DO UPDATE SET weight = EXCLUDED.weight, source = 'link';
    END IF;
    IF (v_p ? 'chest') OR (v_p ? 'waist') OR (v_p ? 'hips') OR (v_p ? 'arm') OR (v_p ? 'thigh') THEN
      INSERT INTO body_measurements (user_id, logged_at, chest, waist, hips, bicep_l, thigh_l, source)
      VALUES (p_athlete, v_date,
              nullif(v_p->>'chest','')::numeric * v_f,
              nullif(v_p->>'waist','')::numeric * v_f,
              nullif(v_p->>'hips','')::numeric * v_f,
              nullif(v_p->>'arm','')::numeric * v_f,
              nullif(v_p->>'thigh','')::numeric * v_f, 'link')
      ON CONFLICT (user_id, logged_at) DO UPDATE SET
        chest   = coalesce(EXCLUDED.chest, body_measurements.chest),
        waist   = coalesce(EXCLUDED.waist, body_measurements.waist),
        hips    = coalesce(EXCLUDED.hips, body_measurements.hips),
        bicep_l = coalesce(EXCLUDED.bicep_l, body_measurements.bicep_l),
        thigh_l = coalesce(EXCLUDED.thigh_l, body_measurements.thigh_l),
        source  = 'link';
    END IF;
  ELSE
    -- One completed session with a set row per ticked set.
    INSERT INTO workout_sessions (user_id, workout_type, started_at, completed_at, notes, source)
    VALUES (p_athlete, left(coalesce(v_p->>'type', 'Workout'), 40),
            (v_date + time '18:00')::timestamptz, (v_date + time '18:45')::timestamptz,
            jsonb_build_object('viaLink', true, 'note', left(coalesce(v_p->>'note',''), 500))::text, 'link')
    RETURNING id INTO v_sess;
    IF jsonb_typeof(v_p->'exercises') = 'array' THEN
      FOR v_ex IN SELECT * FROM jsonb_array_elements(v_p->'exercises') LOOP
        v_name := left(coalesce(v_ex->>'name',''), 80);
        v_sets_done := least(greatest(coalesce((v_ex->>'sets_done')::int, 0), 0), 20);
        IF v_name = '' OR v_sets_done = 0 THEN CONTINUE; END IF;
        v_exid := NULL;
        SELECT id INTO v_exid FROM public_exercises WHERE lower(name) = lower(v_name) LIMIT 1;
        IF v_exid IS NULL THEN SELECT id INTO v_exid FROM user_exercises WHERE user_id = p_athlete AND lower(name) = lower(v_name) LIMIT 1; END IF;
        IF v_exid IS NULL THEN
          INSERT INTO user_exercises (user_id, name) VALUES (p_athlete, v_name) RETURNING id INTO v_exid;
        END IF;
        v_w := nullif(v_ex->>'weight_used','')::numeric;
        FOR v_setn IN 1..v_sets_done LOOP
          INSERT INTO workout_sets (session_id, exercise_id, set_number, weight, reps)
          VALUES (v_sess, v_exid, v_setn, v_w, nullif(regexp_replace(coalesce(v_ex->>'reps',''), '[^0-9].*$', ''), '')::int);
        END LOOP;
      END LOOP;
    END IF;
  END IF;

  UPDATE client_submissions SET promoted_at = now() WHERE id = p_id;
END;
$$;
REVOKE ALL ON FUNCTION public._promote_submission(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- link_submit: unchanged except the promotion now happens in the
-- client_submissions trigger below (for app clients and claimed clients alike).
CREATE OR REPLACE FUNCTION public.link_submit(p_token text, p_kind text, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_link   client_links%ROWTYPE;
  v_today  INT;
  v_cap    INT;
  v_date   DATE;
  v_unit   TEXT;
  v_w      NUMERIC;
  v_name   TEXT;
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

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'date', v_date);
END;
$function$;

-- ── 2 + 3b. After a check-in: copy, count, tell the coach ──────────────────
CREATE OR REPLACE FUNCTION public.on_client_submission()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_target  UUID;
  v_first   TEXT;
  v_title   TEXT;
  v_body    TEXT;
  v_done    INT;
  v_planned INT;
  v_count   INT;
  v_by_coach BOOLEAN := coalesce(NEW.payload->>'logged_by', '') = 'coach' OR NEW.link_id IS NULL;
BEGIN
  -- Copy into the account: app clients (athlete_id) or claimed name-only clients.
  -- This part is the check-in's own job, so an error here rolls it back, the same as before.
  v_target := NEW.athlete_id;
  IF v_target IS NULL AND NEW.manual_client_id IS NOT NULL THEN
    SELECT linked_athlete_id INTO v_target FROM coach_manual_clients WHERE id = NEW.manual_client_id;
  END IF;
  IF v_target IS NOT NULL THEN
    PERFORM _promote_submission(NEW.id, v_target);
  END IF;

  PERFORM _log_event('checkin_submitted', v_target, NEW.coach_id, NEW.manual_client_id,
                     jsonb_build_object('kind', NEW.kind, 'via', CASE WHEN v_by_coach THEN 'coach' ELSE 'link' END),
                     NEW.submitted_at);

  -- The coach logging a workout themselves doesn't need a ping.
  IF v_by_coach THEN RETURN NEW; END IF;

  BEGIN
    IF NEW.manual_client_id IS NOT NULL THEN
      SELECT first_name INTO v_first FROM coach_manual_clients WHERE id = NEW.manual_client_id;
    ELSE
      SELECT split_part(coalesce(display_name, ''), ' ', 1) INTO v_first FROM profiles WHERE id = NEW.athlete_id;
    END IF;
    v_first := coalesce(nullif(trim(v_first), ''), 'A client');

    IF NEW.kind = 'workout' THEN
      SELECT coalesce(sum(least(greatest(coalesce((e->>'sets_done')::int, 0), 0), 20)), 0),
             coalesce(sum(coalesce((e->>'sets_planned')::int, 0)), 0)
        INTO v_done, v_planned
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.payload->'exercises') = 'array' THEN NEW.payload->'exercises' ELSE '[]'::jsonb END) e;
      v_title := v_first || ' finished a workout';
      v_body  := coalesce(nullif(NEW.payload->>'type', ''), 'Workout')
                 || CASE WHEN v_planned > 0 THEN ' · ' || v_done || ' of ' || v_planned || ' sets'
                         WHEN v_done > 0 THEN ' · ' || v_done || ' sets' ELSE '' END
                 || CASE WHEN coalesce(NEW.payload->>'note', '') <> ''
                         THEN ' · "' || left(NEW.payload->>'note', 60) || CASE WHEN length(NEW.payload->>'note') > 60 THEN '…' ELSE '' END || '"'
                         ELSE '' END;
    ELSE
      SELECT count(*) INTO v_count FROM unnest(ARRAY['weight','chest','waist','hips','arm','thigh']) f
       WHERE coalesce(NEW.payload->>f, '') <> '';
      v_title := v_first || ' sent measurements';
      v_body  := v_count || ' measurement' || CASE WHEN v_count = 1 THEN '' ELSE 's' END || '. Tap to see them.';
    END IF;

    PERFORM enqueue_notification(
      p_user_id      := NEW.coach_id,
      p_channel      := 'checkins',
      p_priority     := 'high',
      p_title        := v_title,
      p_body         := v_body,
      p_data         := jsonb_build_object('type', 'checkin', 'kind', NEW.kind, 'submission_id', NEW.id,
                                           'manual_client_id', NEW.manual_client_id, 'athlete_id', NEW.athlete_id),
      p_sound        := NULL,
      p_collapse_key := 'checkin-' || coalesce(NEW.manual_client_id, NEW.athlete_id)::text,
      p_dedup_key    := 'checkin-' || NEW.id::text
    );
  EXCEPTION WHEN others THEN
    NULL;  -- a failed ping never loses a check-in
  END;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_on_client_submission ON public.client_submissions;
CREATE TRIGGER trg_on_client_submission AFTER INSERT ON public.client_submissions
  FOR EACH ROW EXECUTE FUNCTION public.on_client_submission();

-- ── 3c. Claim ───────────────────────────────────────────────────────────────
-- Does the work for both doors. Callers have already proved who the client is.
CREATE OR REPLACE FUNCTION public._claim_manual(p_manual UUID, p_uid UUID, p_via TEXT)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_row      coach_manual_clients%ROWTYPE;
  v_coach    TEXT;
  v_units    TEXT;
  v_sub      RECORD;
  v_workouts INT := 0;
  v_measures INT := 0;
BEGIN
  SELECT * INTO v_row FROM coach_manual_clients WHERE id = p_manual FOR UPDATE;
  IF NOT FOUND OR v_row.archived_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'revoked');
  END IF;
  IF v_row.coach_id = p_uid THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'own_client');
  END IF;
  IF v_row.linked_athlete_id IS NOT NULL AND v_row.linked_athlete_id <> p_uid THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'claimed_by_other');
  END IF;

  -- The link page never creates a profile row; do it here, named as the coach knows them.
  SELECT coalesce(unit_system, 'imperial') INTO v_units FROM profiles WHERE id = v_row.coach_id;
  INSERT INTO profiles (id, display_name, unit_system)
  VALUES (p_uid, trim(v_row.first_name || ' ' || coalesce(v_row.last_name, '')), coalesce(v_row.unit_system, v_units, 'imperial'))
  ON CONFLICT (id) DO NOTHING;

  UPDATE coach_manual_clients SET linked_athlete_id = p_uid WHERE id = p_manual;

  FOR v_sub IN SELECT id, kind FROM client_submissions
                WHERE manual_client_id = p_manual AND promoted_at IS NULL
                ORDER BY submitted_at LOOP
    PERFORM _promote_submission(v_sub.id, p_uid);
    IF v_sub.kind = 'workout' THEN v_workouts := v_workouts + 1; ELSE v_measures := v_measures + 1; END IF;
  END LOOP;

  SELECT split_part(coalesce(display_name, 'Coach'), ' ', 1) INTO v_coach FROM profiles WHERE id = v_row.coach_id;

  PERFORM _log_event('client_claimed', p_uid, v_row.coach_id, p_manual,
                     jsonb_build_object('via', p_via, 'workouts', v_workouts, 'measurements', v_measures));

  BEGIN
    PERFORM enqueue_notification(
      p_user_id      := v_row.coach_id,
      p_channel      := 'checkins',
      p_priority     := 'medium',
      p_title        := v_row.first_name || ' made a Theryn account',
      p_body         := 'Their check-ins are saved to it. Nothing changes on your side.',
      p_data         := jsonb_build_object('type', 'claim', 'manual_client_id', p_manual),
      p_sound        := NULL,
      p_collapse_key := NULL,
      p_dedup_key    := 'claim-' || p_manual::text
    );
  EXCEPTION WHEN others THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'coach_name', coalesce(v_coach, 'Coach'),
                            'workouts', v_workouts, 'measurements', v_measures);
END;
$$;
REVOKE ALL ON FUNCTION public._claim_manual(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- Door 1: the link is the proof.
CREATE OR REPLACE FUNCTION public.claim_link(p_token TEXT)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_link client_links%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'signed_out'); END IF;
  IF p_token IS NULL OR length(p_token) < 20 OR length(p_token) > 128 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  SELECT * INTO v_link FROM client_links WHERE token_hash = encode(digest(p_token, 'sha256'), 'hex');
  IF NOT FOUND OR v_link.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'revoked');
  END IF;
  IF v_link.athlete_id IS NOT NULL THEN
    -- Already an app client: their history is in their account.
    RETURN CASE WHEN v_link.athlete_id = v_uid
                THEN jsonb_build_object('ok', true, 'workouts', 0, 'measurements', 0, 'already', true)
                ELSE jsonb_build_object('ok', false, 'reason', 'app_client') END;
  END IF;
  RETURN _claim_manual(v_link.manual_client_id, v_uid, 'link');
END;
$$;
REVOKE ALL ON FUNCTION public.claim_link(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_link(TEXT) TO authenticated;

-- Door 2: a verified email that matches the one the coach typed. A suggestion only.
CREATE OR REPLACE FUNCTION public.claim_suggestions()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_email TEXT;
  v_out   JSONB;
BEGIN
  IF v_uid IS NULL THEN RETURN '[]'::jsonb; END IF;
  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_uid AND email_confirmed_at IS NOT NULL;
  IF v_email IS NULL OR v_email = '' THEN RETURN '[]'::jsonb; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'manual_client_id', m.id,
           'first_name', m.first_name,
           'coach_name', split_part(coalesce(p.display_name, 'Coach'), ' ', 1),
           'workouts', (SELECT count(*) FROM client_submissions s WHERE s.manual_client_id = m.id AND s.kind = 'workout'),
           'measurements', (SELECT count(*) FROM client_submissions s WHERE s.manual_client_id = m.id AND s.kind = 'measurements')
         ) ORDER BY m.created_at), '[]'::jsonb)
    INTO v_out
    FROM coach_manual_clients m
    LEFT JOIN profiles p ON p.id = m.coach_id
   WHERE lower(m.email) = v_email
     AND m.archived_at IS NULL
     AND m.linked_athlete_id IS NULL
     AND m.coach_id <> v_uid;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_suggestions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_suggestions() TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_by_email(p_manual_client_id UUID)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_email TEXT;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'signed_out'); END IF;
  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_uid AND email_confirmed_at IS NOT NULL;
  IF v_email IS NULL OR NOT EXISTS (
       SELECT 1 FROM coach_manual_clients WHERE id = p_manual_client_id AND lower(email) = v_email) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_match');
  END IF;
  RETURN _claim_manual(p_manual_client_id, v_uid, 'email');
END;
$$;
REVOKE ALL ON FUNCTION public.claim_by_email(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_by_email(UUID) TO authenticated;

-- link_view: same as before plus `claimed`, so the page knows whether to offer saving.
CREATE OR REPLACE FUNCTION public.link_view(p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_link      client_links%ROWTYPE;
  v_first     TEXT;
  v_coach     TEXT;
  v_unit      TEXT := 'imperial';
  v_plan      JSONB := NULL;
  v_routine   UUID;
  v_done      JSONB := '[]'::jsonb;
  v_claimed   BOOLEAN := false;
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
    v_claimed := true;
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
    SELECT first_name, plan, linked_athlete_id IS NOT NULL INTO v_first, v_plan, v_claimed
      FROM coach_manual_clients WHERE id = v_link.manual_client_id;
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
    'done_dates', v_done,
    'claimed', coalesce(v_claimed, false)
  );
END;
$function$;

-- ── Reading it back ─────────────────────────────────────────────────────────
-- Funnel counts for the last p_days, plus week-2 return: of the coaches (and
-- claimed clients) who started 14+ days ago inside the window, how many were
-- active again on days 7–13 after starting.
CREATE OR REPLACE FUNCTION public.admin_growth_funnel(p_days INT DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_since  TIMESTAMPTZ := now() - make_interval(days => greatest(1, least(coalesce(p_days, 90), 730)));
  v_counts JSONB;
  v_week2  JSONB;
BEGIN
  PERFORM assert_admin();

  SELECT coalesce(jsonb_object_agg(name, n), '{}'::jsonb) INTO v_counts FROM (
    SELECT name, count(*) AS n FROM events WHERE created_at >= v_since GROUP BY name
  ) c;

  WITH starts AS (
    SELECT user_id, 'coach' AS who, day AS start_day FROM events
     WHERE name = 'coach_signup' AND user_id IS NOT NULL
    UNION ALL
    SELECT user_id, 'client', min(day) FROM events
     WHERE name = 'client_claimed' AND user_id IS NOT NULL GROUP BY user_id
  ), cohort AS (
    SELECT * FROM starts WHERE start_day >= v_since::date AND start_day <= CURRENT_DATE - 14
  ), back AS (
    SELECT c.user_id, c.who, EXISTS (
             SELECT 1 FROM events e
              WHERE e.user_id = c.user_id
                AND e.name IN ('active_day', 'checkin_submitted', 'link_shared', 'client_added', 'link_created')
                AND e.day BETWEEN c.start_day + 7 AND c.start_day + 13
           ) AS returned
      FROM cohort c
  )
  SELECT coalesce(jsonb_object_agg(who, jsonb_build_object(
           'cohort', n, 'returned', r, 'rate', CASE WHEN n > 0 THEN round(r::numeric / n, 3) END)), '{}'::jsonb)
    INTO v_week2
    FROM (SELECT who, count(*) AS n, count(*) FILTER (WHERE returned) AS r FROM back GROUP BY who) t;

  RETURN jsonb_build_object('since', v_since, 'counts', v_counts, 'week2_return', v_week2);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_growth_funnel(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_growth_funnel(INT) TO authenticated;  -- assert_admin() gates it

-- ── Backfill from what already happened ─────────────────────────────────────
-- Only rows that already exist; nothing about them changes.
INSERT INTO public.events (name, user_id, coach_id, props, day, created_at)
SELECT 'coach_signup', c.coach_id, c.coach_id, '{"backfill":true}'::jsonb,
       (coalesce(p.created_at, c.first_at) AT TIME ZONE 'UTC')::date, coalesce(p.created_at, c.first_at)
  FROM (SELECT coach_id, min(created_at) AS first_at FROM (
          SELECT coach_id, created_at FROM public.coach_manual_clients
          UNION ALL SELECT coach_id, created_at FROM public.client_links) x GROUP BY coach_id) c
  JOIN public.profiles p ON p.id = c.coach_id
ON CONFLICT DO NOTHING;

INSERT INTO public.events (name, user_id, coach_id, manual_client_id, props, day, created_at)
SELECT 'client_added', coach_id, coach_id, id, '{"backfill":true}'::jsonb, (created_at AT TIME ZONE 'UTC')::date, created_at
  FROM public.coach_manual_clients
 WHERE NOT EXISTS (SELECT 1 FROM public.events e WHERE e.name = 'client_added' AND e.manual_client_id = coach_manual_clients.id);

INSERT INTO public.events (name, user_id, coach_id, manual_client_id, props, day, created_at)
SELECT 'link_created', coach_id, coach_id, manual_client_id,
       jsonb_build_object('backfill', true, 'app_client', athlete_id IS NOT NULL), (created_at AT TIME ZONE 'UTC')::date, created_at
  FROM public.client_links l
 WHERE NOT EXISTS (SELECT 1 FROM public.events e WHERE e.name = 'link_created' AND e.coach_id = l.coach_id AND e.created_at = l.created_at);

INSERT INTO public.events (name, user_id, coach_id, manual_client_id, props, day, created_at)
SELECT 'checkin_submitted', athlete_id, coach_id, manual_client_id,
       jsonb_build_object('backfill', true, 'kind', kind,
                          'via', CASE WHEN link_id IS NULL OR payload->>'logged_by' = 'coach' THEN 'coach' ELSE 'link' END),
       (submitted_at AT TIME ZONE 'UTC')::date, submitted_at
  FROM public.client_submissions s
 WHERE NOT EXISTS (SELECT 1 FROM public.events e WHERE e.name = 'checkin_submitted' AND e.coach_id = s.coach_id AND e.created_at = s.submitted_at);

-- App clients' check-ins were already copied by the old link_submit; mark them so
-- nothing is ever copied twice.
UPDATE public.client_submissions SET promoted_at = submitted_at
 WHERE athlete_id IS NOT NULL AND promoted_at IS NULL;
