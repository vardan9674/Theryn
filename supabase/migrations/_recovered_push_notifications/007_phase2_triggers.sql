-- ============================================================================
-- Theryn — Phase 2: Server-Side Notifications
--
-- Replaces all local-scheduled notifications (reflection, routine reminder,
-- streak, coach-edit, athlete-finished, coach digest) with server-driven
-- equivalents that survive app-kill.
--
-- 1. compute_reflection_time(user_id)   — predictive 8pm replacement
-- 2. compute_reminder_time(user_id, day_index) — predictive 8am replacement
-- 3. compute_streak(user_id)            — consecutive workout days
-- 4. trg_workout_session_notify         — fires on session complete:
--      • reflection push → athlete
--      • streak reminder → athlete (if streak ≥ 3)
--      • athlete-finished → coach
-- 5. trg_routine_changed_notify         — fires on routine_days/exercises change:
--      • coach-edit push → athlete (only when coach edits, not athlete)
-- 6. pg_cron: routine-reminder-cron     — daily reminder at predicted start time
-- 7. pg_cron: coach-digest-cron         — coach briefing at 8 AM local time
-- ============================================================================


-- ── 1. PREDICTIVE REFLECTION TIME ───────────────────────────────────────────
-- Returns the UTC timestamp to send the post-workout reflection push.
-- Logic: median completed_at time-of-day (last 14 sessions) + 2.5 hours.
-- Clamps to [7 PM – 10 PM] local. Falls back to 8 PM if < 5 sessions.
CREATE OR REPLACE FUNCTION compute_reflection_time(p_user_id UUID)
RETURNS TIMESTAMPTZ AS $$
DECLARE
  v_tz           TEXT;
  v_today        DATE;
  v_session_count INT;
  v_median_secs  FLOAT;         -- seconds since midnight
  v_target_secs  FLOAT;
  v_target_time  TIME;
  v_send_at      TIMESTAMPTZ;
BEGIN
  SELECT COALESCE(timezone, 'UTC') INTO v_tz FROM profiles WHERE id = p_user_id;
  v_today := (now() AT TIME ZONE v_tz)::date;

  -- Count usable sessions
  SELECT COUNT(*) INTO v_session_count
  FROM (
    SELECT 1 FROM workout_sessions
    WHERE user_id = p_user_id AND completed_at IS NOT NULL
    ORDER BY completed_at DESC LIMIT 14
  ) sub;

  IF v_session_count >= 5 THEN
    -- Median seconds-since-midnight of last 14 completed sessions
    SELECT percentile_cont(0.5) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (completed_at AT TIME ZONE v_tz)::time)
    ) INTO v_median_secs
    FROM (
      SELECT completed_at FROM workout_sessions
      WHERE user_id = p_user_id AND completed_at IS NOT NULL
      ORDER BY completed_at DESC LIMIT 14
    ) sub;

    v_target_secs := v_median_secs + (2.5 * 3600);  -- +2.5 hours
    -- Clamp: before 7 PM → use 7 PM; after 10 PM → use 8 PM (safe fallback)
    IF v_target_secs < 19 * 3600 THEN v_target_secs := 19 * 3600; END IF;
    IF v_target_secs > 22 * 3600 THEN v_target_secs := 20 * 3600; END IF;
  ELSE
    v_target_secs := 20 * 3600;  -- cold-start: 8 PM
  END IF;

  v_target_time := (INTERVAL '1 second' * v_target_secs)::time;
  v_send_at     := (v_today + v_target_time) AT TIME ZONE v_tz;

  -- If the computed time is already past (late-night workout), add 15 min buffer
  IF v_send_at <= now() THEN
    v_send_at := now() + INTERVAL '15 minutes';
  END IF;

  RETURN v_send_at;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- ── 2. PREDICTIVE ROUTINE REMINDER TIME ─────────────────────────────────────
