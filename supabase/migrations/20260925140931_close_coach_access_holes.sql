-- Closes three ways one signed-in user could reach another user's data.
-- Found in the QA pass of 2026-09-25 (C1, H1, H2 in the QA report).
--
--   1. coach_athletes: a coach could insert an already-accepted link to any
--      user, and every signed-in user could read every profile (including
--      invite codes). An accepted link opens that user's workouts, body data
--      and routine.
--   2. client_links: a coach could insert a link, or repoint one, at an
--      athlete they don't coach or at another coach's name-only client.
--      link_view / link_submit then read and write that person's data.
--   3. routine_template_assignments + push_template_update: a coach could
--      assign any athlete to their plan and push it over that athlete's
--      routine; push_template_update never checked the relationship.
--
-- What changes for people using Theryn today: nothing they can see.
--   · Adding a client by their app code now goes through
--     coach_connect_by_code() (the dashboard is updated in the same change).
--     The old direct insert of an accepted link is refused.
--   · Profiles are readable by yourself and by the other side of a coach link,
--     which is every read the app makes.
--   · Links and plan assignments are still made by the same RPCs as before.
--   · When a coach and athlete stop working together, that coach's links for
--     the athlete are turned off, their plan assignments end, and the
--     athlete's invite code is cleared (a new one is made next time it is
--     shown), so the old code can't be used to reconnect.
-- Existing data touched: one plan assignment from April whose coach link no
-- longer exists is ended. No other rows change.
--
-- Safe to run more than once.

-- ═══ 1. Coach links need the athlete's consent ════════════════════════════

-- 1a. Profiles: yourself, and people you share a coach link with (any status,
--     so a pending request still shows who sent it).
DROP POLICY IF EXISTS "Authenticated users can read profiles" ON profiles;
DROP POLICY IF EXISTS "Read own and linked profiles" ON profiles;
CREATE POLICY "Read own and linked profiles" ON profiles
  FOR SELECT TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM coach_athletes ca
       WHERE (ca.coach_id = (SELECT auth.uid()) AND ca.athlete_id = profiles.id)
          OR (ca.athlete_id = (SELECT auth.uid()) AND ca.coach_id = profiles.id)
    )
  );

-- 1b. A coach may only *request* a link. Accepting is the athlete's move, or
--     happens inside coach_connect_by_code when the coach holds their code.
DROP POLICY IF EXISTS "Coach can insert link" ON coach_athletes;
DROP POLICY IF EXISTS "Coach can request a link" ON coach_athletes;
CREATE POLICY "Coach can request a link" ON coach_athletes
  FOR INSERT TO authenticated
  WITH CHECK (
    coach_id = (SELECT auth.uid())
    AND athlete_id IS NOT NULL
    AND athlete_id <> coach_id
    AND status = 'pending'
    AND permission = 'edit_routine'
  );

DROP POLICY IF EXISTS "Athlete can update status" ON coach_athletes;
CREATE POLICY "Athlete can update status" ON coach_athletes
  FOR UPDATE TO authenticated
  USING (athlete_id = (SELECT auth.uid()))
  WITH CHECK (
    athlete_id = (SELECT auth.uid())
    AND status IN ('pending', 'accepted', 'declined', 'revoked')
  );

-- 1c. Through the API only the status of a link can change. RPCs run as the
--     function owner and are not affected.
CREATE OR REPLACE FUNCTION coach_athletes_guard_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated')
     AND (NEW.coach_id   IS DISTINCT FROM OLD.coach_id
       OR NEW.athlete_id IS DISTINCT FROM OLD.athlete_id
       OR NEW.permission IS DISTINCT FROM OLD.permission) THEN
    RAISE EXCEPTION 'Only the status of a coach link can change' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_coach_athletes_guard_update ON coach_athletes;
CREATE TRIGGER trg_coach_athletes_guard_update
  BEFORE UPDATE ON coach_athletes
  FOR EACH ROW EXECUTE FUNCTION coach_athletes_guard_update();

