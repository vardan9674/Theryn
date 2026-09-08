-- ============================================================================
-- Theryn — Server Push Notification System (Phase 1 Foundation)
--
-- 1. Adds `timezone` column to profiles (IANA TZ).
-- 2. Creates `device_tokens` for FCM/APNs registration.
-- 3. Creates `notify_outbox` queue + indexes.
-- 4. Adds notification preference fields to profiles (quiet hours, channel mutes).
-- 5. Helper functions:
--      - enqueue_notification()             - INSERT into outbox with dedupe.
--      - claim_outbox_batch()               - SELECT FOR UPDATE SKIP LOCKED dispatcher.
--      - mark_outbox_sent / mark_outbox_failed.
--      - apply_quiet_hours()                - shift send_at out of quiet window.
--      - within_daily_budget()              - per-user/day cap.
--
-- The Edge Function `process-outbox` calls claim_outbox_batch every minute
-- via pg_cron (wired in 006_notify_cron.sql once the function is deployed).
-- ============================================================================

-- ── 1. PROFILE EXTENSIONS ───────────────────────────────────────────────────
-- IANA timezone (e.g. 'America/Los_Angeles'). Captured at app launch.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS timezone        TEXT DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS quiet_start     TIME DEFAULT '22:00',  -- 10 PM local
  ADD COLUMN IF NOT EXISTS quiet_end       TIME DEFAULT '07:00',  -- 7 AM local
  ADD COLUMN IF NOT EXISTS muted_channels  TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS push_enabled    BOOLEAN DEFAULT true;


-- ── 2. DEVICE TOKENS ─────────────────────────────────────────────────────────
-- One row per (user, device). A user may have multiple devices.
-- token is the FCM registration token (works for both Android and iOS via FCM).
CREATE TABLE device_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token        TEXT NOT NULL,
  platform     TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  app_version  TEXT,
  locale       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (token)
);

CREATE INDEX idx_device_tokens_user ON device_tokens (user_id);

ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own device tokens"
  ON device_tokens FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ── 3. NOTIFY OUTBOX ─────────────────────────────────────────────────────────
-- The single source of truth for outgoing pushes. Producers (DB triggers,
-- pg_cron jobs) INSERT here. The dispatcher Edge Function CLAIMS rows,
-- sends via FCM, and marks them sent/failed.
--
-- status state machine:
--   'pending'  -> waiting for send_at to arrive
--   'sending'  -> claimed by dispatcher (visibility timeout = 5 min)
--   'sent'     -> delivered to FCM (terminal)
--   'failed'   -> exceeded max retries or fatal error (terminal)
--   'dropped'  -> intentionally not sent (quiet hours+budget overflow, dedup)
CREATE TABLE notify_outbox (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  channel         TEXT NOT NULL,        -- 'chat' | 'coach-alerts' | 'reminders' | etc.
  priority        TEXT NOT NULL DEFAULT 'medium'
                    CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,    -- deep-link payload
  sound           TEXT,                                  -- e.g. 'chime_chat.caf'
  collapse_key    TEXT,                                  -- for replace-style updates
  dedup_key       TEXT,                                  -- if set, only one row with this key per 24h
  send_at         TIMESTAMPTZ NOT NULL DEFAULT now(),    -- earliest dispatch time (UTC)
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'dropped')),
  attempts        INT NOT NULL DEFAULT 0,
  last_error      TEXT,
  claimed_at      TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dispatcher index: claim oldest pending rows whose send_at has arrived.
CREATE INDEX idx_outbox_due
  ON notify_outbox (send_at)
  WHERE status = 'pending';

-- Recovery index: find stuck 'sending' rows whose visibility timeout expired.
CREATE INDEX idx_outbox_stuck
  ON notify_outbox (claimed_at)
  WHERE status = 'sending';

-- Per-user / per-channel queries (cooldown + budget).
CREATE INDEX idx_outbox_user_channel_sent
  ON notify_outbox (user_id, channel, sent_at)
  WHERE status = 'sent';

-- Dedup lookup.
CREATE INDEX idx_outbox_dedup
  ON notify_outbox (user_id, dedup_key, created_at)
  WHERE dedup_key IS NOT NULL;

ALTER TABLE notify_outbox ENABLE ROW LEVEL SECURITY;

-- Users can read their own outbox (useful for in-app notification history).
CREATE POLICY "Users read own outbox"
  ON notify_outbox FOR SELECT USING (auth.uid() = user_id);

-- Only the service role (Edge Function / triggers) writes. No client INSERT/UPDATE policy.


