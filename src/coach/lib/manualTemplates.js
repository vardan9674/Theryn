// Saved plans (routine templates) for name-only clients. The assignment table
// only holds app accounts, so a name-only client "has" a saved plan when the
// plan on their coach_manual_clients row carries a `template` stamp on its
// days: { id, name, version, overridden }. Giving the plan copies the week in;
// Send update copies it again (skipping plans the coach has since edited,
// unless forced); taking it away removes the stamp and leaves the week alone.
import { DAYS } from "./format.js";

/** Template days (from getTemplateWithTree) → the weekly plan shape. */
export function templateDaysToPlan(days) {
  const out = {};
  for (const d of DAYS) out[d] = { type: "Rest", exercises: [] };
  for (const d of days || []) {
    const key = DAYS[d.day_index] || d.label;
    if (!key) continue;
    out[key] = {
      type: d.workout_type || "Rest",
      exercises: (d.exercises || []).map((e) => ({ name: e.exercise_name, sets: e.target_sets, reps: e.target_reps, coachNote: e.notes || undefined })),
    };
  }
  return out;
}

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
  const plan = templateDaysToPlan(days);
  for (const k of DAYS) plan[k].units = units;
  return stampTemplate(plan, { id: template.id, name: template.name, version: template.version ?? 1, overridden: false });
}