-- 1d. is_coach_of now honours the permission it is asked about
--     (view < edit_routine < full). Every link today is edit_routine, and no
--     screen uses the "full" writes, so nothing in use changes.
CREATE OR REPLACE FUNCTION public.is_coach_of(client uuid, required_permission text DEFAULT 'view'::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM coach_athletes
    WHERE athlete_id = client
      AND coach_id = auth.uid()
      AND status = 'accepted'
      AND CASE coalesce(required_permission, 'view')
            WHEN 'view'         THEN true
            WHEN 'edit_routine' THEN permission IN ('edit_routine', 'full')
            WHEN 'full'         THEN permission = 'full'
            ELSE false
          END
  );
$function$;

-- 1e. Adding a client by the code shown in their app. The code is the
--     athlete's consent, so it has to stay secret (1a) and can't be guessed:
--     ten wrong codes an hour per coach.
CREATE TABLE IF NOT EXISTS coach_code_attempts (
  coach_id UUID        NOT NULL,
  at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coach_code_attempts_coach_at ON coach_code_attempts (coach_id, at);
ALTER TABLE coach_code_attempts ENABLE ROW LEVEL SECURITY;  -- no policies: only the RPC touches it
REVOKE ALL ON coach_code_attempts FROM anon, authenticated;

CREATE OR REPLACE FUNCTION coach_connect_by_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_code    TEXT;
  v_athlete profiles%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'signin'); END IF;

  IF (SELECT count(*) FROM coach_code_attempts
       WHERE coach_id = v_uid AND at > now() - interval '1 hour') >= 10 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'too_many');
  END IF;

  v_code := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  IF length(v_code) BETWEEN 6 AND 16 THEN
    SELECT * INTO v_athlete FROM profiles WHERE upper(invite_code) = v_code LIMIT 1;
  END IF;
  IF v_athlete.id IS NULL THEN
    INSERT INTO coach_code_attempts (coach_id) VALUES (v_uid);
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_athlete.id = v_uid THEN RETURN jsonb_build_object('ok', false, 'reason', 'self'); END IF;

  IF EXISTS (SELECT 1 FROM coach_athletes
              WHERE athlete_id = v_athlete.id AND status = 'accepted' AND coach_id <> v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'has_coach');
  END IF;

  INSERT INTO coach_athletes (coach_id, athlete_id, status)
  VALUES (v_uid, v_athlete.id, 'accepted')
  ON CONFLICT (coach_id, athlete_id) DO UPDATE SET status = 'accepted';

  -- One active coach: other coaches' open requests for this athlete go.
  DELETE FROM coach_athletes
   WHERE athlete_id = v_athlete.id AND status = 'pending' AND coach_id <> v_uid;

  RETURN jsonb_build_object('ok', true, 'athlete_id', v_athlete.id, 'display_name', v_athlete.display_name);
END;
$$;

-- ═══ 2. Client links only for your own clients ════════════════════════════

-- Links are created by client_link_upsert (which checks the client is yours).
-- The dashboard only ever updates label, revoked_at, connect_code,
-- connect_tries and requested.
DROP POLICY IF EXISTS "Coach manages own links" ON client_links;
DROP POLICY IF EXISTS "Coach reads own links"   ON client_links;
DROP POLICY IF EXISTS "Coach updates own links" ON client_links;
DROP POLICY IF EXISTS "Coach deletes own links" ON client_links;
CREATE POLICY "Coach reads own links" ON client_links
  FOR SELECT TO authenticated USING (coach_id = (SELECT auth.uid()));
CREATE POLICY "Coach updates own links" ON client_links
  FOR UPDATE TO authenticated
  USING (coach_id = (SELECT auth.uid())) WITH CHECK (coach_id = (SELECT auth.uid()));
CREATE POLICY "Coach deletes own links" ON client_links
  FOR DELETE TO authenticated USING (coach_id = (SELECT auth.uid()));
REVOKE INSERT ON client_links FROM anon, authenticated;

CREATE OR REPLACE FUNCTION client_links_guard_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated')
     AND (NEW.coach_id          IS DISTINCT FROM OLD.coach_id
       OR NEW.athlete_id        IS DISTINCT FROM OLD.athlete_id
       OR NEW.manual_client_id  IS DISTINCT FROM OLD.manual_client_id
       OR NEW.token_hash        IS DISTINCT FROM OLD.token_hash
       OR NEW.connected_user_id IS DISTINCT FROM OLD.connected_user_id
       OR NEW.connected_name    IS DISTINCT FROM OLD.connected_name
       OR NEW.connected_email   IS DISTINCT FROM OLD.connected_email
       OR NEW.connected_at      IS DISTINCT FROM OLD.connected_at) THEN
    RAISE EXCEPTION 'That part of a client link can''t be changed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_client_links_guard_update ON client_links;
