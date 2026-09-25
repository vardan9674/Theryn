-- A client's own history needs to say which workout is which.
--
-- link_me already hands a connected client their last 40 workouts. It left
-- out the one thing needed to change one: its id. Without that, a client
-- editing a workout on a different phone from the one they sent it on would
-- add a second entry instead of replacing the first.
--
-- Adds `id` and `at` (when it was sent) to each row. Nothing else changes:
-- same function, same guard — only the person the link is connected to ever
-- sees any of it.

CREATE OR REPLACE FUNCTION link_me(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_link    client_links%ROWTYPE;
  v_uid     UUID := auth.uid();
  v_you     BOOLEAN;
  v_history JSONB;
BEGIN
  IF p_token IS NULL OR length(p_token) < 20 OR length(p_token) > 128 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  SELECT * INTO v_link FROM client_links WHERE token_hash = encode(digest(p_token, 'sha256'), 'hex');
  IF NOT FOUND OR v_link.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'revoked');
  END IF;

  v_you := v_uid IS NOT NULL
       AND (v_link.connected_user_id = v_uid OR (v_link.athlete_id IS NOT NULL AND v_link.athlete_id = v_uid));

  IF v_you THEN
    SELECT coalesce(jsonb_agg(q.h), '[]'::jsonb) INTO v_history FROM (
      SELECT jsonb_build_object(
               'id', s.id,
               'at', s.submitted_at,
               'date', s.payload ->> 'date',
               'kind', s.kind,
               'payload', s.payload
             ) AS h
        FROM client_submissions s
       WHERE s.kind = 'workout'
         AND ((v_link.manual_client_id IS NOT NULL AND s.manual_client_id = v_link.manual_client_id)
           OR (v_link.athlete_id IS NOT NULL AND s.athlete_id = v_link.athlete_id))
       ORDER BY s.submitted_at DESC
       LIMIT 40
    ) q;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'connected', v_link.connected_user_id IS NOT NULL OR v_link.athlete_id IS NOT NULL,
    'you', coalesce(v_you, false),
    'signed_in', v_uid IS NOT NULL,
    'name', CASE WHEN v_you THEN v_link.connected_name ELSE NULL END,
    'locked', v_link.connect_tries >= 8,
    'history', coalesce(v_history, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION link_me(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION link_me(TEXT) TO anon, authenticated;
