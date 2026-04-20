// ════════════════════════════════════════════════════════════════════════
// COACH INSIGHTS — rule-based signal detection
// ════════════════════════════════════════════════════════════════════════
// Pure, deterministic detectors that turn athlete data into ranked signals.
// Zero side-effects. Zero network. Designed as the eventual LLM input.
//
// Signal shape:
//   {
//     kind: 'falling_behind' | 'inactive' | 'streak_at_risk' | 'pr_watch' |
//           'stalled_lift' | 'overreach' | 'deload_suggested' |
//           'weight_trend' | 'new_pr' | 'consistent',
//     severity: 'urgent' | 'warn' | 'info' | 'celebrate',
//     title: string,              // short chip label
//     message: string,            // one-line actionable summary
//     suggestedTab: 'routines' | 'progress' | 'body' | null,
//     evidence: { ... }           // raw numbers for UI / future LLM
//   }

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toIso(d) {
  return new Date(d).toISOString().split("T")[0];
}

function daysBetween(aIso, bIso) {
  const a = new Date(aIso + "T12:00:00").getTime();
  const b = new Date(bIso + "T12:00:00").getTime();
  return Math.round((b - a) / 86400000);
}

function getDayName(date) {
  const jsDay = date.getDay();
  return DAYS[jsDay === 0 ? 6 : jsDay - 1];
}

function weekStartIso(dateIso) {
  const d = new Date(dateIso + "T12:00:00");
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // ISO week starts Mon
  d.setDate(d.getDate() + diff);
  return toIso(d);
}

// ── Detectors ────────────────────────────────────────────────────────────

function detectInactivity(history) {
  if (!history || history.length === 0) {
    return {
      kind: "inactive",
      severity: "warn",
      title: "No workouts yet",
      message: "New athlete — build their first routine.",
      suggestedTab: "routines",
      evidence: { daysSinceLast: null },
    };
  }
  const last = history[0];
  const days = Math.floor(
    (Date.now() - new Date(last.date + "T12:00:00").getTime()) / 86400000
  );
  if (days >= 5) {
    return {
      kind: "inactive",
      severity: "urgent",
      title: `${days}d silent`,
      message: `No activity for ${days} days — send a check-in.`,
      suggestedTab: "progress",
      evidence: { daysSinceLast: days, lastType: last.type, lastDate: last.date },
    };
  }
  return null;
}

function detectFallingBehind(history, routine) {
  if (!history || !routine) return null;
  const now = new Date();
  let scheduled = 0;
  let missed = 0;
  for (let i = 1; i <= 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dayName = getDayName(d);
    const type = routine[dayName]?.type;
    if (!type || type === "Rest") continue;
    scheduled++;
    const iso = toIso(d);
    const hit = history.some((h) => h.date === iso);
    if (!hit) missed++;
  }
  if (scheduled >= 3 && missed >= 2) {
    return {
      kind: "falling_behind",
      severity: "warn",
      title: `${missed}/${scheduled} missed`,
      message: `Missed ${missed} of ${scheduled} scheduled sessions this week.`,
      suggestedTab: "progress",
      evidence: { missed, scheduled, windowDays: 7 },
    };
  }
  return null;
}

function detectStreakAtRisk(history, routine, streak) {
  if (!history || !routine || streak < 3) return null;
  const todayIso = toIso(new Date());
  const todayName = getDayName(new Date());
  const todayType = routine[todayName]?.type;
  if (!todayType || todayType === "Rest") return null;
  const hitToday = history.some((h) => h.date === todayIso);
  if (hitToday) return null;
  const hour = new Date().getHours();
  if (hour < 18) return null;
  return {
    kind: "streak_at_risk",
    severity: "warn",
    title: `${streak}d streak at risk`,
    message: `${streak}-day streak will break tonight — nudge them.`,
    suggestedTab: "progress",
    evidence: { streak, todayType },
  };
}

