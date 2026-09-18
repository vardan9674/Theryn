// The coach's notification centre: one list built from link submissions and
// app-logged workouts, newest first, with an unread flag against the
// coach's "seen" watermark. Pure; the data layer fetches the rows.
import { clientIdOfSubmission } from "./workouts.js";
import { isoDate } from "./format.js";
import { convertSubmission } from "./units.js";

const first = (name) => String(name || "Client").trim().split(/\s+/)[0];

function measurementsBody(p) {
  const metric = p.unit === "metric";
  const bits = [];
  if (p.weight != null) bits.push(`${p.weight} ${metric ? "kg" : "lb"}`);
  const sites = [["chest", "chest"], ["waist", "waist"], ["hips", "hips"], ["arm", "arm"], ["thigh", "thigh"]].filter(([k]) => p[k] != null);
  if (sites.length) bits.push(sites.map(([k, l]) => `${l} ${p[k]}`).join(", ") + ` ${metric ? "cm" : "in"}`);
  return bits.join(" · ") || "Measurements sent";
}

function workoutBody(p) {
  const exs = p.exercises || [];
  const done = exs.reduce((a, e) => a + (Number(e.sets_done) || 0), 0);
  const planned = exs.reduce((a, e) => a + (Number(e.sets_planned) || 0), 0);
  const sets = planned > 0 ? `${done} of ${planned} sets` : `${done} sets`;
  const note = (p.note || "").trim();
  return note ? `${sets} · "${note.length > 80 ? note.slice(0, 77) + "…" : note}"` : sets;
}

/**
 * @param submissions rows from client_submissions (or the mock's shape)
 * @param sessions app-logged workouts: { id, athlete_id, type, completed_at, totalSets, durationMin }
 * @param clients the dashboard's client list (athlete_id, athlete_name)
 * @param seenAt ISO string or null: everything after it is unread
 * @param clearedAt ISO string or null: everything at or before it is hidden ("Clear all")
 * @param dismissed ids the coach cleared one by one
 * @param units the coach's "metric" | "imperial"; measurement numbers are shown in it
 */
export function buildNotifications({ submissions = [], sessions = [], clients = [], seenAt = null, clearedAt = null, dismissed = [], limit = 60, units = null }) {
  const names = new Map(clients.map((c) => [c.athlete_id, c.athlete_name]));
  const seen = seenAt ? new Date(seenAt).getTime() : 0;
  const cleared = clearedAt ? new Date(clearedAt).getTime() : 0;
  const gone = new Set(dismissed || []);
  const items = [];
  for (const s of submissions) {
    const clientId = clientIdOfSubmission(s);
    if (!clientId || !names.has(clientId)) continue;
    const p = (units && s.kind === "measurements" ? convertSubmission(s, units) : s).payload || {};
    const name = first(names.get(clientId));
    if (s.kind === "measurements") {
      items.push({ id: `sub:${s.id}`, at: s.submitted_at, clientId, clientName: names.get(clientId), kind: "measurements", tab: "body",
        title: `${name} sent measurements`, body: measurementsBody(p) });
    } else if (s.kind === "workout") {
      items.push({ id: `sub:${s.id}`, at: s.submitted_at, clientId, clientName: names.get(clientId), kind: "workout", tab: "progress",
        title: `${name} finished ${p.type || "a workout"} via their link`, body: workoutBody(p) });
    }
  }
  for (const w of sessions) {
    if (!w.athlete_id || !names.has(w.athlete_id)) continue;
    const name = first(names.get(w.athlete_id));
    const bits = [];
    if (w.totalSets) bits.push(`${w.totalSets} sets`);
    if (w.durationMin) bits.push(`${w.durationMin} min`);
    items.push({ id: `ses:${w.id}`, at: w.completed_at, clientId: w.athlete_id, clientName: names.get(w.athlete_id), kind: "app_workout", tab: "progress",
      title: `${name} logged ${w.type || "a workout"} in the app`, body: bits.join(" · ") || "Workout logged" });
  }
  items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return items
    .filter((it) => new Date(it.at).getTime() > cleared && !gone.has(it.id))
    .slice(0, limit)
    .map((it) => ({ ...it, unread: new Date(it.at).getTime() > seen }));
}

export function unreadCount(items) {
  return (items || []).reduce((a, it) => a + (it.unread ? 1 : 0), 0);
}

/** "Today", "Yesterday", "Earlier" buckets for the list. */
export function groupByDay(items, now = new Date()) {
  // Local dates, so a 9pm submission does not become "Yesterday" for a coach west of UTC.
  const today = isoDate(now);
  const y = isoDate(new Date(now.getTime() - 86400000));
  const groups = [{ label: "Today", items: [] }, { label: "Yesterday", items: [] }, { label: "Earlier", items: [] }];
  for (const it of items) {
    const d = isoDate(new Date(it.at));
    groups[d === today ? 0 : d === y ? 1 : 2].items.push(it);
  }
  return groups.filter((g) => g.items.length);
}
