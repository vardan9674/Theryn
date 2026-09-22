// Per-set targets in a plan. An exercise in the plan JSON can say
//   { name, sets: 3, reps: "10", weight: 60 }                 same for every set, or
//   { name, sets: 3, reps: "12/10/8", weight: 60,
//     setList: [{ reps: "12", weight: 60 }, { reps: "10", weight: 65 }, { reps: "8", weight: 70 }] }
// A timed exercise says mode "time" and seconds instead of reps:
//   { name, mode: "time", sets: 3, secs: 60 }  or  setList: [{ secs: 45 }, { secs: 60 }]
// `sets`, `reps` and `weight` are always written too, so older readers (and the
// Excel export's columns) keep working; `setList` is only written when the sets
// differ. Pure; no React.
import { formatDuration, setKindsSummary } from "./exerciseKinds.js";

const str = (v) => (v == null ? "" : String(v).trim());
const num = (v) => { if (v == null || String(v).trim() === "") return null; const n = Number(v); return Number.isFinite(n) && n > 0 && n <= 2000 ? Math.round(n * 100) / 100 : null; };
const KINDS = ["warmup", "drop", "amrap"];
const kindOf = (s) => (KINDS.includes(s?.kind) ? s.kind : null);
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
  // Warm-up, drop and AMRAP sets carry a kind; plain sets don't.
  const withKind = (o, k) => (KINDS.includes(k) ? { ...o, kind: k } : o);
  if (Array.isArray(ex.setList) && ex.setList.length) {
    return ex.setList.slice(0, 20).map((s) => withKind(withSecs({ reps: str(s?.reps), weight: num(s?.weight) }, s?.secs ?? ex.secs), s?.kind));
  }
  const n = Math.min(20, Math.max(1, Number(ex.sets) || fallbackCount));
  return Array.from({ length: n }, () => withSecs({ reps: str(ex.reps), weight: num(ex.weight) }, ex.secs));
}

/** True when every set asks for the same reps, weight and time, and none is a warm-up, drop or AMRAP set. */
export function setsAreSame(list) {
  return (list || []).every((s) => !kindOf(s) && str(s.reps) === str(list[0].reps) && num(s.weight) === num(list[0].weight) && secsOf(s.secs) === secsOf(list[0].secs));
}

/**
 * Sets → the fields stored on the exercise: sets, reps (or secs for a timed
 * exercise), weight, and setList only when they differ. Blank sets are kept
 * (they count as sets); blank fields are left out.
 */
export function packSets(list, mode = "reps") {
  const timed = mode === "time";
  const rows = (list || []).map((s) => ({ reps: timed || kindOf(s) === "amrap" ? "" : str(s.reps), weight: num(s.weight), secs: timed ? secsOf(s.secs) : null, kind: kindOf(s) }));
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
    // The reps summary is about the working sets; warm-ups and AMRAP read "–"/"max".
    const reps = rows.map((s) => (s.kind === "amrap" ? "max" : s.reps || "–"));
    if (rows.some((s) => s.reps || s.kind === "amrap")) out.reps = reps.every((r) => r === reps[0]) ? reps[0] : reps.join("/");
  } else {
    const firstS = rows.find((s) => s.secs != null)?.secs;
    if (firstS != null) out.secs = firstS;
  }
  const firstW = rows.find((s) => s.weight != null)?.weight;
  if (firstW != null) out.weight = firstW;
  out.setList = rows.map((s) => { const o = {}; if (s.kind) o.kind = s.kind; if (s.reps) o.reps = s.reps; if (s.secs != null) o.secs = s.secs; if (s.weight != null) o.weight = s.weight; return o; });
  return out;
}

/** "12/10/8" or "10" for reps across the sets ("" when none). Warm-ups are left out; AMRAP reads "max". */
export function repsSummary(list) {
  // Working sets only: warm-ups and drop sets are summed up separately ("1 warm-up · drop set").
  const r = (list || []).filter((s) => kindOf(s) !== "warmup" && kindOf(s) !== "drop").map((s) => (kindOf(s) === "amrap" ? "max" : str(s.reps)));
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

/** "3 sets · 12/10/8 reps · 60–70 kg · drop set", or "3 sets · 1 min each" when timed. */
export function setsLine(list, unit, mode = "reps") {
  const all = list || [];
  const working = all.filter((s) => !kindOf(s) || kindOf(s) === "amrap").length;
  const n = working || all.length;
  const bits = [`${n} ${n === 1 ? "set" : "sets"}`];
  if (mode === "time") { const t = timeSummary(list); if (t) bits.push(n > 1 ? `${t} each` : t); }
  else { const r = repsSummary(list); if (r) bits.push(`${r} reps`); }
  const w = weightSummary(all.filter((s) => kindOf(s) !== "warmup")); if (w) bits.push(`${w} ${unit}`);
  const extra = setKindsSummary(all); if (extra) bits.push(extra);
  return bits.join(" · ");
}
