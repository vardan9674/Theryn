# Theryn — Backend Architecture Spec
> **Version**: 1.0 · **Date**: April 4, 2026 · **Audience**: Solo developer (Vardan)

---

## 1. Stack summary

| Layer | Choice | Why |
|---|---|---|
| **Frontend** | React (existing JSX) + Vite | Already built, no rewrite needed |
| **Mobile native** | Capacitor (by Ionic) | Wraps your React web app as iOS/Android with native APIs — zero rewrite |
| **Web deploy** | Vercel (free tier) | Git push → deploy. Zero config for Vite apps |
| **Backend** | Supabase (free → Pro at $25/mo) | Managed Postgres, Auth, REST API, Edge Functions, Realtime — all in one |
| **Auth** | Supabase Auth + Google OAuth | 3 lines of code. No passwords, no user table management |
| **Database** | PostgreSQL (via Supabase) | Relational, perfect for structured workout data. RLS = zero backend auth code |
| **API** | PostgREST (auto-generated) | Every table gets a REST API instantly. No Express/Fastify needed |
| **AI parsing** | Supabase Edge Functions (Deno) → Claude API | Serverless, cold-starts in ~50ms, pay-per-invocation |
| **CI/CD** | GitHub Actions | Auto-build Capacitor + deploy web on push to `main` |

**Total monthly cost at launch**: **$0** (Supabase free tier + Vercel free tier)
**Cost at ~500 active users**: **~$30/mo** (Supabase Pro $25 + Claude API ~$5)

---

## 2. Why this stack (solo-dev rationale)

### Why Supabase over Firebase
- **PostgreSQL** — structured workout data (sets, reps, weights, dates) fits relational tables perfectly. Firestore's document model would force awkward denormalization.
- **Row Level Security (RLS)** — auth enforcement lives in the database, not in middleware code you have to write and maintain. Each user can only see their own data. Zero backend code for authorization.
- **PostgREST** — every table automatically gets a full REST API. You don't write controllers, routes, or serializers.
- **Edge Functions** — Deno-based serverless functions for the AI parsing feature. No Express server to maintain.
- **Portable** — if you ever outgrow Supabase, your data is just Postgres. Migrate anywhere.

### Why Capacitor over React Native / Expo
- **Your app already exists as React/HTML/CSS.** Capacitor wraps it as-is into a native WebView with access to native APIs (camera, haptics, push notifications). No rewrite.
- **One codebase** — web, iOS, and Android all run the same React code.
- **Native when needed** — Capacitor plugins give you native storage, biometrics, push notifications, etc.
- **App Store ready** — produces real Xcode/Android Studio projects you submit to stores.

### Why NOT a custom backend (Express, NestJS, etc.)
- You'd need to: write auth middleware, write CRUD endpoints, manage a database, handle migrations, deploy a server, monitor uptime, patch security. That's a full-time job.
- Supabase gives you all of that out of the box. You write **zero** backend code for standard CRUD operations.

---

## 3. Database schema

All tables live in Supabase PostgreSQL. Every table has RLS policies ensuring `auth.uid() = user_id`.

