// Pure helpers for shareable client links (decision 0006).
import { planUnits, convertSubmission, normUnits } from "./units.js";
export { planUnits };

export const MEASUREMENT_FIELDS = [
  { id: "chest", label: "Chest", hint: "Wrap the tape around the fullest part of your chest. Keep it level and breathe normally." },
  { id: "waist", label: "Waist", hint: "Measure around your natural waist, between your lowest rib and the top of your hips. Keep the tape snug, without pulling it tight." },
  { id: "hips", label: "Hips", hint: "Stand with your feet together and measure around the fullest part of your hips." },
  { id: "arm", label: "Left arm", hint: "Let your left arm relax at your side. Measure around the middle of your upper arm." },
  { id: "thigh", label: "Left thigh", hint: "Measure around the fullest part of your left thigh, standing with your weight evenly balanced." },
];
export const ALL_FIELD_IDS = MEASUREMENT_FIELDS.map((f) => f.id);

/** 32 random bytes as base64url. */
export function generateToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** SHA-256 hex of the token, what the database stores. */
export async function hashToken(token) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function linkUrl(token, origin) {
  const base = (origin || (typeof window !== "undefined" ? window.location.origin : "https://theryn.fit")).replace(/\/$/, "");
  return `${base}/f/${token}`;
}

/** Message that goes with the link. */
export function shareMessage(firstName, url) {
  const name = (firstName || "").trim();
  return `Hi${name ? " " + name : ""}, here's your Theryn link. Open it on training days to tick off your workout, and use the Measurements tab when I ask for them: ${url}`;
}

export function whatsappUrl(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Day key ("Mon".."Sun") for a Date, weeks starting Monday. */
export function dayKeyOf(d = new Date()) {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
}
export const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAY_LONG = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };

/** Normalize a plan day's exercise (string or object) into what the page renders. */
export function normalizeExercise(ex) {
  if (typeof ex === "string") return { name: ex, sets: null, reps: null, weight: null, note: null };
  if (!ex || typeof ex !== "object") return { name: "", sets: null, reps: null, weight: null, note: null };
  return {
    name: ex.name || "",
    sets: ex.sets != null && ex.sets !== "" ? Number(ex.sets) || null : null,
    reps: ex.reps != null && ex.reps !== "" ? String(ex.reps) : null,
    weight: ex.weight != null && ex.weight !== "" ? ex.weight : null,
    note: ex.coachNote || ex.note || null,
  };
}

/** Today's day from the plan, or the next training day if today is rest. */
export function todayFromPlan(plan, now = new Date()) {
  if (!plan) return { key: dayKeyOf(now), type: "Rest", exercises: [], isRest: true, next: null };
  const key = dayKeyOf(now);
  const day = plan[key];
  const isRest = !day || !day.type || day.type === "Rest" || !(day.exercises || []).length;
  let next = null;
  if (isRest) {
    const start = DAY_ORDER.indexOf(key);
    for (let i = 1; i <= 7; i++) {
      const k = DAY_ORDER[(start + i) % 7];
      const d = plan[k];
      if (d && d.type && d.type !== "Rest" && (d.exercises || []).length) { next = { key: k, type: d.type }; break; }
    }
  }
  return {
    key,
    type: isRest ? "Rest" : day.type,
    exercises: isRest ? [] : (day.exercises || []).map(normalizeExercise).filter((e) => e.name),
    isRest,
    next,
  };
}

/**
 * Which measurements are required on the link page. The coach's ticks, as
 * link_view returns them: an empty list means none are required (every field
 * is still on the page, optional); a missing list means the pre-2026-09-18
 * default of all of them.
 */
export function requiredFields(requested) {
  if (!Array.isArray(requested)) return ALL_FIELD_IDS;
  return requested.filter((id) => ALL_FIELD_IDS.includes(id));
}

