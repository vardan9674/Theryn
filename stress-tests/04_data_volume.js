#!/usr/bin/env node
// stress-tests/04_data_volume.js
// Pure Node.js data-volume & logic-performance tests for Theryn.
// Simulates JS that runs in-app — no Supabase calls, no npm packages.
// Run with: node stress-tests/04_data_volume.js

"use strict";

// ── Formatting ────────────────────────────────────────────────────────────────
const RESET  = "\x1b[0m";
const BOLD   = "\x1b[1m";
const GREEN  = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED    = "\x1b[31m";
const CYAN   = "\x1b[36m";
const DIM    = "\x1b[2m";

function verdict(v) {
  if (v === "PASS") return `${GREEN}${BOLD}PASS${RESET}`;
  if (v === "WARN") return `${YELLOW}${BOLD}WARN${RESET}`;
  return `${RED}${BOLD}FAIL${RESET}`;
}

function printTable(rows, columns) {
  const widths = columns.map(c =>
    Math.max(c.label.length, ...rows.map(r => String(r[c.key] ?? "").replace(/\x1b\[[0-9;]*m/g, "").length))
  );
  const pad = (s, w, a = "left") => {
    const raw = String(s ?? "");
    const vis = raw.replace(/\x1b\[[0-9;]*m/g, "").length;
    const p = " ".repeat(Math.max(0, w - vis));
    return a === "right" ? p + raw : raw + p;
  };
  const sep = "+" + columns.map((c, i) => "-".repeat(widths[i] + 2)).join("+") + "+";
  console.log(sep);
  console.log("|" + columns.map((c, i) => ` ${pad(c.label, widths[i])} `).join("|") + "|");
  console.log(sep);
  for (const row of rows)
    console.log("|" + columns.map((c, i) => ` ${pad(row[c.key], widths[i], c.align || "left")} `).join("|") + "|");
  console.log(sep);
}

function sectionHeader(title) {
  console.log(`\n${CYAN}${BOLD}${"═".repeat(64)}${RESET}`);
  console.log(`${CYAN}${BOLD}  ${title}${RESET}`);
  console.log(`${CYAN}${BOLD}${"═".repeat(64)}${RESET}`);
}

function memoryUsedKB() {
  return Math.round(process.memoryUsage().heapUsed / 1024);
}

// ── Fake localStorage (in-memory simulation) ─────────────────────────────────
const _store = new Map();
const localStorage = {
  getItem:    (k) => _store.get(k) ?? null,
  setItem:    (k, v) => _store.set(k, String(v)),
  removeItem: (k) => _store.delete(k),
  clear:      () => _store.clear(),
  get length() { return _store.size; },
};

// ── UUID generator (crypto built-in, no external dep) ────────────────────────
const { randomUUID } = await import("node:crypto");

// ── Data Generators ───────────────────────────────────────────────────────────
const MUSCLE_GROUPS = ["chest","back","shoulders","quads","hamstrings","glutes","biceps","triceps","core","cardio"];
const EQUIPMENT     = ["barbell","dumbbell","cable","machine","bodyweight","kettlebell"];
const WORKOUT_TYPES = ["Push","Pull","Legs","Upper","Lower","Full Body","Core","Cardio","Custom"];

function makeExercise(i) {
  return {
    id:           randomUUID(),
    name:         `Exercise ${i} — ${MUSCLE_GROUPS[i % MUSCLE_GROUPS.length]}`,
    muscle_group: MUSCLE_GROUPS[i % MUSCLE_GROUPS.length],
    equipment:    EQUIPMENT[i % EQUIPMENT.length],
    category:     i % 3 === 0 ? "compound" : "isolation",
    aliases:      [`alias${i}a`, `alias${i}b`],
  };
}

function makeSet(exerciseId, setNum) {
  return {
    exercise_id: exerciseId,
    set_number:  setNum,
    weight:      (Math.random() * 140 + 20).toFixed(2),
    reps:        Math.floor(Math.random() * 10) + 3,
  };
}

function makeWorkoutSession(sessionIndex, exerciseIds) {
  const startedAt   = new Date(Date.now() - sessionIndex * 48 * 60 * 60 * 1000).toISOString();
  const completedAt = new Date(new Date(startedAt).getTime() + 3600 * 1000).toISOString();
  const sets        = [];

  // 15 exercises × 5 sets
  const sessionExIds = exerciseIds.slice(0, 15);
  for (const exId of sessionExIds) {
    for (let s = 1; s <= 5; s++) {
      sets.push(makeSet(exId, s));
    }
  }

  return {
    id:           randomUUID(),
    user_id:      randomUUID(),
    workout_type: WORKOUT_TYPES[sessionIndex % WORKOUT_TYPES.length],
    started_at:   startedAt,
    completed_at: completedAt,
    notes:        JSON.stringify({ totalSets: sets.length, totalVolume: 0 }),
    workout_sets: sets,
  };
}

// ── The actual mapping logic from loadWorkoutHistory (useWorkouts.ts) ─────────
function mapSessionToHistoryEntry(session, idToName) {
  const startedAt   = new Date(session.started_at).getTime();
  const completedAt = new Date(session.completed_at).getTime();
  const duration    = Math.round((completedAt - startedAt) / 1000);

  const exMap   = {};
  const exOrder = [];

  const sortedSets = [...session.workout_sets].sort((a, b) => a.set_number - b.set_number);

  for (const set of sortedSets) {
    if (!exMap[set.exercise_id]) {
      exMap[set.exercise_id] = [];
      exOrder.push(set.exercise_id);
    }
    exMap[set.exercise_id].push({
      w: set.weight != null ? String(set.weight) : "",
      r: set.reps   != null ? String(set.reps)   : "",
    });
  }

  const exercises = exOrder.map((exId) => ({
    name: idToName[exId] || "Unknown Exercise",
    sets: exMap[exId],
  }));

  let parsedNotes = {};
  try { parsedNotes = session.notes ? JSON.parse(session.notes) : {}; } catch {}

  return {
    id:          session.id,
    date:        session.started_at.split("T")[0],
    type:        session.workout_type || "Custom",
    startedAt:   session.started_at,
    duration,
    exercises,
    totalSets:   parsedNotes.totalSets ?? exercises.reduce((a, ex) => a + ex.sets.length, 0),
    totalVolume: parsedNotes.totalVolume ?? exercises.reduce(
      (a, ex) => a + ex.sets.reduce((ss, s) => ss + (Number(s.w) || 0) * (Number(s.r) || 0), 0),
      0
    ),
  };
}

// ── Test 1: Large Workout History Processing ──────────────────────────────────
async function test1() {
  sectionHeader("TEST 1 — Large Workout History Processing");

  // Build exercise pool
  const exercises   = Array.from({ length: 15 }, (_, i) => makeExercise(i));
  const exerciseIds = exercises.map(e => e.id);
  const idToName    = Object.fromEntries(exercises.map(e => [e.id, e.name]));

  // Generate 30 sessions
  const sessions = Array.from({ length: 30 }, (_, i) => makeWorkoutSession(i, exerciseIds));

  const totalSets = sessions.reduce((s, sess) => s + sess.workout_sets.length, 0);

  const memBefore = memoryUsedKB();
  const t0        = performance.now();

  const history = sessions.map(s => mapSessionToHistoryEntry(s, idToName));

  const elapsed = performance.now() - t0;
  const memAfter = memoryUsedKB();

  // Verify correctness
  const firstEntry    = history[0];
  const correctCount  = history.length === 30;
  const correctExercises = firstEntry.exercises.length === 15;
  const correctSets   = firstEntry.totalSets === 75;

  const rows = [
    { metric: "Sessions processed",  value: String(history.length) },
    { metric: "Total sets",          value: String(totalSets) },
    { metric: "Processing time",     value: `${elapsed.toFixed(2)}ms` },
    { metric: "Memory delta",        value: `+${memAfter - memBefore} KB` },
    { metric: "Sets per session",    value: String(firstEntry.totalSets) },
    { metric: "Exercises per session",value: String(firstEntry.exercises.length) },
    { metric: "Correct count",       value: correctCount ? "Yes" : "No" },
    { metric: "Correct exercises",   value: correctExercises ? "Yes" : "No" },
    { metric: "Correct sets",        value: correctSets ? "Yes" : "No" },
  ];

  printTable(rows, [
    { key: "metric", label: "Metric" },
    { key: "value",  label: "Value", align: "right" },
  ]);

  // Thresholds
  const v = elapsed > 500  ? "FAIL"
          : elapsed > 100  ? "WARN"
          : (!correctCount || !correctExercises || !correctSets) ? "FAIL"
          : "PASS";

  console.log(`\n  Threshold: <100ms = PASS, 100-500ms = WARN, >500ms = FAIL`);
  console.log(`Test 1: ${verdict(v)}\n`);
  return v;
}

// ── Test 2: Exercise Cache Lookup Performance ─────────────────────────────────
async function test2() {
  sectionHeader("TEST 2 — Exercise Cache Lookup Performance (800 exercises, 1000 filters)");

  // Generate cache of 800 exercises (EXDB_CACHE equivalent)
  const cache = Array.from({ length: 800 }, (_, i) => makeExercise(i));

  // Add some real-sounding names for search accuracy
  const realistic = [
    "Barbell Bench Press","Incline Dumbbell Press","Cable Crossover","Barbell Squat",
    "Romanian Deadlift","Leg Press","Lat Pulldown","Barbell Row","Overhead Press",
    "Barbell Curl","Tricep Pushdown","Lateral Raise","Plank","Deadlift","Hammer Curl",
  ];
  realistic.forEach((name, i) => { if (cache[i]) cache[i].name = name; });

  // Search terms to test (as used in ExercisePicker)
  const searchTerms = ["bench","sq","deadlift","a"]; // "a" is the hardest — matches almost everything

  const allLatencies = [];
  const searchResults = [];

  const filterFn = (exercises, term) => {
    const lower = term.toLowerCase();
    return exercises.filter(e =>
      e.name.toLowerCase().includes(lower) ||
      e.muscle_group.toLowerCase().includes(lower) ||
      (e.aliases && e.aliases.some(a => a.toLowerCase().includes(lower)))
    );
  };

  // Run 1000 filter operations — 250 per term
  for (const term of searchTerms) {
    const termLatencies = [];
    let matchCount = 0;

    for (let i = 0; i < 250; i++) {
      const t0      = performance.now();
      const results = filterFn(cache, term);
      const elapsed = performance.now() - t0;
      termLatencies.push(elapsed);
      if (i === 0) matchCount = results.length;
    }

    const avg = termLatencies.reduce((s, v) => s + v, 0) / termLatencies.length;
    const sorted = [...termLatencies].sort((a, b) => a - b);
    const p99 = sorted[Math.floor(termLatencies.length * 0.99)];

    allLatencies.push(...termLatencies);
    searchResults.push({ term: `"${term}"`, count: matchCount, avg, p99 });
  }

  // Summary stats
  const allSorted  = [...allLatencies].sort((a, b) => a - b);
  const overallAvg = allLatencies.reduce((s, v) => s + v, 0) / allLatencies.length;
  const overallP99 = allSorted[Math.floor(allLatencies.length * 0.99)];

  printTable(searchResults.map(r => ({
    term:    r.term,
    count:   String(r.count),
    avg:     `${r.avg.toFixed(3)}ms`,
    p99:     `${r.p99.toFixed(3)}ms`,
  })), [
    { key: "term",  label: "Search Term" },
    { key: "count", label: "Matches", align: "right" },
    { key: "avg",   label: "Avg Time", align: "right" },
    { key: "p99",   label: "p99 Time", align: "right" },
  ]);

  console.log(`\n  Overall avg: ${overallAvg.toFixed(3)}ms | p99: ${overallP99.toFixed(3)}ms`);

  // 1000 filter ops, each must be <16ms (one frame budget) at p99
  const v = overallP99 > 16   ? "FAIL"
          : overallP99 > 4    ? "WARN"
          : "PASS";

  console.log(`  Threshold: p99 <4ms = PASS, 4-16ms = WARN, >16ms = FAIL`);
  console.log(`Test 2: ${verdict(v)}\n`);
  return v;
}

// ── Test 3: Streak Calculation Performance ────────────────────────────────────
async function test3() {
  sectionHeader("TEST 3 — Streak Calculation Performance (365 days, 100 runs)");

  // Generate 365 days of workout history (1 year) — some rest days included
  const today     = new Date("2026-04-17");
  const history   = [];
  for (let d = 0; d < 365; d++) {
    const date = new Date(today);
    date.setDate(today.getDate() - d);
    // Roughly 5/7 days have workouts (realistic gym goer)
    if (d % 7 !== 2 && d % 7 !== 5) {
      history.push({ date: date.toISOString().split("T")[0] });
    }
  }

  // calculateRoutineStreak equivalent:
  // Walk backwards from today, counting consecutive days with a workout.
  function calculateRoutineStreak(historyEntries, referenceDate) {
    const dateSet = new Set(historyEntries.map(e => e.date));
    let streak  = 0;
    const ref   = new Date(referenceDate);
    const check = new Date(ref);

    while (true) {
      const dateStr = check.toISOString().split("T")[0];
      if (dateSet.has(dateStr)) {
        streak++;
        check.setDate(check.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  }

  const latencies = [];
  let streak = 0;

  for (let i = 0; i < 100; i++) {
    const t0 = performance.now();
    streak = calculateRoutineStreak(history, today.toISOString().split("T")[0]);
    latencies.push(performance.now() - t0);
  }

  const sorted  = [...latencies].sort((a, b) => a - b);
  const avg     = latencies.reduce((s, v) => s + v, 0) / latencies.length;
  const p50     = sorted[Math.floor(100 * 0.50)];
  const p99     = sorted[Math.floor(100 * 0.99)];
  const max     = sorted[99];

  const rows = [
    { metric: "History entries",    value: String(history.length) },
    { metric: "Calculated streak",  value: `${streak} days` },
    { metric: "Avg per run",        value: `${avg.toFixed(3)}ms` },
    { metric: "p50",                value: `${p50.toFixed(3)}ms` },
    { metric: "p99",                value: `${p99.toFixed(3)}ms` },
    { metric: "Max",                value: `${max.toFixed(3)}ms` },
    { metric: "Total (100 runs)",   value: `${latencies.reduce((s, v) => s + v, 0).toFixed(2)}ms` },
  ];

  printTable(rows, [
    { key: "metric", label: "Metric" },
    { key: "value",  label: "Value", align: "right" },
  ]);

  const v = p99 > 50  ? "FAIL"
          : p99 > 10  ? "WARN"
          : "PASS";

  console.log(`\n  Threshold: p99 <10ms = PASS, 10-50ms = WARN, >50ms = FAIL`);
  console.log(`Test 3: ${verdict(v)}\n`);
  return v;
}

// ── Test 4: localStorage Capacity Stress ──────────────────────────────────────
async function test4() {
  sectionHeader("TEST 4 — localStorage Capacity Stress");

  localStorage.clear();

  // 30 workout sessions (full structure)
  const exercises   = Array.from({ length: 15 }, (_, i) => makeExercise(i));
  const exerciseIds = exercises.map(e => e.id);
  const sessions30  = Array.from({ length: 30 }, (_, i) => makeWorkoutSession(i, exerciseIds));

  // 90 body weight entries
  const weights90 = Array.from({ length: 90 }, (_, i) => ({
    id:     randomUUID(),
    date:   new Date(Date.now() - i * 86400000).toISOString().split("T")[0],
    weight: (70 + Math.random() * 20).toFixed(2),
  }));

  // 20 measurement entries
  const measurements20 = Array.from({ length: 20 }, (_, i) => ({
    id:     randomUUID(),
    date:   new Date(Date.now() - i * 7 * 86400000).toISOString().split("T")[0],
    chest:  (90 + Math.random() * 10).toFixed(1),
    waist:  (80 + Math.random() * 10).toFixed(1),
    hips:   (95 + Math.random() * 10).toFixed(1),
    lArm:   (35 + Math.random() * 5).toFixed(1),
    rArm:   (35 + Math.random() * 5).toFixed(1),
    lThigh: (55 + Math.random() * 5).toFixed(1),
    rThigh: (55 + Math.random() * 5).toFixed(1),
    calves: (38 + Math.random() * 3).toFixed(1),
  }));

  // Full 7-day routine template
  const routineTemplate = {
    Mon: { type: "Push",   exercises: ["Bench Press","Incline DB Press","Cable Fly","Tricep Pushdown","Lateral Raise"] },
    Tue: { type: "Pull",   exercises: ["Deadlift","Barbell Row","Lat Pulldown","Face Pull","Barbell Curl"] },
    Wed: { type: "Legs",   exercises: ["Squat","Leg Press","Romanian DL","Leg Curl","Calf Raise"] },
    Thu: { type: "Upper",  exercises: ["Bench Press","Barbell Row","OHP","Barbell Curl","Tricep Pushdown"] },
    Fri: { type: "Lower",  exercises: ["Squat","Romanian DL","Leg Press","Leg Curl","Calf Raise"] },
    Sat: { type: "Cardio", exercises: ["Treadmill Run","Stationary Bike"] },
    Sun: { type: "Rest",   exercises: [] },
  };

  // Serialize and store each blob
  const userId = randomUUID();
  const blobs  = {
    [`theryn_history_${userId}`]:      JSON.stringify(sessions30),
    [`theryn_weights_${userId}`]:      JSON.stringify(weights90),
    [`theryn_measurements_${userId}`]: JSON.stringify(measurements20),
    [`theryn_routine_${userId}`]:      JSON.stringify(routineTemplate),
  };

  let totalBytes = 0;
  const blobRows = [];

  for (const [key, value] of Object.entries(blobs)) {
    const sizeBytes = Buffer.byteLength(value, "utf8");
    totalBytes += sizeBytes;
    localStorage.setItem(key, value);
    blobRows.push({
      key:   key.replace(userId, "<uid>"),
      size:  `${(sizeBytes / 1024).toFixed(2)} KB`,
      items: key.includes("history") ? "30 sessions"
           : key.includes("weights") ? "90 entries"
           : key.includes("measurements") ? "20 entries"
           : "7 days",
    });
  }

  const totalKB        = (totalBytes / 1024).toFixed(2);
  const LOCALSTORAGE_LIMIT_KB = 5120; // 5 MB typical
  const usagePct       = ((totalBytes / 1024 / LOCALSTORAGE_LIMIT_KB) * 100).toFixed(2);

  printTable(blobRows, [
    { key: "key",   label: "localStorage Key" },
    { key: "items", label: "Contents" },
    { key: "size",  label: "Size", align: "right" },
  ]);

  console.log(`\n  Storage budget used: ${totalKB} KB / ${LOCALSTORAGE_LIMIT_KB} KB (${usagePct}%)`);

  // Verify round-trip integrity
  const retrieved = JSON.parse(localStorage.getItem(`theryn_history_${userId}`));
  const integrityOk = Array.isArray(retrieved) && retrieved.length === 30;

  console.log(`  Round-trip integrity: ${integrityOk ? `${GREEN}OK${RESET}` : `${RED}FAIL${RESET}`}`);

  // Verdict: WARN if >10%, FAIL if >50% or integrity broken
  const pct = parseFloat(usagePct);
  const v   = !integrityOk || pct > 50  ? "FAIL"
            : pct > 10                   ? "WARN"
            : "PASS";

  console.log(`  Threshold: <10% of 5MB = PASS, 10-50% = WARN, >50% = FAIL`);
  console.log(`Test 4: ${verdict(v)}\n`);

  localStorage.clear();
  return v;
}

// ── Test 5: State Update Simulation (rapid set-input writes) ──────────────────
async function test5() {
  sectionHeader("TEST 5 — State Update Simulation (90 rapid localStorage writes)");

  // Simulate a live workout session: 15 exercises × 3 sets × 2 fields (weight + reps)
  const NUM_EXERCISES = 15;
  const NUM_SETS      = 3;
  const sessionKey    = `theryn_active_session_${randomUUID()}`;

  // Initial session state
  const buildSession = (exercises) => ({
    id:         randomUUID(),
    startedAt:  new Date().toISOString(),
    type:       "Push",
    exercises,
  });

  const initialExercises = Array.from({ length: NUM_EXERCISES }, (_, ei) => ({
    name: `Exercise ${ei}`,
    sets: Array.from({ length: NUM_SETS }, () => ({ w: "", r: "" })),
  }));

  let state = buildSession(initialExercises);

  const latencies  = [];
  const overBudget = []; // writes > 16ms

  // Simulate 90 updates: each update changes one field, then serializes full state
  let updateNum = 0;
  for (let ei = 0; ei < NUM_EXERCISES; ei++) {
    for (let si = 0; si < NUM_SETS; si++) {
      // Weight update
      const newWeight = String(Math.floor(Math.random() * 100) + 20);
      const t0 = performance.now();
      state.exercises[ei].sets[si].w = newWeight;
      localStorage.setItem(sessionKey, JSON.stringify(state));
      const wLatency = performance.now() - t0;
      latencies.push(wLatency);
      if (wLatency > 16) overBudget.push({ update: updateNum, field: "weight", ms: wLatency });
      updateNum++;

      // Reps update
      const newReps = String(Math.floor(Math.random() * 10) + 3);
      const t1 = performance.now();
      state.exercises[ei].sets[si].r = newReps;
      localStorage.setItem(sessionKey, JSON.stringify(state));
      const rLatency = performance.now() - t1;
      latencies.push(rLatency);
      if (rLatency > 16) overBudget.push({ update: updateNum, field: "reps", ms: rLatency });
      updateNum++;
    }
  }

  const sorted  = [...latencies].sort((a, b) => a - b);
  const avg     = latencies.reduce((s, v) => s + v, 0) / latencies.length;
  const p50     = sorted[Math.floor(latencies.length * 0.50)];
  const p99     = sorted[Math.floor(latencies.length * 0.99)];
  const max     = sorted[latencies.length - 1];
  const total   = latencies.reduce((s, v) => s + v, 0);
  const finalSizeKB = (Buffer.byteLength(localStorage.getItem(sessionKey) || "", "utf8") / 1024).toFixed(2);

  const rows = [
    { metric: "Total writes",          value: String(latencies.length) },
    { metric: "Total time",            value: `${total.toFixed(2)}ms` },
    { metric: "Avg per write",         value: `${avg.toFixed(3)}ms` },
    { metric: "p50",                   value: `${p50.toFixed(3)}ms` },
    { metric: "p99",                   value: `${p99.toFixed(3)}ms` },
    { metric: "Max",                   value: `${max.toFixed(3)}ms` },
    { metric: "Writes > 16ms (frame)", value: String(overBudget.length) },
    { metric: "Final session size",    value: `${finalSizeKB} KB` },
  ];

  printTable(rows, [
    { key: "metric", label: "Metric" },
    { key: "value",  label: "Value", align: "right" },
  ]);

  if (overBudget.length > 0) {
    console.log(`\n  ${YELLOW}Writes exceeding 16ms frame budget:${RESET}`);
    for (const o of overBudget.slice(0, 5)) {
      console.log(`    Update #${o.update} (${o.field}): ${o.ms.toFixed(2)}ms`);
    }
    if (overBudget.length > 5) console.log(`    ... and ${overBudget.length - 5} more`);
  } else {
    console.log(`\n  ${GREEN}All writes completed within 16ms frame budget.${RESET}`);
  }

  const v = overBudget.length > 10  ? "FAIL"
          : overBudget.length > 0   ? "WARN"
          : p99 > 16                ? "WARN"
          : "PASS";

  console.log(`\n  Threshold: 0 writes >16ms = PASS, 1-10 = WARN, >10 = FAIL`);
  console.log(`Test 5: ${verdict(v)}\n`);

  localStorage.removeItem(sessionKey);
  return v;
}

// ── Test 6: Offline Queue Stress ──────────────────────────────────────────────
async function test6() {
  sectionHeader("TEST 6 — Offline Queue Stress (50 enqueues + dequeue performance)");

  const QUEUE_KEY = "theryn_offline_queue_stress_test";

  // Simulate enqueueAction logic from offlineQueue.ts
  function getQueue() {
    try {
      const q = localStorage.getItem(QUEUE_KEY);
      return q ? JSON.parse(q) : [];
    } catch { return []; }
  }

  function enqueue(action) {
    const queue = getQueue();
    const full  = { ...action, id: Date.now().toString() + Math.random().toString(36).slice(2) };
    queue.push(full);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    return full.id;
  }

  function dequeue(actionId) {
    const queue    = getQueue();
    const newQueue = queue.filter(a => a.id !== actionId);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(newQueue));
  }

  // Build realistic payloads matching real action types
  const exercises = Array.from({ length: 15 }, (_, i) => makeExercise(i));
  const exerciseIds = exercises.map(e => e.id);
  const userId = randomUUID();

  function makeWorkoutAction() {
    return {
      type:    "SAVE_WORKOUT",
      userId,
      payload: {
        type:        "Push",
        startedAt:   new Date().toISOString(),
        duration:    3600,
        totalSets:   45,
        totalVolume: 12000,
        exercises:   exercises.slice(0, 5).map(e => ({
          name: e.name,
          sets: Array.from({ length: 3 }, () => ({ w: "80", r: "8" })),
        })),
      },
    };
  }

  function makeRoutineAction() {
    return {
      type:    "SAVE_ROUTINE",
      userId,
      payload: {
        Mon: { type: "Push",  exercises: exercises.slice(0, 5).map(e => e.name) },
        Tue: { type: "Pull",  exercises: exercises.slice(5, 10).map(e => e.name) },
        Wed: { type: "Legs",  exercises: exercises.slice(10, 15).map(e => e.name) },
        Thu: { type: "Upper", exercises: exercises.slice(0, 5).map(e => e.name) },
        Fri: { type: "Lower", exercises: exercises.slice(5, 10).map(e => e.name) },
        Sat: { type: "Cardio",exercises: ["Treadmill Run"] },
        Sun: { type: "Rest",  exercises: [] },
      },
    };
  }

  // ── Enqueue 50 items ──────────────────────────────────────────────────────
  const enqueueLatencies = [];
  const ids = [];

  for (let i = 0; i < 50; i++) {
    const action = i % 2 === 0 ? makeWorkoutAction() : makeRoutineAction();
    const t0     = performance.now();
    const id     = enqueue(action);
    enqueueLatencies.push(performance.now() - t0);
    ids.push(id);
  }

  const queueAfterEnqueue = getQueue();
  const queueSizeKB = (Buffer.byteLength(
    localStorage.getItem(QUEUE_KEY) || "", "utf8"
  ) / 1024).toFixed(2);

  // ── Measure full read+parse overhead at 50 items ──────────────────────────
  const parseLatencies = [];
  for (let i = 0; i < 20; i++) {
    const t0 = performance.now();
    getQueue(); // full JSON parse each time
    parseLatencies.push(performance.now() - t0);
  }

  // ── Dequeue all 50 items, measure each ───────────────────────────────────
  const dequeueLatencies = [];
  for (const id of ids) {
    const t0 = performance.now();
    dequeue(id);
    dequeueLatencies.push(performance.now() - t0);
  }

  const queueAfterDequeue = getQueue();

  // Find degradation threshold: at what queue size does dequeue take >16ms?
  // We'll re-fill the queue to find it
  localStorage.removeItem(QUEUE_KEY);
  let degradationSize = null;
  for (let n = 1; n <= 500; n++) {
    enqueue(makeWorkoutAction());
    const t0 = performance.now();
    getQueue();
    const readTime = performance.now() - t0;
    if (readTime > 16 && degradationSize === null) {
      degradationSize = n;
      break;
    }
  }
  localStorage.removeItem(QUEUE_KEY);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const avgEnqueue = enqueueLatencies.reduce((s, v) => s + v, 0) / enqueueLatencies.length;
  const avgDequeue = dequeueLatencies.reduce((s, v) => s + v, 0) / dequeueLatencies.length;
  const maxEnqueue = Math.max(...enqueueLatencies);
  const maxDequeue = Math.max(...dequeueLatencies);
  const avgParse   = parseLatencies.reduce((s, v) => s + v, 0) / parseLatencies.length;

  const rows = [
    { metric: "Actions enqueued",        value: String(queueAfterEnqueue.length) },
    { metric: "Queue size on disk",      value: `${queueSizeKB} KB` },
    { metric: "Avg enqueue time",        value: `${avgEnqueue.toFixed(3)}ms` },
    { metric: "Max enqueue time",        value: `${maxEnqueue.toFixed(3)}ms` },
    { metric: "Avg dequeue time",        value: `${avgDequeue.toFixed(3)}ms` },
    { metric: "Max dequeue time",        value: `${maxDequeue.toFixed(3)}ms` },
    { metric: "Avg parse (50-item queue)", value: `${avgParse.toFixed(3)}ms` },
    { metric: "Actions remaining",       value: String(queueAfterDequeue.length) },
    { metric: "Degradation threshold",   value: degradationSize ? `~${degradationSize} items` : ">500 items" },
  ];

  printTable(rows, [
    { key: "metric", label: "Metric" },
    { key: "value",  label: "Value", align: "right" },
  ]);

  const allDequeueOk = queueAfterDequeue.length === 0;
  const perfOk       = avgDequeue < 10 && maxDequeue < 50;
  const parseOk      = avgParse < 5;

  const issues = [];
  if (!allDequeueOk) issues.push("queue not fully drained");
  if (!perfOk)       issues.push(`dequeue too slow (avg ${avgDequeue.toFixed(2)}ms, max ${maxDequeue.toFixed(2)}ms)`);
  if (!parseOk)      issues.push(`parse overhead high (avg ${avgParse.toFixed(2)}ms)`);

  if (issues.length) console.log(`\n  ${YELLOW}Issues: ${issues.join("; ")}${RESET}`);

  const v = issues.length === 0 ? "PASS"
          : issues.some(i => i.includes("not fully")) ? "FAIL"
          : "WARN";

  console.log(`\n  Threshold: all drained + avg dequeue <10ms + parse <5ms = PASS`);
  console.log(`Test 6: ${verdict(v)}\n`);
  return v;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${BOLD}Theryn — Data Volume & Logic Performance Tests${RESET}`);
  console.log(`${DIM}Pure Node.js simulation — no Supabase calls${RESET}`);
  console.log(`${DIM}Node.js: ${process.version}  Date: ${new Date().toISOString()}${RESET}\n`);

  const results = {};

  try { results[1] = await test1(); } catch (e) { console.error("Test 1 crashed:", e); results[1] = "FAIL"; }
  try { results[2] = await test2(); } catch (e) { console.error("Test 2 crashed:", e); results[2] = "FAIL"; }
  try { results[3] = await test3(); } catch (e) { console.error("Test 3 crashed:", e); results[3] = "FAIL"; }
  try { results[4] = await test4(); } catch (e) { console.error("Test 4 crashed:", e); results[4] = "FAIL"; }
  try { results[5] = await test5(); } catch (e) { console.error("Test 5 crashed:", e); results[5] = "FAIL"; }
  try { results[6] = await test6(); } catch (e) { console.error("Test 6 crashed:", e); results[6] = "FAIL"; }

  // ── Final Summary ─────────────────────────────────────────────────────────
  sectionHeader("SUMMARY");

  const descriptions = {
    1: "Large Workout History Processing  (30 sessions × 75 sets)",
    2: "Exercise Cache Lookup Performance (800 exercises, 1000 filters)",
    3: "Streak Calculation Performance    (365 days, 100 runs)",
    4: "localStorage Capacity Stress      (30 sessions + body data)",
    5: "State Update Simulation           (90 rapid writes)",
    6: "Offline Queue Stress              (50 enqueues + replay)",
  };

  const summaryRows = Object.entries(results).map(([n, v]) => ({
    test:   `Test ${n}`,
    name:   descriptions[n],
    result: verdict(v),
  }));

  printTable(summaryRows, [
    { key: "test",   label: "Test" },
    { key: "name",   label: "Description" },
    { key: "result", label: "Verdict" },
  ]);

  const allValues = Object.values(results);
  const hasFail   = allValues.includes("FAIL");
  const hasWarn   = allValues.includes("WARN");
  const overall   = hasFail ? "FAIL" : hasWarn ? "WARN" : "PASS";

  console.log(`\n${BOLD}Overall: ${verdict(overall)}${RESET}\n`);
  process.exit(hasFail ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
