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
    Mon: { type: "Push", exercises: [{ name: "Barbell bench press", sets: 3, reps: "8-10", weight: 40, coachNote: "Lower slowly. Keep your feet planted." }, { name: "Incline dumbbell press", sets: 3, reps: "10-12", weight: 12, coachNote: "Weight is per dumbbell." }, { name: "Seated shoulder press", sets: 3, reps: "10", weight: 10 }, { name: "Lateral raise", sets: 3, reps: "12-15", weight: 5 }, { name: "Cable triceps pushdown", sets: 3, reps: "12", weight: 15 }] },
    Tue: { type: "Pull", exercises: ["Deadlift", "Pull-Up", "Barbell Row"] },
    Wed: { type: "Legs", exercises: ["Back Squat", "Leg Press", "Calf Raise"] },
    Thu: { type: "Rest", exercises: [] },
    Fri: { type: "Upper", exercises: ["Dumbbell Bench", "Lat Pulldown"] },
    Sat: { type: "Lower", exercises: ["Romanian Deadlift", "Walking Lunge"] },
    Sun: { type: "Rest", exercises: [] },
  };
  const submissions = [];
  return {
    async fetchLink() { await new Promise((r) => setTimeout(r, 300)); return { ok: true, first_name: "Alex", coach_name: "Sam", unit_system: "metric", requested: ["chest", "waist", "hips"], plan }; },
    async submitLink(_t, kind, payload) { await new Promise((r) => setTimeout(r, 500)); submissions.push({ kind, payload }); return { ok: true, id: "preview", date: payload.date }; },
    submissions,
  };
}
