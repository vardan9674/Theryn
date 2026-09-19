// Per-set targets in a plan. An exercise in the plan JSON can say
//   { name, sets: 3, reps: "10", weight: 60 }                 same for every set, or
//   { name, sets: 3, reps: "12/10/8", weight: 60,
//     setList: [{ reps: "12", weight: 60 }, { reps: "10", weight: 65 }, { reps: "8", weight: 70 }] }
// `sets`, `reps` and `weight` are always written too, so older readers (and the
// Excel export's columns) keep working; `setList` is only written when the sets
// differ. Pure; no React.

const str = (v) => (v == null ? "" : String(v).trim());
const num = (v) => { if (v == null || String(v).trim() === "") return null; const n = Number(v); return Number.isFinite(n) && n > 0 && n <= 2000 ? Math.round(n * 100) / 100 : null; };

/**
 * The sets of one plan exercise, one entry per set: { reps: "10" | "", weight: 60 | null }.
 * A bare name (legacy) or an exercise without numbers gives `fallbackCount` empty sets.
 */
export function planSets(ex, fallbackCount = 3) {
  if (!ex || typeof ex !== "object") return Array.from({ length: fallbackCount }, () => ({ reps: "", weight: null }));
  if (Array.isArray(ex.setList) && ex.setList.length) {
    return ex.setList.slice(0, 20).map((s) => ({ reps: str(s?.reps), weight: num(s?.weight) }));
  }
  const n = Math.min(20, Math.max(1, Number(ex.sets) || fallbackCount));
  return Array.from({ length: n }, () => ({ reps: str(ex.reps), weight: num(ex.weight) }));
}

/** True when every set asks for the same reps and weight. */
export function setsAreSame(list) {
  return (list || []).every((s) => str(s.reps) === str(list[0].reps) && num(s.weight) === num(list[0].weight));
}

/**
 * Sets → the fields stored on the exercise: sets, reps, weight, and setList
 * only when they differ. Blank sets are kept (they count as sets); blank
 * fields are left out.
 */
export function packSets(list) {
  const rows = (list || []).map((s) => ({ reps: str(s.reps), weight: num(s.weight) }));
  if (rows.length === 0) return {};
  const out = { sets: rows.length };
  const same = setsAreSame(rows);
  if (same) {
    if (rows[0].reps) out.reps = rows[0].reps;
    if (rows[0].weight != null) out.weight = rows[0].weight;
    return out;
  }
  const reps = rows.map((s) => s.reps || "–");
  if (rows.some((s) => s.reps)) out.reps = reps.every((r) => r === reps[0]) ? reps[0] : reps.join("/");
  const firstW = rows.find((s) => s.weight != null)?.weight;
  if (firstW != null) out.weight = firstW;
  out.setList = rows.map((s) => { const o = {}; if (s.reps) o.reps = s.reps; if (s.weight != null) o.weight = s.weight; return o; });
  return out;
}

/** "12/10/8" or "10" for reps across the sets ("" when none). */
export function repsSummary(list) {
  const r = (list || []).map((s) => str(s.reps));
  if (!r.some(Boolean)) return "";
  return r.every((x) => x === r[0]) ? r[0] : r.map((x) => x || "–").join("/");
}

/** "60" or "60–70" for weights across the sets ("" when none). */
export function weightSummary(list) {
  const w = (list || []).map((s) => num(s.weight)).filter((x) => x != null);
  if (!w.length) return "";
  const lo = Math.min(...w), hi = Math.max(...w);
  return lo === hi ? String(lo) : `${lo}–${hi}`;
}

/** "3 sets · 12/10/8 reps · 60–70 kg" for a closed card. */
export function setsLine(list, unit) {
  const n = (list || []).length;
  const bits = [`${n} ${n === 1 ? "set" : "sets"}`];
  const r = repsSummary(list); if (r) bits.push(`${r} reps`);
  const w = weightSummary(list); if (w) bits.push(`${w} ${unit}`);
  return bits.join(" · ");
}
