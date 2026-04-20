-- ============================================================================
-- Theryn — Initial Schema Migration
-- All tables, indexes, views, functions, RLS policies, triggers, and seed data
-- ============================================================================

-- Enable pg_trgm for fuzzy/full-text exercise name search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── PROFILES ────────────────────────────────────────────────────────────────
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  unit_system TEXT DEFAULT 'imperial' CHECK (unit_system IN ('imperial', 'metric')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Auto-create profile on new user sign-up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'User'),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ── PUBLIC EXERCISES (read-only library) ────────────────────────────────────
CREATE TABLE public_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  muscle_group TEXT NOT NULL,
  equipment TEXT NOT NULL,
  category TEXT,
  aliases TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public exercises are readable by all"
  ON public_exercises FOR SELECT USING (true);


-- ── USER EXERCISES (private per user) ───────────────────────────────────────
CREATE TABLE user_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  muscle_group TEXT,
  equipment TEXT,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own custom exercises"
  ON user_exercises FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ── ROUTINES ────────────────────────────────────────────────────────────────
CREATE TABLE routines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL DEFAULT 'My Routine',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE routines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own routines"
  ON routines FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own routines"
  ON routines FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own routines"
  ON routines FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own routines"
  ON routines FOR DELETE USING (auth.uid() = user_id);


-- ── ROUTINE DAYS ────────────────────────────────────────────────────────────
CREATE TABLE routine_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id UUID REFERENCES routines(id) ON DELETE CASCADE NOT NULL,
  day_index INT NOT NULL CHECK (day_index BETWEEN 0 AND 6),
  workout_type TEXT NOT NULL,
  label TEXT,
  UNIQUE (routine_id, day_index)
);

ALTER TABLE routine_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own routine days"
  ON routine_days FOR SELECT
  USING (EXISTS (SELECT 1 FROM routines WHERE routines.id = routine_days.routine_id AND routines.user_id = auth.uid()));

CREATE POLICY "Users can insert own routine days"
  ON routine_days FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM routines WHERE routines.id = routine_days.routine_id AND routines.user_id = auth.uid()));

CREATE POLICY "Users can update own routine days"
  ON routine_days FOR UPDATE
  USING (EXISTS (SELECT 1 FROM routines WHERE routines.id = routine_days.routine_id AND routines.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM routines WHERE routines.id = routine_days.routine_id AND routines.user_id = auth.uid()));

CREATE POLICY "Users can delete own routine days"
  ON routine_days FOR DELETE
  USING (EXISTS (SELECT 1 FROM routines WHERE routines.id = routine_days.routine_id AND routines.user_id = auth.uid()));


-- ── ROUTINE EXERCISES ───────────────────────────────────────────────────────
CREATE TABLE routine_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_day_id UUID REFERENCES routine_days(id) ON DELETE CASCADE NOT NULL,
  exercise_id UUID NOT NULL,
  sort_order INT DEFAULT 0,
  target_sets INT DEFAULT 3,
  target_reps TEXT DEFAULT '8-12',
  notes TEXT
);

ALTER TABLE routine_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own routine exercises"
  ON routine_exercises FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM routine_days rd
    JOIN routines r ON r.id = rd.routine_id
    WHERE rd.id = routine_exercises.routine_day_id AND r.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own routine exercises"
  ON routine_exercises FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM routine_days rd
    JOIN routines r ON r.id = rd.routine_id
    WHERE rd.id = routine_exercises.routine_day_id AND r.user_id = auth.uid()
  ));

CREATE POLICY "Users can update own routine exercises"
  ON routine_exercises FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM routine_days rd
    JOIN routines r ON r.id = rd.routine_id
    WHERE rd.id = routine_exercises.routine_day_id AND r.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM routine_days rd
    JOIN routines r ON r.id = rd.routine_id
    WHERE rd.id = routine_exercises.routine_day_id AND r.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own routine exercises"
  ON routine_exercises FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM routine_days rd
    JOIN routines r ON r.id = rd.routine_id
    WHERE rd.id = routine_exercises.routine_day_id AND r.user_id = auth.uid()
  ));


-- ── WORKOUT SESSIONS ────────────────────────────────────────────────────────
CREATE TABLE workout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  routine_day_id UUID REFERENCES routine_days(id),
  workout_type TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE workout_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own sessions"
  ON workout_sessions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions"
  ON workout_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions"
  ON workout_sessions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own sessions"
  ON workout_sessions FOR DELETE USING (auth.uid() = user_id);


-- ── WORKOUT SETS ────────────────────────────────────────────────────────────
CREATE TABLE workout_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES workout_sessions(id) ON DELETE CASCADE NOT NULL,
  exercise_id UUID NOT NULL,
  set_number INT NOT NULL,
  weight NUMERIC(7,2),
  reps INT,
  is_pr BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE workout_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own sets"
  ON workout_sets FOR SELECT
  USING (EXISTS (SELECT 1 FROM workout_sessions ws WHERE ws.id = workout_sets.session_id AND ws.user_id = auth.uid()));

CREATE POLICY "Users can insert own sets"
  ON workout_sets FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM workout_sessions ws WHERE ws.id = workout_sets.session_id AND ws.user_id = auth.uid()));

CREATE POLICY "Users can update own sets"
  ON workout_sets FOR UPDATE
  USING (EXISTS (SELECT 1 FROM workout_sessions ws WHERE ws.id = workout_sets.session_id AND ws.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM workout_sessions ws WHERE ws.id = workout_sets.session_id AND ws.user_id = auth.uid()));

