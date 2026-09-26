import { DEFAULT_EQUIPMENT } from "./exerciseLibrary.js";

/**
 * Library exercises that can stand in for `entry`: same main muscle and type, equipment the
 * person has. Closest first: same kind of movement (compound/isolation), shared helper
 * muscles, common exercises, and, when the reason is "equipment", different equipment first.
 * @returns {Array<object>} library entries
 */
export function suggestAlternatives(lib, entry, { equipment = DEFAULT_EQUIPMENT, limit = 5, exclude = [], reason = "" } = {}) {
  if (!Array.isArray(lib) || !entry) return [];
  const skip = new Set([entry.name, ...exclude].map((n) => String(n).toLowerCase()));
  const score = (e) => {
    let s = 0;
    if (e.mechanic && e.mechanic === entry.mechanic) s -= 30;
    s -= 8 * e.helperGroups.filter((g) => entry.helperGroups.includes(g)).length;
    if (reason === "equipment" && e.equipment === entry.equipment) s += 40;
    s += Math.min(e.rank, 60);
    return s;
  };
  return lib
    .filter((e) => e.group === entry.group && e.type === entry.type && equipment.includes(e.equipment) && !skip.has(e.name.toLowerCase()))
    .map((e) => ({ e, s: score(e) }))
    .sort((a, b) => a.s - b.s || a.e.name.localeCompare(b.e.name))
    .slice(0, limit)
    .map((x) => x.e);
}
