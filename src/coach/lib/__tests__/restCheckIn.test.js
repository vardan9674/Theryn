import { describe, it, expect } from "vitest";
import { checkInFact } from "../clientFacts.js";

// Thursday Oct 8: last workout Thursday Oct 1, then off sick.
const now = new Date(2026, 9, 8, 12);
const history = [{ date: "2026-10-01" }, { date: "2026-09-29" }];

describe("hearing from a client", () => {
  it("counts days from the last workout when nothing was marked", () => {
    expect(checkInFact(history, [], now)).toEqual({ days: 7, resting: false, tone: "bad" });
  });
  it("counts a rest day the coach marked, so a sick week isn't a missing client", () => {
    expect(checkInFact(history, ["2026-10-06", "2026-10-07"], now)).toEqual({ days: 1, resting: true, tone: "ok" });
  });
  it("still nudges once the rest days are old too", () => {
    expect(checkInFact(history, ["2026-10-02"], now)).toMatchObject({ days: 6, resting: true, tone: "warn" });
  });
  it("a workout after the rest day ends the resting", () => {
    expect(checkInFact([{ date: "2026-10-07" }], ["2026-10-05"], now)).toEqual({ days: 1, resting: false, tone: "ok" });
  });
  it("ignores future dates and handles nothing at all", () => {
    expect(checkInFact([], ["2026-10-20"], now)).toEqual({ days: null, resting: false, tone: "bad" });
    expect(checkInFact(null, null, now).days).toBeNull();
  });
});