CREATE POLICY "Users can delete own sets"
  ON workout_sets FOR DELETE
  USING (EXISTS (SELECT 1 FROM workout_sessions ws WHERE ws.id = workout_sets.session_id AND ws.user_id = auth.uid()));


-- ── BODY WEIGHTS ────────────────────────────────────────────────────────────
CREATE TABLE body_weights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  weight NUMERIC(6,2) NOT NULL,
  logged_at DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  UNIQUE (user_id, logged_at)
);

ALTER TABLE body_weights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own body weights"
  ON body_weights FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ── BODY MEASUREMENTS ───────────────────────────────────────────────────────
CREATE TABLE body_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  logged_at DATE DEFAULT CURRENT_DATE,
  chest NUMERIC(6,2),
  waist NUMERIC(6,2),
  hips NUMERIC(6,2),
  bicep_l NUMERIC(6,2),
  bicep_r NUMERIC(6,2),
  thigh_l NUMERIC(6,2),
  thigh_r NUMERIC(6,2),
  calf_l NUMERIC(6,2),
  calf_r NUMERIC(6,2),
  neck NUMERIC(6,2),
  shoulders NUMERIC(6,2),
  forearm_l NUMERIC(6,2),
  forearm_r NUMERIC(6,2),
  notes TEXT,
  UNIQUE (user_id, logged_at)
);

ALTER TABLE body_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own measurements"
  ON body_measurements FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ── PERSONAL RECORDS ────────────────────────────────────────────────────────
CREATE TABLE personal_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  exercise_id UUID NOT NULL,
  weight NUMERIC(7,2) NOT NULL,
  reps INT NOT NULL DEFAULT 1,
  achieved_at DATE NOT NULL,
  session_id UUID REFERENCES workout_sessions(id),
  UNIQUE (user_id, exercise_id)
);

ALTER TABLE personal_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own PRs"
  ON personal_records FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ── COACHING RELATIONSHIPS ──────────────────────────────────────────────────
CREATE TABLE coach_athletes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  coach_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  coach_email TEXT NOT NULL,
  permission TEXT NOT NULL DEFAULT 'edit_routine'
    CHECK (permission IN ('view', 'edit_routine', 'full')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'revoked')),
  invite_code TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  UNIQUE (athlete_id, coach_email)
);

ALTER TABLE coach_athletes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Athletes manage own coaching relationships"
  ON coach_athletes FOR ALL
  USING (auth.uid() = athlete_id)
  WITH CHECK (auth.uid() = athlete_id);

CREATE POLICY "Coaches can see invites to them"
  ON coach_athletes FOR SELECT
  USING (
    coach_id = auth.uid()
    OR coach_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

CREATE POLICY "Coaches can accept invites"
  ON coach_athletes FOR UPDATE
  USING (
    coach_email = (SELECT email FROM auth.users WHERE id = auth.uid())
    AND status = 'pending'
  )
  WITH CHECK (status IN ('accepted', 'declined'));


-- ── COACH ACTIVITY LOG ──────────────────────────────────────────────────────
CREATE TABLE coach_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_athlete_id UUID REFERENCES coach_athletes(id) ON DELETE CASCADE NOT NULL,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE coach_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach activity visible to both parties"
  ON coach_activity_log FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM coach_athletes ca
    WHERE ca.id = coach_activity_log.coach_athlete_id
      AND (ca.athlete_id = auth.uid() OR ca.coach_id = auth.uid())
      AND ca.status = 'accepted'
  ));

CREATE POLICY "Coaches can insert activity"
  ON coach_activity_log FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM coach_athletes ca
    WHERE ca.id = coach_activity_log.coach_athlete_id
      AND ca.coach_id = auth.uid()
      AND ca.status = 'accepted'
  ));


