// The weekly report a coach reviews, then chooses to share with a client.
//
// Pure: no React, no network. It reads the same client data the dashboard
// loads (routine, history, submissions, weights, measurements, profile) and
// works out one week of it. Nothing here is saved or shown to the client; the
// coach decides that, and only reportSnapshot()'s output ever leaves the coach.
//
// Three rules keep it honest:
//  - Counts come from what was actually stored: sets planned and sets ticked.
//    A skipped exercise is one the client trained around, not one on a day
//    they never opened the link.
//  - A pattern says what was seen, and at most asks a question about why.
//    Theryn is never told why someone skipped, so it never guesses.
//  - It tells a coach whether a pattern is the plan's doing or the client's.
//    A plan with twice as much pushing as pulling is the coach's choice, not
//    something the client did wrong.
import { DAYS, DAY_LONG, isoDate, startOfWeek, normalizeExercise } from "./format.js";
import { heatFromWorkout, musclesForExercise, normalizeExerciseName, muscleWords } from "../../lib/muscleHeat.js";
import { MUSCLE_MAP } from "../../lib/muscleMap.generated.js";
import { computeBMI, bmiCategory } from "../../lib/coachInsights.js";
import { weekWins, winKey } from "../../lib/workoutWins.js";

const REGIONS = {
  upper: { label: "Upper body", word: "upper-body", groups: ["chest", "shoulders", "triceps", "biceps", "forearms", "upperback", "traps", "lowerback", "neck"] },
  legs: { label: "Legs", word: "leg", groups: ["quads", "hamstrings", "glutes", "adductors", "calves"] },
  core: { label: "Core", word: "core", groups: ["abs"] },
};
const PUSH = ["chest", "shoulders", "triceps"];
const PULL = ["upperback", "biceps", "traps"];
// Fewer workouts than this and "what they trained most" is a guess, so the
// report says what they did and nothing more.
const QUIET_BELOW = 2;
// How far back patterns look, this week included.
const LOOKBACK_WEEKS = 4;

