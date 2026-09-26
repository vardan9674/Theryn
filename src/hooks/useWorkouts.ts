import { supabase } from "../lib/supabase";
import { enqueueAction, shouldQueueForLater } from "../lib/offlineQueue";
import { registerActionHandler } from "../lib/actionRegistry";

// ── Exercise name → UUID cache (module-level, shared across calls) ──────────
let exerciseCache: Record<string, string> | null = null;

/**
 * Resolves an exercise name to its UUID.
 * Search order: cache → public_exercises (ilike) → user_exercises → create new user_exercise.
 */
export async function getExerciseId(name: string, userId: string): Promise<string> {
  if (!exerciseCache) exerciseCache = {};

  const key = name.toLowerCase().trim();
  if (exerciseCache[key]) return exerciseCache[key];

  // Try public_exercises first (case-insensitive match)
  const { data: pubEx } = await supabase
    .from("public_exercises")
    .select("id")
    .ilike("name", name.trim())
    .maybeSingle();

  if (pubEx?.id) {
    exerciseCache[key] = pubEx.id;
    return pubEx.id;
  }

  // Try user_exercises — RLS surfaces both own rows and rows owned by the
  // user's accepted coaches, so a coach-defined custom exercise resolves to
  // the same id for the athlete (no duplicate row gets created below).
  const { data: userExRows } = await supabase
    .from("user_exercises")
    .select("id, user_id")
    .ilike("name", name.trim())
    .limit(2);

  if (userExRows && userExRows.length > 0) {
    // Prefer the row owned by the current user when both exist.
    const own = userExRows.find(r => r.user_id === userId);
    const chosen = own || userExRows[0];
    exerciseCache[key] = chosen.id;
    return chosen.id;
  }

  // Create new user_exercise (private to current user)
  const { data: newEx, error } = await supabase
    .from("user_exercises")
    .insert({ user_id: userId, name: name.trim() })
    .select("id")
    .single();

  if (error || !newEx?.id) {
    throw new Error(`Failed to create exercise "${name}": ${error?.message}`);
  }

  exerciseCache[key] = newEx.id;
  return newEx.id;
}

/**
 * Creates a new private custom exercise for the user and returns its id +
 * canonical name. Used by the template editor's autocomplete when the user
 * commits a name that doesn't already exist in the public or custom library.
 * Primes the module-level exerciseCache so subsequent getExerciseId calls
 * during workout logging resolve without an extra round-trip.
 */
export async function createUserExercise(
  userId: string,
  name: string,
  opts: { muscleGroup?: string; equipment?: string; category?: string } = {}
): Promise<{ id: string; name: string }> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Exercise name cannot be empty");

  const { data, error } = await supabase
    .from("user_exercises")
    .insert({
      user_id:      userId,
      name:         trimmed,
      muscle_group: opts.muscleGroup ?? null,
      equipment:    opts.equipment   ?? null,
      category:     opts.category    ?? null,
    })
    .select("id, name")
    .single();

  if (error || !data?.id) {
    throw new Error(`Failed to create exercise "${trimmed}": ${error?.message}`);
  }

  if (!exerciseCache) exerciseCache = {};
  exerciseCache[trimmed.toLowerCase()] = data.id;

  return { id: data.id, name: data.name };
}

// ── Types ────────────────────────────────────────────────────────────────────
export interface WorkoutSet {
  w?: string;
  r?: string;
  dist?: string;
  dur?: string;
}

export interface WorkoutExercise {
  name: string;
  sets: WorkoutSet[];
}

export interface WorkoutPayload {
  type: string;
  startedAt: string;      // ISO string
  duration: number;       // seconds
  exercises: WorkoutExercise[];
  totalSets: number;
  totalVolume: number;
}

/**
 * Saves a completed workout session and all its sets to Supabase.
 * Returns the new session id.
 */
