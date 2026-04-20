#!/usr/bin/env node
/**
 * Theryn Stress Test 07 — Supabase Realtime WebSocket Stress
 *
 * Tests Realtime WebSocket connections under concurrent load.
 * Uses Node.js built-ins ONLY — no npm packages required.
 * Requires Node 22+ for native WebSocket support.
 */

'use strict';

// ─── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL  = 'https://rmzfisntgiodoadwaewx.supabase.co';
const ANON_KEY      = 'sb_publishable_DfhPc3bnlgdEs6Dlq6ONCw_sVc7Z2bL';
const WS_URL        = `wss://rmzfisntgiodoadwaewx.supabase.co/realtime/v1/websocket?apikey=${ANON_KEY}&vsn=1.0.0`;

const CONNECT_TIMEOUT_MS  = 10_000;
const SUB_ACK_TIMEOUT_MS  = 8_000;
const HEARTBEAT_DURATION  = 30_000;   // Test 7: keep-alive window

// ─── Helpers ─────────────────────────────────────────────────────────────────

const now = () => Date.now();

function pad(str, len, right = false) {
  str = String(str);
  const spaces = Math.max(0, len - str.length);
  return right ? str + ' '.repeat(spaces) : ' '.repeat(spaces) + str;
}

function printBanner(title) {
  const line = '─'.repeat(60);
  console.log(`\n┌${line}┐`);
  console.log(`│  ${title.padEnd(58)}│`);
  console.log(`└${line}┘`);
}

function printRow(...cols) {
  console.log('  ' + cols.join('  '));
}

/** Check whether native WebSocket is available (Node 22+). */
function hasWebSocket() {
  return typeof WebSocket !== 'undefined';
}

/**
 * Open a single WebSocket connection and resolve with timing data.
 * Rejects on timeout or connection error.
 */
function openConnection(label, channelTopic, timeoutMs = CONNECT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const startConnect = now();
    let ws;

    const timer = setTimeout(() => {
      try { ws && ws.close(); } catch (_) {}
      reject(new Error(`TIMEOUT connecting ${label}`));
    }, timeoutMs);

    try {
      ws = new WebSocket(WS_URL);
    } catch (err) {
      clearTimeout(timer);
      return reject(err);
    }

    let connectTime  = null;
    let subAckTime   = null;
    let joinRef       = String(Math.floor(Math.random() * 1_000_000));
    let subscribed    = false;

    ws.addEventListener('open', () => {
      connectTime = now() - startConnect;

      // Send a Phoenix channel join message
      const joinMsg = JSON.stringify({
        topic:    channelTopic,
        event:    'phx_join',
        payload:  {},
        ref:      joinRef,
        join_ref: joinRef,
      });
      ws.send(joinMsg);
    });

    ws.addEventListener('message', (evt) => {
      let msg;
      try { msg = JSON.parse(evt.data); } catch (_) { return; }

      // Phoenix heartbeat / welcome
      if (!subscribed && msg.event === 'phx_reply' && msg.ref === joinRef) {
        subAckTime = now() - startConnect - connectTime;
        subscribed = true;
        clearTimeout(timer);
        resolve({ label, ws, connectTime, subAckTime, error: null });
      }
    });

    ws.addEventListener('error', (evt) => {
      clearTimeout(timer);
      reject(new Error(`WS error on ${label}: ${evt.message || 'unknown'}`));
    });

    ws.addEventListener('close', (evt) => {
      if (!subscribed) {
        clearTimeout(timer);
        reject(new Error(`WS closed before sub ack on ${label} (code ${evt.code})`));
      }
    });
  });
}

/** Gracefully close a WebSocket. */
function closeConnection(ws) {
  return new Promise((resolve) => {
    if (!ws || ws.readyState === WebSocket.CLOSED) return resolve();
    ws.addEventListener('close', resolve, { once: true });
    try { ws.close(1000, 'test complete'); } catch (_) { resolve(); }
  });
}

