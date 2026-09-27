-- notify_outbox has no updated_at column: use send_at for the real backlog
-- (rows due now, not ones deferred by quiet hours) and claimed_at to spot rows
-- the dispatcher claimed but never finished. Body matches the corrected
-- admin_push_health() in 20260920173034_admin_health_and_stats.sql.
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

REVOKE ALL ON FUNCTION admin_push_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_push_health() TO authenticated, service_role;
