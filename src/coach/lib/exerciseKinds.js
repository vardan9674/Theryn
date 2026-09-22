// Two things an exercise in a plan can be besides "sets of reps":
//
//   Timed  — { mode: "time", secs: 60 } or per set setList[i].secs. Planks,
//            holds, runs, bikes. Time boxes fill from the right like a timer
//            (130 → 01:30); the client gets a timer on the link page.
//   Superset — { superset: "A" } on two or more exercises in a row. Done back
//            to back, then rest. Labelled A1, A2, B1…
//
// Pure; no React. Stored in the plan JSON, so no schema change for clients.

// Names that are almost always done for time, not reps.
const TIMED = /\b(plank|hold|wall ?sit|dead ?hang|hang|run|jog|walk|sprint|treadmill|bike|cycl|spin|row(ing)? (machine|erg)|erg|swim|elliptical|stair|stepper|skip(ping)?|jump ?rope|rope|stretch|yoga|mobility|cardio|l-?sit|hollow)\b/i;
const LONG = /\b(run|jog|walk|treadmill|bike|cycl|spin|swim|elliptical|stair|stepper|cardio|row(ing)? (machine|erg)|erg)\b/i;

/** "reps" or "time" for a new exercise with this name. */
export function defaultMode(name) {
  return TIMED.test(String(name || "")) ? "time" : "reps";
}

/** A sensible starting target in seconds for a timed exercise. */
export function defaultSecs(name) {
  return LONG.test(String(name || "")) ? 20 * 60 : 45;
}

/**
 * What the coach or client typed → seconds, or null.
 *   "45" → 45, "45s" → 45, "1:30" → 90, "20m" / "20 min" → 1200,
 *   "1h" → 3600, "1:05:00" → 3900. Bare numbers are seconds.
 */
export function parseDuration(raw) {
  const s = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  let m;
  if ((m = s.match(/^(\d{1,2}):(\d{1,2}):(\d{1,2})$/))) return clamp(+m[1] * 3600 + +m[2] * 60 + +m[3]);
  if ((m = s.match(/^(\d{1,3}):(\d{1,2})$/))) return clamp(+m[1] * 60 + +m[2]);
  if ((m = s.match(/^(\d+(?:\.\d+)?)(h|hr|hrs|hours?)$/))) return clamp(Math.round(+m[1] * 3600));
  if ((m = s.match(/^(\d+(?:\.\d+)?)(m|min|mins|minutes?)$/))) return clamp(Math.round(+m[1] * 60));
  if ((m = s.match(/^(\d+)(s|sec|secs|seconds?)?$/))) return clamp(+m[1]);
  return null;
}
const clamp = (n) => (Number.isFinite(n) && n > 0 ? Math.min(n, 6 * 3600) : null);

/** Seconds → "45 s", "1:30", "20 min", "1:05:00" for reading. */
export function formatDuration(secs) {
  const n = Math.round(Number(secs));
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 60) return `${n} s`;
  const h = Math.floor(n / 3600), m = Math.floor((n % 3600) / 60), s = n % 60;
  if (h) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  if (s === 0) return `${m} min`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const two = (n) => String(n).padStart(2, "0");

/** A clock face: "00:42", "12:05", "1:00:00". Every time box and timer uses this. */
export function clock(secs) {
  const n = Math.max(0, Math.round(Number(secs) || 0));
  const h = Math.floor(n / 3600), m = Math.floor((n % 3600) / 60), s = n % 60;
  return h ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
}

/** Seconds → what goes back into a time box: "00:45", "01:30", "20:00" ("" for none). */
export function durationInput(secs) {
  const n = Math.round(Number(secs));
  return Number.isFinite(n) && n > 0 ? clock(n) : "";
}

/**
 * A time box that fills from the right, like a timer: the digits typed so far,
 * always shown as 00:00. "1" → "00:01", "100" → "01:00", "130" → "01:30",
 * "2000" → "20:00", "10000" → "1:00:00". Seconds over 59 ("00:90") are read
 * as they are and tidied to 01:30 when the box loses focus.
 */
export function maskDuration(raw) {
  const d = String(raw || "").replace(/\D/g, "").replace(/^0+/, "").slice(0, 6);
  if (!d) return "";
  if (d.length <= 4) { const p = d.padStart(4, "0"); return `${p.slice(0, 2)}:${p.slice(2)}`; }
  const q = d.padStart(6, "0");
  return `${Number(q.slice(0, 2))}:${q.slice(2, 4)}:${q.slice(4)}`;
}

/** Tidies a time box when it loses focus: "00:90" → "01:30". */
export const tidyDuration = (v) => durationInput(parseDuration(v));

/**
 * Where each exercise sits in a superset. Two or more exercises in a row that
 * share a `superset` value form one; they are lettered A, B, C in order. A
 * lone exercise with a value is not a superset. Returns, per exercise,
 * { letter, pos, size } (pos from 1) or null.
 */
export function supersetInfo(exercises) {
  const list = exercises || [];
  const out = list.map(() => null);
  let letter = 0;
  for (let i = 0; i < list.length;) {
    const g = groupOf(list[i]);
    let j = i + 1;
    if (g != null) while (j < list.length && groupOf(list[j]) === g) j++;
    if (g != null && j - i >= 2) {
      const L = String.fromCharCode(65 + (letter++ % 26));
      for (let k = i; k < j; k++) out[k] = { letter: L, pos: k - i + 1, size: j - i };
    }
    i = j;
  }
  return out;
}
const groupOf = (ex) => {
  const v = ex && typeof ex === "object" ? ex.superset : null;
  return v == null || v === "" ? null : String(v);
};

/** The exercises with their superset values rewritten to clean letters (lone ones cleared). */
export function normalizeSupersets(exercises) {
  const info = supersetInfo(exercises);
  return (exercises || []).map((ex, i) => {
    if (!ex || typeof ex !== "object") return ex;
    const o = { ...ex };
    if (info[i]) o.superset = info[i].letter; else delete o.superset;
    return o;
  });
}
