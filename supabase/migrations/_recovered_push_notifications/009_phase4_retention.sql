-- ============================================================================
-- Theryn — Phase 4: Retention Push Layer
--   • Streak milestones (7 / 14 / 30 / 60 / 100 days)
--   • Coach: athlete inactive 5 d / 14 d alerts
--   • Athlete comeback push (7 d / 14 d / 30 d — variable 50% send)
--   • Payment due (T-3 warning) + overdue
--   • Sunday plan preview     (athlete, Sun 7 PM local)
--   • Mid-week pulse           (athlete, Wed 7 PM local, only if ≥ 2 sessions that week)
--   • Weekly athlete recap     (athlete, Sun 6 PM local)
--   • Coach Friday wins        (coach,   Fri 5 PM local)
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. STREAK MILESTONE TRIGGER
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_on_streak_milestone()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id  UUID;
  v_streak   INT;
  v_today    DATE;
  v_title    TEXT;
  v_body     TEXT;
BEGIN
  -- Only act on completed sessions
  IF NEW.completed_at IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.completed_at IS NOT NULL THEN RETURN NEW; END IF;

  v_user_id := NEW.user_id;
  v_streak  := compute_streak(v_user_id);

  -- Only milestone values
  IF v_streak NOT IN (7, 14, 30, 60, 100) THEN RETURN NEW; END IF;

  v_today := (now() AT TIME ZONE COALESCE(
    (SELECT timezone FROM profiles WHERE id = v_user_id), 'UTC'
  ))::date;

  -- Copy per (milestone, user, calendar date) — covers double-session same day
  -- and won't re-fire for 24h. If they rebuild the streak months later, that's
  -- a new date so the push fires again (intentional — it's a fresh achievement).
  v_title := CASE v_streak
    WHEN   7 THEN '🔥 7-Day Streak!'
    WHEN  14 THEN '🔥 2-Week Streak!'
    WHEN  30 THEN '🏆 30-Day Streak!'
    WHEN  60 THEN '💎 60-Day Streak!'
    WHEN 100 THEN '🌟 100-Day Streak!'
  END;

  v_body := CASE v_streak
    WHEN   7 THEN 'One week straight. You''re building something real.'
    WHEN  14 THEN 'Two weeks in. Habits are forming.'
    WHEN  30 THEN 'A whole month. That''s rare — and earned.'
    WHEN  60 THEN 'Two months of consistency. You''re an outlier.'
    WHEN 100 THEN '100 days. This is who you are now.'
  END;

  PERFORM enqueue_notification(
    p_user_id     := v_user_id,
    p_channel     := 'milestones',
    p_priority    := 'high',
    p_title       := v_title,
    p_body        := v_body,
    p_data        := jsonb_build_object('type', 'streak_milestone', 'streak', v_streak),
    p_sound       := 'flourish_milestone',
    p_collapse_key:= NULL,
    p_dedup_key   := 'streak-' || v_streak::text || '-' || v_user_id::text || '-' || v_today::text
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_streak_milestone ON workout_sessions;
CREATE TRIGGER trg_notify_streak_milestone
  AFTER INSERT OR UPDATE OF completed_at ON workout_sessions
  FOR EACH ROW EXECUTE FUNCTION notify_on_streak_milestone();


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. DAILY RETENTION CRON FUNCTION
--    Runs once a day (cron job below). Handles inactivity alerts, comeback, and
--    payment reminders in a single pass.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION send_daily_retention()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r           RECORD;
  v_today_utc DATE := CURRENT_DATE;
  v_last_session DATE;
  v_days_since   INT;
  -- Payment vars
  v_last_paid    DATE;
  v_interval     INTERVAL;
  v_next_due     DATE;
  v_days_until   INT;
  v_athlete_name TEXT;
BEGIN

  -- ── 2a. Athlete inactivity: coach gets alerted at 5d and 14d ─────────────
  -- ── 2b. Athlete comeback:   athlete gets re-engagement push  ─────────────
  FOR r IN
    SELECT
      ca.athlete_id,
      ca.coach_id,
      p.timezone  AS tz
    FROM coach_athletes ca
    JOIN profiles      p  ON p.id = ca.athlete_id
    WHERE ca.status = 'accepted'
  LOOP
    SELECT MAX(ws.started_at::date)
      INTO v_last_session
      FROM workout_sessions ws
     WHERE ws.user_id     = r.athlete_id
       AND ws.completed_at IS NOT NULL;

    v_days_since := v_today_utc - COALESCE(v_last_session, v_today_utc - 999);

    -- ── Coach alert: athlete inactive 5 days ──────────────────────────────
    IF v_days_since = 5 THEN
      v_athlete_name := get_display_name(r.athlete_id);
      PERFORM enqueue_notification(
        p_user_id     := r.coach_id,
        p_channel     := 'coach-alerts',
        p_priority    := 'high',
        p_title       := v_athlete_name || ' hasn''t trained in 5 days',
        p_body        := 'Might be worth checking in.',
        p_data        := jsonb_build_object(
                           'type',       'athlete_inactive',
                           'athlete_id', r.athlete_id,
                           'days',       5
                         ),
        p_sound       := 'bell_coach',
        p_collapse_key:= 'inactive-' || r.athlete_id::text,
        p_dedup_key   := 'inactive-5-coach-' || r.coach_id::text || '-' || r.athlete_id::text
                         || '-' || v_today_utc::text
      );
    END IF;

    -- ── Coach alert: athlete inactive 14 days ─────────────────────────────
    IF v_days_since = 14 THEN
      v_athlete_name := get_display_name(r.athlete_id);
      PERFORM enqueue_notification(
        p_user_id     := r.coach_id,
        p_channel     := 'coach-alerts',
        p_priority    := 'high',
        p_title       := v_athlete_name || ' — two weeks off',
        p_body        := 'They may need a nudge or a check-in.',
        p_data        := jsonb_build_object(
                           'type',       'athlete_inactive',
                           'athlete_id', r.athlete_id,
                           'days',       14
                         ),
        p_sound       := 'bell_coach',
        p_collapse_key:= 'inactive-' || r.athlete_id::text,
        p_dedup_key   := 'inactive-14-coach-' || r.coach_id::text || '-' || r.athlete_id::text
                         || '-' || v_today_utc::text
      );
    END IF;

    -- ── Athlete comeback: 7 / 14 / 30 d (variable — 50% skip to avoid robotic feel) ──
    IF v_days_since IN (7, 14, 30)
       AND (random() < 0.5)  -- 50% of the time we stay quiet
    THEN
      DECLARE
        v_cb_title TEXT;
        v_cb_body  TEXT;
      BEGIN
        v_cb_title := CASE v_days_since
          WHEN  7 THEN 'Still here for you'
          WHEN 14 THEN 'Ready when you are'
          WHEN 30 THEN 'It''s been a while'
        END;
        v_cb_body := CASE v_days_since
          WHEN  7 THEN 'It''s been a week. Even a short session counts.'
          WHEN 14 THEN 'Two weeks off. No pressure — just pick one exercise and go.'
          WHEN 30 THEN 'A month since your last session. Your coach is still here.'
        END;

        PERFORM enqueue_notification(
          p_user_id     := r.athlete_id,
          p_channel     := 'winback',
          p_priority    := 'low',
          p_title       := v_cb_title,
          p_body        := v_cb_body,
          p_data        := jsonb_build_object(
                             'type', 'comeback',
                             'days', v_days_since
                           ),
          p_sound       := 'pulse_streak',
          p_collapse_key:= 'comeback-' || r.athlete_id::text,
          p_dedup_key   := 'comeback-' || v_days_since::text || '-' || r.athlete_id::text
                           || '-' || v_today_utc::text
        );
      END;
    END IF;
  END LOOP;

  -- ── 2c. Payment reminders ─────────────────────────────────────────────────
  -- Warning at T-3 days, overdue on the due date itself (and daily after).
  FOR r IN
    SELECT f.coach_id, f.athlete_id, f.amount, f.currency, f.cadence, f.start_date
      FROM coach_client_fees f
     WHERE f.active = true
  LOOP
    v_interval := CASE r.cadence
      WHEN 'weekly'    THEN INTERVAL '7 days'
      WHEN 'monthly'   THEN INTERVAL '1 month'
      WHEN 'quarterly' THEN INTERVAL '3 months'
      WHEN 'yearly'    THEN INTERVAL '1 year'
    END;

    -- Walk forward from start_date to find the next upcoming due date
    v_next_due := r.start_date;
    WHILE v_next_due <= v_today_utc LOOP
      v_next_due := v_next_due + v_interval;
    END LOOP;
    -- v_next_due is now the next due date strictly in the future.
    -- The "current period" due date = v_next_due - interval.
    -- (This is the date payment was due for the current cycle.)

    -- Check if already paid for this period
    SELECT MAX(received_date)
      INTO v_last_paid
      FROM coach_payments
     WHERE coach_id  = r.coach_id
       AND athlete_id = r.athlete_id;

    IF v_last_paid IS NOT NULL AND v_last_paid >= (v_next_due - v_interval) THEN
      CONTINUE; -- Paid for current period
    END IF;

    v_days_until := v_next_due - v_today_utc;
    v_athlete_name := get_display_name(r.athlete_id);

    IF v_days_until = 3 THEN
      -- T-3 warning
      PERFORM enqueue_notification(
        p_user_id     := r.coach_id,
        p_channel     := 'payments',
        p_priority    := 'high',
        p_title       := 'Payment due in 3 days',
        p_body        := v_athlete_name || ' — '
                         || r.currency || ' ' || r.amount::text
                         || ' due ' || to_char(v_next_due, 'Mon DD'),
        p_data        := jsonb_build_object(
                           'type',       'payment_due',
                           'athlete_id', r.athlete_id,
                           'amount',     r.amount,
                           'currency',   r.currency,
                           'due_date',   v_next_due::text
                         ),
        p_sound       := NULL,
        p_collapse_key:= 'payment-' || r.coach_id::text || '-' || r.athlete_id::text,
        p_dedup_key   := 'pay-warn-' || r.coach_id::text || '-' || r.athlete_id::text
                         || '-' || v_next_due::text
      );

    ELSIF v_days_until <= 0 THEN
      -- Overdue (send once on the due date; daily after via changing dedup key)
      PERFORM enqueue_notification(
        p_user_id     := r.coach_id,
        p_channel     := 'payments',
        p_priority    := 'high',
        p_title       := 'Payment overdue',
        p_body        := v_athlete_name || ' — '
                         || r.currency || ' ' || r.amount::text
                         || ' was due ' || to_char(v_next_due - v_interval, 'Mon DD'),
        p_data        := jsonb_build_object(
                           'type',       'payment_overdue',
                           'athlete_id', r.athlete_id,
                           'amount',     r.amount,
                           'currency',   r.currency,
                           'due_date',   (v_next_due - v_interval)::text
                         ),
        p_sound       := NULL,
        p_collapse_key:= 'payment-' || r.coach_id::text || '-' || r.athlete_id::text,
        -- Fire once per day while overdue (include today in key)
        p_dedup_key   := 'pay-overdue-' || r.coach_id::text || '-' || r.athlete_id::text
                         || '-' || v_today_utc::text
      );
    END IF;
  END LOOP;

END;
$$;

-- Daily at 09:00 UTC — reasonable for global coverage
SELECT cron.unschedule('daily-retention')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-retention');

SELECT cron.schedule(
  'daily-retention',
  '0 9 * * *',
  $$ SELECT send_daily_retention(); $$
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. WEEKLY RHYTHM PUSHES  (runs every minute; checks local time internally)
--    • Athlete — Sunday 7 PM   → Sunday plan preview
--    • Athlete — Wednesday 7 PM → Mid-week pulse (only if ≥ 2 sessions this week)
--    • Athlete — Sunday 6 PM   → Weekly recap
--    • Coach   — Friday 5 PM   → Friday wins
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION send_weekly_rhythm_pushes()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r              RECORD;
  v_local_now    TIMESTAMPTZ;
  v_local_hour   INT;
  v_local_minute INT;
  v_local_dow    INT;   -- 0=Sun … 6=Sat
  v_local_date   DATE;
  v_week_start   DATE;
  v_sessions_this_week INT;
  v_active_count INT;
  v_pr_count     INT;
  v_best_lift    TEXT;
  v_next_type    TEXT;
BEGIN
  -- ── Athlete weekly pushes ────────────────────────────────────────────────
  FOR r IN
    SELECT p.id, p.timezone, p.display_name
      FROM profiles p
     WHERE p.role = 'athlete'
       AND p.push_enabled = true
  LOOP
    v_local_now    := now() AT TIME ZONE COALESCE(r.timezone, 'UTC');
    v_local_hour   := EXTRACT(HOUR   FROM v_local_now);
    v_local_minute := EXTRACT(MINUTE FROM v_local_now);
    v_local_dow    := EXTRACT(DOW    FROM v_local_now);  -- 0=Sun
    v_local_date   := v_local_now::date;
    v_week_start   := v_local_date - v_local_dow;  -- Sunday of this week

    -- ── Sunday 7:00 PM — plan preview ─────────────────────────────────────
    IF v_local_dow = 0 AND v_local_hour = 19 AND v_local_minute = 0 THEN
      -- Count sessions planned this week from their routine
      -- (use a simple count of non-rest days as a proxy)
      SELECT COUNT(*) INTO v_sessions_this_week
        FROM routine_days rd
        JOIN routines r2 ON r2.id = rd.routine_id
       WHERE r2.user_id = r.id
         AND rd.type != 'Rest';

      -- What's Monday's workout type?
      SELECT rd.type INTO v_next_type
        FROM routine_days rd
        JOIN routines r2 ON r2.id = rd.routine_id
       WHERE r2.user_id = r.id
         AND rd.day_index = 1  -- Monday
       LIMIT 1;

      PERFORM enqueue_notification(
        p_user_id     := r.id,
        p_channel     := 'reminders',
        p_priority    := 'medium',
        p_title       := 'Your week ahead 📋',
        p_body        := COALESCE(v_sessions_this_week::text, '?') || ' sessions planned'
                         || CASE WHEN v_next_type IS NOT NULL
                                 THEN '. Starting with ' || v_next_type || ' tomorrow.'
                                 ELSE '.' END,
        p_data        := jsonb_build_object('type', 'sunday_plan'),
        p_sound       := 'tone_reminder',
        p_collapse_key:= 'sunday-plan-' || r.id::text,
        p_dedup_key   := 'sunday-plan-' || r.id::text || '-' || v_local_date::text
      );
    END IF;

    -- ── Wednesday 7:00 PM — mid-week pulse (only if ≥ 2 sessions done) ────
    IF v_local_dow = 3 AND v_local_hour = 19 AND v_local_minute = 0 THEN
      SELECT COUNT(*)
        INTO v_sessions_this_week
        FROM workout_sessions ws
       WHERE ws.user_id      = r.id
         AND ws.completed_at IS NOT NULL
         AND ws.started_at::date >= v_week_start
         AND ws.started_at::date <= v_local_date;

      IF v_sessions_this_week >= 2 THEN
        PERFORM enqueue_notification(
          p_user_id     := r.id,
          p_channel     := 'reminders',
          p_priority    := 'medium',
          p_title       := 'Halfway through 💪',
          p_body        := v_sessions_this_week::text || ' sessions done this week. Strong start.',
          p_data        := jsonb_build_object(
                             'type',    'midweek_pulse',
                             'sessions', v_sessions_this_week
                           ),
          p_sound       := 'tone_reminder',
          p_collapse_key:= 'midweek-' || r.id::text,
          p_dedup_key   := 'midweek-' || r.id::text || '-' || v_local_date::text
        );
      END IF;
    END IF;

    -- ── Sunday 6:00 PM — weekly recap ─────────────────────────────────────
    IF v_local_dow = 0 AND v_local_hour = 18 AND v_local_minute = 0 THEN
      SELECT COUNT(*)
        INTO v_sessions_this_week
        FROM workout_sessions ws
       WHERE ws.user_id      = r.id
         AND ws.completed_at IS NOT NULL
         AND ws.started_at::date >= v_week_start
         AND ws.started_at::date <= v_local_date;

      -- Best lift this week (heaviest set with a known exercise name)
      SELECT COALESCE(pe.name, ue.name) || ' ' || ws2.weight::text || ' kg'
        INTO v_best_lift
        FROM workout_sets ws2
        JOIN workout_sessions wsess ON wsess.id = ws2.session_id
        LEFT JOIN public_exercises pe ON pe.id = ws2.exercise_id
        LEFT JOIN user_exercises   ue ON ue.id = ws2.exercise_id
       WHERE wsess.user_id      = r.id
         AND wsess.started_at::date >= v_week_start
         AND ws2.weight IS NOT NULL
       ORDER BY ws2.weight DESC
       LIMIT 1;

      IF v_sessions_this_week > 0 THEN
        PERFORM enqueue_notification(
          p_user_id     := r.id,
          p_channel     := 'milestones',
          p_priority    := 'medium',
          p_title       := 'Your week: ' || v_sessions_this_week::text || ' session'
                           || CASE WHEN v_sessions_this_week > 1 THEN 's' ELSE '' END,
          p_body        := CASE WHEN v_best_lift IS NOT NULL
                                THEN 'Best lift: ' || v_best_lift || '.'
                                ELSE 'Another week in the books.' END,
          p_data        := jsonb_build_object(
                             'type',     'weekly_recap',
                             'sessions', v_sessions_this_week
                           ),
          p_sound       := 'tone_reminder',
          p_collapse_key:= 'weekly-recap-' || r.id::text,
          p_dedup_key   := 'weekly-recap-' || r.id::text || '-' || v_local_date::text
        );
      END IF;
    END IF;

  END LOOP;

  -- ── Coach Friday wins (Friday 5 PM local) ─────────────────────────────────
  FOR r IN
    SELECT p.id, p.timezone
      FROM profiles p
     WHERE p.role = 'coach'
       AND p.push_enabled = true
  LOOP
    v_local_now    := now() AT TIME ZONE COALESCE(r.timezone, 'UTC');
    v_local_hour   := EXTRACT(HOUR   FROM v_local_now);
    v_local_minute := EXTRACT(MINUTE FROM v_local_now);
    v_local_dow    := EXTRACT(DOW    FROM v_local_now);
    v_local_date   := v_local_now::date;

    IF v_local_dow = 5 AND v_local_hour = 17 AND v_local_minute = 0 THEN
      -- Sunday of this week (DOW=5 means today is Friday, so Sun was v_local_date - 5)
      v_week_start := v_local_date - 5;

      -- Count PRs across all athletes this week
      SELECT COUNT(DISTINCT ws2.id)
        INTO v_pr_count
        FROM workout_sets   ws2
        JOIN workout_sessions wsess ON wsess.id  = ws2.session_id
        JOIN coach_athletes  ca    ON ca.athlete_id = wsess.user_id
       WHERE ca.coach_id   = r.id
         AND ca.status     = 'accepted'
         AND ws2.is_pr     = true
         AND wsess.started_at::date >= v_week_start;

      -- Count active athletes this week
      SELECT COUNT(DISTINCT wsess.user_id)
        INTO v_active_count
        FROM workout_sessions wsess
        JOIN coach_athletes ca ON ca.athlete_id = wsess.user_id
       WHERE ca.coach_id  = r.id
         AND ca.status    = 'accepted'
         AND wsess.completed_at IS NOT NULL
         AND wsess.started_at::date >= v_week_start;

      IF v_active_count > 0 THEN
        PERFORM enqueue_notification(
          p_user_id     := r.id,
          p_channel     := 'coach-alerts',
          p_priority    := 'medium',
          p_title       := 'Friday wins 🎉',
          p_body        := v_active_count::text || ' athlete'
                           || CASE WHEN v_active_count > 1 THEN 's' ELSE '' END
                           || ' trained this week'
                           || CASE WHEN v_pr_count > 0
                                   THEN ', ' || v_pr_count::text || ' PR'
                                        || CASE WHEN v_pr_count > 1 THEN 's' ELSE '' END
                                        || ' hit.'
                                   ELSE '.' END,
          p_data        := jsonb_build_object(
                             'type',    'friday_wins',
                             'active',  v_active_count,
                             'prs',     v_pr_count
                           ),
          p_sound       := 'bell_coach',
          p_collapse_key:= 'friday-wins-' || r.id::text,
          p_dedup_key   := 'friday-wins-' || r.id::text || '-' || v_local_date::text
        );
      END IF;
    END IF;
  END LOOP;

END;
$$;

-- Runs every minute alongside the other timed-push functions.
SELECT cron.unschedule('weekly-rhythm-cron')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-rhythm-cron');

SELECT cron.schedule(
  'weekly-rhythm-cron',
  '* * * * *',
  $$ SELECT send_weekly_rhythm_pushes(); $$
);
