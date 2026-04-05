import { supabase } from "../lib/supabase";

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

  // Try user_exercises
  const { data: userEx } = await supabase
    .from("user_exercises")
    .select("id")
    .eq("user_id", userId)
    .ilike("name", name.trim())
    .maybeSingle();

  if (userEx?.id) {
    exerciseCache[key] = userEx.id;
    return userEx.id;
  }

  // Create new user_exercise
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
  workout: WorkoutPayload
): Promise<string> {
  const startedAt = workout.startedAt;
  const completedAt = new Date().toISOString();

  // Insert session row
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

  if (sessionErr || !sessionRow?.id) {
    throw new Error(`Failed to save workout session: ${sessionErr?.message}`);
  }

  const sessionId = sessionRow.id;

  // Build workout_sets rows
  const setsToInsert: Array<{
    session_id: string;
    exercise_id: string;
    set_number: number;
    weight: number | null;
    reps: number | null;
  }> = [];

  for (const ex of workout.exercises) {
    let exerciseId: string;
    try {
      exerciseId = await getExerciseId(ex.name, userId);
    } catch {
      continue; // skip if we can't resolve the exercise
    }

    ex.sets.forEach((set, idx) => {
      setsToInsert.push({
        session_id: sessionId,
        exercise_id: exerciseId,
        set_number: idx + 1,
        weight: set.w ? parseFloat(set.w) : null,
        reps: set.r ? parseInt(set.r, 10) : null,
      });
    });
  }

  if (setsToInsert.length > 0) {
    const { error: setsErr } = await supabase
      .from("workout_sets")
      .insert(setsToInsert);

    if (setsErr) {
      console.error("Failed to insert workout sets:", setsErr.message);
    }
  }

  return sessionId;
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
}

/**
 * Loads the last 30 completed workout sessions with their sets.
 * Builds a reverse id→name map from public_exercises + user_exercises.
 */
export async function loadWorkoutHistory(userId: string): Promise<WorkoutHistoryEntry[]> {
  // Fetch sessions with nested sets
  const { data: sessions, error } = await supabase
    .from("workout_sessions")
    .select(`
      id,
      workout_type,
      started_at,
      completed_at,
      notes,
      workout_sets ( exercise_id, set_number, weight, reps )
    `)
    .eq("user_id", userId)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error("loadWorkoutHistory error:", error.message);
    return [];
  }

  if (!sessions || sessions.length === 0) return [];

  // Build id→name map
  const idToName: Record<string, string> = {};

  const [{ data: pubExes }, { data: userExes }] = await Promise.all([
    supabase.from("public_exercises").select("id, name"),
    supabase.from("user_exercises").select("id, name").eq("user_id", userId),
  ]);

  for (const ex of pubExes || []) idToName[ex.id] = ex.name;
  for (const ex of userExes || []) idToName[ex.id] = ex.name;

  return sessions.map((s) => {
    const startedAt = new Date(s.started_at).getTime();
    const completedAt = new Date(s.completed_at).getTime();
    const duration = Math.round((completedAt - startedAt) / 1000);

    // Group sets by exercise_id preserving order
    const exMap: Record<string, Array<{ w: string; r: string }>> = {};
    const exOrder: string[] = [];

    const sortedSets = [...(s.workout_sets || [])].sort(
      (a, b) => a.set_number - b.set_number
    );

    for (const set of sortedSets) {
      if (!exMap[set.exercise_id]) {
        exMap[set.exercise_id] = [];
        exOrder.push(set.exercise_id);
      }
      exMap[set.exercise_id].push({
        w: set.weight != null ? String(set.weight) : "",
        r: set.reps != null ? String(set.reps) : "",
      });
    }

    const exercises: HistoryExercise[] = exOrder.map((exId) => ({
      name: idToName[exId] || "Unknown Exercise",
      sets: exMap[exId],
    }));

    let parsedNotes: { totalSets?: number; totalVolume?: number } = {};
    try {
      parsedNotes = s.notes ? JSON.parse(s.notes) : {};
    } catch {
      // ignore parse errors
    }

    const totalSets = parsedNotes.totalSets ?? exercises.reduce((a, ex) => a + ex.sets.length, 0);
    const totalVolume =
      parsedNotes.totalVolume ??
      exercises.reduce(
        (a, ex) =>
          a +
          ex.sets.reduce((s, set) => {
            const w = parseFloat(set.w) || 0;
            const r = parseInt(set.r, 10) || 0;
            return s + w * r;
          }, 0),
        0
      );

    return {
      id: s.id,
      date: s.completed_at.split("T")[0],
      type: s.workout_type,
      duration,
      startedAt: s.started_at,
      exercises,
      totalSets,
      totalVolume,
    };
  });
}
