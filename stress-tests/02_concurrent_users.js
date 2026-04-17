/**
 * Theryn Gym App — Concurrent Users Stress Test
 * ------------------------------------------------
 * Simulates multiple real users hitting the Supabase backend simultaneously.
 * Uses only Node.js built-ins + native fetch (Node 18+, optimised for Node 23).
 *
 * Run with:
 *   node stress-tests/02_concurrent_users.js
 */

'use strict';

// ─── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL  = 'https://rmzfisntgiodoadwaewx.supabase.co';
const ANON_KEY      = 'sb_publishable_DfhPc3bnlgdEs6Dlq6ONCw_sVc7Z2bL';
const REST_BASE     = `${SUPABASE_URL}/rest/v1`;

const BASE_HEADERS  = {
  apikey:           ANON_KEY,
  'Content-Type':   'application/json',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a random UUID v4 (no external deps). */
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Perform a timed GET request. Returns { status, ms, ok }. */
async function timedGet(url) {
  const start = performance.now();
  try {
    const res = await fetch(url, { headers: BASE_HEADERS });
    const ms  = performance.now() - start;
    return { status: res.status, ms, ok: res.ok };
  } catch (err) {
    const ms = performance.now() - start;
    return { status: 0, ms, ok: false, error: err.message };
  }
}

/** Percentile helper. arr must be sorted ascending. */
function percentile(sortedArr, p) {
  if (sortedArr.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, idx)];
}

// ─── Virtual User ─────────────────────────────────────────────────────────────

/**
 * A single virtual user session.
 *
 * Steps:
 *  1. Load public exercises
 *  2. Search exercises (squat)
 *  3. Attempt to load routine        → expects 401
 *  4. Attempt to read workout history → expects 401
 *  5. Attempt to read body weights   → expects 401
 *
 * Returns a result object with timing + classification per step.
 */
async function virtualUserSession(userId) {
  const fakeUUID = uuid();
  const sessionStart = performance.now();

  const steps = [];

  // Step 1 — public exercises
  const s1 = await timedGet(`${REST_BASE}/public_exercises?select=id,name&limit=100`);
  steps.push({ name: 'load_exercises',    ...s1, expected: 200 });

  // Step 2 — search exercises
  const s2 = await timedGet(`${REST_BASE}/public_exercises?name=ilike.*squat*&limit=10`);
  steps.push({ name: 'search_exercises',  ...s2, expected: 200 });

  // Step 3 — routine (protected)
  const s3 = await timedGet(`${REST_BASE}/routines?select=*&user_id=eq.${fakeUUID}`);
  steps.push({ name: 'load_routine',      ...s3, expected: 401 });

  // Step 4 — workout history (protected)
  const s4 = await timedGet(`${REST_BASE}/workout_sessions?user_id=eq.${fakeUUID}`);
  steps.push({ name: 'workout_history',   ...s4, expected: 401 });

  // Step 5 — body weights (protected)
  const s5 = await timedGet(`${REST_BASE}/body_weights?user_id=eq.${fakeUUID}`);
  steps.push({ name: 'body_weights',      ...s5, expected: 401 });

  const sessionMs = performance.now() - sessionStart;

  // Classify each step
  const publicSteps    = steps.filter(s => s.expected === 200);
  const protectedSteps = steps.filter(s => s.expected === 401);

  const publicOk      = publicSteps.every(s => s.status === 200);
  const rlsBlocked    = protectedSteps.every(s => s.status === 401);
  const hasError      = steps.some(s => s.status === 0);           // network error
  const publicErrors  = publicSteps.filter(s => s.status !== 200 && s.status !== 0).length;

  return {
    userId,
    sessionMs,
    steps,
    publicOk,
    rlsBlocked,
    hasError,
    completed: !hasError && publicOk,
    publicErrors,
  };
}

// ─── Scenario Runner ──────────────────────────────────────────────────────────

