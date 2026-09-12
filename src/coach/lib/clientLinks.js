// Pure helpers for shareable client links (decision 0006).

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

/** Client-side validation mirroring link_submit. Returns { ok, error, field }. */
export function validateMeasurements(values, unit, requested) {
  const metric = unit === "metric";
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

/** Build the payload the RPC expects. Empty values are dropped. */
export function measurementsPayload(values, unit, date) {
  const out = { unit, date };
  for (const id of ["weight", ...ALL_FIELD_IDS]) {
    const v = values[id];
    if (v != null && String(v).trim() !== "") out[id] = Number(v);
  }
  return out;
}

export function workoutPayload(today, ticks, weights, note, date) {
  return {
    date,
    day: today.key,
    type: today.type,
    exercises: today.exercises.map((e, i) => ({
      name: e.name,
      sets_planned: e.sets,
      sets_done: Math.min(ticks[i] || 0, e.sets || 20),
      reps: e.reps,
      weight_target: e.weight,
      weight_used: weights[i] != null && String(weights[i]).trim() !== "" ? Number(weights[i]) : null,
    })),
    note: (note || "").trim().slice(0, 500),
  };
}

/** A submission row → what the coach's Body tab shows for name-only clients. */
export function submissionToMeasurement(sub) {
  const p = sub.payload || {};
  const metric = p.unit === "metric";
  return {
    id: sub.id, date: p.date || String(sub.submitted_at).slice(0, 10), unit: metric ? "cm" : "in", weightUnit: metric ? "kg" : "lb",
    weight: p.weight ?? undefined, chest: p.chest ?? undefined, waist: p.waist ?? undefined, hips: p.hips ?? undefined, lArm: p.arm ?? undefined, lThigh: p.thigh ?? undefined,
    source: "link",
  };
}

/** A workout submission row → the history entry shape the dashboard already uses. */
export function submissionToHistory(sub) {
  const p = sub.payload || {};
  const exercises = (p.exercises || []).filter((e) => (e.sets_done || 0) > 0).map((e) => ({
    name: e.name,
    sets: Array.from({ length: e.sets_done || 0 }, () => ({ w: e.weight_used != null ? String(e.weight_used) : "", r: e.reps ? String(e.reps).replace(/[^0-9].*$/, "") : "" })),
  }));
  const totalSets = exercises.reduce((a, e) => a + e.sets.length, 0);
  const totalVolume = exercises.reduce((a, e) => a + e.sets.reduce((s, x) => s + (Number(x.w) || 0) * (Number(x.r) || 0), 0), 0);
  return { id: sub.id, date: p.date || String(sub.submitted_at).slice(0, 10), type: p.type || "Workout", duration: 45 * 60, startedAt: sub.submitted_at, exercises, totalSets, totalVolume, source: "link", note: p.note || "", plannedSets: (p.exercises || []).reduce((a, e) => a + (e.sets_planned || 0), 0) };
}
