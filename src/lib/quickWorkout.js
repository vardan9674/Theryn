import { DEFAULT_EQUIPMENT } from "./exerciseLibrary.js";

export const FOCUS_PRESETS = [
  { id: "upper", label: "Upper", groups: ["chest", "upperback", "shoulders", "biceps", "triceps"] },
  { id: "lower", label: "Lower", groups: ["quads", "hamstrings", "glutes", "calves"] },
  { id: "push", label: "Push", groups: ["chest", "shoulders", "triceps"] },
  { id: "pull", label: "Pull", groups: ["upperback", "biceps", "traps"] },
  { id: "core", label: "Core", groups: ["abs", "lowerback"] },
  { id: "full", label: "Full body", groups: ["quads", "chest", "upperback", "hamstrings", "shoulders", "abs"] },
];

export const DURATIONS = [20, 30, 45, 60];
const COUNT = { 20: 4, 30: 5, 45: 6, 60: 8 };

function prescription(e) {
  if (e.group === "abs") return { sets: 3, reps: "12-15" };
  if (e.mechanic === "compound") return { sets: 3, reps: "8-10" };
  return { sets: 3, reps: "10-12" };
}

/**
 * Builds a short workout: takes turns across the chosen muscles, prefers exercises the person
 * has done before, then common ones, compound before isolation. `shuffle` picks other good
 * options for the same muscles. Returns [{ name, group, equipment, sets, reps, entryId }].
 */
export function buildQuickWorkout(lib, { groups = [], minutes = 30, equipment = DEFAULT_EQUIPMENT, history = [], shuffle = 0 } = {}) {
  if (!Array.isArray(lib) || !groups.length) return [];
  const count = COUNT[minutes] || Math.max(3, Math.round(minutes / 6));
  const done = new Set();
  for (const w of history || []) for (const ex of w?.exercises || []) done.add(String(ex?.name || "").toLowerCase());
  const pools = groups.map((g) => lib
    .filter((e) => e.group === g && e.type === "strength" && equipment.includes(e.equipment))
    .map((e) => ({ e, s: (done.has(e.name.toLowerCase()) || done.has(e.sourceName.toLowerCase()) ? 0 : 100) + Math.min(e.rank, 60) + (e.mechanic === "compound" ? 0 : 5) }))
    .sort((a, b) => a.s - b.s || a.e.name.localeCompare(b.e.name))
    .map((x) => x.e));
  const out = [];
  const used = new Set();
  const cursor = pools.map((p, i) => (p.length ? (shuffle + i) % Math.min(3, p.length) : 0));
  for (let round = 0; out.length < count && round < count * 3; round++) {
    const gi = round % pools.length;
    const pool = pools[gi];
    while (cursor[gi] < pool.length && used.has(pool[cursor[gi]].name)) cursor[gi]++;
    const e = pool[cursor[gi]];
    if (!e) continue;
    used.add(e.name);
    cursor[gi]++;
    out.push({ name: e.name, group: e.group, equipment: e.equipment, entryId: e.id, ...prescription(e) });
  }
  return out;
}
