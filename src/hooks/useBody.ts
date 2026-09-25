import { supabase } from "../lib/supabase";

import { enqueueAction, shouldQueueForLater } from "../lib/offlineQueue";
import { registerActionHandler } from "../lib/actionRegistry";

// Keep the database's error code so a refusal is told apart from being offline (#109).
const saveError = (what: string, error: any) =>
  Object.assign(new Error(`Failed to save ${what}: ${error?.message}`), { code: error?.code, status: error?.status });

// ── Body Weight ──────────────────────────────────────────────────────────────

export interface BodyWeightEntry {
  id: string;
  date: string;   // YYYY-MM-DD
  weight: number;
}

/** Fetches up to 90 body weight entries, newest first. `fresh` skips the local cache (coach reads). */
export async function loadBodyWeights(userId: string, opts: { fresh?: boolean } = {}): Promise<BodyWeightEntry[]> {
  const cacheKey = `theryn_weights_${userId}`;
  let cachedData = null;
  if (!opts.fresh) try {
    const t = localStorage.getItem(cacheKey);
    if (t) cachedData = JSON.parse(t);
  } catch {}

  const fetchNetwork = async () => {
    const { data, error } = await supabase
      .from("body_weights")
      .select("id, logged_at, weight")
      .eq("user_id", userId)
      .order("logged_at", { ascending: false })
      .limit(90);

    if (error) {
      console.error("loadBodyWeights error:", error.message);
      return [];
    }

    const formatted = (data || []).map((row) => ({
      id: row.id,
      date: row.logged_at,
      weight: parseFloat(row.weight),
    }));

    if (formatted.length > 0) localStorage.setItem(cacheKey, JSON.stringify(formatted));
    return formatted;
  };

  if (cachedData && cachedData.length > 0) {
    if (typeof window !== "undefined" && navigator.onLine) fetchNetwork().catch(()=>{});
    return cachedData;
  }
  return fetchNetwork();
}

/**
 * Upserts a body weight entry for the given date.
 * Returns the row id.
 */
export async function saveBodyWeight(
  userId: string,
  weight: number,
  date: string,
  isBackgroundSync = false
): Promise<string> {
  if (!isBackgroundSync) {
    const cacheKey = `theryn_weights_${userId}`;
    try {
      const existingText = localStorage.getItem(cacheKey);
      let arr = existingText ? JSON.parse(existingText) : [];
      arr = arr.filter((w: any) => w.date !== date);
      arr.unshift({ id: `offline-${Date.now()}`, date, weight });
      localStorage.setItem(cacheKey, JSON.stringify(arr.slice(0, 90)));
    } catch {}
  }

  try {
    const { data, error } = await supabase
      .from("body_weights")
      .upsert(
        { user_id: userId, weight, logged_at: date },
        { onConflict: "user_id,logged_at" }
      )
      .select("id")
      .single();

    if (error || !data?.id) throw saveError("body weight", error);
    return data.id;
  } catch (err: any) {
    if (!isBackgroundSync && shouldQueueForLater(err)) {
      enqueueAction({ type: "SAVE_WEIGHT", userId, payload: { weight, date } });
      return "offline_saved";
    }
    throw err;
  }
}

/** Deletes a body weight entry by id. */
export async function deleteBodyWeight(id: string): Promise<void> {
  const { error } = await supabase.from("body_weights").delete().eq("id", id);
  if (error) {
    throw new Error(`Failed to delete body weight: ${error.message}`);
  }
}

// ── Body Measurements ────────────────────────────────────────────────────────

// Which body_measurements column each field lands in (#110). The athlete's
// Body screen names fields "l_arm", "r_calf", "neck" (toKey of the label);
// the coach dashboard uses "lArm", "rCalf". Both spellings are accepted on the
// way in and both are given back on the way out. Before this, only chest,
// waist, hips and calves were ever saved: "l_arm" never matched "lArm".
const COLUMN_OF: Record<string, string> = {
  chest: "chest", waist: "waist", hips: "hips", neck: "neck", shoulders: "shoulders",
  lArm: "bicep_l", l_arm: "bicep_l", rArm: "bicep_r", r_arm: "bicep_r",
  lThigh: "thigh_l", l_thigh: "thigh_l", rThigh: "thigh_r", r_thigh: "thigh_r",
  calves: "calf_l", lCalf: "calf_l", l_calf: "calf_l", rCalf: "calf_r", r_calf: "calf_r",
  forearm: "forearm_l", lForearm: "forearm_l", l_forearm: "forearm_l", rForearm: "forearm_r", r_forearm: "forearm_r",
};
// Column → every key a screen may read it by.
const KEYS_OF: Record<string, string[]> = {
  chest: ["chest"], waist: ["waist"], hips: ["hips"], neck: ["neck"], shoulders: ["shoulders"],
  bicep_l: ["lArm", "l_arm"], bicep_r: ["rArm", "r_arm"], thigh_l: ["lThigh", "l_thigh"], thigh_r: ["rThigh", "r_thigh"],
  calf_l: ["calves", "lCalf", "l_calf"], calf_r: ["rCalf", "r_calf"], forearm_l: ["forearm", "lForearm", "l_forearm"], forearm_r: ["rForearm", "r_forearm"],
};
const MEASURE_COLUMNS = Object.keys(KEYS_OF);