// ── Dates (local day keys only: see theryn-client-clock) ───────────────────
function parseIso(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export function addDays(iso, n) {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

/**
 * The week a report is about by default: this week on a Sunday (a coach
 * sending it Sunday evening), otherwise the week that just ended. `now` should
 * be the client's clock (clientNow), so a client in another timezone gets the
 * week that ended for them.
 */
export function defaultReportWeek(now = new Date()) {
  const monday = isoDate(startOfWeek(now));
  return now.getDay() === 0 ? monday : addDays(monday, -7);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "22–28 Sep", or "29 Sep – 5 Oct" when the week crosses a month. */
export function weekLabel(start) {
  const a = parseIso(start), b = parseIso(addDays(start, 6));
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${MONTHS[b.getMonth()]}`
    : `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]}`;
}

// ── One day: what was planned, what was done, exercise by exercise ─────────
const keyOf = (name) => normalizeExerciseName(name);
const plannedSetsOf = (e) => Number(e?.sets) || (Array.isArray(e?.setList) ? e.setList.length : 0) || 1;

/**
 * A link workout carries the plan as it stood that day (sets_planned per
 * exercise), which beats today's plan for any day in the past. An app
 * workout doesn't, so its plan comes from the routine.
 */
function buildDay(data, iso, key, todayIso, subById) {
  const plan = data?.routine?.[key];
  const type = plan?.type || null;
  const planned = Boolean(type) && type !== "Rest" && (plan?.exercises || []).length > 0;
  const workouts = (data?.history || []).filter((h) => h.date === iso);
  const rows = new Map();
  const add = (name, p, d) => {
    const k = keyOf(name);
    if (!k) return;
    const r = rows.get(k) || { name: String(name).trim(), planned: 0, done: 0 };
    r.planned += p; r.done += d;
    rows.set(k, r);
  };
  let planCounted = false;
  for (const w of workouts) {
    const ex = subById.get(w.id)?.payload?.exercises;
    if (Array.isArray(ex) && ex.length) {
      for (const e of ex) {
        if (!e?.name) continue;
        add(e.name, e.added_by_client || planCounted ? 0 : Number(e.sets_planned) || 0, Number(e.sets_done) || 0);
      }
      planCounted = true;
    } else {
      if (planned && !planCounted) {
        for (const e of plan.exercises) { const n = normalizeExercise(e); add(n.name, plannedSetsOf(n), 0); }
        planCounted = true;
      }
      for (const e of w.exercises || []) add(e.name, 0, Array.isArray(e.sets) ? e.sets.length : 0);
    }
  }
  if (!workouts.length && planned) {
    for (const e of plan.exercises) { const n = normalizeExercise(e); add(n.name, plannedSetsOf(n), 0); }
  }
  const done = workouts.length > 0;
  return {
    key, iso, type, planned, done,
    missed: planned && !done && iso < todayIso,
    feel: workouts.map((w) => w.feel).filter(Boolean),
    rows: [...rows.values()],
  };
}

function buildWeek(data, start, todayIso, subById) {
  return DAYS.map((key, i) => buildDay(data, addDays(start, i), key, todayIso, subById));
}

// ── Sums ───────────────────────────────────────────────────────────────────
const mainOf = (name) => (musclesForExercise(name, MUSCLE_MAP) || [])[0] || null;
function mainSets(rows, pick) {
  const m = {};
  for (const r of rows) { const g = mainOf(r.name); if (g) m[g] = (m[g] || 0) + pick(r); }
  return m;
}
const sumOf = (m, groups) => groups.reduce((a, g) => a + (m[g] || 0), 0);
const ratio = (done, planned) => (planned > 0 ? done / planned : null);

/** on | half | missed, for a muscle the plan aimed sets at. */
export function gapStatus(done, planned) {
  const r = ratio(done, planned);
  if (r == null) return null;
  return r >= 0.75 ? "on" : r >= 0.4 ? "half" : "missed";
}

/** A region's verdict word, from sets done out of sets planned. */
function regionVerdict(done, planned) {
  const r = ratio(done, planned);
  if (r == null) return null;
  return r >= 0.8 ? "on plan" : r >= 0.5 ? "mostly done" : "mostly missed";
}

// ── Bests: the heaviest set this week against everything before it ────────
function bestSet(sets) {
  let best = null;
  for (const s of sets || []) {
    const w = Number(s?.w), r = Number(s?.r);
    if (!(w > 0) || !(r > 0)) continue;
    if (!best || w > best.w || (w === best.w && r > best.r)) best = { w, r };
  }
  return best;
}
function newBests(history, start, end) {
  const before = new Map(), week = new Map();
  for (const h of history || []) {
    const target = h.date < start ? before : h.date <= end ? week : null;
    if (!target) continue;
    for (const e of h.exercises || []) {
      const k = keyOf(e.name), b = bestSet(e.sets);
      if (!k || !b) continue;
      const cur = target.get(k);
      if (!cur || b.w > cur.w || (b.w === cur.w && b.r > cur.r)) target.set(k, { ...b, name: e.name });
    }
  }
  const out = [];
  for (const [k, b] of week) {
    const prev = before.get(k);
    // A first time isn't a best: there is nothing to beat.
    if (prev && (b.w > prev.w || (b.w === prev.w && b.r > prev.r))) out.push({ name: b.name, weight: b.w, reps: b.r, prevWeight: prev.w, prevReps: prev.r });
  }
  return out.sort((a, b) => b.weight - a.weight);
}

// ── Weight lifted: the week's total against the weeks before ───────────────
// The same number the coach's "Volume by workout type" chart adds up: weight
// × reps for every done set. Bodyweight sets add nothing, so a client who
// only does bodyweight work gets no chart rather than a row of zeros.
const VOLUME_WEEKS = 6;
const volumeOf = (h) => (Number(h?.totalVolume) > 0 ? Number(h.totalVolume)
  : (h?.exercises || []).reduce((a, e) => a + (e.sets || []).reduce((t, x) => t + (Number(x?.w) || 0) * (Number(x?.r) || 0), 0), 0));
function volumeWeeks(history, weekStart) {
  const weeks = Array.from({ length: VOLUME_WEEKS }, (_, i) => ({ start: addDays(weekStart, -7 * (VOLUME_WEEKS - 1 - i)), total: 0 }));
  const first = weeks[0].start, last = addDays(weekStart, 6);
  for (const h of history || []) {
    if (!h?.date || h.date < first || h.date > last) continue;
    const i = weeks.findIndex((w) => h.date >= w.start && h.date <= addDays(w.start, 6));
    if (i >= 0) weeks[i].total += volumeOf(h);
  }
  for (const w of weeks) w.total = Math.round(w.total);
  const now = weeks[weeks.length - 1].total, prev = weeks[weeks.length - 2].total;
  // Within 3% either way is the same week, not a rise or a fall.
  const pct = now > 0 && prev > 0 ? Math.round(((now - prev) / prev) * 100) : null;
  return { weeks, total: now, prev, pct, trend: pct == null ? null : pct >= 3 ? "up" : pct <= -3 ? "down" : "same" };
}

// ── Body ─────────────────────────────────────────────────────────────────────
const avg = (xs) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : null);
const round1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
function bodyFacts(data, start, end) {
  const unit = data?.profile?.unit_system === "metric" ? "metric" : "imperial";
  const ws = (data?.weights || []).filter((w) => w?.date && Number(w.weight) > 0);
  const inRange = (a, b) => ws.filter((w) => w.date >= a && w.date <= b).map((w) => Number(w.weight));
  const thisWeek = inRange(start, end), lastWeek = inRange(addDays(start, -7), addDays(start, -1));
  const weight = round1(avg(thisWeek));
  const prevWeight = round1(avg(lastWeek));
  const latest = [...ws].filter((w) => w.date <= end).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const ms = (data?.measurements || []).filter((m) => m?.date && Number(m.waist) > 0).sort((a, b) => (a.date < b.date ? 1 : -1));
  const waistNow = ms.find((m) => m.date >= start && m.date <= end);
  const waistPrev = ms.find((m) => m.date < start);
  const heightCm = Number(data?.profile?.height_cm) > 0 ? Number(data.profile.height_cm) : null;
  const bmi = latest ? computeBMI(latest.weight, heightCm, unit) : null;
  return {
    unit, weightUnit: unit === "metric" ? "kg" : "lb", lengthUnit: unit === "metric" ? "cm" : "in",
    weight, weighIns: thisWeek.length, weightDelta: weight != null && prevWeight != null ? round1(weight - prevWeight) : null,
    waist: waistNow ? Number(waistNow.waist) : null,
    waistDelta: waistNow && waistPrev ? Math.round((Number(waistNow.waist) - Number(waistPrev.waist)) * 100) / 100 : null,
    heightCm, bmi, bmiCategory: bmiCategory(bmi)?.label || null,
  };
}

// ── Patterns across weeks ────────────────────────────────────────────────────
/**
 * An exercise left out of the last few workouts it was planned in, newest
 * first. A run, not a lifetime count: doing it once a month ago doesn't make
 * three skips in a row any less worth asking about, and "skipped every time"
 * would then be false. Only days they trained count — leaving an exercise out
 * of a workout is a choice; missing the whole day is reported on its own.
 */
function skipRun(weeks) {
  const seen = new Map();
  weeks.forEach((days) => days.forEach((d) => {
    if (!d.done) return;
    for (const r of d.rows) {
      if (r.planned <= 0) continue;
      const k = keyOf(r.name);
      if (!seen.has(k)) seen.set(k, { name: r.name, hits: [] });
      seen.get(k).hits.push({ iso: d.iso, done: r.done > 0 });
    }
  }));
  let best = null;
  for (const s of seen.values()) {
    const hits = s.hits.sort((a, b) => (a.iso < b.iso ? 1 : -1));
    let run = 0;
    for (const h of hits) { if (h.done) break; run += 1; }
    // It has to include this week's workouts, or it's old news.
    if (run >= 3 && hits[0].iso >= weeks[0][0].iso && (!best || run > best.times)) best = { name: s.name, times: run };
  }
  return best;
}

function missedDayPattern(weeks, routine) {
  const recent = weeks.slice(0, 3);
  let best = null;
  DAYS.forEach((key, i) => {
    if (!recent[0]?.[i]?.missed) return;
    const missed = recent.filter((w) => w[i]?.missed).length;
    const planned = recent.filter((w) => w[i]?.planned).length;
    if (missed >= 2 && (!best || missed > best.missed)) best = { key, type: recent[0][i].type, missed, of: planned };
  });
  if (!best) return null;
  // A free day to move it to: the nearest rest day that isn't the same day.
  const idx = DAYS.indexOf(best.key);
  const free = DAYS.map((k, i) => ({ k, dist: Math.min(Math.abs(i - idx), 7 - Math.abs(i - idx)) }))
    .filter(({ k }) => { const t = routine?.[k]?.type; return k !== best.key && (!t || t === "Rest"); })
    .sort((a, b) => a.dist - b.dist || DAYS.indexOf(a.k) - DAYS.indexOf(b.k))[0];
  return { ...best, freeDay: free?.k || null };
}

/**
 * Whether the week leaned to pushing or pulling, and whose doing that was.
 * "plan": the plan asked for it and they did it. "client": the plan was
 * even (or less uneven) and what they skipped made it lopsided.
 */
function balancePattern(mainPlanned, mainDone) {
  const pP = sumOf(mainPlanned, PUSH), lP = sumOf(mainPlanned, PULL);
  const pD = sumOf(mainDone, PUSH), lD = sumOf(mainDone, PULL);
  if (pP + lP < 8) return null;
  const pPct = ratio(pD, pP), lPct = ratio(lD, lP);
  const planLean = lP > 0 ? pP / lP : Infinity;
  const planUneven = planLean >= 1.35 || planLean <= 1 / 1.35;
  if (planUneven && (pPct ?? 1) >= 0.8 && (lPct ?? 1) >= 0.8) {
    return { by: "plan", heavier: pP > lP ? "push" : "pull", pushPlanned: pP, pullPlanned: lP, pushDone: pD, pullDone: lD };
  }
  if (pPct != null && lPct != null && Math.abs(pPct - lPct) >= 0.4) {
    return { by: "client", heavier: pPct > lPct ? "push" : "pull", pushPlanned: pP, pullPlanned: lP, pushDone: pD, pullDone: lD };
  }
  return null;
}

// ── Words ─────────────────────────────────────────────────────────────────
const SIDE = { push: "pushing", pull: "pulling" };
// What to aim at next week when a region fell short, as a coach would say it.
const FOCUS = { "Upper body": "every upper-body day", Legs: "every leg day", Core: "the core work" };
const focusFor = (label) => FOCUS[label] || `the ${String(label).toLowerCase()} work`;
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const SIDE_MUSCLES = { push: "chest, shoulders, triceps", pull: "back, biceps" };

function headlines(regions, workouts, quiet, cutShort) {
  if (quiet) {
    return { coach: `Quiet week. ${workouts.done} of ${workouts.planned || workouts.done} workouts.`, athlete: "A quiet week." };
  }
  // Turning up and finishing are different things; don't let one hide the other.
  if (cutShort && workouts.done >= workouts.planned) {
    return { coach: `Every workout started, but only ${cutShort.done} of ${cutShort.planned} sets done.`, athlete: "You showed up every time." };
  }
  const planned = Object.entries(regions).filter(([, r]) => r.planned >= 4);
  if (!planned.length) {
    return { coach: `${workouts.done} workout${workouts.done === 1 ? "" : "s"} this week.`, athlete: `${workouts.done} workout${workouts.done === 1 ? "" : "s"} in the bank.` };
  }
  const allOn = planned.every(([, r]) => r.verdict === "on plan");
  if (allOn && workouts.done >= workouts.planned) return { coach: "Everything went to plan.", athlete: "Every workout done." };
  const byVerdict = (v) => planned.filter(([, r]) => r.verdict === v).map(([, r]) => r.label);
  const joinLabels = (xs) => (xs.length <= 1 ? xs[0] || "" : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1].toLowerCase()}`);
  const parts = [];
  for (const v of ["on plan", "mostly done", "mostly missed"]) {
    const xs = byVerdict(v);
    if (xs.length) parts.push(`${joinLabels(xs)} ${v}.`);
  }
  const strong = planned.filter(([, r]) => r.verdict === "on plan").sort((a, b) => b[1].planned - a[1].planned)[0];
  return {
    coach: parts.join(" "),
    athlete: strong ? `Strong ${REGIONS[strong[0]].word} week.` : `${workouts.done} workout${workouts.done === 1 ? "" : "s"} in the bank.`,
  };
}

