-- Weekly reports a coach chooses to share with a client, and a height for
-- clients who only use their link, so BMI can be shown for them too.
--
-- Nothing is stored until the coach shares. The draft is worked out in the
-- coach's browser each time (src/coach/lib/weeklyReport.js) and never saved,
-- so a report the coach didn't share cannot reach the client by any route.
-- What is stored is the frozen copy the client sees: only the sections the
-- coach left on — never what Theryn noticed or suggested.
--
-- Who can do what:
--   coach   reads their own rows; writes only through report_share / report_stop,
--           and only for their own clients
--   client  reads through their link token only (link_reports): reports that
--           link's coach shared, not stopped. Another coach's never show.
--   anon    no table access at all; may call the two link_* functions, which
--           do nothing without a live link token
-- Proven offline with PGlite: ~/Downloads/GYM App/Theryn-QA-2026-09-25/
-- db-permission-test/coach-reports.test.cjs. Safe to run more than once.


-- 1. Height for link-only clients --------------------------------------------
-- App clients keep theirs on profiles.height_cm. The coach types this one in.
-- Covered by the existing "Coach manages own manual clients" policy.
ALTER TABLE public.coach_manual_clients ADD COLUMN IF NOT EXISTS height_cm numeric;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coach_manual_clients_height_cm_range') THEN
    ALTER TABLE public.coach_manual_clients
      ADD CONSTRAINT coach_manual_clients_height_cm_range CHECK (height_cm IS NULL OR (height_cm >= 50 AND height_cm <= 260));
  END IF;
END $$;


-- 2. Shared reports -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coach_reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  athlete_id       uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  manual_client_id uuid REFERENCES public.coach_manual_clients(id) ON DELETE CASCADE,
  period           text NOT NULL DEFAULT 'week' CHECK (period IN ('week')),
  period_start     date NOT NULL,
  snapshot         jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object' AND octet_length(snapshot::text) <= 20000),
  shared_at        timestamptz NOT NULL DEFAULT now(),
  stopped_at       timestamptz,
  seen_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coach_reports_one_client CHECK ((athlete_id IS NULL) <> (manual_client_id IS NULL))
);
-- One report per client per week. Sharing it again replaces it.
CREATE UNIQUE INDEX IF NOT EXISTS coach_reports_one_per_period
  ON public.coach_reports (coach_id, (coalesce(athlete_id, manual_client_id)), period, period_start);
CREATE INDEX IF NOT EXISTS coach_reports_athlete ON public.coach_reports (athlete_id) WHERE athlete_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS coach_reports_manual ON public.coach_reports (manual_client_id) WHERE manual_client_id IS NOT NULL;

ALTER TABLE public.coach_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Coach reads own shared reports" ON public.coach_reports;
CREATE POLICY "Coach reads own shared reports" ON public.coach_reports
  FOR SELECT TO authenticated USING (coach_id = (SELECT auth.uid()));

-- Supabase grants every new table to anon and authenticated, TRUNCATE included,
-- and RLS does not stop TRUNCATE. Take it all back and give back reading only.
REVOKE ALL ON public.coach_reports FROM PUBLIC;
REVOKE ALL ON public.coach_reports FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.coach_reports FROM authenticated;
GRANT SELECT ON public.coach_reports TO authenticated;


