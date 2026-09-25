// A coach in India (Asia/Kolkata) and a client in Los Angeles: #93, #94, #95.
// Node honours process.env.TZ changes at runtime, so each test sets the
// timezone of whoever is looking and pins the clock.
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { isoDate } from "../format.js";
import { detectSignals } from "../../../lib/coachInsights.js";
import { streakStats } from "../streak.js";
import { lastWorkoutLabel, weekProgress, whatToDo } from "../clientFacts.js";
import { clockIn, clientNow, theirTimeNote, validTimeZone } from "../clientClock.js";
import { timeZoneFromSubmissions, linkClientData } from "../clientLinks.js";

const INDIA = "Asia/Kolkata", LA = "America/Los_Angeles";
const ORIGINAL_TZ = process.env.TZ;
const at = (tz, utc) => { process.env.TZ = tz; vi.setSystemTime(new Date(utc)); return new Date(); };
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); });
afterAll(() => { vi.useRealTimers(); process.env.TZ = ORIGINAL_TZ; });

const ex = (name) => [{ name, sets: 3, reps: "8" }];
const PLAN = {
  Mon: { type: "Push", exercises: ex("Bench") }, Tue: { type: "Pull", exercises: ex("Row") }, Wed: { type: "Legs", exercises: ex("Squat") },
  Thu: { type: "Rest", exercises: [] }, Fri: { type: "Upper", exercises: ex("Press") }, Sat: { type: "Lower", exercises: ex("Deadlift") }, Sun: { type: "Rest", exercises: [] },
};
const FULLBODY = { Mon: { type: "Full Body", exercises: ex("Squat") }, Wed: { type: "Full Body", exercises: ex("Squat") }, Fri: { type: "Full Body", exercises: ex("Squat") } };
const session = (date, type = "Full Body") => ({ date, type, exercises: [{ name: "Squat", sets: [{ w: "100", r: "5" }] }], totalVolume: 500, duration: 3000 });

describe("#93 calendar days are local dates", () => {
  it("in India, the cell for Sat 26 Sep is keyed 2026-09-26, not the 25th", () => {
    at(INDIA, "2026-09-26T02:45:00Z");
    expect(isoDate(new Date(2026, 8, 26))).toBe("2026-09-26");
    expect(isoDate(new Date())).toBe("2026-09-26"); // 8:15 am IST
  });
});

describe("#94 insights read the right days in the small hours in India", () => {
  // Every Mon/Wed/Fri for four weeks, the last one Fri 25 Sep.
  const history = [];
  for (let d = new Date(2026, 7, 28, 12); d <= new Date(2026, 8, 25, 12); d.setDate(d.getDate() + 1)) {
    if ([1, 3, 5].includes(d.getDay())) history.unshift(session(isoDate(d)));
  }

  it("2:00 am IST: a client who never missed is not flagged as low adherence or behind", () => {
    const now = at(INDIA, "2026-09-25T20:30:00Z"); // Sat 26, 2:00 am IST
    const kinds = detectSignals({ history, routine: FULLBODY, streak: 12, now }).map((s) => s.kind);
    expect(kinds).not.toContain("low_adherence");
    expect(kinds).not.toContain("falling_behind");
  });

  it("gives the same answer at 2:00 am and at 10:00 am the same day", () => {
    const early = detectSignals({ history, routine: FULLBODY, streak: 12, now: at(INDIA, "2026-09-25T20:30:00Z") }).map((s) => s.kind);
    const later = detectSignals({ history, routine: FULLBODY, streak: 12, now: at(INDIA, "2026-09-26T04:30:00Z") }).map((s) => s.kind);
    expect(early).toEqual(later);
  });

  it("'No activity for N days' counts whole days, like 'Last workout: N days ago'", () => {
    const now = at(INDIA, "2026-09-26T02:30:00Z"); // Sat 26, 8:00 am
    const h = [session("2026-09-20")];
    expect(lastWorkoutLabel(h, now)).toBe("6 days ago");
    expect(detectSignals({ history: h, routine: FULLBODY, now }).find((s) => s.kind === "inactive").message).toBe("No activity for 6 days — send a check-in.");
  });
});