/** Open N connections in parallel, collect results (errors are non-fatal). */
async function openMany(count, channelPrefix) {
  const tasks = Array.from({ length: count }, (_, i) => {
    const label   = `conn-${i + 1}`;
    const topic   = `realtime:${channelPrefix}-${i + 1}`;
    return openConnection(label, topic).catch((err) => ({
      label,
      ws: null,
      connectTime: null,
      subAckTime: null,
      error: err.message,
    }));
  });
  return Promise.all(tasks);
}

/** Close an array of result objects that hold open WebSockets. */
async function closeAll(results) {
  await Promise.all(results.map((r) => closeConnection(r.ws)));
}

/** Compute basic stats from an array of numbers (filters out nulls). */
function stats(arr) {
  const vals = arr.filter((v) => v !== null && v !== undefined);
  if (!vals.length) return { min: '-', max: '-', avg: '-', count: 0 };
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  return { min, max, avg, count: vals.length };
}

// ─── Test 1: Single Connection Baseline ──────────────────────────────────────

async function test1() {
  printBanner('Test 1: Single Connection Baseline');
  const startTs = now();

  let result;
  try {
    result = await openConnection('single', 'realtime:public:routines');
  } catch (err) {
    console.log(`  FAIL — ${err.message}`);
    return { passed: false, connectTime: null, subAckTime: null };
  }

  const { ws, connectTime, subAckTime } = result;
  await closeConnection(ws);

  const elapsed = now() - startTs;
  console.log(`  Connect time    : ${connectTime} ms`);
  console.log(`  Sub ack time    : ${subAckTime} ms`);
  console.log(`  Total elapsed   : ${elapsed} ms`);
  console.log(`  Status          : PASS ✓`);

  return { passed: true, connectTime, subAckTime };
}

// ─── Test 2–5: Concurrent Connections ────────────────────────────────────────

async function testConcurrent(testNum, count) {
  const labels = {
    2: '5 Concurrent Connections',
    3: '10 Concurrent Connections',
    4: '25 Concurrent Connections (coach + 25 athletes)',
    5: '50 Concurrent Connections (breaking-point probe)',
  };
  printBanner(`Test ${testNum}: ${labels[testNum]}`);

  const startTs = now();
  const results = await openMany(count, `user-${testNum}`);
  const elapsed  = now() - startTs;

  const connected = results.filter((r) => !r.error);
  const failed    = results.filter((r) =>  r.error);

  const cStats = stats(connected.map((r) => r.connectTime));
  const sStats = stats(connected.map((r) => r.subAckTime));

  console.log(`  Requested       : ${count}`);
  console.log(`  Connected       : ${connected.length}`);
  console.log(`  Failed/Refused  : ${failed.length}`);
  console.log(`  Total elapsed   : ${elapsed} ms`);
  if (connected.length) {
    console.log(`  Connect — avg ${cStats.avg} ms  min ${cStats.min} ms  max ${cStats.max} ms`);
    console.log(`  Sub ack  — avg ${sStats.avg} ms  min ${sStats.min} ms  max ${sStats.max} ms`);
  }
  if (failed.length) {
    failed.slice(0, 5).forEach((r) => console.log(`    ✗ ${r.label}: ${r.error}`));
    if (failed.length > 5) console.log(`    … and ${failed.length - 5} more`);
  }

  const passed = failed.length === 0;
  console.log(`  Status          : ${passed ? 'PASS ✓' : `WARN — ${failed.length} failures`}`);

  await closeAll(results);
  return { passed, connected: connected.length, failed: failed.length, elapsed };
}

// ─── Test 6: Connection Churn ─────────────────────────────────────────────────