function detectLiftTrends(history) {
  // Build per-exercise session list (oldest → newest) with max-weight set
  if (!history || history.length < 3) return [];
  const chronological = [...history].reverse();
  const perEx = {}; // { name: [{ date, maxW, bestReps }] }

  for (const s of chronological) {
    for (const ex of s.exercises || []) {
      let maxW = 0;
      let bestReps = 0;
      for (const set of ex.sets || []) {
        const w = parseFloat(set.w) || 0;
        const r = parseInt(set.r, 10) || 0;
        if (w > maxW || (w === maxW && r > bestReps)) {
          maxW = w;
          bestReps = r;
        }
      }
      if (maxW <= 0) continue;
      if (!perEx[ex.name]) perEx[ex.name] = [];
      perEx[ex.name].push({ date: s.date, maxW, bestReps });
    }
  }

  const signals = [];
  for (const [name, sessions] of Object.entries(perEx)) {
    if (sessions.length < 3) continue;
    const last3 = sessions.slice(-3);

    // PR watch — weight increasing 3 sessions in a row
    const isRising =
      last3[2].maxW > last3[1].maxW && last3[1].maxW > last3[0].maxW;
    if (isRising) {
      signals.push({
        kind: "pr_watch",
        severity: "info",
        title: `${name} climbing`,
        message: `${name} up to ${last3[2].maxW} lbs — PR likely next session.`,
        suggestedTab: "progress",
        evidence: {
          exercise: name,
          lastWeights: last3.map((x) => x.maxW),
        },
      });
      continue;
    }

    // Stalled — same weight × reps for 3+ sessions
    const allSame =
      last3[0].maxW === last3[1].maxW &&
      last3[1].maxW === last3[2].maxW &&
      last3[0].bestReps === last3[1].bestReps &&
      last3[1].bestReps === last3[2].bestReps &&
      last3[0].maxW > 0;
    if (allSame) {
      signals.push({
        kind: "stalled_lift",
        severity: "info",
        title: `${name} stalled`,
        message: `${name} stuck at ${last3[0].maxW} × ${last3[0].bestReps} for 3 sessions.`,
        suggestedTab: "routines",
        evidence: {
          exercise: name,
          weight: last3[0].maxW,
          reps: last3[0].bestReps,
        },
      });
      continue;
    }

    // New PR — last session is the all-time max
    const allTimeMax = sessions.reduce(
      (m, x) => (x.maxW > m ? x.maxW : m),
      0
    );
    if (
      last3[2].maxW === allTimeMax &&
      last3[2].maxW > last3[1].maxW &&
      sessions.length >= 4
    ) {
      signals.push({
        kind: "new_pr",
        severity: "celebrate",
        title: `PR ${name}`,
        message: `Hit a PR on ${name} — ${last3[2].maxW} lbs.`,
        suggestedTab: "progress",
        evidence: { exercise: name, weight: last3[2].maxW },
      });
    }
  }

  // Return max 2 lift-level signals, prefer celebrate > pr_watch > stalled
  const rank = { celebrate: 3, info: 1 };
  signals.sort((a, b) => (rank[b.severity] || 0) - (rank[a.severity] || 0));
  return signals.slice(0, 2);
}

function detectVolumeSignals(history) {
  if (!history || history.length < 4) return null;
  // Aggregate volume by ISO week (Mon-Sun)
  const weekly = {};
  for (const s of history) {
    const wk = weekStartIso(s.date);
    weekly[wk] = (weekly[wk] || 0) + (s.totalVolume || 0);
  }
  const weeks = Object.entries(weekly)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);
  if (weeks.length < 4) return null;

  const lastWeek = weeks[weeks.length - 1];
  const prior = weeks.slice(-5, -1); // up to 4 weeks before
  if (prior.length === 0 || lastWeek === 0) return null;
  const median = [...prior].sort((a, b) => a - b)[Math.floor(prior.length / 2)];
  if (median <= 0) return null;

  const ratio = lastWeek / median;
  if (ratio > 1.4) {
    return {
      kind: "overreach",
      severity: "warn",
      title: "Volume spike",
      message: `Weekly volume up ${Math.round((ratio - 1) * 100)}% — watch for overreach.`,
      suggestedTab: "progress",
      evidence: { lastWeek, median, ratio: Number(ratio.toFixed(2)) },
    };
  }

  // Deload suggested: 4 weeks of strictly rising volume with no down week
  if (weeks.length >= 4) {
    const last4 = weeks.slice(-4);
    const allRising =
      last4[0] < last4[1] && last4[1] < last4[2] && last4[2] < last4[3];
    if (allRising) {
      return {
        kind: "deload_suggested",
        severity: "info",
        title: "Deload due",
        message: "4 weeks of rising volume — consider a deload week.",
        suggestedTab: "routines",
        evidence: { weeks: last4 },
      };
    }
  }
  return null;
}