function draftNote(firstName, { regions, workouts, bests, wins = [], skipped, weakest, cutShort }) {
  const name = firstName ? `, ${firstName}` : "";
  if (cutShort && workouts.done >= workouts.planned) {
    return `You showed up every time${name} — that's the hard part. Next week let's get through the full sessions. If time is tight, tell me and I'll trim them.`;
  }
  const strong = Object.entries(regions).filter(([, r]) => r.planned >= 4 && r.verdict === "on plan").sort((a, b) => b[1].planned - a[1].planned)[0];
  const parts = [];
  if (workouts.planned && workouts.done >= workouts.planned) parts.push(`Brilliant week${name}, every workout done.`);
  else if (strong) parts.push(`Great ${REGIONS[strong[0]].word} week${name}.`);
  else parts.push(`Thanks for the work this week${name}.`);
  if (bests[0]) parts.push(`A new best on ${bests[0].name}!`);
  else if (wins.length) parts.push(`You beat last week on ${wins.length === 1 ? wins[0].name : `${wins.length} exercises`}.`);
  if (weakest && weakest.verdict !== "on plan") parts.push(`Next week let's get ${focusFor(weakest.label)} in.`);
  if (skipped) parts.push(`Tell me if the ${skipped.name} is giving you trouble.`);
  return parts.join(" ");
}