async function test6() {
  printBanner('Test 6: Connection Churn Test (10 conns × 5 cycles)');

  const CYCLES     = 5;
  const PER_CYCLE  = 10;
  const cycleTimes = [];

  for (let cycle = 1; cycle <= CYCLES; cycle++) {
    const cycleStart = now();
    const results    = await openMany(PER_CYCLE, `churn-cycle${cycle}`);
    await closeAll(results);
    const cycleMs = now() - cycleStart;
    cycleTimes.push(cycleMs);

    const ok   = results.filter((r) => !r.error).length;
    const fail = results.filter((r) =>  r.error).length;
    console.log(`  Cycle ${cycle}: ${ok}/${PER_CYCLE} connected, ${fail} failed — ${cycleMs} ms`);
  }

  const cStats = stats(cycleTimes);
  console.log(`  Cycle times — avg ${cStats.avg} ms  min ${cStats.min} ms  max ${cStats.max} ms`);

  // Simple leak heuristic: if later cycles are >2× slower than the first, flag it
  const ratio = cycleTimes[CYCLES - 1] / cycleTimes[0];
  const leak  = ratio > 2.0;
  console.log(`  Cycle time ratio (last/first): ${ratio.toFixed(2)}x — ${leak ? 'WARN: possible connection leak' : 'OK'}`);
  console.log(`  Status: ${leak ? 'WARN ⚠' : 'PASS ✓'}`);

  return { passed: !leak, cycleTimes };
}

// ─── Test 7: Heartbeat / Keep-Alive Stress ───────────────────────────────────

