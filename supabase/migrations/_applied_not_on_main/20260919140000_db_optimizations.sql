-- DB optimizations (2026-09-19)
--
-- Findings from `supabase inspect db` on the linked project:
--   * 92% of all DB execution time was pg_net cleaning up net._http_response,
--     and another 7% was net.http_post itself. Both come from the
--     process-outbox-every-minute cron job, which POSTs to the edge function
--     1,440 times a day even when the outbox is empty.
--   * cron.job_run_details (171 MB) and net._http_response (164 MB) made up
--     335 MB of the 352 MB database. App tables total < 3 MB.
--   * ~70 RLS policies call auth.uid() directly, so Postgres re-evaluates it
--     per row instead of once per statement.

-- ---------------------------------------------------------------------------
-- 1. Only call process-outbox when there is work for it.
--    Mirrors the conditions claim_outbox_batch() acts on: due pending rows,
--    or 'sending' rows stuck > 5 minutes that it would recover.
--    The existing command is rewritten in place so the service key stays out
--    of the repo.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_notify_outbox_due
  ON public.notify_outbox (send_at)
  WHERE status IN ('pending', 'sending');

DO $$
DECLARE
  j record;
BEGIN
  SELECT jobid, command INTO j
  FROM cron.job
  WHERE jobname = 'process-outbox-every-minute';

  IF j.jobid IS NOT NULL AND j.command NOT ILIKE '%WHERE EXISTS%' THEN
    PERFORM cron.alter_job(
      j.jobid,
      command := rtrim(j.command, E' \n\t;') || $cmd$
WHERE EXISTS (
  SELECT 1 FROM public.notify_outbox
  WHERE (status = 'pending' AND send_at <= now())
     OR (status = 'sending' AND claimed_at < now() - INTERVAL '5 minutes')
);$cmd$
    );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Keep cron's own run log from growing forever (keep 3 days).
-- ---------------------------------------------------------------------------
DELETE FROM cron.job_run_details WHERE end_time < now() - INTERVAL '3 days';

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'purge-cron-run-details';
SELECT cron.schedule(
  'purge-cron-run-details',
  '17 3 * * *',
  $$DELETE FROM cron.job_run_details WHERE end_time < now() - INTERVAL '3 days'$$
);

-- ---------------------------------------------------------------------------
-- 3. RLS: wrap auth.uid() in a scalar subquery so it is evaluated once per
--    statement (initPlan) instead of once per row. Logic is unchanged.
--    Skips occurrences already wrapped as "SELECT auth.uid()".
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  p record;
  new_qual  text;
  new_check text;
  stmt      text;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (qual ~ '(?<!SELECT )auth\.uid\(\)' OR with_check ~ '(?<!SELECT )auth\.uid\(\)')
  LOOP
    new_qual  := regexp_replace(p.qual,       '(?<!SELECT )auth\.uid\(\)', '(SELECT auth.uid())', 'g');
    new_check := regexp_replace(p.with_check, '(?<!SELECT )auth\.uid\(\)', '(SELECT auth.uid())', 'g');

    stmt := format('ALTER POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
    IF new_qual IS NOT NULL THEN
      stmt := stmt || format(' USING (%s)', new_qual);
    END IF;
    IF new_check IS NOT NULL THEN
      stmt := stmt || format(' WITH CHECK (%s)', new_check);
    END IF;
    EXECUTE stmt;
  END LOOP;
END $$;
