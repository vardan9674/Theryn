-- A client can see and correct their own workouts without connecting first.
--
-- link_me only returned a client's workouts once they had connected a Google
-- account. Almost nobody has, so on an ordinary link "Edit workout" had
-- nothing to reopen and the page could only offer "Log another" — which is
-- how a coach ends up with two workouts for one day.
--
-- The workouts now come back to whoever holds the link. That is the same
-- trust the link already carries: holding it already shows the whole week's
-- plan (link_view) and already allows sending workouts as that client
-- (link_submit). Reading back the ones they sent is no wider.
--
-- Two things stay narrower than the rest:
--   · the connected account's name is still only shown to that account
--   · a workout the coach logged on the client's behalf comes back without
--     its id, so the page shows it as sent but offers no edit — the coach's
--     own record is theirs, and link_submit only ever replaces by id.

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

  -- This client's own recent workouts, for the page to show what went and to
  -- reopen it. Workouts only: measurements are not editable from here.
  SELECT coalesce(jsonb_agg(q.h), '[]'::jsonb) INTO v_history FROM (
    SELECT jsonb_build_object(
             'id', CASE WHEN coalesce(s.payload ->> 'logged_by', '') = 'coach' THEN NULL ELSE s.id END,
             'at', s.submitted_at,
             'date', s.payload ->> 'date',
             'kind', s.kind,
             'by_coach', coalesce(s.payload ->> 'logged_by', '') = 'coach',
             'payload', s.payload
           ) AS h
      FROM client_submissions s
     WHERE s.kind = 'workout'
       AND s.submitted_at > now() - interval '60 days'
       AND ((v_link.manual_client_id IS NOT NULL AND s.manual_client_id = v_link.manual_client_id)
         OR (v_link.athlete_id IS NOT NULL AND s.athlete_id = v_link.athlete_id))
     ORDER BY s.submitted_at DESC
     LIMIT 40
  ) q;

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