-- Returns UTC timestamp for the routine reminder on a given day_index (0=Mon).
-- Logic: median started_at for that weekday (last 8 occurrences) − 30 min.
-- Clamps to [6 AM – 9 AM] local. Falls back to 8 AM if < 3 sessions.
CREATE OR REPLACE FUNCTION compute_reminder_time(p_user_id UUID, p_day_index INT)
RETURNS TIMESTAMPTZ AS $$
DECLARE
  v_tz          TEXT;
  v_today       DATE;
  -- pg dow: 0=Sun,1=Mon,...,6=Sat  |  our day_index: 0=Mon,...,6=Sun
  v_pg_dow      INT;
  v_count       INT;
  v_median_secs FLOAT;
  v_target_secs FLOAT;
  v_send_at     TIMESTAMPTZ;
BEGIN
  SELECT COALESCE(timezone, 'UTC') INTO v_tz FROM profiles WHERE id = p_user_id;
  v_today  := (now() AT TIME ZONE v_tz)::date;
  -- Convert our 0=Mon index to pg's 1=Mon dow
  v_pg_dow := CASE p_day_index WHEN 6 THEN 0 ELSE p_day_index + 1 END;

  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT 1 FROM workout_sessions
    WHERE user_id = p_user_id
      AND started_at IS NOT NULL
      AND EXTRACT(DOW FROM started_at AT TIME ZONE v_tz) = v_pg_dow
    ORDER BY started_at DESC LIMIT 8
  ) sub;

  IF v_count >= 3 THEN
    SELECT percentile_cont(0.5) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (started_at AT TIME ZONE v_tz)::time)
    ) INTO v_median_secs
    FROM (
      SELECT started_at FROM workout_sessions
      WHERE user_id = p_user_id
        AND started_at IS NOT NULL
        AND EXTRACT(DOW FROM started_at AT TIME ZONE v_tz) = v_pg_dow
      ORDER BY started_at DESC LIMIT 8
    ) sub;

    v_target_secs := v_median_secs - 1800;  -- 30 min before median start
    -- Clamp to [6 AM, 9 AM]
    IF v_target_secs < 6 * 3600 THEN v_target_secs := 6 * 3600; END IF;
    IF v_target_secs > 9 * 3600 THEN v_target_secs := 9 * 3600; END IF;
  ELSE
    v_target_secs := 8 * 3600;  -- cold-start: 8 AM
  END IF;

  v_send_at := (v_today + (INTERVAL '1 second' * v_target_secs)) AT TIME ZONE v_tz;
  RETURN v_send_at;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- ── 3. STREAK CALCULATOR ────────────────────────────────────────────────────
-- Returns the number of consecutive days (ending today) with at least one
-- completed workout session, in the user's local timezone.
CREATE OR REPLACE FUNCTION compute_streak(p_user_id UUID)
RETURNS INT AS $$
DECLARE
  v_tz     TEXT;
  v_streak INT := 0;
  v_date   DATE;
  v_exists BOOLEAN;
BEGIN
  SELECT COALESCE(timezone, 'UTC') INTO v_tz FROM profiles WHERE id = p_user_id;
  v_date := (now() AT TIME ZONE v_tz)::date;

  LOOP
    SELECT EXISTS(
      SELECT 1 FROM workout_sessions
      WHERE user_id    = p_user_id
        AND completed_at IS NOT NULL
        AND (completed_at AT TIME ZONE v_tz)::date = v_date
    ) INTO v_exists;

    EXIT WHEN NOT v_exists;
    v_streak := v_streak + 1;
    v_date   := v_date - 1;
  END LOOP;

  RETURN v_streak;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- ── 4. WORKOUT SESSION COMPLETE TRIGGER ─────────────────────────────────────

