// The coach corrects a workout a client sent (or the coach logged): a typo
// like 75 kg instead of 7.5, the wrong reps, a plank time. Only the numbers of
// the sets that were done change; what was planned, the date and the note stay.
// The first edit keeps a copy of what the client sent in `original_exercises`.
// Pure; no React.
import { plannedSet, plannedRepsNumber } from "./planSets.js";
import { workoutNumbersProblem } from "./clientLinks.js";

const num = (v) => (v == null || String(v).trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * The done sets of one exercise in a workout payload, ready to edit:
 * [{ n, reps, weight, secs }] with the client's numbers, or the plan's where
 * they left a set blank (a blank set meant "as planned").
 */
export function editableSets(ex) {
  const done = Math.max(0, Number(ex?.sets_done) || 0);
  const ps = Array.isArray(ex?.plan_sets) ? ex.plan_sets : [];
  const typed = Array.isArray(ex?.sets) ? ex.sets : [];
  return Array.from({ length: done }, (_, i) => {
    const t = typed.find((x) => Number(x?.n) === i + 1) || {};
    const p = plannedSet(ex, i);
    // With per-set plans, a set the coach gave no weight has none (#134). Older
    // sends without them carried one weight for the whole exercise.
    const planW = ps.length ? p.w : ex.weight_used ?? ex.weight_target;
    return {
      n: i + 1,
      reps: num(t.reps) ?? plannedRepsNumber(p.r),
      weight: num(t.weight) ?? num(planW),
      secs: num(t.secs) ?? p.s,
    };
  });
}

/**
 * The payload with the coach's corrections applied. `edits` is
 * { [exerciseIndex]: [{ n, reps, weight, secs }] } for the exercises changed.
 */
export function applyEdits(payload, edits, now = new Date()) {
  const p = payload && typeof payload === "object" ? payload : {};
  const exercises = (p.exercises || []).map((ex, ei) => {
    const rows = edits?.[ei];
    if (!rows) return ex;
    const timed = ex.mode === "time";
    const byN = new Map(rows.map((r) => [Number(r.n), r]));
    const total = Math.max(Number(ex.sets_planned) || 0, Number(ex.sets_done) || 0, rows.length, (ex.sets || []).length);
    const sets = Array.from({ length: total }, (_, i) => {
      const old = (ex.sets || []).find((x) => Number(x?.n) === i + 1) || {};
      const r = byN.get(i + 1);
      const one = { n: i + 1, done: old.done ?? i < (Number(ex.sets_done) || 0) };
      const reps = r ? num(r.reps) : num(old.reps);
      const weight = r ? num(r.weight) : num(old.weight);
      const secs = r ? num(r.secs) : num(old.secs);
      if (!timed && reps != null) one.reps = reps;
      if (timed && secs != null) one.secs = secs;
      if (weight != null) one.weight = weight;
      return one;
    });
    const firstW = sets.find((s) => s.done && s.weight != null)?.weight ?? null;
    return { ...ex, sets, weight_used: firstW };
  });
  const out = { ...p, exercises, edited_by_coach_at: now.toISOString() };
  if (!p.original_exercises) out.original_exercises = p.exercises || [];
  return out;
}

/**
 * The first number in the edit sheet that can't be saved as typed ("." or a
 * weight past the believable limit), as a sentence, or null. `rows` is the
 * sheet's { [exerciseIndex]: [{ reps, weight }] } as strings; `unit` is "kg" or "lb".
 * Without this an unreadable weight was saved as blank, erasing it (#133).
 */
export function editNumbersProblem(exercises, rows, unit) {
  const log = {};
  for (const [ei, list] of Object.entries(rows || {})) {
    log[ei] = Object.fromEntries((list || []).map((x, i) => [i, { r: x?.reps ?? "", w: x?.weight ?? "" }]));
  }
  return workoutNumbersProblem(exercises, log, unit === "kg" ? "metric" : "imperial");
}

/**
 * A weight that looks like a typo: ten times the plan or a tenth of it
 * (75 for 7.5, 7.5 for 75), or over 500. Needs a plan weight to compare.
 */
export function weightLooksOff(weight, planned) {
  const w = num(weight), p = num(planned);
  if (w == null) return false;
  if (w > 500) return true;
  if (p == null || p <= 0) return false;
  return w >= p * 5 || w <= p / 5;
}