```sql
-- Profiles (auto-created on first Google sign-in)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  unit_system TEXT DEFAULT 'imperial' CHECK (unit_system IN ('imperial', 'metric')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Exercise library (user-customizable)
CREATE TABLE exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  muscle_group TEXT,              -- 'chest', 'back', 'legs', etc.
  equipment TEXT,                 -- 'barbell', 'dumbbell', 'cable', 'bodyweight'
  is_custom BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Weekly routine template
CREATE TABLE routines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL DEFAULT 'My Routine',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Days within a routine (Mon=Push, Tue=Pull, etc.)
CREATE TABLE routine_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id UUID REFERENCES routines(id) ON DELETE CASCADE NOT NULL,
  day_index INT NOT NULL CHECK (day_index BETWEEN 0 AND 6),  -- 0=Mon, 6=Sun
  workout_type TEXT NOT NULL,     -- 'Push', 'Pull', 'Legs', 'Upper', 'Lower', 'Full Body', 'Cardio', 'Rest'
  label TEXT,                     -- optional custom label
  UNIQUE (routine_id, day_index)
);

-- Exercises assigned to a routine day (template)
CREATE TABLE routine_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_day_id UUID REFERENCES routine_days(id) ON DELETE CASCADE NOT NULL,
  exercise_id UUID REFERENCES exercises(id) ON DELETE CASCADE NOT NULL,
  sort_order INT DEFAULT 0,
  target_sets INT DEFAULT 3,
  target_reps TEXT DEFAULT '8-12',  -- text to allow ranges like '8-12'
  notes TEXT
);

-- Logged workout sessions
CREATE TABLE workout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  routine_day_id UUID REFERENCES routine_days(id),  -- nullable for ad-hoc workouts
  workout_type TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Individual sets logged during a session
CREATE TABLE workout_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES workout_sessions(id) ON DELETE CASCADE NOT NULL,
  exercise_id UUID REFERENCES exercises(id) ON DELETE CASCADE NOT NULL,
  set_number INT NOT NULL,
  weight NUMERIC(7,2),            -- lbs or kg depending on user pref
  reps INT,
  is_pr BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Body weight log
CREATE TABLE body_weights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  weight NUMERIC(6,2) NOT NULL,
  logged_at DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  UNIQUE (user_id, logged_at)
);

-- Body measurements log
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

-- Personal records (auto-computed via DB trigger or app logic)
CREATE TABLE personal_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  exercise_id UUID REFERENCES exercises(id) ON DELETE CASCADE NOT NULL,
  weight NUMERIC(7,2) NOT NULL,
  reps INT NOT NULL DEFAULT 1,
  achieved_at DATE NOT NULL,
  session_id UUID REFERENCES workout_sessions(id),
  UNIQUE (user_id, exercise_id)  -- one PR per exercise, updated when beaten
);

-- AI import history (for the paste feature)
CREATE TABLE ai_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  raw_input TEXT NOT NULL,          -- what the user pasted
  parsed_output JSONB NOT NULL,     -- structured JSON from Claude
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'reverted')),
  applied_to_routine_id UUID REFERENCES routines(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Row Level Security (every table)

```sql
-- Example: workout_sessions
ALTER TABLE workout_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access own sessions"
  ON workout_sessions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Repeat for all tables with user_id column
-- For routine_days and routine_exercises, use a join-based policy through routines.user_id
```

### Useful database views

```sql
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
JOIN exercises e ON wset.exercise_id = e.id
GROUP BY ws.user_id, date_trunc('week', ws.started_at), e.muscle_group;

-- Best lifts per exercise (for progress screen)
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
JOIN exercises e ON wset.exercise_id = e.id
ORDER BY ws.user_id, wset.exercise_id, wset.weight DESC, wset.reps DESC;
```

---

## 4. Authentication flow

```
User taps "Sign in with Google"
  → Supabase Auth SDK opens Google OAuth popup/redirect
  → Google returns ID token
  → Supabase validates token, creates/matches user in auth.users
  → Supabase returns JWT session token
  → Client stores session (Supabase SDK handles refresh automatically)
  → All subsequent API calls include JWT in Authorization header
  → PostgREST + RLS enforce per-user data isolation
```

### Frontend code (entire auth implementation)

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://YOUR_PROJECT.supabase.co',
  'YOUR_ANON_KEY'
)

// Sign in — that's it
async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  })
}

// Sign out
async function signOut() {
  await supabase.auth.signOut()
}

// Listen for auth changes
supabase.auth.onAuthStateChange((event, session) => {
  if (session) {
    // User is signed in — load their data
  } else {
    // User is signed out — show login screen
  }
})
```

That's the entire auth system. No password hashing, no session management, no refresh token logic.

---

## 5. AI prompt parsing feature

### User flow

