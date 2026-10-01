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

/**
 * Reports this link's coach shared with its client, newest first. Stopped ones
 * never come back. An older database without reports answers as if there were
 * none, so the page just carries on without them.
 */
export async function fetchReports(token) {
  const { data, error } = await supabase.rpc("link_reports", { p_token: token });
  if (error) {
    if (error.code === "PGRST202" || /link_reports/.test(error.message || "")) return { ok: true, reports: [] };
    throw new Error(error.message);
  }
  return data;
}

/** Lets the coach know it was opened. Best effort: never worth failing the page over. */
export async function markReportSeen(token, reportId) {
  try {
    const { data } = await supabase.rpc("link_report_seen", { p_token: token, p_report: reportId });
    return Boolean(data);
  } catch { return false; }
}

/** Whether this link is connected, whether it's connected to whoever is asking, and their history. */
export async function fetchMe(token) {
  const { data, error } = await supabase.rpc("link_me", { p_token: token });
  if (error) throw new Error(error.message);
  return data;
}

/** Asks the coach to wave this account in. For a link with no invite code in it. */
export async function requestConnect(token) {
  const { data, error } = await supabase.rpc("link_request_connect", { p_token: token });
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
    // Shows set types (warm-up, drop, AMRAP), rest, a superset (A), timed exercises,
    // a band exercise, bodyweight ones, and a plank the coach wrote as reps.
    Tue: { type: "Pull", exercises: [{ name: "Deadlift", sets: 4, reps: "5", weight: 80, rest: 90, setList: [{ kind: "warmup", reps: "8", weight: 40 }, { reps: "5", weight: 80 }, { reps: "5", weight: 80 }, { kind: "drop", reps: "5", weight: 60 }] }, { name: "Pull-Up", sets: 3, reps: "8", superset: "A" }, { name: "Barbell Row", sets: 3, reps: "10/10/max", weight: 40, superset: "A", setList: [{ reps: "10", weight: 40 }, { reps: "10", weight: 40 }, { kind: "amrap", weight: 40 }] }, { name: "Plank", mode: "time", sets: 3, secs: 45 }, { name: "Banded Leg Raise", sets: 3, reps: "15", alternatives: ["Hanging Leg Raise"] }, { name: "Crunches", sets: 2, reps: "20" }, { name: "Side Plank", sets: 2, reps: "30" }, { name: "Treadmill Run", mode: "time", sets: 1, secs: 1200, coachNote: "Easy pace. You should be able to talk." }] },
    Wed: { type: "Legs", exercises: ["Back Squat", "Leg Press", "Calf Raise"] },
    Thu: { type: "Rest", exercises: [] },
    Fri: { type: "Upper", exercises: ["Dumbbell Bench", "Lat Pulldown"] },
    Sat: { type: "Lower", exercises: ["Romanian Deadlift", "Walking Lunge"] },
    Sun: { type: "Rest", exercises: [] },
  };
  const submissions = [];
  // `?coachpart` in the preview's address: today is the Pull day, and the
  // coach has already logged its first three exercises with them.
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("coachpart")) {
    const now = new Date();
    const k = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][now.getDay()];
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    plan[k] = plan.Tue;
    submissions.push({ id: "preview-coach", at: new Date(now.getTime() - 3 * 3600e3).toISOString(), kind: "workout", payload: {
      date, local_date: date, day: k, type: plan.Tue.type, logged_by: "coach", note: "",
      exercises: plan.Tue.exercises.map((e, i) => ({ name: e.name, sets_planned: e.sets, sets_done: i < 3 ? e.sets : 0 })),
    } });
  }
  let connected = { connected: false, you: false, signed_in: false, name: null, locked: false, history: [] };
  // One shared report for last week, in the exact shape reportSnapshot() makes.
  // `?noreport` in the preview's address shows a link with none.
  const lastMonday = (() => { const x = new Date(); x.setDate(x.getDate() - ((x.getDay() + 6) % 7) - 7); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; })();
  const reports = [{
    id: "preview-report", period_start: lastMonday, shared_at: new Date().toISOString(), seen: false,
    snapshot: {
      v: 1, period: { start: lastMonday }, coach: "Sam", first: "Alex", headline: "Strong upper-body week.",
      workouts: { done: 4, planned: 5, days: [{ k: "Mon", p: true, d: true }, { k: "Tue", p: true, d: true }, { k: "Wed", p: true, d: true }, { k: "Fri", p: true, d: true }, { k: "Sat", p: true, d: false }] },
      muscles: { levels: { chest: 3, shoulders: 3, upperback: 3, triceps: 2, biceps: 2, calves: 1, lowerback: 1, quads: 1, forearms: 1, glutes: 1, hamstrings: 1, traps: 1 }, top: ["chest", "shoulders"], worked: ["chest", "shoulders", "upperback", "triceps", "biceps"] },
      gap: { weak: { label: "Legs", done: 5, planned: 26 }, strong: { label: "Upper body", done: 44, planned: 45 } },
      best: { name: "Barbell bench press", weight: 47.5, reps: 6, prev: 45, unit: "kg" },
      note: "Great upper-body week, Alex. A new best on bench! Next week let's get the legs work in. Tell me if the leg press is giving you trouble.",
      focus: "Legs work",
    },
  }];
  return {
    async fetchReports() {
      await new Promise((r) => setTimeout(r, 150));
      const none = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("noreport");
      return { ok: true, reports: none ? [] : reports.map((r) => ({ ...r })) };
    },
    async markReportSeen(_t, id) { const r = reports.find((x) => x.id === id && !x.seen); if (r) r.seen = true; return Boolean(r); },
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
      connected = { ...connected, connected: true, you: true, waiting: false, name: "Alex Preview" };
      return { ok: true };
    },
    // No invite code: the coach is asked. `?approve` in the preview's address
    // waves them straight in, so the whole flow can be walked without a coach.
    async requestConnect() {
      await new Promise((r) => setTimeout(r, 400));
      if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("approve")) {
        connected = { ...connected, connected: true, you: true, waiting: false, name: "Alex Preview" };
        return { ok: true, already: true };
      }
      connected = { ...connected, waiting: true };
      return { ok: true, pending: true };
    },
    async signInWithGoogle() { await new Promise((r) => setTimeout(r, 300)); connected = { ...connected, signed_in: true }; },
    async signOutLink() { connected = { connected: false, you: false, signed_in: false, name: null, locked: false, history: [] }; },
    submissions,
  };
}
