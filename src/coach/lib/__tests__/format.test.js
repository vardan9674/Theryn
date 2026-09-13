import { describe, it, expect } from "vitest";
import { initialsOf, setsReps, parseWeight, relativeTime, startOfWeek, dayKey, isoDate } from "../format.js";

describe("format", () => {
  it("initials", () => {
    expect(initialsOf("Priya Sharma")).toBe("PS");
    expect(initialsOf("Vardan")).toBe("V");
    expect(initialsOf("")).toBe("?");
  });
  it("sets × reps", () => {
    expect(setsReps({ name: "x", sets: 4, reps: "8-10" })).toBe("4 × 8-10");
    expect(setsReps("Bench")).toBe("");
    expect(setsReps({ name: "x", sets: 3 })).toBe("3 sets");
    expect(setsReps({ name: "x", sets: 4, reps: "8", weight: 40 }, "kg")).toBe("4 × 8 · 40 kg");
    expect(setsReps({ name: "x", weight: 12.5 })).toBe("12.5 lb");
    expect(setsReps({ name: "x", sets: 3, weight: "" })).toBe("3 sets");
  });
  it("target weight parsing", () => {
    expect(parseWeight("40")).toBe(40);
    expect(parseWeight(" 12.5 ")).toBe(12.5);
    expect(parseWeight(12.456)).toBe(12.46);
    expect(parseWeight("")).toBeNull();
    expect(parseWeight(null)).toBeNull();
    expect(parseWeight("0")).toBeNull();
    expect(parseWeight("abc")).toBeNull();
    expect(parseWeight("5000")).toBeNull();
  });
  it("week starts Monday", () => {
    const sun = new Date(2026, 8, 13, 12); // Sunday
    expect(dayKey(sun)).toBe("Sun");
    expect(isoDate(startOfWeek(sun))).toBe("2026-09-07");
  });
  it("relative time", () => {
    const now = new Date(2026, 8, 9, 12, 0, 0);
    expect(relativeTime(new Date(now.getTime() - 30000).toISOString(), now)).toBe("now");
    expect(relativeTime(new Date(now.getTime() - 5 * 60000).toISOString(), now)).toBe("5m");
    expect(relativeTime(new Date(2026, 8, 8, 9).toISOString(), now)).toBe("Yesterday");
  });
});
