# Theryn — Architecture Addendum: Exercise Library + Coach Access
> **Adds to**: theryn-backend-architecture.md · **Date**: April 4, 2026

---

## 1. Exercise library (search + autocomplete)

### Design: two-table approach

Instead of one `exercises` table doing double duty, split into two:

```sql
-- Public exercise library (read-only for users, seeded by you)
CREATE TABLE public_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  muscle_group TEXT NOT NULL,      -- 'chest', 'back', 'shoulders', 'biceps', 'triceps',
                                   -- 'quads', 'hamstrings', 'glutes', 'calves', 'core', 'forearms'
  equipment TEXT NOT NULL,         -- 'barbell', 'dumbbell', 'cable', 'machine', 'bodyweight',
                                   -- 'kettlebell', 'band', 'smith_machine', 'ez_bar'
  category TEXT,                   -- 'compound', 'isolation', 'cardio', 'stretch'
  aliases TEXT[],                  -- alternate names for search: {'flat bench', 'chest press'}
  created_at TIMESTAMPTZ DEFAULT now()
);

-- No RLS needed — everyone can read, nobody can write via API
ALTER TABLE public_exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public exercises are readable by all"
  ON public_exercises FOR SELECT USING (true);
-- No INSERT/UPDATE/DELETE policy = users can't modify


-- User custom exercises (private per user)
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
```

### Search view (combines both tables, custom first)

```sql
CREATE VIEW exercise_search AS
-- User's custom exercises first (priority = 1)
SELECT
  id,
  user_id,
  name,
  muscle_group,
  equipment,
  category,
  1 AS priority,
  true AS is_custom
FROM user_exercises

UNION ALL

-- Public library second (priority = 2)
SELECT
  id,
  NULL AS user_id,
  name,
  muscle_group,
  equipment,
  category,
  2 AS priority,
  false AS is_custom
FROM public_exercises

ORDER BY priority, name;
```

### Frontend search query

```typescript
// Autocomplete — fires on every keystroke after 2 chars
async function searchExercises(query: string) {
  const { data } = await supabase
    .rpc('search_exercises', { search_term: query, user_uid: user.id })
    .limit(8)

  return data  // custom exercises ranked first
}
```

### Postgres function for fuzzy search

```sql
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
    -- User's custom exercises (always ranked first)
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
```

### Seed data approach

Create a migration file with ~300 common exercises. Here's the structure:

```sql
-- 001_seed_public_exercises.sql (partial — full list would be ~300 rows)
INSERT INTO public_exercises (name, muscle_group, equipment, category, aliases) VALUES

-- CHEST
('Barbell Bench Press',       'chest',     'barbell',    'compound',  '{"flat bench", "bench press", "bb bench"}'),
('Incline Barbell Bench Press','chest',    'barbell',    'compound',  '{"incline bench", "incline press"}'),
('Dumbbell Bench Press',      'chest',     'dumbbell',   'compound',  '{"db bench", "dumbbell press"}'),
('Incline Dumbbell Press',    'chest',     'dumbbell',   'compound',  '{"incline db press"}'),
('Dumbbell Fly',              'chest',     'dumbbell',   'isolation', '{"chest fly", "db fly", "pec fly"}'),
('Cable Crossover',           'chest',     'cable',      'isolation', '{"cable fly", "crossover"}'),
('Machine Chest Press',       'chest',     'machine',    'compound',  '{"chest press machine"}'),
('Push-Up',                   'chest',     'bodyweight',  'compound', '{"pushup", "press up"}'),
('Dips (Chest)',              'chest',     'bodyweight',  'compound', '{"chest dips", "weighted dips"}'),
('Pec Deck',                  'chest',     'machine',    'isolation', '{"pec deck fly", "butterfly"}'),

-- BACK
('Barbell Row',               'back',      'barbell',    'compound',  '{"bent over row", "bb row", "barbell bent over row"}'),
('Dumbbell Row',              'back',      'dumbbell',   'compound',  '{"one arm row", "db row", "single arm row"}'),
('Pull-Up',                   'back',      'bodyweight',  'compound', '{"pullup", "chin up variant"}'),
('Chin-Up',                   'back',      'bodyweight',  'compound', '{"chinup", "chin-up"}'),
('Lat Pulldown',              'back',      'cable',      'compound',  '{"pulldown", "lat pull down"}'),
('Seated Cable Row',          'back',      'cable',      'compound',  '{"cable row", "seated row"}'),
('T-Bar Row',                 'back',      'barbell',    'compound',  '{"t bar row", "landmine row"}'),
('Face Pull',                 'back',      'cable',      'isolation', '{"face pulls", "rear delt pull"}'),
('Deadlift',                  'back',      'barbell',    'compound',  '{"conventional deadlift", "dl"}'),

-- SHOULDERS
('Overhead Press',            'shoulders', 'barbell',    'compound',  '{"ohp", "military press", "barbell press"}'),
('Dumbbell Shoulder Press',   'shoulders', 'dumbbell',   'compound',  '{"db shoulder press", "seated press"}'),
('Lateral Raise',             'shoulders', 'dumbbell',   'isolation', '{"side raise", "lat raise", "side lateral"}'),
('Front Raise',               'shoulders', 'dumbbell',   'isolation', '{"front delt raise"}'),
('Reverse Fly',               'shoulders', 'dumbbell',   'isolation', '{"rear delt fly", "reverse dumbbell fly"}'),
('Arnold Press',              'shoulders', 'dumbbell',   'compound',  '{"arnold dumbbell press"}'),
('Upright Row',               'shoulders', 'barbell',    'compound',  '{"barbell upright row"}'),

-- LEGS
('Barbell Squat',             'quads',     'barbell',    'compound',  '{"squat", "back squat", "bb squat"}'),
('Front Squat',               'quads',     'barbell',    'compound',  '{"barbell front squat"}'),
('Leg Press',                 'quads',     'machine',    'compound',  '{"leg press machine", "45 degree leg press"}'),
('Leg Extension',             'quads',     'machine',    'isolation', '{"quad extension", "leg ext"}'),
('Romanian Deadlift',         'hamstrings','barbell',    'compound',  '{"rdl", "stiff leg deadlift", "romanian dl"}'),
('Leg Curl',                  'hamstrings','machine',    'isolation', '{"hamstring curl", "lying leg curl"}'),
('Bulgarian Split Squat',     'quads',     'dumbbell',   'compound',  '{"bss", "split squat", "rear foot elevated"}'),
('Hip Thrust',                'glutes',    'barbell',    'compound',  '{"barbell hip thrust", "glute bridge"}'),
('Calf Raise',                'calves',    'machine',    'isolation', '{"standing calf raise", "calf raise machine"}'),
('Goblet Squat',              'quads',     'dumbbell',   'compound',  '{"db goblet squat"}'),
('Hack Squat',                'quads',     'machine',    'compound',  '{"hack squat machine"}'),
('Lunge',                     'quads',     'dumbbell',   'compound',  '{"walking lunge", "db lunge", "forward lunge"}'),

-- BICEPS
('Barbell Curl',              'biceps',    'barbell',    'isolation', '{"bb curl", "standing curl"}'),
('Dumbbell Curl',             'biceps',    'dumbbell',   'isolation', '{"db curl", "bicep curl"}'),
('Hammer Curl',               'biceps',    'dumbbell',   'isolation', '{"db hammer curl", "neutral grip curl"}'),
('Preacher Curl',             'biceps',    'ez_bar',     'isolation', '{"ez bar preacher", "preacher bench curl"}'),
('Incline Dumbbell Curl',     'biceps',    'dumbbell',   'isolation', '{"incline curl"}'),
('Cable Curl',                'biceps',    'cable',      'isolation', '{"cable bicep curl"}'),
('Concentration Curl',        'biceps',    'dumbbell',   'isolation', '{"seated concentration curl"}'),

-- TRICEPS
('Tricep Pushdown',           'triceps',   'cable',      'isolation', '{"cable pushdown", "rope pushdown", "tricep pressdown"}'),
('Overhead Tricep Extension', 'triceps',   'dumbbell',   'isolation', '{"overhead extension", "french press"}'),
('Skull Crusher',             'triceps',   'ez_bar',     'isolation', '{"lying tricep extension", "skullcrusher"}'),
('Close Grip Bench Press',    'triceps',   'barbell',    'compound',  '{"cgbp", "close grip bench"}'),
('Dips (Triceps)',            'triceps',   'bodyweight',  'compound', '{"tricep dips", "bench dips"}'),

-- CORE
('Plank',                     'core',      'bodyweight',  'isolation','{"front plank", "elbow plank"}'),
('Hanging Leg Raise',         'core',      'bodyweight',  'isolation','{"leg raise", "hanging knee raise"}'),
('Cable Crunch',              'core',      'cable',      'isolation', '{"kneeling cable crunch"}'),
('Ab Wheel Rollout',          'core',      'bodyweight',  'isolation','{"ab wheel", "rollout"}'),
('Russian Twist',             'core',      'bodyweight',  'isolation','{"weighted russian twist"}'),

-- CARDIO
('Treadmill Run',             'cardio',    'machine',    'cardio',    '{"treadmill", "running"}'),
('Stationary Bike',           'cardio',    'machine',    'cardio',    '{"cycling", "bike", "exercise bike"}'),
('Rowing Machine',            'cardio',    'machine',    'cardio',    '{"rower", "erg", "rowing"}'),
('Stair Climber',             'cardio',    'machine',    'cardio',    '{"stairmaster", "stair stepper"}'),
('Elliptical',                'cardio',    'machine',    'cardio',    '{"elliptical trainer", "cross trainer"}');
```

