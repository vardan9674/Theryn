// The wins a client sees the moment they send a workout.
//
// "Last time" is the page's own (lastTime.js): the workouts the server has for
// this link (any phone, the coach's logs too), then what this phone remembers.
// Weights are put in the client's current unit first, so 100 lb last time and
// 45 kg today compare as numbers that mean the same thing.
//
// Pure; no React.
import { convertWeight } from "../coach/lib/units.js";
import { doneSets } from "../coach/lib/clientLinks.js";
import { workoutWins } from "../lib/workoutWins.js";
import { lastTimeLookup } from "./lastTime.js";

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
  const last = lastTimeLookup(history, date, store);
  return workoutWins(now, (name) => { const x = last(name); return x ? inUnits(x.sets, x.units, units) : null; });
}
