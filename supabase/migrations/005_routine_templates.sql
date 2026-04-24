-- ============================================================================
-- Theryn — Migration 005: Routine Templates + Bulk Assignment
-- ============================================================================

-- ── ROUTINE TEMPLATES ───────────────────────────────────────────────────────
CREATE TABLE routine_templates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_coach_id   UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name             TEXT NOT NULL,
  description      TEXT,
  category         TEXT,
  version          INT NOT NULL DEFAULT 1,
  -- Marketplace-ready fields (unused at launch)
  visibility       TEXT NOT NULL DEFAULT 'private'
                     CHECK (visibility IN ('private', 'unlisted', 'public')),
  price_cents      INT,
  published_at     TIMESTAMPTZ,
  forked_from_template_id UUID REFERENCES routine_templates(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);

ALTER TABLE routine_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches manage own templates"
  ON routine_templates FOR ALL
  USING (owner_coach_id = auth.uid())
  WITH CHECK (owner_coach_id = auth.uid());

-- Marketplace: public templates readable by all (future storefront)
CREATE POLICY "Public templates are readable"
  ON routine_templates FOR SELECT
  USING (visibility = 'public' AND deleted_at IS NULL);


-- ── ROUTINE TEMPLATE DAYS ───────────────────────────────────────────────────
CREATE TABLE routine_template_days (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  UUID REFERENCES routine_templates(id) ON DELETE CASCADE NOT NULL,
  day_index    INT NOT NULL CHECK (day_index BETWEEN 0 AND 6),
  workout_type TEXT NOT NULL,
  label        TEXT,
  UNIQUE (template_id, day_index)
);

ALTER TABLE routine_template_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches manage own template days"
  ON routine_template_days FOR ALL
  USING (EXISTS (
    SELECT 1 FROM routine_templates t
    WHERE t.id = routine_template_days.template_id
      AND t.owner_coach_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM routine_templates t
    WHERE t.id = routine_template_days.template_id
      AND t.owner_coach_id = auth.uid()
  ));


-- ── ROUTINE TEMPLATE EXERCISES ──────────────────────────────────────────────
-- Stores exercise metadata INLINE (not FK to user_exercises) so templates
-- are portable across coaches and athletes regardless of user_exercises rows.
CREATE TABLE routine_template_exercises (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_day_id  UUID REFERENCES routine_template_days(id) ON DELETE CASCADE NOT NULL,
  sort_order       INT DEFAULT 0,
  exercise_name    TEXT NOT NULL,
  muscle_group     TEXT,
  equipment        TEXT,
  category         TEXT,
  -- Optional back-link to public_exercises for analytics only; never required
  source_exercise_id UUID,
  target_sets      INT DEFAULT 3,
  target_reps      TEXT DEFAULT '8-12',
  notes            TEXT
);

ALTER TABLE routine_template_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches manage own template exercises"
  ON routine_template_exercises FOR ALL
  USING (EXISTS (
    SELECT 1 FROM routine_template_days td
    JOIN routine_templates t ON t.id = td.template_id
    WHERE td.id = routine_template_exercises.template_day_id
      AND t.owner_coach_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM routine_template_days td
    JOIN routine_templates t ON t.id = td.template_id
    WHERE td.id = routine_template_exercises.template_day_id
      AND t.owner_coach_id = auth.uid()
  ));


-- ── ROUTINE TEMPLATE ASSIGNMENTS ────────────────────────────────────────────
CREATE TABLE routine_template_assignments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id         UUID REFERENCES routine_templates(id) ON DELETE CASCADE NOT NULL,
  athlete_id          UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  coach_id            UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  assigned_at         TIMESTAMPTZ DEFAULT now(),
  last_pushed_version INT NOT NULL DEFAULT 1,
  is_overridden       BOOLEAN NOT NULL DEFAULT false,
  overridden_at       TIMESTAMPTZ,
  unassigned_at       TIMESTAMPTZ
);

-- One active assignment per template per athlete
CREATE UNIQUE INDEX routine_template_assignments_active_unique
  ON routine_template_assignments (template_id, athlete_id)
  WHERE unassigned_at IS NULL;

