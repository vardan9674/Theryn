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