/** Client-side validation mirroring link_submit. Returns { ok, error, field }. */
export function validateMeasurements(values, unit, requested) {
  const metric = unit === "metric";
  const filled = (id) => values[id] != null && String(values[id]).trim() !== "";
  if (!["weight", ...ALL_FIELD_IDS].some(filled)) return { ok: false, error: "Add at least one measurement to send.", field: requested[0] || ALL_FIELD_IDS[0] };
  for (const id of requested) {
    const v = values[id];
    if (v == null || String(v).trim() === "") return { ok: false, error: "Please add each measurement your coach asked for.", field: id };
  }
  for (const [id, raw] of Object.entries(values)) {
    if (raw == null || String(raw).trim() === "") continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) return { ok: false, error: "That doesn't look like a number.", field: id };
    if (id === "weight") {
      if (metric ? n < 20 || n > 400 : n < 44 || n > 880) return { ok: false, error: `Weight should be between ${metric ? "20 and 400 kg" : "44 and 880 lb"}.`, field: id };
    } else if (metric ? n < 10 || n > 250 : n < 4 || n > 100) {
      return { ok: false, error: `That should be between ${metric ? "10 and 250 cm" : "4 and 100 in"}.`, field: id };
    }
  }
  return { ok: true };
}

/**
 * Build the payload the RPC expects. Empty values are dropped.
 * `local_date` repeats the client's own date: link_submit replaces `date` with
 * the server's (UTC) date when the client is already on the next day, which in
 * India is every submission between midnight and 5:30 am.
 */
export function measurementsPayload(values, unit, date) {
  const out = { unit, date, local_date: date };
  for (const id of ["weight", ...ALL_FIELD_IDS]) {
    const v = values[id];
    if (v != null && String(v).trim() !== "") out[id] = Number(v);
  }
  return out;
}

