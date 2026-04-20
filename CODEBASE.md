# Theryn — Codebase Reference

> **Purpose of this file**: Give any AI assistant or new developer a complete mental model of this project in a single read. Start here. No other file needs to be read first.

---

## 1. What Theryn Is

A cross-platform gym/coaching app built with **React + Vite** on the web and compiled to **iOS/Android via Capacitor**. It has two distinct user roles:

- **Athlete** — logs workouts, tracks body metrics, follows a weekly routine
- **Coach** — manages multiple athletes, edits their routines, leaves per-exercise notes, views body data and progress

The web version (`platform === "web"`) renders a **desktop CRM layout** (sidebar nav, card grid). The native versions render a **mobile bottom-tab layout**.

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| UI Framework | React 18 (no TypeScript in App.jsx — plain JSX) |
| Build | Vite 5 |
| Styling | Vanilla CSS-in-JS inline styles + `src/index.css` for layout classes |
| Backend | Supabase (Postgres + RLS + Realtime) |
| Native Bridge | Capacitor 8 (`@capacitor/core`, `@capacitor/android`, `@capacitor/ios`) |
| Animations | Framer Motion (`motion`, `useAnimation`, `useMotionValue`) |
| Drag & Drop | `@dnd-kit/core` + `@dnd-kit/sortable` |
| Charts | Recharts (`BarChart`, `Bar`, `XAxis`, `Cell`) |
| Auth | Supabase Google OAuth (web: redirect; native: deep-link PKCE) |

---

## 3. File Structure

```
theryn/
├── src/
│   ├── App.jsx              ← ENTIRE app in one file (~5500 lines). All components live here.
│   ├── index.css            ← Global styles, CSS tokens, desktop CRM layout classes
│   ├── lib/
│   │   ├── supabase.ts      ← Supabase client init (reads from .env)
│   │   └── offlineQueue.ts  ← Offline action queue (IndexedDB-based)
│   └── hooks/
│       ├── useWorkouts.ts   ← saveCompletedWorkout, loadWorkoutHistory
│       ├── useBody.ts       ← loadBodyWeights, saveBodyWeight, loadMeasurements, saveMeasurement
│       ├── useRoutine.ts    ← loadRoutine, saveRoutine
│       ├── useCoach.ts      ← findProfileByCode, sendCoachRequest, loadCoachLinks,
│       │                      acceptCoachRequest, removeCoachLink, loadAthleteData, ensureInviteCode
│       └── useNotifications.ts ← requestNotificationPermissions, scheduleDailyRoutine, etc.
├── public/
│   ├── exercises.json       ← Exercise database (800+ entries, loaded by ExercisePicker)
│   └── theryn-logo.svg
├── android/                 ← Capacitor Android project
│   ├── app/src/main/AndroidManifest.xml  ← IMPORTANT: must have com.theryn.app:// intent-filter
│   ├── app/build.gradle
│   ├── build.gradle         ← AGP version (currently 8.9.1)
│   ├── variables.gradle     ← compileSdk=36, targetSdk=36, minSdk=24
│   └── gradle/wrapper/gradle-wrapper.properties  ← Gradle 8.11.1
├── ios/                     ← Capacitor iOS project
├── capacitor.config.ts      ← appId: com.theryn.app, webDir: dist
├── package.json             ← version: 1.4.0
└── supabase/
    └── migrations/001_initial_schema.sql
```

> ⚠️ **Key fact**: `App.jsx` is a monolith (~5500 lines). All React components are defined in this single file. When editing, always `grep` for line numbers before making changes.

---

## 4. Design Tokens (defined at top of App.jsx)

```js
const A   = "#C8FF00";   // Accent (lime green) — primary brand color
const BG  = "#080808";   // Page background
const S1  = "#101010";   // Surface 1 (cards)
const S2  = "#181818";   // Surface 2 (nested cards)
const BD  = "#1E1E1E";   // Border color
const TX  = "#F0F0F0";   // Primary text
const SB  = "#585858";   // Subdued / secondary text
const MT  = "#2C2C2C";   // Muted (disabled states)
const RED = "#FF5C5C";   // Destructive / error
```

