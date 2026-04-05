# Theryn — Claude Code Build Prompt

> Paste this prompt into Claude Code. Attach all 5 documents listed below alongside it.

---

## Attached documents

1. `2026-04-03_gym-app.jsx` — The existing React app (single JSX file, all UI complete)
2. `2026-04-03_theryn-design-memo.md` — Design system: colors, typography, components, UX rules
3. `theryn-backend-architecture.md` — Backend architecture: stack, schema, auth, AI feature
4. `theryn-architecture-addendum.md` — Exercise library, coach access, permission model
5. `theryn-last-set-memory.md` — Ghost values, logging speed UX, delta indicators

---

## Prompt

You are building **Theryn**, a personal gym & body tracking app (iOS + Android + Web). I'm providing 5 documents that define every aspect of this project. Read ALL of them before writing any code.

### What exists today

The app UI is **already built** as a single React JSX file (`2026-04-03_gym-app.jsx`). It runs in Vite, uses React hooks (`useState` only), Recharts for charts, and inline JS style objects. All data is currently hardcoded in state — no backend.

### What we're building

We're adding a real backend and converting this to a cross-platform app. Here's the full scope:

**Stack:**
- **Frontend**: Existing React JSX (keep as-is, extend it)
- **Backend**: Supabase (PostgreSQL + Auth + PostgREST API + Edge Functions + Realtime)
- **Auth**: Supabase Auth with Google OAuth only (no email/password)
- **Mobile**: Capacitor (wraps the React web app as native iOS + Android)
- **Web hosting**: Vercel
- **AI feature**: Supabase Edge Functions calling Claude API
- **CI/CD**: GitHub Actions

**Features to implement:**
1. Google sign-in (no passwords)
2. All workout data persisted to Supabase PostgreSQL
3. Exercise search with autocomplete (public library ~300 exercises + user custom)
4. Last set memory (ghost values from previous session shown as placeholders)
5. 1-tap set logging (tap check with empty inputs = auto-fill from last session)
6. Delta indicators using ↑/↓ arrows (e.g. `↑10` not `+10`)
7. PR auto-detection with haptic feedback
8. AI workout import (paste from ChatGPT/Claude/Gemini → parse → diff view → apply/revert)
9. Coach access (invite by email, 3 permission tiers: view / edit_routine / full)
10. Offline-first (write locally first, sync to Supabase in background)
11. iOS + Android via Capacitor
12. PWA support for web

### Critical rules

**Design rules (from the design memo — do NOT violate these):**
- Never change the 9 color tokens (A, BG, S1, S2, BD, TX, SB, MT, RED)
- Never introduce new fonts — system font stack only
- All cards follow the `card` style object
- All primary actions use `btnPrim`, secondary use `btnGhost`
- Inline editing only — never add modals for editing values
- Mobile-first, 390px max-width — never exceed this
- Positive changes (weight down, muscle up) → lime `A`. Negative → `RED`
- Tab bar stays fixed with 5 tabs — do not add/remove tabs
- App name is **Theryn** everywhere

**Architecture rules (from the architecture docs):**
- No separate backend server — Supabase PostgREST auto-generates the API
- Row Level Security (RLS) on every table — auth enforcement lives in the database
- Coach vs athlete is NOT a user type — it's a relationship in `coaching_relationships`
- The `is_coach_of()` Postgres function gates all coach access via RLS
- Ghost values fetched in a single `get_last_set_values()` RPC call on workout start
- Exercise search uses `search_exercises()` Postgres function (custom exercises ranked first)
- AI parsing happens in a Supabase Edge Function calling Claude API — never client-side
- Delta indicators use ↑/↓ arrows, never +/- signs
- Sets save to local state instantly, then sync to Supabase in background

### Build order

Follow this exact sequence. Each phase should be a working increment.

**Phase 1 — Foundation (Supabase + Auth)**
1. Initialize the project structure:
   ```
   theryn/
   ├── src/
   │   ├── App.jsx              (existing file — copy as-is)
   │   ├── lib/supabase.ts      (Supabase client init)
   │   ├── hooks/               (data hooks)
   │   └── components/          (new components)
   ├── supabase/
   │   ├── migrations/          (SQL files)
   │   └── functions/           (Edge Functions)
   ├── capacitor.config.ts
   ├── vite.config.ts
   └── package.json
   ```

2. Create the **complete SQL migration** (`supabase/migrations/001_initial_schema.sql`) containing ALL tables, indexes, views, functions, RLS policies, and seed data from the architecture docs. This includes:
   - All 14 tables (profiles, public_exercises, user_exercises, routines, routine_days, routine_exercises, workout_sessions, workout_sets, body_weights, body_measurements, personal_records, coaching_relationships, coach_activity_log, ai_imports)
   - Indexes: `idx_workout_sets_exercise_session`, `idx_workout_sessions_user_date`
   - Functions: `search_exercises()`, `get_last_set_values()`, `is_coach_of()`
   - Views: `weekly_volume`, `best_lifts`
   - RLS policies for every table (including coach access via `is_coach_of()`)
   - Seed data: ~300 public exercises across all muscle groups
   - Auto-create profile trigger on new user sign-up

3. Create `src/lib/supabase.ts`:
   - Initialize Supabase client with env vars
   - Export typed client using generated types

4. Create `src/hooks/useAuth.ts`:
   - `signInWithGoogle()` — Supabase OAuth
   - `signOut()`
   - `onAuthStateChange` listener
   - Auto-create profile on first sign-in
   - Export current user + loading state

5. Create `src/components/LoginScreen.jsx`:
   - Follows Theryn design memo exactly (dark bg, lime accent)
   - "Sign in with Google" button using `btnPrim` style
   - Theryn logo/name at top
   - No email/password fields

