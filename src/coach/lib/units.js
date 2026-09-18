// One place for kg/lb and cm/in. Units are "metric" | "imperial" everywhere
// (the profiles.unit_system values). Everyone sees their own units: the coach
// in the dashboard, the client on their link page. Stored numbers keep the
// unit they were typed in, and say which (plan days carry `units`,
// submissions carry `unit` / `weight_unit`), so conversion happens on read.
import { DAYS } from "./format.js";

export const LB_PER_KG = 2.20462262;
export const CM_PER_IN = 2.54;

export const normUnits = (u) => (u === "metric" ? "metric" : "imperial");
export const weightLabel = (u) => (u === "metric" ? "kg" : "lb");
export const lengthLabel = (u) => (u === "metric" ? "cm" : "in");

const roundTo = (n, step) => Math.round(n / step) * step;
const tidy = (n) => Number(n.toFixed(2));

/**
 * Weight from one unit system to another. `step` rounds the result: 0.5 for
 * gym weights (plates come in halves), 0.1 for body weight. Same-unit values
 * pass through untouched. Blank and non-numbers come back as null.
 */
export function convertWeight(w, from, to, step = 0.5) {
  if (w == null || w === "") return null;
  const n = Number(w);
  if (!Number.isFinite(n)) return null;
  if (normUnits(from) === normUnits(to)) return n;
  const out = normUnits(to) === "metric" ? n / LB_PER_KG : n * LB_PER_KG;
  return tidy(roundTo(out, step));
}

export function convertLength(x, from, to) {
  if (x == null || x === "") return null;
  const n = Number(x);
  if (!Number.isFinite(n)) return null;
  if (normUnits(from) === normUnits(to)) return n;
  return tidy(roundTo(normUnits(to) === "metric" ? n * CM_PER_IN : n / CM_PER_IN, 0.1));
}

/** "metric" | "imperial" stamped on a plan by the coach's editor, or null. */
export function planUnits(plan) {
  if (!plan || typeof plan !== "object") return null;
  for (const k of DAYS) { const u = plan[k]?.units; if (u === "metric" || u === "imperial") return u; }
  return null;
}

/**
 * A plan with every target weight in `to`, each day stamped with it. A plan
 * without a stamp is taken to be in `assumeFrom`.
 */
export function convertPlan(plan, to, { assumeFrom = to } = {}) {
  if (!plan || typeof plan !== "object") return plan;
  const from = planUnits(plan) || normUnits(assumeFrom);
  const out = {};
  for (const [k, day] of Object.entries(plan)) {
    if (!day || typeof day !== "object" || !DAYS.includes(k)) { out[k] = day; continue; }
    out[k] = {
      ...day,
      units: normUnits(to),
      exercises: (day.exercises || []).map((ex) => (ex && typeof ex === "object" && ex.weight != null && ex.weight !== ""
        ? { ...ex, weight: convertWeight(ex.weight, from, to) }
        : ex)),
    };
  }
  return out;
}

/**
 * A link submission with its numbers in `to`. Measurements say their unit;
 * workouts say `weight_unit` (older ones don't, so `workoutFrom` is what the
 * link page showed them in).
 */
export function convertSubmission(sub, to, { workoutFrom = to } = {}) {
  const p = sub?.payload;
  if (!p || typeof p !== "object") return sub;
  const target = normUnits(to);
  if (sub.kind === "measurements") {
    const from = normUnits(p.unit);
    if (from === target) return sub;
    const next = { ...p, unit: target };
    if (p.weight != null) next.weight = convertWeight(p.weight, from, target, 0.1);
    for (const k of ["chest", "waist", "hips", "arm", "thigh"]) if (p[k] != null) next[k] = convertLength(p[k], from, target);
    return { ...sub, payload: next };
  }
  if (sub.kind === "workout") {
    const from = normUnits(p.weight_unit || workoutFrom);
    if (from === target && p.weight_unit === target) return sub;
    const exercises = (p.exercises || []).map((e) => ({
      ...e,
      weight_used: e.weight_used != null ? convertWeight(e.weight_used, from, target) : e.weight_used,
      weight_target: e.weight_target != null ? convertWeight(e.weight_target, from, target) : e.weight_target,
    }));
    return { ...sub, payload: { ...p, exercises, weight_unit: target } };
  }
  return sub;
}
