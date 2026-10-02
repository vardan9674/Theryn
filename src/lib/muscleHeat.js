// Which muscles a finished workout actually worked, and how hard.
//
// Used by the link page's receipt to draw a heat map after the client sends a
// workout. Pure; no React, no network — the map it reads is bundled
// (src/lib/muscleMap.generated.js), so the picture cannot fail to appear at the
// one moment the client is looking for it.
//
// It counts sets the client *ticked*, not sets the coach planned. A skipped
// exercise leaves its muscles cold, which is the honest picture and the useful
// one: the point is what they did, not what was asked of them.

/** Short plain words for a sentence. GROUP_LABEL is for lists and headings. */
export const HEAT_WORD = {
  chest: "chest", shoulders: "shoulders", biceps: "biceps", triceps: "triceps",
  forearms: "forearms", abs: "abs", traps: "traps", upperback: "upper back",
  lowerback: "lower back", glutes: "glutes", quads: "quads",
  hamstrings: "hamstrings", adductors: "inner thighs", calves: "calves", neck: "neck",
};

// A helper muscle is doing real work, but not the work the exercise is for.
const HELPER_SHARE = 0.4;

// Words that describe the load or the setup rather than the movement. Dropping
// them lets "Dumbbell Bench Press" find "Bench Press": the chest is the chest
// whichever way the weight is held. This is deliberately looser than
// src/coach/lib/exerciseMatch.js, which must keep equipment apart because it
// decides exercise *identity* — two lifts with separate histories. Here a wrong
// guess only tints a muscle slightly differently, so reaching an answer beats
// holding out for an exact name.
const LOAD_WORDS = new Set([
  "barbell", "dumbbell", "dumbell", "kettlebell", "cable", "machine", "smith",
  "band", "banded", "plate", "weighted", "bodyweight", "ez", "landmine", "sled",
  "ring", "suspended", "resistance", "lever", "leverage", "olympic",
  "treadmill", "stationary", "trainer", "pulley",
]);

// How you stand or hold it. Same reasoning as LOAD_WORDS.
//
// Nothing that names a body part or a direction belongs here. Dropping "leg"
// turned a Leg Curl into a biceps curl, and dropping "overhead" turned an
// Overhead Press into a bench press — both wrong, and wrong in a way the client
// would notice on the picture. So "leg", "arm", "front", "back", "side",
// "reverse", "overhead" and the like stay put even though they are modifiers.
const STYLE_WORDS = new Set([
  "seated", "standing", "lying", "kneeling", "incline", "decline", "flat",
  "close", "wide", "medium", "narrow", "neutral", "grip", "single", "one",
  "two", "double", "alternate", "alternating", "assisted", "version", "style",
  "with", "without", "on", "off", "the", "a", "an", "and", "to", "in", "of",
  "from", "at", "for",
]);

/**
 * curls → curl, crunches → crunch, raises → raise, ups → up, press → press.
 *
 * Crude, but it must be *idempotent*: the generated keys and the name being looked
 * up both pass through here, so stemming a stem has to change nothing. "es" only
 * comes off when the stem needs it to be a word ("crunch|es", "press|es"), because
 * otherwise "raises" loses its "e" and stems again to "rai".
 */
function singular(w) {
  if (w.length < 3 || !w.endsWith("s") || w.endsWith("ss")) return w;
  if (/(?:ch|sh|x|z|ss)es$/.test(w)) return w.slice(0, -2);
  return w.slice(0, -1);
}

/** Fold a name to bare singular words: lower case, no accents, no punctuation. */
export function normalizeExerciseName(name) {
  return String(name == null ? "" : name)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(singular)
    .join(" ");
}

// Gym shorthand, spelled out before lookup: "Flat DB Press" is a dumbbell
// press, "Bentover Rowing" a bent-over row. Lookup only; names are never
// rewritten anywhere a client or coach would see them.
const SHORTHAND = { db: "dumbbell", dbs: "dumbbell", bb: "barbell", kb: "kettlebell", bentover: "bent over", rowing: "row" };
const words = (name) => normalizeExerciseName(name).split(" ").filter(Boolean).flatMap((w) => (SHORTHAND[w] || w).split(" "));

// Everyday names for lifts the bundled map knows under another name. Keys are
// lookup keys (after shorthand and singulars); values are map names.
const SAME_AS = {
  "dumbbell press": "dumbbell bench press",
  "dumbbell overhead press": "dumbbell shoulder press",
  "rope tricep pushdown": "tricep pushdown rope attachment",
  "bar tricep pushdown": "tricep pushdown",
  "cable tricep pushdown": "tricep pushdown",
  "tricep rope pushdown": "tricep pushdown rope attachment",
  "kickback": "tricep dumbbell kickback",
  "sumo squat": "plie dumbbell squat",
  "slam ball front": "arm medicine ball slam",
  "slam ball": "arm medicine ball slam",
  "ball slam": "arm medicine ball slam",
};
// Bodyweight and conditioning moves the map doesn't carry, main muscle first.
// Only ones whose work is plain; anything vaguer stays unknown and is named
// as such, rather than guessed.
const MOVES = {
  "burpee": ["quads", "chest", "shoulders", "triceps", "abs"],
  "jumping jack": ["calves", "shoulders", "quads", "glutes"],
  "high knee": ["quads", "abs", "calves"],
  "shoulder tap": ["abs", "shoulders", "chest"],
  "hamstring walk": ["hamstrings", "glutes"],
};
const droppable = (w) => LOAD_WORDS.has(w) || STYLE_WORDS.has(w);