export async function saveCompletedWorkout(
  userId: string,
  workout: WorkoutPayload,
  isBackgroundSync = false
): Promise<string> {
  const startedAt = workout.startedAt;
  const completedAt = new Date().toISOString();

  // 1. Optimistic Cache Update (only if this is user action, not background sync)
  const optimisticId = `offline-${Date.now()}`;
  if (!isBackgroundSync) {
    const cacheKey = `theryn_history_${userId}`;
    try {
      const cachedText = localStorage.getItem(cacheKey);
      const cached = cachedText ? JSON.parse(cachedText) : [];
      const optimisticEntry = {
        id: optimisticId,
        date: startedAt.split("T")[0],
        type: workout.type,
        duration: workout.duration,
        startedAt: startedAt,
        exercises: workout.exercises.map(ex => ({ name: ex.name, sets: ex.sets })),
        totalSets: workout.totalSets,
        totalVolume: workout.totalVolume
      };
      cached.unshift(optimisticEntry);
      localStorage.setItem(cacheKey, JSON.stringify(cached.slice(0, 30)));
    } catch {}
  }

  // 2. Attempt Supabase Save
  try {
    const { data: sessionRow, error: sessionErr } = await supabase
      .from("workout_sessions")
      .insert({
        user_id: userId,
        workout_type: workout.type,
        started_at: startedAt,
        completed_at: completedAt,
        notes: JSON.stringify({
          totalSets: workout.totalSets,
          totalVolume: workout.totalVolume,
        }),
      })
      .select("id")
      .single();

    if (sessionErr || !sessionRow?.id) throw sessionErr;

    const sessionId = sessionRow.id;

    const setsToInsert: Array<any> = [];
    for (const ex of workout.exercises) {
      let exerciseId: string;
      try {
        exerciseId = await getExerciseId(ex.name, userId);
      } catch {
        continue;
      }
      ex.sets.forEach((set, idx) => {
        setsToInsert.push({
          session_id: sessionId,
          exercise_id: exerciseId,
          set_number: idx + 1,
          weight: set.w ? parseFloat(set.w) : null,
          reps: set.r ? parseInt(set.r, 10) : null,
          // Cardio (#99): distance in the athlete's unit, minutes stored as seconds.
          ...(set.dist || set.dur ? {
            distance: set.dist ? parseFloat(set.dist) : null,
            duration_seconds: set.dur ? Math.round(parseFloat(set.dur) * 60) : null,
          } : {}),
        });
      });
    }

    if (setsToInsert.length > 0) {
      let { error: setsErr } = await supabase.from("workout_sets").insert(setsToInsert);
      // A database without the cardio columns yet: save everything else (#99).
      if (setsErr && ["42703", "PGRST204"].includes((setsErr as any).code)) {
        const plain = setsToInsert.map(({ distance, duration_seconds, ...rest }) => rest);
        ({ error: setsErr } = await supabase.from("workout_sets").insert(plain));
      }
      if (setsErr) {
        // Don't leave a workout with no sets behind and call it saved (#109):
        // take the session back out and let the error decide what happens.
        await supabase.from("workout_sessions").delete().eq("id", sessionId);
        throw setsErr;
      }
    }

    return sessionId;
  } catch (err: any) {
    if (!isBackgroundSync && shouldQueueForLater(err)) {
      enqueueAction({ type: "SAVE_WORKOUT", userId, payload: workout });
      return "offline_saved";
    }
    // Refused: it wasn't saved, so it doesn't stay in the cached history either.
    if (!isBackgroundSync) {
      try {
        const cacheKey = `theryn_history_${userId}`;
        const cached = JSON.parse(localStorage.getItem(cacheKey) || "[]");
        localStorage.setItem(cacheKey, JSON.stringify(cached.filter((h: any) => h.id !== optimisticId)));
      } catch {}
    }
    throw err;
  }
}

// ── History output type ──────────────────────────────────────────────────────
export interface HistoryExercise {
  name: string;
  sets: Array<{ w: string; r: string }>;
}

export interface WorkoutHistoryEntry {
  id: string;
  date: string;         // YYYY-MM-DD
  type: string;
  duration: number;     // seconds
  startedAt: string;
  exercises: HistoryExercise[];
  totalSets: number;
  totalVolume: number;
  /** 'app' when logged in the app, 'link' when sent through a client link. */
  source?: string;
  /** What the client wrote when they sent it through their link. */
  note?: string;
}

/**
 * Loads the last 30 completed workout sessions with their sets.
 * Builds a reverse id→name map from public_exercises + user_exercises.
 */
