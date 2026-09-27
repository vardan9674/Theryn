-- Take TRUNCATE (and REFERENCES, TRIGGER) off anon and authenticated everywhere.
--
-- Every table here has RLS enabled with policies that gate on auth.uid(), so
-- anon (auth.uid() IS NULL) already matches no rows for SELECT/INSERT/UPDATE/
-- DELETE. TRUNCATE is the exception: it is not a row-level operation, so no
-- policy restrains it. It was granted on 31 tables.
--
-- This was NOT reachable when found: PostgREST exposes no TRUNCATE verb, and
-- no anon-callable function runs dynamic SQL (the five SECURITY DEFINER
-- functions anon may execute -- is_coach_of, is_conversation_participant,
-- link_me, link_submit, link_view -- all pin search_path and contain no
-- EXECUTE or format()). So this is defence in depth, not an incident. It stays
-- a landmine while granted: the first SECURITY DEFINER function with dynamic
-- SQL, or any direct SQL path, would turn it into total data loss with no
-- row-level check in the way.
--
-- REFERENCES goes too (it lets a grantee pin rows against deletion via a
-- foreign key) and TRIGGER likewise; neither role has any use for either, and
-- both are DDL-time privileges the app never exercises.
--
-- Safe: nothing in the app truncates -- checked src/, supabase/, supabase/
-- functions/, and the ops/ and admin-site/ tooling. The table owner (postgres)
-- keeps every privilege implicitly, and service_role holds its own explicit
-- grants, so migrations, edge functions and the admin site are unaffected.
-- There is no PUBLIC grant on any of these, so PUBLIC is not named.
--
-- Extends the pattern already used for the exercise tables in
-- 20260926193523_exercise_muscle_reports.sql to the rest of the schema.

REVOKE TRUNCATE, REFERENCES, TRIGGER ON
  public.active_sessions,
  public.admin_users,
  public.ai_imports,
  public.body_measurements,
  public.body_weights,
  public.client_link_requests,
  public.client_links,
  public.client_submissions,
  public.coach_activity_log,
  public.coach_athletes,
  public.coach_client_fees,
  public.coach_manual_clients,
  public.coach_payments,
  public.conversation_reads,
  public.conversations,
  public.device_tokens,
  public.health_checks,
  public.messages,
  public.notify_outbox,
  public.personal_records,
  public.profiles,
  public.public_exercises,
  public.routine_days,
  public.routine_exercises,
  public.routine_template_assignments,
  public.routine_template_days,
  public.routine_template_exercises,
  public.routine_templates,
  public.routines,
  public.routines_archive,
  public.user_exercises,
  public.workout_sessions,
  public.workout_sets
FROM anon, authenticated;

-- The two reporting views. Both already carry security_invoker=true, so they
-- read under the caller's RLS and expose nothing to anon; these grants were
-- merely meaningless on a view.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON
  public.best_lifts,
  public.weekly_volume
FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