**Phase 2 — Data hooks (wire UI to Supabase)**
Create these hooks, each replacing hardcoded `useState` data with real Supabase calls:

6. `useRoutine.ts` — CRUD for routine template (routines, routine_days, routine_exercises)
7. `useWorkouts.ts` — CRUD for workout sessions + sets, including:
   - `startWorkout()` — creates session, fetches ghost values
   - `completeSet()` — writes locally first, syncs in background
   - `finishWorkout()` — batch upsert + update PRs
8. `useBody.ts` — CRUD for body_weights + body_measurements
9. `useExerciseSearch.ts` — calls `search_exercises()` RPC, debounced autocomplete
10. `useGhostValues.ts` — calls `get_last_set_values()` once on workout start, returns lookup map
11. `usePRs.ts` — reads personal_records, includes `checkIfPR()` logic
12. `useProgress.ts` — reads weekly_volume view + best_lifts view

**Phase 3 — Last set memory + logging UX**
This is the most critical UX feature. Implement in the Log screen:

13. Ghost value display:
    - Show previous session values as placeholder text (color: MT `#2C2C2C`)
    - Small reference row above each set (10px, color SB `#585858`)
    - Show "Last: Mon, Apr 6" date context per exercise

14. Three logging speeds:
    - **1-tap**: Tap check with empty inputs → auto-fill ghost values → mark done
    - **2-3 tap**: Tap input → type value → tap check (ghost fills missing fields)
    - **Undo**: Tap completed check again → un-complete, re-edit

15. Delta indicators:
    - After logging, show `↑10` (lime) or `↓5` (red) next to values
    - Use arrows ↑/↓, never +/- signs
    - Compare current value against ghost value
    - Weight same = no delta shown

16. Auto-behaviors:
    - Complete last set of exercise → auto-collapse, expand next
    - All sets complete → show "Finish Workout" button
    - PR detected → haptic feedback + toast
    - Keyboard: `inputMode="decimal"` for weight, `inputMode="numeric"` for reps

**Phase 4 — Exercise search**

17. Build autocomplete component:
    - Triggers after 2 characters typed
    - Calls `search_exercises()` RPC (debounced 200ms)
    - Results: user custom exercises first (highlighted), then public library
    - Tapping result adds exercise to routine
    - "Add custom" option at bottom if no match

18. Integrate into Routine screen:
    - Replace hardcoded exercise list with search
    - "Add Exercise" button opens inline search (not a modal)
    - Remove exercise with swipe-left or delete button

**Phase 5 — AI import**

19. Create Edge Function `supabase/functions/parse-workout/index.ts`:
    - Accepts raw text, calls Claude API (claude-sonnet-4-20250514)
    - Returns structured JSON: `{ days: [{ day_name, workout_type, exercises: [...] }] }`
    - Handles non-workout text gracefully
    - Logs import to `ai_imports` table

20. Build import UI on Routine tab:
    - "Import from AI" button (paste icon)
    - Full-width textarea for pasting
    - Loading state while parsing
    - Diff view: current routine vs suggested, per-exercise keep/remove toggles
    - "Apply Changes" (btnPrim) + "Cancel" (btnGhost)
    - "Undo Import" available for 24h, restores from snapshot

**Phase 6 — Coach access**

21. Coach invitation flow:
    - Settings screen → "My Coach" section
    - Invite by email + permission picker (view / edit_routine / full)
    - Invite creates row in `coaching_relationships` with `status: 'pending'`
    - Coach signs in with Google → sees pending invite → accepts

22. Coach context switcher:
    - Top bar shows current context (own data vs client data)
    - Two-dot dropdown switcher appears when user has coaching relationships
    - Own data: lime avatar, "YOU" badge
    - Client data: purple avatar, client name
    - Same 5 tabs, same components — RLS scopes the data

23. Permission indicators:
    - "CAN EDIT" badge (purple) on editable sections
    - "VIEW ONLY" badge (gray) + lock icon on restricted sections
    - Purple border ring on coach-edited cards
    - Timestamp on coach edits with timezone

24. Revoke: athlete can revoke anytime → sets status to `'revoked'` → coach loses all access immediately

**Phase 7 — Capacitor + deploy**

25. Add Capacitor:
    ```bash
    npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
    npm install @capacitor/haptics @capacitor/preferences @capacitor/status-bar
    npx cap init "Theryn" "com.theryn.app"
    npx cap add ios && npx cap add android
    ```

26. Configure `capacitor.config.ts`:
    - StatusBar: dark, bg `#080808`
    - allowNavigation: `['*.supabase.co', 'accounts.google.com']`

27. PWA: Add `vite-plugin-pwa` with manifest (name: Theryn, theme_color: `#080808`)

28. CI/CD: `.github/workflows/deploy.yml` — build → deploy to Vercel + cap sync

### Code style requirements

- TypeScript for all new files (hooks, lib, config)
- Existing JSX file stays as JSX — don't convert it
- All Supabase queries go through hooks, never called directly in components
- Use `async/await` everywhere, no `.then()` chains
- Error handling: try/catch with user-facing error states
- No `console.log` in production code — use proper error boundaries
- Keep all styling inline (matching the design memo pattern) — no CSS files
- Comments only where logic is non-obvious

### Environment variables needed

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

For Edge Functions (set in Supabase dashboard):
```
ANTHROPIC_API_KEY=your_key
```

### Start now

Begin with Phase 1. Create the complete project structure, the full SQL migration with all tables + seed data, the Supabase client, auth hook, and login screen. Show me the file tree when done so I can verify before moving to Phase 2.