---

## 2. Coach access system

### Is it complex? No. Here's why.

With Supabase RLS, you're adding **one table** and **updating existing RLS policies**. No new API endpoints. No new auth system. The coach is just another Google-authenticated user with a relationship record granting scoped access.

### New tables

```sql
-- Coaching relationships
CREATE TABLE coaching_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,   -- the athlete
  coach_id UUID REFERENCES profiles(id) ON DELETE CASCADE,             -- NULL until accepted
  coach_email TEXT NOT NULL,                                            -- used for invite matching
  permission TEXT NOT NULL DEFAULT 'view' 
    CHECK (permission IN ('view', 'edit_routine', 'full')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'revoked')),
  invite_code TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  UNIQUE (client_id, coach_email)
);

ALTER TABLE coaching_relationships ENABLE ROW LEVEL SECURITY;

-- Athletes can manage their own coaching invites
CREATE POLICY "Athletes manage own coaching relationships"
  ON coaching_relationships FOR ALL
  USING (auth.uid() = client_id)
  WITH CHECK (auth.uid() = client_id);

-- Coaches can see/accept invites sent to them
CREATE POLICY "Coaches can see invites to them"
  ON coaching_relationships FOR SELECT
  USING (
    coach_id = auth.uid() 
    OR coach_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- Coaches can update status (accept/decline)
CREATE POLICY "Coaches can accept invites"
  ON coaching_relationships FOR UPDATE
  USING (
    coach_email = (SELECT email FROM auth.users WHERE id = auth.uid())
    AND status = 'pending'
  )
  WITH CHECK (status IN ('accepted', 'declined'));


-- Coach activity log (optional but useful for trust)
CREATE TABLE coach_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coaching_relationship_id UUID REFERENCES coaching_relationships(id) ON DELETE CASCADE NOT NULL,
  action TEXT NOT NULL,           -- 'viewed_routine', 'edited_exercise', 'added_exercise', etc.
  details JSONB,                  -- what changed
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Updated RLS policies (the key insight)

The magic: every existing table's RLS policy just gets one extra `OR` clause. Here's the pattern:

```sql
-- Helper function: check if a user is a coach for a given client
CREATE OR REPLACE FUNCTION is_coach_of(client UUID, required_permission TEXT DEFAULT 'view')
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM coaching_relationships
    WHERE client_id = client
      AND coach_id = auth.uid()
      AND status = 'accepted'
      AND (
        required_permission = 'view'
        OR (required_permission = 'edit_routine' AND permission IN ('edit_routine', 'full'))
        OR (required_permission = 'full' AND permission = 'full')
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- Example: updated workout_sessions policy
DROP POLICY "Users can only access own sessions" ON workout_sessions;

CREATE POLICY "Users and their coaches can access sessions"
  ON workout_sessions FOR SELECT
  USING (
    auth.uid() = user_id
    OR is_coach_of(user_id, 'view')
  );

CREATE POLICY "Users and full-access coaches can insert sessions"
  ON workout_sessions FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR is_coach_of(user_id, 'full')
  );

-- Same pattern for: routines, routine_days, routine_exercises, body_weights, etc.
-- 'view' permission → SELECT only
-- 'edit_routine' permission → SELECT + UPDATE/INSERT on routine tables only
-- 'full' permission → SELECT + UPDATE/INSERT on everything
```

### Invitation flow (frontend code)

```typescript
// ATHLETE: Send invite
async function inviteCoach(coachEmail: string, permission: 'view' | 'edit_routine' | 'full') {
  const { data, error } = await supabase
    .from('coaching_relationships')
    .insert({
      client_id: user.id,
      coach_email: coachEmail,
      permission,
    })
    .select()
    .single()

  // Optional: send email via Edge Function with invite link
  if (data) {
    await supabase.functions.invoke('send-coach-invite', {
      body: { invite_code: data.invite_code, coach_email: coachEmail }
    })
  }
}

