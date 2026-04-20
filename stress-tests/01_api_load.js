// ─────────────────────────────────────────────────────────────────────────────
// THERYN — SUPABASE API LOAD TEST
// Run with: node stress-tests/01_api_load.js
// Requires Node 18+ (native fetch)
// ─────────────────────────────────────────────────────────────────────────────

import { performance } from 'perf_hooks';

// ── Config ────────────────────────────────────────────────────────────────────
const SUPABASE_URL  = 'https://rmzfisntgiodoadwaewx.supabase.co';
const SUPABASE_ANON = 'sb_publishable_DfhPc3bnlgdEs6Dlq6ONCw_sVc7Z2bL';

const HEADERS = {
  apikey:        SUPABASE_ANON,
  Authorization: `Bearer ${SUPABASE_ANON}`,
  'Content-Type': 'application/json',
};

// ── ANSI colours ──────────────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
  white:  '\x1b[97m',
  blue:   '\x1b[34m',
  magenta:'\x1b[35m',
  bgGreen:  '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgRed:    '\x1b[41m',
};

function colourLatency(ms) {
  if (ms < 200)  return `${C.green}${ms.toFixed(1)} ms${C.reset}`;
  if (ms < 500)  return `${C.yellow}${ms.toFixed(1)} ms${C.reset}`;
  return `${C.red}${ms.toFixed(1)} ms${C.reset}`;
}

function verdict(p99) {
  if (p99 < 500)  return `${C.bgGreen}${C.white}  PASS  ${C.reset}`;
  if (p99 < 1000) return `${C.bgYellow}${C.white}  WARN  ${C.reset}`;
  return `${C.bgRed}${C.white}  FAIL  ${C.reset}`;
}

// ── Stats helpers ──────────────────────────────────────────────────────────────
function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

function stats(latencies) {
  const s = [...latencies].sort((a, b) => a - b);
  const sum = s.reduce((acc, v) => acc + v, 0);
  return {
    min:  s[0]             ?? 0,
    max:  s[s.length - 1]  ?? 0,
    avg:  sum / (s.length  || 1),
    p50:  percentile(s, 50),
    p95:  percentile(s, 95),
    p99:  percentile(s, 99),
    count: s.length,
  };
}

// ── Core request helper ───────────────────────────────────────────────────────
async function req(url, opts = {}) {
  const start = performance.now();
  let status = 0;
  let networkError = null;
  try {
    const r = await fetch(url, { headers: HEADERS, ...opts });
    status = r.status;
    await r.text(); // drain body
  } catch (e) {
    networkError = e.message;
  }
  const latency = performance.now() - start;
  return { latency, status, networkError };
}

// ── Display helpers ───────────────────────────────────────────────────────────
function printHeader(phase, title) {
  console.log(`\n${C.cyan}${C.bold}${'═'.repeat(54)}${C.reset}`);
  console.log(`${C.cyan}${C.bold}  Phase ${phase}: ${title}${C.reset}`);
  console.log(`${C.cyan}${C.bold}${'═'.repeat(54)}${C.reset}`);
}

function printStatsTable(st) {
  console.log(`  ${C.dim}${'─'.repeat(40)}${C.reset}`);
  console.log(`  ${'Metric'.padEnd(12)} ${'Value'.padEnd(20)}`);
  console.log(`  ${C.dim}${'─'.repeat(40)}${C.reset}`);
  const rows = [
    ['Requests',  st.count],
    ['Min',       st.min],
    ['Avg',       st.avg],
    ['p50',       st.p50],
    ['p95',       st.p95],
    ['p99',       st.p99],
    ['Max',       st.max],
  ];
  for (const [label, val] of rows) {
    const isLatency = label !== 'Requests';
    const display = isLatency ? colourLatency(val) : `${C.white}${val}${C.reset}`;
    console.log(`  ${label.padEnd(12)} ${display}`);
  }
  console.log(`  ${C.dim}${'─'.repeat(40)}${C.reset}`);
}

