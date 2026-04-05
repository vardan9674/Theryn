# Theryn — Last Set Memory: Feature Spec
> **Adds to**: theryn-backend-architecture.md · **Date**: April 4, 2026

---

## 1. Core concept

Every set input shows the **last logged value** for that exact exercise + set number as a ghost placeholder. First-time users see empty inputs. Returning users see their previous values greyed out, ready to accept or override.

The goal: **log a full workout in under 60 seconds** if nothing changed. One tap per set.

---

## 2. Database: fetching last set values

### Postgres function (fast, indexed)

```sql
-- Returns the most recent set data for each exercise in a routine day
CREATE OR REPLACE FUNCTION get_last_set_values(
  p_user_id UUID,
  p_exercise_ids UUID[]  -- the exercises in today's routine
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
```

### Index for speed

```sql
-- This makes the "last set" lookup near-instant
CREATE INDEX idx_workout_sets_exercise_session 
  ON workout_sets (exercise_id, set_number, created_at DESC);

CREATE INDEX idx_workout_sessions_user_date
  ON workout_sessions (user_id, started_at DESC);
```

### Frontend: single call on workout start

```typescript
// When user opens today's workout, fetch all ghost values in ONE call
async function loadGhostValues(exerciseIds: string[]) {
  const { data } = await supabase
    .rpc('get_last_set_values', {
      p_user_id: user.id,
      p_exercise_ids: exerciseIds
    })

  // Transform into a lookup map: { [exerciseId]: { [setNumber]: { weight, reps, date } } }
  const ghostMap: Record<string, Record<number, GhostValue>> = {}
  data?.forEach(row => {
    if (!ghostMap[row.exercise_id]) ghostMap[row.exercise_id] = {}
    ghostMap[row.exercise_id][row.set_number] = {
      weight: row.weight,
      reps: row.reps,
      date: row.session_date
    }
  })

  return ghostMap  // cached in state for the entire session
}
```

---

## 3. UX rules for speed

### Ghost value display

- Ghost values appear as **placeholder text** inside inputs (color: `MT` / `#2C2C2C`)
- Above each set row, show the ghost value as a small reference line (color: `SB` / `#585858`, font-size: `10px`)
- Include the date of the last session as context: `"Last: Mon, Apr 6"`
- First-time exercises show empty placeholders — no ghost row

### The "tap to complete" interaction

This is the key speed optimization. Three ways to log a set:

**Path A — Same weight/reps as last time (1 tap)**
1. User sees ghost values in placeholders
2. Taps the checkmark button WITHOUT entering anything
3. App auto-fills with ghost values and marks set as done
4. Checkmark turns lime, values appear in `A` color
5. Auto-scrolls to next set

**Path B — Different weight or reps (2-3 taps)**
1. User taps the weight input → keyboard opens (numeric, `inputmode="decimal"`)
2. Types new weight (e.g. 25)
3. Taps reps input → types new reps (or taps check to keep ghost reps)
4. Taps checkmark → done

**Path C — Quick increment/decrement (2 taps)**
1. User long-presses on a ghost value
2. A ±5 lbs / ±1 rep stepper appears inline
3. Tap +/- to adjust, then checkmark

### Auto-behaviors

| Trigger | Action |
|---|---|
| Tap check with empty inputs | Fill with ghost values, mark done |
| Tap check with partial input (only weight filled) | Use entered weight + ghost reps, mark done |
| Complete last set of exercise | Auto-collapse exercise card, expand next exercise |
| All sets complete | Show "Finish Workout" button with session summary |
| Tap completed set's check again | Un-complete — re-opens inputs for editing |
| Swipe left on completed set | Delete that set's data (with haptic feedback) |

### Delta indicators (after logging)

Once a set is logged, compare against ghost values:

```
Weight up   → lime delta:  "+5"  (color: A / #C8FF00)
Weight down → red delta:   "-5"  (color: RED / #FF5C5C)
Weight same → no delta shown
Reps up     → lime delta:  "+2"
Reps down   → red delta:   "-2"
```

Deltas appear as small inline text next to the logged value: `25 +5`

### Keyboard optimization

- Weight input: `inputmode="decimal"` — shows numeric keyboard with decimal point
- Reps input: `inputmode="numeric"` — shows plain number keyboard
- On iOS: the "Done" button on keyboard should advance to next input (reps → checkmark)
- Auto-focus: when user taps into weight, auto-select all text so they can just type to replace

---

## 4. State machine for a single set

```
┌──────────┐   tap input    ┌──────────┐   tap check    ┌──────────┐
│  GHOST   │ ─────────────→ │ EDITING  │ ─────────────→ │  LOGGED  │
│          │                │          │                │          │
│ shows    │   tap check    │ keyboard │   tap check    │ lime val │
│ placeholder├──────────────→│ open     │   (empty=ghost)│ + delta  │
└──────────┘  (auto-fill    └──────────┘                └────┬─────┘
               ghost values)                                  │
                                                    tap check │
                                                    again     ↓
                                                         ┌──────────┐
                                                         │  GHOST   │
                                                         │ (undone) │
                                                         └──────────┘
```

First visit (no ghost data):

```
┌──────────┐   tap input    ┌──────────┐   tap check    ┌──────────┐
│  EMPTY   │ ─────────────→ │ EDITING  │ ─────────────→ │  LOGGED  │
│          │                │          │                │          │
│ blank    │                │ must     │                │ lime val │
│ inputs   │                │ type val │                │ (no delta│
└──────────┘                └──────────┘                └──────────┘
```

---

## 5. Saving strategy (offline-first, fast)