-- ── AI IMPORTS ──────────────────────────────────────────────────────────────
CREATE TABLE ai_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  raw_input TEXT NOT NULL,
  parsed_output JSONB NOT NULL,
  previous_state JSONB,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'reverted')),
  applied_to_routine_id UUID REFERENCES routines(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE ai_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own AI imports"
  ON ai_imports FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_workout_sets_exercise_session
  ON workout_sets (exercise_id, set_number, created_at DESC);

CREATE INDEX idx_workout_sessions_user_date
  ON workout_sessions (user_id, started_at DESC);

CREATE INDEX idx_body_weights_user_date
  ON body_weights (user_id, logged_at DESC);

CREATE INDEX idx_body_measurements_user_date
  ON body_measurements (user_id, logged_at DESC);

CREATE INDEX idx_public_exercises_name
  ON public_exercises USING gin (name gin_trgm_ops);

CREATE INDEX idx_user_exercises_user
  ON user_exercises (user_id);


-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Coach access helper
CREATE OR REPLACE FUNCTION is_coach_of(athlete UUID, required_permission TEXT DEFAULT 'view')
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM coach_athletes
    WHERE athlete_id = athlete
      AND coach_id = auth.uid()
      AND status = 'accepted'
      AND (
        required_permission = 'view'
        OR (required_permission = 'edit_routine' AND permission IN ('edit_routine', 'full'))
        OR (required_permission = 'full' AND permission = 'full')
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- Exercise search (custom first, then public library)
CREATE OR REPLACE FUNCTION search_exercises(search_term TEXT, user_uid UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  muscle_group TEXT,
  equipment TEXT,
  is_custom BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
    -- User's custom exercises (ranked first)
    SELECT ue.id, ue.name, ue.muscle_group, ue.equipment, true
    FROM user_exercises ue
    WHERE ue.user_id = user_uid
      AND ue.name ILIKE '%' || search_term || '%'

    UNION ALL

    -- Public library (search name + aliases)
    SELECT pe.id, pe.name, pe.muscle_group, pe.equipment, false
    FROM public_exercises pe
    WHERE pe.name ILIKE '%' || search_term || '%'
       OR EXISTS (SELECT 1 FROM unnest(pe.aliases) alias WHERE alias ILIKE '%' || search_term || '%')
    -- Exclude public exercises the user already has a custom version of
    AND NOT EXISTS (
      SELECT 1 FROM user_exercises ue
      WHERE ue.user_id = user_uid
        AND lower(ue.name) = lower(pe.name)
    )

    ORDER BY is_custom DESC, name
    LIMIT 8;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Last set memory: fetch ghost values for a set of exercises
CREATE OR REPLACE FUNCTION get_last_set_values(
  p_user_id UUID,
  p_exercise_ids UUID[]
)
RETURNS TABLE (
  exercise_id UUID,
  set_number INT,
  weight NUMERIC(7,2),
  reps INT,
  session_date TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
    SELECT DISTINCT ON (ws.exercise_id, ws.set_number)
      ws.exercise_id,
      ws.set_number,
      ws.weight,
      ws.reps,
      wk.started_at AS session_date
    FROM workout_sets ws
    JOIN workout_sessions wk ON ws.session_id = wk.id
    WHERE wk.user_id = p_user_id
      AND ws.exercise_id = ANY(p_exercise_ids)
    ORDER BY ws.exercise_id, ws.set_number, wk.started_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- VIEWS
-- ============================================================================

-- Weekly volume (total sets per week per muscle group)
CREATE VIEW weekly_volume AS
SELECT
  ws.user_id,
  date_trunc('week', ws.started_at) AS week,
  e.muscle_group,
  COUNT(wset.id) AS total_sets,
  SUM(wset.weight * wset.reps) AS total_volume
FROM workout_sets wset
JOIN workout_sessions ws ON wset.session_id = ws.id
JOIN public_exercises e ON wset.exercise_id = e.id
WHERE ws.completed_at IS NOT NULL
GROUP BY ws.user_id, date_trunc('week', ws.started_at), e.muscle_group;

-- Best lifts per exercise
CREATE VIEW best_lifts AS
SELECT DISTINCT ON (ws.user_id, wset.exercise_id)
  ws.user_id,
  wset.exercise_id,
  e.name AS exercise_name,
  wset.weight,
  wset.reps,
  ws.started_at
FROM workout_sets wset
JOIN workout_sessions ws ON wset.session_id = ws.id
JOIN public_exercises e ON wset.exercise_id = e.id
ORDER BY ws.user_id, wset.exercise_id, wset.weight DESC, wset.reps DESC;


-- ============================================================================
-- COACH-AWARE RLS POLICIES (extend existing per-user policies)
-- ============================================================================

-- Coaches can view workout sessions
CREATE POLICY "Coaches can view client sessions"
  ON workout_sessions FOR SELECT
  USING (is_coach_of(user_id, 'view'));

-- Full-access coaches can insert sessions
CREATE POLICY "Full coaches can insert client sessions"
  ON workout_sessions FOR INSERT
  WITH CHECK (is_coach_of(user_id, 'full'));

-- Coaches can view workout sets (via session)
CREATE POLICY "Coaches can view client sets"
  ON workout_sets FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM workout_sessions ws
    WHERE ws.id = workout_sets.session_id AND is_coach_of(ws.user_id, 'view')
  ));

-- Coaches can view body weights
CREATE POLICY "Coaches can view client body weights"
  ON body_weights FOR SELECT
  USING (is_coach_of(user_id, 'view'));

-- Coaches can view body measurements
CREATE POLICY "Coaches can view client measurements"
  ON body_measurements FOR SELECT
  USING (is_coach_of(user_id, 'view'));

-- Coaches can view PRs
CREATE POLICY "Coaches can view client PRs"
  ON personal_records FOR SELECT
  USING (is_coach_of(user_id, 'view'));

-- Coaches can view client profiles
CREATE POLICY "Coaches can view client profiles"
  ON profiles FOR SELECT
  USING (is_coach_of(id, 'view'));

-- Coaches with edit_routine can manage routine tables
CREATE POLICY "Coaches can view client routines"
  ON routines FOR SELECT
  USING (is_coach_of(user_id, 'view'));

CREATE POLICY "Coaches can edit client routines"
  ON routines FOR UPDATE
  USING (is_coach_of(user_id, 'edit_routine'))
  WITH CHECK (is_coach_of(user_id, 'edit_routine'));

CREATE POLICY "Coaches can delete client routines"
  ON routines FOR DELETE
  USING (is_coach_of(user_id, 'edit_routine'));

CREATE POLICY "Coaches can view client routine days"
  ON routine_days FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM routines r WHERE r.id = routine_days.routine_id AND is_coach_of(r.user_id, 'view')
  ));

CREATE POLICY "Coaches can edit client routine days"
  ON routine_days FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM routines r WHERE r.id = routine_days.routine_id AND is_coach_of(r.user_id, 'edit_routine')
  ));

CREATE POLICY "Coaches can update client routine days"
  ON routine_days FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM routines r WHERE r.id = routine_days.routine_id AND is_coach_of(r.user_id, 'edit_routine')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM routines r WHERE r.id = routine_days.routine_id AND is_coach_of(r.user_id, 'edit_routine')
  ));

CREATE POLICY "Coaches can delete client routine days"
  ON routine_days FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM routines r WHERE r.id = routine_days.routine_id AND is_coach_of(r.user_id, 'edit_routine')
  ));

