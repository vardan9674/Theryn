// Network for the public link page. The two anon-safe RPCs every client uses,
// plus the three calls behind "Connect": who the holder is, signing in with
// Google, and tying this link to that account with the coach's code.
import { supabase } from "../lib/supabase.ts";

export async function fetchLink(token) {
  const { data, error } = await supabase.rpc("link_view", { p_token: token });
  if (error) throw new Error(error.message);
  return data;
}

export async function submitLink(token, kind, payload) {
  const { data, error } = await supabase.rpc("link_submit", { p_token: token, p_kind: kind, p_payload: payload });
  if (error) throw new Error(error.message);
  return data;
}

/** Whether this link is connected, whether it's connected to whoever is asking, and their history. */
export async function fetchMe(token) {
  const { data, error } = await supabase.rpc("link_me", { p_token: token });
  if (error) throw new Error(error.message);
  return data;
}

/** Ties this link to the signed-in Google account. Needs the code the coach sent. */
export async function connectLink(token, code) {
  const { data, error } = await supabase.rpc("link_connect", { p_token: token, p_code: code });
  if (error) throw new Error(error.message);
  return data;
}

/** Google, then straight back to this same link. */
export async function signInWithGoogle(token) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/f/${token}`, queryParams: { prompt: "select_account" } },
  });
  if (error) throw new Error(error.message);
}

export async function signOutLink() {
  try { await supabase.auth.signOut(); } catch {}
}

/** In-memory stand-in for the dev preview: /f/preview */
export function createPreviewApi() {
  const plan = {
    Mon: { type: "Push", exercises: [{ name: "Barbell bench press", sets: 3, reps: "12/10/8", weight: 40, setList: [{ reps: "12", weight: 40 }, { reps: "10", weight: 42.5 }, { reps: "8", weight: 45 }], coachNote: "Lower slowly. Keep your feet planted." }, { name: "Incline dumbbell press", sets: 3, reps: "10-12", weight: 12, coachNote: "Weight is per dumbbell." }, { name: "Seated shoulder press", sets: 3, reps: "10", weight: 10 }, { name: "Lateral raise", sets: 3, reps: "12-15", weight: 5 }, { name: "Cable triceps pushdown", sets: 3, reps: "12", weight: 15 }] },
    // Shows set types (warm-up, drop, AMRAP), rest, a superset (A) and timed exercises.
    Tue: { type: "Pull", exercises: [{ name: "Deadlift", sets: 4, reps: "5", weight: 80, rest: 90, setList: [{ kind: "warmup", reps: "8", weight: 40 }, { reps: "5", weight: 80 }, { reps: "5", weight: 80 }, { kind: "drop", reps: "5", weight: 60 }] }, { name: "Pull-Up", sets: 3, reps: "8", superset: "A" }, { name: "Barbell Row", sets: 3, reps: "10/10/max", weight: 40, superset: "A", setList: [{ reps: "10", weight: 40 }, { reps: "10", weight: 40 }, { kind: "amrap", weight: 40 }] }, { name: "Plank", mode: "time", sets: 3, secs: 45 }, { name: "Treadmill Run", mode: "time", sets: 1, secs: 1200, coachNote: "Easy pace. You should be able to talk." }] },
    Wed: { type: "Legs", exercises: ["Back Squat", "Leg Press", "Calf Raise"] },
    Thu: { type: "Rest", exercises: [] },
    Fri: { type: "Upper", exercises: ["Dumbbell Bench", "Lat Pulldown"] },
    Sat: { type: "Lower", exercises: ["Romanian Deadlift", "Walking Lunge"] },
    Sun: { type: "Rest", exercises: [] },
  };
  const submissions = [];
  let connected = { connected: false, you: false, signed_in: false, name: null, locked: false, history: [] };
  return {
    async fetchLink() { await new Promise((r) => setTimeout(r, 300)); const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
      const done_dates = [1, 2, 4, 5, 6, 8, 9, 10, 11, 13, 14].map((n) => { const x = new Date(); x.setDate(x.getDate() - n); return iso(x); }).filter((d) => { const k = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(d + "T12:00:00").getDay()]; return plan[k].type !== "Rest"; });
      return { ok: true, first_name: "Alex", coach_name: "Sam", unit_system: "metric", requested: ["chest", "waist", "hips"], plan, done_dates }; },
    async submitLink(_t, kind, payload) {
      await new Promise((r) => setTimeout(r, 500));
      // Same as the real one: a correction stands in place of the first send.
      const at = payload.replaces ? submissions.findIndex((s) => s.id === payload.replaces) : -1;
      const { replaces, ...stored } = payload; // the server drops it too
      if (at >= 0) { submissions[at] = { ...submissions[at], kind, payload: stored }; return { ok: true, id: replaces, date: payload.date, replaced: true }; }
      const id = `preview-${submissions.length + 1}`;
      submissions.push({ id, at: new Date().toISOString(), kind, payload: stored });
      return { ok: true, id, date: payload.date };
    },
    // The connect flow, without Google: the code is DEMO24 and signing in is instant.
    async fetchMe() {
      await new Promise((r) => setTimeout(r, 120));
      // Like the real one: whoever holds the link gets their own workouts
      // back, each with the id needed to change it — except one the coach
      // logged, which comes back without an id and so cannot be edited.
      const history = submissions.filter((s) => s.kind === "workout").map((s) => ({ id: s.payload.logged_by === "coach" ? null : s.id, at: s.at, date: s.payload.date, kind: s.kind, by_coach: s.payload.logged_by === "coach", payload: s.payload })).reverse();
      return { ok: true, ...connected, history };
    },
    async connectLink(_t, code) {
      await new Promise((r) => setTimeout(r, 400));
      if (String(code || "").trim().toUpperCase() !== "DEMO24") return { ok: false, reason: "code", left: 7 };
      connected = { ...connected, connected: true, you: true, name: "Alex Preview" };
      return { ok: true };
    },
    async signInWithGoogle() { await new Promise((r) => setTimeout(r, 300)); connected = { ...connected, signed_in: true }; },
    async signOutLink() { connected = { connected: false, you: false, signed_in: false, name: null, locked: false, history: [] }; },
    submissions,
  };
}