async function runScenario(label, userCount) {
  const wallStart = performance.now();

  const promises = Array.from({ length: userCount }, (_, i) => virtualUserSession(i + 1));
  const results  = await Promise.all(promises);

  const wallMs   = performance.now() - wallStart;

  // Session times
  const sessionTimes = results.map(r => r.sessionMs).sort((a, b) => a - b);
  const avgSession   = sessionTimes.reduce((s, v) => s + v, 0) / sessionTimes.length;
  const p95Session   = percentile(sessionTimes, 95);

  // Counts
  const completed      = results.filter(r => r.completed).length;
  const publicOkCount  = results.filter(r => r.publicOk).length;
  const rlsBlockCount  = results.filter(r => r.rlsBlocked).length;
  const errorCount     = results.filter(r => r.hasError).length;

  const publicOkPct    = ((publicOkCount  / userCount) * 100).toFixed(1);
  const rlsBlockPct    = ((rlsBlockCount  / userCount) * 100).toFixed(1);
  const errorPct       = ((errorCount     / userCount) * 100).toFixed(1);

  return {
    label,
    userCount,
    wallMs,
    avgSession,
    p95Session,
    completed,
    publicOkPct,
    rlsBlockPct,
    errorPct,
    errorCount,
    results,
  };
}

// ─── Coach Workflow Simulation ────────────────────────────────────────────────

/**
 * 5 coaches each attempt to read 3 athletes' data simultaneously (15 queries
 * per coach = 30 total across 2 tables per athlete).
 * All are expected to be blocked with 401 — measures RLS rejection speed.
 */
async function runCoachWorkflow() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Coach Workflow Simulation (5 coaches × 3 athletes × 2 tables = 30 queries)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const coachCount   = 5;
  const athleteCount = 3;

  const start = performance.now();

  const allQueries = [];

  for (let coach = 0; coach < coachCount; coach++) {
    for (let athlete = 0; athlete < athleteCount; athlete++) {
      const athleteUUID = uuid();

      // Each coach reads two tables per athlete
      allQueries.push(
        timedGet(`${REST_BASE}/workout_sessions?user_id=eq.${athleteUUID}`),
        timedGet(`${REST_BASE}/body_weights?user_id=eq.${athleteUUID}`),
      );
    }
  }

  const results = await Promise.all(allQueries);
  const wallMs  = performance.now() - start;

  const blocked    = results.filter(r => r.status === 401).length;
  const errors     = results.filter(r => r.status === 0).length;
  const leaked     = results.filter(r => r.status === 200).length;
  const times      = results.map(r => r.ms).sort((a, b) => a - b);
  const avgMs      = times.reduce((s, v) => s + v, 0) / times.length;
  const p95Ms      = percentile(times, 95);

  console.log(`\n  Total queries  : ${results.length}`);
  console.log(`  Wall time      : ${wallMs.toFixed(0)} ms`);
  console.log(`  Avg per query  : ${avgMs.toFixed(0)} ms`);
  console.log(`  P95 per query  : ${p95Ms.toFixed(0)} ms`);
  console.log(`  RLS Blocked    : ${blocked} / ${results.length}  (${((blocked / results.length) * 100).toFixed(1)}%)`);
  console.log(`  Data Leaked    : ${leaked} / ${results.length}  ← should be 0`);
  console.log(`  Network Errors : ${errors}`);

  if (leaked === 0 && blocked === results.length) {
    console.log('\n  ✅  Coach simulation PASSED — all unauthorized data access blocked by RLS.');
  } else if (leaked > 0) {
    console.log(`\n  ❌  CRITICAL — ${leaked} query/queries returned data without auth. Check RLS policies!`);
  } else {
    console.log(`\n  ⚠️   Partial result — ${errors} network errors may have masked outcomes.`);
  }
}

// ─── Results Printer ─────────────────────────────────────────────────────────

function printScenarioTable(scenarioResults) {
  const header = [
    'Users'.padStart(6),
    'Wall Time'.padStart(10),
    'Avg Session'.padStart(12),
    'P95 Session'.padStart(12),
    'Public OK%'.padStart(11),
    'RLS Blocks%'.padStart(12),
    'Errors%'.padStart(8),
    'Completed'.padStart(10),
  ].join('  ');

  const divider = '─'.repeat(header.length);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Scenario Results');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('  ' + header);
  console.log('  ' + divider);

  for (const s of scenarioResults) {
    const row = [
      String(s.userCount).padStart(6),
      `${s.wallMs.toFixed(0)}ms`.padStart(10),
      `${s.avgSession.toFixed(0)}ms`.padStart(12),
      `${s.p95Session.toFixed(0)}ms`.padStart(12),
      `${s.publicOkPct}%`.padStart(11),
      `${s.rlsBlockPct}%`.padStart(12),
      `${s.errorPct}%`.padStart(8),
      `${s.completed}/${s.userCount}`.padStart(10),
    ].join('  ');

    console.log('  ' + row);
  }

  console.log('');
}