CREATE POLICY "Coaches can view client routine exercises"
  ON routine_exercises FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM routine_days rd
    JOIN routines r ON r.id = rd.routine_id
    WHERE rd.id = routine_exercises.routine_day_id AND is_coach_of(r.user_id, 'view')
  ));

CREATE POLICY "Coaches can edit client routine exercises"
  ON routine_exercises FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM routine_days rd
    JOIN routines r ON r.id = rd.routine_id
    WHERE rd.id = routine_exercises.routine_day_id AND is_coach_of(r.user_id, 'edit_routine')
  ));

CREATE POLICY "Coaches can update client routine exercises"
  ON routine_exercises FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM routine_days rd
    JOIN routines r ON r.id = rd.routine_id
    WHERE rd.id = routine_exercises.routine_day_id AND is_coach_of(r.user_id, 'edit_routine')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM routine_days rd
    JOIN routines r ON r.id = rd.routine_id
    WHERE rd.id = routine_exercises.routine_day_id AND is_coach_of(r.user_id, 'edit_routine')
  ));

CREATE POLICY "Coaches can delete client routine exercises"
  ON routine_exercises FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM routine_days rd
    JOIN routines r ON r.id = rd.routine_id
    WHERE rd.id = routine_exercises.routine_day_id AND is_coach_of(r.user_id, 'edit_routine')
  ));

-- Full coaches can insert body weights
CREATE POLICY "Full coaches can insert client body weights"
  ON body_weights FOR INSERT
  WITH CHECK (is_coach_of(user_id, 'full'));

-- Full coaches can insert sets
CREATE POLICY "Full coaches can insert client sets"
  ON workout_sets FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM workout_sessions ws
    WHERE ws.id = workout_sets.session_id AND is_coach_of(ws.user_id, 'full')
  ));


-- ============================================================================
-- SEED DATA: ~300 PUBLIC EXERCISES
-- ============================================================================

INSERT INTO public_exercises (name, muscle_group, equipment, category, aliases) VALUES

-- CHEST (20)
('Barbell Bench Press',        'chest', 'barbell',    'compound',  '{"flat bench", "bench press", "bb bench"}'),
('Incline Barbell Bench Press','chest', 'barbell',    'compound',  '{"incline bench", "incline press"}'),
('Decline Barbell Bench Press','chest', 'barbell',    'compound',  '{"decline bench", "decline press"}'),
('Dumbbell Bench Press',       'chest', 'dumbbell',   'compound',  '{"db bench", "dumbbell press"}'),
('Incline Dumbbell Press',     'chest', 'dumbbell',   'compound',  '{"incline db press"}'),
('Decline Dumbbell Press',     'chest', 'dumbbell',   'compound',  '{"decline db press"}'),
('Dumbbell Fly',               'chest', 'dumbbell',   'isolation', '{"chest fly", "db fly", "pec fly"}'),
('Incline Dumbbell Fly',       'chest', 'dumbbell',   'isolation', '{"incline fly"}'),
('Cable Crossover',            'chest', 'cable',      'isolation', '{"cable fly", "crossover"}'),
('Low Cable Fly',              'chest', 'cable',      'isolation', '{"low to high cable fly"}'),
('High Cable Fly',             'chest', 'cable',      'isolation', '{"high to low cable fly"}'),
('Machine Chest Press',        'chest', 'machine',    'compound',  '{"chest press machine"}'),
('Incline Machine Press',      'chest', 'machine',    'compound',  '{"incline machine press"}'),
('Push-Up',                    'chest', 'bodyweight', 'compound',  '{"pushup", "press up"}'),
('Diamond Push-Up',            'chest', 'bodyweight', 'compound',  '{"diamond pushup", "close grip pushup"}'),
('Decline Push-Up',            'chest', 'bodyweight', 'compound',  '{"decline pushup", "feet elevated pushup"}'),
('Dips (Chest)',               'chest', 'bodyweight', 'compound',  '{"chest dips", "weighted dips"}'),
('Pec Deck',                   'chest', 'machine',    'isolation', '{"pec deck fly", "butterfly"}'),
('Smith Machine Bench Press',  'chest', 'smith_machine','compound','{"smith bench"}'),
('Svend Press',                'chest', 'dumbbell',   'isolation', '{"plate squeeze press"}'),