describe("#95 the client's day, on the client's clock", () => {
  const client = { timeZone: LA };
  const doneThroughWed = ["2026-09-18", "2026-09-19", "2026-09-21", "2026-09-22", "2026-09-23"];

  it("clockIn gives the client's wall clock as a local Date", () => {
    at(INDIA, "2026-09-26T02:45:00Z"); // Sat 8:15 am IST = Fri 7:45 pm PDT
    const c = clockIn(LA);
    expect([c.getDate(), c.getHours(), c.getMinutes()]).toEqual([25, 19, 45]);
    expect(clockIn(null).getHours()).toBe(8); // unknown timezone: the coach's own clock
    expect(clockIn("Not/AZone").getHours()).toBe(8);
    expect(validTimeZone("Not/AZone")).toBe(null);
  });

  it("Sat 2:00 am IST (Fri 1:30 pm PDT): the client's Friday isn't over, so the streak stands", () => {
    const now = at(INDIA, "2026-09-25T20:30:00Z");
    const st = streakStats(doneThroughWed, PLAN, clientNow(client, now));
    expect(st.current).toBe(5);
    expect(st.brokeAt).toBe(0);
    // What their own link page shows at the same moment:
    at(LA, "2026-09-25T20:30:00Z");
    expect(streakStats(doneThroughWed, PLAN).current).toBe(5);
  });

  it("a workout sent 15 minutes ago reads 'Today', and this week counts it", () => {
    const now = at(INDIA, "2026-09-26T02:45:00Z");
    const history = [...doneThroughWed, "2026-09-25"].reverse().map((d) => session(d, "Upper"));
    const cnow = clientNow(client, now);
    expect(lastWorkoutLabel(history, cnow)).toBe("Today");
    expect(weekProgress(history, PLAN, cnow).done).toBe(4);
    expect(streakStats(history.map((h) => h.date), PLAN, cnow).current).toBe(6);
  });

  it("'at risk' waits for the client's evening, not the coach's", () => {
    const history = [...doneThroughWed, "2026-09-25"].map((d) => session(d, "Upper"));
    // Sat 6:30 pm IST = Sat 6:00 am PDT: nothing is at risk yet for the client.
    let now = at(INDIA, "2026-09-26T13:00:00Z");
    expect(streakStats(history.map((h) => h.date), PLAN, clientNow(client, now)).atRisk).toBe(false);
    // Sat 7:00 pm PDT (Sun 7:30 am IST), Saturday not done: now it is.
    now = at(INDIA, "2026-09-27T02:00:00Z");
    expect(streakStats(history.map((h) => h.date), PLAN, clientNow(client, now)).atRisk).toBe(true);
    expect(whatToDo({ history: [...history].reverse(), routine: PLAN }, clientNow(client, now)).text).toBeTruthy();
  });

  it("the timezone comes from the client's own sends, never from a coach-logged workout", () => {
    const subs = [
      { submitted_at: "2026-09-20T02:30:00Z", kind: "workout", payload: { tz: "America/New_York" } },
      { submitted_at: "2026-09-24T02:30:00Z", kind: "workout", payload: { tz: LA } },
      { submitted_at: "2026-09-25T02:30:00Z", kind: "workout", payload: { tz: INDIA, logged_by: "coach" } },
      { submitted_at: "2026-09-25T03:30:00Z", kind: "measurements", payload: { tz: "bogus/zone" } },
    ];
    expect(timeZoneFromSubmissions(subs)).toBe(LA);
    expect(timeZoneFromSubmissions([])).toBe(null);
    expect(linkClientData([]).timeZone).toBe(null);
  });

  it("the client page note shows their time only when it differs from the coach's", () => {
    at(INDIA, "2026-09-26T02:45:00Z");
    expect(theirTimeNote(LA, "Alex")).toBe("7:45 pm Friday for Alex");
    expect(theirTimeNote(INDIA, "Priya")).toBe(null);
    expect(theirTimeNote(null, "Sam")).toBe(null);
  });
});