-- ── 4. SCHEDULING HELPERS ───────────────────────────────────────────────────

-- Shift `send_at` out of the user's quiet hours window.
-- If send_at falls inside [quiet_start, quiet_end) local, push to quiet_end.
CREATE OR REPLACE FUNCTION apply_quiet_hours(
  p_user_id  UUID,
  p_send_at  TIMESTAMPTZ,
  p_priority TEXT
) RETURNS TIMESTAMPTZ AS $$
DECLARE
  v_tz       TEXT;
  v_qstart   TIME;
  v_qend     TIME;
  v_local    TIMESTAMP;
  v_local_t  TIME;
  v_target   TIMESTAMP;
  v_in_quiet BOOLEAN;
BEGIN
  -- Critical pushes ignore quiet hours.
  IF p_priority = 'critical' THEN
    RETURN p_send_at;
  END IF;

  SELECT timezone, quiet_start, quiet_end
    INTO v_tz, v_qstart, v_qend
    FROM profiles WHERE id = p_user_id;

  IF v_tz IS NULL OR v_qstart IS NULL OR v_qend IS NULL THEN
    RETURN p_send_at;
  END IF;

  v_local   := (p_send_at AT TIME ZONE v_tz);
  v_local_t := v_local::time;

  -- Quiet window may wrap midnight (e.g. 22:00–07:00).
  IF v_qstart < v_qend THEN
    v_in_quiet := v_local_t >= v_qstart AND v_local_t < v_qend;
  ELSE
    v_in_quiet := v_local_t >= v_qstart OR v_local_t < v_qend;
  END IF;

  IF NOT v_in_quiet THEN
    RETURN p_send_at;
  END IF;

  -- Compute next local quiet_end occurrence.
  v_target := date_trunc('day', v_local) + v_qend;
  IF v_local_t >= v_qstart AND v_qstart > v_qend THEN
    -- We're after quiet_start of "today", quiet_end is tomorrow.
    v_target := v_target + INTERVAL '1 day';
  END IF;

  RETURN v_target AT TIME ZONE v_tz;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- Returns true if the user can receive another push of the given priority today.
