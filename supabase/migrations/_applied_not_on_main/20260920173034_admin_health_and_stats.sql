-- ============================================================================
-- Admin observability — read-only stats, health history, and an admin gate
--
-- Adds nothing the app itself uses. Everything here is for the admin dashboard
-- and ops/health-check.mjs:
--
--   admin_users          who may read any of this (you)
--   health_checks        one row per probe per run, for the health timeline
--   admin_stats()        users, activity, signups, 30-day series
--   admin_push_health()  notify_outbox backlog, sent/failed/dropped
--   admin_cron_health()  pg_cron jobs and their last run
--   admin_capacity()     database size, connections, biggest tables
--   admin_prune_health() deletes health rows older than 30 days
--
-- All functions are SECURITY DEFINER with a pinned search_path and refuse
-- anyone who is neither in admin_users nor the service role. They only read;
-- none of them writes to app tables.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

-- ── Who counts as an admin ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_users (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Admins can see the list; nobody else can read or write it (service role
-- bypasses RLS, so seeding happens from the SQL editor or the CLI).
DROP POLICY IF EXISTS "Admins read admin_users" ON admin_users;
CREATE POLICY "Admins read admin_users" ON admin_users
  FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  SELECT
    coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
    OR EXISTS (SELECT 1 FROM admin_users a WHERE a.user_id = auth.uid());
$$;

-- Raise instead of returning empty, so a misconfigured dashboard is obvious.
CREATE OR REPLACE FUNCTION assert_admin()
RETURNS VOID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- ── Health check history ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS health_checks (
  id          BIGSERIAL PRIMARY KEY,
  check_id    TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('ok', 'warn', 'fail', 'skip')),
  duration_ms INTEGER,
  detail      TEXT,
  data        JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_health_checks_recent ON health_checks (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_checks_check ON health_checks (check_id, created_at DESC);

ALTER TABLE health_checks ENABLE ROW LEVEL SECURITY;

-- Only admins read. Writes come from the health script with the service-role
-- key, which bypasses RLS — no INSERT policy is granted to app users.
DROP POLICY IF EXISTS "Admins read health checks" ON health_checks;
CREATE POLICY "Admins read health checks" ON health_checks
  FOR SELECT USING (is_admin());

CREATE OR REPLACE FUNCTION admin_prune_health(p_days INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE n INTEGER;
BEGIN
  PERFORM assert_admin();
  DELETE FROM health_checks WHERE created_at < now() - (p_days || ' days')::INTERVAL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- ── Users and activity ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_stats()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE result JSONB;
BEGIN
  PERFORM assert_admin();

  SELECT jsonb_build_object(
    'users_total',    (SELECT count(*) FROM profiles),
    -- profiles.role is NULL for everyone (the app keeps the role in
    -- localStorage), so derive it from real coaching links instead.
    'coaches',        (SELECT count(DISTINCT p.id) FROM profiles p
                        WHERE p.role = 'coach'
                           OR EXISTS (SELECT 1 FROM coach_athletes ca WHERE ca.coach_id = p.id)
                           OR EXISTS (SELECT 1 FROM coach_manual_clients mc WHERE mc.coach_id = p.id)),
    'athletes',       (SELECT count(DISTINCT p.id) FROM profiles p
                        WHERE NOT EXISTS (SELECT 1 FROM coach_athletes ca WHERE ca.coach_id = p.id)
                          AND NOT EXISTS (SELECT 1 FROM coach_manual_clients mc WHERE mc.coach_id = p.id)
                          AND p.role IS DISTINCT FROM 'coach'),
    'role_set',       (SELECT count(*) FROM profiles WHERE role IS NOT NULL),
    'onboarded',      (SELECT count(*) FROM profiles WHERE onboarding_completed),
    'signups_24h',    (SELECT count(*) FROM auth.users WHERE created_at > now() - INTERVAL '1 day'),
    'signups_7d',     (SELECT count(*) FROM auth.users WHERE created_at > now() - INTERVAL '7 days'),
    -- Active = signed in (GoTrue) in the window. Covers browsing without logging a set.
    'dau',            (SELECT count(*) FROM auth.users WHERE last_sign_in_at > now() - INTERVAL '1 day'),
    'wau',            (SELECT count(*) FROM auth.users WHERE last_sign_in_at > now() - INTERVAL '7 days'),
    'mau',            (SELECT count(*) FROM auth.users WHERE last_sign_in_at > now() - INTERVAL '30 days'),
    'workouts_today', (SELECT count(*) FROM workout_sessions WHERE started_at > date_trunc('day', now())),
    'workouts_7d',    (SELECT count(*) FROM workout_sessions WHERE started_at > now() - INTERVAL '7 days'),
    'sets_7d',        (SELECT count(*) FROM workout_sets ws JOIN workout_sessions s ON s.id = ws.session_id
                        WHERE s.started_at > now() - INTERVAL '7 days'),
    'messages_24h',   (SELECT count(*) FROM messages WHERE created_at > now() - INTERVAL '1 day'),
    'coach_links',    (SELECT count(*) FROM coach_athletes WHERE status = 'accepted'),
    'device_tokens',  (SELECT count(*) FROM device_tokens),
    -- 30-day series for the dashboard charts.
    'daily', (
      SELECT coalesce(jsonb_agg(row_to_json(d) ORDER BY d.day), '[]'::jsonb) FROM (
        SELECT g.day::date AS day,
               (SELECT count(*) FROM auth.users u WHERE u.created_at::date = g.day::date)          AS signups,
               (SELECT count(*) FROM workout_sessions w WHERE w.started_at::date = g.day::date)    AS workouts,
               (SELECT count(DISTINCT w.user_id) FROM workout_sessions w
                 WHERE w.started_at::date = g.day::date)                                           AS active_users
        FROM generate_series(now() - INTERVAL '29 days', now(), INTERVAL '1 day') g(day)
      ) d
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- ── Push pipeline ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_push_health()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE result JSONB;
BEGIN
  PERFORM assert_admin();

  -- The push schema lives in _recovered_push_notifications and may not be
  -- applied on every environment; say so rather than failing the health run.
  IF to_regclass('public.notify_outbox') IS NULL THEN
    RETURN jsonb_build_object('installed', false);
  END IF;

  SELECT jsonb_build_object(
    'installed', true,
    -- "Waiting" means due now; rows scheduled for later (quiet hours) are not a backlog.
    'pending',   (SELECT count(*) FROM notify_outbox WHERE status = 'pending' AND send_at <= now()),
    'scheduled', (SELECT count(*) FROM notify_outbox WHERE status = 'pending' AND send_at > now()),
    'sending',   (SELECT count(*) FROM notify_outbox WHERE status = 'sending'),
    'sent_24h',  (SELECT count(*) FROM notify_outbox WHERE status = 'sent'    AND created_at > now() - INTERVAL '1 day'),
    'failed_24h',(SELECT count(*) FROM notify_outbox WHERE status = 'failed'  AND created_at > now() - INTERVAL '1 day'),
    'dropped_24h',(SELECT count(*) FROM notify_outbox WHERE status = 'dropped' AND created_at > now() - INTERVAL '1 day'),
    'oldest_pending_minutes',
      (SELECT coalesce(round(extract(epoch FROM now() - min(send_at)) / 60)::int, 0)
         FROM notify_outbox WHERE status = 'pending' AND send_at <= now()),
    -- Claimed by the dispatcher but never marked sent: a crashed invocation.
    'stuck_sending',
      (SELECT count(*) FROM notify_outbox WHERE status = 'sending' AND claimed_at < now() - INTERVAL '5 minutes'),
    'by_channel_24h', (
      SELECT coalesce(jsonb_object_agg(channel, n), '{}'::jsonb)
        FROM (SELECT channel, count(*) AS n FROM notify_outbox
               WHERE created_at > now() - INTERVAL '1 day' GROUP BY channel) c
    ),
    'last_errors', (
      SELECT coalesce(jsonb_agg(row_to_json(e)), '[]'::jsonb) FROM (
        SELECT channel, last_error, attempts, send_at FROM notify_outbox
         WHERE status = 'failed' ORDER BY send_at DESC NULLS LAST LIMIT 5
      ) e
    ),
    'devices', (
      SELECT coalesce(jsonb_object_agg(platform, n), '{}'::jsonb)
        FROM (SELECT platform, count(*) AS n FROM device_tokens GROUP BY platform) p
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- ── Scheduled jobs ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_cron_health()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_catalog, cron AS $$
DECLARE result JSONB;
BEGIN
  PERFORM assert_admin();

  IF to_regclass('cron.job') IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(j) ORDER BY j.jobname), '[]'::jsonb) INTO result FROM (
    SELECT c.jobname,
           c.schedule,
           c.active,
           r.status AS last_status,
           r.start_time AS last_run,
           round(extract(epoch FROM now() - r.start_time) / 60)::int AS minutes_since_run,
           left(coalesce(r.return_message, ''), 200) AS last_message
      FROM cron.job c
      LEFT JOIN LATERAL (
        SELECT d.status, d.start_time, d.return_message
          FROM cron.job_run_details d
         WHERE d.jobid = c.jobid
         ORDER BY d.start_time DESC
         LIMIT 1
      ) r ON TRUE
  ) j;

  RETURN result;
END;
$$;

-- ── Capacity ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_capacity()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE result JSONB;
BEGIN
  PERFORM assert_admin();

  SELECT jsonb_build_object(
    'db_bytes',    pg_database_size(current_database()),
    'connections', (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()),
    'max_connections', current_setting('max_connections')::int,
    'tables', (
      SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t.bytes DESC), '[]'::jsonb) FROM (
        -- Both pg_class and pg_stat_user_tables expose relname; qualify it.
        SELECT c.relname AS table_name,
               pg_total_relation_size(c.oid) AS bytes,
               s.n_live_tup AS approx_rows
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
         WHERE n.nspname = 'public' AND c.relkind = 'r'
         ORDER BY pg_total_relation_size(c.oid) DESC
         LIMIT 12
      ) t
    ),
    'cache_hit_ratio', (
      SELECT round(sum(heap_blks_hit) * 100.0 / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0), 1)
        FROM pg_statio_user_tables
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- ── Grants ───────────────────────────────────────────────────────────────────
-- Anonymous visitors can never call these. Signed-in users can, but every
-- function calls assert_admin() first, so only admin_users get data back.

DO $$
DECLARE fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'is_admin()', 'assert_admin()', 'admin_stats()', 'admin_push_health()',
    'admin_cron_health()', 'admin_capacity()', 'admin_prune_health(integer)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $$;