-- BACK (25)
('Barbell Row',                'back', 'barbell',    'compound',  '{"bent over row", "bb row", "barbell bent over row"}'),
('Pendlay Row',                'back', 'barbell',    'compound',  '{"pendlay", "strict row"}'),
('Dumbbell Row',               'back', 'dumbbell',   'compound',  '{"one arm row", "db row", "single arm row"}'),
('Pull-Up',                    'back', 'bodyweight', 'compound',  '{"pullup", "chin up variant"}'),
('Chin-Up',                    'back', 'bodyweight', 'compound',  '{"chinup", "chin-up"}'),
('Neutral Grip Pull-Up',       'back', 'bodyweight', 'compound',  '{"neutral pullup", "hammer grip pullup"}'),
('Lat Pulldown',               'back', 'cable',      'compound',  '{"pulldown", "lat pull down"}'),
('Close Grip Lat Pulldown',    'back', 'cable',      'compound',  '{"close grip pulldown"}'),
('Reverse Grip Lat Pulldown',  'back', 'cable',      'compound',  '{"reverse pulldown", "underhand pulldown"}'),
('Seated Cable Row',           'back', 'cable',      'compound',  '{"cable row", "seated row"}'),
('Close Grip Cable Row',       'back', 'cable',      'compound',  '{"close grip row", "v-bar row"}'),
('T-Bar Row',                  'back', 'barbell',    'compound',  '{"t bar row", "landmine row"}'),
('Chest-Supported Row',        'back', 'dumbbell',   'compound',  '{"chest supported db row", "incline row"}'),
('Face Pull',                  'back', 'cable',      'isolation', '{"face pulls", "rear delt pull"}'),
('Deadlift',                   'back', 'barbell',    'compound',  '{"conventional deadlift", "dl"}'),
('Sumo Deadlift',              'back', 'barbell',    'compound',  '{"sumo dl", "sumo"}'),
('Rack Pull',                  'back', 'barbell',    'compound',  '{"rack deadlift", "block pull"}'),
('Straight Arm Pulldown',      'back', 'cable',      'isolation', '{"straight arm pushdown", "lat pushdown"}'),
('Machine Row',                'back', 'machine',    'compound',  '{"seated machine row", "plate loaded row"}'),
('Inverted Row',               'back', 'bodyweight', 'compound',  '{"body row", "australian pull-up"}'),
('Meadows Row',                'back', 'barbell',    'compound',  '{"landmine meadows row"}'),
('Dumbbell Pullover',          'back', 'dumbbell',   'compound',  '{"db pullover", "pullover"}'),
('Seal Row',                   'back', 'barbell',    'compound',  '{"prone row"}'),
('Single Arm Cable Row',       'back', 'cable',      'compound',  '{"one arm cable row"}'),
('Kroc Row',                   'back', 'dumbbell',   'compound',  '{"heavy dumbbell row"}'),

-- SHOULDERS (22)
('Overhead Press',             'shoulders', 'barbell',  'compound',  '{"ohp", "military press", "barbell press"}'),
('Seated Overhead Press',      'shoulders', 'barbell',  'compound',  '{"seated ohp", "seated military press"}'),
('Dumbbell Shoulder Press',    'shoulders', 'dumbbell', 'compound',  '{"db shoulder press", "seated press"}'),
('Arnold Press',               'shoulders', 'dumbbell', 'compound',  '{"arnold dumbbell press"}'),
('Lateral Raise',              'shoulders', 'dumbbell', 'isolation', '{"side raise", "lat raise", "side lateral"}'),
('Cable Lateral Raise',        'shoulders', 'cable',    'isolation', '{"cable side raise"}'),
('Machine Lateral Raise',      'shoulders', 'machine',  'isolation', '{"machine side raise"}'),
('Front Raise',                'shoulders', 'dumbbell', 'isolation', '{"front delt raise"}'),
('Cable Front Raise',          'shoulders', 'cable',    'isolation', '{"cable front raise"}'),
('Reverse Fly',                'shoulders', 'dumbbell', 'isolation', '{"rear delt fly", "reverse dumbbell fly"}'),
('Cable Reverse Fly',          'shoulders', 'cable',    'isolation', '{"cable rear delt fly"}'),
('Machine Reverse Fly',        'shoulders', 'machine',  'isolation', '{"reverse pec deck", "rear delt machine"}'),
('Upright Row',                'shoulders', 'barbell',  'compound',  '{"barbell upright row"}'),
('Dumbbell Upright Row',       'shoulders', 'dumbbell', 'compound',  '{"db upright row"}'),
('Behind The Neck Press',      'shoulders', 'barbell',  'compound',  '{"btn press"}'),
('Push Press',                 'shoulders', 'barbell',  'compound',  '{"barbell push press"}'),
('Landmine Press',             'shoulders', 'barbell',  'compound',  '{"single arm landmine press"}'),
('Smith Machine OHP',          'shoulders', 'smith_machine','compound','{"smith shoulder press"}'),
('Lu Raise',                   'shoulders', 'dumbbell', 'isolation', '{"lu lateral raise"}'),
('Plate Front Raise',          'shoulders', 'barbell',  'isolation', '{"plate raise"}'),
('Dumbbell Shrug',             'shoulders', 'dumbbell', 'isolation', '{"db shrug", "shrugs"}'),
('Barbell Shrug',              'shoulders', 'barbell',  'isolation', '{"bb shrug", "shrugs"}'),

-- QUADS (20)
('Barbell Squat',              'quads', 'barbell',  'compound',  '{"squat", "back squat", "bb squat"}'),
('Front Squat',                'quads', 'barbell',  'compound',  '{"barbell front squat"}'),
('Leg Press',                  'quads', 'machine',  'compound',  '{"leg press machine", "45 degree leg press"}'),
('Leg Extension',              'quads', 'machine',  'isolation', '{"quad extension", "leg ext"}'),
('Bulgarian Split Squat',      'quads', 'dumbbell', 'compound',  '{"bss", "split squat", "rear foot elevated"}'),
('Goblet Squat',               'quads', 'dumbbell', 'compound',  '{"db goblet squat"}'),
('Hack Squat',                 'quads', 'machine',  'compound',  '{"hack squat machine"}'),
('Lunge',                      'quads', 'dumbbell', 'compound',  '{"walking lunge", "db lunge", "forward lunge"}'),
('Reverse Lunge',              'quads', 'dumbbell', 'compound',  '{"db reverse lunge", "step back lunge"}'),
('Smith Machine Squat',        'quads', 'smith_machine','compound','{"smith squat"}'),
('Sissy Squat',                'quads', 'bodyweight','isolation', '{"sissy squat"}'),
('Leg Press (Close Stance)',   'quads', 'machine',  'compound',  '{"close stance leg press"}'),
('Step-Up',                    'quads', 'dumbbell', 'compound',  '{"dumbbell step up", "box step up"}'),
('Wall Sit',                   'quads', 'bodyweight','isolation', '{"wall squat"}'),
('Pistol Squat',               'quads', 'bodyweight','compound',  '{"single leg squat"}'),
('Belt Squat',                 'quads', 'machine',  'compound',  '{"belt squat machine"}'),
('Pendulum Squat',             'quads', 'machine',  'compound',  '{"pendulum squat machine"}'),
('Safety Bar Squat',           'quads', 'barbell',  'compound',  '{"ssb squat", "safety squat bar"}'),
('Zercher Squat',              'quads', 'barbell',  'compound',  '{"zercher"}'),
('Box Squat',                  'quads', 'barbell',  'compound',  '{"barbell box squat"}'),

