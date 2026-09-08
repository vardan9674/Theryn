# Recovered push-notification migrations (NOT applied by the CLI)

These five files were found only inside the gitignored agent worktree
`.claude/worktrees/festive-ishizaka-148a08/` on 2026-09-08. They define the
schema that `supabase/functions/process-outbox` and `src/hooks/usePushNotifications.ts`
depend on (`device_tokens`, `notify_outbox`, `enqueue_notification`,
`claim_outbox_batch`, quiet-hours / budget helpers, notification triggers,
pg_cron jobs). The remote project already has at least 005 and 006 applied.

The Supabase CLI only reads top-level `supabase/migrations/*.sql`, so nothing in
this folder is applied automatically. Before promoting them:

1. `006_notify_cron.sql` originally embedded a live service_role JWT. It has been
   replaced with a placeholder here. Rotate that key and re-schedule the cron job
   reading the secret from Supabase Vault instead of a literal.
2. Renumber to unique timestamps (`supabase migration new ...`) after reconciling
   with `supabase migration list`, then `supabase migration repair` as needed.
