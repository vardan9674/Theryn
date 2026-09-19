import { describe, it, expect } from "vitest";
import { streakStats, streakWith } from "../streak.js";

// Mon/Tue/Wed train, Thu rest, Fri/Sat train, Sun rest.
const plan = { Mon: { type: "Push" }, Tue: { type: "Pull" }, Wed: { type: "Legs" }, Thu: { type: "Rest" }, Fri: { type: "Upper" }, Sat: { type: "Lower" }, Sun: { type: "Rest" } };
// Friday 18 Sep 2026
const fri = (h = 12) => new Date(2026, 8, 18, h);

describe("streakStats", () => {
  it("counts workouts and rest days, and today not done doesn't break it", () => {
    const s = streakStats(["2026-09-14", "2026-09-15", "2026-09-16"], plan, fri());
    expect(s.current).toBe(4); // Mon Tue Wed + Thu rest; Fri still open
    expect(s.doneToday).toBe(false);
    expect(s.atRisk).toBe(false);
  });
  it("is at risk on a planned day after 6 pm", () => {
    expect(streakStats(["2026-09-14", "2026-09-15", "2026-09-16"], plan, fri(19)).atRisk).toBe(true);
    expect(streakStats(["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-18"], plan, fri(19)).atRisk).toBe(false);
  });
  it("a missed planned day ends it and is reported for a week", () => {
    const s = streakStats(["2026-09-11", "2026-09-12", "2026-09-14", "2026-09-15"], plan, fri());
    // Fri Sat (Sun rest) Mon Tue = 5, then Wed missed; Thu rest alone is not a streak
    expect(s.current).toBe(0);
    expect(s.brokeAt).toBe(5);
    expect(s.best).toBe(5);
  });
  it("tracks the best run and this month's count", () => {
    const s = streakStats(["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-04", "2026-09-05", "2026-09-07", "2026-09-16", "2026-09-18"], plan, fri());
    expect(s.best).toBe(8);        // Mon 31 Aug … Mon 7 Sep with two rest days
    expect(s.current).toBe(3);     // Wed, Thu rest, Fri
    expect(s.thisMonth).toBe(7);
  });
  it("gives the last 14 days for the strip", () => {
    const s = streakStats(["2026-09-14", "2026-09-16"], plan, fri());
    expect(s.days).toHaveLength(14);
    expect(s.days.at(-1)).toEqual({ iso: "2026-09-18", state: "today" });
    expect(s.days.find((d) => d.iso === "2026-09-15").state).toBe("missed");
    expect(s.days.find((d) => d.iso === "2026-09-17").state).toBe("rest");
    expect(s.days.find((d) => d.iso === "2026-09-10").state).toBe("before");
  });
  it("no history, junk dates, and no plan are all safe", () => {
    expect(streakStats([], plan, fri()).current).toBe(0);
    expect(streakStats(["nope", null], plan, fri()).best).toBe(0);
    expect(streakStats(["2026-09-17", "2026-09-18"], null, fri()).current).toBe(2);
  });
  it("streakWith shows what sending today makes it", () => {
    expect(streakWith(["2026-09-14", "2026-09-15", "2026-09-16"], "2026-09-18", plan, fri()).current).toBe(5);
  });
});

import { consistencyStats } from "../streak.js";
describe("consistency since they joined", () => {
  // Mon/Wed/Fri training, the rest are rest days. 2026-09-14 is a Monday.
  const plan = { Mon: { type: "Push", exercises: ["Bench"] }, Tue: { type: "Rest" }, Wed: { type: "Pull", exercises: ["Row"] }, Thu: { type: "Rest" }, Fri: { type: "Legs", exercises: ["Squat"] }, Sat: { type: "Rest" }, Sun: { type: "Rest" } };
  const at = (iso, h = 20) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d, h); };
  it("1 of 1 is 100%, 1 of 2 is 50%", () => {
    expect(consistencyStats(["2026-09-14"], plan, "2026-09-14", at("2026-09-14"))).toMatchObject({ planned: 1, done: 1, pct: 100 });
    // Wed was missed; it is Thursday now.
    expect(consistencyStats(["2026-09-14"], plan, "2026-09-14", at("2026-09-17"))).toMatchObject({ planned: 2, done: 1, pct: 50 });
  });
  it("ignores rest days, and today until it's done", () => {
    // Joined Mon, trained Mon; it's Tue (rest) → still 1 of 1.
    expect(consistencyStats(["2026-09-14"], plan, "2026-09-14", at("2026-09-15"))).toMatchObject({ planned: 1, pct: 100 });
    // Wed is today and not done yet → not counted.
    expect(consistencyStats(["2026-09-14"], plan, "2026-09-14", at("2026-09-16", 9))).toMatchObject({ planned: 1, done: 1, pct: 100 });
    // Once Wednesday is done it counts: 2 of 2.
    expect(consistencyStats(["2026-09-14", "2026-09-16"], plan, "2026-09-14", at("2026-09-16"))).toMatchObject({ planned: 2, done: 2, pct: 100 });
  });
  it("starts the day they joined; a rest-day workout makes up a missed one", () => {
    expect(consistencyStats([], plan, "2026-09-16", at("2026-09-16", 9)).pct).toBe(null);
    expect(consistencyStats(["2026-09-15"], plan, "2026-09-14", at("2026-09-15")).pct).toBe(100);
  });
});
