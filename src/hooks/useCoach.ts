import { supabase } from "../lib/supabase";
import { loadRoutine } from "./useRoutine";
import { loadWorkoutHistory } from "./useWorkouts";
import { loadBodyWeights, loadMeasurements } from "./useBody";

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
// The code is what lets a coach add this athlete, so it comes from the
// cryptographic generator, not Math.random. No 0/O or 1/I, to read aloud.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
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

// ── Add an athlete by the invite code shown in their app ─────────────────────
// Holding the athlete's code is their consent, so the check happens on the
// server (coach_connect_by_code): the code must match, the athlete can't
// already have another coach, and wrong guesses are limited. Other people's
// profiles and codes are not readable from the browser.
const CONNECT_ERRORS: Record<string, string> = {
  not_found: "No athlete found with that code. Ask them to check it in their app.",
  self: "That is your own code.",
  has_coach: "This athlete already has an active coach.",
  too_many: "Too many wrong codes. Try again in an hour.",
  signin: "Please sign in again.",
};

export async function connectAthleteByCode(
  code: string
): Promise<{ id: string; display_name: string }> {
  const { data, error } = await supabase.rpc("coach_connect_by_code", { p_code: code });
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(CONNECT_ERRORS[data?.reason] || "Could not add this athlete. Try again.");
  return { id: data.athlete_id, display_name: data.display_name || "Athlete" };
}

// ── Load all links for the current user (as coach OR athlete) ─────────────────
export async function loadCoachLinks(userId: string): Promise<CoachLink[]> {
  const { data, error } = await supabase
    .from("coach_athletes")
    .select("id, coach_id, athlete_id, status, created_at")
    .or(`coach_id.eq.${userId},athlete_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(200);

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
  const { data: link, error: fetchErr } = await supabase
    .from("coach_athletes")
    .select("athlete_id")
    .eq("id", linkId)
    .single();
  if (fetchErr) throw new Error(fetchErr.message);

  const { error } = await supabase
    .from("coach_athletes")
    .update({ status: "accepted" })
    .eq("id", linkId);
  if (error) throw new Error(error.message);

  // Clean up any other pending requests for this athlete
  if (link?.athlete_id) {
    await supabase
      .from("coach_athletes")
      .delete()
      .eq("athlete_id", link.athlete_id)
      .neq("id", linkId)
      .eq("status", "pending");
  }
}

// ── Decline / remove a link ───────────────────────────────────────────────────
export async function removeCoachLink(linkId: string): Promise<void> {
  const { error, count } = await supabase
    .from("coach_athletes")
    .delete({ count: "exact" })
    .eq("id", linkId);
  if (error) throw new Error(error.message);
  if (count === 0) throw new Error("Coach link not found or permission denied.");
}

// ── Load an athlete's full data for the coach view ────────────────────────────
export async function loadAthleteData(athleteId: string) {
  const [routine, history, weights, measurements, profileRes] = await Promise.all([
    loadRoutine(athleteId, true),
    // Always hit the network: the loaders' localStorage cache would hand the
    // coach the previous snapshot and only refresh it for the next load.
    loadWorkoutHistory(athleteId, undefined, { fresh: true }),
    loadBodyWeights(athleteId, { fresh: true }),
    loadMeasurements(athleteId, { fresh: true }),
    // Fetch the athlete's height + unit so the coach can compute BMI.
    // RLS: the existing "coaches can read profile" policy must allow this for
    // accepted coach_athletes links. Falls back to null silently on error.
    supabase.from("profiles")
      .select("height_cm, unit_system")
      .eq("id", athleteId)
      .maybeSingle(),
  ]);
  const profile = profileRes?.data
    ? {
        height_cm: profileRes.data.height_cm != null ? Number(profileRes.data.height_cm) : null,
        unit_system: profileRes.data.unit_system || "imperial",
      }
    : { height_cm: null, unit_system: "imperial" };
  return { routine, history, weights, measurements, profile };
}

// ── Fetch sessions finished by athletes since a timestamp (catch-up) ──────────
export async function loadAthleteSessionsSince(
  coachId: string,
  sinceIso: string
): Promise<Array<{ athleteName: string; workoutType: string; completedAt: string }>> {
  // Get coach's accepted athletes
  const { data: links } = await supabase
    .from("coach_athletes")
    .select("athlete_id")
    .eq("coach_id", coachId)
    .eq("status", "accepted");

  const athleteIds = (links || []).map((l: any) => l.athlete_id);
  if (athleteIds.length === 0) return [];

  const [{ data: sessions }, { data: profiles }] = await Promise.all([
    supabase
      .from("workout_sessions")
      .select("user_id, workout_type, completed_at")
      .in("user_id", athleteIds)
      .not("completed_at", "is", null)
      .gte("completed_at", sinceIso)
      .order("completed_at", { ascending: false })
      .limit(50),
    supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", athleteIds),
  ]);

  const nameMap: Record<string, string> = {};
  for (const p of profiles || []) nameMap[p.id] = p.display_name || "Athlete";

  return (sessions || []).map((s: any) => ({
    athleteName: nameMap[s.user_id] || "Athlete",
    workoutType: s.workout_type || "workout",
    completedAt: s.completed_at,
  }));
}


