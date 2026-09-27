-- Fix coaching_relationships RLS and drop the service_role key from pg_cron (2026-09-19)

-- ---------------------------------------------------------------------------
-- 1. coaching_relationships policies looked up the caller's email with
--    (SELECT email FROM auth.users ...). The authenticated role cannot read
--    auth.users, so every SELECT/UPDATE on coaching_relationships failed with
--    "permission denied for table users" — and so did coach_activity_log,
--    whose policies read coaching_relationships. Read the email from the
--    caller's JWT instead (same value, no extra table access).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Coaches can see invites to them" ON public.coaching_relationships;
CREATE POLICY "Coaches can see invites to them" ON public.coaching_relationships
  FOR SELECT
  USING (
    coach_id = (SELECT auth.uid())
    OR coach_email = (SELECT auth.jwt() ->> 'email')
  );

DROP POLICY IF EXISTS "Coaches can accept invites" ON public.coaching_relationships;
CREATE POLICY "Coaches can accept invites" ON public.coaching_relationships
  FOR UPDATE
  USING (
    coach_email = (SELECT auth.jwt() ->> 'email')
    AND status = 'pending'
  )
  WITH CHECK (status = ANY (ARRAY['accepted', 'declined']));

-- ---------------------------------------------------------------------------
-- 2. The process-outbox cron job carried the service_role JWT in plain text.
--    The function only needs the gateway's JWT check to pass (it uses its own
--    injected service key internally), so the public anon key is enough.
--    This key already ships in the client app; it is not a secret.
-- ---------------------------------------------------------------------------
DO $$
DECLARE j record;
BEGIN
  SELECT jobid, command INTO j FROM cron.job WHERE jobname = 'process-outbox-every-minute';
  IF j.jobid IS NOT NULL THEN
    PERFORM cron.alter_job(
      j.jobid,
      command := regexp_replace(
        j.command,
        'Bearer [A-Za-z0-9._-]+',
        'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtemZpc250Z2lvZG9hZHdhZXd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMzkzNjYsImV4cCI6MjA5MDkxNTM2Nn0.1Q4BvZE_2Ou-TbGOiRSxXvZUCgKVxWSypS_Y8SaSsOk'
      )
    );
  END IF;
END $$;
