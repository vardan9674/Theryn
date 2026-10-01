// Wins: an exercise done better than last time, on the link's receipt and in the report.
import { describe, it, expect } from "vitest";
import { exerciseStats, compareExercise, workoutWins, lastTimes, weekWins, winWords, winsHeadline } from "../../../lib/workoutWins.js";
import { winsForSend } from "../../../link/sendWins.js";

const sets = (...xs) => xs.map(([w, r, s]) => ({ w: w == null ? "" : String(w), r: r == null ? "" : String(r), ...(s != null ? { s } : {}) }));
const cmp = (a, b) => compareExercise(exerciseStats(a), exerciseStats(b));

describe("one exercise against last time", () => {
  it("calls a heavier top set a win", () => {
    expect(cmp(sets([45, 8], [47.5, 6]), sets([45, 8], [45, 8]))).toMatchObject({ kind: "heavier", now: 47.5, before: 45, reps: 6 });
  });
  it("calls more reps at the same top weight a win", () => {
    expect(cmp(sets([40, 10], [40, 10]), sets([40, 8], [40, 8]))).toMatchObject({ kind: "reps", now: 10, before: 8, weight: 40 });
  });
  it("never congratulates lighter weight, whatever the reps", () => {
    expect(cmp(sets([40, 15]), sets([45, 8]))).toBeNull();
  });
  it("counts bodyweight reps", () => {
    expect(cmp(sets([null, 12], [null, 10]), sets([null, 10], [null, 9]))).toMatchObject({ kind: "reps", now: 12, before: 10, weight: 0 });
  });
  it("counts a longer hold", () => {
    expect(cmp(sets([null, null, 60]), sets([null, null, 45]))).toMatchObject({ kind: "longer", now: 60, before: 45 });
  });
  it("counts a set they skipped last time as more work", () => {
    expect(cmp(sets([40, 8], [40, 8], [40, 8]), sets([40, 8], [40, 8]))).toMatchObject({ kind: "more", now: 24, before: 16 });
  });
  it("finds nothing when it was the same", () => {
    expect(cmp(sets([40, 8], [40, 8]), sets([40, 8], [40, 8]))).toBeNull();
  });
  it("ignores sets with no readable reps", () => {
    expect(exerciseStats(sets([200, ""], [40, 8]))).toMatchObject({ top: 40, topReps: 8 });
  });
});

describe("a whole workout", () => {
  const last = lastTimes([
    { date: "2026-09-20", exercises: [{ name: "Bench Press", sets: sets([45, 8]) }, { name: "Pull-ups", sets: sets([null, 6]) }] },
    { date: "2026-09-24", exercises: [{ name: "bench press", sets: sets([50, 5]) }] },
  ], "2026-09-28");
  it("compares with the most recent time, matching names loosely", () => {
    expect(last("Bench press")).toEqual(sets([50, 5]));
    expect(last("Pull-up")).toEqual(sets([null, 6]));
  });
  it("is never a win the first time", () => {
    const wins = workoutWins([{ name: "Squat", sets: sets([100, 5]) }], last);
    expect(wins).toEqual([]);
  });
  it("lists the strongest kind first, one per exercise", () => {
    const wins = workoutWins([
      { name: "Pull-up", sets: sets([null, 8]) },
      { name: "Bench Press", sets: sets([52.5, 5]) },
    ], last);
    expect(wins.map((w) => [w.name, w.kind])).toEqual([["Bench Press", "heavier"], ["Pull-up", "reps"]]);
  });
  it("only looks at days before this one", () => {
    expect(lastTimes([{ date: "2026-09-28", exercises: [{ name: "Row", sets: sets([30, 8]) }] }], "2026-09-28")("Row")).toBeNull();
  });
});

describe("the week's wins for the report", () => {
  const history = [
    { date: "2026-09-15", exercises: [{ name: "Squat", sets: sets([100, 5]) }, { name: "Curl", sets: sets([12, 10]) }] },
    { date: "2026-09-22", exercises: [{ name: "Squat", sets: sets([100, 5]) }] },
    { date: "2026-09-26", exercises: [{ name: "Squat", sets: sets([105, 5]) }, { name: "Curl", sets: sets([12, 12]) }] },
  ];
  it("compares the week's best session with the last one before the week", () => {
    const wins = weekWins(history, "2026-09-21", "2026-09-27");
    expect(wins.map((w) => [w.name, w.kind, w.now, w.before])).toEqual([["Squat", "heavier", 105, 100], ["Curl", "reps", 12, 10]]);
  });
});

