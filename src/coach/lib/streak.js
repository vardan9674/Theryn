// One streak rule for the coach dashboard and the client's link page.
// The streak counts workouts, not days: a rest day keeps it going but adds
// nothing to it (train Friday, rest Saturday and Sunday, and it is still 1;
// train Monday and it is 2). A planned day with no workout ends it. Today
// never ends it, because the day isn't over.
// Pure; dates are local "YYYY-MM-DD" strings.
import { isoDate, dayKey } from "./format.js";

const MAX_DAYS = 400;
const at = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d, 12); };

/**
 * @param doneDates ISO dates with a workout (array or Set; duplicates fine)
 * @param plan      weekly plan { Mon: { type }, ... }; no plan = every day is a training day
 * @returns { current, best, atRisk, brokeAt, doneToday, thisMonth, days }
 *   brokeAt: length of a streak of 3+ that ended in the last 7 days (when current is 0)
 *   days: the last 14 days, oldest first: { iso, state: "done" | "rest" | "missed" | "today" | "before" }
 */
export function streakStats(doneDates, plan, now = new Date()) {
  const done = new Set([...(doneDates || [])].filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(String(x))));
  const todayIso = isoDate(now);
  const isRest = (d) => plan?.[dayKey(d)]?.type === "Rest";
  const empty = { current: 0, best: 0, atRisk: false, brokeAt: 0, doneToday: done.has(todayIso), thisMonth: 0, days: [] };

  let first = null;
  for (const x of done) if (!first || x < first) first = x;
  const today = at(todayIso);
  const floor = new Date(today); floor.setDate(today.getDate() - MAX_DAYS);
  const start = first ? (at(first) < floor ? floor : at(first)) : null;

  let run = 0, best = 0, broke = null;
  if (start) {
    for (const d = new Date(start); isoDate(d) <= todayIso; d.setDate(d.getDate() + 1)) {
      const iso = isoDate(d);
      if (done.has(iso)) { run++; if (run > best) best = run; }
      else if (isRest(d)) { /* keeps the streak, but doesn't add to it */ }
      else if (iso === todayIso) { /* still time today */ }
      else { if (run > 0) broke = { length: run, endedOn: iso }; run = 0; }
    }
  }
  const current = run;

  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const iso = isoDate(d);
    const state = done.has(iso) ? "done" : !first || iso < first ? "before" : isRest(d) ? "rest" : iso === todayIso ? "today" : "missed";
    days.push({ iso, state });
  }

  const month = todayIso.slice(0, 7);
  let thisMonth = 0;
  for (const x of done) if (x.startsWith(month)) thisMonth++;

  const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);
  const brokeAt = current === 0 && broke && broke.length >= 3 && broke.endedOn >= isoDate(weekAgo) ? broke.length : 0;
  const doneToday = done.has(todayIso);
  const atRisk = current > 0 && !doneToday && !isRest(today) && now.getHours() >= 18;

  return { ...empty, current, best, atRisk, brokeAt, doneToday, thisMonth, days };
}

/** What the streak becomes if `iso` is also done (the receipt, right after sending). */
export function streakWith(doneDates, iso, plan, now = new Date()) {
  return streakStats([...(doneDates || []), iso], plan, now);
}

/** "6 workouts in a row" (rest days keep a streak, they don't add to it) */
export const streakLabel = (n) => `${n} workout${n === 1 ? "" : "s"} in a row`;

/**
 * Consistency since the client joined: planned workout days they trained on,
 * out of planned workout days so far. Rest days don't count. Today counts
 * only once it's done (there's still time). A workout on a rest day makes up
 * for a missed one, never past 100%.
 *   1 of 1 → 100%, 1 of 2 → 50%.
 * startIso: the day they were added (earlier workouts move it back).
 */
export function consistencyStats(doneDates, plan, startIso, now = new Date()) {
  const done = new Set([...(doneDates || [])].filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(String(x))));
  const todayIso = isoDate(now);
  const isPlanned = (d) => { const day = plan?.[dayKey(d)]; return Boolean(day?.type && day.type !== "Rest" && (day.exercises || []).length); };
  let first = /^\d{4}-\d{2}-\d{2}/.test(String(startIso || "")) ? String(startIso).slice(0, 10) : null;
  for (const x of done) if (!first || x < first) first = x;
  if (!first || first > todayIso) return { planned: 0, done: 0, pct: null, since: first };
  let planned = 0, hit = 0, extra = 0;
  for (const d = at(first); isoDate(d) <= todayIso; d.setDate(d.getDate() + 1)) {
    const iso = isoDate(d);
    if (isPlanned(d)) {
      if (iso === todayIso && !done.has(iso)) continue;
      planned++;
      if (done.has(iso)) hit++;
    } else if (done.has(iso)) extra++;
  }
  const got = Math.min(planned, hit + extra);
  return { planned, done: got, pct: planned ? Math.round((got / planned) * 100) : null, since: first };
}