// ── The report ──────────────────────────────────────────────────────────────
/**
 * @param data    the client data from loadClientData()
 * @param options { start: Monday ISO date, firstName, now: the client's clock }
 */
export function buildWeeklyReport(data, { start, firstName = "", now = new Date() } = {}) {
  const todayIso = isoDate(now);
  const weekStart = start || defaultReportWeek(now);
  const end = addDays(weekStart, 6);
  const subById = new Map((data?.submissions || []).filter((s) => s?.kind === "workout").map((s) => [s.id, s]));

  const weeks = Array.from({ length: LOOKBACK_WEEKS }, (_, i) => buildWeek(data, addDays(weekStart, -7 * i), todayIso, subById));
  const days = weeks[0];
  const rows = days.flatMap((d) => d.rows);

  const plannedDays = days.filter((d) => d.planned).length;
  const doneDays = days.filter((d) => d.done).length;
  const workouts = { planned: plannedDays, done: doneDays, days: days.map((d) => ({ key: d.key, iso: d.iso, type: d.type, planned: d.planned, done: d.done, missed: d.missed })) };
  const sets = { planned: rows.reduce((a, r) => a + r.planned, 0), done: rows.reduce((a, r) => a + r.done, 0) };
  const quiet = doneDays < QUIET_BELOW;

  const doneHeat = heatFromWorkout(rows.map((r) => ({ name: r.name, sets: r.done })), MUSCLE_MAP);
  const mainPlanned = mainSets(rows, (r) => r.planned);
  const mainDone = mainSets(rows, (r) => r.done);
  const gaps = {};
  for (const g of Object.keys(mainPlanned)) if (mainPlanned[g] > 0) gaps[g] = { planned: mainPlanned[g], done: mainDone[g] || 0, status: gapStatus(mainDone[g] || 0, mainPlanned[g]) };

  const regions = {};
  for (const [id, r] of Object.entries(REGIONS)) {
    const planned = sumOf(mainPlanned, r.groups), done = sumOf(mainDone, r.groups);
    regions[id] = { label: r.label, planned, done, verdict: regionVerdict(done, planned) };
  }
  const withPlan = Object.entries(regions).filter(([, r]) => r.planned >= 4);
  const weakest = withPlan.sort((a, b) => ratio(a[1].done, a[1].planned) - ratio(b[1].done, b[1].planned))[0]?.[1] || null;
  const strongest = [...withPlan].sort((a, b) => ratio(b[1].done, b[1].planned) - ratio(a[1].done, a[1].planned) || b[1].planned - a[1].planned)[0]?.[1] || null;

  const feelAll = days.flatMap((d) => d.feel);
  const hardCount = feelAll.filter((f) => f === "hard").length;
  const allBests = newBests(data?.history, weekStart, end);
  const bests = allBests.slice(0, 2);
  const body = bodyFacts(data, weekStart, end);
  // Better than last time, exercise by exercise. One that is also the best
  // they've ever done says so.
  const everKeys = new Set(allBests.map((b) => winKey(b.name)));
  const wins = weekWins(data?.history, weekStart, end).map((w) => ({ ...w, ever: everKeys.has(winKey(w.name)) }));
  const volume = volumeWeeks(data?.history, weekStart);

  // ── What Theryn noticed (coach only) ──
  const patterns = [];
  const skipped = skipRun(weeks);
  if (skipped) {
    patterns.push({
      kind: "skipped", tone: "warn", title: `${skipped.name} skipped ${skipped.times} times in a row`,
      seen: `Left out of the last ${skipped.times} workouts it was planned in.`,
      ask: `Is something getting in the way — a busy machine, or it hurts? ${firstName ? `${firstName} hasn't` : "They haven't"} said why.`,
    });
  }
  const lastFeels = [...days].filter((d) => d.done && d.feel.length).map((d) => d.feel[d.feel.length - 1]);
  if (lastFeels.length >= 2 && lastFeels.slice(-2).every((f) => f === "hard")) {
    const everHard = (data?.history || []).some((h) => h.date < weekStart && h.feel === "hard");
    const hardDays = days.filter((d) => d.feel.includes("hard")).map((d) => DAY_LONG[d.key]);
    patterns.push({
      kind: "hard", tone: "warn", title: "Hard sessions in a row",
      seen: `${hardDays.slice(-2).join(" and ")} both felt hard.${everHard ? "" : " It's the first time they've rated a session hard."}`,
      ask: "Too much weight, or just a rough week?",
    });
  }
  const balance = balancePattern(mainPlanned, mainDone);
  if (balance?.by === "plan") {
    patterns.push({
      kind: "plan_lean", tone: "info", title: `The plan leans to ${SIDE[balance.heavier]}, not ${firstName || "the client"}`,
      seen: `The plan asks for ${balance.pushPlanned} pushing sets (${SIDE_MUSCLES.push}) and ${balance.pullPlanned} pulling (${SIDE_MUSCLES.pull}). They did ${balance.pushDone} and ${balance.pullDone}, right on plan.`,
      ask: "Want a more even split? That's a plan change, not something to tell them.",
    });
  } else if (balance?.by === "client") {
    const light = balance.heavier === "push" ? "pull" : "push";
    patterns.push({
      kind: "client_lean", tone: "warn", title: `${SIDE[light][0].toUpperCase()}${SIDE[light].slice(1)} is what got skipped`,
      seen: `They did ${balance.pushDone} of ${balance.pushPlanned} pushing sets but ${balance.pullDone} of ${balance.pullPlanned} pulling. The skipping made it uneven, not the plan.`,
      ask: `Is there something about the ${SIDE[light]} exercises they avoid?`,
    });
  }
  // Workouts they started but left most of: different from missing the day.
  const doneDaysRows = days.filter((d) => d.done).flatMap((d) => d.rows);
  const startedPlanned = doneDaysRows.reduce((a, r) => a + r.planned, 0);
  const startedDone = doneDaysRows.reduce((a, r) => a + Math.min(r.done, r.planned || r.done), 0);
  const cutShort = !quiet && startedPlanned >= 8 && startedDone / startedPlanned < 0.5 ? { done: startedDone, planned: startedPlanned } : null;
  if (cutShort) {
    patterns.push({
      kind: "cut_short", tone: "warn", title: "Workouts cut short",
      seen: `Across the ${doneDays} workouts ${firstName || "they"} started, ${cutShort.done} of ${cutShort.planned} planned sets were ticked.`,
      ask: "Short on time, or doing the sets but only ticking some?",
    });
  }
  const missedDay = missedDayPattern(weeks, data?.routine);
  if (missedDay) {
    patterns.push({
      kind: "missed_day", tone: "warn", title: `${DAY_LONG[missedDay.key]}'s ${missedDay.type || "workout"} keeps getting missed`,
      seen: `Missed ${missedDay.missed} of the last ${missedDay.of} weeks.`,
      ask: `Does ${DAY_LONG[missedDay.key]} just not work for them?`,
    });
  }
  if (bests[0]) {
    const b = bests[0];
    patterns.push({ kind: "best", tone: "good", title: `New best on ${b.name}`, seen: `${b.weight} ${body.weightUnit} × ${b.reps}, up from ${b.prevWeight} ${body.weightUnit} × ${b.prevReps}.` });
  }

  // ── Suggestions (coach decides; nothing changes until they tap) ──
  const suggestions = [];
  if (skipped) {
    const planEx = DAYS.flatMap((k) => (data?.routine?.[k]?.exercises || []).map(normalizeExercise)).find((e) => keyOf(e.name) === keyOf(skipped.name));
    const to = (planEx?.alternatives || [])[0];
    if (to) suggestions.push({ kind: "swap", title: `Swap ${skipped.name} for ${to}`, why: "One of the stand-ins you already set for it.", from: skipped.name, to });
  }
  if (missedDay?.freeDay) {
    suggestions.push({ kind: "move", title: `Move ${DAY_LONG[missedDay.key]}'s ${(missedDay.type || "workout").toLowerCase()} to ${DAY_LONG[missedDay.freeDay]}`, why: `${DAY_LONG[missedDay.freeDay]} is free in the plan.`, from: missedDay.key, to: missedDay.freeDay });
  }

  const heads = headlines(regions, workouts, quiet, cutShort);
  return {
    period: { start: weekStart, end, label: weekLabel(weekStart) },
    quiet,
    headline: heads.coach,
    athleteHeadline: heads.athlete,
    workouts, sets,
    feel: { hard: hardCount, rated: feelAll.length },
    muscles: { levels: doneHeat.levels, top: quiet ? [] : doneHeat.top, worked: doneHeat.worked, unknown: doneHeat.unknown, sentence: quiet ? "" : (doneHeat.top.length ? `Most sets went to ${muscleWords(doneHeat.top)}.` : "") },
    gaps, regions, weakest, strongest,
    bests, wins, volume, body, patterns, suggestions,
    doneList: quiet ? rows.filter((r) => r.done > 0).map((r) => ({ name: r.name, sets: r.done })) : [],
    draftNote: quiet ? `Quiet week${firstName ? `, ${firstName}` : ""}. Everything OK? Want me to make next week lighter?` : draftNote(firstName, { regions, workouts, bests, wins, skipped, weakest, cutShort }),
    draftFocus: cutShort && workouts.done >= workouts.planned ? "Full sessions" : !quiet && weakest && weakest.verdict !== "on plan" ? capital(focusFor(weakest.label)) : "Keep it going",
  };
}