CREATE TRIGGER trg_client_links_guard_update
  BEFORE UPDATE ON client_links
  FOR EACH ROW EXECUTE FUNCTION client_links_guard_update();

-- ═══ 3. Plans only for athletes you coach ═════════════════════════════════

-- Assignments are written only by assign_template / push_template_update /
-- unassign_template / reset_athlete_to_template. Coaches keep reading theirs.
DROP POLICY IF EXISTS "Coaches manage own assignments" ON routine_template_assignments;
DROP POLICY IF EXISTS "Coaches read own assignments"   ON routine_template_assignments;
CREATE POLICY "Coaches read own assignments" ON routine_template_assignments
  FOR SELECT TO authenticated USING (coach_id = (SELECT auth.uid()));
REVOKE INSERT, UPDATE, DELETE ON routine_template_assignments FROM anon, authenticated;

-- push_template_update, unchanged except for the relationship check at the
-- top of the loop (marked below).
CREATE OR REPLACE FUNCTION public.push_template_update(p_template_id uuid, p_athlete_ids uuid[] DEFAULT NULL::uuid[], p_force boolean DEFAULT false, p_skip_mid_week boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_coach_id                 UUID := auth.uid();
  v_template                 RECORD;
  v_assignment               RECORD;
  v_routine_id               UUID;
  v_day                      RECORD;
  v_day_id                   UUID;
  v_ex                       RECORD;
  v_ex_id                    UUID;
  v_succeeded                UUID[]   := ARRAY[]::UUID[];
  v_skipped_overridden       UUID[]   := ARRAY[]::UUID[];
  v_skipped_mid_week         UUID[]   := ARRAY[]::UUID[];
  v_active_session_conflicts UUID[]   := ARRAY[]::UUID[];
  v_failed                   JSONB[]  := ARRAY[]::JSONB[];
  v_week_start               DATE;
  v_is_mid_week              BOOLEAN;
  v_has_active_session       BOOLEAN;
  v_existing_re_id           UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('template:' || p_template_id::text));

  SELECT * INTO v_template
  FROM routine_templates
  WHERE id = p_template_id
    AND owner_coach_id = v_coach_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found or not owned by current coach';
  END IF;

  v_week_start := date_trunc('week', now())::DATE;

  FOR v_assignment IN
    SELECT rta.*, r.id AS routine_id
    FROM routine_template_assignments rta
    JOIN routines r ON r.user_id = rta.athlete_id AND r.is_active = true
    WHERE rta.template_id = p_template_id
      AND rta.unassigned_at IS NULL
      AND (p_athlete_ids IS NULL OR rta.athlete_id = ANY(p_athlete_ids))
  LOOP
    BEGIN
      -- ── Added 2026-09-25: only athletes this coach may edit ──
      IF NOT is_coach_of(v_assignment.athlete_id, 'edit_routine') THEN
        v_failed := v_failed || jsonb_build_object(
          'athlete_id', v_assignment.athlete_id, 'reason', 'no_permission'
        );
        CONTINUE;
      END IF;

      -- Override check
      IF v_assignment.is_overridden AND NOT p_force THEN
        v_skipped_overridden := v_skipped_overridden || v_assignment.athlete_id;
        CONTINUE;
      END IF;

      -- Mid-week check
      IF p_skip_mid_week THEN
        SELECT EXISTS(
          SELECT 1 FROM workout_sessions ws
          WHERE ws.user_id = v_assignment.athlete_id
            AND ws.completed_at IS NOT NULL
            AND ws.started_at >= v_week_start
        ) INTO v_is_mid_week;

        IF v_is_mid_week AND NOT p_force THEN
          v_skipped_mid_week := v_skipped_mid_week || v_assignment.athlete_id;
          CONTINUE;
        END IF;
      END IF;

      v_routine_id := v_assignment.routine_id;

      -- Active session check (wrapped — gracefully handles missing table)
      v_has_active_session := false;
      BEGIN
        SELECT EXISTS(
          SELECT 1 FROM active_sessions acs
          WHERE acs.athlete_id = v_assignment.athlete_id
            AND acs.ended_at IS NULL
            AND acs.updated_at > now() - INTERVAL '30 minutes'
        ) INTO v_has_active_session;
      EXCEPTION WHEN OTHERS THEN
        v_has_active_session := false;
      END;

      IF v_has_active_session AND NOT p_force THEN
        v_active_session_conflicts := v_active_session_conflicts || v_assignment.athlete_id;
        CONTINUE;
      END IF;

      -- For each template day, UPSERT routine_day by (routine_id, day_index)
      FOR v_day IN
        SELECT * FROM routine_template_days
        WHERE template_id = p_template_id
        ORDER BY day_index
      LOOP
        INSERT INTO routine_days (routine_id, day_index, workout_type, label)
        VALUES (v_routine_id, v_day.day_index, v_day.workout_type, v_day.label)
        ON CONFLICT (routine_id, day_index)
        DO UPDATE SET
          workout_type = EXCLUDED.workout_type,
          label        = EXCLUDED.label
        RETURNING id INTO v_day_id;

        IF v_day_id IS NULL THEN
          SELECT id INTO v_day_id FROM routine_days
          WHERE routine_id = v_routine_id AND day_index = v_day.day_index;
        END IF;

        FOR v_ex IN
          SELECT * FROM routine_template_exercises
          WHERE template_day_id = v_day.id
          ORDER BY sort_order
        LOOP
          v_ex_id := resolve_exercise_id(v_ex.exercise_name, v_assignment.athlete_id);

          SELECT re.id INTO v_existing_re_id
          FROM routine_exercises re
          JOIN routine_days rd ON rd.id = re.routine_day_id
          WHERE rd.routine_id           = v_routine_id
            AND re.template_exercise_id = v_ex.id
          LIMIT 1;

          IF v_existing_re_id IS NOT NULL THEN
            UPDATE routine_exercises SET
              routine_day_id = v_day_id,
              exercise_id    = v_ex_id,
              sort_order     = v_ex.sort_order,
              target_sets    = v_ex.target_sets,
              target_reps    = v_ex.target_reps,
              notes          = v_ex.notes,
              removed_at     = NULL
            WHERE id = v_existing_re_id;
          ELSE
            INSERT INTO routine_exercises (
              routine_day_id, exercise_id, sort_order,
              target_sets, target_reps, notes, template_exercise_id
            ) VALUES (
              v_day_id, v_ex_id, v_ex.sort_order,
              v_ex.target_sets, v_ex.target_reps, v_ex.notes, v_ex.id
            );
          END IF;
        END LOOP;

        UPDATE routine_exercises
        SET removed_at = now()
        WHERE routine_day_id = v_day_id
          AND template_exercise_id IS NOT NULL
          AND removed_at IS NULL
          AND template_exercise_id NOT IN (
            SELECT id FROM routine_template_exercises WHERE template_day_id = v_day.id
          );
      END LOOP;

      -- Soft-delete days no longer in template
      UPDATE routine_exercises re
      SET removed_at = now()
      FROM routine_days rd
      WHERE rd.id = re.routine_day_id
        AND rd.routine_id = v_routine_id
        AND rd.day_index NOT IN (
          SELECT day_index FROM routine_template_days WHERE template_id = p_template_id
        )
        AND re.removed_at IS NULL;

      -- Update routine metadata
      UPDATE routines SET
        source_template_version = v_template.version,
        last_pushed_version     = v_template.version,
        is_overridden           = false,
        overridden_at           = NULL,
        updated_at              = now()
      WHERE id = v_routine_id;

      -- Update assignment
      UPDATE routine_template_assignments SET
        last_pushed_version = v_template.version,
        is_overridden       = false,
        overridden_at       = NULL
      WHERE id = v_assignment.id;

      -- Audit log (wrapped — schema mismatches must never block push)
      BEGIN
        INSERT INTO coach_activity_log (coach_athlete_id, action, details)
        SELECT ca.id,
               'template_pushed',
               jsonb_build_object(
                 'template_id', p_template_id,
                 'template_version', v_template.version,
                 'forced', p_force
               )
        FROM coach_athletes ca
        WHERE ca.coach_id = v_coach_id
          AND ca.athlete_id = v_assignment.athlete_id
          AND ca.status = 'accepted'
        LIMIT 1;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;

      v_succeeded := v_succeeded || v_assignment.athlete_id;

    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed || jsonb_build_object(
        'athlete_id', v_assignment.athlete_id, 'reason', SQLERRM
      );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'succeeded',                to_jsonb(v_succeeded),
    'skipped_overridden',       to_jsonb(v_skipped_overridden),
    'skipped_mid_week',         to_jsonb(v_skipped_mid_week),
    'active_session_conflicts', to_jsonb(v_active_session_conflicts),
    'failed',                   to_jsonb(v_failed)
  );
