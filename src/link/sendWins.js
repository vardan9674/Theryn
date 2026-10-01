// The wins a client sees the moment they send a workout.
//
// "Last time" comes from the workouts the server has for this link (any
// phone, the coach's logs too), and only then from what this phone remembers.
// Weights are put in the client's current unit first, so 100 lb last time and
// 45 kg today compare as numbers that mean the same thing.
//
// Pure; no React.
import { convertWeight } from "../coach/lib/units.js";
import { doneSets } from "../coach/lib/clientLinks.js";
import { workoutWins, lastTimes } from "../lib/workoutWins.js";

const inUnits = (sets, from, to) => (sets || []).map((s) => {
  if (s?.w === "" || s?.w == null || !from || from === to) return s;
  const w = convertWeight(s.w, from, to);
  return { ...s, w: w == null ? "" : String(w) };
});

/**
 * @param payload the workout being sent (workoutPayload's shape)
 * @param date    the day it is for (local day key)
 * @param units   "metric" | "imperial", what the client is using now
 * @param history link_me's history: [{ date, payload }]
 * @param store   the phone's own memory (store.last), or null
 */
export function winsForSend(payload, date, units, history = [], store = null) {
  const done = (payload?.exercises || []).filter((e) => (Number(e?.sets_done) || 0) > 0);
  const now = done.map((e) => ({ name: e.name, sets: doneSets(e) }));
  const past = (history || [])
    .filter((h) => h?.payload && (h.kind == null || h.kind === "workout"))
    .map((h) => ({
      date: h.date || h.payload.local_date || h.payload.date,
      unit: h.payload.weight_unit,
      exercises: (h.payload.exercises || []).filter((e) => (Number(e?.sets_done) || 0) > 0).map((e) => ({ name: e.name, sets: doneSets(e) })),
    }));
  const server = lastTimes(past, date, (sets, w) => inUnits(sets, w.unit, units));
  const local = (name) => {
    const x = store?.last?.(name);
    return x?.sets?.length && x.date && x.date < date ? inUnits(x.sets, x.units, units) : null;
  };
  return workoutWins(now, (name) => server(name) || local(name));
}