function detectWeightTrend(weights) {
  if (!weights || weights.length < 2) return null;
  // weights are newest-first
  const now = weights[0];
  const twoWeeksAgo = weights.find(
    (w) => daysBetween(w.date, now.date) >= 14
  );
  if (!twoWeeksAgo) return null;
  const delta = now.weight - twoWeeksAgo.weight;
  const pct = (delta / twoWeeksAgo.weight) * 100;
  if (Math.abs(pct) < 1) return null;
  const dir = delta > 0 ? "up" : "down";
  return {
    kind: "weight_trend",
    severity: "info",
    title: `Weight ${dir} ${Math.abs(delta).toFixed(1)}`,
    message: `Body weight ${dir} ${Math.abs(delta).toFixed(1)} lbs over 2 weeks.`,
    suggestedTab: "body",
    evidence: {
      delta: Number(delta.toFixed(1)),
      pct: Number(pct.toFixed(1)),
      from: twoWeeksAgo.weight,
      to: now.weight,
    },
  };
}

// 28-day adherence — completed vs scheduled training days. Flags <60% urgent,
// 60–79% as warn. Needs a decent sample (>=6 scheduled days) before firing.
function detectAdherence(history, routine) {
  if (!history || !routine) return null;
  const now = new Date();
  let scheduled = 0;
  let completed = 0;
  for (let i = 0; i < 28; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dayName = getDayName(d);
    const type = routine[dayName]?.type;
    if (!type || type === "Rest") continue;
    scheduled++;
    const iso = toIso(d);
    if (history.some((h) => h.date === iso)) completed++;
  }
  if (scheduled < 6) return null;
  const pct = Math.round((completed / scheduled) * 100);
  if (pct < 60) {
    return {
      kind: "low_adherence",
      severity: "urgent",
      title: `${pct}% adherence`,
      message: `Only ${completed}/${scheduled} scheduled sessions in last 4 weeks.`,
      suggestedTab: "progress",
      evidence: { scheduled, completed, pct, windowDays: 28 },
    };
  }
  if (pct < 80) {
    return {
      kind: "low_adherence",
      severity: "warn",
      title: `${pct}% adherence`,
      message: `${completed}/${scheduled} scheduled sessions — a few more would hold momentum.`,
      suggestedTab: "progress",
      evidence: { scheduled, completed, pct, windowDays: 28 },
    };
  }
  return null;
}

// L/R limb asymmetry from latest measurement. >=8% gap = flag, >=12% = urgent.
// Uses the larger side as the denominator so the pct is always positive.
function detectAsymmetry(measurements) {
  if (!measurements || measurements.length === 0) return null;
  const m = measurements[0];
  const pairs = [
    { name: "arms", l: m.lArm, r: m.rArm },
    { name: "thighs", l: m.lThigh, r: m.rThigh },
  ];
  const flags = [];
  for (const p of pairs) {
    if (p.l == null || p.r == null || p.l <= 0 || p.r <= 0) continue;
    const larger = Math.max(p.l, p.r);
    const pct = (Math.abs(p.l - p.r) / larger) * 100;
    if (pct >= 8) flags.push({ part: p.name, pct: Number(pct.toFixed(1)), l: p.l, r: p.r });
  }
  if (flags.length === 0) return null;
  const worst = flags.sort((a, b) => b.pct - a.pct)[0];
  return {
    kind: "asymmetry",
    severity: worst.pct >= 12 ? "urgent" : "warn",
    title: `${worst.part} ${worst.pct}% gap`,
    message: `L/R ${worst.part} differ by ${worst.pct}% — add unilateral work on the weaker side.`,
    suggestedTab: "body",
    evidence: { flags },
  };
}

// Waist-to-hip ratio. Gender-neutral threshold at 0.95 (above WHO cutoffs for
// both sexes). Purely informational — not medical advice.
function detectWHR(measurements) {
  if (!measurements || measurements.length === 0) return null;
  const m = measurements[0];
  if (!m.waist || !m.hips || m.hips <= 0) return null;
  const whr = m.waist / m.hips;
  if (whr >= 0.95) {
    return {
      kind: "whr_high",
      severity: "warn",
      title: `WHR ${whr.toFixed(2)}`,
      message: `Waist-to-hip ratio ${whr.toFixed(2)} — elevated; consider a cut or cardio block.`,
      suggestedTab: "body",
      evidence: { whr: Number(whr.toFixed(2)), waist: m.waist, hips: m.hips },
    };
  }
  return null;
}

