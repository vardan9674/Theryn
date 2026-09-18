// What the coach reads about one workout, whether the client logged it in
// the app or ticked it off through their link. Pure; no React, no network.
import { toClientId } from "./manualClients.js";
import { submissionDate } from "./clientLinks.js";

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
    // The promoted session carries the server's date; the submission may carry the client's (local_date).
    const sameDay = subs.filter((s) => !used.has(s.id) && ((s.payload?.date || String(s.submitted_at).slice(0, 10)) === h.date || submissionDate(s) === h.date));
    if (sameDay.length === 0) return h;
    const names = new Set(h.exercises.map((e) => e.name.toLowerCase()));
    const best = sameDay
      .map((s) => ({ s, score: (s.payload?.exercises || []).reduce((a, e) => a + ((e.sets_done || 0) > 0 && names.has(String(e.name).toLowerCase()) ? 1 : 0), 0) }))
      .sort((a, b) => b.score - a.score)[0].s;
    used.add(best.id);
    return { ...h, submission: best };
  });
}

const repsLabel = (reps) => (reps ? String(reps) : "");
/** Did the client's reps fall inside the plan's "8" or "8-12"? */
function repsWithin(r, planned) {
  const m = String(planned || "").match(/(\d+)\s*[-–]\s*(\d+)/);
  if (m) return Number(r) >= Number(m[1]) && Number(r) <= Number(m[2]);
  const one = String(planned || "").match(/\d+/);
  return one ? Number(r) === Number(one[0]) : true;
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
        // Set by set, when the client typed reps or weights: done sets only,
        // with `changed` where they did something other than the plan.
        sets: Array.isArray(e.sets) && e.sets.length
          ? e.sets.filter((x) => x && x.done).map((x) => {
              const w = x.weight ?? e.weight_target ?? e.weight_used ?? null; // blank = the planned weight
              const r = x.reps ?? null;
              return {
                w: w != null ? String(w) : "",
                r: r != null ? String(r) : repsLabel(e.reps),
                changed: (x.weight != null && e.weight_target != null && Number(x.weight) !== Number(e.weight_target)) || (r != null && !repsWithin(r, e.reps)),
              };
            })
          : [],
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
