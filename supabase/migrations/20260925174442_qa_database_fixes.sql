-- The remaining database items from the QA pass of 2026-09-25.
--
--   #99  workout_sets gets distance + duration_seconds, so cardio is saved.
--   #107 A conversation can only be opened between a coach and an athlete who
--        have an accepted coach link (it was: any user with anyone).
--   #108 Nobody can write routines_archive directly; only the plan RPCs do
--        (it was: INSERT WITH CHECK (true) for every role, anon included).
--   #117 search_exercises runs with the caller's rights, so row security
--        decides whose custom exercises it can see (it trusted any user_uid);
--        delete_device_token and the outbox functions are for the service role
--        only; the process-outbox edge function checks a secret kept in Vault.
--
-- What changes for people using Theryn today: nothing they can see. The app
-- already opens conversations only for accepted pairs, never writes the
-- archive itself, searches only as itself (or a coach for their athlete), and
-- never calls the push functions. No existing row changes.
--
-- Order: apply this, then deploy supabase/functions/process-outbox (the cron
-- job starts sending the secret here; the old function simply ignores it).
-- Safe to run more than once.

-- ═══ #99 cardio sets ═══════════════════════════════════════════════════════
ALTER TABLE workout_sets ADD COLUMN IF NOT EXISTS distance NUMERIC(8,2)
  CHECK (distance IS NULL OR (distance >= 0 AND distance <= 1000));
ALTER TABLE workout_sets ADD COLUMN IF NOT EXISTS duration_seconds INTEGER
  CHECK (duration_seconds IS NULL OR (duration_seconds >= 0 AND duration_seconds <= 86400));

-- ═══ #107 conversations only for accepted pairs ═══════════════════════════
DROP POLICY IF EXISTS conv_participant_insert ON conversations;
CREATE POLICY conv_participant_insert ON conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    ((SELECT auth.uid()) = coach_id OR (SELECT auth.uid()) = athlete_id)
    AND EXISTS (
      SELECT 1 FROM coach_athletes ca
       WHERE ca.coach_id = conversations.coach_id
         AND ca.athlete_id = conversations.athlete_id
         AND ca.status = 'accepted'
    )
  );

-- ═══ #108 routines_archive is written by the plan RPCs only ═══════════════
DROP POLICY IF EXISTS "Service can insert archive" ON routines_archive;
REVOKE INSERT, UPDATE, DELETE ON routines_archive FROM anon, authenticated;

-- ═══ #117 functions that trusted the caller ═══════════════════════════════
-- Row security on user_exercises / coach_athletes already allows exactly the
-- right rows (your own, your athletes', your coach's), so running as the
-- caller is the whole fix; the body is unchanged.
ALTER FUNCTION public.search_exercises(text, uuid) SECURITY INVOKER;

-- Nothing in the app calls these; the edge function uses the service role.
REVOKE EXECUTE ON FUNCTION public.delete_device_token(text)                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_outbox_batch(integer)              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_outbox_sent(uuid)                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_outbox_failed(uuid, text, integer)  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.delete_device_token(text)                TO service_role;
GRANT  EXECUTE ON FUNCTION public.claim_outbox_batch(integer)              TO service_role;
GRANT  EXECUTE ON FUNCTION public.mark_outbox_sent(uuid)                   TO service_role;
GRANT  EXECUTE ON FUNCTION public.mark_outbox_failed(uuid, text, integer)  TO service_role;

-- The cron job → edge function secret. Made once, kept in Vault, never in a file.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'outbox_cron_secret') THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'outbox_cron_secret',
      'Shared secret: pg_cron → process-outbox edge function (#117)');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION outbox_cron_secret_ok(p_secret TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_secret IS NOT NULL AND p_secret = (
    SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'outbox_cron_secret' LIMIT 1
  );
$$;
REVOKE ALL ON FUNCTION outbox_cron_secret_ok(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION outbox_cron_secret_ok(TEXT) TO service_role;

-- The cron job sends it, read from Vault at run time. Only the header list
-- changes; the URL, the key already there and the schedule stay as they are.
DO $$
DECLARE v_job RECORD;
BEGIN
  SELECT jobid, command INTO v_job FROM cron.job WHERE jobname = 'process-outbox-every-minute';
  IF FOUND AND position('x-cron-secret' IN v_job.command) = 0 THEN
    PERFORM cron.alter_job(v_job.jobid, command := regexp_replace(
      v_job.command,
      '''Content-Type'',\s*''application/json'',',
      '''Content-Type'', ''application/json'', ''x-cron-secret'', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = ''outbox_cron_secret'' LIMIT 1),'
    ));
  END IF;
END $$;

-- ═══ Check after applying ═════════════════════════════════════════════════
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'workout_sets' AND column_name IN ('distance','duration_seconds');
--   SELECT policyname, with_check FROM pg_policies WHERE tablename IN ('conversations','routines_archive');
--   SELECT p.proname, p.prosecdef, (SELECT string_agg(a.grantee::regrole::text, ',') FROM aclexplode(p.proacl) a WHERE a.privilege_type = 'EXECUTE')
--     FROM pg_proc p WHERE p.proname IN ('search_exercises','delete_device_token','claim_outbox_batch','mark_outbox_sent','mark_outbox_failed','outbox_cron_secret_ok');
--   SELECT position('x-cron-secret' IN command) > 0 FROM cron.job WHERE jobname = 'process-outbox-every-minute';
