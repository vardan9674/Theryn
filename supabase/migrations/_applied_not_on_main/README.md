# Applied to production, never committed to `main`

Eight migrations that were applied straight to the live project
(`rmzfisntgiodoadwaewx`) on 19–20 September 2026 and recorded in
`supabase_migrations.schema_migrations`, but whose files only ever existed as
untracked files in a working tree. Archived here on 2026-09-26 so the SQL and
the reasoning behind it are not lost to a stray `git clean`.

**This branch is a record, not something to merge.** The database already has
all of it; re-running is unnecessary and two files would fail outright (see
below). Nothing here is on `main`, deliberately.

## What they are

### Advisor cleanup, 19 September

| File | What it did |
|---|---|
| `20260919140000_db_optimizations.sql` | The big one. `supabase inspect db` found 92% of DB execution time was pg_net cleaning up `net._http_response` and 7% was `net.http_post`, all from the process-outbox cron firing 1,440×/day against an empty outbox; `cron.job_run_details` (171 MB) and `net._http_response` (164 MB) dominated storage. Adds partial index `idx_notify_outbox_due`, wraps the cron command in `WHERE EXISTS (...)` so it only calls the edge function when there is work, purges `job_run_details` older than 3 days plus a nightly 03:17 purge job, and rewrites every RLS policy in `public` to use `(SELECT auth.uid())` instead of bare `auth.uid()` so it is evaluated once per query rather than per row. |
| `20260919160000_rls_index_security_cleanup.sql` | Drops ~15 redundant RLS policies (exact duplicates, or fully covered by a broader policy on the same table and command). No change to what any user can see or write. |
| `20260919170000_fix_coaching_rls_and_cron_key.sql` | Two fixes. Policies on `coaching_relationships` called `SELECT email FROM auth.users`, which `authenticated` cannot read, so every SELECT/UPDATE failed with "permission denied for table users" and cascaded to `coach_activity_log`; rewritten to read the email from the JWT. Also replaced the `service_role` JWT that the process-outbox cron job carried in plaintext with the anon key (the edge function uses its own injected service key internally). |

### Admin / observability stack, 20 September

`20260920173034_admin_health_and_stats.sql` is the feature: creates
`admin_users`, `health_checks`, `is_admin()`, `assert_admin()`,
`admin_stats()`, `admin_capacity()` and `admin_push_health()`, with RLS and
admin-only read policies. The app proper uses none of it; it exists for the
admin dashboard and `ops/health-check.mjs`.

The other four are same-day fixes to it:

| File | Fixes |
|---|---|
| `20260920173152_admin_push_health_column_fix.sql` | `notify_outbox` has no `updated_at`; use `send_at` for the real backlog and `claimed_at` to spot rows claimed but never finished |
| `20260920173210_admin_capacity_ambiguous_relname_fix.sql` | `pg_class` and `pg_stat_user_tables` both expose `relname` → "column reference relname is ambiguous" |
| `20260920173247_admin_stats_role_from_links.sql` | `profiles.role` is NULL for every user, so coaches/athletes are derived from real coaching links instead |
| `20260920173304_admin_assert_admin_revoke_anon.sql` | `assert_admin()` was callable by anon via `/rest/v1/rpc/assert_admin`; revoked |

## Why these were not put on `main`

**Two would break a fresh rebuild.** `coaching_relationships` was never created
by any migration — it existed only because it was made in the SQL editor, and
production dropped it in `20260926153719_drop_coaching_relationships`. But
`20260919160000` line 58 does `CREATE INDEX ... ON public.coaching_relationships`
and `20260919170000` creates policies on it, so `supabase db reset` would fail
on both. (`0040_messaging.sql` carries a note about this same confusion.)

**One assumes pg_cron.** `20260919140000` queries `cron.job` directly, which
errors on a local stack without the extension.

**Committing them would not buy reproducibility anyway.** The schema is already
not rebuildable from `main`: 24 migrations are applied under a different version
than their filename, `main` still carries duplicate prefixes (`004_messaging`
and `004_user_role`), and `_recovered_push_notifications/` 007–009 are
unapplied. Fixing that is a full reconciliation, not these eight files.

## Open question, if the admin work resumes

The admin stack is only half committed: `src/admin/`, `admin-site/`,
`admin.html`, `ops/`, `vite.admin.config.ts` and
`.github/workflows/health-check.yml` were also untracked as of 2026-09-26, and
`health_checks` had **0 rows**, meaning `ops/health-check.mjs` had never
successfully run. If that feature is picked up again it should land as one PR
with the SQL and the app code together — not as migrations alone. The
`admin_stats` workaround is still needed: all 11 profiles had `role IS NULL`
even after role persistence landed in #148.