// ── Applying a suggestion to the plan (coach taps it) ──────────────────────
/** A copy of the routine with the suggestion made. The old exercise stays as a stand-in. */
export function applySuggestion(routine, s) {
  const next = JSON.parse(JSON.stringify(routine || {}));
  if (s?.kind === "swap") {
    for (const k of DAYS) {
      const day = next[k];
      if (!day?.exercises) continue;
      day.exercises = day.exercises.map((e) => {
        const n = normalizeExercise(e);
        if (keyOf(n.name) !== keyOf(s.from)) return e;
        const alternatives = [s.from, ...(n.alternatives || []).filter((a) => keyOf(a) !== keyOf(s.to))].slice(0, 4);
        return { ...n, name: s.to, alternatives };
      });
    }
  } else if (s?.kind === "move" && DAYS.includes(s.from) && DAYS.includes(s.to)) {
    const a = next[s.from], b = next[s.to];
    next[s.from] = b || { type: "Rest", exercises: [] };
    next[s.to] = a;
  }
  return next;
}

// ── What the client gets ────────────────────────────────────────────────────
// Every section is the coach's to keep or drop. Body is off until they turn
// it on: weight is the one a client may not want sent to them.
export const DEFAULT_SECTIONS = { workouts: true, wins: true, volume: true, muscles: true, gap: true, body: false, note: true };
export const MAX_WINS = 5;

