import { DEFAULT_EQUIPMENT, EQUIPMENT_LABEL } from "./exerciseLibrary.js";

// The equipment a person can use. Saved on the device now; also written to
// profiles.equipment once migration 20260926193424_exercise_alternatives_and_equipment.sql
// is applied (until then the profile write is skipped and the device copy is used).

const KEY = "theryn_equipment_v1";
const EVENT = "theryn:equipment";

export const EQUIPMENT_PRESETS = [
  { id: "gym", label: "Full gym", equipment: ["barbell", "dumbbell", "cable", "machine", "body", "ez", "kettlebell", "band", "other"] },
  { id: "home", label: "Home", equipment: ["dumbbell", "body", "band"] },
  { id: "travel", label: "Travel", equipment: ["body", "band"] },
];

/** Which preset a list matches, or "custom". */
export function presetFor(list) {
  const set = [...list].sort().join(",");
  const hit = EQUIPMENT_PRESETS.find((p) => [...p.equipment].sort().join(",") === set);
  return hit ? hit.id : "custom";
}

/** Keeps only known equipment ids, in a stable order; bodyweight is always included. */
export function cleanEquipment(list) {
  const known = Object.keys(EQUIPMENT_LABEL);
  const set = new Set((Array.isArray(list) ? list : []).filter((x) => known.includes(x)));
  set.add("body");
  return known.filter((k) => set.has(k));
}

/** { equipment, saved } — saved is false until the person has chosen once. */
export function readEquipment(storage = globalThis.localStorage) {
  try {
    const v = JSON.parse(storage?.getItem(KEY) || "null");
    if (v && Array.isArray(v.equipment)) return { equipment: cleanEquipment(v.equipment), saved: true };
  } catch { /* storage blocked or bad value */ }
  return { equipment: DEFAULT_EQUIPMENT, saved: false };
}

/** Saves on the device, tells open screens, and tries the profile. Resolves to "profile" or "device". */
export async function saveEquipment(list, { supabase, userId, storage = globalThis.localStorage } = {}) {
  const equipment = cleanEquipment(list);
  try { storage?.setItem(KEY, JSON.stringify({ equipment, at: new Date().toISOString() })); } catch { /* ignore */ }
  try { globalThis.dispatchEvent?.(new CustomEvent(EVENT, { detail: equipment })); } catch { /* non-browser */ }
  if (!supabase || !userId) return "device";
  const { error } = await supabase.from("profiles").update({ equipment }).eq("id", userId);
  if (!error) return "profile";
  // Column not there yet (migration not applied): the device copy is the source for now.
  if (["42703", "PGRST204"].includes(error.code)) return "device";
  throw new Error("Saved on this phone, but couldn't sync to your account. It will try again next time you save.");
}

export const EQUIPMENT_EVENT = EVENT;
