// Exercise library for the athlete picker and exercise info sheet.
//
// Source data is public/exercises.json (free-exercise-db, public domain, 873 entries).
// Its muscle tags were reviewed by hand on 2026-09-26; CORRECTIONS below fixes the
// entries that were wrong, and TYPE_OF moves Olympic lifts out of "strength".
// The body map groups (MUSCLE_GROUPS) match the regions of the body drawing in
// src/lib/bodyMap/bodyPaths.js.

/** Muscle groups a person can tap, in display order. */
export const MUSCLE_GROUPS = [
  { id: "chest", label: "Chest" },
  { id: "shoulders", label: "Shoulders" },
  { id: "biceps", label: "Biceps" },
  { id: "triceps", label: "Triceps" },
  { id: "forearms", label: "Forearms" },
  { id: "abs", label: "Abs & obliques" },
  { id: "traps", label: "Traps" },
  { id: "upperback", label: "Upper back & lats" },
  { id: "lowerback", label: "Lower back" },
  { id: "glutes", label: "Glutes & outer hip" },
  { id: "quads", label: "Quads" },
  { id: "hamstrings", label: "Hamstrings" },
  { id: "adductors", label: "Inner thigh" },
  { id: "calves", label: "Calves" },
  { id: "neck", label: "Neck" },
];
export const GROUP_LABEL = Object.fromEntries(MUSCLE_GROUPS.map((g) => [g.id, g.label]));

/** Body drawing part slug -> muscle group. Parts not listed (head, hands, knees, tibialis...) are not tappable. */
export const SLUG_TO_GROUP = {
  chest: "chest", deltoids: "shoulders", biceps: "biceps", triceps: "triceps", forearm: "forearms",
  abs: "abs", obliques: "abs", trapezius: "traps", "upper-back": "upperback", "lower-back": "lowerback",
  gluteal: "glutes", quadriceps: "quads", hamstring: "hamstrings", adductors: "adductors",
  calves: "calves", neck: "neck",
};

/** Dataset muscle name -> muscle group. */
export const MUSCLE_TO_GROUP = {
  chest: "chest", shoulders: "shoulders", biceps: "biceps", triceps: "triceps", forearms: "forearms",
  abdominals: "abs", traps: "traps", lats: "upperback", "middle back": "upperback",
  "lower back": "lowerback", glutes: "glutes", abductors: "glutes", quadriceps: "quads",
  hamstrings: "hamstrings", adductors: "adductors", calves: "calves", neck: "neck",
};

/** Plain words for dataset muscles in "also works" lines. */
const MUSCLE_WORD = {
  abdominals: "abs", quadriceps: "quads", "middle back": "mid back", abductors: "outer hip",
  adductors: "inner thigh",
};

/** Dataset equipment -> equipment id. Missing equipment in the dataset means bodyweight. */
export const EQUIPMENT = [
  { id: "barbell", label: "Barbell" },
  { id: "dumbbell", label: "Dumbbell" },
  { id: "cable", label: "Cable" },
  { id: "machine", label: "Machine" },
  { id: "body", label: "Bodyweight" },
  { id: "ez", label: "EZ bar" },
  { id: "kettlebell", label: "Kettlebell" },
  { id: "band", label: "Band" },
  { id: "other", label: "Ball or other" },
];
export const EQUIPMENT_LABEL = Object.fromEntries(EQUIPMENT.map((e) => [e.id, e.label]));
const EQUIPMENT_OF = {
  barbell: "barbell", dumbbell: "dumbbell", cable: "cable", machine: "machine", "body only": "body",
  "": "body", kettlebells: "kettlebell", bands: "band", "e-z curl bar": "ez", other: "other",
  "medicine ball": "other", "exercise ball": "other", "foam roll": "other",
};
/** A typical gym, used until a person tells us what they have. */
export const DEFAULT_EQUIPMENT = ["barbell", "dumbbell", "cable", "machine", "body", "ez"];

export const TYPES = [
  { id: "strength", label: "Strength" },
  { id: "power", label: "Olympic & strongman" },
  { id: "plyo", label: "Jumps & drills" },
  { id: "cardio", label: "Cardio" },
  { id: "stretch", label: "Stretches" },
];
export const DEFAULT_TYPES = ["strength"];

const OLYMPIC = /\b(clean|snatch|jerk)\b/i;
function typeOf(category, name) {
  if (category === "strength" || category === "powerlifting") return OLYMPIC.test(name) ? "power" : "strength";
  if (category === "olympic weightlifting" || category === "strongman") return "power";
  if (category === "plyometrics") return "plyo";
  if (category === "cardio") return "cardio";
  if (category === "stretching") return "stretch";
  return null; // e.g. balance drills: not offered in the picker
}

/**
 * Dataset entries whose tags were wrong, found in the 2026-09-26 review.
 * primary/secondary use dataset muscle names.
 */
