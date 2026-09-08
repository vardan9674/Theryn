-- ============================================================================
-- Theryn — Phase 3 Push Triggers
--   • Chat messages → push to the other participant
--   • PR detection  → push to athlete + push to coach
--   • Connection requests / accepts / declines → push to affected party
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- HELPER: resolve a display name for a user
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_display_name(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(NULLIF(TRIM(display_name), ''), 'Someone')
  FROM profiles WHERE id = p_user_id;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- TRIGGER: chat message → push to the other participant
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_on_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_coach_id    UUID;
  v_athlete_id  UUID;
  v_recipient   UUID;
  v_sender_name TEXT;
  v_pending     INT;
  v_body        TEXT;
BEGIN
  -- Look up the conversation participants
  SELECT coach_id, athlete_id
    INTO v_coach_id, v_athlete_id
    FROM conversations
   WHERE id = NEW.conversation_id;

  -- Recipient is the other participant
  IF NEW.sender_id = v_coach_id THEN
    v_recipient := v_athlete_id;
  ELSE
    v_recipient := v_coach_id;
  END IF;

  v_sender_name := get_display_name(NEW.sender_id);

  -- Count unread messages from the same sender in the last 5 minutes
  -- (for bundling: if the sender is firing fast, collapse to one push)
  SELECT COUNT(*)
    INTO v_pending
    FROM messages m
   WHERE m.conversation_id = NEW.conversation_id
     AND m.sender_id       = NEW.sender_id
     AND m.created_at     >= (now() - INTERVAL '5 minutes')
     AND m.id             != NEW.id;

  -- If >3 rapid messages already queued a push, skip this one to avoid spam
  -- (The last enqueued push already has a dedup_key that will update its body)
  IF v_pending >= 3 THEN
    RETURN NEW;
  END IF;

  -- Build body — brief excerpt, max 60 chars
  v_body := LEFT(NEW.content, 60) || CASE WHEN char_length(NEW.content) > 60 THEN '…' ELSE '' END;

  -- Enqueue. collapse_key = conversation so rapid messages replace each other.
  PERFORM enqueue_notification(
    p_user_id     := v_recipient,
    p_channel     := 'chat',
    p_priority    := 'critical',
    p_title       := v_sender_name,
    p_body        := v_body,
    p_data        := jsonb_build_object(
                       'type',           'chat',
                       'conversation_id', NEW.conversation_id,
                       'sender_id',       NEW.sender_id
                     ),
    p_sound       := 'chime_chat',
    p_collapse_key:= 'chat-' || NEW.conversation_id::text,
    p_dedup_key   := NULL  -- chat always delivers, no dedup
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_message ON messages;
CREATE TRIGGER trg_notify_on_message
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION notify_on_message();


-- ─────────────────────────────────────────────────────────────────────────────
-- TRIGGER: new personal record → push to athlete + coach
-- PR is detected when is_pr = true on a newly-inserted set, OR when a set
-- UPDATE sets is_pr to true (some clients set it after saving).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_on_pr()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id      UUID;
  v_exercise_name TEXT;
  v_weight        NUMERIC;
  v_reps          INT;
  v_coach_id      UUID;
  v_today         DATE;
BEGIN
  -- Only act when is_pr flips to true
  IF NEW.is_pr IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_pr IS TRUE THEN
    RETURN NEW; -- already handled
  END IF;

  -- Resolve user via session
  SELECT ws.user_id
    INTO v_user_id
    FROM workout_sessions ws
   WHERE ws.id = NEW.session_id;

  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  v_today := (now() AT TIME ZONE COALESCE(
    (SELECT timezone FROM profiles WHERE id = v_user_id), 'UTC'
  ))::date;

  -- Resolve exercise name (check user_exercises first, then public)
  SELECT COALESCE(ue.name, pe.name, 'an exercise')
    INTO v_exercise_name
    FROM (SELECT name FROM user_exercises  WHERE id = NEW.exercise_id LIMIT 1) ue
    FULL OUTER JOIN (SELECT name FROM public_exercises WHERE id = NEW.exercise_id LIMIT 1) pe ON true
   LIMIT 1;

  v_weight := NEW.weight;
  v_reps   := NEW.reps;

  -- ── Push to athlete ──────────────────────────────────────────────────────
  PERFORM enqueue_notification(
    p_user_id     := v_user_id,
    p_channel     := 'milestones',
    p_priority    := 'high',
    p_title       := '🏆 New Personal Record!',
    p_body        := v_exercise_name
                     || CASE WHEN v_weight IS NOT NULL
                             THEN ' — ' || v_weight::text || ' kg × ' || COALESCE(v_reps::text, '?')
                             ELSE '' END,
    p_data        := jsonb_build_object(
                       'type',          'pr',
                       'exercise_id',   NEW.exercise_id,
                       'exercise_name', v_exercise_name,
                       'weight',        v_weight,
                       'reps',          v_reps
                     ),
    p_sound       := 'flourish_milestone',
    p_collapse_key:= NULL,
    p_dedup_key   := 'pr-' || v_user_id::text || '-' || NEW.exercise_id::text || '-' || v_today::text
  );

  -- ── Push to coach (if they have one) ─────────────────────────────────────
  SELECT coach_id
    INTO v_coach_id
    FROM coach_athletes
   WHERE athlete_id = v_user_id
     AND status = 'accepted'
   LIMIT 1;

  IF v_coach_id IS NOT NULL THEN
    PERFORM enqueue_notification(
      p_user_id     := v_coach_id,
      p_channel     := 'milestones',
      p_priority    := 'high',
      p_title       := get_display_name(v_user_id) || ' hit a PR! 🏆',
      p_body        := v_exercise_name
                       || CASE WHEN v_weight IS NOT NULL
                               THEN ' — ' || v_weight::text || ' kg × ' || COALESCE(v_reps::text, '?')
                               ELSE '' END,
      p_data        := jsonb_build_object(
                         'type',          'pr',
                         'athlete_id',    v_user_id,
                         'exercise_id',   NEW.exercise_id,
                         'exercise_name', v_exercise_name,
                         'weight',        v_weight,
                         'reps',          v_reps
                       ),
      p_sound       := 'flourish_milestone',
      p_collapse_key:= NULL,
      p_dedup_key   := 'pr-coach-' || v_coach_id::text || '-' || v_user_id::text
                       || '-' || NEW.exercise_id::text || '-' || v_today::text
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_pr ON workout_sets;
CREATE TRIGGER trg_notify_on_pr
  AFTER INSERT OR UPDATE OF is_pr ON workout_sets
  FOR EACH ROW EXECUTE FUNCTION notify_on_pr();


-- ─────────────────────────────────────────────────────────────────────────────
-- TRIGGER: coach_athletes INSERT → notify coach of new connection request
-- TRIGGER: coach_athletes UPDATE → notify athlete of accept/decline
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_on_connection_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_athlete_name TEXT;
  v_coach_name   TEXT;
BEGIN
  -- ── New row: pending request → notify coach ───────────────────────────────
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' AND NEW.coach_id IS NOT NULL THEN
    v_athlete_name := get_display_name(NEW.athlete_id);

    PERFORM enqueue_notification(
      p_user_id     := NEW.coach_id,
      p_channel     := 'admin',
      p_priority    := 'high',
      p_title       := 'New Coaching Request',
      p_body        := v_athlete_name || ' wants you as their coach.',
      p_data        := jsonb_build_object(
                         'type',       'connection_request',
                         'athlete_id', NEW.athlete_id,
                         'link_id',    NEW.id
                       ),
      p_sound       := 'bell_coach',
      p_collapse_key:= 'connection-request-' || NEW.id::text,
      p_dedup_key   := 'conn-req-' || NEW.id::text
    );
  END IF;

  -- ── Status flip: notify athlete of outcome ────────────────────────────────
  IF TG_OP = 'UPDATE' AND OLD.status = 'pending' THEN
    v_coach_name := get_display_name(NEW.coach_id);

    IF NEW.status = 'accepted' THEN
      PERFORM enqueue_notification(
        p_user_id     := NEW.athlete_id,
        p_channel     := 'admin',
        p_priority    := 'high',
        p_title       := 'Coach Connected! 🎉',
        p_body        := v_coach_name || ' accepted your coaching request.',
        p_data        := jsonb_build_object(
                           'type',     'connection_accepted',
                           'coach_id', NEW.coach_id,
                           'link_id',  NEW.id
                         ),
        p_sound       := 'bell_coach',
        p_collapse_key:= NULL,
        p_dedup_key   := 'conn-accept-' || NEW.id::text
      );

    ELSIF NEW.status = 'declined' THEN
      -- Gentle copy — no drama
      PERFORM enqueue_notification(
        p_user_id     := NEW.athlete_id,
        p_channel     := 'admin',
        p_priority    := 'medium',
        p_title       := 'Coaching Update',
        p_body        := v_coach_name || ' isn''t taking new athletes right now.',
        p_data        := jsonb_build_object(
                           'type',     'connection_declined',
                           'coach_id', NEW.coach_id,
                           'link_id',  NEW.id
                         ),
        p_sound       := NULL,
        p_collapse_key:= NULL,
        p_dedup_key   := 'conn-decline-' || NEW.id::text
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_connection ON coach_athletes;
CREATE TRIGGER trg_notify_on_connection
  AFTER INSERT OR UPDATE OF status ON coach_athletes
  FOR EACH ROW EXECUTE FUNCTION notify_on_connection_change();