```
1. User navigates to Routine tab
2. Taps "Import from AI" button (paste icon)
3. Pastes text from ChatGPT/Claude/Gemini (e.g. a workout plan)
4. App sends text to Supabase Edge Function
5. Edge Function calls Claude API with structured output prompt
6. Returns parsed exercises as JSON
7. App shows a DIFF VIEW:
   - Left: current routine (grayed out)
   - Right: suggested changes (highlighted in lime)
   - Each exercise has: ✓ Keep / ✕ Remove toggles
8. User reviews, toggles individual exercises
9. Taps "Apply Changes" → routine updates
10. "Undo Import" button available for 24h to fully revert
```

### Edge Function: `parse-workout`

```typescript
// supabase/functions/parse-workout/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const { raw_text, routine_id } = await req.json()

  // Call Claude API
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY'),
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: `You are a workout plan parser. Extract exercises from the user's 
pasted text and return ONLY valid JSON. Format:
{
  "days": [
    {
      "day_name": "Monday",
      "workout_type": "Push",  // Push|Pull|Legs|Upper|Lower|Full Body|Cardio|Rest
      "exercises": [
        {
          "name": "Bench Press",
          "sets": 4,
          "reps": "8-10",
          "muscle_group": "chest",
          "equipment": "barbell",
          "notes": ""
        }
      ]
    }
  ]
}
If the text is not a workout plan, return: { "error": "not_a_workout" }`,
      messages: [{ role: 'user', content: raw_text }]
    })
  })

  const data = await response.json()
  const parsed = JSON.parse(data.content[0].text)

  // Log the import
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const authHeader = req.headers.get('Authorization')!
  const { data: { user } } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  )

  await supabase.from('ai_imports').insert({
    user_id: user!.id,
    raw_input: raw_text,
    parsed_output: parsed,
    applied_to_routine_id: routine_id
  })

  return new Response(JSON.stringify(parsed), {
    headers: { 'Content-Type': 'application/json' }
  })
})
```

### Revert flow

The `ai_imports` table stores both the raw input and parsed output with a status field. When the user taps "Undo Import":

1. Fetch the import record where `status = 'accepted'`
2. The app already stored a snapshot of the routine before applying (stored as `previous_state` JSONB on the import record)
3. Restore the routine from the snapshot
4. Set import status to `'reverted'`

---

## 6. Capacitor setup (iOS + Android)

### Initial setup

```bash
# From your existing Vite + React project
npm install @capacitor/core @capacitor/cli
npx cap init "Theryn" "com.theryn.app"

# Add platforms
npm install @capacitor/ios @capacitor/android
npx cap add ios
npx cap add android

# Build web → sync to native
npm run build
npx cap sync
```

### Useful Capacitor plugins

```bash
# Haptic feedback on PR achievements
npm install @capacitor/haptics

# Local storage for offline-first caching
npm install @capacitor/preferences

# Push notifications (future)
npm install @capacitor/push-notifications

# Status bar styling (dark theme)
npm install @capacitor/status-bar
```

### capacitor.config.ts

```typescript
const config = {
  appId: 'com.theryn.app',
  appName: 'Theryn',
  webDir: 'dist',
  server: {
    // Allow Supabase OAuth redirects
    allowNavigation: ['*.supabase.co', 'accounts.google.com']
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#080808'  // matches BG token
    }
  }
}
```

---

## 7. Project structure

```
theryn/
├── src/
│   ├── App.jsx                  # Main app (your existing file)
│   ├── lib/
│   │   └── supabase.ts          # Supabase client init
│   ├── hooks/
│   │   ├── useAuth.ts           # Auth state hook
│   │   ├── useWorkouts.ts       # CRUD for sessions/sets
│   │   ├── useRoutine.ts        # CRUD for routine template
│   │   ├── useBody.ts           # Weight + measurements
│   │   └── useAIImport.ts       # AI paste feature
│   └── components/
│       ├── LoginScreen.jsx      # Google sign-in button
│       └── AIImportDiff.jsx     # Diff view for AI suggestions
├── supabase/
│   ├── migrations/
│   │   └── 001_initial_schema.sql
│   └── functions/
│       └── parse-workout/
│           └── index.ts
├── ios/                          # Generated by Capacitor
├── android/                      # Generated by Capacitor
├── capacitor.config.ts
├── vite.config.ts
├── package.json
└── .github/
    └── workflows/
        └── deploy.yml            # CI: build → deploy web + sync native
```