---

## 5. Supabase Schema (key tables)

```sql
profiles          id (uuid PK = auth.uid), display_name, avatar_url, invite_code
routines          id, user_id (FK), routine (JSONB), updated_at
workout_history   id, user_id (FK), date, type, duration, exercises (JSONB), totalSets, totalVolume
body_weights      id, user_id (FK), date, weight
measurements      id, user_id (FK), date, + dynamic columns (chest, waist, hips, etc.)
coach_links       id, coach_id (FK), athlete_id (FK), status (pending/accepted), athlete_name, athlete_code
```

### Routine JSONB shape (stored in `routines.routine`)
```json
{
  "Mon": {
    "type": "Push",
    "exercises": [
      { "name": "Bench Press", "sets": 3, "reps": "8-10", "weight": 135, "coachNote": "Breathe out when you lift" },
      "Squat"
    ]
  },
  "Tue": { "type": "Rest", "exercises": [] }
}
```
> Exercises can be **strings** (legacy) or **objects** (new format with coachNote). All code that reads exercises handles both formats via `typeof ex === "object" ? ex.name : ex`.

---

## 6. Component Tree

```
GymApp  (root — decides which app to show)
├── AuthLoadingScreen
├── LoginScreen          (Google OAuth sign-in)
├── RolePickerScreen     (first-time: choose Athlete or Coach)
├── TourOverlay          (athlete onboarding slides)
├── NameSetupModal
│
├── AthleteApp           (role === "athlete")
│   ├── ParticleCanvas   (web only, ambient background)
│   ├── Bottom Tab Bar
│   ├── LogScreen        ← active workout session, exercise logging
│   ├── RoutineScreen    ← view weekly plan (read-only on native)
│   ├── BodyScreen       ← weight + measurement tracking
│   ├── ProgressScreen   ← streak, charts, PR records
│   └── CoachModal       ← connect to coach (enter invite code)
│
└── CoachApp             (role === "coach")
    ├── ParticleCanvas   (web only)
    ├── CoachTourOverlay (first-time coach onboarding)
    ├── Sidebar (web) / Bottom Tab Bar (native)
    ├── CoachAthletesTab     ← athlete list, invite code, profile sheet
    ├── CoachRoutinesTab     ← view + edit athlete routines, leave coach notes
    ├── CoachBodyTab         ← view athlete weight + measurements
    ├── CoachProgressTab     ← view athlete workout stats + weekly chart
    └── CoachModal (connections tab)
```

---

## 7. Platform Detection Pattern

```js
// Used everywhere to gate web-only vs native-only behaviour
Capacitor.getPlatform() === "web"   // true on browser
Capacitor.isNativePlatform()        // true on iOS/Android

// CSS layout classes in index.css switch based on viewport width
// @media (min-width: 768px) → desktop CRM layout
```

---

## 8. Auth Flow

### Web
1. User clicks "Sign in with Google"
2. `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } })`
3. Google redirects back → Supabase session established → `onAuthStateChange` fires

### Native (Android/iOS)
1. `signInWithOAuth` with `skipBrowserRedirect: true` → get OAuth URL
2. Open URL in `@capacitor/browser` external browser
3. Google redirects to `com.theryn.app://login-callback?code=...`
4. `CapApp.addListener("appUrlOpen")` catches the deep link
5. `supabase.auth.exchangeCodeForSession(code)` completes PKCE flow
6. **AndroidManifest.xml MUST have the `com.theryn.app://` intent-filter** (added in v1.4.0)

---

## 9. Coach Notes Flow