-- 3. Coach: share a week, or stop sharing it -------------------------------------
CREATE OR REPLACE FUNCTION public.report_share(p_athlete_id uuid, p_manual_client_id uuid, p_period_start date, p_snapshot jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  me   uuid := auth.uid();
  v_id uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'sign in to share a report' USING ERRCODE = '42501'; END IF;
  IF (p_athlete_id IS NULL) = (p_manual_client_id IS NULL) THEN
    RAISE EXCEPTION 'pick one client' USING ERRCODE = '22023';
  END IF;
  IF p_manual_client_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM coach_manual_clients WHERE id = p_manual_client_id AND coach_id = me AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'not your client' USING ERRCODE = '42501';
  END IF;
  IF p_athlete_id IS NOT NULL AND NOT is_coach_of(p_athlete_id, 'view') THEN
    RAISE EXCEPTION 'not your client' USING ERRCODE = '42501';
  END IF;
  IF p_period_start IS NULL OR extract(isodow FROM p_period_start) <> 1 THEN
    RAISE EXCEPTION 'a week starts on a Monday' USING ERRCODE = '22023';
  END IF;
  IF p_period_start > current_date + 7 OR p_period_start < current_date - 400 THEN
    RAISE EXCEPTION 'that week is out of range' USING ERRCODE = '22023';
  END IF;
  IF p_snapshot IS NULL OR jsonb_typeof(p_snapshot) <> 'object' OR octet_length(p_snapshot::text) > 20000 THEN
    RAISE EXCEPTION 'that report is not valid' USING ERRCODE = '22023';
  END IF;

  INSERT INTO coach_reports (coach_id, athlete_id, manual_client_id, period, period_start, snapshot)
  VALUES (me, p_athlete_id, p_manual_client_id, 'week', p_period_start, p_snapshot)
  ON CONFLICT (coach_id, (coalesce(athlete_id, manual_client_id)), period, period_start)
  DO UPDATE SET snapshot = excluded.snapshot, shared_at = now(), stopped_at = NULL, seen_at = NULL
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id);
END $$;

CREATE OR REPLACE FUNCTION public.report_stop(p_report uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sign in first' USING ERRCODE = '42501'; END IF;
  UPDATE coach_reports SET stopped_at = now()
   WHERE id = p_report AND coach_id = auth.uid() AND stopped_at IS NULL;
  RETURN FOUND;
END $$;


-- 4. Client: through their link token only ------------------------------------
-- Same token check as link_view: the raw token is hashed and must match a link
-- that isn't turned off. sha256() here is Postgres's own and gives the same hex
-- as pgcrypto's digest(), which link_view uses (checked on production).
CREATE OR REPLACE FUNCTION public.link_reports(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_link client_links%ROWTYPE;
BEGIN
  IF p_token IS NULL OR length(p_token) < 20 OR length(p_token) > 128 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  SELECT * INTO v_link FROM client_links WHERE token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  IF NOT FOUND OR v_link.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'revoked');
  END IF;
  RETURN jsonb_build_object('ok', true, 'reports', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', r.id, 'period_start', r.period_start, 'shared_at', r.shared_at,
             'seen', r.seen_at IS NOT NULL, 'snapshot', r.snapshot) ORDER BY r.period_start DESC)
      FROM (SELECT * FROM coach_reports c
             WHERE c.coach_id = v_link.coach_id
               AND c.stopped_at IS NULL
               AND ((v_link.manual_client_id IS NOT NULL AND c.manual_client_id = v_link.manual_client_id)
                 OR (v_link.athlete_id IS NOT NULL AND c.athlete_id = v_link.athlete_id))
             ORDER BY c.period_start DESC
             LIMIT 12) r
  ), '[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.link_report_seen(p_token text, p_report uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_link client_links%ROWTYPE;
BEGIN
  IF p_token IS NULL OR length(p_token) < 20 OR length(p_token) > 128 OR p_report IS NULL THEN RETURN false; END IF;
  SELECT * INTO v_link FROM client_links WHERE token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  IF NOT FOUND OR v_link.revoked_at IS NOT NULL THEN RETURN false; END IF;
  UPDATE coach_reports c SET seen_at = now()
   WHERE c.id = p_report AND c.seen_at IS NULL AND c.stopped_at IS NULL
     AND c.coach_id = v_link.coach_id
     AND ((v_link.manual_client_id IS NOT NULL AND c.manual_client_id = v_link.manual_client_id)
       OR (v_link.athlete_id IS NOT NULL AND c.athlete_id = v_link.athlete_id));
  RETURN FOUND;
END $$;


-- 5. Who may call what -----------------------------------------------------------
-- REVOKE FROM PUBLIC alone leaves Supabase's explicit anon grant in place, and
-- revoking from anon alone leaves PUBLIC's: both, every time.
REVOKE ALL ON FUNCTION public.report_share(uuid, uuid, date, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.report_share(uuid, uuid, date, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.report_share(uuid, uuid, date, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.report_stop(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.report_stop(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.report_stop(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.link_reports(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_reports(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.link_report_seen(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_report_seen(text, uuid) TO anon, authenticated;
