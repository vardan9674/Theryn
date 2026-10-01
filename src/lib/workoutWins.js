// Wins: an exercise done better than the last time it was done.
//
// Pure; no React. The link's "sent" screen shows them straight after a
// workout, and the weekly report lists the week's best ones for the coach to
// share. Both read sets in the same shape: { w, r, s } per done set (weight,
// reps, seconds), as doneSets() and the dashboard's history give them.
//
// Honest by design:
//  - Only against the last time. A first time has nothing to beat, so it is
//    never a win.
//  - Lighter weight for more reps is not called a win: it may be a deload, or
//    the client may have picked up the wrong dumbbells. Nobody is congratulated
//    for less.
//  - One win per exercise, the strongest kind.
import { normalizeExerciseName } from "./muscleHeat.js";

const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

/** What one exercise's done sets add up to. */
export function exerciseStats(sets) {
  let top = 0, topReps = 0, bodyReps = 0, secs = 0, totalReps = 0;
  for (const s of sets || []) {
    const w = num(s?.w), r = Math.round(num(s?.r)), t = num(s?.s);
    if (t > secs) secs = t;
    if (!r) continue;
    totalReps += r;
    if (w > top) { top = w; topReps = r; } else if (w > 0 && w === top && r > topReps) topReps = r;
    if (!w && r > bodyReps) bodyReps = r;
  }
  return { top, topReps, bodyReps, secs, totalReps, sets: (sets || []).length };
}

// Strongest first: it decides which one an exercise shows, and the order of the list.
export const WIN_ORDER = ["heavier", "reps", "longer", "more"];

/**
 * How `now` beat `before` for one exercise, or null.
 *   heavier — a heavier top set than last time
 *   reps    — the same top weight, more reps (or, with no weight, more reps)
 *   longer  — a longer hold or run
 *   more    — no lighter, but more reps in all (often a set they skipped last time)
 */
export function compareExercise(now, before) {
  if (!now || !before) return null;
  if (now.top > 0 && before.top > 0) {
    if (now.top > before.top) return { kind: "heavier", now: now.top, before: before.top, reps: now.topReps };
    if (now.top < before.top) return null;
    if (now.topReps > before.topReps) return { kind: "reps", now: now.topReps, before: before.topReps, weight: now.top };
    if (now.totalReps > before.totalReps) return { kind: "more", now: now.totalReps, before: before.totalReps };
    return null;
  }
  if (now.secs > 0 && before.secs > 0) {
    return now.secs > before.secs ? { kind: "longer", now: now.secs, before: before.secs } : null;
  }
  // Bodyweight: no weight either time. Adding weight to a bodyweight move
  // is a change of exercise, not a win to compare by reps.
  if (!now.top && !before.top && now.bodyReps > 0 && before.bodyReps > 0) {
    if (now.bodyReps > before.bodyReps) return { kind: "reps", now: now.bodyReps, before: before.bodyReps, weight: 0 };
    if (now.bodyReps === before.bodyReps && now.totalReps > before.totalReps) return { kind: "more", now: now.totalReps, before: before.totalReps };
  }
  return null;
}

const byStrength = (a, b) => WIN_ORDER.indexOf(a.kind) - WIN_ORDER.indexOf(b.kind) || (b.gain || 0) - (a.gain || 0);
const gainOf = (x) => (x.before > 0 ? (x.now - x.before) / x.before : 0);
export const winKey = (name) => normalizeExerciseName(name) || String(name || "").trim().toLowerCase();

/**
 * This workout against the last time of each exercise.
 *
 * @param exercises [{ name, sets: [{ w, r, s }] }] — only what was done
 * @param lastOf    name → [{ w, r, s }] from the last time, or null
 * @returns wins, strongest first: [{ name, kind, now, before, reps?, weight? }]
 */
export function workoutWins(exercises, lastOf) {
  const out = [];
  const seen = new Set();
  for (const e of exercises || []) {
    const k = winKey(e?.name);
    if (!k || seen.has(k) || !(e.sets || []).length) continue;
    seen.add(k);
    const prev = lastOf(e.name);
    if (!prev || !prev.length) continue;
    const win = compareExercise(exerciseStats(e.sets), exerciseStats(prev));
    if (win) out.push({ name: String(e.name).trim(), ...win, gain: gainOf(win) });
  }
  return out.sort(byStrength);
}

/**
 * The last time each exercise was done before `beforeDate`, from a list of
 * workouts ({ date, exercises: [{ name, sets }] }, any order). Sets are
 * passed through `convert` so last time's kg and this time's lb compare.
 */
export function lastTimes(workouts, beforeDate, convert = (sets) => sets) {
  const last = new Map();
  const sorted = [...(workouts || [])].filter((w) => w?.date && w.date < beforeDate).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  for (const w of sorted) {
    for (const e of w.exercises || []) {
      const k = winKey(e?.name);
      if (!k || last.has(k) || !(e.sets || []).length) continue;
      last.set(k, convert(e.sets, w));
    }
  }
  return (name) => last.get(winKey(name)) || null;
}

/**
 * The week's wins: each exercise's best session this week against the last
 * time before the week. "Better than last week" is what a client remembers,
 * not set-by-set changes between Monday and Friday.
 *
 * @param history the dashboard's history ({ date, exercises: [{ name, sets }] })
 */
export function weekWins(history, start, end) {
  const lastBefore = lastTimes(history, start);
  const best = new Map();
  for (const h of history || []) {
    if (!h?.date || h.date < start || h.date > end) continue;
    for (const e of h.exercises || []) {
      const k = winKey(e?.name);
      if (!k || !(e.sets || []).length) continue;
      const prev = lastBefore(e.name);
      if (!prev) continue;
      const win = compareExercise(exerciseStats(e.sets), exerciseStats(prev));
      if (!win) continue;
      const cur = best.get(k);
      const cand = { name: String(e.name).trim(), ...win, gain: gainOf(win) };
      if (!cur || byStrength(cand, cur) < 0) best.set(k, cand);
    }
  }
  return [...best.values()].sort(byStrength);
}

// ── Words ─────────────────────────────────────────────────────────────────
const n1 = (x) => (Number.isInteger(x) ? String(x) : String(Math.round(x * 10) / 10));
export const holdLabel = (secs) => {
  const s = Math.round(secs);
  if (s < 60) return `${s} sec`;
  const m = Math.floor(s / 60), r = s % 60;
  return r ? `${m}:${String(r).padStart(2, "0")} min` : `${m} min`;
};

/**
 * One win as a short title and a line: "Heavier" / "45 kg, up from 42.5 kg".
 * The heading above the list says what it is compared with.
 */
export function winWords(win, unit = "kg") {
  switch (win?.kind) {
    case "heavier":
      return { tag: "Heavier", line: `${n1(win.now)} ${unit}, up from ${n1(win.before)} ${unit}` };
    case "reps":
      return win.weight > 0
        ? { tag: "More reps", line: `${win.now} reps at ${n1(win.weight)} ${unit}, up from ${win.before}` }
        : { tag: "More reps", line: `${win.now} reps, up from ${win.before}` };
    case "longer":
      return { tag: "Longer", line: `${holdLabel(win.now)}, up from ${holdLabel(win.before)}` };
    case "more":
      return { tag: "More work", line: `${win.now} reps in all, up from ${win.before}` };
    default:
      return { tag: "", line: "" };
  }
}

/** Their headline for a handful of wins. */
export function winsHeadline(count) {
  if (!count) return "";
  return count === 1 ? "You beat last time." : `You beat last time on ${count} exercises.`;
}