// COACH: Accept invite (auto-matched by email on sign-in)
async function acceptInvite(inviteId: string) {
  await supabase
    .from('coaching_relationships')
    .update({ 
      status: 'accepted', 
      coach_id: user.id,
      accepted_at: new Date().toISOString()
    })
    .eq('id', inviteId)
}

// ATHLETE: Revoke access
async function revokeCoach(relationshipId: string) {
  await supabase
    .from('coaching_relationships')
    .update({ status: 'revoked' })
    .eq('id', relationshipId)
    .eq('client_id', user.id)
}

// COACH: Get list of clients
async function getMyClients() {
  const { data } = await supabase
    .from('coaching_relationships')
    .select('*, client:profiles!client_id(display_name, avatar_url)')
    .eq('coach_id', user.id)
    .eq('status', 'accepted')

  return data  // coach sees their client list
}
```

### What the coach sees in the app

The coach doesn't need a separate app. Same Theryn app, same Google login. When a coach signs in:

1. The app checks `coaching_relationships` for any active relationships where they're the coach
2. If found, the app shows a "My Clients" tab (or switcher) at the top
3. Tapping a client loads THAT client's data using the same components — RLS automatically scopes the data
4. The coach sees the same screens (Log, Routine, Body, Progress, Records) but for their client
5. Edit controls are shown/hidden based on the `permission` level

### UI changes needed

- **Settings screen**: "My Coach" section — invite, see active coach, revoke
- **Coach view**: "My Clients" dropdown when logged in as a coach
- **Activity badge**: Small indicator showing when coach last made changes
- **Permission indicator**: Subtle lock icon on sections the coach can't edit

---

## 3. Permission matrix

| Data | `view` | `edit_routine` | `full` |
|---|---|---|---|
| View workout history | yes | yes | yes |
| View body weight/measurements | yes | yes | yes |
| View progress/PRs | yes | yes | yes |
| View routine | yes | yes | yes |
| Edit routine exercises | no | **yes** | **yes** |
| Edit routine sets/reps | no | **yes** | **yes** |
| Log workouts for client | no | no | **yes** |
| Log body weight for client | no | no | **yes** |
| Delete data | no | no | no |
| Manage other coaches | no | no | no |

Note: **Delete is never granted to coaches.** Only the athlete can delete their own data.

---

## 4. Complexity assessment

| Aspect | Effort | Notes |
|---|---|---|
| Exercise seed data | 2-3 hours | One-time SQL migration, ~300 rows |
| Search function | 1 hour | Single Postgres function + frontend autocomplete |
| `coaching_relationships` table | 30 min | One migration |
| Updated RLS policies | 1-2 hours | `is_coach_of()` helper makes it mechanical |
| Coach invite flow (frontend) | 3-4 hours | Invite, accept, revoke UI |
| Coach client switcher (frontend) | 2-3 hours | Dropdown + data scoping |
| **Total** | **~1.5 days** | |

This is absolutely worth it. The coaching feature transforms Theryn from a personal tracker into a **platform** — and it's architecturally simple because Supabase RLS does the heavy lifting. No separate API, no separate auth, no separate database. Just one new table and a helper function.

---

## 5. Updated roadmap

### Phase 1: Foundation (Week 1-2) — unchanged

### Phase 2: Mobile (Week 3) — unchanged

### Phase 3: Exercise Library + AI Import (Week 4)
- [ ] Seed public exercise library (migration)
- [ ] Build search_exercises Postgres function
- [ ] Add autocomplete to exercise input fields
- [ ] Deploy parse-workout Edge Function
- [ ] Build AI paste + diff UI

### Phase 4: Coach Access (Week 5)
- [ ] Add coaching_relationships table + RLS updates
- [ ] Build invite/accept/revoke flow
- [ ] Build coach client switcher
- [ ] Add activity logging
- [ ] Test cross-timezone scenarios (USA ↔ India)

### Phase 5: Polish + Launch (Week 6)
- [ ] End-to-end testing all platforms
- [ ] App Store submission
- [ ] Launch