ALTER TABLE routine_template_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches manage own assignments"
  ON routine_template_assignments FOR ALL
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

CREATE POLICY "Athletes read own assignments"
  ON routine_template_assignments FOR SELECT
  USING (athlete_id = auth.uid());


-- ── ROUTINES ARCHIVE ────────────────────────────────────────────────────────
-- Append-only snapshot table. Written before any destructive assign/push.
CREATE TABLE routines_archive (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id      UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  archived_at     TIMESTAMPTZ DEFAULT now(),
  archived_reason TEXT CHECK (archived_reason IN ('template_assigned', 'template_reassigned', 'template_reset', 'manual')),
  snapshot        JSONB NOT NULL
);

ALTER TABLE routines_archive ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Athletes read own archive"
  ON routines_archive FOR SELECT
  USING (athlete_id = auth.uid());

CREATE POLICY "Coaches read athlete archive"
  ON routines_archive FOR SELECT
  USING (is_coach_of(athlete_id, 'view'));

-- Only RPCs (SECURITY DEFINER) insert into archive — no direct client INSERT
CREATE POLICY "Service can insert archive"
  ON routines_archive FOR INSERT
  WITH CHECK (true);


-- ── ALTER routines — add template tracking columns ──────────────────────────
ALTER TABLE routines
  ADD COLUMN IF NOT EXISTS source_template_id      UUID REFERENCES routine_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_template_version INT,
  ADD COLUMN IF NOT EXISTS is_overridden            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS overridden_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assigned_at              TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_pushed_version      INT;

-- ── ALTER routine_exercises — add UPSERT key + soft-delete ──────────────────
ALTER TABLE routine_exercises
  ADD COLUMN IF NOT EXISTS template_exercise_id UUID REFERENCES routine_template_exercises(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS removed_at           TIMESTAMPTZ;

-- Index for UPSERT key during push
CREATE INDEX IF NOT EXISTS idx_routine_exercises_template_ex
  ON routine_exercises (template_exercise_id)
  WHERE template_exercise_id IS NOT NULL;


-- ── ADD COACH RLS POLICIES ON routines (for template operations) ─────────────
CREATE POLICY "Coaches can read athlete routines"
  ON routines FOR SELECT
  USING (is_coach_of(user_id, 'view'));

CREATE POLICY "Coaches can insert athlete routines"
  ON routines FOR INSERT
  WITH CHECK (is_coach_of(user_id, 'edit_routine'));

CREATE POLICY "Coaches can update athlete routines"
  ON routines FOR UPDATE
  USING (is_coach_of(user_id, 'edit_routine'))
  WITH CHECK (is_coach_of(user_id, 'edit_routine'));

-- Coach RLS for routine_days and routine_exercises (needed for push RPCs)
CREATE POLICY "Coaches can read athlete routine days"
  ON routine_days FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM routines r
    WHERE r.id = routine_days.routine_id
      AND is_coach_of(r.user_id, 'view')
  ));

CREATE POLICY "Coaches can insert athlete routine days"
  ON routine_days FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM routines r
    WHERE r.id = routine_days.routine_id
      AND is_coach_of(r.user_id, 'edit_routine')
  ));

CREATE POLICY "Coaches can update athlete routine days"
  ON routine_days FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM routines r
    WHERE r.id = routine_days.routine_id
      AND is_coach_of(r.user_id, 'edit_routine')
  ));

CREATE POLICY "Coaches can delete athlete routine days"
  ON routine_days FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM routines r
    WHERE r.id = routine_days.routine_id
      AND is_coach_of(r.user_id, 'edit_routine')
  ));

CREATE POLICY "Coaches can read athlete routine exercises"
  ON routine_exercises FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM routine_days rd
    JOIN routines r ON r.id = rd.routine_id
    WHERE rd.id = routine_exercises.routine_day_id
      AND is_coach_of(r.user_id, 'view')
  ));

CREATE POLICY "Coaches can insert athlete routine exercises"
  ON routine_exercises FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM routine_days rd
    JOIN routines r ON r.id = rd.routine_id
    WHERE rd.id = routine_exercises.routine_day_id
      AND is_coach_of(r.user_id, 'edit_routine')
  ));

