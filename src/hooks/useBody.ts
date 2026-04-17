import { supabase } from "../lib/supabase";

import { enqueueAction } from "../lib/offlineQueue";

// ── Body Weight ──────────────────────────────────────────────────────────────

export interface BodyWeightEntry {
  id: string;
  date: string;   // YYYY-MM-DD
  weight: number;
}

/** Fetches up to 90 body weight entries, newest first. */
export async function loadBodyWeights(userId: string): Promise<BodyWeightEntry[]> {
  const cacheKey = `theryn_weights_${userId}`;
  let cachedData = null;
  try {
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

    if (error || !data?.id) throw new Error(`Failed to save body weight: ${error?.message}`);
    return data.id;
  } catch (err: any) {
    if (!isBackgroundSync) {
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

export interface MeasurementEntry {
  id: string;
  date: string;    // YYYY-MM-DD
  chest?: number;
  waist?: number;
  hips?: number;
  lArm?: number;   // bicep_l
  rArm?: number;   // bicep_r
  lThigh?: number; // thigh_l
  rThigh?: number; // thigh_r
  calves?: number; // calf_l
}

export interface MeasurementInput {
  chest?: number | string;
  waist?: number | string;
  hips?: number | string;
  lArm?: number | string;
  rArm?: number | string;
  lThigh?: number | string;
  rThigh?: number | string;
  calves?: number | string;
}

/** Fetches up to 20 measurement entries, newest first. */
export async function loadMeasurements(userId: string): Promise<MeasurementEntry[]> {
  const cacheKey = `theryn_measurements_${userId}`;
  let cachedData = null;
  try {
    const t = localStorage.getItem(cacheKey);
    if (t) cachedData = JSON.parse(t);
  } catch {}

  const fetchNetwork = async () => {
    const { data, error } = await supabase
      .from("body_measurements")
      .select("id, logged_at, chest, waist, hips, bicep_l, bicep_r, thigh_l, thigh_r, calf_l")
      .eq("user_id", userId)
      .order("logged_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("loadMeasurements error:", error.message);
      return [];
    }

    const formatted = (data || []).map((row) => ({
      id: row.id,
      date: row.logged_at,
      chest: row.chest != null ? parseFloat(row.chest) : undefined,
      waist: row.waist != null ? parseFloat(row.waist) : undefined,
      hips: row.hips != null ? parseFloat(row.hips) : undefined,
      lArm: row.bicep_l != null ? parseFloat(row.bicep_l) : undefined,
      rArm: row.bicep_r != null ? parseFloat(row.bicep_r) : undefined,
      lThigh: row.thigh_l != null ? parseFloat(row.thigh_l) : undefined,
      rThigh: row.thigh_r != null ? parseFloat(row.thigh_r) : undefined,
      calves: row.calf_l != null ? parseFloat(row.calf_l) : undefined,
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

  if (!isBackgroundSync) {
    const cacheKey = `theryn_measurements_${userId}`;
    try {
      const existingText = localStorage.getItem(cacheKey);
      let arr = existingText ? JSON.parse(existingText) : [];
      arr = arr.filter((m: any) => m.date !== date);
      const newEntry = {
        id: `offline-${Date.now()}`,
        date,
        chest: toNum(data.chest) ?? undefined,
        waist: toNum(data.waist) ?? undefined,
        hips: toNum(data.hips) ?? undefined,
        lArm: toNum(data.lArm) ?? undefined,
        rArm: toNum(data.rArm) ?? undefined,
        lThigh: toNum(data.lThigh) ?? undefined,
        rThigh: toNum(data.rThigh) ?? undefined,
        calves: toNum(data.calves) ?? undefined,
      };
      arr.unshift(newEntry);
      localStorage.setItem(cacheKey, JSON.stringify(arr.slice(0, 20)));
    } catch {}
  }

  try {
    const { data: row, error } = await supabase
      .from("body_measurements")
      .insert({
        user_id: userId,
        logged_at: date,
        chest: toNum(data.chest),
        waist: toNum(data.waist),
        hips: toNum(data.hips),
        bicep_l: toNum(data.lArm),
        bicep_r: toNum(data.rArm),
        thigh_l: toNum(data.lThigh),
        thigh_r: toNum(data.rThigh),
        calf_l: toNum(data.calves),
      })
      .select("id")
      .single();

    if (error || !row?.id) throw new Error(`Failed to save measurement: ${error?.message}`);
    return row.id;
  } catch (err: any) {
    if (!isBackgroundSync) {
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