export const CORRECTIONS = {
  "Cable Hip Adduction": { primary: ["adductors"] },
  "Mixed Grip Chin": { primary: ["lats"], secondary: ["biceps", "middle back"] },
  "One Arm Chin-Up": { primary: ["lats"], secondary: ["biceps", "forearms", "middle back"] },
  "Bench Press - Powerlifting": { primary: ["chest"], secondary: ["triceps", "shoulders", "forearms", "lats"] },
  "Bench Press with Chains": { primary: ["chest"], secondary: ["triceps", "shoulders"] },
  "Reverse Band Bench Press": { primary: ["chest"], secondary: ["triceps", "shoulders"] },
  "Balance Board": { category: "balance" },
  "Air Bike": { name: "Air Bike (bicycle crunch)" },
};

/** The exercises most people mean when they pick a muscle, in order. The rest follow. */
export const STAPLES = {
  chest: ["Barbell Bench Press - Medium Grip", "Dumbbell Bench Press", "Barbell Incline Bench Press - Medium Grip", "Incline Dumbbell Press", "Pushups", "Dips - Chest Version", "Cable Crossover", "Dumbbell Flyes", "Machine Bench Press", "Butterfly", "Decline Barbell Bench Press", "Smith Machine Bench Press"],
  shoulders: ["Barbell Shoulder Press", "Dumbbell Shoulder Press", "Standing Military Press", "Seated Dumbbell Press", "Side Lateral Raise", "Arnold Dumbbell Press", "Front Dumbbell Raise", "Face Pull", "Reverse Flyes", "Cable Seated Lateral Raise", "Machine Shoulder (Military) Press", "Upright Barbell Row"],
  biceps: ["Barbell Curl", "Dumbbell Bicep Curl", "Hammer Curls", "Preacher Curl", "EZ-Bar Curl", "Incline Dumbbell Curl", "Concentration Curls", "Standing Biceps Cable Curl", "Dumbbell Alternate Bicep Curl", "Machine Bicep Curl"],
  triceps: ["Triceps Pushdown", "Triceps Pushdown - Rope Attachment", "EZ-Bar Skullcrusher", "Close-Grip Barbell Bench Press", "Dips - Triceps Version", "Bench Dips", "Standing Dumbbell Triceps Extension", "Triceps Overhead Extension with Rope", "Tricep Dumbbell Kickback", "Lying Triceps Press"],
  forearms: ["Palms-Up Barbell Wrist Curl Over A Bench", "Palms-Down Wrist Curl Over A Bench", "Farmer's Walk", "Wrist Roller", "Plate Pinch", "Cable Wrist Curl"],
  abs: ["Crunches", "Plank", "Hanging Leg Raise", "Cable Crunch", "Ab Roller", "Russian Twist", "Reverse Crunch", "Sit-Up", "Air Bike (bicycle crunch)", "Dead Bug", "Pallof Press", "Standing Cable Wood Chop", "Side Bridge"],
  traps: ["Barbell Shrug", "Dumbbell Shrug", "Cable Shrugs", "Smith Machine Behind the Back Shrug", "Standing Dumbbell Upright Row", "Upright Cable Row"],
  upperback: ["Pullups", "Wide-Grip Lat Pulldown", "Bent Over Barbell Row", "Seated Cable Rows", "One-Arm Dumbbell Row", "Chin-Up", "T-Bar Row with Handle", "Close-Grip Front Lat Pulldown", "Inverted Row", "Straight-Arm Pulldown", "Bent Over Two-Dumbbell Row", "Weighted Pull Ups"],
  lowerback: ["Barbell Deadlift", "Hyperextensions (Back Extensions)", "Rack Pulls", "Deficit Deadlift", "Seated Good Mornings", "Stiff Leg Barbell Good Morning", "Weighted Ball Hyperextension"],
  glutes: ["Barbell Hip Thrust", "Barbell Glute Bridge", "Pull Through", "Glute Kickback", "One-Legged Cable Kickback", "Single Leg Glute Bridge", "Thigh Abductor", "Butt Lift (Bridge)", "Step-up with Knee Raise", "Monster Walk"],
  quads: ["Barbell Squat", "Front Barbell Squat", "Leg Press", "Leg Extensions", "Goblet Squat", "Dumbbell Lunges", "Barbell Walking Lunge", "Hack Squat", "Split Squat with Dumbbells", "Dumbbell Step Ups", "Bodyweight Squat", "Smith Machine Squat", "Trap Bar Deadlift"],
  hamstrings: ["Romanian Deadlift", "Lying Leg Curls", "Seated Leg Curl", "Stiff-Legged Barbell Deadlift", "Good Morning", "Glute Ham Raise", "Stiff-Legged Dumbbell Deadlift", "Standing Leg Curl", "Sumo Deadlift", "Kettlebell One-Legged Deadlift", "Ball Leg Curl", "Natural Glute Ham Raise"],
  adductors: ["Thigh Adductor", "Cable Hip Adduction", "Band Hip Adductions"],
  calves: ["Standing Calf Raises", "Seated Calf Raise", "Calf Press On The Leg Press Machine", "Donkey Calf Raises", "Standing Dumbbell Calf Raise", "Smith Machine Calf Raise"],
};
const STAPLE_RANK = {};
for (const list of Object.values(STAPLES)) list.forEach((name, i) => { STAPLE_RANK[name] = i; });
const LEVEL_RANK = { beginner: 0, intermediate: 1, expert: 2 };