CREATE OR REPLACE FUNCTION notify_on_workout_complete()
RETURNS TRIGGER AS $$
DECLARE
  v_athlete_id  UUID := NEW.user_id;
  v_tz          TEXT;
  v_today       DATE;
  v_coach_id    UUID;
  v_streak      INT;
  v_workout_type TEXT := COALESCE(NEW.workout_type, 'workout');
  v_athlete_name TEXT;
  -- Reflection copy pools
  v_titles      TEXT[] := ARRAY[
    'Well Done', 'Progress Noted', 'Consistency Shows',
    'Reflect & Reset', 'Built Over Time', 'Quiet Progress',
    'Effort Acknowledged', 'Solid Execution'
  ];
  v_bodies      TEXT[] := ARRAY[
    'You showed up and executed. That compounds.',
    'Another session logged. The work is adding up.',
    'Discipline looks like today. Recover well.',
    'Consistent effort over time. That''s the standard.',
    'Sessions like this are what progress is built on.',
    'You did the work. Let that sit for a moment.'
  ];
  -- Streak copy pools
  v_s_titles    TEXT[] := ARRAY[
    'Keep the Rhythm', 'Don''t Break the Chain',
    'Protect the Streak', 'Hold the Standard', 'Stay Consistent'
  ];
  v_s_bodies    TEXT[] := ARRAY[
    'You''ve built a {N}-day streak. Show up again tomorrow.',
    '{N} days straight. Don''t let it slip now.',
    'A {N}-day streak means something. Protect it.'
  ];
  -- Coach copy pools
  v_c_titles    TEXT[] := ARRAY[
    '{Name} Put In The Work',
    '{Name} Completed A Session',
    'Athlete Update — {Name}'
  ];
  v_c_bodies    TEXT[] := ARRAY[
    'They just finished a {Type} session.',
    'Another {Type} session logged.',
    '{Type} session complete for today.'
  ];
