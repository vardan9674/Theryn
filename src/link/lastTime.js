// "Last time" on the workout link: what the client did the last day they did
// each exercise.
//
// The server's workouts for this link come first: they are the same on every
// phone and browser (WhatsApp's own browser and Chrome keep separate memory),
// and they include what the coach logged with them. What this phone remembers
// is the fallback, for when link_me hasn't answered or the send it remembers
// is newer than the server's copy.
//
// Pure; no React.
import { doneSets } from "../coach/lib/clientLinks.js";
import { winKey } from "../lib/workoutWins.js";

/**
 * @param history    link_me's history: [{ date, kind, payload }]
 * @param beforeDate only days before this one count (local day key)
 * @param store      the phone's own memory (store.last), or null
 * @returns name → { date, units, sets: [{ w, r, s }] } or null
 */
export function lastTimeLookup(history = [], beforeDate, store = null) {
  const server = new Map();
  const past = (history || [])
    .filter((h) => h?.payload && (h.kind == null || h.kind === "workout"))
    .map((h) => ({ h, date: h.date || h.payload.local_date || h.payload.date }))
    .filter((x) => x.date && x.date < beforeDate)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  for (const { h, date } of past) {
    for (const e of h.payload.exercises || []) {
      const k = winKey(e?.name);
      if (!k || server.has(k) || !((Number(e?.sets_done) || 0) > 0)) continue;
      const sets = doneSets(e);
      if (sets.length) server.set(k, { date, units: h.payload.weight_unit || null, sets });
    }
  }
  return (name) => {
    const fromServer = server.get(winKey(name)) || null;
    const x = store?.last?.(name);
    const fromPhone = x?.sets?.length && x.date && x.date < beforeDate ? x : null;
    if (fromServer && fromPhone) return fromPhone.date > fromServer.date ? fromPhone : fromServer;
    return fromServer || fromPhone;
  };
}