-- HAMSTRINGS (15)
('Romanian Deadlift',          'hamstrings', 'barbell',  'compound',  '{"rdl", "stiff leg deadlift", "romanian dl"}'),
('Dumbbell Romanian Deadlift', 'hamstrings', 'dumbbell', 'compound',  '{"db rdl", "dumbbell rdl"}'),
('Single Leg Romanian Deadlift','hamstrings','dumbbell', 'compound',  '{"single leg rdl", "one leg rdl"}'),
('Leg Curl',                   'hamstrings', 'machine',  'isolation', '{"hamstring curl", "lying leg curl"}'),
('Seated Leg Curl',            'hamstrings', 'machine',  'isolation', '{"seated hamstring curl"}'),
('Nordic Hamstring Curl',      'hamstrings', 'bodyweight','isolation','{"nordic curl", "russian leg curl"}'),
('Good Morning',               'hamstrings', 'barbell',  'compound',  '{"barbell good morning"}'),
('Glute Ham Raise',            'hamstrings', 'bodyweight','compound', '{"ghr", "glute ham developer"}'),
('Cable Pull Through',         'hamstrings', 'cable',    'compound',  '{"pull through"}'),
('Stiff Leg Deadlift',        'hamstrings', 'barbell',  'compound',  '{"sldl", "stiff legged deadlift"}'),
('Single Leg Curl',            'hamstrings', 'machine',  'isolation', '{"one leg curl"}'),
('Kettlebell Swing',           'hamstrings', 'kettlebell','compound', '{"kb swing", "russian swing"}'),
('Dumbbell Leg Curl',          'hamstrings', 'dumbbell', 'isolation', '{"db leg curl"}'),
('Banded Leg Curl',            'hamstrings', 'band',     'isolation', '{"band hamstring curl"}'),
('Swiss Ball Leg Curl',        'hamstrings', 'bodyweight','isolation','{"stability ball leg curl"}'),

-- GLUTES (12)
('Hip Thrust',                 'glutes', 'barbell',  'compound',  '{"barbell hip thrust", "glute bridge"}'),
('Dumbbell Hip Thrust',        'glutes', 'dumbbell', 'compound',  '{"db hip thrust"}'),
('Single Leg Hip Thrust',      'glutes', 'bodyweight','compound', '{"single leg glute bridge"}'),
('Glute Bridge',               'glutes', 'bodyweight','compound', '{"bridge", "floor bridge"}'),
('Cable Kickback',             'glutes', 'cable',    'isolation', '{"cable glute kickback", "donkey kickback"}'),
('Cable Pull-Through',         'glutes', 'cable',    'compound',  '{"cable pull through"}'),
('Sumo Squat',                 'glutes', 'dumbbell', 'compound',  '{"sumo goblet squat", "wide squat"}'),
('Frog Pump',                  'glutes', 'bodyweight','isolation','{"glute frog pump"}'),
('Banded Hip Abduction',       'glutes', 'band',     'isolation', '{"band abduction", "banded clamshell"}'),
('Machine Hip Abduction',      'glutes', 'machine',  'isolation', '{"hip abduction machine"}'),
('Kickback (Machine)',         'glutes', 'machine',  'isolation', '{"glute kickback machine"}'),
('Curtsy Lunge',               'glutes', 'dumbbell', 'compound',  '{"crossover lunge"}'),

-- CALVES (8)
('Standing Calf Raise',        'calves', 'machine',    'isolation', '{"calf raise", "calf raise machine"}'),
('Seated Calf Raise',          'calves', 'machine',    'isolation', '{"seated calf"}'),
('Donkey Calf Raise',          'calves', 'machine',    'isolation', '{"donkey calf"}'),
('Smith Machine Calf Raise',   'calves', 'smith_machine','isolation','{"smith calf raise"}'),
('Single Leg Calf Raise',      'calves', 'bodyweight', 'isolation', '{"one leg calf raise"}'),
('Leg Press Calf Raise',       'calves', 'machine',    'isolation', '{"calf press on leg press"}'),
('Barbell Calf Raise',         'calves', 'barbell',    'isolation', '{"bb calf raise"}'),
('Tibialis Raise',             'calves', 'bodyweight', 'isolation', '{"tib raise", "toe raise"}'),

