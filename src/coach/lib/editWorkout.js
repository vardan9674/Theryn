// The coach corrects a workout a client sent (or the coach logged): a typo
// like 75 kg instead of 7.5, the wrong reps, a plank time. Only the numbers of
// the sets that were done change; what was planned, the date and the note stay.
// The first edit keeps a copy of what the client sent in `original_exercises`.
// Pure; no React.

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
  const firstNum = (r) => (String(r ?? "").match(/\d+/) || [null])[0];
  return Array.from({ length: done }, (_, i) => {
    const t = typed.find((x) => Number(x?.n) === i + 1) || {};
    return {
      n: i + 1,
      reps: num(t.reps) ?? num(firstNum(ps[i]?.r ?? ex.reps)),
      weight: num(t.weight) ?? num(ps[i]?.w ?? (i === 0 ? ex.weight_used : null) ?? ex.weight_used ?? ex.weight_target),
      secs: num(t.secs) ?? num(ps[i]?.s ?? ex.secs_target),
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
