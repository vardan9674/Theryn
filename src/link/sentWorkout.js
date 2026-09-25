// Opening a workout they already sent, to change it.
//
// The phone remembers what was typed, but only the phone it was typed on, and
// only until storage is cleared. The workout itself lives on the server, so
// "Edit workout" rebuilds the boxes from what the coach actually received —
// the same numbers, whichever phone they are holding.
//
// Pure; no React.
import { convertWeight } from "../coach/lib/units.js";
import { durationInput } from "../coach/lib/exerciseKinds.js";

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const key = (name) => String(name || "").trim().toLowerCase();

/**
 * A sent workout → what the editor needs: which sets are ticked, what is in
 * each box, which exercises were skipped, the note, how it felt, and anything
 * the client added themselves.
 *
 * Exercises are matched to the plan by name. One the coach has since removed
 * is left out — the plan is the plan now — and anything the client added
 * comes back as theirs.
 */
export function editStateFromPayload(payload, planExercises = [], units = "metric") {
  const out = { ticks: {}, log: {}, skipped: {}, note: "", feel: null, extras: [] };
  if (!payload || typeof payload !== "object") return out;

  out.note = typeof payload.note === "string" ? payload.note : "";
  out.feel = ["easy", "medium", "hard"].includes(payload.feel) ? payload.feel : null;

  const from = payload.weight_unit === "metric" || payload.weight_unit === "imperial" ? payload.weight_unit : units;
  const weightIn = (w) => { const n = num(w); if (n == null) return null; const c = convertWeight(n, from, units); return c == null ? null : String(c); };

  // Plan exercises by name, each usable once, so a plan with the same
  // exercise twice still lines up.
  const spare = new Map();
  (planExercises || []).forEach((e, i) => {
    const k = key(e?.name);
    if (!spare.has(k)) spare.set(k, []);
    spare.get(k).push(i);
  });
  const take = (name) => { const list = spare.get(key(name)); return list && list.length ? list.shift() : null; };

  const put = (i, ex) => {
    const done = Math.max(0, Number(ex.sets_done) || 0);
    out.ticks[i] = done;
    if ((Number(ex.sets_planned) || 0) > 0 && done === 0) out.skipped[i] = true;
    const rows = Array.isArray(ex.sets) ? ex.sets : [];
    const per = {};
    rows.forEach((s) => {
      const si = (Number(s?.n) || 1) - 1;
      const cell = {};
      if (s?.reps != null && s.reps !== "") cell.r = String(s.reps);
      if (s?.secs != null) cell.s = durationInput(s.secs);
      const w = weightIn(s?.weight);
      if (w != null) cell.w = w;
      if (Object.keys(cell).length) per[si] = cell;
    });
    // Older sends carried one weight for the whole exercise, not per set.
    if (!rows.length && ex.weight_used != null) {
      const w = weightIn(ex.weight_used);
      if (w != null) for (let si = 0; si < done; si++) per[si] = { w };
    }
    if (Object.keys(per).length) out.log[i] = per;
  };

  const planCount = (planExercises || []).length;
  (payload.exercises || []).forEach((ex) => {
    if (!ex || !ex.name) return;
    const i = ex.added_by_client ? null : take(ex.name);
    if (i != null) { put(i, ex); return; }
    if (!ex.added_by_client) return; // the coach has since taken it off the plan
    // Theirs: it comes back after the coach's exercises, in the order they sent.
    const timed = ex.mode === "time";
    const extra = { name: String(ex.name).slice(0, 60), sets: Math.max(1, Number(ex.sets_planned) || Number(ex.sets_done) || 1) };
    if (timed) { extra.mode = "time"; const s = num(ex.secs_target); if (s != null) extra.secs = s; }
    else {
      if (ex.reps) extra.reps = String(ex.reps);
      const w = weightIn(ex.weight_target != null ? ex.weight_target : ex.weight_used);
      if (w != null) extra.weight = Number(w);
    }
    put(planCount + out.extras.length, ex);
    out.extras.push(extra);
  });

  return out;
}