/** `units` is what the client typed weights in (and saw the targets in). */
const numOrNull = (v) => (v == null || String(v).trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * `log[i]` is either one weight for the whole exercise (older drafts) or, per
 * set, `{ [setIndex]: { r, w } }`: the reps and weight the client typed. A
 * blank box means "as the coach planned". Per-set detail is only sent for
 * exercises where the client typed something, to keep the payload small
 * (link_submit caps it at 20,000 characters).
 */
export function workoutPayload(today, ticks, log, note, date, units, feel) {
  return {
    ...(["easy", "medium", "hard"].includes(feel) ? { feel } : {}),
    ...(units ? { weight_unit: units === "metric" ? "metric" : "imperial" } : {}),
    date,
    local_date: date,
    day: today.key,
    type: today.type,
    exercises: today.exercises.map((e, i) => {
      const full = e.sets || 1;
      const done = Math.min(ticks[i] || 0, e.sets || 20);
      const entry = log?.[i];
      const perSet = entry && typeof entry === "object" ? entry : null;
      const typed = perSet ? Array.from({ length: full }, (_, s) => ({ r: numOrNull(perSet[s]?.r), w: numOrNull(perSet[s]?.w) })) : [];
      const firstWeight = typed.slice(0, done).find((x) => x.w != null)?.w ?? null;
      const out = {
        name: e.name,
        sets_planned: e.sets,
        sets_done: done,
        reps: e.reps,
        weight_target: e.weight,
        weight_used: perSet ? firstWeight : numOrNull(entry),
      };
      if (typed.some((x) => x.r != null || x.w != null)) {
        out.sets = typed.map((x, s) => {
          const one = { n: s + 1, done: s < done };
          if (x.r != null) one.reps = x.r;
          if (x.w != null) one.weight = x.w;
          return one;
        });
      }
      return out;
    }),
    note: (note || "").trim().slice(0, 500),
  };
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const localIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dayDiff = (a, b) => Math.round((new Date(a + "T12:00:00") - new Date(b + "T12:00:00")) / 86400000);

/**
 * The day the client meant. link_submit stores its own UTC date in `date`,
 * so a client ahead of UTC (India: midnight to 5:30 am) lands on the day
 * before. New submissions carry `local_date`; older ones are recovered from
 * the submission time when the stored date is just the UTC day it was sent.
 */
export function submissionDate(sub) {
  const p = sub?.payload || {};
  const sentAt = sub?.submitted_at ? new Date(sub.submitted_at) : null;
  const server = ISO_DAY.test(p.date || "") ? p.date : sentAt && !isNaN(sentAt) ? sentAt.toISOString().slice(0, 10) : null;
  if (ISO_DAY.test(p.local_date || "") && (!server || Math.abs(dayDiff(p.local_date, server)) <= 1)) return p.local_date;
  if (server && sentAt && !isNaN(sentAt) && server === sentAt.toISOString().slice(0, 10)) return localIso(sentAt);
  return server;
}


/** A submission row → what the coach's Body tab shows for name-only clients. */
export function submissionToMeasurement(sub) {
  const p = sub.payload || {};
  const metric = p.unit === "metric";
  return {
    id: sub.id, date: submissionDate(sub), unit: metric ? "cm" : "in", weightUnit: metric ? "kg" : "lb",
    weight: p.weight ?? undefined, chest: p.chest ?? undefined, waist: p.waist ?? undefined, hips: p.hips ?? undefined, lArm: p.arm ?? undefined, lThigh: p.thigh ?? undefined,
    source: "link",
  };
}

/** A workout submission row → the history entry shape the dashboard already uses. */
/** What one done set weighed and how many reps: what the client typed, else what the coach planned. */
export function doneSets(e) {
  const plannedReps = e.reps ? String(e.reps).replace(/[^0-9].*$/, "") : "";
  const w = (x) => (x != null && x !== "" ? String(x) : "");
  const fallbackW = e.weight_used ?? e.weight_target;
  if (Array.isArray(e.sets) && e.sets.length) {
    // Per set, a blank weight means the planned one (weight_used is just the first typed weight).
    const planned = e.weight_target ?? e.weight_used;
    return e.sets.filter((s) => s && s.done).map((s) => ({ w: w(s.weight ?? planned), r: s.reps != null ? String(s.reps) : plannedReps }));
  }
  return Array.from({ length: e.sets_done || 0 }, () => ({ w: w(fallbackW), r: plannedReps }));
}

export function submissionToHistory(sub) {
  const p = sub.payload || {};
  const exercises = (p.exercises || []).filter((e) => (e.sets_done || 0) > 0).map((e) => ({ name: e.name, sets: doneSets(e) }));
  const totalSets = exercises.reduce((a, e) => a + e.sets.length, 0);
  const totalVolume = exercises.reduce((a, e) => a + e.sets.reduce((s, x) => s + (Number(x.w) || 0) * (Number(x.r) || 0), 0), 0);
  return { id: sub.id, date: submissionDate(sub), type: p.type || "Workout", duration: 45 * 60, startedAt: sub.submitted_at, exercises, totalSets, totalVolume, source: "link", note: p.note || "", feel: p.feel || null, plannedSets: (p.exercises || []).reduce((a, e) => a + (e.sets_planned || 0), 0) };
}

/**
 * Everything the coach sees for a name-only client, built from their link
 * submissions, in the coach's units: the client may send pounds and inches,
 * the coach reads kilograms and centimetres (or the other way round).
 * Workouts sent before they carried `weight_unit` are taken to be in the
 * plan's units, which is what the link page showed.
 */
export function linkClientData(submissions, { plan = null, coachUnits = "imperial" } = {}) {
  const unitSystem = normUnits(coachUnits);
  const workoutFrom = planUnits(plan) || unitSystem;
  const subs = [...(submissions || [])]
    .sort((a, b) => (a.submitted_at < b.submitted_at ? 1 : a.submitted_at > b.submitted_at ? -1 : 0))
    .map((x) => convertSubmission(x, unitSystem, { workoutFrom }));
  const byDate = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
  const measurements = subs.filter((x) => x.kind === "measurements").map(submissionToMeasurement).sort(byDate);
  const weights = measurements.filter((m) => m.weight != null).map((m) => ({ id: m.id + ":w", date: m.date, weight: m.weight, source: "link" }));
  const history = subs.filter((x) => x.kind === "workout").map(submissionToHistory).sort(byDate);
  return { history, measurements, weights, unitSystem, submissions: subs };
}