/**
 * The keys a name should be findable under, most specific first:
 *   "Incline Dumbbell Bench Press" →
 *     ["incline dumbbell bench press", "dumbbell bench press", "bench press"]
 *   "Lying Leg Curl" → ["lying leg curl", "leg curl"]   ← stops at "leg"
 * Reduced forms are what let a coach's own wording still land on the right muscles.
 *
 * Modifiers come off the ends only — trailing ones first ("Bench Press Medium
 * Grip" → "Bench Press"), then leading ones one at a time, stopping at the first
 * word that carries meaning. Filtering modifiers out of the middle of a name
 * would strip "Leg" from "Lying Leg Curl" and leave the bare "curl".
 */
export function mapKeys(name) {
  const all = words(name);
  if (!all.length) return [];
  const out = [all.join(" ")];

  let end = all.length;
  while (end > 1 && droppable(all[end - 1])) end--;
  const core = all.slice(0, end);

  for (let i = 0; i < core.length; i++) {
    out.push(core.slice(i).join(" "));
    if (!droppable(core[i])) break;     // meaningful word: reduce no further
  }
  return [...new Set(out)];
}

/**
 * Muscle groups for one exercise name, most important first, or null when the
 * name is not one we know. Null matters: it is the difference between "this
 * worked nothing" and "we don't know what this worked", and the screen says so.
 */
export function musclesForExercise(name, map) {
  if (!map) return null;
  for (const key of mapKeys(name)) {
    const hit = map[key] || map[SAME_AS[key]] || MOVES[key];
    if (Array.isArray(hit) && hit.length) return hit;
  }
  return null;
}

/**
 * A finished workout → what to draw.
 *
 * `exercises` is [{ name, sets }], where sets is how many the client ticked.
 * Returns:
 *   levels     groupId → 1 (some) | 2 (a fair bit) | 3 (the most), for shading
 *   top        the level-3 groups, hardest first, for the sentence
 *   worked     every group touched, hardest first
 *   unknown    names we could not place
 *   counted    how many exercises did land on the map
 */
export function heatFromWorkout(exercises, map) {
  const score = new Map();       // everything, for shading the figure
  const mainScore = new Map();   // only muscles an exercise is *for*, for the sentence
  const unknown = [];
  let counted = 0;

  for (const ex of Array.isArray(exercises) ? exercises : []) {
    const sets = Number(ex?.sets) || 0;
    if (sets <= 0) continue;                      // skipped: it worked nothing
    const groups = musclesForExercise(ex?.name, map);
    if (!groups) {
      const label = String(ex?.name || "").trim();
      if (label && !unknown.includes(label)) unknown.push(label);
      continue;
    }
    counted++;
    groups.forEach((g, i) => {
      if (!HEAT_WORD[g]) return;
      score.set(g, (score.get(g) || 0) + sets * (i === 0 ? 1 : HELPER_SHARE));
      if (i === 0) mainScore.set(g, (mainScore.get(g) || 0) + sets);
    });
  }

  const rank = (m) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const ranked = rank(score);

  // How bright a muscle burns is decided by the work aimed *at* it, not by the
  // helper work that piles up on it. A leg day of squats and deadlifts lends the
  // calves a little from nearly every exercise; scored together, that outranks the
  // quads and the picture ends up disagreeing with the sentence under it. So a
  // muscle nothing was aimed at is only ever tinted, never lit.
  const mains = rank(mainScore);
  const mainMax = mains.length ? mains[0][1] : 0;
  const levels = {};
  for (const [g] of ranked) {
    const v = mainScore.get(g) || 0;
    levels[g] = !v ? 1 : v >= mainMax * 0.66 ? 3 : v >= mainMax * 0.33 ? 2 : 1;
  }

  // The words name the two the session was most for, and stay quiet about the rest.
  const top = mains.filter(([, v]) => v >= mainMax * 0.6).slice(0, 2).map(([g]) => g);

  // Only the muscles something was actually aimed at get named. A deadlift alone
  // touches eight groups, and listing every one of them turns the card into a
  // wall of words nobody reads. The rest still tint the figure, which says "these
  // helped" without spending a line on each.
  const worked = ranked.map(([g]) => g)
    .filter((g) => levels[g] >= 2)
    .sort((a, b) => levels[b] - levels[a]);

  return { levels, top, worked, unknown, counted };
}

/** "chest and triceps" / "chest, shoulders and triceps" */
export function muscleWords(groups) {
  const list = (groups || []).map((g) => HEAT_WORD[g]).filter(Boolean);
  if (!list.length) return "";
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/** The one line under the figure. Says what they worked, in words, or nothing. */
export function heatSentence(heat) {
  const words = muscleWords(heat?.top);
  return words ? `Mostly ${words}.` : "";
}

/**
 * What to say about exercises we could not place — plainly, and only when there
 * is something to say. Naming one is more use than a count; past that a count
 * reads better than a list.
 */
export function unknownNote(heat) {
  const list = heat?.unknown || [];
  if (!list.length) return "";
  if (list.length === 1) return `${list[0]} isn't in our exercise list yet, so it isn't shown here.`;
  return `${list.length} exercises aren't in our list yet, so they aren't shown here.`;
}