CREATE OR REPLACE FUNCTION within_daily_budget(
  p_user_id  UUID,
  p_priority TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_tz         TEXT;
  v_today_utc0 TIMESTAMPTZ;
  v_count      INT;
  v_budget     INT;
  v_role       TEXT;
BEGIN
  IF p_priority IN ('critical', 'high') THEN
    RETURN TRUE;  -- never capped
  END IF;

  SELECT timezone INTO v_tz FROM profiles WHERE id = p_user_id;
  v_tz := COALESCE(v_tz, 'UTC');

  -- Start of "today" in user's timezone, expressed in UTC.
  v_today_utc0 := (date_trunc('day', now() AT TIME ZONE v_tz)) AT TIME ZONE v_tz;

  SELECT COUNT(*) INTO v_count
    FROM notify_outbox
   WHERE user_id = p_user_id
     AND status  = 'sent'
     AND sent_at >= v_today_utc0;

  -- Heuristic: coaches get 5/day, athletes 3/day. Determined by whether the
  -- user has any accepted coach_athletes rows where they're the coach.
  SELECT CASE
           WHEN EXISTS (
             SELECT 1 FROM coach_athletes
              WHERE coach_id = p_user_id AND status = 'accepted'
           ) THEN 5
           ELSE 3
         END INTO v_budget;

  RETURN v_count < v_budget;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- Main producer entrypoint: enqueue a notification.
-- Honors user mutes, quiet hours (deferring), dedup, and push_enabled.
-- Returns the inserted row id, or NULL if dropped.
CREATE OR REPLACE FUNCTION enqueue_notification(
  p_user_id      UUID,
  p_channel      TEXT,
  p_priority     TEXT,
  p_title        TEXT,
  p_body         TEXT,
  p_data         JSONB DEFAULT '{}'::jsonb,
  p_sound        TEXT DEFAULT NULL,
  p_collapse_key TEXT DEFAULT NULL,
  p_dedup_key    TEXT DEFAULT NULL,
  p_send_at      TIMESTAMPTZ DEFAULT now()
) RETURNS UUID AS $$
DECLARE
  v_push_enabled BOOLEAN;
  v_muted        TEXT[];
  v_send_at      TIMESTAMPTZ;
  v_id           UUID;
BEGIN
  SELECT push_enabled, muted_channels
    INTO v_push_enabled, v_muted
    FROM profiles WHERE id = p_user_id;

  IF v_push_enabled IS DISTINCT FROM TRUE THEN
    RETURN NULL;
  END IF;

  IF v_muted IS NOT NULL AND p_channel = ANY(v_muted) THEN
    RETURN NULL;
  END IF;

  -- Dedup: skip if an identical key was queued/sent for this user in last 24h.
  IF p_dedup_key IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM notify_outbox
       WHERE user_id   = p_user_id
         AND dedup_key = p_dedup_key
         AND created_at > now() - INTERVAL '24 hours'
    ) THEN
      RETURN NULL;
    END IF;
  END IF;

  v_send_at := apply_quiet_hours(p_user_id, p_send_at, p_priority);

  INSERT INTO notify_outbox (
    user_id, channel, priority, title, body, data, sound,
    collapse_key, dedup_key, send_at
  ) VALUES (
    p_user_id, p_channel, p_priority, p_title, p_body, p_data, p_sound,
    p_collapse_key, p_dedup_key, v_send_at
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── 5. DISPATCHER CLAIM / FINALIZE ──────────────────────────────────────────

-- Claim up to N due rows for sending. Skips rows currently held by another worker.
-- Re-queues rows that have been 'sending' for more than 5 min (crashed worker).
CREATE OR REPLACE FUNCTION claim_outbox_batch(p_limit INT DEFAULT 100)
RETURNS SETOF notify_outbox AS $$
BEGIN
  -- Recover stuck rows first.
  UPDATE notify_outbox
     SET status = 'pending', claimed_at = NULL
   WHERE status = 'sending'
     AND claimed_at < now() - INTERVAL '5 minutes';

  -- Drop pushes that are over daily budget at dispatch time.
  UPDATE notify_outbox
     SET status     = 'dropped',
         last_error = 'daily_budget_exceeded'
   WHERE status     = 'pending'
     AND send_at   <= now()
     AND priority NOT IN ('critical', 'high')
     AND NOT within_daily_budget(user_id, priority);

  -- Claim the batch. Explicit priority order — alphabetic would mis-rank
  -- 'low' before 'medium'.
  RETURN QUERY
  WITH due AS (
    SELECT id FROM notify_outbox
     WHERE status   = 'pending'
       AND send_at <= now()
     ORDER BY
       CASE priority
         WHEN 'critical' THEN 1
         WHEN 'high'     THEN 2
         WHEN 'medium'   THEN 3
         WHEN 'low'      THEN 4
       END,
       send_at
     LIMIT p_limit
     FOR UPDATE SKIP LOCKED
  )
  UPDATE notify_outbox o
     SET status     = 'sending',
         claimed_at = now(),
         attempts   = o.attempts + 1
    FROM due
   WHERE o.id = due.id
  RETURNING o.*;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION mark_outbox_sent(p_id UUID)
RETURNS VOID AS $$
  UPDATE notify_outbox
     SET status = 'sent', sent_at = now(), last_error = NULL
   WHERE id = p_id;
$$ LANGUAGE sql;


CREATE OR REPLACE FUNCTION mark_outbox_failed(
  p_id          UUID,
  p_error       TEXT,
  p_max_retries INT DEFAULT 3
) RETURNS VOID AS $$
  UPDATE notify_outbox
     SET status     = CASE WHEN attempts >= p_max_retries THEN 'failed' ELSE 'pending' END,
         claimed_at = NULL,
         last_error = p_error,
         send_at    = CASE
                        WHEN attempts >= p_max_retries THEN send_at
                        ELSE now() + (INTERVAL '30 seconds' * (1 << LEAST(attempts, 6)))
                      END
   WHERE id = p_id;
$$ LANGUAGE sql;


-- ── 6. DEAD TOKEN CLEANUP ──────────────────────────────────────────────────
-- Called by the Edge Function when FCM returns NOT_FOUND or INVALID_ARGUMENT
-- for a specific token (means the user uninstalled or revoked).
CREATE OR REPLACE FUNCTION delete_device_token(p_token TEXT)
RETURNS VOID AS $$
  DELETE FROM device_tokens WHERE token = p_token;
$$ LANGUAGE sql SECURITY DEFINER;


-- ── 7. GRANTS ──────────────────────────────────────────────────────────────
-- The service role (used by Edge Function via SUPABASE_SERVICE_ROLE_KEY) bypasses
-- RLS automatically. We still want authenticated users blocked from these helpers.
REVOKE EXECUTE ON FUNCTION claim_outbox_batch(INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION mark_outbox_sent(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION mark_outbox_failed(UUID, TEXT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION delete_device_token(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION enqueue_notification(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