function printVerdict(scenarioResults) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Verdict');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Find the highest user count with no errors and good P95
  const P95_WARN_THRESHOLD    = 500;   // ms
  const P95_FAILURE_THRESHOLD = 2000;  // ms
  const ERROR_FAILURE_PCT     = 5;     // %

  let maxCleanUsers    = 0;
  let degradationAt    = null;
  let failureAt        = null;

  for (const s of scenarioResults) {
    const errPct = parseFloat(s.errorPct);
    if (errPct >= ERROR_FAILURE_PCT || s.p95Session >= P95_FAILURE_THRESHOLD) {
      if (!failureAt) failureAt = s.userCount;
    } else if (s.p95Session >= P95_WARN_THRESHOLD) {
      if (!degradationAt) degradationAt = s.userCount;
      maxCleanUsers = Math.max(maxCleanUsers, s.userCount);
    } else {
      maxCleanUsers = Math.max(maxCleanUsers, s.userCount);
    }
  }

  // Best scenario for positive verdict
  const bestGood = scenarioResults
    .filter(s => parseFloat(s.errorPct) < ERROR_FAILURE_PCT && s.p95Session < P95_WARN_THRESHOLD)
    .pop();

  if (bestGood) {
    console.log(
      `  ✅  App can handle ${bestGood.userCount} concurrent users` +
      ` with <${bestGood.avgSession.toFixed(0)}ms avg response` +
      ` and ${bestGood.p95Session.toFixed(0)}ms P95.`
    );
  }

  if (degradationAt && !failureAt) {
    console.log(
      `  ⚠️   Degradation detected at ${degradationAt} users` +
      ` (P95 > ${P95_WARN_THRESHOLD}ms). Consider connection pooling or caching.`
    );
  }

  if (failureAt) {
    console.log(
      `  ❌  Failure threshold reached at ${failureAt} users` +
      ` (P95 >= ${P95_FAILURE_THRESHOLD}ms or error rate >= ${ERROR_FAILURE_PCT}%).`
    );
  }

  // RLS summary
  const allRlsGood = scenarioResults.every(s => parseFloat(s.rlsBlockPct) === 100.0);
  if (allRlsGood) {
    console.log('  ✅  RLS enforcement: 100% consistent across all scenarios — protected routes always return 401.');
  } else {
    const leaky = scenarioResults.find(s => parseFloat(s.rlsBlockPct) < 100.0);
    console.log(`  ❌  RLS enforcement degraded at ${leaky?.userCount} users — some protected routes returned unexpected status.`);
  }

  console.log('');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║     Theryn Gym App — Concurrent Users Stress Test     ║');
  console.log('║     Target: https://rmzfisntgiodoadwaewx.supabase.co  ║');
  console.log(`║     Started: ${new Date().toISOString()}      ║`);
  console.log('╚═══════════════════════════════════════════════════════╝');

  // Scenarios
  const scenarios = [
    { label: 'Scenario 1',  userCount:   5 },
    { label: 'Scenario 2',  userCount:  10 },
    { label: 'Scenario 3',  userCount:  25 },
    { label: 'Scenario 4',  userCount:  50 },
    { label: 'Scenario 5',  userCount: 100 },
    { label: 'Scenario 6',  userCount: 200 },
  ];

  const scenarioResults = [];

  for (const { label, userCount } of scenarios) {
    process.stdout.write(`\n  Running ${label} — ${userCount} concurrent users... `);
    const result = await runScenario(label, userCount);
    scenarioResults.push(result);
    process.stdout.write(
      `done in ${result.wallMs.toFixed(0)}ms  ` +
      `(avg ${result.avgSession.toFixed(0)}ms, p95 ${result.p95Session.toFixed(0)}ms, ` +
      `errors: ${result.errorCount})\n`
    );

    // Brief back-off between large scenarios to be a polite citizen
    if (userCount >= 100) {
      await new Promise(r => setTimeout(r, 1500));
    } else if (userCount >= 50) {
      await new Promise(r => setTimeout(r, 800));
    }
  }

  // Print table
  printScenarioTable(scenarioResults);

  // Coach workflow
  await runCoachWorkflow();

  // Verdict
  console.log('');
  printVerdict(scenarioResults);

  console.log(`  Finished: ${new Date().toISOString()}`);
  console.log('');
}

main().catch((err) => {
  console.error('\n  FATAL ERROR:', err);
  process.exit(1);
});