/** A field key the database has a column for. */
export function hasMeasurementColumn(key: string): boolean { return key in COLUMN_OF; }

export interface MeasurementEntry {
  id: string;
  date: string;    // YYYY-MM-DD
  [key: string]: number | string | undefined;
}

export type MeasurementInput = Record<string, number | string | undefined>;

function rowToEntry(row: any): MeasurementEntry {
  const out: MeasurementEntry = { id: row.id, date: row.logged_at };
  for (const col of MEASURE_COLUMNS) {
    if (row[col] == null) continue;
    const v = parseFloat(row[col]);
    for (const k of KEYS_OF[col]) out[k] = v;
  }
  return out;
}

/** Fetches up to 20 measurement entries, newest first. `fresh` skips the local cache (coach reads). */
export async function loadMeasurements(userId: string, opts: { fresh?: boolean } = {}): Promise<MeasurementEntry[]> {
  const cacheKey = `theryn_measurements_${userId}`;
  let cachedData = null;
  if (!opts.fresh) try {
    const t = localStorage.getItem(cacheKey);
    if (t) cachedData = JSON.parse(t);
  } catch {}

  const fetchNetwork = async () => {
    const { data, error } = await supabase
      .from("body_measurements")
      .select("id, logged_at, chest, waist, hips, neck, shoulders, bicep_l, bicep_r, thigh_l, thigh_r, calf_l, calf_r, forearm_l, forearm_r")
      .eq("user_id", userId)
      .order("logged_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("loadMeasurements error:", error.message);
      return [];
    }

    const formatted = (data || []).map(rowToEntry);

    if (formatted.length > 0) localStorage.setItem(cacheKey, JSON.stringify(formatted));
    return formatted;
  };

  if (cachedData && cachedData.length > 0) {
    if (typeof window !== "undefined" && navigator.onLine) fetchNetwork().catch(()=>{});
    return cachedData;
  }
  return fetchNetwork();
}

/** Inserts a new measurement entry. Returns the row id. */
export async function saveMeasurement(
  userId: string,
  data: MeasurementInput,
  date: string,
  isBackgroundSync = false
): Promise<string> {
  const toNum = (v: number | string | undefined) => {
    if (v === undefined || v === "") return null;
    const n = typeof v === "string" ? parseFloat(v) : v;
    return isNaN(n) ? null : n;
  };
  // Every known field → its column; unknown custom fields stay on the phone.
  const columnsFrom = (input: MeasurementInput) => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(input || {})) {
      const col = COLUMN_OF[k]; const n = toNum(v as any);
      if (col && n != null) out[col] = n;
    }
    return out;
  };

  if (!isBackgroundSync) {
    const cacheKey = `theryn_measurements_${userId}`;
    try {
      const existingText = localStorage.getItem(cacheKey);
      let arr = existingText ? JSON.parse(existingText) : [];
      arr = arr.filter((m: any) => m.date !== date);
      const newEntry = rowToEntry({ id: `offline-${Date.now()}`, logged_at: date, ...columnsFrom(data) });
      arr.unshift(newEntry);
      localStorage.setItem(cacheKey, JSON.stringify(arr.slice(0, 20)));
    } catch {}
  }

  try {
    const { data: row, error } = await supabase
      .from("body_measurements")
      .insert({ user_id: userId, logged_at: date, ...columnsFrom(data) })
      .select("id")
      .single();

    if (error || !row?.id) throw saveError("measurement", error);
    return row.id;
  } catch (err: any) {
    if (!isBackgroundSync && shouldQueueForLater(err)) {
      enqueueAction({ type: "SAVE_MEASUREMENT", userId, payload: { data, date } });
      return "offline_saved";
    }
    throw err;
  }
}

/** Deletes a measurement entry by id. */
export async function deleteMeasurement(id: string): Promise<void> {
  const { error } = await supabase.from("body_measurements").delete().eq("id", id);
  if (error) {
    throw new Error(`Failed to delete measurement: ${error.message}`);
  }
}

// Register offline-flush handlers for body writes. Called once on import.
registerActionHandler("SAVE_WEIGHT", (userId, payload) => {
  const p = payload as { weight: number; date: string };
  return saveBodyWeight(userId, p.weight, p.date, true);
});
registerActionHandler("SAVE_MEASUREMENT", (userId, payload) => {
  const p = payload as { data: any; date: string };
  return saveMeasurement(userId, p.data, p.date, true);
});
