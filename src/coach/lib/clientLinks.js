// Pure helpers for shareable client links (decision 0006).
import { parseDuration } from "./exerciseKinds.js";
import { planUnits, convertSubmission, normUnits } from "./units.js";
import { validTimeZone } from "./clientClock.js";
export { planUnits };

// Every measurement a coach can ask for, top of the body to the bottom.
//   id    — the key in a link submission (older ones: arm = left arm, thigh = left thigh)
//   key   — the name the dashboard uses for it (the app's body tables use the same)
//   group — how the coach's list is grouped
// All of them are optional for the client; the coach picks which ones the
// link shows first ("requested"), and the client can add any of the others.
export const MEASUREMENT_FIELDS = [
  { id: "neck", key: "neck", group: "Upper body", label: "Neck", hint: "Look straight ahead. Measure around the middle of your neck, just below the Adam's apple." },
  { id: "shoulders", key: "shoulders", group: "Upper body", label: "Shoulders", hint: "Arms relaxed at your sides. Measure around the widest part of your shoulders." },
  { id: "chest", key: "chest", group: "Upper body", label: "Chest", hint: "Wrap the tape around the fullest part of your chest. Keep it level and breathe normally." },
  { id: "back", key: "back", group: "Upper body", label: "Upper back", hint: "Arms relaxed. Measure around your back and under your arms, at the widest part of your shoulder blades." },
  { id: "arm", key: "lArm", group: "Arms", label: "Left arm", hint: "Let your left arm relax at your side. Measure around the middle of your upper arm." },
  { id: "arm_r", key: "rArm", group: "Arms", label: "Right arm", hint: "Let your right arm relax at your side. Measure around the middle of your upper arm." },
  { id: "forearm_l", key: "lForearm", group: "Arms", label: "Left forearm", hint: "Arm relaxed and straight. Measure around the thickest part of your left forearm." },
  { id: "forearm_r", key: "rForearm", group: "Arms", label: "Right forearm", hint: "Arm relaxed and straight. Measure around the thickest part of your right forearm." },
  { id: "waist", key: "waist", group: "Middle", label: "Waist", hint: "Measure around your natural waist, between your lowest rib and the top of your hips. Keep the tape snug, without pulling it tight." },
  { id: "belly", key: "belly", group: "Middle", label: "Belly", hint: "Relax your stomach. Measure around your belly at the level of your belly button." },
  { id: "hips", key: "hips", group: "Middle", label: "Hips", hint: "Stand with your feet together and measure around the fullest part of your hips." },
  { id: "thigh", key: "lThigh", group: "Legs", label: "Left thigh", hint: "Measure around the fullest part of your left thigh, standing with your weight evenly balanced." },
  { id: "thigh_r", key: "rThigh", group: "Legs", label: "Right thigh", hint: "Measure around the fullest part of your right thigh, standing with your weight evenly balanced." },
  { id: "calf_l", key: "lCalf", group: "Legs", label: "Left calf", hint: "Stand straight. Measure around the widest part of your left calf." },
  { id: "calf_r", key: "rCalf", group: "Legs", label: "Right calf", hint: "Stand straight. Measure around the widest part of your right calf." },
  { id: "body_fat", key: "bodyFat", group: "Other", label: "Body fat", unit: "%", hint: "Only if you have a reading from a scale or a test. Leave it blank otherwise." },
];
export const MEASUREMENT_GROUPS = ["Upper body", "Arms", "Middle", "Legs", "Other"];
export const ALL_FIELD_IDS = MEASUREMENT_FIELDS.map((f) => f.id);
/** What a link asks for when the coach hasn't chosen (and what every link asked for before). */
export const DEFAULT_FIELD_IDS = ["chest", "waist", "hips", "arm", "thigh"];

