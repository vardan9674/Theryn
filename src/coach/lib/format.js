// Small, pure formatting helpers for the coach dashboard.

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAY_LONG = {
  Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday",
  Fri: "Friday", Sat: "Saturday", Sun: "Sunday",
};

/** "YYYY-MM-DD" in local time. */
export function isoDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Day key ("Mon".."Sun") for a Date, weeks starting Monday. */
export function dayKey(d = new Date()) {
  const js = d.getDay();
  return DAYS[js === 0 ? 6 : js - 1];
}

/** Monday 00:00 of the week containing d. */
export function startOfWeek(d = new Date()) {
  const out = new Date(d);
  const js = out.getDay();
  out.setDate(out.getDate() - (js === 0 ? 6 : js - 1));
  out.setHours(0, 0, 0, 0);
  return out;
}

/** Whole days between two ISO dates (b - a). */
export function daysBetween(aIso, bIso) {
  const a = new Date(aIso + "T12:00:00").getTime();
  const b = new Date(bIso + "T12:00:00").getTime();
  return Math.round((b - a) / 86400000);
}

export function initialsOf(name) {
  if (!name) return "?";
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0] || "";
  const last = words.length > 1 ? words[words.length - 1][0] || "" : "";
  return (first + last).toUpperCase();
}

/** "Sep 3" style. */
export function shortDate(iso) {
  if (!iso) return "";
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "Monday, 8 September" style, for the page header. */
export function longDate(d = new Date()) {
  return d.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" });
}

/** Relative time for message previews: now, 5m, 3h, Yesterday, Wed, Sep 3. */
export function relativeTime(iso, now = new Date()) {
  if (!iso) return "";
  const then = new Date(iso);
  const diffMin = Math.floor((now.getTime() - then.getTime()) / 60000);
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24 && then.getDate() === now.getDate()) {
    return then.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  const dayDiff = daysBetween(isoDate(then), isoDate(now));
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff < 7) return then.toLocaleDateString("en-US", { weekday: "short" });
  return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function clockTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Exercise item (string | object) → normalized object. */
export function normalizeExercise(ex) {
  if (typeof ex === "string") return { name: ex };
  if (!ex || typeof ex !== "object") return { name: "" };
  return { ...ex, name: ex.name || "" };
}

export function exerciseName(ex) {
  return typeof ex === "string" ? ex : (ex?.name || "");
}

/** "4 × 8" for the plan view, tolerant of missing values. */
export function setsReps(ex) {
  const o = normalizeExercise(ex);
  const s = o.sets != null && o.sets !== "" ? String(o.sets) : null;
  const r = o.reps != null && o.reps !== "" ? String(o.reps) : null;
  if (s && r) return `${s} × ${r}`;
  if (s) return `${s} sets`;
  if (r) return `${r} reps`;
  return "";
}

export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : (many || one + "s")}`;
}
