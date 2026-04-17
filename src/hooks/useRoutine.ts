import { supabase } from "../lib/supabase";
import { getExerciseId } from "./useWorkouts";

// ── Day index mapping ────────────────────────────────────────────────────────
const DAY_TO_INDEX: Record<string, number> = {
  Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
};
const INDEX_TO_DAY: Record<number, string> = {
  0: "Mon", 1: "Tue", 2: "Wed", 3: "Thu", 4: "Fri", 5: "Sat", 6: "Sun",
};

// ── Templates type ───────────────────────────────────────────────────────────
// Exercises can be bare strings (legacy) OR objects carrying a coach note /
// target overrides. All consumers must handle both shapes — see App.jsx.
export interface ExerciseObject {
  name: string;
  coachNote?: string;
  sets?: number | string;
  reps?: string;
  weight?: number | string;
}

export type ExerciseItem = string | ExerciseObject;

export interface DayTemplate {
  type: string;
  exercises: ExerciseItem[];
}

export type Templates = Record<string, DayTemplate>;

function exerciseName(ex: ExerciseItem): string {
  return typeof ex === "string" ? ex : ex.name;
}

import { enqueueAction } from "../lib/offlineQueue";

/**
 * Loads the active routine for a user and returns it in the app's templates format.
 * Returns null if no routine exists.
 * Uses a single nested query for minimal round-trips.
 */
export async function loadRoutine(userId: string): Promise<Templates | null> {
  const cacheKey = `theryn_routine_${userId}`;
  let cachedData = null;
  try {
    const cachedText = localStorage.getItem(cacheKey);
    if (cachedText) cachedData = JSON.parse(cachedText);
  } catch {}

  const fetchNetwork = async () => {
    const { data: routine, error: routineErr } = await supabase
      .from("routines")
      .select(`
        id,
        routine_days (
          id,
          day_index,
          workout_type,
          label,
          routine_exercises ( exercise_id, sort_order, notes )
        )
      `)
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();

    if (routineErr) {
      console.error("loadRoutine error:", routineErr.message);
      return null;
    }

    if (!routine) return null;

    const days = routine.routine_days || [];
    if (days.length === 0) return null;

    const allExerciseIds = new Set<string>();
    for (const day of days) {
      for (const ex of (day as any).routine_exercises || []) {
        allExerciseIds.add(ex.exercise_id);
      }
    }

    const idToName: Record<string, string> = {};

    if (allExerciseIds.size > 0) {
      const ids = Array.from(allExerciseIds);
      const [{ data: pubExes }, { data: userExes }] = await Promise.all([
        supabase.from("public_exercises").select("id, name").in("id", ids),
        supabase.from("user_exercises").select("id, name").eq("user_id", userId).in("id", ids),
      ]);
      for (const ex of pubExes || []) idToName[ex.id] = ex.name;
      for (const ex of userExes || []) idToName[ex.id] = ex.name;
    }

    const templates: Templates = {};
    for (const day of days) {
      const dayKey = INDEX_TO_DAY[(day as any).day_index];
      if (!dayKey) continue;
      const sortedExercises = [...((day as any).routine_exercises || [])].sort((a: any, b: any) => a.sort_order - b.sort_order);
      const exercises: ExerciseItem[] = [];
      for (const ex of sortedExercises) {
        const name = idToName[(ex as any).exercise_id];
        if (!name) continue;
        // Return the richer object shape when a coach note exists, plain string otherwise.
        if ((ex as any).notes) {
          exercises.push({ name, coachNote: (ex as any).notes });
        } else {
          exercises.push(name);
        }
      }
      templates[dayKey] = {
        type: (day as any).workout_type,
        exercises,
      };
    }
    
    if (Object.keys(templates).length > 0) {
      localStorage.setItem(cacheKey, JSON.stringify(templates));
    }
    return templates;
  };

  if (cachedData) {
    if (typeof window !== "undefined" && navigator.onLine) fetchNetwork().catch(()=>{});
    return cachedData;
  }
  
  return fetchNetwork();
}

/**
 * Saves the templates object as the user's active routine.
 * Upserts the routine, deletes old days, re-inserts all days and exercises.
 * Returns the routine id.
 */
export async function saveRoutine(
  userId: string, 
  templates: Templates,
  isBackgroundSync = false
): Promise<string> {
  if (!isBackgroundSync) {
    const cacheKey = `theryn_routine_${userId}`;
    localStorage.setItem(cacheKey, JSON.stringify(templates));
  }

  try {
    let routineId: string;
    const { data: existing } = await supabase
      .from("routines")
      .select("id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();

    if (existing?.id) {
      routineId = existing.id;
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from("routines")
        .insert({ user_id: userId, name: "My Routine", is_active: true })
        .select("id")
        .single();
      if (insertErr || !inserted?.id) throw new Error(`Failed to create routine: ${insertErr?.message}`);
      routineId = inserted.id;
    }

    const { error: deleteErr } = await supabase.from("routine_days").delete().eq("routine_id", routineId);
    if (deleteErr) throw new Error(`Failed to delete routine days: ${deleteErr.message}`);

    for (const [dayKey, dayData] of Object.entries(templates)) {
      const dayIndex = DAY_TO_INDEX[dayKey];
      if (dayIndex === undefined) continue;

      const { data: dayRow, error: dayErr } = await supabase
        .from("routine_days")
        .insert({ routine_id: routineId, day_index: dayIndex, workout_type: dayData.type, label: dayKey })
        .select("id")
        .single();

      if (dayErr || !dayRow?.id) continue;
      const dayId = dayRow.id;

      if (!dayData.exercises || dayData.exercises.length === 0) continue;

      const exerciseRows: Array<{
        routine_day_id: string;
        exercise_id: string;
        sort_order: number;
        notes?: string | null;
      }> = [];
      for (let i = 0; i < dayData.exercises.length; i++) {
        const item = dayData.exercises[i];
        // Accept both legacy strings and the new {name, coachNote, ...} shape.
        const name = exerciseName(item);
        if (!name || typeof name !== "string") continue;
        const coachNote =
          typeof item === "object" && item && typeof item.coachNote === "string"
            ? item.coachNote.trim()
            : "";
        try {
          const exId = await getExerciseId(name, userId);
          exerciseRows.push({
            routine_day_id: dayId,
            exercise_id: exId,
            sort_order: i,
            notes: coachNote ? coachNote : null,
          });
        } catch (e) {}
      }

      if (exerciseRows.length > 0) {
        const { error: exErr } = await supabase.from("routine_exercises").insert(exerciseRows);
        if (exErr) console.error(`Failed to insert exercises for day ${dayKey}:`, exErr.message);
      }
    }
    
    await supabase.from("routines").update({ updated_at: new Date().toISOString() }).eq("id", routineId);
    return routineId;
  } catch (err: any) {
    if (!isBackgroundSync) {
      enqueueAction({ type: "SAVE_ROUTINE", userId, payload: templates });
      return "offline_saved";
    }
    throw err;
  }
}