/** 32 random bytes as base64url. */
export function generateToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * The code the coach sends on top of the link, so a forwarded link alone
 * can't connect an account. Six characters from an alphabet with no O/0 or
 * I/1 — it gets read out over the phone. Matches the database's own generator.
 */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function connectCode() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
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
  // Per-set targets (the coach's editor writes setList when the sets differ).
  const secsOf = (v) => (v != null && v !== "" && Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : null);
  const setList = Array.isArray(ex.setList) && ex.setList.length
    ? ex.setList.slice(0, 20).map((s) => {
        const o = { reps: s?.reps != null && s.reps !== "" ? String(s.reps) : null, weight: s?.weight != null && s.weight !== "" && Number.isFinite(Number(s.weight)) ? Number(s.weight) : null };
        if (s?.secs != null) o.secs = secsOf(s.secs);
        if (["warmup", "drop", "amrap"].includes(s?.kind)) o.kind = s.kind;
        return o;
      })
    : null;
  const out = {
    name: ex.name || "",
    setList,
    sets: setList ? setList.length : ex.sets != null && ex.sets !== "" ? Number(ex.sets) || null : null,
    reps: ex.reps != null && ex.reps !== "" ? String(ex.reps) : null,
    weight: ex.weight != null && ex.weight !== "" ? ex.weight : null,
    note: ex.coachNote || ex.note || null,
  };
  // Timed exercises (planks, runs) and supersets; absent on everything else.
  if (ex.mode === "time" || ex.secs != null || (setList || []).some((s) => s.secs != null)) { out.mode = "time"; out.secs = secsOf(ex.secs); }
  if (ex.superset) out.superset = String(ex.superset);
  if (Number(ex.rest) > 0) out.rest = Math.round(Number(ex.rest));
  return out;
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
/**
 * The measurements the coach asked for, in body order: shown first on the
 * client's link. None of them are required. No choice (or an empty one)
 * means the usual five.
 */
export function askedFields(requested) {
  const ids = Array.isArray(requested) ? ALL_FIELD_IDS.filter((id) => requested.includes(id)) : [];
  return ids.length ? ids : DEFAULT_FIELD_IDS;
}
/** Kept for older callers: the asked-for list. Nothing is required any more. */
export const requiredFields = askedFields;

/**
 * Client-side checks (link_submit repeats the ones for the original five).
 * Everything is optional: at least one number, and each one sensible.
 * Returns { ok, error, field }.
 */
