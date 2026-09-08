-- ============================================================================
-- Theryn — Wire pg_cron to invoke the process-outbox Edge Function every minute
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any existing schedule to make this idempotent.
SELECT cron.unschedule('process-outbox-every-minute')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'process-outbox-every-minute'
  );

SELECT cron.schedule(
  'process-outbox-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://rmzfisntgiodoadwaewx.supabase.co/functions/v1/process-outbox',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer <SERVICE_ROLE_JWT_REDACTED_USE_VAULT>'
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 50000
  );
  $$
);
