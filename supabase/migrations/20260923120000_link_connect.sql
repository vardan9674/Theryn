-- A client connects their Google account to the link the coach sent them.
--
-- The link on its own is not enough. The coach also sends a 6-character code
-- that belongs to that one client and works once, so a forwarded link gets a
-- stranger nowhere. Eight wrong codes lock it until the coach makes a new one.
--
-- Connecting does not move anything: the coach keeps one client record and the
-- link stays the way in. It only records who the client is, which lets the page
-- unlock the rest of the week, their own history, and workouts they add
-- themselves (a run, a swim) on top of the coach's plan.
--
-- link_view and link_submit are left exactly as they are: a client who never
-- connects sees and sends what they always did.

-- ── The code ───────────────────────────────────────────────────────────────
-- No O/0 or I/1: it gets read out over the phone and typed on a small keyboard.
CREATE OR REPLACE FUNCTION gen_connect_code()
RETURNS TEXT
LANGUAGE sql VOLATILE
SET search_path = public, pg_temp
AS $$
  SELECT string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  FROM generate_series(1, 6);
$$;

ALTER TABLE client_links
  ADD COLUMN IF NOT EXISTS connect_code      TEXT,
  ADD COLUMN IF NOT EXISTS connect_tries     INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS connected_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS connected_name    TEXT,
  ADD COLUMN IF NOT EXISTS connected_email   TEXT,
  ADD COLUMN IF NOT EXISTS connected_at      TIMESTAMPTZ;

UPDATE client_links SET connect_code = gen_connect_code() WHERE connect_code IS NULL;
ALTER TABLE client_links ALTER COLUMN connect_code SET DEFAULT gen_connect_code();
ALTER TABLE client_links ALTER COLUMN connect_code SET NOT NULL;

-- ── Connecting ─────────────────────────────────────────────────────────────
-- Signed in (any Google account) + the right code = this client is that account.
CREATE OR REPLACE FUNCTION link_connect(p_token TEXT, p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_link  client_links%ROWTYPE;
  v_uid   UUID := auth.uid();
  v_code  TEXT;
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

  -- An app athlete opening their own link is already that person.
  IF v_link.athlete_id IS NOT NULL AND v_link.athlete_id = v_uid THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  IF v_link.connected_user_id IS NOT NULL THEN
    IF v_link.connected_user_id = v_uid THEN
      RETURN jsonb_build_object('ok', true, 'already', true);
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'taken');
  END IF;

  IF v_link.connect_tries >= 8 THEN RETURN jsonb_build_object('ok', false, 'reason', 'locked'); END IF;

  v_code := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  IF v_code = '' OR v_code IS DISTINCT FROM upper(v_link.connect_code) THEN
    UPDATE client_links SET connect_tries = connect_tries + 1 WHERE id = v_link.id;
    RETURN jsonb_build_object('ok', false, 'reason', 'code', 'left', greatest(0, 8 - (v_link.connect_tries + 1)));
  END IF;

  SELECT coalesce(p.display_name, u.raw_user_meta_data ->> 'full_name'), u.email
    INTO v_name, v_email
    FROM auth.users u LEFT JOIN profiles p ON p.id = u.id
   WHERE u.id = v_uid;

  UPDATE client_links
     SET connected_user_id = v_uid, connected_at = now(), connect_tries = 0,
         connected_name = left(v_name, 120), connected_email = left(v_email, 254)
   WHERE id = v_link.id;

  IF v_link.manual_client_id IS NOT NULL THEN
    UPDATE coach_manual_clients SET linked_athlete_id = v_uid
     WHERE id = v_link.manual_client_id AND linked_athlete_id IS NULL;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── What the page needs to know about the person holding it ────────────────
-- Safe for anyone to call: it says whether the link is connected and whether
-- the caller is that person. Only that person gets the history back.
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
      SELECT jsonb_build_object('date', s.payload ->> 'date', 'kind', s.kind, 'payload', s.payload) AS h
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

-- Connecting is for someone signed in, so anon never gets to call it. The
-- explicit revokes matter: this project grants new functions to anon by
-- default, which REVOKE ... FROM PUBLIC does not undo.
-- gen_connect_code is a column default, so whoever inserts a link runs it.
REVOKE ALL ON FUNCTION gen_connect_code() FROM PUBLIC;
REVOKE ALL ON FUNCTION link_connect(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION link_me(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gen_connect_code() TO authenticated;
GRANT EXECUTE ON FUNCTION link_connect(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION link_me(TEXT) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION gen_connect_code() FROM anon;
REVOKE EXECUTE ON FUNCTION link_connect(TEXT, TEXT) FROM anon;