export function validateMeasurements(values, unit, asked = DEFAULT_FIELD_IDS) {
  const metric = unit === "metric";
  const filled = (id) => values[id] != null && String(values[id]).trim() !== "";
  if (!["weight", ...ALL_FIELD_IDS].some(filled)) return { ok: false, error: "Add at least one measurement to send.", field: (asked && asked[0]) || ALL_FIELD_IDS[0] };
  for (const [id, raw] of Object.entries(values)) {
    if (raw == null || String(raw).trim() === "") continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) return { ok: false, error: "That doesn't look like a number.", field: id };
    if (id === "weight") {
      if (metric ? n < 20 || n > 400 : n < 44 || n > 880) return { ok: false, error: `Weight should be between ${metric ? "20 and 400 kg" : "44 and 880 lb"}.`, field: id };
    } else if (id === "body_fat") {
      if (n < 2 || n > 70) return { ok: false, error: "Body fat should be between 2 and 70%.", field: id };
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
// A time typed by the client ("1:30", "45") or set by the timer (a number of seconds).
const secsOrNull = (v) => (typeof v === "number" ? (v > 0 ? Math.round(v) : null) : parseDuration(v));
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
      const timed = e.mode === "time";
      const typed = perSet ? Array.from({ length: full }, (_, s) => ({ r: timed ? null : numOrNull(perSet[s]?.r), w: numOrNull(perSet[s]?.w), s: timed ? secsOrNull(perSet[s]?.s) : null })) : [];
      const firstWeight = typed.slice(0, done).find((x) => x.w != null)?.w ?? null;
      const out = {
        name: e.name,
        sets_planned: e.sets,
        sets_done: done,
        reps: e.reps,
        weight_target: e.weight,
        weight_used: perSet ? firstWeight : numOrNull(entry),
      };
      // What the coach asked for, set by set, when the sets differ.
      if (Array.isArray(e.setList) && e.setList.length) {
        out.plan_sets = e.setList.map((s) => { const o = {}; if (s.kind) o.k = s.kind; if (s.reps) o.r = String(s.reps); if (s.secs != null) o.s = s.secs; if (s.weight != null) o.w = s.weight; return o; });
      }
      if (timed) { out.mode = "time"; if (e.secs != null) out.secs_target = e.secs; }
      if (e.superset) out.superset = e.superset;
      // Something the client added on top of the plan (a run, a swim). The
      // coach's plan is untouched; their dashboard tags it as theirs.
      if (e.addedByClient) out.added_by_client = true;
      if (typed.some((x) => x.r != null || x.w != null || x.s != null)) {
        out.sets = typed.map((x, s) => {
          const one = { n: s + 1, done: s < done };
          if (x.r != null) one.reps = x.r;
          if (x.s != null) one.secs = x.s;
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
    weight: p.weight ?? undefined,
    // Every measurement under the dashboard's name for it (arm → lArm, thigh_r → rThigh…).
    ...Object.fromEntries(MEASUREMENT_FIELDS.filter((f) => p[f.id] != null && p[f.id] !== "").map((f) => [f.key, Number(p[f.id])])),
    source: "link",
  };
}

/** A workout submission row → the history entry shape the dashboard already uses. */
/** What one done set weighed and how many reps: what the client typed, else what the coach planned. */
export function doneSets(e) {
  const firstNum = (r) => (r ? String(r).replace(/[^0-9].*$/, "") : "");
  const w = (x) => (x != null && x !== "" ? String(x) : "");
  const ps = Array.isArray(e.plan_sets) ? e.plan_sets : null;
  // What the coach planned for set `i` (0-based): its own numbers when the sets differ.
  const planR = (i) => firstNum(ps?.[i]?.r ?? e.reps);
  // Timed exercises (planks, runs) carry seconds instead of reps.
  const planS = (i) => { const v = ps?.[i]?.s ?? e.secs_target; const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 ? n : null; };
  const timed = e.mode === "time";
  if (Array.isArray(e.sets) && e.sets.length) {
    // Per set, a blank weight means the planned one (weight_used is just the first typed weight).
    const planW = (i) => ps?.[i]?.w ?? e.weight_target ?? e.weight_used;
    return e.sets.filter((s) => s && s.done).map((s) => {
      const i = (Number(s.n) || 1) - 1;
      const out = { w: w(s.weight ?? planW(i)), r: s.reps != null ? String(s.reps) : planR(i) };
      if (timed) { const secs = s.secs ?? planS(i); if (secs != null) out.s = secs; }
      return out;
    });
  }
  const planW = (i) => ps?.[i]?.w ?? e.weight_used ?? e.weight_target;
  return Array.from({ length: e.sets_done || 0 }, (_, i) => {
    const out = { w: w(planW(i)), r: planR(i) };
    if (timed && planS(i) != null) out.s = planS(i);
    return out;
  });
}

export function submissionToHistory(sub) {
  const p = sub.payload || {};
  const exercises = (p.exercises || []).filter((e) => (e.sets_done || 0) > 0).map((e) => ({ name: e.name, sets: doneSets(e) }));
  const totalSets = exercises.reduce((a, e) => a + e.sets.length, 0);
  const totalVolume = exercises.reduce((a, e) => a + e.sets.reduce((s, x) => s + (Number(x.w) || 0) * (Number(x.r) || 0), 0), 0);
  return { id: sub.id, date: submissionDate(sub), type: p.type || "Workout", duration: 45 * 60, startedAt: sub.submitted_at, exercises, totalSets, totalVolume, source: "link", byCoach: p.logged_by === "coach", note: p.note || "", feel: p.feel || null, plannedSets: (p.exercises || []).reduce((a, e) => a + (e.sets_planned || 0), 0) };
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
  return { history, measurements, weights, unitSystem, submissions: subs, timeZone: timeZoneFromSubmissions(subs) };
}

/**
 * The client's timezone, from the newest thing they sent through their link
 * (the link page stamps `tz` on every send, #95). Workouts a coach logged for
 * them don't count: those carry no timezone of the client's.
 */
export function timeZoneFromSubmissions(submissions) {
  const newest = [...(submissions || [])]
    .filter((s) => s?.payload?.logged_by !== "coach" && validTimeZone(s?.payload?.tz))
    .sort((a, b) => (a.submitted_at < b.submitted_at ? 1 : a.submitted_at > b.submitted_at ? -1 : 0))[0];
  return newest ? newest.payload.tz : null;
}