// Recent avg session length vs the 5 prior sessions. A >=30% drop often signals
// rushing, fatigue, or disengagement — worth a check-in.
function detectSessionDuration(history) {
  if (!history || history.length < 6) return null;
  const recent = history.slice(0, 3);
  const older = history.slice(3, 8);
  const avg = (xs) => xs.reduce((a, x) => a + (x.duration || 0), 0) / xs.length;
  const recentAvg = avg(recent);
  const olderAvg = avg(older);
  if (olderAvg < 600) return null; // <10 min baseline = noise
  const drop = (olderAvg - recentAvg) / olderAvg;
  if (drop < 0.3) return null;
  return {
    kind: "duration_drop",
    severity: "info",
    title: `Sessions ${Math.round(drop * 100)}% shorter`,
    message: `Recent sessions ${Math.round(drop * 100)}% shorter than baseline — rushed or under-recovered?`,
    suggestedTab: "progress",
    evidence: { recentAvg: Math.round(recentAvg), olderAvg: Math.round(olderAvg) },
  };
}

// Any routine-scheduled workout type that hasn't been completed in 14+ days.
// Catches "they drifted off chest day" without relying on streaks.
function detectStaleMuscleGroup(history, routine) {
  if (!history || !routine) return null;
  const scheduledTypes = new Set();
  for (const d of DAYS) {
    const t = routine[d]?.type;
    if (t && t !== "Rest") scheduledTypes.add(t);
  }
  if (scheduledTypes.size === 0) return null;
  const now = Date.now();
  const stale = [];
  for (const type of scheduledTypes) {
    const last = history.find((h) => h.type === type);
    if (!last) continue; // no record at all → covered by "inactive"
    const days = Math.floor((now - new Date(last.date + "T12:00:00").getTime()) / 86400000);
    if (days >= 14) stale.push({ type, days });
  }
  if (stale.length === 0) return null;
  const worst = stale.reduce((a, b) => (b.days > a.days ? b : a), stale[0]);
  return {
    kind: "stale_group",
    severity: "info",
    title: `${worst.type} ${worst.days}d`,
    message: `${worst.type} scheduled but not trained in ${worst.days} days.`,
    suggestedTab: "routines",
    evidence: { stale },
  };
}

