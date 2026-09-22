// Saved plans (routine templates) for name-only clients. The assignment table
// only holds app accounts, so a name-only client "has" a saved plan when the
// plan on their coach_manual_clients row carries a `template` stamp on its
// days: { id, name, version, overridden }. Giving the plan copies the week in;
// Send update copies it again (skipping plans the coach has since edited,
// unless forced); taking it away removes the stamp and leaves the week alone.
//
// Template exercise rows can also carry target weights and per-set targets:
// target_weight, set_list ([{ reps, weight }]) and weight_unit ("kg" | "lb",
// the unit the coach typed them in). Rows saved before those columns existed
// just have sets and reps.
import { DAYS } from "./format.js";
import { convertWeight, normUnits } from "./units.js";

const unitsOfRow = (e) => (e.weight_unit === "kg" ? "metric" : e.weight_unit === "lb" ? "imperial" : null);

/**
 * Template days (from getTemplateWithTree) → the weekly plan shape. With
 * `units`, target weights come back in those units.
 */
export function templateDaysToPlan(days, units) {
  const out = {};
  for (const d of DAYS) out[d] = { type: "Rest", exercises: [] };
  for (const d of days || []) {
    const key = DAYS[d.day_index] || d.label;
    if (!key) continue;
    out[key] = {
      type: d.workout_type || "Rest",
      exercises: (d.exercises || []).map((e) => {
        const from = unitsOfRow(e) || normUnits(units);
        const w = (v) => (units ? convertWeight(v, from, units) : v == null || v === "" ? null : Number(v));
        const o = { name: e.exercise_name, sets: e.target_sets, reps: e.target_reps };
        if (e.target_weight != null) o.weight = w(e.target_weight);
        if (Array.isArray(e.set_list) && e.set_list.length) {
          o.setList = e.set_list.map((s) => { const x = {}; if (["warmup", "drop", "amrap"].includes(s?.kind)) x.kind = s.kind; if (s?.reps) x.reps = String(s.reps); if (s?.secs != null) x.secs = Number(s.secs); if (s?.weight != null) x.weight = w(s.weight); return x; });
        }
        // Timed exercises and supersets.
        const extra = e.extra && typeof e.extra === "object" ? e.extra : null;
        if (extra?.mode === "time") { o.mode = "time"; if (extra.secs != null) o.secs = Number(extra.secs); delete o.reps; }
        if (extra?.superset) o.superset = String(extra.superset);
        if (Number(extra?.rest) > 0) o.rest = Number(extra.rest);
        if (e.notes) o.coachNote = e.notes;
        return o;
      }),
    };
  }
  return out;
}

/**
 * The weekly plan (as the plan editor saves it) → template days for
 * saveTemplateTree. `previous` is the template's days before editing, so
 * library links (source_exercise_id, muscle group…) survive a rename-free save.
 */
export function planToTemplateDays(plan, units, previous = []) {
  const known = new Map();
  for (const d of previous || []) for (const e of d.exercises || []) if (e.exercise_name) known.set(e.exercise_name.toLowerCase(), e);
  const unit = normUnits(units) === "metric" ? "kg" : "lb";
  return DAYS.map((label, day_index) => {
    const day = plan?.[label] || { type: "Rest", exercises: [] };
    const exercises = day.type === "Rest" ? [] : (day.exercises || []).map((ex, sort_order) => {
      const o = typeof ex === "string" ? { name: ex } : ex;
      const prev = known.get(String(o.name || "").toLowerCase()) || {};
      const hasWeight = o.weight != null || (o.setList || []).some((s) => s.weight != null);
      return {
        sort_order,
        exercise_name: o.name,
        muscle_group: prev.muscle_group, equipment: prev.equipment, category: prev.category,
        source_exercise_id: prev.source_exercise_id, source_user_exercise_id: prev.source_user_exercise_id,
        target_sets: Number(o.sets) || 3,
        target_reps: o.reps || "8-12",
        target_weight: o.weight ?? null,
        set_list: Array.isArray(o.setList) && o.setList.length ? o.setList : null,
        weight_unit: hasWeight ? unit : null,
        extra: o.mode === "time" || o.superset || o.rest ? { ...(o.mode === "time" ? { mode: "time", ...(o.secs != null ? { secs: o.secs } : {}) } : {}), ...(o.superset ? { superset: o.superset } : {}), ...(o.rest ? { rest: o.rest } : {}) } : null,
        notes: o.coachNote || "",
      };
    });
    return { day_index, label, workout_type: day.type || "Rest", exercises };
  });
}

/** True when a saved plan has at least one workout day with an exercise. */
export function templateHasWorkouts(days) {
  return (days || []).some((d) => d.workout_type !== "Rest" && (d.exercises || []).length > 0);
}
export const EMPTY_PLAN_MSG = "This plan has no exercises yet. Tap Edit plan, add a workout, save, then add clients.";

/** The saved plan a client's week came from, or null. */
export function planTemplate(plan) {
  if (!plan || typeof plan !== "object") return null;
  for (const k of DAYS) { const t = plan[k]?.template; if (t && t.id) return t; }
  return null;
}

/** The week with every day stamped with `meta` (or unstamped when meta is null). */
export function stampTemplate(plan, meta) {
  const out = { ...(plan || {}) };
  for (const k of DAYS) {
    const day = { ...(out[k] || { type: "Rest", exercises: [] }) };
    if (meta) day.template = meta; else delete day.template;
    out[k] = day;
  }
  return out;
}

/** A name-only client's week from a saved plan, stamped with it and the coach's units. */
export function manualPlanFromTemplate(template, days, units) {
  const plan = templateDaysToPlan(days, units);
  for (const k of DAYS) plan[k].units = units;
  return stampTemplate(plan, { id: template.id, name: template.name, version: template.version ?? 1, overridden: false });
}
