// What an exercise is done with, read from its name — so the link page only asks
// for the numbers that exist.
//
//   body   — push-ups, leg raises, crunches: reps only, no weight box
//   band   — a resistance band: how hard the band was (easy / medium / hard)
//   weight — everything else: reps and weight, as before
//
// The name decides, not the exercise library. The library's equipment tags are
// too loose for this (its "Split Squat" is a dumbbell lift, and a reduced name
// like "Lunge" could be either), and a wrong guess here hides a box the client
// needs. So anything that names a load is weights, only well-known bodyweight
// moves are bodyweight, and anything unknown keeps both boxes — today's page.
//
// Pure; no React.
import { defaultMode, parseDuration } from "../coach/lib/exerciseKinds.js";

const BAND = /\b(bands?|banded|mini ?bands?|resistance)\b/i;

// Names that say what the weight is. These win over a bodyweight word:
// "Weighted Pull-Up", "Cable Crunch", "Dumbbell Russian Twist".
const LOADED = /\b(barbell|dumbbells?|db|kettlebells?|kb|cable|machine|smith|weighted|plates?|sled|ez|landmine|trap ?bar|hex ?bar|medicine ball|med ?ball|sandbag|vest|lever|leverage|pulley)\b/i;

// Moves nearly always done with nothing but the body.
const BODY = new RegExp("\\b(" + [
  "push ?-?ups?", "press ?-?ups?", "pull ?-?ups?", "chin ?-?ups?", "dips?", "sit ?-?ups?",
  "crunch(es)?", "leg raises?", "leg lifts?", "knee raises?", "knee tucks?", "tuck ?-?ups?", "v ?-?ups?",
  "flutter kicks?", "scissor kicks?", "mountain climbers?", "burpees?", "jumping jacks?", "star jumps?",
  "jump squats?", "air squats?", "bodyweight", "body ?weight", "dead ?bugs?", "bird ?dogs?", "supermans?",
  "glute bridges?", "hip bridges?", "russian twists?", "heel touch(es|ers)?", "toe touch(es)?",
  "windshield wipers?", "pike push", "handstand", "pistol squats?", "inverted rows?", "australian pull",
  "hyperextensions?", "back extensions?", "high knees", "butt kicks", "bear crawls?", "inchworms?",
  "skaters?", "box jumps?", "broad jumps?", "tuck jumps?", "jumping lunges?", "planks?", "wall ?sit",
  "l-?sit", "dead ?hang", "hollow", "shoulder taps?", "toes to bar", "knees to (elbows?|chest)",
].join("|") + ")\\b", "i");

/** "body", "band" or "weight" for an exercise name. */
export function loadKind(name) {
  const n = String(name || "");
  if (BAND.test(n)) return "band";
  if (LOADED.test(n)) return "weight";
  if (BODY.test(n)) return "body";
  return "weight";
}

// How hard the band was. The same three words the client already uses for how
// the workout felt.
export const BAND_LEVELS = [
  { id: "easy", label: "Easy" },
  { id: "medium", label: "Medium" },
  { id: "hard", label: "Hard" },
];
export const bandLevel = (v) => (BAND_LEVELS.some((b) => b.id === v) ? v : null);

/**
 * The same exercise without its kit, when the kit is what was missing:
 *   "Banded Leg Raise" → "Leg Raise", "Leg Raise with Band" → "Leg Raise",
 *   "Weighted Dips" → "Dips". Null when there is nothing to take off.
 * Only bands and added weight: a barbell squat without the barbell is not the
 * same lift, and the page shouldn't suggest it is.
 */
export function withoutKit(name) {
  const raw = String(name || "").trim();
  const out = raw
    .replace(/\b(with|using|on|w\/)\s+(an?\s+)?(resistance\s+)?(mini\s*)?bands?\b/gi, "")
    .replace(/\b(resistance\s+)?(mini\s*)?bands?\b|\bbanded\b|\bweighted\b/gi, "")
    .replace(/\(\s*\)/g, "")
    .replace(/[\s\-–(),]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!out || out.toLowerCase() === raw.toLowerCase()) return null;
  return out.charAt(0).toUpperCase() + out.slice(1);
}

// Held still for a time. Narrower than defaultMode's list on purpose: this one
// turns a coach's plan into a timer, and "hang" or "rope" there would catch a
// Hang Clean or a Rope Pushdown.
const HOLD = /\b(planks?|wall ?sit|dead ?hang|l-?sit|hollow( body)?( hold)?|holds?|isometric)\b/i;

/** Seconds from what a coach wrote as reps for a hold: "30", "45s", "1:00", "30-45". */
function secsFromReps(reps) {
  const s = String(reps ?? "").trim();
  if (!s) return null;
  const n = parseDuration(s) ?? parseDuration((s.match(/\d+/) || [""])[0]);
  return n != null && n >= 10 ? n : null;
}

/**
 * A plan exercise as the client should log it. A plank the coach wrote as
 * "3 × 30" (reps, because that was the only box) is a 30-second hold: it gets
 * the timer. Anything the coach already marked as timed, or that isn't held
 * still, comes back unchanged.
 */
export function asLogged(ex) {
  if (!ex || ex.mode === "time" || !HOLD.test(String(ex.name || ""))) return ex;
  const secs = secsFromReps(ex.reps);
  const setList = Array.isArray(ex.setList) && ex.setList.length
    ? ex.setList.map((s) => ({ ...s, secs: s.secs ?? secsFromReps(s.reps) ?? secs }))
    : ex.setList;
  return { ...ex, mode: "time", secs, ...(setList ? { setList } : {}) };
}

/**
 * The plan's exercise, done as something else. Sets carry over, since the slot
 * is the same; the weight target does not (the plan's 20 kg was for the other
 * exercise). Reps or time follows what the client picked.
 *   ex  — the plan's exercise, after asLogged
 *   to  — { name, mode: "reps" | "time" }
 */
export function swapFor(ex, to) {
  const name = String(to?.name || "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (!ex || !name || name.toLowerCase() === String(ex.name || "").trim().toLowerCase()) return ex;
  const timed = (to.mode || defaultMode(name)) === "time";
  const out = { ...ex, name, swappedFrom: ex.name, weight: null };
  delete out.alternatives;
  const rows = Array.isArray(ex.setList) && ex.setList.length ? ex.setList : null;
  if (timed) {
    // A time for a reps exercise can't be read off its reps; the timer counts up.
    out.mode = "time";
    out.secs = ex.mode === "time" ? ex.secs ?? null : null;
    if (rows) out.setList = rows.map((s) => ({ ...s, weight: null, secs: ex.mode === "time" ? s.secs ?? null : null }));
  } else {
    delete out.mode; delete out.secs;
    // Reps carry over from a reps exercise; a timed one had none.
    if (ex.mode === "time") out.reps = null;
    if (rows) out.setList = rows.map((s) => { const o = { ...s, weight: null }; delete o.secs; if (ex.mode === "time") o.reps = null; return o; });
  }
  return out;
}

