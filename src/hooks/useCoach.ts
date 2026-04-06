import { supabase } from "../lib/supabase";
import { loadRoutine } from "./useRoutine";
import { loadWorkoutHistory } from "./useWorkouts";

// ── Types ────────────────────────────────────────────────────────────────────
export interface CoachLink {
  id: string;
  coach_id: string;
  athlete_id: string;
  status: "pending" | "accepted" | "declined";
  created_at: string;
  // joined display fields
  coach_name?: string;
  athlete_name?: string;
  coach_code?: string;
  athlete_code?: string;
}

// ── Generate a random 6-char uppercase invite code ───────────────────────────
function randomCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ── Ensure the user has an invite code in profiles ───────────────────────────
export async function ensureInviteCode(userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("profiles")
    .select("invite_code")
    .eq("id", userId)
    .single();

  if (error) throw new Error(error.message);

  if (data?.invite_code) return data.invite_code;

  // Generate one and save it
  const code = randomCode();
  const { error: upErr } = await supabase
    .from("profiles")
    .update({ invite_code: code })
    .eq("id", userId);

  if (upErr) throw new Error(upErr.message);
  return code;
}

// ── Look up a profile by invite code ─────────────────────────────────────────
export async function findProfileByCode(
  code: string
): Promise<{ id: string; display_name: string } | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("invite_code", code.trim().toUpperCase())
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ?? null;
}

// ── Send a coach request (coach enters athlete's code) ────────────────────────
export async function sendCoachRequest(
  coachId: string,
  athleteId: string
): Promise<void> {
  const { error } = await supabase.from("coach_athletes").insert({
    coach_id: coachId,
    athlete_id: athleteId,
    status: "pending",
  });
  if (error) throw new Error(error.message);
}

// ── Load all links for the current user (as coach OR athlete) ─────────────────
export async function loadCoachLinks(userId: string): Promise<CoachLink[]> {
  const { data, error } = await supabase
    .from("coach_athletes")
    .select("id, coach_id, athlete_id, status, created_at")
    .or(`coach_id.eq.${userId},athlete_id.eq.${userId}`)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return [];

  // Collect all unique profile IDs to fetch names in one query
  const ids = [...new Set(data.flatMap((r) => [r.coach_id, r.athlete_id]))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, invite_code")
    .in("id", ids);

  const profileMap: Record<string, { display_name: string; invite_code: string }> = {};
  for (const p of profiles || []) profileMap[p.id] = p;

  return data.map((r) => ({
    ...r,
    coach_name: profileMap[r.coach_id]?.display_name ?? "Unknown",
    athlete_name: profileMap[r.athlete_id]?.display_name ?? "Unknown",
    coach_code: profileMap[r.coach_id]?.invite_code ?? "",
    athlete_code: profileMap[r.athlete_id]?.invite_code ?? "",
  }));
}

// ── Accept a pending request (called by athlete) ──────────────────────────────
export async function acceptCoachRequest(linkId: string): Promise<void> {
  const { error } = await supabase
    .from("coach_athletes")
    .update({ status: "accepted" })
    .eq("id", linkId);
  if (error) throw new Error(error.message);
}

// ── Decline / remove a link ───────────────────────────────────────────────────
export async function removeCoachLink(linkId: string): Promise<void> {
  const { error } = await supabase
    .from("coach_athletes")
    .delete()
    .eq("id", linkId);
  if (error) throw new Error(error.message);
}

import { loadBodyWeights, loadMeasurements } from "./useBody";

// ── Load an athlete's full data for the coach view ────────────────────────────
export async function loadAthleteData(athleteId: string) {
  const [routine, history, weights, measurements] = await Promise.all([
    loadRoutine(athleteId),
    loadWorkoutHistory(athleteId),
    loadBodyWeights(athleteId),
    loadMeasurements(athleteId)
  ]);
  return { routine, history, weights, measurements };
}