describe("what the link sends", () => {
  const payload = (exs, unit = "metric") => ({ weight_unit: unit, exercises: exs.map(([name, w, r, done = 3]) => ({ name, sets_planned: 3, sets_done: done, sets: Array.from({ length: 3 }, (_, i) => ({ n: i + 1, done: i < done, weight: w, reps: r })) })) });
  it("uses the server's history, in the client's unit now", () => {
    const history = [{ date: "2026-09-24", kind: "workout", payload: payload([["Bench", 100, 8]], "imperial") }]; // 100 lb is 45.5 kg
    const wins = winsForSend(payload([["Bench", 47.5, 8]]), "2026-09-28", "metric", history, null);
    expect(wins).toHaveLength(1);
    expect(wins[0]).toMatchObject({ name: "Bench", kind: "heavier", now: 47.5, before: 45.5 });
  });
  it("falls back to what this phone remembers", () => {
    const store = { last: (n) => (n.toLowerCase() === "row" ? { date: "2026-09-25", units: "metric", sets: sets([30, 8], [30, 8], [30, 8]) } : null) };
    const wins = winsForSend(payload([["Row", 30, 10]]), "2026-09-28", "metric", [], store);
    expect(wins[0]).toMatchObject({ kind: "reps", now: 10, before: 8 });
  });
  it("leaves out an exercise they skipped", () => {
    const history = [{ date: "2026-09-24", payload: payload([["Bench", 40, 8]]) }];
    expect(winsForSend(payload([["Bench", 50, 8, 0]]), "2026-09-28", "metric", history)).toEqual([]);
  });
  it("doesn't compare with an earlier send of the same day", () => {
    const history = [{ date: "2026-09-28", payload: payload([["Bench", 40, 8]]) }];
    expect(winsForSend(payload([["Bench", 50, 8]]), "2026-09-28", "metric", history)).toEqual([]);
  });
});

describe("words", () => {
  it("says each win plainly", () => {
    expect(winWords({ kind: "heavier", now: 47.5, before: 45 }, "kg").line).toBe("47.5 kg, up from 45 kg");
    expect(winWords({ kind: "reps", now: 10, before: 8, weight: 40 }, "lb").line).toBe("10 reps at 40 lb, up from 8");
    expect(winWords({ kind: "reps", now: 12, before: 10, weight: 0 }).line).toBe("12 reps, up from 10");
    expect(winWords({ kind: "longer", now: 75, before: 60 }).line).toBe("1:15 min, up from 1 min");
    expect(winWords({ kind: "more", now: 24, before: 16 }, "kg").line).toBe("24 reps in all, up from 16");
  });
  it("heads the list", () => {
    expect(winsHeadline(0)).toBe("");
    expect(winsHeadline(1)).toBe("You beat last time.");
    expect(winsHeadline(3)).toBe("You beat last time on 3 exercises.");
  });
});

describe("the badge's numbers", () => {
  it("shows last time and this time, and what they count", async () => {
    const { winNumbers } = await import("../../../lib/workoutWins.js");
    expect(winNumbers({ kind: "heavier", now: 30, before: 25, reps: 8 }, "kg")).toEqual({ from: "25", to: "30", what: "kg", note: "for 8 reps" });
    expect(winNumbers({ kind: "reps", now: 10, before: 8, weight: 40 }, "lb")).toEqual({ from: "8", to: "10", what: "reps", note: "at 40 lb" });
    expect(winNumbers({ kind: "reps", now: 12, before: 10, weight: 0 })).toMatchObject({ from: "10", to: "12", note: "" });
    expect(winNumbers({ kind: "longer", now: 60, before: 45 })).toMatchObject({ from: "0:45", to: "1:00", what: "min" });
    expect(winNumbers({ kind: "more", now: 30, before: 25 })).toEqual({ from: "25", to: "30", what: "reps", note: "in all" });
  });
});