```typescript
// On each set completion — write locally FIRST, sync in background
async function completeSet(
  sessionId: string,
  exerciseId: string,
  setNumber: number,
  weight: number | null,  // null = use ghost
  reps: number | null,    // null = use ghost
  ghostWeight: number | null,
  ghostReps: number | null
) {
  const finalWeight = weight ?? ghostWeight
  const finalReps = reps ?? ghostReps

  if (finalWeight === null || finalReps === null) {
    // First-time user with no ghost data — must enter values
    return { error: 'Please enter weight and reps' }
  }

  // Check if this is a PR
  const isPR = await checkIfPR(exerciseId, finalWeight, finalReps)

  const setData = {
    id: crypto.randomUUID(),
    session_id: sessionId,
    exercise_id: exerciseId,
    set_number: setNumber,
    weight: finalWeight,
    reps: finalReps,
    is_pr: isPR,
    created_at: new Date().toISOString()
  }

  // 1. Write to local state (instant UI update)
  updateLocalState(setData)

  // 2. If PR, trigger haptic celebration
  if (isPR) {
    await Haptics.impact({ style: ImpactStyle.Heavy })
    showPRToast(exerciseId, finalWeight, finalReps)
  } else {
    // Light haptic for normal set completion
    await Haptics.impact({ style: ImpactStyle.Light })
  }

  // 3. Sync to Supabase in background
  supabase.from('workout_sets').upsert(setData).then(({ error }) => {
    if (error) addToSyncQueue('workout_sets', setData)
  })

  return { success: true, isPR }
}
```

### Batch save on workout finish

As a safety net, when the user taps "Finish Workout", do a final batch upsert of all sets:

```typescript
async function finishWorkout(sessionId: string, allSets: SetData[]) {
  // Update session as completed
  await supabase
    .from('workout_sessions')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', sessionId)

  // Batch upsert all sets (catches any that failed to sync earlier)
  await supabase
    .from('workout_sets')
    .upsert(allSets, { onConflict: 'id' })

  // Update PRs
  await updatePersonalRecords(allSets)
}
```

---

## 6. Component structure (React)

```typescript
// The set row component
function SetRow({ setNumber, exerciseId, ghost, onComplete }) {
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [status, setStatus] = useState('ghost') // 'ghost' | 'editing' | 'logged'
  const weightRef = useRef(null)
  const repsRef = useRef(null)

  const handleCheck = () => {
    if (status === 'logged') {
      // Un-complete: go back to ghost/editing
      setStatus(ghost ? 'ghost' : 'editing')
      return
    }

    // Use entered values, fall back to ghost
    const finalWeight = weight || ghost?.weight
    const finalReps = reps || ghost?.reps

    if (!finalWeight || !finalReps) {
      // Shake the empty input
      weightRef.current?.focus()
      return
    }

    setWeight(String(finalWeight))
    setReps(String(finalReps))
    setStatus('logged')
    onComplete(setNumber, Number(finalWeight), Number(finalReps))
  }

  return (
    <>
      {/* Ghost reference line (above inputs) */}
      {ghost && status !== 'logged' && (
        <div style={styles.ghostRow}>
          <span></span>
          <span>{ghost.weight}</span>
          <span>{ghost.reps}</span>
          <span></span>
        </div>
      )}

      <div style={styles.setRow}>
        <span style={styles.setNum}>{setNumber}</span>

        {status === 'logged' ? (
          <>
            <LoggedValue value={weight} ghost={ghost?.weight} unit="lbs" />
            <LoggedValue value={reps} ghost={ghost?.reps} unit="reps" />
          </>
        ) : (
          <>
            <input
              ref={weightRef}
              style={styles.setInput}
              type="number"
              inputMode="decimal"
              placeholder={ghost?.weight?.toString() || 'lbs'}
              value={weight}
              onChange={e => { setWeight(e.target.value); setStatus('editing') }}
              onFocus={() => weightRef.current?.select()}
            />
            <input
              ref={repsRef}
              style={styles.setInput}
              type="number"
              inputMode="numeric"
              placeholder={ghost?.reps?.toString() || 'reps'}
              value={reps}
              onChange={e => { setReps(e.target.value); setStatus('editing') }}
              onFocus={() => repsRef.current?.select()}
            />
          </>
        )}

        <CheckButton done={status === 'logged'} onTap={handleCheck} />
      </div>
    </>
  )
}

// Delta display component
function LoggedValue({ value, ghost, unit }) {
  const delta = ghost ? Number(value) - Number(ghost) : null
  return (
    <div style={{ textAlign: 'center', fontSize: 16, fontWeight: 600, color: A }}>
      {value}
      {delta !== null && delta !== 0 && (
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          marginLeft: 4,
          color: delta > 0 ? A : RED
        }}>
          {delta > 0 ? '+' : ''}{delta}
        </span>
      )}
    </div>
  )
}
```

---

## 7. Edge cases

| Scenario | Behavior |
|---|---|
| First time ever | All inputs empty, no ghost row, must type values |
| Exercise added mid-week | No ghost for that exercise, others still show ghosts |
| User did 3 sets last time, template now has 4 | Sets 1-3 show ghosts, set 4 is empty |
| User did 4 sets last time, template now has 3 | Only show ghosts for sets 1-3 |
| User skipped a set last time (set 2 = null) | Set 2 shows empty, sets 1 and 3 show ghosts |
| Same exercise on multiple days | Ghost always from the MOST RECENT session, regardless of which day |
| Coach edits routine between sessions | Ghost values still come from user's last log, not template targets |
| User deletes a logged set | Set reverts to ghost state (or empty if no prior data) |
| Weight entered but not reps, tap check | Uses entered weight + ghost reps |
| No weight, reps entered, tap check | Uses ghost weight + entered reps |
| Offline | Ghost values loaded from local cache, sets save to queue |