1. Coach opens Routines tab → selects athlete → selects exercise → types note
2. `saveNote(day, exIndex, noteText)` mutates the routine JSON: `exercises[i] = { ...ex, coachNote: "..." }`
3. Calls `saveRoutine(athlete_id, updatedRoutine)` → upserts to Supabase `routines` table
4. Athlete's app receives update via Supabase Realtime subscription
5. `LogScreen` renders a highlighted coach note banner below each exercise during active sessions

---

## 10. Key State in GymApp (root)

```js
authUser          // Supabase user object (null = not logged in)
authLoading       // true during initial session check
profile           // { initials, color, units, setup, display_name }
role              // "athlete" | "coach" | null (stored in localStorage as theryn_role_{userId})
showTour          // shows onboarding overlay once after first login
coachLinks        // array of coach_link rows loaded once at root
coachLinksLoaded  // boolean
selectedAthlete   // the coach_link row for the currently viewed athlete (coach only)
athleteCache      // { [athleteId]: { routine, weights, measurements, history } }
```

---

## 11. Data Loading Pattern

```js
// Hooks return plain async functions (not React Query / SWR)
// Components call them in useEffect on mount or when selectedAthlete changes

const loadAthleteData = async (athleteId) => { /* queries multiple tables */ }

// Coach caches athlete data in athleteCache to avoid refetching on tab switch
setAthleteCache(prev => ({
  ...prev,
  [athleteId]: { routine, weights, measurements, history }
}))
```

---

## 12. CSS Architecture

`src/index.css` provides two layout modes:

| Class | Mobile | Desktop (≥768px) |
|-------|--------|-----------------|
| `.app-shell` | `flex-column` | `flex-row` (sidebar + content) |
| `.nav-bar-container` | bottom tab bar (fixed, 60px tall) | left sidebar (220px wide) |
| `.content-scroll` | full width, scroll | `max-width: 1200px`, `padding: 40px 48px` |
| `.crm-grid` | single column | `auto-fill` grid, 340px min columns |
| `.web-btn-primary` | `width: 100%` | `width: auto`, `max-width: 340px` |

---

## 13. Android Build Version Matrix

Must stay in sync or builds fail:

| File | Key Value |
|------|-----------|
| `variables.gradle` | `compileSdkVersion = 36`, `targetSdkVersion = 36` |
| `build.gradle` | `classpath 'com.android.tools.build:gradle:8.9.1'` |
| `gradle-wrapper.properties` | `gradle-8.11.1-all.zip` |
| `package.json` | `@capacitor/android: ^8.3.0` |

> Reason: `androidx.core:1.17.0` and `androidx.activity:1.11.0` require AGP ≥ 8.9.1 and SDK ≥ 36.

---

## 14. Common Gotchas

1. **App.jsx is 5500+ lines.** Always `grep` for exact line numbers before editing. Line numbers shift on every change.
2. **Exercise format duality.** Exercises in the routine JSON can be bare strings (legacy) OR `{ name, sets, reps, weight, coachNote }` objects. Always check `typeof ex === "object"`.
3. **Realtime triggers re-renders.** If you update Supabase and also have a realtime listener, it will fire and refresh state. Capture IDs in `const` before async operations to avoid stale closures.
4. **`autoFocus` unreliable in nested modals.** Use `ref.current.focus()` with a `setTimeout(..., 60)` delay instead.
5. **Platform check for layout.** Many components have `Capacitor.getPlatform() === "web"` branches for desktop-specific layouts. Don't remove them — mobile UX differs significantly.
6. **Android deep link.** `com.theryn.app://` scheme intent-filter in `AndroidManifest.xml` is required for OAuth to work on Android. Do not remove it.
7. **`saveRoutine` is the only place to persist routine changes.** It upserts to the `routines` table keyed on `user_id`. Coach uses athlete's `athlete_id` as `user_id`.

---

## 15. Git Conventions

- Branch: `version-X.Y` (current: `version-1.3`)
- Tags: `vX.Y.Z` (current: `v1.4.0`)
- Remote: `https://github.com/vardan9674/Theryn.git`
- Commit format: `vX.Y.Z — Short headline\n\n- bullet list of changes`