-- BICEPS (18)
('Barbell Curl',               'biceps', 'barbell',  'isolation', '{"bb curl", "standing curl"}'),
('EZ Bar Curl',                'biceps', 'ez_bar',   'isolation', '{"ez curl", "easy bar curl"}'),
('Dumbbell Curl',              'biceps', 'dumbbell', 'isolation', '{"db curl", "bicep curl"}'),
('Hammer Curl',                'biceps', 'dumbbell', 'isolation', '{"db hammer curl", "neutral grip curl"}'),
('Preacher Curl',              'biceps', 'ez_bar',   'isolation', '{"ez bar preacher", "preacher bench curl"}'),
('Dumbbell Preacher Curl',     'biceps', 'dumbbell', 'isolation', '{"db preacher curl", "single arm preacher"}'),
('Incline Dumbbell Curl',      'biceps', 'dumbbell', 'isolation', '{"incline curl"}'),
('Cable Curl',                 'biceps', 'cable',    'isolation', '{"cable bicep curl"}'),
('Concentration Curl',         'biceps', 'dumbbell', 'isolation', '{"seated concentration curl"}'),
('Spider Curl',                'biceps', 'dumbbell', 'isolation', '{"spider db curl"}'),
('Bayesian Curl',              'biceps', 'cable',    'isolation', '{"cable bayesian curl"}'),
('Reverse Curl',               'biceps', 'barbell',  'isolation', '{"reverse barbell curl"}'),
('Cross Body Curl',            'biceps', 'dumbbell', 'isolation', '{"cross body hammer curl"}'),
('Drag Curl',                  'biceps', 'barbell',  'isolation', '{"barbell drag curl"}'),
('Cable Hammer Curl',          'biceps', 'cable',    'isolation', '{"rope hammer curl"}'),
('Machine Curl',               'biceps', 'machine',  'isolation', '{"bicep curl machine"}'),
('21s',                        'biceps', 'barbell',  'isolation', '{"twenty ones", "barbell 21s"}'),
('Zottman Curl',               'biceps', 'dumbbell', 'isolation', '{"zottman"}'),

-- TRICEPS (16)
('Tricep Pushdown',            'triceps', 'cable',      'isolation', '{"cable pushdown", "rope pushdown", "tricep pressdown"}'),
('Overhead Tricep Extension',  'triceps', 'dumbbell',   'isolation', '{"overhead extension", "french press"}'),
('Overhead Cable Extension',   'triceps', 'cable',      'isolation', '{"cable overhead extension"}'),
('Skull Crusher',              'triceps', 'ez_bar',     'isolation', '{"lying tricep extension", "skullcrusher"}'),
('Close Grip Bench Press',     'triceps', 'barbell',    'compound',  '{"cgbp", "close grip bench"}'),
('Dips (Triceps)',             'triceps', 'bodyweight', 'compound',  '{"tricep dips", "bench dips"}'),
('Bench Dip',                  'triceps', 'bodyweight', 'compound',  '{"tricep bench dip"}'),
('Kickback',                   'triceps', 'dumbbell',   'isolation', '{"tricep kickback", "db kickback"}'),
('Cable Kickback (Tricep)',    'triceps', 'cable',      'isolation', '{"cable tricep kickback"}'),
('Single Arm Pushdown',        'triceps', 'cable',      'isolation', '{"one arm pushdown"}'),
('JM Press',                   'triceps', 'barbell',    'compound',  '{"jm press"}'),
('Diamond Push-Up (Triceps)',  'triceps', 'bodyweight', 'compound',  '{"diamond pushup for triceps"}'),
('Dumbbell Skull Crusher',     'triceps', 'dumbbell',   'isolation', '{"db skull crusher"}'),
('Tate Press',                 'triceps', 'dumbbell',   'isolation', '{"dumbbell tate press"}'),
('Board Press',                'triceps', 'barbell',    'compound',  '{"board bench press"}'),
('Machine Dip',                'triceps', 'machine',    'compound',  '{"assisted dip machine"}'),

-- FOREARMS (8)
('Wrist Curl',                 'forearms', 'barbell',  'isolation', '{"barbell wrist curl", "forearm curl"}'),
('Reverse Wrist Curl',         'forearms', 'barbell',  'isolation', '{"wrist extension"}'),
('Dumbbell Wrist Curl',        'forearms', 'dumbbell', 'isolation', '{"db wrist curl"}'),
('Farmer Walk',                'forearms', 'dumbbell', 'compound',  '{"farmer carry", "farmers walk"}'),
('Dead Hang',                  'forearms', 'bodyweight','isolation','{"bar hang", "passive hang"}'),
('Plate Pinch',                'forearms', 'barbell',  'isolation', '{"plate pinch hold"}'),
('Finger Curl',                'forearms', 'barbell',  'isolation', '{"barbell finger curl"}'),
('Reverse Barbell Curl',       'forearms', 'barbell',  'isolation', '{"reverse curl for forearms"}'),

-- CORE (20)
('Plank',                      'core', 'bodyweight', 'isolation', '{"front plank", "elbow plank"}'),
('Side Plank',                 'core', 'bodyweight', 'isolation', '{"lateral plank"}'),
('Hanging Leg Raise',          'core', 'bodyweight', 'isolation', '{"leg raise", "hanging knee raise"}'),
('Hanging Knee Raise',         'core', 'bodyweight', 'isolation', '{"knee raise"}'),
('Cable Crunch',               'core', 'cable',      'isolation', '{"kneeling cable crunch"}'),
('Ab Wheel Rollout',           'core', 'bodyweight', 'isolation', '{"ab wheel", "rollout"}'),
('Russian Twist',              'core', 'bodyweight', 'isolation', '{"weighted russian twist"}'),
('Crunch',                     'core', 'bodyweight', 'isolation', '{"basic crunch", "floor crunch"}'),
('Bicycle Crunch',             'core', 'bodyweight', 'isolation', '{"bicycle", "cross body crunch"}'),
('Decline Sit-Up',             'core', 'bodyweight', 'isolation', '{"decline crunch", "weighted sit-up"}'),
('Mountain Climber',           'core', 'bodyweight', 'isolation', '{"mountain climbers"}'),
('Dead Bug',                   'core', 'bodyweight', 'isolation', '{"dead bugs"}'),
('Bird Dog',                   'core', 'bodyweight', 'isolation', '{"bird dogs"}'),
('Pallof Press',               'core', 'cable',      'isolation', '{"anti rotation press"}'),
('Woodchop',                   'core', 'cable',      'compound',  '{"cable woodchop", "wood chop"}'),
('Toe Touch',                  'core', 'bodyweight', 'isolation', '{"v-up toe touch"}'),
('Flutter Kick',               'core', 'bodyweight', 'isolation', '{"flutter kicks", "scissor kicks"}'),
('Leg Raise',                  'core', 'bodyweight', 'isolation', '{"lying leg raise", "flat leg raise"}'),
('Dragon Flag',                'core', 'bodyweight', 'isolation', '{"dragon flags"}'),
('L-Sit',                      'core', 'bodyweight', 'isolation', '{"l sit hold"}'),

