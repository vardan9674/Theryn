// Network for the public link page. Only two calls, both anon-safe RPCs.
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

/** In-memory stand-in for the dev preview: /f/preview */
export function createPreviewApi() {
  const plan = {
    Mon: { type: "Push", exercises: [{ name: "Barbell bench press", sets: 3, reps: "12/10/8", weight: 40, setList: [{ reps: "12", weight: 40 }, { reps: "10", weight: 42.5 }, { reps: "8", weight: 45 }], coachNote: "Lower slowly. Keep your feet planted." }, { name: "Incline dumbbell press", sets: 3, reps: "10-12", weight: 12, coachNote: "Weight is per dumbbell." }, { name: "Seated shoulder press", sets: 3, reps: "10", weight: 10 }, { name: "Lateral raise", sets: 3, reps: "12-15", weight: 5 }, { name: "Cable triceps pushdown", sets: 3, reps: "12", weight: 15 }] },
    // Shows a superset (A) and timed exercises (a plank and a run).
    Tue: { type: "Pull", exercises: [{ name: "Deadlift", sets: 3, reps: "5", weight: 80 }, { name: "Pull-Up", sets: 3, reps: "8", superset: "A" }, { name: "Barbell Row", sets: 3, reps: "10", weight: 40, superset: "A" }, { name: "Plank", mode: "time", sets: 3, secs: 45 }, { name: "Treadmill Run", mode: "time", sets: 1, secs: 1200, coachNote: "Easy pace. You should be able to talk." }] },
    Wed: { type: "Legs", exercises: ["Back Squat", "Leg Press", "Calf Raise"] },
    Thu: { type: "Rest", exercises: [] },
    Fri: { type: "Upper", exercises: ["Dumbbell Bench", "Lat Pulldown"] },
    Sat: { type: "Lower", exercises: ["Romanian Deadlift", "Walking Lunge"] },
    Sun: { type: "Rest", exercises: [] },
  };
  const submissions = [];
  return {
    async fetchLink() { await new Promise((r) => setTimeout(r, 300)); const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
      const done_dates = [1, 2, 4, 5, 6, 8, 9, 10, 11, 13, 14].map((n) => { const x = new Date(); x.setDate(x.getDate() - n); return iso(x); }).filter((d) => { const k = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(d + "T12:00:00").getDay()]; return plan[k].type !== "Rest"; });
      return { ok: true, first_name: "Alex", coach_name: "Sam", unit_system: "metric", requested: ["chest", "waist", "hips"], plan, done_dates }; },
    async submitLink(_t, kind, payload) { await new Promise((r) => setTimeout(r, 500)); submissions.push({ kind, payload }); return { ok: true, id: "preview", date: payload.date }; },
    submissions,
  };
}