CREATE POLICY "Coaches can update athlete routine exercises"
  ON routine_exercises FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM routine_days rd
    JOIN routines r ON r.id = rd.routine_id
    WHERE rd.id = routine_exercises.routine_day_id
      AND is_coach_of(r.user_id, 'edit_routine')
  ));

CREATE POLICY "Coaches can delete athlete routine exercises"
  ON routine_exercises FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM routine_days rd
    JOIN routines r ON r.id = rd.routine_id
    WHERE rd.id = routine_exercises.routine_day_id
      AND is_coach_of(r.user_id, 'edit_routine')
  ));


-- ============================================================================
-- HELPER: resolve exercise name → exercise_id for a given athlete
-- Tries public_exercises first, then user_exercises, then creates user_exercise
-- ============================================================================
CREATE OR REPLACE FUNCTION resolve_exercise_id(
  p_exercise_name TEXT,
  p_athlete_id    UUID
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  -- 1. Exact match in public library
  SELECT id INTO v_id FROM public_exercises
  WHERE lower(name) = lower(p_exercise_name)
  LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  -- 2. Partial match in public library
  SELECT id INTO v_id FROM public_exercises
  WHERE name ILIKE '%' || p_exercise_name || '%'
  LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  -- 3. Athlete's custom exercises
  SELECT id INTO v_id FROM user_exercises
  WHERE user_id = p_athlete_id
    AND lower(name) = lower(p_exercise_name)
  LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  -- 4. Create a new user_exercise for the athlete
  INSERT INTO user_exercises (user_id, name)
  VALUES (p_athlete_id, p_exercise_name)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- RPC: assign_template
-- Copies a template tree into each target athlete's routine.
-- Archives the prior routine if it has content.
-- ============================================================================
CREATE OR REPLACE FUNCTION assign_template(
  p_template_id  UUID,
  p_athlete_ids  UUID[]
)
RETURNS JSONB AS $$
DECLARE
  v_coach_id    UUID := auth.uid();
  v_template    RECORD;
  v_athlete_id  UUID;
  v_routine_id  UUID;
  v_routine     RECORD;
  v_day         RECORD;
  v_day_id      UUID;
  v_ex          RECORD;
  v_ex_id       UUID;
  v_succeeded   UUID[] := ARRAY[]::UUID[];
  v_failed      JSONB[]  := ARRAY[]::JSONB[];
  v_archived    UUID[] := ARRAY[]::UUID[];
  v_snapshot    JSONB;
BEGIN
  -- Ownership check
  SELECT * INTO v_template
  FROM routine_templates
  WHERE id = p_template_id
    AND owner_coach_id = v_coach_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found or not owned by current coach';
  END IF;

  -- Validate template has content
  IF NOT EXISTS (
    SELECT 1 FROM routine_template_days WHERE template_id = p_template_id
  ) THEN
    RAISE EXCEPTION 'Template has no days — add exercises before assigning';
  END IF;

  FOREACH v_athlete_id IN ARRAY p_athlete_ids LOOP
    BEGIN
      -- Permission check
      IF NOT is_coach_of(v_athlete_id, 'edit_routine') THEN
        v_failed := v_failed || jsonb_build_object('athlete_id', v_athlete_id, 'reason', 'no_permission');
        CONTINUE;
      END IF;

      -- Get or create the athlete's active routine
      SELECT id INTO v_routine_id
      FROM routines
      WHERE user_id = v_athlete_id AND is_active = true;

      IF v_routine_id IS NULL THEN
        INSERT INTO routines (user_id, name, is_active)
        VALUES (v_athlete_id, v_template.name, true)
        RETURNING id INTO v_routine_id;
      END IF;

      -- Archive existing routine if it has any days
      IF EXISTS (SELECT 1 FROM routine_days WHERE routine_id = v_routine_id) THEN
        SELECT jsonb_build_object(
          'routine_id', v_routine_id,
          'source_template_id', r.source_template_id,
          'days', (
            SELECT jsonb_agg(
              jsonb_build_object(
                'day_index', rd.day_index,
                'workout_type', rd.workout_type,
                'label', rd.label,
                'exercises', (
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'exercise_id', re.exercise_id,
                      'sort_order', re.sort_order,
                      'notes', re.notes,
                      'target_sets', re.target_sets,
                      'target_reps', re.target_reps
                    ) ORDER BY re.sort_order
                  )
                  FROM routine_exercises re WHERE re.routine_day_id = rd.id
                )
              )
            )
            FROM routine_days rd WHERE rd.routine_id = v_routine_id
          )
        ) INTO v_snapshot
        FROM routines r WHERE r.id = v_routine_id;

        INSERT INTO routines_archive (athlete_id, archived_reason, snapshot)
        VALUES (v_athlete_id,
          CASE WHEN (SELECT source_template_id FROM routines WHERE id = v_routine_id) IS NOT NULL
               THEN 'template_reassigned' ELSE 'template_assigned' END,
          v_snapshot);

        v_archived := v_archived || v_athlete_id;

        -- Remove old days (cascade deletes old routine_exercises rows)
        DELETE FROM routine_days WHERE routine_id = v_routine_id;
      END IF;

      -- Copy template days → routine_days
      FOR v_day IN
        SELECT * FROM routine_template_days
        WHERE template_id = p_template_id
        ORDER BY day_index
      LOOP
        INSERT INTO routine_days (routine_id, day_index, workout_type, label)
        VALUES (v_routine_id, v_day.day_index, v_day.workout_type, v_day.label)
        RETURNING id INTO v_day_id;

        -- Copy template exercises → routine_exercises
        FOR v_ex IN
          SELECT * FROM routine_template_exercises
          WHERE template_day_id = v_day.id
          ORDER BY sort_order
        LOOP
          v_ex_id := resolve_exercise_id(v_ex.exercise_name, v_athlete_id);

          INSERT INTO routine_exercises (
            routine_day_id, exercise_id, sort_order,
            target_sets, target_reps, notes, template_exercise_id
          ) VALUES (
            v_day_id, v_ex_id, v_ex.sort_order,
            v_ex.target_sets, v_ex.target_reps, v_ex.notes, v_ex.id
          );
        END LOOP;
      END LOOP;

      -- Update routine metadata
      UPDATE routines SET
        name                   = v_template.name,
        source_template_id     = p_template_id,
        source_template_version = v_template.version,
        last_pushed_version    = v_template.version,
        is_overridden          = false,
        overridden_at          = NULL,
        assigned_at            = now(),
        updated_at             = now()
      WHERE id = v_routine_id;

      -- Upsert assignment row
      INSERT INTO routine_template_assignments (
        template_id, athlete_id, coach_id,
        assigned_at, last_pushed_version, is_overridden
      ) VALUES (
        p_template_id, v_athlete_id, v_coach_id,
        now(), v_template.version, false
      )
      ON CONFLICT ON CONSTRAINT routine_template_assignments_active_unique
      DO UPDATE SET
        assigned_at         = EXCLUDED.assigned_at,
        last_pushed_version = EXCLUDED.last_pushed_version,
        is_overridden       = false,
        overridden_at       = NULL,
        unassigned_at       = NULL;

      -- Audit log (use first accepted coach_athletes link)
      INSERT INTO coach_activity_log (coach_athlete_id, action, details)
      SELECT ca.id,
             'template_assigned',
             jsonb_build_object('template_id', p_template_id, 'template_name', v_template.name, 'template_version', v_template.version)
      FROM coach_athletes ca
      WHERE ca.coach_id = v_coach_id
        AND ca.athlete_id = v_athlete_id
        AND ca.status = 'accepted'
      LIMIT 1;

      v_succeeded := v_succeeded || v_athlete_id;

    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed || jsonb_build_object('athlete_id', v_athlete_id, 'reason', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'succeeded', to_jsonb(v_succeeded),
    'failed',    to_jsonb(v_failed),
    'archived',  to_jsonb(v_archived)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- RPC: push_template_update
-- Re-copies updated template exercises to assigned athletes (UPSERT-safe).
-- ============================================================================
CREATE OR REPLACE FUNCTION push_template_update(
  p_template_id    UUID,
  p_athlete_ids    UUID[]  DEFAULT NULL,  -- NULL = all assigned
  p_force          BOOLEAN DEFAULT false,
  p_skip_mid_week  BOOLEAN DEFAULT true
)
RETURNS JSONB AS $$
DECLARE
  v_coach_id              UUID := auth.uid();
  v_template              RECORD;
  v_assignment            RECORD;
  v_routine_id            UUID;
  v_day                   RECORD;
  v_day_id                UUID;
  v_ex                    RECORD;
  v_ex_id                 UUID;
  v_succeeded             UUID[] := ARRAY[]::UUID[];
  v_skipped_overridden    UUID[] := ARRAY[]::UUID[];
  v_skipped_mid_week      UUID[] := ARRAY[]::UUID[];
  v_active_session_conflicts UUID[] := ARRAY[]::UUID[];
  v_failed                JSONB[]  := ARRAY[]::JSONB[];
  v_week_start            DATE;
  v_is_mid_week           BOOLEAN;
  v_existing_re_id        UUID;
BEGIN
  -- Ownership check + advisory lock to prevent concurrent pushes
  PERFORM pg_advisory_xact_lock(hashtext('template:' || p_template_id::text));

  SELECT * INTO v_template
  FROM routine_templates
  WHERE id = p_template_id
    AND owner_coach_id = v_coach_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found or not owned by current coach';
  END IF;

  -- Determine week start (Monday)
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

      -- Check active session on exercises that would be removed
      IF EXISTS (
        SELECT 1 FROM active_sessions acs
        WHERE acs.athlete_id = v_assignment.athlete_id
          AND acs.ended_at IS NULL
          AND acs.updated_at > now() - INTERVAL '30 minutes'
      ) AND NOT p_force THEN
        v_active_session_conflicts := v_active_session_conflicts || v_assignment.athlete_id;
        CONTINUE;
      END IF;

      -- For each template day, UPSERT routine_day by (routine_id, day_index)
      FOR v_day IN
        SELECT * FROM routine_template_days
        WHERE template_id = p_template_id
        ORDER BY day_index
      LOOP
        -- UPSERT day (preserves id so workout_sessions.routine_day_id stays valid)
        INSERT INTO routine_days (routine_id, day_index, workout_type, label)
        VALUES (v_routine_id, v_day.day_index, v_day.workout_type, v_day.label)
        ON CONFLICT (routine_id, day_index)
        DO UPDATE SET
          workout_type = EXCLUDED.workout_type,
          label        = EXCLUDED.label
        RETURNING id INTO v_day_id;

        -- If conflict, get the existing id
        IF v_day_id IS NULL THEN
          SELECT id INTO v_day_id FROM routine_days
          WHERE routine_id = v_routine_id AND day_index = v_day.day_index;
        END IF;

        -- UPSERT each exercise by template_exercise_id (preserves row id for history)
        FOR v_ex IN
          SELECT * FROM routine_template_exercises
          WHERE template_day_id = v_day.id
          ORDER BY sort_order
        LOOP
          v_ex_id := resolve_exercise_id(v_ex.exercise_name, v_assignment.athlete_id);

          -- UPSERT by template_exercise_id scoped to this athlete's routine
          -- (template_exercise_id is NOT globally unique — same ID appears in every athlete's routine)
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

        -- Soft-delete exercises that are no longer in the template for this day
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

      -- Audit log
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

      v_succeeded := v_succeeded || v_assignment.athlete_id;

    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed || jsonb_build_object('athlete_id', v_assignment.athlete_id, 'reason', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'succeeded',               to_jsonb(v_succeeded),
    'skipped_overridden',      to_jsonb(v_skipped_overridden),
    'skipped_mid_week',        to_jsonb(v_skipped_mid_week),
    'active_session_conflicts',to_jsonb(v_active_session_conflicts),
    'failed',                  to_jsonb(v_failed)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- RPC: fork_athlete_routine
-- Marks athlete's routine as overridden (customized). Idempotent.
-- ============================================================================
CREATE OR REPLACE FUNCTION fork_athlete_routine(p_athlete_id UUID)
RETURNS VOID AS $$
DECLARE
  v_coach_id UUID := auth.uid();
BEGIN
  IF NOT is_coach_of(p_athlete_id, 'edit_routine') THEN
    RAISE EXCEPTION 'No edit_routine permission for this athlete';
  END IF;

  UPDATE routines SET
    is_overridden = true,
    overridden_at = COALESCE(overridden_at, now()),
    updated_at    = now()
  WHERE user_id = p_athlete_id AND is_active = true;

  UPDATE routine_template_assignments SET
    is_overridden = true,
    overridden_at = COALESCE(overridden_at, now())
  WHERE athlete_id = p_athlete_id
    AND unassigned_at IS NULL;

  INSERT INTO coach_activity_log (coach_athlete_id, action, details)
  SELECT ca.id, 'routine_forked', jsonb_build_object('athlete_id', p_athlete_id)
  FROM coach_athletes ca
  WHERE ca.coach_id = v_coach_id
    AND ca.athlete_id = p_athlete_id
    AND ca.status = 'accepted'
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- RPC: reset_athlete_to_template
-- Archives current, then force-pushes template. Clears override.
-- ============================================================================
CREATE OR REPLACE FUNCTION reset_athlete_to_template(
  p_template_id UUID,
  p_athlete_id  UUID
)
RETURNS JSONB AS $$
DECLARE
  v_coach_id UUID := auth.uid();
  v_template RECORD;
  v_result   JSONB;
BEGIN
  IF NOT is_coach_of(p_athlete_id, 'edit_routine') THEN
    RAISE EXCEPTION 'No edit_routine permission for this athlete';
  END IF;

  SELECT * INTO v_template
  FROM routine_templates
  WHERE id = p_template_id AND owner_coach_id = v_coach_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Template not found'; END IF;

  -- Archive current state before overwriting
  DECLARE
    v_routine_id UUID;
    v_snapshot JSONB;
  BEGIN
    SELECT id INTO v_routine_id FROM routines WHERE user_id = p_athlete_id AND is_active = true;
    IF v_routine_id IS NOT NULL AND EXISTS (SELECT 1 FROM routine_days WHERE routine_id = v_routine_id) THEN
      SELECT jsonb_build_object('routine_id', v_routine_id, 'days', (
        SELECT jsonb_agg(jsonb_build_object('day_index', rd.day_index, 'workout_type', rd.workout_type))
        FROM routine_days rd WHERE rd.routine_id = v_routine_id
      )) INTO v_snapshot FROM routines WHERE id = v_routine_id;

      INSERT INTO routines_archive (athlete_id, archived_reason, snapshot)
      VALUES (p_athlete_id, 'template_reset', v_snapshot);
    END IF;
  END;

  -- Force-push template to this athlete
  v_result := push_template_update(p_template_id, ARRAY[p_athlete_id], true, false);

  INSERT INTO coach_activity_log (coach_athlete_id, action, details)
  SELECT ca.id, 'routine_reset_to_template',
         jsonb_build_object('template_id', p_template_id, 'template_name', v_template.name)
  FROM coach_athletes ca
  WHERE ca.coach_id = v_coach_id AND ca.athlete_id = p_athlete_id AND ca.status = 'accepted'
  LIMIT 1;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- RPC: unassign_template
-- Unlinks template from athlete(s); athlete keeps their routine snapshot.
-- ============================================================================
CREATE OR REPLACE FUNCTION unassign_template(
  p_template_id UUID,
  p_athlete_ids UUID[]
)
RETURNS JSONB AS $$
DECLARE
  v_coach_id  UUID := auth.uid();
  v_athlete_id UUID;
  v_succeeded UUID[] := ARRAY[]::UUID[];
BEGIN
  SELECT owner_coach_id FROM routine_templates
  WHERE id = p_template_id AND owner_coach_id = v_coach_id AND deleted_at IS NULL;

  IF NOT FOUND THEN RAISE EXCEPTION 'Template not found'; END IF;

  FOREACH v_athlete_id IN ARRAY p_athlete_ids LOOP
    UPDATE routine_template_assignments SET
      unassigned_at = now()
    WHERE template_id = p_template_id
      AND athlete_id  = v_athlete_id
      AND unassigned_at IS NULL;

    -- Detach routine from template so future edits don't affect it
    UPDATE routines SET
      is_overridden      = true,
      source_template_id = NULL,
      updated_at         = now()
    WHERE user_id = v_athlete_id AND is_active = true
      AND source_template_id = p_template_id;

    INSERT INTO coach_activity_log (coach_athlete_id, action, details)
    SELECT ca.id, 'template_unassigned',
           jsonb_build_object('template_id', p_template_id)
    FROM coach_athletes ca
    WHERE ca.coach_id = v_coach_id AND ca.athlete_id = v_athlete_id AND ca.status = 'accepted'
    LIMIT 1;

    v_succeeded := v_succeeded || v_athlete_id;
  END LOOP;

  RETURN jsonb_build_object('succeeded', to_jsonb(v_succeeded));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- RPC: soft_delete_template
-- Soft-deletes template and unassigns all athletes.
-- ============================================================================
CREATE OR REPLACE FUNCTION soft_delete_template(p_template_id UUID)
RETURNS VOID AS $$
DECLARE
  v_coach_id UUID := auth.uid();
  v_athlete_ids UUID[];
BEGIN
  UPDATE routine_templates SET deleted_at = now()
  WHERE id = p_template_id AND owner_coach_id = v_coach_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Template not found'; END IF;

  -- Collect active assignment athlete_ids
  SELECT array_agg(athlete_id) INTO v_athlete_ids
  FROM routine_template_assignments
  WHERE template_id = p_template_id AND unassigned_at IS NULL;

  IF v_athlete_ids IS NOT NULL AND array_length(v_athlete_ids, 1) > 0 THEN
    PERFORM unassign_template(p_template_id, v_athlete_ids);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- TRIGGER: auto-unassign when coach_athletes link is revoked/declined
-- ============================================================================
CREATE OR REPLACE FUNCTION handle_coach_athlete_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_tid UUID;
BEGIN
  -- Only fire when status changes TO revoked or declined
  IF NEW.status NOT IN ('revoked', 'declined') THEN RETURN NEW; END IF;
  IF OLD.status IN ('revoked', 'declined')     THEN RETURN NEW; END IF;

  -- Inline unassign logic (avoids calling unassign_template which checks auth.uid() as coach;
  -- here the actor could be the athlete or an admin, not necessarily the coach)
  FOR v_tid IN
    SELECT rta.template_id
    FROM routine_template_assignments rta
    WHERE rta.coach_id      = NEW.coach_id
      AND rta.athlete_id    = NEW.athlete_id
      AND rta.unassigned_at IS NULL
  LOOP
    UPDATE routine_template_assignments SET unassigned_at = now()
    WHERE template_id   = v_tid
      AND athlete_id    = NEW.athlete_id
      AND unassigned_at IS NULL;

    -- Athlete keeps their routine but it becomes a personal fork
    UPDATE routines SET
      is_overridden      = true,
      overridden_at      = COALESCE(overridden_at, now()),
      source_template_id = NULL,
      updated_at         = now()
    WHERE user_id           = NEW.athlete_id
      AND source_template_id = v_tid;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_coach_athlete_status_change
  AFTER UPDATE OF status ON coach_athletes
  FOR EACH ROW EXECUTE FUNCTION handle_coach_athlete_status_change();


-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_routine_templates_coach
  ON routine_templates (owner_coach_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_template_days_template
  ON routine_template_days (template_id);

CREATE INDEX IF NOT EXISTS idx_template_exercises_day
  ON routine_template_exercises (template_day_id);

CREATE INDEX IF NOT EXISTS idx_template_assignments_template
  ON routine_template_assignments (template_id) WHERE unassigned_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_template_assignments_athlete
  ON routine_template_assignments (athlete_id) WHERE unassigned_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_routines_source_template
  ON routines (source_template_id) WHERE source_template_id IS NOT NULL;


-- ============================================================================
-- BACKFILL: existing hand-built routines become personal forks
-- (safe from template pushes; no Customized badge shown since source_template_id IS NULL)
-- ============================================================================
UPDATE routines
SET is_overridden = true,
    overridden_at = now()
WHERE source_template_id IS NULL
  AND is_overridden = false;
