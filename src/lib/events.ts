// First-party product events (decision 0008). The database records what it
// already knows (clients added, links made, check-ins, claims) by itself; this
// file only sends what the browser alone knows. Fire-and-forget: tracking must
// never slow down or break what the user is doing.
import { supabase } from "./supabase";

export type ClientEvent = "coach_signup" | "active_day" | "link_shared" | "signin_email_code";

export function track(name: ClientEvent, props: Record<string, unknown> = {}): void {
  try {
    supabase.rpc("track_event", { p_name: name, p_props: props }).then(() => {}, () => {});
  } catch { /* never throws */ }
}

const isoToday = () => new Date().toISOString().slice(0, 10);

/** Once per user per day (the server dedups too; this just saves the request). */
export function trackActiveDay(userId: string | null | undefined): void {
  if (!userId) return;
  const key = `theryn_active_${userId}`;
  try {
    if (localStorage.getItem(key) === isoToday()) return;
    localStorage.setItem(key, isoToday());
  } catch { /* private mode: send anyway */ }
  track("active_day");
}
