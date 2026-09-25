// A client's own clock, for a coach who may be in another timezone (#95).
//
// Every client fact ("Today", "This week", streaks, "at risk", insights) is a
// question about the client's day, so it has to be asked on the client's
// clock, not the coach's. A coach in India looking at a client in Los Angeles
// at 9 am IST is looking at 8:30 pm the day before for the client.
//
// The helpers below return an ordinary Date whose *local* fields (getDate,
// getDay, getHours…) read the client's wall-clock time, so every existing
// function that takes `now` works unchanged. When the client's timezone is
// unknown they return the coach's own clock, which is how it worked before.

/** The IANA name if this runtime knows it, else null. */
export function validTimeZone(tz) {
  if (!tz || typeof tz !== "string" || tz.length > 64) return null;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz; } catch { return null; }
}

/** This device's timezone, e.g. "America/Los_Angeles"; null if unavailable. */
export function browserTimeZone() {
  try { return validTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone); } catch { return null; }
}

/** `now` as the wall clock in `tz`, expressed as a local Date. */
export function clockIn(tz, now = new Date()) {
  const zone = validTimeZone(tz);
  if (!zone) return now;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(now);
    const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
    return new Date(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second));
  } catch {
    return now;
  }
}

/** The client's clock for a client's data object ({ timeZone }). */
export function clientNow(data, now = new Date()) {
  return clockIn(data?.timeZone, now);
}

/**
 * "7:45 pm Friday for Alex", only when the client's clock is at least an hour
 * away from the coach's; null otherwise, so nothing shows for a local client.
 */
export function theirTimeNote(tz, firstName, now = new Date()) {
  if (!validTimeZone(tz)) return null;
  const theirs = clockIn(tz, now);
  if (Math.abs(theirs.getTime() - now.getTime()) < 60 * 60 * 1000) return null;
  const time = theirs.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase().replace(/\s/g, " ");
  const day = theirs.toLocaleDateString("en-US", { weekday: "long" });
  return `${time} ${day} for ${firstName}`;
}
