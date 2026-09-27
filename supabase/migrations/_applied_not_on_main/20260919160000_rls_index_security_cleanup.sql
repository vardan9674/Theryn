-- RLS, index and function-security cleanup (2026-09-19)
--
-- From the Supabase performance/security advisors. No data changes; every
-- dropped policy is either an exact duplicate of another policy or fully
-- covered by a broader permissive policy on the same table and command, so
-- what each user can see or write is unchanged.

-- ---------------------------------------------------------------------------
-- 1. Redundant RLS policies. Postgres evaluates every permissive policy
--    (OR'd together), so each duplicate is paid for on every row read and on
--    every realtime change.
-- ---------------------------------------------------------------------------

-- routines
DROP POLICY IF EXISTS "Coaches can view client routines"      ON public.routines;  -- = "Coaches can read athlete routines"
DROP POLICY IF EXISTS "Coaches can update athlete routines"   ON public.routines;  -- = "Coaches can edit client routines"
DROP POLICY IF EXISTS "Users can read own routines"           ON public.routines;  -- ⊂ "Users or coaches SELECT routines"
DROP POLICY IF EXISTS "Users can insert own routines"         ON public.routines;  -- ⊂ "Coaches INSERT routines"

-- routine_days
DROP POLICY IF EXISTS "Coaches can insert athlete routine days" ON public.routine_days;  -- = "Coaches can edit client routine days"
DROP POLICY IF EXISTS "Coaches can view client routine days"    ON public.routine_days;  -- = "Coaches can read athlete routine days"
DROP POLICY IF EXISTS "Coaches can update athlete routine days" ON public.routine_days;  -- = "Coaches can update client routine days"
DROP POLICY IF EXISTS "Users can delete own routine days"       ON public.routine_days;  -- ⊂ "Users or coaches DELETE routine_days"
DROP POLICY IF EXISTS "Users can insert own routine days"       ON public.routine_days;  -- ⊂ "Users or coaches INSERT routine_days"
DROP POLICY IF EXISTS "Users can read own routine days"         ON public.routine_days;  -- ⊂ "Users or coaches SELECT routine_days"

-- routine_exercises
DROP POLICY IF EXISTS "Coaches can delete client routine exercises" ON public.routine_exercises;  -- = "Coaches can delete athlete routine exercises"
DROP POLICY IF EXISTS "Coaches can insert athlete routine exercises" ON public.routine_exercises; -- = "Coaches can edit client routine exercises"
DROP POLICY IF EXISTS "Coaches can view client routine exercises"   ON public.routine_exercises;  -- = "Coaches can read athlete routine exercises"
DROP POLICY IF EXISTS "Coaches can update athlete routine exercises" ON public.routine_exercises; -- = "Coaches can update client routine exercises"
DROP POLICY IF EXISTS "Users can delete own routine exercises"      ON public.routine_exercises;  -- ⊂ "Users or coaches DELETE routine_exercises"
DROP POLICY IF EXISTS "Users can insert own routine exercises"      ON public.routine_exercises;  -- ⊂ "Users or coaches INSERT routine_exercises"
DROP POLICY IF EXISTS "Users can read own routine exercises"        ON public.routine_exercises;  -- ⊂ "Users or coaches SELECT routine_exercises"

-- workout_sessions / workout_sets
DROP POLICY IF EXISTS "Users can read own sessions" ON public.workout_sessions;  -- ⊂ "Users or coaches can view sessions"
DROP POLICY IF EXISTS "Users can read own sets"     ON public.workout_sets;      -- ⊂ "Users or coaches can view workout_sets"

-- profiles: "Authenticated users can read profiles" (USING true) already
-- covers these for signed-in users; for anon they never match (no auth.uid()).
DROP POLICY IF EXISTS "Users can read own profile"       ON public.profiles;
DROP POLICY IF EXISTS "Coaches can view client profiles" ON public.profiles;

-- ---------------------------------------------------------------------------
-- 2. Indexes: cover unindexed foreign keys, drop exact duplicates
--    (keeping whichever copy the planner actually uses).
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ai_imports_user                    ON public.ai_imports (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_imports_applied_routine         ON public.ai_imports (applied_to_routine_id);
CREATE INDEX IF NOT EXISTS idx_client_links_athlete               ON public.client_links (athlete_id);
CREATE INDEX IF NOT EXISTS idx_client_links_manual_client         ON public.client_links (manual_client_id);
CREATE INDEX IF NOT EXISTS idx_client_submissions_athlete         ON public.client_submissions (athlete_id);
CREATE INDEX IF NOT EXISTS idx_client_submissions_manual_client   ON public.client_submissions (manual_client_id);
CREATE INDEX IF NOT EXISTS idx_coach_client_fees_athlete          ON public.coach_client_fees (athlete_id);
CREATE INDEX IF NOT EXISTS idx_coach_manual_clients_linked        ON public.coach_manual_clients (linked_athlete_id);
CREATE INDEX IF NOT EXISTS idx_coaching_relationships_coach       ON public.coaching_relationships (coach_id);
CREATE INDEX IF NOT EXISTS idx_conversation_reads_user            ON public.conversation_reads (user_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender                    ON public.messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_personal_records_session           ON public.personal_records (session_id);
CREATE INDEX IF NOT EXISTS idx_template_assignments_coach         ON public.routine_template_assignments (coach_id);
CREATE INDEX IF NOT EXISTS idx_template_exercises_source_ue       ON public.routine_template_exercises (source_user_exercise_id);
CREATE INDEX IF NOT EXISTS idx_routine_templates_forked_from      ON public.routine_templates (forked_from_template_id);
CREATE INDEX IF NOT EXISTS idx_routines_archive_athlete           ON public.routines_archive (athlete_id);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_routine_day       ON public.workout_sessions (routine_day_id);
CREATE INDEX IF NOT EXISTS idx_workout_sets_session               ON public.workout_sets (session_id);

DROP INDEX IF EXISTS public.idx_coach_athletes_coach_status;  -- same as idx_coach_athletes_coach
DROP INDEX IF EXISTS public.idx_routine_days_routine;         -- same as idx_routine_days_routine_id
DROP INDEX IF EXISTS public.idx_routine_exercises_day;        -- same as idx_routine_exercises_day_id

-- ---------------------------------------------------------------------------
-- 3. Function security.
-- ---------------------------------------------------------------------------

-- 3a. Pin search_path on every public function that lacks one
--     (skips functions owned by extensions such as pg_trgm).
DO $$
DECLARE f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prokind = 'f'
      AND (p.proconfig IS NULL OR NOT EXISTS (
            SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))
      AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions, pg_temp', f);
  END LOOP;
END $$;

-- 3b. SECURITY DEFINER functions must not be callable without signing in.
--     Kept for anon: link_view / link_submit (public client-link page) and the
--     RLS helpers is_coach_of / is_conversation_participant (policies call them).
REVOKE EXECUTE ON FUNCTION
  public.apply_quiet_hours(uuid, timestamptz, text),
  public.assign_template(uuid, uuid[]),
  public.batch_resolve_exercises(text[], uuid),
  public.delete_device_token(text),
  public.enqueue_notification(uuid, text, text, text, text, jsonb, text, text, text, timestamptz),
  public.fork_athlete_routine(uuid),
  public.get_display_name(uuid),
  public.get_last_set_values(uuid, uuid[]),
  public.handle_coach_athlete_status_change(),
  public.notify_on_connection_change(),
  public.notify_on_message(),
  public.notify_on_pr(),
  public.provision_conversation_on_accept(),
  public.push_template_update(uuid, uuid[], boolean, boolean),
  public.reset_athlete_to_template(uuid, uuid),
  public.resolve_exercise_id(text, uuid),
  public.search_exercises(text, uuid),
  public.soft_delete_template(uuid),
  public.unassign_template(uuid, uuid[]),
  public.within_daily_budget(uuid, text)
FROM PUBLIC, anon;

-- Functions the app calls while signed in keep an explicit grant.
GRANT EXECUTE ON FUNCTION
  public.assign_template(uuid, uuid[]),
  public.batch_resolve_exercises(text[], uuid),
  public.delete_device_token(text),
  public.fork_athlete_routine(uuid),
  public.push_template_update(uuid, uuid[], boolean, boolean),
  public.reset_athlete_to_template(uuid, uuid),
  public.search_exercises(text, uuid),
  public.soft_delete_template(uuid),
  public.unassign_template(uuid, uuid[])
TO authenticated;

-- Internal-only: called by triggers / other SECURITY DEFINER functions or the
-- process-outbox edge function (service_role), never directly by users.
-- enqueue_notification in particular let any caller push to any user.
REVOKE EXECUTE ON FUNCTION
  public.apply_quiet_hours(uuid, timestamptz, text),
  public.enqueue_notification(uuid, text, text, text, text, jsonb, text, text, text, timestamptz),
  public.get_display_name(uuid),
  public.get_last_set_values(uuid, uuid[]),
  public.handle_coach_athlete_status_change(),
  public.notify_on_connection_change(),
  public.notify_on_message(),
  public.notify_on_pr(),
  public.provision_conversation_on_accept(),
  public.resolve_exercise_id(text, uuid),
  public.within_daily_budget(uuid, text)
FROM authenticated;

GRANT EXECUTE ON FUNCTION
  public.apply_quiet_hours(uuid, timestamptz, text),
  public.enqueue_notification(uuid, text, text, text, text, jsonb, text, text, text, timestamptz),
  public.get_display_name(uuid),
  public.within_daily_budget(uuid, text)
TO service_role;

-- 3c. Views run with the caller's permissions so RLS applies.
ALTER VIEW public.weekly_volume SET (security_invoker = true);
ALTER VIEW public.best_lifts    SET (security_invoker = true);
