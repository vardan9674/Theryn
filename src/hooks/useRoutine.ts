import { supabase } from "../lib/supabase";
import { getExerciseId } from "./useWorkouts";
import { enqueueAction } from "../lib/offlineQueue";
import { registerActionHandler } from "../lib/actionRegistry";

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

// ── Routine metadata (template tracking) ────────────────────────────────────
export interface RoutineMeta {
  routineId: string;
  sourceTemplateId: string | null;
  sourceTemplateVersion: number | null;
  isOverridden: boolean;
  lastPushedVersion: number | null;
}

// ── Pending update (from coach push, applied after session ends) ─────────────
export interface PendingRoutineUpdate {
  version: number;
  receivedAt: number;
  structural: boolean; // false = notes-only
}

function exerciseName(ex: ExerciseItem): string {
  return typeof ex === "string" ? ex : ex.name;
}

/**
 * Loads the active routine for a user and returns it in the app's templates format.
 * Returns null if no routine exists.
 * Also returns routine metadata for template-awareness.
 */
function fillMissingDays(templates: Templates): Templates {
  const filled: Templates = { ...templates };
  for (const d of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
    if (!filled[d] || !Array.isArray(filled[d].exercises)) {
      filled[d] = { type: "Rest", exercises: [] };
    }
  }
  return filled;
}

