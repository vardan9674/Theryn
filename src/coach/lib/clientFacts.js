// Pure functions that turn an athlete's raw data into the four facts on the
// client table: last workout, this week, payment, what to do.
import { detectSignals, summarizeForRow, SEVERITY_COLORS } from "../../lib/coachInsights.js";
import { athletePaymentStatus } from "../../hooks/usePayments.ts";
import { DAYS, dayKey, isoDate, startOfWeek, daysBetween, plural } from "./format.js";

/** Days since the most recent completed workout, or null if none. */
export function daysSinceLastWorkout(history, now = new Date()) {
  if (!history || history.length === 0) return null;
  let latest = null;
  for (const h of history) if (!latest || h.date > latest) latest = h.date;
  if (!latest) return null;
  return Math.max(0, daysBetween(latest, isoDate(now)));
}

/** "Today" · "Yesterday" · "5 days ago" · "Never". */
export function lastWorkoutLabel(history, now = new Date()) {
  const d = daysSinceLastWorkout(history, now);
  if (d == null) return "Never";
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  return `${d} days ago`;
}

/** Tone for the last-workout cell: ok under 3 days, warn 3–6, bad 7+. */
export function lastWorkoutTone(history, now = new Date()) {
  const d = daysSinceLastWorkout(history, now);
  if (d == null) return "bad";
  if (d < 3) return "ok";
  if (d < 7) return "warn";
  return "bad";
}

/**
 * Week starting Monday: which planned days are done, missed (past and not
 * done) or upcoming. Rest days are not planned.
 */
export function weekProgress(history, routine, now = new Date()) {
  const monday = startOfWeek(now);
  const todayIso = isoDate(now);
  const doneDates = new Set((history || []).map((h) => h.date));
  const days = DAYS.map((key, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const iso = isoDate(d);
    const type = routine?.[key]?.type;
    const planned = Boolean(type) && type !== "Rest";
    const done = doneDates.has(iso);
    const isPast = iso < todayIso;
    return { key, iso, planned, done, isPast, missed: planned && isPast && !done };
  });
  const plannedDays = days.filter((d) => d.planned);
  const done = plannedDays.filter((d) => d.done).length + days.filter((d) => !d.planned && d.done).length;
  return { days, planned: plannedDays.length, done: Math.min(done, Math.max(plannedDays.length, done)) };
}

/** Routine streak in days: worked out or rested-on-rest-day, walking back from today. */
export function routineStreak(history, routine, now = new Date()) {
  if (!history || history.length === 0 || !routine) return 0;
  const worked = new Set(history.map((w) => w.date));
  let first = history[0].date;
  for (const w of history) if (w.date < first) first = w.date;
  const check = new Date(now);
  check.setHours(0, 0, 0, 0);
  const todayIso = isoDate(now);
  let streak = 0;
  while (isoDate(check) >= first) {
    const iso = isoDate(check);
    const rest = routine[dayKey(check)]?.type === "Rest";
    if (worked.has(iso) || rest) streak++;
    else if (iso !== todayIso) break;
    check.setDate(check.getDate() - 1);
  }
  return streak;
}

/**
 * One plain sentence telling the coach what to do about this client, with a
 * severity ("urgent" | "warn" | "celebrate" | "info" | null) and the tab that
 * best answers it.
 */
export function whatToDo(data, now = new Date()) {
  if (!data) return { text: "", severity: null, tab: "plan", color: null };
  const { history, routine, weights, measurements } = data;
  const streak = routineStreak(history, routine, now);
  const signals = detectSignals({ history, routine, weights, measurements, streak });
  const sum = summarizeForRow(signals);
  if (sum.primaryLine) {
    const tab = mapSuggestedTab(sum.primaryTab);
    return { text: sum.primaryLine, severity: sum.primarySeverity || "info", tab, color: SEVERITY_COLORS[sum.primarySeverity] || null, signals, streak };
  }
  const todayType = routine?.[dayKey(now)]?.type || "Rest";
  const text = todayType === "Rest" ? "Rest day today. Nothing needed." : `${todayType} day today. Nothing needed.`;
  return { text, severity: null, tab: "plan", color: null, signals, streak };
}

function mapSuggestedTab(t) {
  switch (t) {
    case "body": return "body";
    case "progress": return "progress";
    case "payments": return "payments";
    default: return "plan";
  }
}

/** Payment cell from fees + payments for one athlete. */
export function paymentFact(fee, athletePayments, defaultCurrency = "USD", now = new Date()) {
  const info = athletePaymentStatus(fee, athletePayments, now);
  const currency = fee?.currency || defaultCurrency;
  switch (info.status) {
    case "paid": return { status: "paid", label: "Paid", tone: "ok", info, currency };
    case "due": return { status: "due", label: "Due today", tone: "warn", info, currency };
    case "overdue": return { status: "overdue", label: `Late by ${plural(info.daysIntoCycle ?? 1, "day")}`, tone: "bad", info, currency };
    case "paused": return { status: "paused", label: "Paused", tone: "muted", info, currency };
    default: return { status: "no_fee", label: "No fee set", tone: "muted", info, currency };
  }
}

/** Filter bucket for the chips on the clients page. */
export function attentionBucket({ todo, payment, history }, now = new Date()) {
  const sev = todo?.severity;
  if (sev === "urgent" || sev === "warn") return "attention";
  if (payment?.status === "overdue" || payment?.status === "due") return "payment";
  return "ok";
}

export function sortClients(rows) {
  const rank = { attention: 0, payment: 1, ok: 2 };
  return [...rows].sort((a, b) => {
    const ra = rank[a.bucket] ?? 3;
    const rb = rank[b.bucket] ?? 3;
    if (ra !== rb) return ra - rb;
    return (a.name || "").localeCompare(b.name || "");
  });
}