async function test7() {
  printBanner(`Test 7: Heartbeat/Keep-Alive Stress (5 conns × ${HEARTBEAT_DURATION / 1000}s)`);

  const COUNT = 5;
  const results = await openMany(COUNT, 'keepalive');
  const connected = results.filter((r) => !r.error);

  if (!connected.length) {
    console.log('  SKIP — no connections established');
    await closeAll(results);
    return { passed: false };
  }

  // Listen for heartbeat messages on each open connection
  const heartbeatCounts = new Array(connected.length).fill(0);
  const unexpectedCloses = [];

  connected.forEach(({ ws, label }, idx) => {
    ws.addEventListener('message', (evt) => {
      let msg;
      try { msg = JSON.parse(evt.data); } catch (_) { return; }
      // Phoenix heartbeat events
      if (msg.event === 'heartbeat' || msg.event === 'phx_reply') {
        heartbeatCounts[idx]++;
      }
    });
    ws.addEventListener('close', (evt) => {
      if (evt.code !== 1000) {
        unexpectedCloses.push({ label, code: evt.code });
      }
    });
  });

  // Send Phoenix heartbeat pings every ~5 s to keep connections alive
  const PING_INTERVAL = 5_000;
  let pingRef = 1;
  const pingTimer = setInterval(() => {
    connected.forEach(({ ws }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(pingRef++) }));
      }
    });
  }, PING_INTERVAL);

  // Wait for the observation window
  await new Promise((r) => setTimeout(r, HEARTBEAT_DURATION));
  clearInterval(pingTimer);

  const totalBeats = heartbeatCounts.reduce((a, b) => a + b, 0);
  const avgBeats   = (totalBeats / connected.length).toFixed(1);
  // Estimated interval: window / avg beats (guard against 0)
  const estInterval = totalBeats > 0
    ? Math.round(HEARTBEAT_DURATION / (totalBeats / connected.length))
    : 'N/A';

  console.log(`  Connections monitored  : ${connected.length}`);
  console.log(`  Total heartbeat msgs   : ${totalBeats}`);
  console.log(`  Avg msgs/connection    : ${avgBeats}`);
  console.log(`  Est. heartbeat interval: ${estInterval === 'N/A' ? estInterval : estInterval + ' ms'}`);
  console.log(`  Unexpected closes      : ${unexpectedCloses.length}`);
  if (unexpectedCloses.length) {
    unexpectedCloses.forEach((u) => console.log(`    ✗ ${u.label} closed with code ${u.code}`));
  }

  await closeAll(results);

  const passed = unexpectedCloses.length === 0;
  console.log(`  Status: ${passed ? 'PASS ✓' : 'FAIL ✗'}`);
  return { passed, totalBeats, estInterval };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const suiteStart = now();

  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║       THERYN STRESS TEST 07 — Realtime WebSocket            ║');
  console.log(`║       ${new Date().toISOString().padEnd(54)}║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // Guard: native WebSocket required (Node 22+)
  if (!hasWebSocket()) {
    console.log('\n  SKIP — native WebSocket not available.');
    console.log('  Requires Node.js 22+. Current version: ' + process.version);
    console.log('  Upgrade with: nvm install 22 && nvm use 22');
    process.exit(1);
  }

  console.log(`  Node version    : ${process.version}`);
  console.log(`  Target URL      : ${WS_URL.slice(0, 60)}…`);

  const results = {};

  try { results.t1 = await test1(); }
  catch (e) { console.error('  UNEXPECTED ERROR in Test 1:', e.message); results.t1 = { passed: false }; }

  try { results.t2 = await testConcurrent(2,  5); }
  catch (e) { console.error('  UNEXPECTED ERROR in Test 2:', e.message); results.t2 = { passed: false }; }

  try { results.t3 = await testConcurrent(3, 10); }
  catch (e) { console.error('  UNEXPECTED ERROR in Test 3:', e.message); results.t3 = { passed: false }; }

  try { results.t4 = await testConcurrent(4, 25); }
  catch (e) { console.error('  UNEXPECTED ERROR in Test 4:', e.message); results.t4 = { passed: false }; }

  try { results.t5 = await testConcurrent(5, 50); }
  catch (e) { console.error('  UNEXPECTED ERROR in Test 5:', e.message); results.t5 = { passed: false }; }

  try { results.t6 = await test6(); }
  catch (e) { console.error('  UNEXPECTED ERROR in Test 6:', e.message); results.t6 = { passed: false }; }

  try { results.t7 = await test7(); }
  catch (e) { console.error('  UNEXPECTED ERROR in Test 7:', e.message); results.t7 = { passed: false }; }

  // ─── Summary table ──────────────────────────────────────────────────────────
  const suiteDuration = now() - suiteStart;

  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║              REALTIME STRESS TEST SUMMARY                   ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');

  const rows = [
    ['Test 1', 'Single baseline',        results.t1],
    ['Test 2', '5 concurrent',           results.t2],
    ['Test 3', '10 concurrent',          results.t3],
    ['Test 4', '25 concurrent',          results.t4],
    ['Test 5', '50 concurrent',          results.t5],
    ['Test 6', 'Connection churn',       results.t6],
    ['Test 7', 'Heartbeat / keep-alive', results.t7],
  ];

  rows.forEach(([id, desc, r]) => {
    const icon = !r ? '✗ FAIL' : r.passed ? '✓ PASS' : '⚠ WARN';
    const line = `  ${id}  ${desc.padEnd(28)} ${icon}`;
    console.log(`║ ${line.padEnd(62)}║`);
  });

  console.log('╠══════════════════════════════════════════════════════════════╣');

  // Capacity estimate: find highest N where all conns succeeded
  const concurrentTests = [
    { n: 50, r: results.t5 },
    { n: 25, r: results.t4 },
    { n: 10, r: results.t3 },
    { n:  5, r: results.t2 },
  ];
  const bestPassing = concurrentTests.find((t) => t.r && t.r.passed && t.r.failed === 0);
  const capacityEst = bestPassing ? bestPassing.n : 'unknown';

  console.log(`║  Realtime: estimated ${String(capacityEst).padEnd(3)} concurrent subscriptions      ║`);
  console.log(`║  before degradation                                          ║`);
  console.log(`║  Suite duration: ${String(suiteDuration + ' ms').padEnd(44)}║`);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Exit code: 0=all pass, 1=any warn, 2=any fail
  const allResults = rows.map(([,, r]) => r);
  const anyFail    = allResults.some((r) => !r || (!r.passed && r.failed > 0));
  const anyWarn    = allResults.some((r) =>  r && !r.passed);
  const exitCode   = anyFail ? 2 : anyWarn ? 1 : 0;
  process.exit(exitCode);
}

main().catch((err) => {
  console.error('\nFATAL:', err.message);
  process.exit(2);
});
