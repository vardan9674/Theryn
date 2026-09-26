// A plan exercise's targets ↔ the routine_exercises columns (#129).
//
// The plan editor gives an exercise a weight, a list of per-set targets, a
// timed mode, a superset letter and a rest. A client who uses the app keeps
// their plan as rows, which only had sets, reps and a note, so everything else
// was dropped on save. Migration 20260926190000 added four columns, the same
// ones saved plans use (see manualTemplates.js):
//   target_weight  number, the weight when every set is the same (or set 1's)
//   set_list       [{ reps, weight, secs, kind }] when the sets differ
//   weight_unit    "kg" | "lb", the unit the weights were typed in
//   extra          { mode: "time", secs, superset, rest }
// Pure; no Supabase.

export type Units = "metric" | "imperial";

export interface TargetColumns {
  target_weight: number | null;
  set_list: Array<Record<string, unknown>> | null;
  weight_unit: "kg" | "lb" | null;
  extra: Record<string, unknown> | null;
}

const KINDS = ["warmup", "drop", "amrap"];
const posNum = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

function cleanSet(s: any): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  if (KINDS.includes(s?.kind)) o.kind = s.kind;
  if (s?.reps != null && String(s.reps).trim() !== "") o.reps = String(s.reps).trim().slice(0, 20);
  const secs = posNum(s?.secs);
  if (secs != null) o.secs = Math.round(secs);
  const w = posNum(s?.weight);
  if (w != null) o.weight = w;
  return o;
}

/** An exercise from a plan (string or object) → the four columns. Units are the day's ("metric" / "imperial"). */
export function targetColumns(item: unknown, units?: string | null): TargetColumns {
  const out: TargetColumns = { target_weight: null, set_list: null, weight_unit: null, extra: null };
  if (!item || typeof item !== "object") return out;
  const o = item as any;
  out.target_weight = posNum(o.weight);
  if (Array.isArray(o.setList) && o.setList.length) out.set_list = o.setList.slice(0, 20).map(cleanSet);
  const hasWeight = out.target_weight != null || (out.set_list || []).some((s) => s.weight != null);
  if (hasWeight) out.weight_unit = units === "metric" ? "kg" : units === "imperial" ? "lb" : null;
  const extra: Record<string, unknown> = {};
  if (o.mode === "time") {
    extra.mode = "time";
    const secs = posNum(o.secs);
    if (secs != null) extra.secs = Math.round(secs);
  }
  if (typeof o.superset === "string" && o.superset.trim()) extra.superset = o.superset.trim().slice(0, 4);
  const rest = posNum(o.rest);
  if (rest != null) extra.rest = Math.round(rest);
  if (Object.keys(extra).length) out.extra = extra;
  return out;
}

/** The columns of one routine_exercises row → the fields to put back on the plan exercise (only the ones set). */
export function targetsFromRow(row: any): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  const w = posNum(row?.target_weight);
  if (w != null) o.weight = w;
  if (Array.isArray(row?.set_list) && row.set_list.length) o.setList = row.set_list.map(cleanSet);
  const extra = row?.extra && typeof row.extra === "object" ? row.extra : null;
  if (extra?.mode === "time") {
    o.mode = "time";
    const secs = posNum(extra.secs);
    if (secs != null) o.secs = Math.round(secs);
  }
  if (typeof extra?.superset === "string" && extra.superset) o.superset = extra.superset;
  const rest = posNum(extra?.rest);
  if (rest != null) o.rest = Math.round(rest);
  return o;
}

/** The unit a day's weights were typed in, from its rows' weight_unit ("kg" → "metric"). */
export function unitsFromRows(rows: any[]): Units | null {
  const u = (rows || []).map((r) => r?.weight_unit).find((x) => x === "kg" || x === "lb");
  return u === "kg" ? "metric" : u === "lb" ? "imperial" : null;
}
