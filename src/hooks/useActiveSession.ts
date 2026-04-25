import { supabase } from "../lib/supabase";

// ── Types ────────────────────────────────────────────────────────────────────
export interface ActiveSession {
  id: string;
  athlete_id: string;
  started_at: string;
  ended_at?: string;
  updated_at: string;
}

let _currentSessionId: string | null = null;

// ── Start a session (called when athlete begins workout logging) ──────────────
export async function startActiveSession(athleteId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("active_sessions")
      .insert({ athlete_id: athleteId })
      .select("id")
      .single();

    if (error || !data) return null;
    _currentSessionId = (data as any).id;
    return _currentSessionId;
  } catch {
    return null;
  }
}

// ── Heartbeat: called every time athlete logs a set ──────────────────────────
export async function heartbeatActiveSession(sessionId: string): Promise<void> {
  try {
    await supabase
      .from("active_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", sessionId);
  } catch {}
}

// ── End a session (called when athlete finishes or cancels workout) ───────────
export async function endActiveSession(sessionId: string): Promise<void> {
  try {
    await supabase
      .from("active_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", sessionId);
    if (_currentSessionId === sessionId) _currentSessionId = null;
  } catch {}
}

// ── Check if this athlete is currently mid-workout ────────────────────────────
export async function isAthleteActiveSession(athleteId: string): Promise<boolean> {
  try {
    const staleThreshold = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("active_sessions")
      .select("id")
      .eq("athlete_id", athleteId)
      .is("ended_at", null)
      .gte("updated_at", staleThreshold)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

export function getCurrentSessionId(): string | null {
  return _currentSessionId;
}
