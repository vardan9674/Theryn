// Per-set targets in a plan. An exercise in the plan JSON can say
//   { name, sets: 3, reps: "10", weight: 60 }                 same for every set, or
//   { name, sets: 3, reps: "12/10/8", weight: 60,
//     setList: [{ reps: "12", weight: 60 }, { reps: "10", weight: 65 }, { reps: "8", weight: 70 }] }
// A timed exercise says mode "time" and seconds instead of reps:
//   { name, mode: "time", sets: 3, secs: 60 }  or  setList: [{ secs: 45 }, { secs: 60 }]
// `sets`, `reps` and `weight` are always written too, so older readers (and the
// Excel export's columns) keep working; `setList` is only written when the sets
// differ. Pure; no React.
import { formatDuration } from "./exerciseKinds.js";

const str = (v) => (v == null ? "" : String(v).trim());
const num = (v) => { if (v == null || String(v).trim() === "") return null; const n = Number(v); return Number.isFinite(n) && n > 0 && n <= 2000 ? Math.round(n * 100) / 100 : null; };
const secsOf = (v) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 && n <= 6 * 3600 ? n : null; };

/**
 * The sets of one plan exercise, one entry per set:
 * { reps: "10" | "", weight: 60 | null, secs: 45 | null }.
 * A bare name (legacy) or an exercise without numbers gives `fallbackCount` empty sets.
 */
export function planSets(ex, fallbackCount = 3) {
  if (!ex || typeof ex !== "object") return Array.from({ length: fallbackCount }, () => ({ reps: "", weight: null }));
  // Only timed exercises carry secs, so reps-only plans read exactly as before.
  const timed = ex.mode === "time" || ex.secs != null || (ex.setList || []).some((s) => s?.secs != null);
  const withSecs = (o, v) => (timed ? { ...o, secs: secsOf(v) } : o);
  if (Array.isArray(ex.setList) && ex.setList.length) {
    return ex.setList.slice(0, 20).map((s) => withSecs({ reps: str(s?.reps), weight: num(s?.weight) }, s?.secs ?? ex.secs));
  }
  const n = Math.min(20, Math.max(1, Number(ex.sets) || fallbackCount));
  return Array.from({ length: n }, () => withSecs({ reps: str(ex.reps), weight: num(ex.weight) }, ex.secs));
}

/** True when every set asks for the same reps, weight and time. */
export function setsAreSame(list) {
  return (list || []).every((s) => str(s.reps) === str(list[0].reps) && num(s.weight) === num(list[0].weight) && secsOf(s.secs) === secsOf(list[0].secs));
}

/**
 * Sets → the fields stored on the exercise: sets, reps (or secs for a timed
 * exercise), weight, and setList only when they differ. Blank sets are kept
 * (they count as sets); blank fields are left out.
 */
export function packSets(list, mode = "reps") {
  const timed = mode === "time";
  const rows = (list || []).map((s) => ({ reps: timed ? "" : str(s.reps), weight: num(s.weight), secs: timed ? secsOf(s.secs) : null }));
  if (rows.length === 0) return {};
  const out = { sets: rows.length };
  if (timed) out.mode = "time";
  const same = setsAreSame(rows);
  if (same) {
    if (rows[0].reps) out.reps = rows[0].reps;
    if (rows[0].secs != null) out.secs = rows[0].secs;
    if (rows[0].weight != null) out.weight = rows[0].weight;
    return out;
  }
  if (!timed) {
    const reps = rows.map((s) => s.reps || "–");
    if (rows.some((s) => s.reps)) out.reps = reps.every((r) => r === reps[0]) ? reps[0] : reps.join("/");
  } else {
    const firstS = rows.find((s) => s.secs != null)?.secs;
    if (firstS != null) out.secs = firstS;
  }
  const firstW = rows.find((s) => s.weight != null)?.weight;
  if (firstW != null) out.weight = firstW;
  out.setList = rows.map((s) => { const o = {}; if (s.reps) o.reps = s.reps; if (s.secs != null) o.secs = s.secs; if (s.weight != null) o.weight = s.weight; return o; });
  return out;
}

/** "12/10/8" or "10" for reps across the sets ("" when none). */
export function repsSummary(list) {
  const r = (list || []).map((s) => str(s.reps));
  if (!r.some(Boolean)) return "";
  return r.every((x) => x === r[0]) ? r[0] : r.map((x) => x || "–").join("/");
}

/** "1 min" or "45 s–1 min" for times across the sets ("" when none). */
export function timeSummary(list) {
  const t = (list || []).map((s) => secsOf(s.secs)).filter((x) => x != null);
  if (!t.length) return "";
  const lo = Math.min(...t), hi = Math.max(...t);
  return lo === hi ? formatDuration(lo) : `${formatDuration(lo)}–${formatDuration(hi)}`;
}

/** "60" or "60–70" for weights across the sets ("" when none). */
export function weightSummary(list) {
  const w = (list || []).map((s) => num(s.weight)).filter((x) => x != null);
  if (!w.length) return "";
  const lo = Math.min(...w), hi = Math.max(...w);
  return lo === hi ? String(lo) : `${lo}–${hi}`;
}

/** "3 sets · 12/10/8 reps · 60–70 kg", or "3 sets · 1 min each" when timed. */
export function setsLine(list, unit, mode = "reps") {
  const n = (list || []).length;
  const bits = [`${n} ${n === 1 ? "set" : "sets"}`];
  if (mode === "time") { const t = timeSummary(list); if (t) bits.push(n > 1 ? `${t} each` : t); }
  else { const r = repsSummary(list); if (r) bits.push(`${r} reps`); }
  const w = weightSummary(list); if (w) bits.push(`${w} ${unit}`);
  return bits.join(" · ");
}