/**
 * The sections a coach starts from when they reopen a report they already
 * shared: what they chose then. A report shared before a section existed
 * (v1 had no workouts toggle, wins or weight lifted) starts with that section
 * as a new report would, so "Share again" sends the whole report, not the
 * old cut of it.
 */
export function sectionsFrom(prev) {
  if (!prev) return { ...DEFAULT_SECTIONS };
  const old = !(Number(prev.v) >= 2);
  return {
    workouts: old ? DEFAULT_SECTIONS.workouts : Boolean(prev.workouts),
    wins: old ? DEFAULT_SECTIONS.wins : Boolean(prev.wins),
    volume: old ? DEFAULT_SECTIONS.volume : Boolean(prev.volume),
    muscles: Boolean(prev.muscles),
    gap: Boolean(prev.gap),
    body: Boolean(prev.body),
    note: Boolean(prev.note || prev.focus),
  };
}
const clip = (s, n) => String(s || "").trim().slice(0, n);

/**
 * The frozen, client-facing copy that sharing saves. Only the sections the
 * coach left on, and never the patterns or suggestions: what Theryn noticed
 * is for the coach. Small on purpose, and plain data — the link draws it.
 */
export function reportSnapshot(report, { sections = DEFAULT_SECTIONS, note = "", focus = "", coachName = "", firstName = "" } = {}) {
  const s = { ...DEFAULT_SECTIONS, ...sections };
  const out = {
    v: 2,
    period: { start: report.period.start, end: report.period.end },
    coach: clip(coachName, 40),
    first: clip(firstName, 40),
    headline: report.athleteHeadline,
  };
  if (s.workouts) {
    out.workouts = { done: report.workouts.done, planned: report.workouts.planned, days: report.workouts.days.filter((d) => d.planned || d.done).map((d) => ({ k: d.key, p: d.planned, d: d.done })) };
  }
  if (s.wins && report.wins?.length) {
    out.wins = {
      unit: report.body.weightUnit,
      items: report.wins.slice(0, MAX_WINS).map((w) => {
        const o = { name: clip(w.name, 60), kind: w.kind, now: w.now, before: w.before };
        if (w.reps != null) o.reps = w.reps;
        if (w.weight != null) o.weight = w.weight;
        if (w.ever) o.ever = true;
        return o;
      }),
      more: Math.max(0, report.wins.length - MAX_WINS),
    };
  }
  if (s.volume && report.volume?.total > 0) {
    const v = report.volume;
    out.volume = { unit: report.body.weightUnit, total: v.total, pct: v.pct, trend: v.trend, weeks: v.weeks.map((w) => ({ s: w.start, t: w.total })) };
  }
  if (s.muscles && !report.quiet && report.muscles.worked.length) {
    out.muscles = { levels: report.muscles.levels, top: report.muscles.top, worked: report.muscles.worked };
  }
  if (s.gap && report.weakest && report.weakest.verdict !== "on plan") {
    out.gap = { weak: { label: report.weakest.label, done: report.weakest.done, planned: report.weakest.planned } };
    if (report.strongest && report.strongest !== report.weakest && report.strongest.verdict === "on plan") {
      out.gap.strong = { label: report.strongest.label, done: report.strongest.done, planned: report.strongest.planned };
    }
  }
  if (s.body && (report.body.weight != null || report.body.waist != null)) {
    out.body = { weight: report.body.weight, weightDelta: report.body.weightDelta, unit: report.body.weightUnit, waist: report.body.waist, waistDelta: report.body.waistDelta, lengthUnit: report.body.lengthUnit };
  }
  if (s.note) {
    const n = clip(note, 600), f = clip(focus, 80);
    if (n) out.note = n;
    if (f) out.focus = f;
  }
  return out;
}

/** "Up 8% on last week", in words a client reads at a glance. */
export function volumeLine(v) {
  if (!v || v.pct == null) return "";
  return v.trend === "up" ? `Up ${v.pct}% on last week.` : v.trend === "down" ? `Down ${Math.abs(v.pct)}% on last week.` : "About the same as last week.";
}

/** The message a coach sends. Plain: the link preview shows no numbers. */
export function reportMessage(firstName, url) {
  const name = (firstName || "").trim();
  return `Hi${name ? " " + name : ""}, your week is ready. Have a look before your next session: ${url}`;
}
