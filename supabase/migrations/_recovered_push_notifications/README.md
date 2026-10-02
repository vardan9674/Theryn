# Recovered push-notification migrations (NOT applied by the CLI)

These files were found only inside the gitignored agent worktree
`.claude/worktrees/festive-ishizaka-148a08/` on 2026-09-08. They define the
schema that `supabase/functions/process-outbox` and `src/hooks/usePushNotifications.ts`
depend on (`device_tokens`, `notify_outbox`, `enqueue_notification`,
`claim_outbox_batch`, quiet-hours / budget helpers, notification triggers,
pg_cron jobs).

On 2026-09-19 the two that the remote project had recorded were promoted to the
top-level folder as `0050_push_notifications.sql` and `0060_notify_cron.sql`, and
remote history was repaired to match (`supabase db push --dry-run` reports up to
date). The three files left here (007–009) are not in remote history, and at
least their pg_cron jobs are not present in the live database, so do not promote
them without checking what they would change.

The Supabase CLI only reads top-level `supabase/migrations/*.sql`, so nothing in
this folder is applied automatically.

`0060_notify_cron.sql` originally embedded a live service_role JWT; the file has a
placeholder. The live `process-outbox-every-minute` cron job still carries a literal
key. Rotate that key and re-schedule the job to read the secret from Supabase Vault.
