// What the coach reads about one workout, whether the client logged it in
// the app or ticked it off through their link. Pure; no React, no network.
import { toClientId } from "./manualClients.js";

/** Which dashboard client a submission row belongs to. Mock rows carry clientId; real rows carry the two ids. */
export function clientIdOfSubmission(sub) {
  if (!sub) return null;
  if (sub.clientId) return sub.clientId;
  if (sub.manual_client_id) return toClientId(sub.manual_client_id);
  return sub.athlete_id || null;
}

/**
 * Pair each link-sourced history entry with the submission that produced it.
 * App clients: the session was promoted from the submission, so match on the
 * date and, when the client sent more than one that day, on the exercises.
 * Name-only clients: the entry *is* the submission (same id).
 */
export function attachSubmissions(history, submissions) {
  const subs = (submissions || []).filter((s) => s.kind === "workout");
  if (subs.length === 0) return history || [];
  const byId = new Map(subs.map((s) => [s.id, s]));
  const used = new Set();
  return (history || []).map((h) => {
    if (h.submission) return h;
    if (byId.has(h.id)) { used.add(h.id); return { ...h, submission: byId.get(h.id) }; }
    if (h.source !== "link") return h;
    const sameDay = subs.filter((s) => !used.has(s.id) && (s.payload?.date || String(s.submitted_at).slice(0, 10)) === h.date);
    if (sameDay.length === 0) return h;
    const names = new Set(h.exercises.map((e) => e.name.toLowerCase()));
    const best = sameDay
      .map((s) => ({ s, score: (s.payload?.exercises || []).reduce((a, e) => a + ((e.sets_done || 0) > 0 && names.has(String(e.name).toLowerCase()) ? 1 : 0), 0) }))
      .sort((a, b) => b.score - a.score)[0].s;
    used.add(best.id);
    return { ...h, submission: best };
  });
}

/** One workout, ready to render. `unit` is the client's weight unit label. */
export function workoutDetail(entry) {
  const sub = entry.submission;
  const viaLink = entry.source === "link" || Boolean(sub);
  if (sub && sub.payload) {
    const p = sub.payload;
    const exercises = (p.exercises || []).map((e) => {
      const planned = Number(e.sets_planned) || 0;
      const done = Math.max(0, Number(e.sets_done) || 0);
      return {
        name: e.name || "",
        planned, done,
        skipped: planned > 0 && done === 0,
        reps: e.reps || null,
        weight: e.weight_used != null ? e.weight_used : e.weight_target != null ? e.weight_target : null,
        weightChanged: e.weight_used != null && e.weight_target != null && Number(e.weight_used) !== Number(e.weight_target),
        sets: [],
      };
    });
    return {
      id: entry.id, date: entry.date, type: p.type || entry.type || "Workout", viaLink: true,
      note: (p.note || entry.note || "").trim(),
      durationMin: null,
      totalSets: exercises.reduce((a, e) => a + e.done, 0),
      plannedSets: exercises.reduce((a, e) => a + e.planned, 0),
      exercises,
    };
  }
  const exercises = (entry.exercises || []).map((e) => ({
    name: e.name, planned: 0, done: e.sets.length, skipped: false, reps: null,
    weight: null, weightChanged: false,
    sets: e.sets.map((s) => ({ w: s.w || "", r: s.r || "" })),
  }));
  return {
    id: entry.id, date: entry.date, type: entry.type || "Workout", viaLink,
    note: (entry.note || "").trim(),
    durationMin: entry.duration ? Math.round(entry.duration / 60) : null,
    totalSets: entry.totalSets ?? exercises.reduce((a, e) => a + e.done, 0),
    plannedSets: entry.plannedSets || 0,
    exercises,
  };
}

/** "8 of 9 sets" / "12 sets · 45 min" for a row summary. */
export function workoutSummary(d) {
  const sets = d.plannedSets > 0 ? `${d.totalSets} of ${d.plannedSets} sets` : `${d.totalSets} ${d.totalSets === 1 ? "set" : "sets"}`;
  return d.durationMin ? `${sets} · ${d.durationMin} min` : sets;
}
