import { describe, it, expect } from "vitest";
import { defaultMode, defaultSecs, parseDuration, formatDuration, durationInput, clock, maskDuration, tidyDuration, supersetInfo, normalizeSupersets } from "../exerciseKinds.js";
import { planSets, packSets, setsLine } from "../planSets.js";

describe("timed exercises", () => {
  it("knows planks and runs are done for time", () => {
    expect(defaultMode("Plank")).toBe("time");
    expect(defaultMode("Side Plank")).toBe("time");
    expect(defaultMode("Treadmill Run")).toBe("time");
    expect(defaultMode("Stationary Bike")).toBe("time");
    expect(defaultMode("Bench Press")).toBe("reps");
    expect(defaultMode("Barbell Row")).toBe("reps"); // a row with weights is reps, not the rowing machine
    expect(defaultSecs("Plank")).toBe(45);
    expect(defaultSecs("Treadmill Run")).toBe(1200);
  });
  it("reads what coaches type", () => {
    expect(parseDuration("45")).toBe(45);
    expect(parseDuration("45s")).toBe(45);
    expect(parseDuration("1:30")).toBe(90);
    expect(parseDuration("20m")).toBe(1200);
    expect(parseDuration("20 min")).toBe(1200);
    expect(parseDuration("1.5 min")).toBe(90);
    expect(parseDuration("1h")).toBe(3600);
    expect(parseDuration("1:05:00")).toBe(3900);
    expect(parseDuration("")).toBe(null);
    expect(parseDuration("abc")).toBe(null);
    expect(parseDuration("0")).toBe(null);
  });
  it("writes times the way people read them", () => {
    expect(formatDuration(45)).toBe("45 s");
    expect(formatDuration(90)).toBe("1:30");
    expect(formatDuration(1200)).toBe("20 min");
    expect(formatDuration(3900)).toBe("1:05:00");
    expect(durationInput(45)).toBe("00:45");
    expect(durationInput(60)).toBe("01:00");
    expect(durationInput(1200)).toBe("20:00");
    expect(clock(42)).toBe("00:42");
    expect(clock(725)).toBe("12:05");
    expect(clock(3900)).toBe("1:05:00");
  });
  it("time boxes fill from the right like a timer, always as 00:00", () => {
    expect(maskDuration("1")).toBe("00:01");
    expect(maskDuration("100")).toBe("01:00");
    expect(maskDuration("130")).toBe("01:30");
    expect(maskDuration("2000")).toBe("20:00");
    expect(maskDuration("00:451")).toBe("04:51"); // one more digit typed at the end
    expect(maskDuration("00:4")).toBe("00:04");   // a digit deleted
    expect(maskDuration("10000")).toBe("1:00:00");
    expect(maskDuration("")).toBe("");
    expect(tidyDuration("00:90")).toBe("01:30");
    expect(parseDuration("01:00")).toBe(60);
  });
  it("packs timed sets with seconds, not reps, and reads them back", () => {
    const same = packSets([{ secs: 60 }, { secs: 60 }, { secs: 60 }], "time");
    expect(same).toEqual({ sets: 3, mode: "time", secs: 60 });
    const diff = packSets([{ secs: 30 }, { secs: 45 }, { secs: 60, weight: 10 }], "time");
    expect(diff.setList).toEqual([{ secs: 30 }, { secs: 45 }, { secs: 60, weight: 10 }]);
    expect(planSets(same).map((s) => s.secs)).toEqual([60, 60, 60]);
    expect(setsLine(planSets(same), "kg", "time")).toBe("3 sets · 1 min each");
    expect(setsLine(planSets(diff), "kg", "time")).toBe("3 sets · 30 s–1 min each · 10 kg");
  });
  it("leaves reps-only plans exactly as they were", () => {
    expect(planSets({ sets: 2, reps: "10", weight: 60 })).toEqual([{ reps: "10", weight: 60 }, { reps: "10", weight: 60 }]);
    expect(packSets([{ reps: "10", weight: 60 }])).toEqual({ sets: 1, reps: "10", weight: 60 });
  });
});

describe("supersets", () => {
  const ex = (name, superset) => ({ name, superset });
  it("letters groups of two or more in a row", () => {
    const info = supersetInfo([ex("Bench", "x"), ex("Row", "x"), ex("Curl"), ex("Dip", "y"), ex("Pushdown", "y"), ex("Raise", "y")]);
    expect(info[0]).toEqual({ letter: "A", pos: 1, size: 2 });
    expect(info[1]).toEqual({ letter: "A", pos: 2, size: 2 });
    expect(info[2]).toBe(null);
    expect(info[5]).toEqual({ letter: "B", pos: 3, size: 3 });
  });
  it("a lone exercise is not a superset, and split groups are separate", () => {
    const info = supersetInfo([ex("Bench", "x"), ex("Curl"), ex("Row", "x")]);
    expect(info).toEqual([null, null, null]);
    expect(normalizeSupersets([ex("Bench", "x"), ex("Curl")])[0].superset).toBeUndefined();
    expect(normalizeSupersets([ex("Bench", "tok1"), ex("Row", "tok1")]).map((e) => e.superset)).toEqual(["A", "A"]);
  });
});

import { normalizeExercise, workoutPayload } from "../clientLinks.js";
describe("what a timed set and a superset send to the coach", () => {
  it("keeps the mode, target and the time done on each set", () => {
    const plank = normalizeExercise({ name: "Plank", mode: "time", sets: 2, secs: 45 });
    const row = normalizeExercise({ name: "Barbell Row", sets: 3, reps: "10", superset: "A" });
    expect(plank).toMatchObject({ mode: "time", secs: 45, sets: 2 });
    expect(row.superset).toBe("A");
    const today = { key: "Tue", type: "Pull", exercises: [plank, row] };
    const p = workoutPayload(today, { 0: 2, 1: 1 }, { 0: { 0: { s: "0:45" }, 1: { s: "30" } } }, "", "2026-09-22", "metric");
    expect(p.exercises[0]).toMatchObject({ mode: "time", secs_target: 45, sets_done: 2 });
    expect(p.exercises[0].sets).toEqual([{ n: 1, done: true, secs: 45 }, { n: 2, done: true, secs: 30 }]);
    expect(p.exercises[1]).toMatchObject({ superset: "A", sets_done: 1 });
  });
});