END;
$function$;

-- ═══ 4. When a coach and athlete stop working together ════════════════════

CREATE OR REPLACE FUNCTION coach_link_ended()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_coach   UUID;
  v_athlete UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IS DISTINCT FROM 'accepted' THEN RETURN OLD; END IF;
  ELSIF NOT (OLD.status = 'accepted' AND NEW.status IS DISTINCT FROM 'accepted') THEN
    RETURN NEW;
  END IF;
  v_coach := OLD.coach_id;
  v_athlete := OLD.athlete_id;

  -- Their routine stays theirs, detached from the coach's plan.
  UPDATE routines SET
    is_overridden      = true,
    overridden_at      = coalesce(overridden_at, now()),
    source_template_id = NULL,
    updated_at         = now()
  WHERE user_id = v_athlete
    AND source_template_id IN (
      SELECT template_id FROM routine_template_assignments
       WHERE coach_id = v_coach AND athlete_id = v_athlete AND unassigned_at IS NULL);

  UPDATE routine_template_assignments SET unassigned_at = now()
   WHERE coach_id = v_coach AND athlete_id = v_athlete AND unassigned_at IS NULL;

  UPDATE client_links SET revoked_at = now()
   WHERE coach_id = v_coach AND athlete_id = v_athlete AND revoked_at IS NULL;

  -- The old code can't bring the coach back; the app makes a new one when shown.
  UPDATE profiles SET invite_code = NULL WHERE id = v_athlete;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
