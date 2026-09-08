# Seeing what the backend is doing

The UI shows the client. Everything below shows the server side. All of it is read-only.

## 1. Supabase dashboard (https://supabase.com/dashboard/project/rmzfisntgiodoadwaewx)

| Page | What you see |
|---|---|
| Table Editor | Live rows in every table. Start with `profiles`, `coach_athletes`, `notify_outbox` |
| SQL Editor | Run the queries below |
| Logs → Postgres | Every query error, slow query, RLS denial |
| Logs → API | Every PostgREST request from the app with status code |
| Logs → Auth | Sign-ins, token refreshes, OAuth failures |
| Edge Functions → process-outbox → Logs | Each cron invocation, `{ processed: n }`, and any thrown error |
| Database → Functions | The 18 RPCs; click one to read its SQL |
| Database → Policies | RLS policies per table |
| Database → Extensions | Confirm `pg_cron`, `pg_net`, `pg_trgm` are on |
| Integrations → Cron | The scheduled jobs and their last run |

## 2. Queries to paste into the SQL Editor

Cron jobs and whether they are running:

```sql
select jobid, jobname, schedule, active from cron.job order by jobid;

select jobname, status, return_message, start_time
from cron.job_run_details d join cron.job j using (jobid)
order by start_time desc limit 30;
```

Push outbox health (what was queued, sent, dropped, failed in the last day):

```sql
select status, channel, count(*), max(sent_at)
from notify_outbox
where created_at > now() - interval '1 day'
group by 1, 2 order by 1, 2;

select id, user_id, channel, priority, status, attempts, last_error, send_at
from notify_outbox where status in ('failed','dropped')
order by send_at desc limit 20;
```

Registered devices:

```sql
select platform, count(*), max(last_seen_at) from device_tokens group by 1;
```

Who is using the app:

```sql
select role, count(*) from profiles group by 1;

select date_trunc('day', started_at) as day, count(*) as sessions
from workout_sessions where started_at > now() - interval '30 days'
group by 1 order by 1 desc;
```

Which migrations the remote database believes are applied:

```sql
select version, name from supabase_migrations.schema_migrations order by version;
```

Functions missing a pinned search_path (should return zero rows after Roadmap 0.6):

```sql
select p.proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');
```

Name-only clients (added by the coach without an app account):

```sql
select id, first_name, last_name, jsonb_array_length(payments) as payments, fee is not null as has_fee, plan is not null as has_plan, updated_at
from coach_manual_clients order by updated_at desc;
```

If that query says the table does not exist, run `supabase/migrations/20260909120000_coach_manual_clients.sql` here in the SQL editor.

## 3. From the terminal

```bash
supabase migration list          # local vs remote migration versions
supabase functions list          # deployed edge functions
supabase functions logs process-outbox
supabase db pull --schema public # write the real remote schema to a local migration file for comparison
```

## 4. From the app itself

- Browser DevTools → Network, filter `rest/v1` to see every table query and `rpc/` call the UI makes.
- Filter `realtime/v1` to see the WebSocket channels.
- Application → IndexedDB → `theryn-offline` shows queued offline actions and messages.
- Application → Local Storage shows role, routine cache, in-progress workout.

## 5. Web hosting

- Vercel dashboard → Deployments shows each production build and its logs.