function printVerdict(p99) {
  console.log(`  Verdict (p99): ${verdict(p99)}`);
}

// ── Phase summary collector ───────────────────────────────────────────────────
const summary = [];

function recordPhase(name, p99, extra = '') {
  summary.push({ name, p99, extra });
}

// ─────────────────────────────────────────────────────────────────────────────
// BANNER
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${C.cyan}${C.bold}╔══════════════════════════════════════════════════╗${C.reset}`);
console.log(`${C.cyan}${C.bold}║       THERYN — SUPABASE API LOAD TEST            ║${C.reset}`);
console.log(`${C.cyan}${C.bold}║       Target: https://rmzfisntgiodoadwaewx...    ║${C.reset}`);
console.log(`${C.cyan}${C.bold}╚══════════════════════════════════════════════════╝${C.reset}`);
console.log(`  ${C.dim}Started: ${new Date().toISOString()}${C.reset}`);

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 1 — Sequential Baseline (10 requests)
// ─────────────────────────────────────────────────────────────────────────────
async function phase1() {
  printHeader(1, 'Sequential Baseline (10 requests)');

  const ENDPOINT = `${SUPABASE_URL}/rest/v1/public_exercises?select=id,name&limit=50`;
  const latencies = [];
  let httpErrors = 0;
  let netErrors  = 0;

  for (let i = 0; i < 10; i++) {
    process.stdout.write(`  Request ${String(i + 1).padStart(2)}/10 ... `);
    const r = await req(ENDPOINT);
    latencies.push(r.latency);
    if (r.networkError) { netErrors++; process.stdout.write(`${C.red}NET ERR${C.reset}\n`); }
    else if (r.status >= 400) { httpErrors++; process.stdout.write(`${C.yellow}HTTP ${r.status}${C.reset} ${colourLatency(r.latency)}\n`); }
    else { process.stdout.write(`${C.green}HTTP ${r.status}${C.reset} ${colourLatency(r.latency)}\n`); }
  }

  const st = stats(latencies);
  printStatsTable(st);
  console.log(`  HTTP errors: ${httpErrors}  |  Network errors: ${netErrors}`);
  printVerdict(st.p99);
  recordPhase('Phase 1 — Sequential Baseline', st.p99, `net_errors=${netErrors}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2/3/4 — Concurrent Burst (25 / 50 / 100)
// ─────────────────────────────────────────────────────────────────────────────
async function concurrentBurst(phase, count) {
  printHeader(phase, `Concurrent Burst (${count} simultaneous)`);

  const ENDPOINT = `${SUPABASE_URL}/rest/v1/public_exercises?select=id,name&limit=50`;

  const wallStart = performance.now();
  const results   = await Promise.all(Array.from({ length: count }, () => req(ENDPOINT)));
  const wallTime  = (performance.now() - wallStart) / 1000; // seconds

  const latencies  = results.map(r => r.latency);
  const httpErrors = results.filter(r => !r.networkError && r.status >= 400).length;
  const netErrors  = results.filter(r => !!r.networkError).length;
  const successes  = results.filter(r => !r.networkError && r.status < 400).length;

  const st = stats(latencies);
  const throughput = count / wallTime;
  const successRate = ((successes / count) * 100).toFixed(1);

  printStatsTable(st);
  console.log(`  Wall time:    ${colourLatency(wallTime * 1000)}`);
  console.log(`  Throughput:   ${C.white}${throughput.toFixed(1)} req/s${C.reset}`);
  console.log(`  Success rate: ${parseFloat(successRate) === 100 ? C.green : C.yellow}${successRate}%${C.reset}`);
  console.log(`  HTTP errors:  ${httpErrors}  |  Network errors: ${netErrors}`);
  printVerdict(st.p99);

  recordPhase(`Phase ${phase} — Burst ${count}`, st.p99, `throughput=${throughput.toFixed(1)} req/s, success=${successRate}%`);
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 5 — Sustained Load (200 requests, 20 in-flight)
// ─────────────────────────────────────────────────────────────────────────────
async function phase5() {
  printHeader(5, 'Sustained Load (200 total, 20 concurrent sliding window)');

  const ENDPOINT    = `${SUPABASE_URL}/rest/v1/public_exercises?select=id,name&limit=50`;
  const TOTAL       = 200;
  const CONCURRENCY = 20;

  const latencies   = [];
  let completed     = 0;
  let httpErrors    = 0;
  let netErrors     = 0;

  // Sliding window tracking (throughput over time)
  const bucketSize  = 1000; // 1 second buckets
  const buckets     = {};
  const wallStart   = performance.now();

  await new Promise((resolve) => {
    let inFlight  = 0;
    let launched  = 0;

    function fire() {
      while (inFlight < CONCURRENCY && launched < TOTAL) {
        inFlight++;
        launched++;
        const localLaunch = launched;
        req(ENDPOINT).then(r => {
          latencies.push(r.latency);
          if (r.networkError) netErrors++;
          else if (r.status >= 400) httpErrors++;
          completed++;
          // bucket by second
          const bucket = Math.floor((performance.now() - wallStart) / bucketSize);
          buckets[bucket] = (buckets[bucket] ?? 0) + 1;
          inFlight--;
          if (completed % 20 === 0 || completed === TOTAL) {
            const elapsed = ((performance.now() - wallStart) / 1000).toFixed(1);
            process.stdout.write(`\r  Completed: ${String(completed).padStart(3)}/${TOTAL}  Elapsed: ${elapsed}s   `);
          }
          if (completed === TOTAL) {
            process.stdout.write('\n');
            resolve();
          } else {
            fire();
          }
        });
      }
    }

    fire();
  });

  const wallTime   = (performance.now() - wallStart) / 1000;
  const throughput = TOTAL / wallTime;
  const st         = stats(latencies);

  // Detect slowdown: compare first-half vs second-half avg latency
  const half1 = latencies.slice(0, 100);
  const half2 = latencies.slice(100);
  const avg1  = half1.reduce((a, b) => a + b, 0) / (half1.length || 1);
  const avg2  = half2.reduce((a, b) => a + b, 0) / (half2.length || 1);
  const slowdownPct = (((avg2 - avg1) / avg1) * 100).toFixed(1);
  const slowdownStr = parseFloat(slowdownPct) > 20
    ? `${C.red}+${slowdownPct}% slowdown detected${C.reset}`
    : `${C.green}${slowdownPct}% (stable)${C.reset}`;

  // Per-second throughput
  const bucketKeys = Object.keys(buckets).map(Number).sort((a, b) => a - b);
  console.log(`\n  Per-second throughput:`);
  for (const k of bucketKeys) {
    const bar = '█'.repeat(Math.round(buckets[k] / 2));
    console.log(`    s${String(k).padEnd(3)} ${bar} ${buckets[k]} req`);
  }

  printStatsTable(st);
  console.log(`  Wall time:      ${colourLatency(wallTime * 1000)}`);
  console.log(`  Throughput:     ${C.white}${throughput.toFixed(1)} req/s${C.reset}`);
  console.log(`  Slowdown trend: ${slowdownStr}`);
  console.log(`  HTTP errors:    ${httpErrors}  |  Network errors: ${netErrors}`);
  printVerdict(st.p99);

  recordPhase('Phase 5 — Sustained Load', st.p99, `throughput=${throughput.toFixed(1)} req/s, slowdown=${slowdownPct}%`);
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 6 — Mixed Endpoint Load (50 concurrent, 3 endpoints)
// ─────────────────────────────────────────────────────────────────────────────
async function phase6() {
  printHeader(6, 'Mixed Endpoint Load (50 concurrent, 3 endpoints)');

  const ENDPOINTS = [
    `${SUPABASE_URL}/rest/v1/public_exercises?select=id,name,muscle_group&limit=100`,
    `${SUPABASE_URL}/rest/v1/public_exercises?select=id,name&name=ilike.*bench*`,
    `${SUPABASE_URL}/rest/v1/public_exercises?select=id,name&limit=10&offset=50`,
  ];

  const LABELS = ['Full list (limit=100)', 'Search (bench)', 'Paginated (offset=50)'];

  // Random ratio selection
  function pickEndpoint() {
    const roll = Math.random();
    if (roll < 0.4)  return 0; // 40%
    if (roll < 0.75) return 1; // 35%
    return 2;                  // 25%
  }

  const tasks = Array.from({ length: 50 }, () => {
    const idx = pickEndpoint();
    return req(ENDPOINTS[idx]).then(r => ({ ...r, endpointIdx: idx }));
  });

  const wallStart = performance.now();
  const results   = await Promise.all(tasks);
  const wallTime  = (performance.now() - wallStart) / 1000;

  // Per-endpoint stats
  for (let ei = 0; ei < ENDPOINTS.length; ei++) {
    const sub = results.filter(r => r.endpointIdx === ei);
    const lat = sub.map(r => r.latency);
    const st  = stats(lat);
    const httpE = sub.filter(r => !r.networkError && r.status >= 400).length;
    console.log(`\n  ${C.bold}${LABELS[ei]}${C.reset}`);
    console.log(`    Requests: ${sub.length}  |  HTTP errors: ${httpE}`);
    console.log(`    avg=${colourLatency(st.avg)}  p95=${colourLatency(st.p95)}  p99=${colourLatency(st.p99)}`);
  }

  const allLat    = results.map(r => r.latency);
  const allErrors = results.filter(r => !r.networkError && r.status >= 400).length;
  const allNet    = results.filter(r => !!r.networkError).length;
  const st        = stats(allLat);

  console.log(`\n  ${C.bold}Combined:${C.reset}`);
  printStatsTable(st);
  console.log(`  Wall time:   ${colourLatency(wallTime * 1000)}`);
  console.log(`  Throughput:  ${C.white}${(50 / wallTime).toFixed(1)} req/s${C.reset}`);
  console.log(`  HTTP errors: ${allErrors}  |  Network errors: ${allNet}`);
  printVerdict(st.p99);

  recordPhase('Phase 6 — Mixed Endpoints', st.p99, `throughput=${(50 / wallTime).toFixed(1)} req/s`);
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 7 — Auth Endpoint Stress (20 concurrent, expect 400)
// ─────────────────────────────────────────────────────────────────────────────
async function phase7() {
  printHeader(7, 'Auth Endpoint Stress (20 concurrent, expect 400)');

  const AUTH_URL = `${SUPABASE_URL}/auth/v1/token?grant_type=password`;
  const FAKE_BODY = JSON.stringify({ email: 'loadtest@fake.invalid', password: 'fake-password-123!' });

  const tasks = Array.from({ length: 20 }, () =>
    req(AUTH_URL, { method: 'POST', body: FAKE_BODY })
  );

  const wallStart = performance.now();
  const results   = await Promise.all(tasks);
  const wallTime  = (performance.now() - wallStart) / 1000;

  const latencies = results.map(r => r.latency);
  const statusMap = {};
  for (const r of results) {
    const key = r.networkError ? 'NET_ERR' : String(r.status);
    statusMap[key] = (statusMap[key] ?? 0) + 1;
  }

  const st = stats(latencies);

  printStatsTable(st);
  console.log(`  Wall time:     ${colourLatency(wallTime * 1000)}`);
  console.log(`  Throughput:    ${C.white}${(20 / wallTime).toFixed(1)} req/s${C.reset}`);
  console.log(`  Status codes:`);
  for (const [code, count] of Object.entries(statusMap)) {
    console.log(`    ${code}: ${count} responses`);
  }
  console.log(`  ${C.dim}(400/422 errors expected — testing auth service latency, not correctness)${C.reset}`);
  printVerdict(st.p99);

  recordPhase('Phase 7 — Auth Stress', st.p99, `status_codes=${JSON.stringify(statusMap)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 8 — Write Stress / RLS Enforcement (30 concurrent, expect 401/403)
// ─────────────────────────────────────────────────────────────────────────────
async function phase8() {
  printHeader(8, 'Write Stress — RLS Enforcement (30 concurrent, expect 401/403)');

  const WRITE_URL = `${SUPABASE_URL}/rest/v1/body_weights`;
  const FAKE_ROW  = JSON.stringify({
    user_id: '00000000-0000-0000-0000-000000000000',
    weight_kg: 70.5,
    logged_at: new Date().toISOString(),
  });

  const tasks = Array.from({ length: 30 }, () =>
    req(WRITE_URL, { method: 'POST', body: FAKE_ROW })
  );

  const wallStart = performance.now();
  const results   = await Promise.all(tasks);
  const wallTime  = (performance.now() - wallStart) / 1000;

  const latencies = results.map(r => r.latency);
  const statusMap = {};
  for (const r of results) {
    const key = r.networkError ? 'NET_ERR' : String(r.status);
    statusMap[key] = (statusMap[key] ?? 0) + 1;
  }

  const st          = stats(latencies);
  const rlsBlocked  = results.filter(r => r.status === 401 || r.status === 403).length;
  const rlsRate     = ((rlsBlocked / 30) * 100).toFixed(1);

  printStatsTable(st);
  console.log(`  Wall time:       ${colourLatency(wallTime * 1000)}`);
  console.log(`  Throughput:      ${C.white}${(30 / wallTime).toFixed(1)} req/s${C.reset}`);
  console.log(`  RLS blocked:     ${rlsBlocked}/30 (${rlsRate}%)`);
  console.log(`  Status codes:`);
  for (const [code, count] of Object.entries(statusMap)) {
    console.log(`    ${code}: ${count} responses`);
  }
  console.log(`  ${C.dim}(401/403 is expected — confirming RLS rejection speed)${C.reset}`);
  printVerdict(st.p99);

  recordPhase('Phase 8 — RLS Write Stress', st.p99, `rls_blocked=${rlsRate}%`);
}

// ─────────────────────────────────────────────────────────────────────────────
// FINAL SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
function printSummary() {
  console.log(`\n${C.cyan}${C.bold}${'═'.repeat(70)}${C.reset}`);
  console.log(`${C.cyan}${C.bold}  FINAL SUMMARY${C.reset}`);
  console.log(`${C.cyan}${C.bold}${'═'.repeat(70)}${C.reset}`);

  const nameW = 34;
  const p99W  = 14;
  console.log(`  ${'Phase'.padEnd(nameW)} ${'p99'.padEnd(p99W)} ${'Verdict'.padEnd(10)} Notes`);
  console.log(`  ${C.dim}${'─'.repeat(66)}${C.reset}`);

  for (const ph of summary) {
    const p99Str   = `${ph.p99.toFixed(1)} ms`;
    const verdictStr = ph.p99 < 500 ? `${C.green}PASS${C.reset}` : ph.p99 < 1000 ? `${C.yellow}WARN${C.reset}` : `${C.red}FAIL${C.reset}`;
    const p99Colour  = ph.p99 < 200 ? C.green : ph.p99 < 500 ? C.yellow : C.red;
    console.log(`  ${ph.name.padEnd(nameW)} ${p99Colour}${p99Str.padEnd(p99W)}${C.reset} ${verdictStr.padEnd(10 + 9)} ${C.dim}${ph.extra}${C.reset}`);
  }

  console.log(`\n  ${C.dim}Completed: ${new Date().toISOString()}${C.reset}`);
  console.log(`${C.cyan}${C.bold}${'═'.repeat(70)}${C.reset}\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  await phase1();
  await concurrentBurst(2, 25);
  await concurrentBurst(3, 50);
  await concurrentBurst(4, 100);
  await phase5();
  await phase6();
  await phase7();
  await phase8();
  printSummary();
}

main().catch(err => {
  console.error(`${C.red}Fatal error:${C.reset}`, err);
  process.exit(1);
});
