-- profiles.role is NULL for every user (the app keeps the role in
-- localStorage and never mirrors it), so coaches/athletes are derived from
-- real coaching links instead of that column.
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

REVOKE ALL ON FUNCTION admin_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_stats() TO authenticated, service_role;