-- COMPOUND / FULL BODY (15)
('Clean and Press',            'shoulders', 'barbell',    'compound', '{"clean & press", "clean and jerk"}'),
('Power Clean',                'back',      'barbell',    'compound', '{"clean"}'),
('Snatch',                     'shoulders', 'barbell',    'compound', '{"barbell snatch"}'),
('Thruster',                   'quads',     'barbell',    'compound', '{"barbell thruster"}'),
('Dumbbell Thruster',          'quads',     'dumbbell',   'compound', '{"db thruster"}'),
('Man Maker',                  'chest',     'dumbbell',   'compound', '{"man makers"}'),
('Turkish Get-Up',             'core',      'kettlebell', 'compound', '{"tgu", "turkish getup"}'),
('Battle Ropes',               'shoulders', 'bodyweight', 'compound', '{"battle rope", "rope slams"}'),
('Sled Push',                  'quads',     'machine',    'compound', '{"prowler push"}'),
('Sled Pull',                  'back',      'machine',    'compound', '{"prowler pull"}'),
('Box Jump',                   'quads',     'bodyweight', 'compound', '{"box jumps", "plyo box jump"}'),
('Jump Squat',                 'quads',     'bodyweight', 'compound', '{"squat jump"}'),
('Burpee',                     'chest',     'bodyweight', 'compound', '{"burpees"}'),
('Muscle-Up',                  'back',      'bodyweight', 'compound', '{"muscle up", "bar muscle up"}'),
('Handstand Push-Up',          'shoulders', 'bodyweight', 'compound', '{"hspu", "handstand pushup"}'),

-- CARDIO (15)
('Treadmill Run',              'cardio', 'machine',    'cardio', '{"treadmill", "running"}'),
('Treadmill Walk',             'cardio', 'machine',    'cardio', '{"treadmill walk", "incline walk"}'),
('Stationary Bike',            'cardio', 'machine',    'cardio', '{"cycling", "bike", "exercise bike"}'),
('Rowing Machine',             'cardio', 'machine',    'cardio', '{"rower", "erg", "rowing"}'),
('Stair Climber',              'cardio', 'machine',    'cardio', '{"stairmaster", "stair stepper"}'),
('Elliptical',                 'cardio', 'machine',    'cardio', '{"elliptical trainer", "cross trainer"}'),
('Assault Bike',               'cardio', 'machine',    'cardio', '{"air bike", "airdyne", "fan bike"}'),
('Jump Rope',                  'cardio', 'bodyweight', 'cardio', '{"skipping rope", "skip rope"}'),
('Swimming',                   'cardio', 'bodyweight', 'cardio', '{"swim", "laps"}'),
('Sprints',                    'cardio', 'bodyweight', 'cardio', '{"sprint intervals", "wind sprints"}'),
('Hiking',                     'cardio', 'bodyweight', 'cardio', '{"hike", "hill walk"}'),
('Cycling (Outdoor)',          'cardio', 'bodyweight', 'cardio', '{"outdoor cycling", "road cycling"}'),
('Sled Push (Cardio)',         'cardio', 'machine',    'cardio', '{"prowler cardio"}'),
('Ski Erg',                    'cardio', 'machine',    'cardio', '{"ski ergometer", "skierg"}'),
('VersaClimber',               'cardio', 'machine',    'cardio', '{"versaclimber", "climbing machine"}'),

-- STRETCH / MOBILITY (10)
('Foam Roll (Upper Back)',     'back',      'bodyweight', 'stretch', '{"thoracic foam roll"}'),
('Foam Roll (Quads)',          'quads',     'bodyweight', 'stretch', '{"quad foam roll"}'),
('Foam Roll (Hamstrings)',     'hamstrings','bodyweight', 'stretch', '{"hamstring foam roll"}'),
('Hip Flexor Stretch',         'quads',     'bodyweight', 'stretch', '{"hip stretch", "couch stretch"}'),
('Pigeon Stretch',             'glutes',    'bodyweight', 'stretch', '{"pigeon pose"}'),
('Cat-Cow',                    'core',      'bodyweight', 'stretch', '{"cat cow stretch"}'),
('Child Pose',                 'back',      'bodyweight', 'stretch', '{"childs pose"}'),
('Shoulder Dislocate',         'shoulders', 'band',       'stretch', '{"band dislocate", "pass through"}'),
('Leg Swing',                  'hamstrings','bodyweight', 'stretch', '{"leg swings", "dynamic hamstring"}'),
('World Greatest Stretch',     'quads',     'bodyweight', 'stretch', '{"worlds greatest stretch", "wgs"}');
