#!/usr/bin/env node
// stress-tests/03_workflow_test.js
// End-to-end API workflow tests for Theryn — real Supabase calls, Node.js built-ins + native fetch only.
// Run with: node stress-tests/03_workflow_test.js

"use strict";

// ── Config ────────────────────────────────────────────────────────────────────
const SUPABASE_URL      = "https://rmzfisntgiodoadwaewx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_DfhPc3bnlgdEs6Dlq6ONCw_sVc7Z2bL";
const REST_BASE         = `${SUPABASE_URL}/rest/v1`;

// ── Helpers ───────────────────────────────────────────────────────────────────
const ANON_HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json",
};

/**
 * Make a timed GET request to the Supabase REST API.
 * Returns { status, data, latencyMs, sizeBytes }.
 */
async function timedGet(path, extraHeaders = {}) {
  const url = `${REST_BASE}${path}`;
  const t0 = performance.now();
  let res;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { ...ANON_HEADERS, ...extraHeaders },
    });
  } catch (err) {
    return { status: 0, data: null, latencyMs: performance.now() - t0, sizeBytes: 0, error: err.message };
  }
  const text = await res.text();
  const latencyMs = Math.round(performance.now() - t0);
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { status: res.status, data, latencyMs, sizeBytes: Buffer.byteLength(text, "utf8") };
}

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
  // rows: array of objects; columns: [{key, label, align}]
  const widths = columns.map(c => Math.max(c.label.length, ...rows.map(r => String(r[c.key] ?? "").replace(/\x1b\[[0-9;]*m/g, "").length)));
  const pad = (s, w, a = "left") => {
    const raw = String(s ?? "");
    const vis = raw.replace(/\x1b\[[0-9;]*m/g, "").length;
    const p = " ".repeat(Math.max(0, w - vis));
    return a === "right" ? p + raw : raw + p;
  };
  const sep = "+" + columns.map((c, i) => "-".repeat(widths[i] + 2)).join("+") + "+";
  const header = "|" + columns.map((c, i) => ` ${pad(c.label, widths[i])} `).join("|") + "|";
  console.log(sep);
  console.log(header);
  console.log(sep);
  for (const row of rows) {
    console.log("|" + columns.map((c, i) => ` ${pad(row[c.key], widths[i], c.align || "left")} `).join("|") + "|");
  }
  console.log(sep);
}

function sectionHeader(title) {
  console.log(`\n${CYAN}${BOLD}${"═".repeat(60)}${RESET}`);
  console.log(`${CYAN}${BOLD}  ${title}${RESET}`);
  console.log(`${CYAN}${BOLD}${"═".repeat(60)}${RESET}`);
}

// ── Workflow A: First-Time User (Unauthenticated) ─────────────────────────────
async function workflowA() {
  sectionHeader("WORKFLOW A — First-Time User (Unauthenticated)");

  const rows = [];
  let allPass = true;

  const steps = [
    {
      label: "Fetch public exercises (limit 100)",
      path: "/public_exercises?select=id,name,muscle_group,equipment&limit=100",
      expectStatus: 200,
      check: (d) => Array.isArray(d) && d.length > 0,
    },
    {
      label: 'Search "bench"',
      path: "/public_exercises?name=ilike.*bench*&limit=10",
      expectStatus: 200,
      check: (d) => Array.isArray(d),
    },
    {
      label: 'Search "squat"',
      path: "/public_exercises?name=ilike.*squat*&limit=10",
      expectStatus: 200,
      check: (d) => Array.isArray(d),
    },
    {
      label: 'Search "deadlift"',
      path: "/public_exercises?name=ilike.*deadlift*&limit=10",
      expectStatus: 200,
      check: (d) => Array.isArray(d),
    },
    {
      label: "Access routines (no auth)",
      path: "/routines?select=id",
      expectStatus: 401,
      check: (d, status) => status === 401 || (Array.isArray(d) && d.length === 0),
    },
    {
      label: "Access workout_sessions (no auth)",
      path: "/workout_sessions?select=id",
      expectStatus: 401,
      check: (d, status) => status === 401 || (Array.isArray(d) && d.length === 0),
    },
  ];

  for (const step of steps) {
    const { status, data, latencyMs } = await timedGet(step.path);
    const ok = step.check(data, status);
    const statusOk = step.expectStatus === 401
      ? (status === 401 || (status === 200 && Array.isArray(data) && data.length === 0))
      : status === step.expectStatus;
    const pass = ok && statusOk;
    if (!pass) allPass = false;
    rows.push({
      step: step.label,
      status,
      latency: `${latencyMs}ms`,
      count: Array.isArray(data) ? String(data.length) : "-",
      result: pass ? verdict("PASS") : verdict("FAIL"),
    });
  }

  printTable(rows, [
    { key: "step",    label: "Step" },
    { key: "status",  label: "HTTP", align: "right" },
    { key: "latency", label: "Latency", align: "right" },
    { key: "count",   label: "Count", align: "right" },
    { key: "result",  label: "Result" },
  ]);

  console.log(`\nWorkflow A: ${verdict(allPass ? "PASS" : "FAIL")}\n`);
  return allPass;
}

// ── Workflow B: Exercise Database Stress ──────────────────────────────────────
async function workflowB() {
  sectionHeader("WORKFLOW B — Exercise Database Stress (20 Sequential Searches)");

  const terms = [
    "bench","squat","deadlift","pull","push","curl","press","row","fly",
    "raise","lunge","plank","cable","dumbbell","barbell","machine","cardio",
    "run","bike","swim",
  ];

  const rows = [];
  let totalLatency = 0;
  let failCount = 0;
  let warnCount = 0;

  for (const term of terms) {
    const { status, data, latencyMs } = await timedGet(
      `/public_exercises?name=ilike.*${encodeURIComponent(term)}*&select=id,name&limit=20`
    );
    const count = Array.isArray(data) ? data.length : 0;
    totalLatency += latencyMs;

    // Broad terms (bench, squat, etc.) should return > 0 results
    const commonTerms = new Set(["bench","squat","deadlift","pull","push","curl","press","row"]);
    const expectResults = commonTerms.has(term);

    let v = "PASS";
    if (status !== 200) { v = "FAIL"; failCount++; }
    else if (expectResults && count === 0) { v = "WARN"; warnCount++; }
    else if (latencyMs > 1000) { v = "WARN"; warnCount++; }

    rows.push({
      term: `"${term}"`,
      status,
      count: String(count),
      latency: `${latencyMs}ms`,
      result: verdict(v),
    });
  }

  printTable(rows, [
    { key: "term",    label: "Search Term" },
    { key: "status",  label: "HTTP", align: "right" },
    { key: "count",   label: "Results", align: "right" },
    { key: "latency", label: "Latency", align: "right" },
    { key: "result",  label: "Result" },
  ]);

  const avgLatency = Math.round(totalLatency / terms.length);
  console.log(`\n  Avg latency: ${avgLatency}ms | Failures: ${failCount} | Warns: ${warnCount}`);

  const wf = failCount === 0 ? (warnCount === 0 ? "PASS" : "WARN") : "FAIL";
  console.log(`Workflow B: ${verdict(wf)}\n`);
  return wf;
}

// ── Workflow C: Payload Size Test ─────────────────────────────────────────────
async function workflowC() {
  sectionHeader("WORKFLOW C — Payload Size Test (Full Exercise Database)");

  const t0 = performance.now();
  const { status, data, latencyMs, sizeBytes } = await timedGet(
    "/public_exercises?select=id,name,muscle_group,equipment,aliases"
  );
  const parseTime = Math.round(performance.now() - t0 - latencyMs);

  const count   = Array.isArray(data) ? data.length : 0;
  const sizeKB  = (sizeBytes / 1024).toFixed(2);

  const rows = [
    { metric: "HTTP Status",       value: String(status) },
    { metric: "Network latency",   value: `${latencyMs}ms` },
    { metric: "JSON parse time",   value: `${Math.max(0, parseTime)}ms` },
    { metric: "Response size",     value: `${sizeKB} KB` },
    { metric: "Exercise count",    value: String(count) },
    { metric: "Avg bytes/exercise",value: count > 0 ? `${Math.round(sizeBytes / count)} B` : "N/A" },
  ];

  printTable(rows, [
    { key: "metric", label: "Metric" },
    { key: "value",  label: "Value", align: "right" },
  ]);

  // Thresholds
  const statusOk  = status === 200;
  const countOk   = count >= 150;   // Schema seeds ~300; we just need >150
  const sizeOk    = sizeBytes < 500 * 1024; // Under 500 KB is healthy
  const latencyOk = latencyMs < 2000;

  const issues = [];
  if (!statusOk)  issues.push("non-200 status");
  if (!countOk)   issues.push(`count too low (got ${count}, want ≥150)`);
  if (!sizeOk)    issues.push(`response too large (${sizeKB} KB > 500 KB)`);
  if (!latencyOk) issues.push(`latency too high (${latencyMs}ms > 2000ms)`);

  if (issues.length) console.log(`  ${YELLOW}Issues: ${issues.join(", ")}${RESET}`);

  const wf = issues.length === 0 ? "PASS" : (statusOk && countOk ? "WARN" : "FAIL");
  console.log(`\nWorkflow C: ${verdict(wf)}\n`);
  return wf;
}

// ── Workflow D: RLS Security Validation ───────────────────────────────────────
async function workflowD() {
  sectionHeader("WORKFLOW D — RLS Security Validation");

  // Random UUIDs that correspond to no real user
  const fakeUUIDs = Array.from({ length: 5 }, () => {
    const h = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
    return `${h()}${h()}-${h()}-4${h().slice(1)}-${(Math.floor(Math.random() * 4) + 8).toString(16)}${h().slice(1)}-${h()}${h()}${h()}`;
  });

  const attacks = [
    // Unauthenticated access to protected tables
    { label: "GET /routines (no auth)",          path: "/routines?select=id,user_id" },
    { label: "GET /workout_sessions (no auth)",  path: "/workout_sessions?select=id,user_id" },
    { label: "GET /workout_sets (no auth)",      path: "/workout_sets?select=id" },
    { label: "GET /body_weights (no auth)",      path: "/body_weights?select=id,user_id" },
    { label: "GET /body_measurements (no auth)", path: "/body_measurements?select=id,user_id" },
    { label: "GET /profiles (no auth)",          path: "/profiles?select=id,display_name" },
    { label: "GET /user_exercises (no auth)",    path: "/user_exercises?select=id,user_id" },
    { label: "GET /personal_records (no auth)",  path: "/personal_records?select=id,user_id" },
    { label: "GET /coach_athletes (no auth)",    path: "/coach_athletes?select=id" },
    { label: "GET /ai_imports (no auth)",        path: "/ai_imports?select=id,user_id" },
  ];

  const rows = [];
  let leaked = 0;
  let protected_ = 0;

  for (const attack of attacks) {
    const { status, data, latencyMs } = await timedGet(attack.path);

    // "Secure" means: 401/403, or empty array (RLS returns empty for unauthed)
    const dataLeaked = Array.isArray(data) && data.length > 0;
    const isSecure   = status === 401 || status === 403 || (!dataLeaked && (status === 200 || status === 406));

    if (dataLeaked) leaked++;
    else protected_++;

    rows.push({
      attack: attack.label,
      status: String(status),
      leaked: dataLeaked ? `${RED}YES — ${data.length} rows${RESET}` : `${GREEN}No${RESET}`,
      secure: isSecure ? verdict("PASS") : verdict("FAIL"),
      latency: `${latencyMs}ms`,
    });
  }

  printTable(rows, [
    { key: "attack",  label: "Attack Pattern" },
    { key: "status",  label: "HTTP", align: "right" },
    { key: "leaked",  label: "Data Leaked?" },
    { key: "secure",  label: "Secure?" },
    { key: "latency", label: "Latency", align: "right" },
  ]);

  const wf = leaked === 0 ? "PASS" : "FAIL";
  console.log(`\n  Protected: ${protected_}/10 | Leaked: ${leaked}/10`);
  console.log(`  Security: ${leaked === 0 ? `${GREEN}${BOLD}PASS${RESET}` : `${RED}${BOLD}FAIL${RESET}`}`);
  console.log(`Workflow D: ${verdict(wf)}\n`);
  return wf;
}

// ── Workflow E: Connection Latency Distribution ───────────────────────────────
async function workflowE() {
  sectionHeader("WORKFLOW E — Connection Latency Distribution (50 Sequential Requests)");

  const N       = 50;
  const latencies = [];

  process.stdout.write("  Running 50 sequential requests ");
  for (let i = 0; i < N; i++) {
    const { latencyMs } = await timedGet("/public_exercises?select=id&limit=1");
    latencies.push(latencyMs);
    if ((i + 1) % 10 === 0) process.stdout.write(".");
  }
  console.log(" done\n");

  // Histogram buckets
  const buckets = {
    "<50ms":    latencies.filter(l => l < 50).length,
    "50-100ms": latencies.filter(l => l >= 50  && l < 100).length,
    "100-200ms":latencies.filter(l => l >= 100 && l < 200).length,
    "200-500ms":latencies.filter(l => l >= 200 && l < 500).length,
    "500ms+":   latencies.filter(l => l >= 500).length,
  };

  const sorted  = [...latencies].sort((a, b) => a - b);
  const avg     = Math.round(latencies.reduce((s, v) => s + v, 0) / N);
  const p50     = sorted[Math.floor(N * 0.50)];
  const p90     = sorted[Math.floor(N * 0.90)];
  const p99     = sorted[Math.floor(N * 0.99)];
  const min     = sorted[0];
  const max     = sorted[N - 1];

  // Cold-start detection: first request significantly higher than median
  const coldStartSpike = latencies[0] > p50 * 2 && latencies[0] > 300;

  // Histogram table
  const histRows = Object.entries(buckets).map(([bucket, count]) => ({
    bucket,
    count: String(count),
    pct: `${((count / N) * 100).toFixed(1)}%`,
    bar: "█".repeat(Math.round((count / N) * 30)),
  }));

  printTable(histRows, [
    { key: "bucket", label: "Bucket" },
    { key: "count",  label: "Count", align: "right" },
    { key: "pct",    label: "%", align: "right" },
    { key: "bar",    label: "Distribution" },
  ]);

  // Percentile table
  console.log();
  const statsRows = [
    { stat: "Min",  value: `${min}ms` },
    { stat: "Avg",  value: `${avg}ms` },
    { stat: "p50",  value: `${p50}ms` },
    { stat: "p90",  value: `${p90}ms` },
    { stat: "p99",  value: `${p99}ms` },
    { stat: "Max",  value: `${max}ms` },
  ];
  printTable(statsRows, [
    { key: "stat",  label: "Percentile" },
    { key: "value", label: "Latency", align: "right" },
  ]);

  if (coldStartSpike) {
    console.log(`\n  ${YELLOW}Cold-start spike detected: first request ${latencies[0]}ms vs p50 ${p50}ms${RESET}`);
  } else {
    console.log(`\n  ${GREEN}No cold-start spike detected.${RESET}`);
  }

  // Verdict: WARN if p90 > 500ms, FAIL if p90 > 2000ms or any request timed out
  const wf = p90 > 2000 || max > 5000 ? "FAIL" : p90 > 500 ? "WARN" : "PASS";
  console.log(`Workflow E: ${verdict(wf)}\n`);
  return wf;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${BOLD}Theryn — API Workflow Stress Tests${RESET}`);
  console.log(`${DIM}Supabase: ${SUPABASE_URL}${RESET}`);
  console.log(`${DIM}Node.js:  ${process.version}  Date: ${new Date().toISOString()}${RESET}\n`);

  const results = {};

  try { results.A = await workflowA(); } catch (e) { console.error("Workflow A crashed:", e); results.A = false; }
  try { results.B = await workflowB(); } catch (e) { console.error("Workflow B crashed:", e); results.B = "FAIL"; }
  try { results.C = await workflowC(); } catch (e) { console.error("Workflow C crashed:", e); results.C = "FAIL"; }
  try { results.D = await workflowD(); } catch (e) { console.error("Workflow D crashed:", e); results.D = false; }
  try { results.E = await workflowE(); } catch (e) { console.error("Workflow E crashed:", e); results.E = "FAIL"; }

  // ── Final Summary ─────────────────────────────────────────────────────────
  sectionHeader("SUMMARY");

  const toV = (r) => {
    if (r === true  || r === "PASS") return "PASS";
    if (r === false || r === "FAIL") return "FAIL";
    return r; // "WARN"
  };

  const summaryRows = [
    { wf: "A", name: "First-Time User (Unauthenticated)", result: verdict(toV(results.A)) },
    { wf: "B", name: "Exercise Database Stress",          result: verdict(toV(results.B)) },
    { wf: "C", name: "Payload Size Test",                 result: verdict(toV(results.C)) },
    { wf: "D", name: "RLS Security Validation",           result: verdict(toV(results.D)) },
    { wf: "E", name: "Connection Latency Distribution",   result: verdict(toV(results.E)) },
  ];

  printTable(summaryRows, [
    { key: "wf",     label: "WF" },
    { key: "name",   label: "Workflow" },
    { key: "result", label: "Verdict" },
  ]);

  const allValues = Object.values(results).map(toV);
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