export async function loadWorkoutHistory(
  userId: string,
  onFreshData?: (data: WorkoutHistoryEntry[]) => void,
  opts: { fresh?: boolean; strict?: boolean } = {}
): Promise<WorkoutHistoryEntry[]> {
  const cacheKey = `theryn_history_${userId}`;
  
  // `fresh` skips the local cache: the coach must see the latest rows, not
  // the previous snapshot (the cache is for the athlete's own offline use).
  let cachedData = null;
  if (!opts.fresh) try {
    const cachedText = localStorage.getItem(cacheKey);
    if (cachedText) cachedData = JSON.parse(cachedText);
  } catch {}

  const fetchNetwork = async () => {
    // Typed loosely: the column list is built at runtime.
    const query = (sets: string): Promise<{ data: any[] | null; error: any }> => (supabase
      .from("workout_sessions") as any)
      .select(`id, workout_type, started_at, completed_at, notes, source, workout_sets ( ${sets} )`)
      .eq("user_id", userId)
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      // Records, streaks and all-time stats read this; 30 capped them (#110).
      .limit(400);
    let { data: sessions, error }: { data: any[] | null; error: any } = await query("exercise_id, set_number, weight, reps, distance, duration_seconds");
    // A database without the cardio columns yet (#99): read the rest.
    if (error && /distance|duration_seconds/.test(error.message || "")) {
      ({ data: sessions, error } = await query("exercise_id, set_number, weight, reps"));
    }

    // `strict` (the coach dashboard): a failed read is an error, not "no workouts" (#132).
    if (error && opts.strict) throw new Error(`Could not load workouts: ${error.message}`);
    if (error || !sessions) return [];

    const idToName: Record<string, string> = {};
    const [{ data: pubExes }, { data: userExes }] = await Promise.all([
      supabase.from("public_exercises").select("id, name"),
      supabase.from("user_exercises").select("id, name").eq("user_id", userId),
    ]);
    for (const ex of pubExes || []) idToName[ex.id] = ex.name;
    for (const ex of userExes || []) idToName[ex.id] = ex.name;

    const history = sessions.map((s) => {
      const startedAt = new Date(s.started_at).getTime();
      const completedAt = new Date(s.completed_at).getTime();
      const duration = Math.round((completedAt - startedAt) / 1000);

      const exMap: Record<string, Array<{ w: string; r: string; dist?: string; dur?: string }>> = {};
      const exOrder: string[] = [];

      const sortedSets = [...(s.workout_sets || [])].sort((a, b) => a.set_number - b.set_number);

      for (const set of sortedSets) {
        if (!exMap[set.exercise_id]) {
          exMap[set.exercise_id] = [];
          exOrder.push(set.exercise_id);
        }
        exMap[set.exercise_id].push({
          w: set.weight != null ? String(set.weight) : "",
          r: set.reps != null ? String(set.reps) : "",
          ...((set as any).distance != null ? { dist: String((set as any).distance) } : {}),
          ...((set as any).duration_seconds != null ? { dur: String(Math.round(((set as any).duration_seconds / 60) * 100) / 100) } : {}),
        });
      }

      const exercises: HistoryExercise[] = exOrder.map((exId) => ({
        name: idToName[exId] || "Unknown Exercise",
        sets: exMap[exId],
      }));

      let parsedNotes: { totalSets?: number; totalVolume?: number; viaLink?: boolean; note?: string } = {};
      try { parsedNotes = s.notes ? JSON.parse(s.notes) : {}; } catch {}

      const entry: WorkoutHistoryEntry = {
        id: s.id,
        date: s.started_at.split("T")[0],
        type: s.workout_type || "Custom",
        startedAt: s.started_at,
        duration,
        exercises,
        totalSets: parsedNotes.totalSets ?? exercises.reduce((a, ex) => a + ex.sets.length, 0),
        totalVolume: parsedNotes.totalVolume ?? exercises.reduce((a, ex) => a + ex.sets.reduce((ss, s) => ss + (Number(s.w) || 0) * (Number(s.r) || 0), 0), 0),
        source: (s as any).source || (parsedNotes.viaLink ? "link" : "app"),
      };
      if (parsedNotes.note) entry.note = String(parsedNotes.note);
      return entry;
    });

    localStorage.setItem(cacheKey, JSON.stringify(history));
    if (onFreshData) onFreshData(history);
    return history;
  };

  if (cachedData && cachedData.length > 0) {
    if (typeof window !== "undefined" && navigator.onLine) fetchNetwork().catch(()=>{});
    return cachedData;
  }

  return fetchNetwork();
}

// Register the offline-flush handler for workout saves. Called once on import.
registerActionHandler("SAVE_WORKOUT", (userId, payload) =>
  saveCompletedWorkout(userId, payload as any, true)
);