function detectConsistent(streak) {
  if (streak < 7) return null;
  return {
    kind: "consistent",
    severity: "celebrate",
    title: `${streak}d streak`,
    message: `${streak}-day streak — send encouragement.`,
    suggestedTab: "progress",
    evidence: { streak },
  };
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Detect all signals for a single athlete.
 * @param {object} opts
 * @param {Array} opts.history - WorkoutHistoryEntry[] (newest first)
 * @param {object} opts.routine - { Mon: { type, exercises }, ... }
 * @param {Array} opts.weights - BodyWeightEntry[] (newest first)
 * @param {number} opts.streak - current routine streak in days
 * @returns {Array} ranked signals, highest priority first
 */
export function detectSignals({ history, routine, weights, measurements, streak = 0 }) {
  const out = [];
  const inactive = detectInactivity(history);
  if (inactive) out.push(inactive);

  // Only run other detectors if athlete has some activity
  if (history && history.length > 0) {
    const adh = detectAdherence(history, routine);
    if (adh) out.push(adh);

    const fb = detectFallingBehind(history, routine);
    // Skip "falling behind" if low-adherence already covers the same ground.
    if (fb && !inactive && !adh) out.push(fb);

    const sar = detectStreakAtRisk(history, routine, streak);
    if (sar) out.push(sar);

    const vol = detectVolumeSignals(history);
    if (vol) out.push(vol);

    const lifts = detectLiftTrends(history);
    out.push(...lifts);

    const dur = detectSessionDuration(history);
    if (dur) out.push(dur);

    const stale = detectStaleMuscleGroup(history, routine);
    if (stale) out.push(stale);

    const wt = detectWeightTrend(weights);
    if (wt) out.push(wt);

    const cons = detectConsistent(streak);
    if (cons && !sar && !fb && !adh) out.push(cons);
  }

  // Body-composition signals fire independent of workout history
  const asym = detectAsymmetry(measurements);
  if (asym) out.push(asym);

  const whr = detectWHR(measurements);
  if (whr) out.push(whr);

  return rankSignals(out);
}

// ── At-a-glance numeric stats (for the card strip) ───────────────────────
// Pure math over the same inputs detectSignals gets. Returns null fields when
// there isn't enough data — the UI should render "—" for those.
export function computeStats({ history, routine, weights, measurements }) {
  const now = new Date();

  // 28-day adherence
  let scheduled = 0;
  let completed = 0;
  if (history && routine) {
    for (let i = 0; i < 28; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dayName = getDayName(d);
      const type = routine[dayName]?.type;
      if (!type || type === "Rest") continue;
      scheduled++;
      const iso = toIso(d);
      if (history.some((h) => h.date === iso)) completed++;
    }
  }
  const adherencePct = scheduled > 0 ? Math.round((completed / scheduled) * 100) : null;

  // 7-day total volume
  let vol7 = 0;
  if (history) {
    const cutoff = now.getTime() - 7 * 86400000;
    for (const h of history) {
      const t = new Date(h.date + "T12:00:00").getTime();
      if (t >= cutoff) vol7 += h.totalVolume || 0;
    }
  }

  // Body-weight delta over ~14 days (lbs, signed)
  let bwDelta = null;
  if (weights && weights.length >= 2) {
    const current = weights[0];
    const prior = weights.find((w) => daysBetween(w.date, current.date) >= 14);
    if (prior) bwDelta = Number((current.weight - prior.weight).toFixed(1));
  }

  // Average session duration over last 4 sessions (minutes)
  let sessionAvgMin = null;
  if (history && history.length > 0) {
    const recent = history.slice(0, 4);
    const total = recent.reduce((a, h) => a + (h.duration || 0), 0);
    sessionAvgMin = Math.round(total / recent.length / 60);
  }

  // Waist-to-hip ratio from latest measurement
  let whr = null;
  if (measurements && measurements.length > 0) {
    const m = measurements[0];
    if (m.waist && m.hips && m.hips > 0) {
      whr = Number((m.waist / m.hips).toFixed(2));
    }
  }

  return {
    adherencePct,
    vol7: Math.round(vol7),
    bwDelta,
    sessionAvgMin,
    whr,
    scheduledCount: scheduled,
    completedCount: completed,
  };
}

const SEVERITY_RANK = { urgent: 4, warn: 3, celebrate: 2, info: 1 };

export function rankSignals(signals) {
  return [...signals].sort(
    (a, b) =>
      (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0)
  );
}

/**
 * Pick the top signal for a row badge + a one-liner primary message.
 */
export function summarizeForRow(signals) {
  if (!signals || signals.length === 0) {
    return {
      badges: [],
      primaryLine: null,
    };
  }
  const badges = signals.slice(0, 2).map((s) => ({
    severity: s.severity,
    title: s.title,
    kind: s.kind,
  }));
  const primary = signals[0];
  return {
    badges,
    primaryLine: primary.message,
    primarySeverity: primary.severity,
    primaryTab: primary.suggestedTab,
  };
}

// Muted premium palette — red swapped for burnt sienna so urgent still reads
// as "this one first" on badges without tinting whole cards in alarm-red.
export const SEVERITY_COLORS = {
  urgent: "#D97757",
  warn: "#E0A95A",
  celebrate: "#C8FF00",
  info: "#8AB4FF",
};

// ── BMI helpers ─────────────────────────────────────────────────────────
// Weight is stored in the user's chosen unit (imperial=lb, metric=kg) per the
// existing body_weights convention. Height is always cm. Convert at compute
// time so callers don't have to think about it.
export function computeBMI(weight, heightCm, unitSystem) {
  if (weight == null || !heightCm || heightCm <= 0) return null;
  const w = Number(weight);
  if (!Number.isFinite(w) || w <= 0) return null;
  const weightKg = unitSystem === "metric" ? w : w * 0.45359237;
  const heightM = heightCm / 100;
  return Number((weightKg / (heightM * heightM)).toFixed(1));
}

// WHO standard bands. Colors reuse the premium palette so BMI slots in
// naturally next to the rest of the coach dashboard.
export function bmiCategory(bmi) {
  if (bmi == null) return null;
  if (bmi < 18.5) return { label: "Underweight", color: "#8AB4FF" };
  if (bmi < 25)   return { label: "Normal",      color: "#C8FF00" };
  if (bmi < 30)   return { label: "Overweight",  color: "#E0A95A" };
  return { label: "Obese", color: "#D97757" };
}