export async function loadRoutine(userId: string, forceNetwork = false): Promise<Templates | null> {
  const cacheKey = `theryn_routine_${userId}`;
  let cachedData = null;
  if (!forceNetwork) {
    try {
      const cachedText = localStorage.getItem(cacheKey);
      if (cachedText) cachedData = fillMissingDays(JSON.parse(cachedText));
    } catch {}
  }

  const fetchNetwork = async () => {
    const { data: routine, error: routineErr } = await supabase
      .from("routines")
      .select(`
        id,
        source_template_id,
        source_template_version,
        is_overridden,
        last_pushed_version,
        routine_days (
          id,
          day_index,
          workout_type,
          label,
          routine_exercises (
            id,
            exercise_id,
            sort_order,
            notes,
            target_sets,
            target_reps,
            template_exercise_id,
            removed_at
          )
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

    const days = (routine as any).routine_days || [];
    if (days.length === 0) return null;

    // Collect exercise IDs (exclude soft-deleted rows)
    const allExerciseIds = new Set<string>();
    for (const day of days) {
      for (const ex of (day as any).routine_exercises || []) {
        // Skip soft-deleted exercises
        if ((ex as any).removed_at) continue;
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
      for (const ex of pubExes || []) idToName[(ex as any).id] = (ex as any).name;
      for (const ex of userExes || []) idToName[(ex as any).id] = (ex as any).name;
    }

    const templates: Templates = {
      Mon: { type: "Rest", exercises: [] },
      Tue: { type: "Rest", exercises: [] },
      Wed: { type: "Rest", exercises: [] },
      Thu: { type: "Rest", exercises: [] },
      Fri: { type: "Rest", exercises: [] },
      Sat: { type: "Rest", exercises: [] },
      Sun: { type: "Rest", exercises: [] },
    };
    for (const day of days) {
      const dayKey = INDEX_TO_DAY[(day as any).day_index];
      if (!dayKey) continue;

      // Filter out soft-deleted, sort by sort_order
      const sortedExercises = [...((day as any).routine_exercises || [])]
        .filter((ex: any) => !ex.removed_at)
        .sort((a: any, b: any) => a.sort_order - b.sort_order);

      const exercises: ExerciseItem[] = [];
      for (const ex of sortedExercises) {
        const name = idToName[(ex as any).exercise_id];
        if (!name) continue;
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
      // Cache template meta separately for the UI
      const meta: RoutineMeta = {
        routineId: (routine as any).id,
        sourceTemplateId: (routine as any).source_template_id,
        sourceTemplateVersion: (routine as any).source_template_version,
        isOverridden: (routine as any).is_overridden ?? false,
        lastPushedVersion: (routine as any).last_pushed_version,
      };
      try {
        localStorage.setItem(`theryn_routine_meta_${userId}`, JSON.stringify(meta));
      } catch {}
    }
    return templates;
  };

  if (cachedData) {
    if (typeof window !== "undefined" && navigator.onLine) fetchNetwork().catch(() => {});
    return cachedData;
  }

  return fetchNetwork();
}

/** Returns cached routine metadata (template tracking) for an athlete. */
export function getRoutineMeta(userId: string): RoutineMeta | null {
  try {
    const raw = localStorage.getItem(`theryn_routine_meta_${userId}`);
    if (!raw) return null;
    return JSON.parse(raw) as RoutineMeta;
  } catch {
    return null;
  }
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

    // Resolve every exercise name across every day in one round-trip via the
    // batch_resolve_exercises RPC (migration 007). Old code did one query (or
    // two, on miss + insert) per exercise — a 7-day × 5-exercise routine was
    // ~35 round-trips. Now it's 1.
    const allNames = new Set<string>();
    for (const dayData of Object.values(templates)) {
      for (const item of dayData.exercises ?? []) {
        const name = exerciseName(item);
        if (name && typeof name === "string") allNames.add(name);
      }
    }

    const idByLowerName = new Map<string, string>();
    if (allNames.size > 0) {
      const namesArr = Array.from(allNames);
      const { data: resolved, error: resolveErr } = await supabase.rpc(
        "batch_resolve_exercises",
        { p_names: namesArr, p_user_id: userId },
      );
      if (resolveErr) {
        // RPC not yet deployed — fall back to per-name resolution. Slower but
        // functionally correct, so client deploys can ship before/after the
        // migration without coordination.
        for (const n of namesArr) {
          try {
            const id = await getExerciseId(n, userId);
            idByLowerName.set(n.toLowerCase(), id);
          } catch {}
        }
      } else {
        for (const r of (resolved as Array<{ name: string; id: string }> | null) ?? []) {
          if (r?.name && r?.id) idByLowerName.set(r.name.toLowerCase(), r.id);
        }
      }
    }

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
        const name = exerciseName(item);
        if (!name || typeof name !== "string") continue;
        const coachNote =
          typeof item === "object" && item && typeof item.coachNote === "string"
            ? item.coachNote.trim()
            : "";
        const exId = idByLowerName.get(name.toLowerCase());
        if (!exId) continue;
        exerciseRows.push({
          routine_day_id: dayId,
          exercise_id: exId,
          sort_order: i,
          notes: coachNote ? coachNote : null,
        });
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

/**
 * Coach saves a routine for a specific athlete.
 * If the athlete's routine was assigned from a template and not yet overridden,
 * this automatically forks it first (marks is_overridden=true) so template
 * pushes won't silently overwrite the coach's per-athlete customisation.
 *
 * Returns { routineId, forked } where forked=true means a fork was triggered.
 */
export async function saveRoutineAsCoach(
  athleteId: string,
  templates: Templates,
  coachId: string
): Promise<{ routineId: string; forked: boolean }> {
  const meta = getRoutineMeta(athleteId);
  let forked = false;

  // Auto-fork: if this athlete has a template-assigned routine and it's not yet overridden
  if (meta?.sourceTemplateId && !meta.isOverridden) {
    try {
      const { error } = await supabase.rpc("fork_athlete_routine", { p_athlete_id: athleteId });
      if (!error) {
        forked = true;
        // Update local meta cache
        try {
          const updatedMeta: RoutineMeta = { ...meta, isOverridden: true, routineId: meta.routineId };
          localStorage.setItem(`theryn_routine_meta_${athleteId}`, JSON.stringify(updatedMeta));
        } catch {}
      }
    } catch (e) {
      console.error("fork_athlete_routine failed:", e);
    }
  }

  const routineId = await saveRoutine(athleteId, templates);
  return { routineId, forked };
}

/**
 * Determines if a routine update from realtime is structural (exercises/sets/reps changed)
 * vs notes-only. Used to decide whether to defer or apply silently.
 */
export function classifyRoutineUpdate(
  oldTemplates: Templates | null,
  newTemplates: Templates
): "structural" | "notes_only" | "new" {
  if (!oldTemplates) return "new";

  const oldKeys = Object.keys(oldTemplates).sort();
  const newKeys = Object.keys(newTemplates).sort();

  if (JSON.stringify(oldKeys) !== JSON.stringify(newKeys)) return "structural";

  for (const day of newKeys) {
    const oldDay = oldTemplates[day];
    const newDay = newTemplates[day];

    if (oldDay.type !== newDay.type) return "structural";

    const oldExNames = oldDay.exercises.map(e => typeof e === "string" ? e : e.name);
    const newExNames = newDay.exercises.map(e => typeof e === "string" ? e : e.name);

    if (JSON.stringify(oldExNames) !== JSON.stringify(newExNames)) return "structural";
  }

  // Only notes changed
  return "notes_only";
}

// Register the offline-flush handler for routine saves. Called once on import.
registerActionHandler("SAVE_ROUTINE", (userId, payload) =>
  saveRoutine(userId, payload as any, true)
);
