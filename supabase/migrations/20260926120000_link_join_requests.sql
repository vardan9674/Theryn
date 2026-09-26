-- A client can ask to join, and the coach waves them in.
--
-- Connecting an account to a link needed a 6-character code the coach had to
-- send separately. Nobody used it: every client already holds their link, and
-- asking them to type a code — one easily confused with the coach's own invite
-- code — meant nobody connected at all.
--
-- Two ways in from here, both starting on the same button:
--
--   · the coach sends an invite link that already carries the code, and the
--     client is connected the moment they sign in (link_connect, unchanged);
--   · the client taps it on the ordinary link they already have, which asks
--     the coach. The coach sees who is asking — name and email from their
--     Google account — and waves them in or dismisses them.
--
-- The second one is why this exists. Links travel through WhatsApp and get
-- forwarded, so someone holding a forwarded link must not be able to take a
-- client's account quietly. The coach's tap is that check, and it costs the
-- client nothing: nothing to be told, nothing to type.
--
-- Connecting still moves nothing. It writes who the client is on the link
-- their coach already has; the plan, the check-ins, the measurements and the
-- payments stay exactly where they are.

-- ── Who has asked ──────────────────────────────────────────────────────────
-- One row per person per link. A second request from the same person just
-- refreshes theirs; two different people can both be waiting, and the coach
-- picks. Requests are written and cleared only by the functions below.
CREATE TABLE IF NOT EXISTS client_link_requests (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id    UUID NOT NULL REFERENCES client_links(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name       TEXT,
  email      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (link_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_client_link_requests_link ON client_link_requests (link_id, created_at DESC);

ALTER TABLE client_link_requests ENABLE ROW LEVEL SECURITY;

-- The coach reads the requests on their own links. Nobody writes directly:
-- the client asks through link_request_connect, the coach answers through
-- link_join_decide, and both are SECURITY DEFINER.
DROP POLICY IF EXISTS "Coach reads requests on own links" ON client_link_requests;
CREATE POLICY "Coach reads requests on own links" ON client_link_requests
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM client_links l
                  WHERE l.id = client_link_requests.link_id
                    AND l.coach_id = (SELECT auth.uid())));
REVOKE INSERT, UPDATE, DELETE ON client_link_requests FROM anon, authenticated;

-- ── The client asks ────────────────────────────────────────────────────────
-- Signed in, holding the link, not connected to anyone yet.
CREATE OR REPLACE FUNCTION link_request_connect(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_link  client_links%ROWTYPE;
  v_uid   UUID := auth.uid();
  v_name  TEXT;
  v_email TEXT;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'signin'); END IF;
  IF p_token IS NULL OR length(p_token) < 20 OR length(p_token) > 128 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  SELECT * INTO v_link FROM client_links WHERE token_hash = encode(digest(p_token, 'sha256'), 'hex');
  IF NOT FOUND OR v_link.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'revoked');
  END IF;

  -- Already theirs, or already someone else's: nothing to ask for.
  IF v_link.athlete_id = v_uid OR v_link.connected_user_id = v_uid THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;
  IF v_link.connected_user_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'taken');
  END IF;

  SELECT coalesce(p.display_name, u.raw_user_meta_data ->> 'full_name'), u.email
    INTO v_name, v_email
    FROM auth.users u LEFT JOIN profiles p ON p.id = u.id
   WHERE u.id = v_uid;

  INSERT INTO client_link_requests (link_id, user_id, name, email)
  VALUES (v_link.id, v_uid, left(v_name, 120), left(v_email, 254))
  ON CONFLICT (link_id, user_id) DO UPDATE
    SET name = EXCLUDED.name, email = EXCLUDED.email, created_at = now();

  RETURN jsonb_build_object('ok', true, 'pending', true);
END;
$$;

-- ── The coach answers ──────────────────────────────────────────────────────
-- Approving writes the same fields link_connect writes, so a client who was
-- waved in and one who used an invite link end up identical.
CREATE OR REPLACE FUNCTION link_join_decide(p_request_id UUID, p_approve BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_req  client_link_requests%ROWTYPE;
  v_link client_links%ROWTYPE;
  v_uid  UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'signin'); END IF;

  SELECT * INTO v_req FROM client_link_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'gone'); END IF;

  SELECT * INTO v_link FROM client_links WHERE id = v_req.link_id;
  IF NOT FOUND OR v_link.coach_id <> v_uid THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_yours');
  END IF;

  IF NOT p_approve THEN
    DELETE FROM client_link_requests WHERE id = v_req.id;
    RETURN jsonb_build_object('ok', true, 'approved', false);
  END IF;

  IF v_link.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'revoked'); END IF;
  IF v_link.connected_user_id IS NOT NULL AND v_link.connected_user_id <> v_req.user_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'taken');
  END IF;

  UPDATE client_links
     SET connected_user_id = v_req.user_id, connected_at = now(), connect_tries = 0,
         connected_name = v_req.name, connected_email = v_req.email
   WHERE id = v_link.id;

  IF v_link.manual_client_id IS NOT NULL THEN
    UPDATE coach_manual_clients SET linked_athlete_id = v_req.user_id
     WHERE id = v_link.manual_client_id AND linked_athlete_id IS NULL;
  END IF;

  -- Whoever else was waiting on this link is no longer waiting.
  DELETE FROM client_link_requests WHERE link_id = v_link.id;

  RETURN jsonb_build_object('ok', true, 'approved', true);
END;
$$;

-- ── The page needs to know it is waiting ───────────────────────────────────
-- link_me, unchanged except for `waiting`: true when the person holding the
-- link has asked and the coach hasn't answered yet.
CREATE OR REPLACE FUNCTION link_me(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_link    client_links%ROWTYPE;
  v_uid     UUID := auth.uid();
  v_you     BOOLEAN;
  v_waiting BOOLEAN := false;
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

  IF v_uid IS NOT NULL AND NOT coalesce(v_you, false) THEN
    SELECT EXISTS (SELECT 1 FROM client_link_requests r
                    WHERE r.link_id = v_link.id AND r.user_id = v_uid
                      AND r.created_at > now() - interval '14 days')
      INTO v_waiting;
  END IF;

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
    'waiting', coalesce(v_waiting, false),
    'signed_in', v_uid IS NOT NULL,
    'name', CASE WHEN v_you THEN v_link.connected_name ELSE NULL END,
    'locked', v_link.connect_tries >= 8,
    'history', coalesce(v_history, '[]'::jsonb)
  );
END;
$$;

-- Asking and answering both need a signed-in account; anon never does either.
REVOKE ALL ON FUNCTION link_request_connect(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION link_join_decide(UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION link_me(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION link_request_connect(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION link_join_decide(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION link_me(TEXT) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION link_request_connect(TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION link_join_decide(UUID, BOOLEAN) FROM anon;
