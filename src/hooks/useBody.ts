import { supabase } from "../lib/supabase";

// ── Body Weight ──────────────────────────────────────────────────────────────

export interface BodyWeightEntry {
  id: string;
  date: string;   // YYYY-MM-DD
  weight: number;
}

/** Fetches up to 90 body weight entries, newest first. */
export async function loadBodyWeights(userId: string): Promise<BodyWeightEntry[]> {
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

  return (data || []).map((row) => ({
    id: row.id,
    date: row.logged_at,
    weight: parseFloat(row.weight),
  }));
}

/**
 * Upserts a body weight entry for the given date.
 * Returns the row id.
 */
export async function saveBodyWeight(
  userId: string,
  weight: number,
  date: string
): Promise<string> {
  const { data, error } = await supabase
    .from("body_weights")
    .upsert(
      { user_id: userId, weight, logged_at: date },
      { onConflict: "user_id,logged_at" }
    )
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`Failed to save body weight: ${error?.message}`);
  }

  return data.id;
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

  return (data || []).map((row) => ({
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
}

/** Inserts a new measurement entry. Returns the row id. */
export async function saveMeasurement(
  userId: string,
  data: MeasurementInput,
  date: string
): Promise<string> {
  const toNum = (v: number | string | undefined) => {
    if (v === undefined || v === "") return null;
    const n = typeof v === "string" ? parseFloat(v) : v;
    return isNaN(n) ? null : n;
  };

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

  if (error || !row?.id) {
    throw new Error(`Failed to save measurement: ${error?.message}`);
  }

  return row.id;
}

/** Deletes a measurement entry by id. */
export async function deleteMeasurement(id: string): Promise<void> {
  const { error } = await supabase.from("body_measurements").delete().eq("id", id);
  if (error) {
    throw new Error(`Failed to delete measurement: ${error.message}`);
  }
}