---

## 8. Offline-first strategy

For a gym app, offline support is critical (gyms often have poor signal).

1. **Supabase JS SDK** caches the current session token locally — auth works offline.
2. **Capacitor Preferences** stores the current workout session locally as JSON.
3. On every set logged, write to local state first (instant UI), then sync to Supabase in background.
4. On app open, pull latest from Supabase and merge with any un-synced local data.
5. Conflict resolution: **last-write-wins** (simple, sufficient for single-user app).

```typescript
// hooks/useWorkouts.ts (simplified)
async function logSet(set: SetData) {
  // 1. Update local state immediately
  setLocalSets(prev => [...prev, set])

  // 2. Try to sync to Supabase
  try {
    await supabase.from('workout_sets').insert(set)
  } catch {
    // 3. Queue for later sync
    addToSyncQueue('workout_sets', set)
  }
}
```

---

## 9. Cost breakdown

### Free tier (launch → 500 MAU)

| Service | Free tier limit | Theryn usage |
|---|---|---|
| Supabase | 500MB DB, 1GB storage, 50K MAU | Plenty for early stage |
| Vercel | 100GB bandwidth, serverless functions | More than enough |
| Claude API | Pay-per-use (~$0.003/parse) | ~$5/mo at 1500 parses |
| Apple Developer | $99/year | Required for iOS App Store |
| Google Play | $25 one-time | Required for Play Store |

### Growth tier (500+ MAU)

| Service | Cost | Notes |
|---|---|---|
| Supabase Pro | $25/mo | 8GB DB, 100GB storage, daily backups |
| Vercel | $0 (stays free) | |
| Claude API | ~$5–20/mo | Scales with AI feature usage |
| **Total** | **~$30–45/mo** | |

---

## 10. Implementation roadmap

### Phase 1: Foundation (Week 1–2)
- [ ] Set up Supabase project + run migration SQL
- [ ] Configure Google OAuth in Supabase dashboard
- [ ] Add `supabase-js` to existing React app
- [ ] Build login screen with Google sign-in
- [ ] Wire existing `useState` data to Supabase tables
- [ ] Add RLS policies to all tables

### Phase 2: Mobile (Week 3)
- [ ] Add Capacitor to project
- [ ] Configure iOS + Android builds
- [ ] Test OAuth flow on both platforms
- [ ] Add offline caching with Capacitor Preferences
- [ ] Submit to TestFlight + Google Play Internal Testing

### Phase 3: AI Import (Week 4)
- [ ] Deploy `parse-workout` Edge Function
- [ ] Build paste input UI (follows design memo patterns)
- [ ] Build diff/preview component
- [ ] Add keep/remove toggles per exercise
- [ ] Implement revert functionality
- [ ] Store import history

### Phase 4: Polish + Launch (Week 5)
- [ ] End-to-end testing on iOS, Android, Web
- [ ] Performance optimization (lazy loading, query caching)
- [ ] App Store screenshots + listing
- [ ] Submit to App Store + Play Store
- [ ] Deploy web PWA to Vercel

---

## 11. Key Supabase commands

```bash
# Install CLI
npm install -g supabase

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Run migrations
supabase db push

# Deploy Edge Functions
supabase functions deploy parse-workout

# Generate TypeScript types from your schema
supabase gen types typescript --local > src/lib/database.types.ts
```

---

## 12. Things I added that you didn't mention (but you'll want)

1. **Offline-first caching** — gyms have terrible WiFi. Your app must work without signal.
2. **AI import history + revert** — stored in `ai_imports` table so users can always undo.
3. **Database views** for weekly volume and best lifts — these power the Progress and Records screens without complex client-side queries.
4. **PR auto-detection** — a `is_pr` flag on sets that can be computed via a Postgres trigger when a new weight/rep combo beats the existing record.
5. **Unit system toggle** — imperial/metric stored on the profile, applied client-side.
6. **TypeScript types auto-generated** from your schema — keeps your frontend type-safe with zero manual work.
