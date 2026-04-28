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
  // Enforce rule: athlete can only have 1 active coach
  const { data: activeCoach } = await supabase
    .from("coach_athletes")
    .select("id")
    .eq("athlete_id", athleteId)
    .eq("status", "accepted")
    .single();

  if (activeCoach) {
    throw new Error("This athlete already has an active coach.");
  }

  const { error } = await supabase.from("coach_athletes").insert({
    coach_id: coachId,
    athlete_id: athleteId,
    status: "accepted",
  });
  if (error) throw new Error(error.message);

  // Auto-accept: clear any other pending requests for this athlete so the
  // "one active coach" rule stays consistent.
  await supabase
    .from("coach_athletes")
    .delete()
    .eq("athlete_id", athleteId)
    .eq("status", "pending");
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
  const { error } = await supabase
    .from("coach_athletes")
    .delete()
    .eq("id", linkId);
  if (error) throw new Error(error.message);
}

// ── Load an athlete's full data for the coach view ────────────────────────────
export async function loadAthleteData(athleteId: string) {
  const [routine, history, weights, measurements, profileRes] = await Promise.all([
    loadRoutine(athleteId),
    loadWorkoutHistory(athleteId),
    loadBodyWeights(athleteId),
    loadMeasurements(athleteId),
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


