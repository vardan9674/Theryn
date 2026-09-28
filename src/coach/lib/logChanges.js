// What the coach changes while ticking off a workout a client already did.
//
// The plan said one thing and the session went another way: the leg press was
// taken, so they did a hack squat; the shoulder hurt, so the overhead press was
// skipped; they had time for a fourth set. None of that should touch the plan,
// which would change every week from now on. It belongs to that one day, so the
// log sheet keeps it beside the ticks and shapes the exercises on the way out.
//
// Pure; no React.
import { planSets } from "./planSets.js";

export const MAX_SETS = 20;
const clean = (v) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
const same = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase();

/** A set count the sheet can show: 1 to 20, or null for "as the plan says". */
export function setCount(n) {
  const v = Math.round(Number(n));
  return Number.isFinite(v) && v >= 1 ? Math.min(v, MAX_SETS) : null;
}

/** How many sets an exercise asks for, however the plan writes it. */
export function plannedSets(ex) {
  return Math.min(MAX_SETS, Math.max(1, Number(ex?.sets) || planSets(ex, 3).length));
}

/**
 * The same slot in the workout, done as a different exercise. Sets, reps and
 * timing carry over — swapping is for "same job, different kit" — but the
 * weight the plan asked for does not: 60 on a barbell is not 60 on dumbbells,
 * and a target nobody typed would be sent as if they had lifted it.
 */
export function swapTo(ex, to) {
  const name = clean(to);
  if (!ex || !name || same(name, ex.name)) return ex;
  const stripWeight = (s) => ({ ...s, weight: null });
  return {
    ...ex,
    name,
    swappedFrom: ex.name,
    weight: null,
    // The plan's stand-ins stay on the slot, so the picker can still offer
    // them when the first swap turns out to be the wrong one.
    setList: Array.isArray(ex.setList) && ex.setList.length ? ex.setList.map(stripWeight) : ex.setList,
  };
}

/**
 * The same exercise for a different number of sets. Extra sets copy the last
 * one the plan asked for, minus its kind: a fourth set after three working
 * sets is a working set, not a second warm-up.
 */
export function withSets(ex, n) {
  const want = setCount(n);
  if (!ex || !want || want === plannedSets(ex)) return ex;
  const rows = planSets(ex, plannedSets(ex));
  const last = rows[rows.length - 1] || { reps: "", weight: null };
  const grown = Array.from({ length: want }, (_, i) => (i < rows.length ? rows[i] : { ...last, kind: undefined }));
  return {
    ...ex,
    sets: want,
    setList: grown.map((s) => ({
      ...(s.reps ? { reps: s.reps } : {}),
      ...(s.weight != null ? { weight: s.weight } : {}),
      ...(s.secs != null ? { secs: s.secs } : {}),
      ...(s.kind ? { kind: s.kind } : {}),
    })),
  };
}

/**
 * The day's exercises as the coach is logging them: swaps applied, set counts
 * applied, in the plan's order. Skipped ones stay in the list — they are sent
 * with no sets done, the same shape the client's own link sends — so the coach
 * can undo a skip and so the workout still shows what was asked for.
 */
export function shapeExercises(exercises, { swaps = {}, sets = {} } = {}) {
  return (exercises || []).map((e, i) => withSets(swapTo(e, swaps[i]), sets[i]));
}

/** Has the coach changed anything about the exercises themselves? */
export function anyChanges(exercises, { skipped = {}, swaps = {}, sets = {} } = {}) {
  return (exercises || []).some((e, i) =>
    Boolean(skipped[i]) ||
    (clean(swaps[i]) && !same(swaps[i], e.name)) ||
    (setCount(sets[i]) && setCount(sets[i]) !== plannedSets(e)));
}

/** The line under a changed exercise's name, or "" when it is as planned. */
export function changeLine(ex, { skipped = false, plannedCount = null } = {}) {
  const bits = [];
  if (ex?.swappedFrom) bits.push(`Instead of ${ex.swappedFrom}`);
  if (plannedCount && plannedSets(ex) !== plannedCount) bits.push(`${plannedSets(ex)} sets, not ${plannedCount}`);
  if (skipped) bits.unshift("Skipped");
  return bits.join(" · ");
}