/**
 * Turns raw dataset entries into library entries, with corrections applied, sorted
 * staples first, then compound before isolation, easier before harder, then by name.
 * @param {Array<object>} raw  entries from public/exercises.json
 */
export function buildLibrary(raw) {
  const out = [];
  for (const e of raw || []) {
    if (!e || typeof e.name !== "string" || !Array.isArray(e.primaryMuscles) || !e.primaryMuscles.length) continue;
    const fix = CORRECTIONS[e.name] || {};
    const name = fix.name || e.name;
    const primary = fix.primary || e.primaryMuscles;
    const secondary = fix.secondary || e.secondaryMuscles || [];
    const type = typeOf(fix.category || e.category, name);
    const group = MUSCLE_TO_GROUP[primary[0]];
    if (!type || !group) continue;
    out.push({
      id: e.id,
      name,
      sourceName: e.name,
      group,
      muscle: primary[0],
      helpers: secondary.filter((m) => MUSCLE_TO_GROUP[m]),
      helperGroups: [...new Set(secondary.map((m) => MUSCLE_TO_GROUP[m]).filter((g) => g && g !== group))],
      equipment: EQUIPMENT_OF[e.equipment || ""] || "other",
      type,
      level: e.level || "",
      mechanic: e.mechanic || "",
      instructions: Array.isArray(e.instructions) ? e.instructions : [],
      rank: STAPLE_RANK[name] ?? 999,
    });
  }
  out.sort((a, b) =>
    a.rank - b.rank
    || (a.mechanic === "compound" ? 0 : 1) - (b.mechanic === "compound" ? 0 : 1)
    || (LEVEL_RANK[a.level] ?? 1) - (LEVEL_RANK[b.level] ?? 1)
    || a.name.localeCompare(b.name));
  return out;
}

/** "Also works: shoulders, triceps" or "" */
export function alsoWorks(entry, max = 3) {
  const words = entry.helpers.slice(0, max).map((m) => MUSCLE_WORD[m] || m);
  return words.length ? `Also works: ${words.join(", ")}` : "";
}

/**
 * Filters the library. An empty groups list means every muscle.
 * @param {Array<object>} library  output of buildLibrary
 * @param {{groups?: string[], equipment?: string[], types?: string[], query?: string}} f
 */
export function filterLibrary(library, { groups = [], equipment = DEFAULT_EQUIPMENT, types = DEFAULT_TYPES, query = "" } = {}) {
  const q = query.trim().toLowerCase();
  const words = q ? q.split(/\s+/) : [];
  return library.filter((e) =>
    (groups.length === 0 || groups.includes(e.group))
    && equipment.includes(e.equipment)
    && types.includes(e.type)
    && words.every((w) => e.name.toLowerCase().includes(w)));
}

/** Finds a library entry for an exercise name typed or saved elsewhere in the app. */
export function findInLibrary(library, name) {
  if (!Array.isArray(library) || !name) return null;
  const n = String(name).trim().toLowerCase();
  return library.find((e) => e.name.toLowerCase() === n || e.sourceName.toLowerCase() === n) || null;
}

let cache = null;
/** Loads and builds the library once per session. */
export function loadLibrary(fetchImpl = fetch) {
  if (!cache) {
    cache = fetchImpl("/exercises.json")
      .then((r) => (r.ok ? r.json() : []))
      .then((raw) => buildLibrary(raw))
      .catch((err) => { cache = null; throw err; });
  }
  return cache;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The last `n` sessions of one exercise from the app's workout history
 * ({ date: "YYYY-MM-DD", exercises: [{ name, sets: [{ w, r }] }] }), newest first.
 * `names` are the names the exercise may have been saved under.
 * Returns [{ date: "Sep 26", text: "150 × 8 · 8 · 6" }].
 */
export function lastSessions(history, names, n = 3) {
  const want = new Set((names || []).filter(Boolean).map((x) => String(x).trim().toLowerCase()));
  if (!want.size || !Array.isArray(history)) return [];
  const rows = [];
  for (const w of history) {
    const ex = (w?.exercises || []).find((e) => want.has(String(e?.name || "").trim().toLowerCase()));
    if (!ex || !w.date) continue;
    const sets = (ex.sets || []).filter((s) => s && (s.w || s.r));
    if (!sets.length) continue;
    const weights = new Set(sets.map((s) => String(s.w || "")));
    const text = weights.size === 1
      ? (sets[0].w ? `${sets[0].w} × ` : "") + sets.map((s) => s.r || "–").join(" · ")
      : sets.map((s) => `${s.w || "–"}×${s.r || "–"}`).join(" · ");
    const [, m, d] = String(w.date).split("-").map(Number);
    rows.push({ key: w.date, date: m && d ? `${MONTHS[m - 1]} ${d}` : w.date, text });
  }
  rows.sort((a, b) => (a.key < b.key ? 1 : -1));
  return rows.slice(0, n);
}
