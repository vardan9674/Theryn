// Is this new exercise the same as one that already exists?
// The rules come from the matcher proven against Theryn's library on 2026-09-26
// (~/Downloads/GYM App/Theryn-exercise-matcher-2026-09-26): shorthand and spelling are
// normalised, word order ignored, and equipment is a hard line, so "DB curl" never
// matches "Barbell Curl". A typo-fixed match only ever asks; it never merges by itself.

const TERMS = [
  ["dumbell", "dumbbell"], ["dumbel", "dumbbell"], ["dumb bell", "dumbbell"], ["dbs", "dumbbell"], ["db", "dumbbell"],
  ["bar bell", "barbell"], ["bb", "barbell"], ["kettle bell", "kettlebell"], ["kb", "kettlebell"],
  ["ez curl bar", "ezbar"], ["ez bar", "ezbar"], ["ez", "ezbar"], ["smith machine", "smith"],
  ["trap bar", "trapbar"], ["hex bar", "trapbar"], ["resistance band", "band"], ["banded", "band"],
  ["body weight", "bodyweight"], ["bw", "bodyweight"], ["cable machine", "cable"],
  ["ohp", "overhead press"], ["military press", "overhead press"], ["rdl", "romanian deadlift"],
  ["sldl", "stiff leg deadlift"], ["dl", "deadlift"], ["dead lift", "deadlift"], ["bss", "bulgarian split squat"],
  ["cgbp", "close grip bench press"], ["lat raise", "lateral raise"], ["side raise", "lateral raise"],
  ["side lateral raise", "lateral raise"], ["press up", "push up"], ["pushup", "push up"], ["pullup", "pull up"],
  ["chinup", "chin up"], ["pull down", "pulldown"], ["push down", "pushdown"], ["press down", "pushdown"],
  ["pressdown", "pushdown"], ["skullcrusher", "skull crusher"], ["flye", "fly"], ["benchpress", "bench press"],
  ["situp", "sit up"], ["stepup", "step up"], ["leg ext", "leg extension"], ["tri", "tricep"],
  ["alt", "alternating"], ["sa", "single arm"], ["one arm", "single arm"], ["1 arm", "single arm"],
  ["one leg", "single leg"], ["1 leg", "single leg"], ["rev", "reverse"], ["cg", "close grip"],
  ["wg", "wide grip"], ["hamstring curl", "leg curl"], ["medium grip", ""],
];
const STOP = new Set(["the", "a", "an", "with", "on", "and", "of", "for", "using", "in", "to", "exercise", "variation"]);
const EQUIP = new Set(["barbell", "dumbbell", "kettlebell", "cable", "machine", "smith", "band", "bodyweight", "ezbar", "trapbar"]);
const EQUIP_OF = { barbell: "barbell", dumbbell: "dumbbell", kettlebell: "kettlebell", cable: "cable", machine: "machine", smith_machine: "smith", bands: "band", band: "band", "body only": "bodyweight", bodyweight: "bodyweight", ez_bar: "ezbar", "e-z curl bar": "ezbar" };

const singular = (t) => {
  if (t === "biceps") return "bicep";
  if (t === "triceps") return "tricep";
  if (t === "calves") return "calf";
  if (t.length <= 3 || /[0-9]/.test(t) || t === "press" || /(ss|us|is)$/.test(t)) return t;
  if (/ies$/.test(t)) return t.replace(/ies$/, "y");
  if (/(ches|shes|sses|xes)$/.test(t)) return t.replace(/es$/, "");
  return /s$/.test(t) ? t.replace(/s$/, "") : t;
};

/** A name reduced to comparable words: lower case, no punctuation, shorthand expanded. */
export function normalizeName(name) {
  let s = ` ${String(name || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).map(singular).join(" ")} `;
  for (const [term, repl] of TERMS) s = s.split(` ${term} `).join(` ${repl} `);
  return s.split(/\s+/).map(singular).filter((t) => t && !STOP.has(t)).join(" ").trim();
}
/** Words in a fixed order, so "DB curls" and "Curl, dumbbell" match. */
export const nameKey = (name) => [...new Set(normalizeName(name).split(" ").filter(Boolean))].sort().join(" ");
const equipWords = (key, equipment) => {
  const inName = key.split(" ").filter((t) => EQUIP.has(t));
  const col = EQUIP_OF[String(equipment || "").toLowerCase()];
  return new Set(inName.length ? inName : col ? [col] : []);
};

/**
 * Compares a typed name with exercises that already exist.
 * @returns {{verdict:"exists"|"similar"|"new", matches:Array}} exists = the same exercise,
 * similar = ask the coach first (includes likely typos).
 */
export function checkNewExercise(name, equipment, existing) {
  const key = nameKey(name);
  if (!key) return { verdict: "new", matches: [] };
  const mine = equipWords(key, equipment);
  const words = new Set(key.split(" "));
  const scored = [];
  for (const e of existing || []) {
    const ek = nameKey(e.name);
    if (!ek) continue;
    const theirs = equipWords(ek, e.equipment);
    const clash = mine.size > 0 && theirs.size > 0 && ![...mine].some((w) => theirs.has(w));
    const ew = new Set(ek.split(" "));
    const shared = [...words].filter((w) => ew.has(w)).length;
    const overlap = shared / (words.size + ew.size - shared);
    if (ek === key && !clash) { scored.push({ ...e, verdict: "exists", overlap: 1 }); continue; }
    if (!clash && overlap >= 0.6) scored.push({ ...e, verdict: "similar", overlap });
  }
  scored.sort((a, b) => b.overlap - a.overlap);
  const exists = scored.filter((s) => s.verdict === "exists");
  if (exists.length) return { verdict: "exists", matches: exists.slice(0, 3) };
  const similar = scored.slice(0, 4);
  return { verdict: similar.length ? "similar" : "new", matches: similar };
}