DROP TRIGGER IF EXISTS trg_coach_link_ended ON coach_athletes;
CREATE TRIGGER trg_coach_link_ended
  AFTER DELETE OR UPDATE OF status ON coach_athletes
  FOR EACH ROW EXECUTE FUNCTION coach_link_ended();

-- Leftovers from links that already ended.
UPDATE routine_template_assignments a SET unassigned_at = now()
 WHERE a.unassigned_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM coach_athletes c
                    WHERE c.coach_id = a.coach_id AND c.athlete_id = a.athlete_id AND c.status = 'accepted');
UPDATE client_links l SET revoked_at = now()
 WHERE l.revoked_at IS NULL AND l.athlete_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM coach_athletes c
                    WHERE c.coach_id = l.coach_id AND c.athlete_id = l.athlete_id AND c.status = 'accepted');

-- ═══ Grants ════════════════════════════════════════════════════════════════
-- New functions in this project are granted to anon by default, and
-- REVOKE ... FROM PUBLIC does not undo that, so anon is revoked by name.
REVOKE ALL ON FUNCTION coach_connect_by_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION coach_connect_by_code(TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION coach_connect_by_code(TEXT) FROM anon;
REVOKE ALL ON FUNCTION coach_athletes_guard_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION client_links_guard_update()   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION coach_link_ended()            FROM PUBLIC, anon, authenticated;

-- ═══ Check after applying ═════════════════════════════════════════════════
--   SELECT tablename, policyname, cmd FROM pg_policies
--    WHERE tablename IN ('profiles','coach_athletes','client_links','routine_template_assignments')
--    ORDER BY 1, 2;
--   SELECT p.proname, a.grantee::regrole
--     FROM pg_proc p, aclexplode(p.proacl) a
--    WHERE p.proname = 'coach_connect_by_code' AND a.privilege_type = 'EXECUTE';
--   -> authenticated, postgres, service_role; not anon.