BEGIN
  -- Only fire when completed_at transitions from NULL → value
  IF NEW.completed_at IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.completed_at IS NOT NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(timezone, 'UTC') INTO v_tz FROM profiles WHERE id = v_athlete_id;
  v_today := (now() AT TIME ZONE v_tz)::date;

  -- ── Reflection push (athlete) ───────────────────────────────────────────
  PERFORM enqueue_notification(
    p_user_id   => v_athlete_id,
    p_channel   => 'reminders',
    p_priority  => 'medium',
    p_title     => v_titles[1 + floor(random() * array_length(v_titles, 1))::int % array_length(v_titles, 1)],
    p_body      => v_bodies[1 + floor(random() * array_length(v_bodies, 1))::int % array_length(v_bodies, 1)],
    p_data      => jsonb_build_object('type', 'reflection', 'session_id', NEW.id),
    p_sound     => 'tone_reminder',
    p_dedup_key => 'reflection:' || v_athlete_id || ':' || v_today,
    p_send_at   => compute_reflection_time(v_athlete_id)
  );

  -- ── Streak reminder (athlete, only if streak ≥ 3) ──────────────────────
  v_streak := compute_streak(v_athlete_id);
  IF v_streak >= 3 THEN
    PERFORM enqueue_notification(
      p_user_id   => v_athlete_id,
      p_channel   => 'streaks',
      p_priority  => 'low',
      p_title     => v_s_titles[1 + floor(random() * array_length(v_s_titles, 1))::int % array_length(v_s_titles, 1)],
      p_body      => replace(
                       v_s_bodies[1 + floor(random() * array_length(v_s_bodies, 1))::int % array_length(v_s_bodies, 1)],
                       '{N}', v_streak::text
                     ),
      p_data      => jsonb_build_object('type', 'streak_protect', 'streak', v_streak),
      p_sound     => 'pulse_streak',
      p_dedup_key => 'streak_protect:' || v_athlete_id || ':' || v_today,
      -- Fire 36 hours from now (risk window, not arbitrary +48h)
      p_send_at   => now() + INTERVAL '36 hours'
    );
  END IF;

  -- ── Athlete-finished push (coach) ───────────────────────────────────────
  SELECT coach_id INTO v_coach_id
  FROM coach_athletes
  WHERE athlete_id = v_athlete_id AND status = 'accepted'
  LIMIT 1;

  IF v_coach_id IS NOT NULL THEN
    SELECT COALESCE(display_name, 'Your athlete') INTO v_athlete_name
    FROM profiles WHERE id = v_athlete_id;

    PERFORM enqueue_notification(
      p_user_id    => v_coach_id,
      p_channel    => 'coach-alerts',
      p_priority   => 'high',
      p_title      => replace(
                        v_c_titles[1 + floor(random() * array_length(v_c_titles, 1))::int % array_length(v_c_titles, 1)],
                        '{Name}', v_athlete_name
                      ),
      p_body       => replace(
                        v_c_bodies[1 + floor(random() * array_length(v_c_bodies, 1))::int % array_length(v_c_bodies, 1)],
                        '{Type}', v_workout_type
                      ),
      p_data       => jsonb_build_object(
                        'type', 'athlete_finished',
                        'athlete_id', v_athlete_id,
                        'athlete_name', v_athlete_name,
                        'workout_type', v_workout_type
                      ),
      p_sound      => 'bell_coach',
      p_collapse_key => 'athlete_finished:' || v_coach_id,
      -- No dedup per athlete per day — coaches want to know each session
      p_send_at    => now()
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fire on INSERT (app logs session with completed_at already set) and
-- on UPDATE (app updates completed_at after the fact).
CREATE TRIGGER trg_workout_session_notify
  AFTER INSERT OR UPDATE OF completed_at ON workout_sessions
  FOR EACH ROW EXECUTE FUNCTION notify_on_workout_complete();


-- ── 5. ROUTINE CHANGED TRIGGER ───────────────────────────────────────────────
-- Fires when a coach edits an athlete's routine days or exercises.
-- Uses JWT sub claim to identify the editor; skips if athlete edits own routine.

CREATE OR REPLACE FUNCTION notify_on_routine_changed()
RETURNS TRIGGER AS $$
DECLARE
  v_athlete_id UUID;
  v_editor_id  UUID;
  v_tz         TEXT;
  v_titles     TEXT[] := ARRAY[
    'Routine Updated', 'Coach Adjustment', 'Plan Refined',
    'Training Update', 'New Direction', 'Programming Shift'
  ];
  v_bodies     TEXT[] := ARRAY[
    'Your coach refined your program. Review the changes.',
    'Adjustments made to your training. Execute with intent.',
    'Your routine has been updated. See what''s changed.',
    'New training direction from your coach. Stay focused.',
    'Your program has been optimized. Time to execute.'
  ];
BEGIN
  -- Find the athlete who owns the routine this day/exercise belongs to
  IF TG_TABLE_NAME = 'routine_days' THEN
    SELECT r.user_id INTO v_athlete_id
    FROM routines r WHERE r.id = COALESCE(NEW.routine_id, OLD.routine_id);
  ELSE -- routine_exercises
    SELECT r.user_id INTO v_athlete_id
    FROM routine_days rd
    JOIN routines r ON r.id = rd.routine_id
    WHERE rd.id = COALESCE(NEW.routine_day_id, OLD.routine_day_id);
  END IF;

  IF v_athlete_id IS NULL THEN RETURN NEW; END IF;

  -- Identify who made the edit via JWT claim (available in PostgREST context)
  BEGIN
    v_editor_id := (current_setting('request.jwt.claims', true)::json->>'sub')::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;  -- no JWT context (e.g., direct DB access) — skip
  END;

  -- Skip if the athlete is editing their own routine
  IF v_editor_id = v_athlete_id THEN RETURN NEW; END IF;

  SELECT COALESCE(timezone, 'UTC') INTO v_tz FROM profiles WHERE id = v_athlete_id;

  PERFORM enqueue_notification(
    p_user_id   => v_athlete_id,
    p_channel   => 'routine-update',
    p_priority  => 'high',
    p_title     => v_titles[1 + floor(random() * array_length(v_titles, 1))::int % array_length(v_titles, 1)],
    p_body      => v_bodies[1 + floor(random() * array_length(v_bodies, 1))::int % array_length(v_bodies, 1)],
    p_data      => jsonb_build_object('type', 'routine_updated'),
    p_sound     => 'tone_reminder',
    -- One push per athlete per day regardless of how many edits the coach makes
    p_dedup_key => 'routine_changed:' || v_athlete_id || ':' || (now() AT TIME ZONE v_tz)::date
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_routine_day_notify
  AFTER INSERT OR UPDATE OR DELETE ON routine_days
  FOR EACH ROW EXECUTE FUNCTION notify_on_routine_changed();

CREATE TRIGGER trg_routine_exercise_notify
  AFTER INSERT OR UPDATE OR DELETE ON routine_exercises
  FOR EACH ROW EXECUTE FUNCTION notify_on_routine_changed();


-- ── 6. DAILY ROUTINE REMINDER CRON ─────────────────────────────────────────
-- Runs every minute. For each user whose predicted reminder time falls within
-- the current minute, in their local timezone, enqueue a routine reminder.
-- Skips users who already started a session today.

CREATE OR REPLACE FUNCTION send_routine_reminders()
RETURNS void AS $$
DECLARE
  rec RECORD;
  v_today DATE;
  v_remind_at TIMESTAMPTZ;
  v_titles TEXT[] := ARRAY[
    'Start Strong', 'Stay Consistent', 'Put in the Work',
    'Discipline Wins', 'Make It Count', 'Execution Over Excuses',
    'Refined Strength', 'Earned, Not Given'
  ];
  v_bodies TEXT[] := ARRAY[
    'Your {Type} session is ready. Show up and execute.',
    'It''s {Type} day. Controlled reps, full intent.',
    '{Type} day is here. Keep the rhythm going.',
    'Today''s {Type} session matters. Give it your full attention.',
    'Your {Type} workout awaits. Approach it with intent.'
  ];
BEGIN
  FOR rec IN
    SELECT DISTINCT ON (p.id)
      p.id              AS user_id,
      p.timezone        AS tz,
      rd.workout_type   AS wtype,
      rd.day_index
    FROM profiles p
    JOIN routines ro    ON ro.user_id = p.id AND ro.is_active = true
    JOIN routine_days rd ON rd.routine_id = ro.id
    WHERE
      -- Today (in user's local tz) matches this day_index
      -- day_index: 0=Mon,1=Tue,..6=Sun; pg DOW: 0=Sun,1=Mon..6=Sat
      rd.day_index = CASE
        WHEN EXTRACT(DOW FROM now() AT TIME ZONE COALESCE(p.timezone,'UTC')) = 0 THEN 6
        ELSE EXTRACT(DOW FROM now() AT TIME ZONE COALESCE(p.timezone,'UTC'))::int - 1
      END
      -- Not a rest day
      AND rd.workout_type NOT IN ('Rest', 'rest', 'OFF', 'off')
      -- Haven't already started a session today in their tz
      AND NOT EXISTS (
        SELECT 1 FROM workout_sessions ws
        WHERE ws.user_id = p.id
          AND (ws.started_at AT TIME ZONE COALESCE(p.timezone,'UTC'))::date
              = (now() AT TIME ZONE COALESCE(p.timezone,'UTC'))::date
      )
  LOOP
    v_remind_at := compute_reminder_time(rec.user_id, rec.day_index);
    v_today     := (now() AT TIME ZONE COALESCE(rec.tz, 'UTC'))::date;

    -- Only fire if the reminder window falls within this minute
    IF v_remind_at >= date_trunc('minute', now())
    AND v_remind_at <  date_trunc('minute', now()) + INTERVAL '1 minute' THEN
      PERFORM enqueue_notification(
        p_user_id   => rec.user_id,
        p_channel   => 'reminders',
        p_priority  => 'medium',
        p_title     => v_titles[1 + floor(random() * array_length(v_titles,1))::int % array_length(v_titles,1)],
        p_body      => replace(
                         v_bodies[1 + floor(random() * array_length(v_bodies,1))::int % array_length(v_bodies,1)],
                         '{Type}', rec.wtype
                       ),
        p_data      => jsonb_build_object('type', 'routine_reminder', 'workout_type', rec.wtype),
        p_sound     => 'tone_reminder',
        p_dedup_key => 'routine_reminder:' || rec.user_id || ':' || v_today
      );
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── 7. COACH DAILY DIGEST CRON ───────────────────────────────────────────────
-- Runs every minute. Fires for coaches where local time is 08:00.
-- Computes a signal summary across all accepted athletes and sends one push.

CREATE OR REPLACE FUNCTION send_coach_digests()
RETURNS void AS $$
DECLARE
  coach_rec   RECORD;
  v_local_hr  INT;
  v_local_min INT;
  v_today     DATE;
  v_inactive  INT;
  v_active    INT;
  v_total     INT;
  v_title     TEXT;
  v_body      TEXT;
BEGIN
  FOR coach_rec IN
    SELECT id, COALESCE(timezone, 'UTC') AS tz
    FROM profiles
    WHERE push_enabled = true
      -- Only coaches (have at least one accepted athlete)
      AND EXISTS (
        SELECT 1 FROM coach_athletes
        WHERE coach_id = profiles.id AND status = 'accepted'
      )
  LOOP
    v_local_hr  := EXTRACT(HOUR   FROM now() AT TIME ZONE coach_rec.tz);
    v_local_min := EXTRACT(MINUTE FROM now() AT TIME ZONE coach_rec.tz);
    v_today     := (now() AT TIME ZONE coach_rec.tz)::date;

    CONTINUE WHEN v_local_hr  <> 8;
    CONTINUE WHEN v_local_min <> 0;

    -- Count athletes by activity in last 7 days
    SELECT
      COUNT(*) FILTER (WHERE last_session IS NULL OR last_session < now() - INTERVAL '5 days'),
      COUNT(*) FILTER (WHERE last_session >= now() - INTERVAL '5 days'),
      COUNT(*)
    INTO v_inactive, v_active, v_total
    FROM (
      SELECT ca.athlete_id,
             MAX(ws.completed_at) AS last_session
      FROM coach_athletes ca
      LEFT JOIN workout_sessions ws ON ws.user_id = ca.athlete_id
                                    AND ws.completed_at IS NOT NULL
      WHERE ca.coach_id = coach_rec.id AND ca.status = 'accepted'
      GROUP BY ca.athlete_id
    ) sub;

    CONTINUE WHEN v_total = 0;

    -- Build copy based on signals
    IF v_inactive > 0 THEN
      v_title := v_inactive || ' athlete' || CASE WHEN v_inactive > 1 THEN 's need' ELSE ' needs' END || ' attention';
      v_body  := v_inactive || ' of your athletes haven''t trained in 5+ days.';
    ELSIF v_active = v_total THEN
      v_title := 'Coach Briefing';
      v_body  := 'All ' || v_total || ' athletes are on track this week.';
    ELSE
      v_title := 'Coach Briefing';
      v_body  := v_active || ' of ' || v_total || ' athletes trained this week.';
    END IF;

    PERFORM enqueue_notification(
      p_user_id   => coach_rec.id,
      p_channel   => 'coach-alerts',
      p_priority  => CASE WHEN v_inactive > 0 THEN 'high' ELSE 'medium' END,
      p_title     => v_title,
      p_body      => v_body,
      p_data      => jsonb_build_object('type', 'coach_digest', 'inactive', v_inactive, 'active', v_active),
      p_sound     => 'bell_coach',
      p_dedup_key => 'coach_digest:' || coach_rec.id || ':' || v_today
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── 8. WIRE THE TWO NEW CRON JOBS ───────────────────────────────────────────
-- Both call SQL functions directly (no HTTP), running inside the DB.

SELECT cron.unschedule('routine-reminder-cron')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'routine-reminder-cron');

SELECT cron.schedule(
  'routine-reminder-cron',
  '* * * * *',
  $$ SELECT send_routine_reminders(); $$
);

SELECT cron.unschedule('coach-digest-cron')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'coach-digest-cron');

SELECT cron.schedule(
  'coach-digest-cron',
  '* * * * *',
  $$ SELECT send_coach_digests(); $$
);
