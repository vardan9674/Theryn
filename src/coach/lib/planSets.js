// Per-set targets in a plan. An exercise in the plan JSON can say
//   { name, sets: 3, reps: "10", weight: 60 }                 same for every set, or
//   { name, sets: 3, reps: "12/10/8", weight: 60,
//     setList: [{ reps: "12", weight: 60 }, { reps: "10", weight: 65 }, { reps: "8", weight: 70 }] }
// A timed exercise says mode "time" and seconds instead of reps:
//   { name, mode: "time", sets: 3, secs: 60 }  or  setList: [{ secs: 45 }, { secs: 60 }]
// `sets`, `reps` and `weight` are always written too, so older readers (and the
// Excel export's columns) keep working; `setList` is only written when the sets
// differ. Pure; no React.
import { formatDuration, parseDuration, setKindsSummary } from "./exerciseKinds.js";

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

// ── Typing and checking the numbers (#133) ─────────────────────────────────
// Anything `num` would throw away is caught before saving, with a message,
// instead of vanishing while the toast says "Saved".
export const PLAN_WEIGHT_MAX = 2000;
const MAX_SECS = 6 * 3600;

/**
 * A reps box as the coach types: digits, then either one range dash ("8-12",
 * "8–12") or slashes ("12/10/8"). No leading dash, so "-5" can't be typed.
 */
export function cleanRepsInput(raw) {
  let s = String(raw ?? "").replace(/[^0-9\-–/]/g, "").replace(/^[-–/]+/, "");
  const sep = (s.match(/[-–/]/) || [])[0];
  if (sep) {
    const i = s.indexOf(sep);
    const rest = s.slice(i + 1);
    // A range has one dash; a list only slashes (no "8--12" or "12/10-8").
    s = (s.slice(0, i + 1) + (sep === "/" ? rest.replace(/[-–]/g, "") : rest.replace(/[-–/]/g, ""))).replace(/\/{2,}/g, "/");
  }
  return s.slice(0, 7);
}

/** A weight box: digits and one decimal point ("7..5" → "7.5", "-5" → "5"). */
export function cleanWeightInput(raw, max = 6) {
  const s = String(raw ?? "").replace(/[^0-9.]/g, "");
  const dot = s.indexOf(".");
  return (dot < 0 ? s : s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "")).slice(0, max);
}

/** Is this a reps target the plan can keep? "", "10", "8-12", "8–12" or "12/10/8". */
export function repsTargetOk(reps) {
  const s = String(reps ?? "").trim();
  if (!s) return true;
  if (/^\d+$/.test(s)) return Number(s) > 0;
  const m = s.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (m) return Number(m[1]) > 0 && Number(m[1]) <= Number(m[2]);
  if (/^\d+(\/\d+)+$/.test(s)) return s.split("/").every((x) => Number(x) > 0);
  return false;
}

/**
 * The first number in the editor's week that saving would lose or garble, or
 * null. `days` is the editor's { Mon: { type, exercises: [{ name, mode, rows }] } }
 * with rows as typed ({ reps, weight, secs, kind }). Returns
 * { day, index, set, message }: the day key, the exercise's place in that day,
 * the set's row index, and a sentence for the toast.
 */
export function planNumbersProblem(days, unit = "kg", dayOrder = Object.keys(days || {}), dayNames = {}) {
  for (const d of dayOrder) {
    const day = days?.[d];
    if (!day || day.type === "Rest") continue;
    const exercises = day.exercises || [];
    for (let index = 0; index < exercises.length; index++) {
      const ex = exercises[index];
      const timed = ex.mode === "time";
      let working = 0;
      const rows = ex.rows || [];
      for (let set = 0; set < rows.length; set++) {
        const r = rows[set] || {};
        const kind = kindOf(r);
        // Name the set the way the editor labels it: 1, 2, 3, W for a warm-up, D for a drop set.
        const label = kind === "warmup" ? "warm-up set" : kind === "drop" ? "drop set" : `set ${++working}`;
        const where = `${dayNames[d] || d} · ${String(ex.name || "").trim() || "Unnamed exercise"}, ${label}`;
        const problem = (message) => ({ day: d, index, set, message: `${where}: ${message}` });
        if (timed) {
          const typed = String(r.secs ?? "").trim();
          const secs = typed ? typedSecs(typed) : null;
          if (typed && (secs == null || secs <= 0 || secs > MAX_SECS)) return problem("time should be between 1 second and 6 hours.");
        } else if (kind !== "amrap" && !repsTargetOk(r.reps)) {
          return problem("reps should be a whole number like 10, or a range like 8-12.");
        }
        const w = String(r.weight ?? "").trim();
        if (w) {
          const n = Number(w);
          if (!Number.isFinite(n) || n <= 0 || n > PLAN_WEIGHT_MAX) return problem(`weight should be between 0 and ${PLAN_WEIGHT_MAX} ${unit}.`);
        }
      }
    }
  }
  return null;
}
// The editor keeps times as typed ("00:45", "1:30", "45"). parseDuration clamps
// anything past 6 hours to 6 hours, so clock-style and plain seconds are read raw here.
function typedSecs(typed) {
  if (/^\d+(:\d+){0,2}$/.test(typed)) return typed.split(":").reduce((a, x) => a * 60 + Number(x), 0);
  return parseDuration(typed);
}

/**
 * Reps a done set counts for, from a plan target: "10" → 10, the low end of
 * "8-12" → 8 (older plans: "12/10/8" → 12). Anything that doesn't start with
 * a number ("-5", "max", "–") → null, so it adds no volume and no record.
 */
export function plannedRepsNumber(reps) {
  const m = String(reps ?? "").trim().match(/^(\d+)/);
  return m && Number(m[1]) > 0 ? Number(m[1]) : null;
}

/**
 * What the coach planned for set `i` (0-based) of a sent exercise (a workout
 * payload's exercise): { r, w, s } with r the reps target as written, w the
 * weight and s the seconds, null when not planned. When the sets differ the
 * payload carries plan_sets, and a set without its own weight had none: the
 * exercise-level weight_target is only a summary of the first weighted set,
 * so it is not lent to the others (#134).
 */
export function plannedSet(e, i) {
  const ps = Array.isArray(e?.plan_sets) && e.plan_sets.length ? e.plan_sets : null;
  const pos = (v) => { const n = Number(v); return v != null && v !== "" && Number.isFinite(n) && n > 0 ? n : null; };
  if (ps) {
    const p = ps[i] || {};
    // A timed set without its own time runs for the exercise's, as planSets reads it.
    return { r: p.r != null && p.r !== "" ? String(p.r) : null, w: pos(p.w), s: pos(p.s) ?? pos(e.secs_target), k: p.k || null };
  }
  return { r: e?.reps != null && e.reps !== "" ? String(e.reps) : null, w: pos(e?.weight_target), s: pos(e?.secs_target), k: null };
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
