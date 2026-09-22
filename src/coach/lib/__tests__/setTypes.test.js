import { describe, it, expect } from "vitest";
import { dropWeight, warmupWeight, rackRound, setKindsSummary, groupName } from "../exerciseKinds.js";
import { planSets, packSets, setsLine, repsSummary } from "../planSets.js";

describe("warm-up, drop and AMRAP sets", () => {
  it("suggests rack-friendly drop and warm-up weights", () => {
    expect(dropWeight(60, "kg")).toBe(45);   // 75% of 60
    expect(dropWeight(135, "lb")).toBe(100); // 101.25 → nearest 5
    expect(warmupWeight(60, "kg")).toBe(30);
    expect(rackRound(1, "kg")).toBe(2.5);    // never below one step
  });
  it("keeps set kinds through the plan and reads them back", () => {
    const rows = [
      { reps: "10", weight: 30, kind: "warmup" },
      { reps: "8", weight: 60 },
      { reps: "8", weight: 60 },
      { reps: "8", weight: 45, kind: "drop" },
    ];
    const packed = packSets(rows);
    expect(packed.setList.map((s) => s.kind || null)).toEqual(["warmup", null, null, "drop"]);
    expect(planSets(packed).map((s) => s.kind || null)).toEqual(["warmup", null, null, "drop"]);
    expect(setsLine(planSets(packed), "kg")).toBe("2 sets · 8 reps · 45–60 kg · 1 warm-up · drop set"); // working sets, then the extras
  });
  it("AMRAP reads as max reps", () => {
    const packed = packSets([{ reps: "10", weight: 40 }, { reps: "10", weight: 40 }, { reps: "10", weight: 40, kind: "amrap" }]);
    expect(packed.reps).toBe("10/10/max");
    expect(packed.setList[2]).toEqual({ kind: "amrap", weight: 40 });
    expect(repsSummary(planSets(packed))).toBe("10/10/max");
    expect(setKindsSummary(planSets(packed))).toBe("AMRAP last set");
  });
  it("plain sets stay exactly as before", () => {
    expect(packSets([{ reps: "10", weight: 60 }, { reps: "10", weight: 60 }])).toEqual({ sets: 2, reps: "10", weight: 60 });
    expect(planSets({ sets: 2, reps: "10" })[0]).toEqual({ reps: "10", weight: null });
  });
  it("names groups by size", () => {
    expect(groupName(2)).toBe("Superset");
    expect(groupName(3)).toBe("Tri-set");
    expect(groupName(5)).toBe("Giant set");
  });
});

import { planToTemplateDays, templateDaysToPlan } from "../manualTemplates.js";
describe("saved plans keep set types and rest", () => {
  it("round-trips drop, warm-up and AMRAP sets and the rest time", () => {
    const plan = { Mon: { type: "Push", exercises: [{ name: "Bench Press", sets: 3, reps: "10/8/max", rest: 90,
      setList: [{ kind: "warmup", reps: "10", weight: 30 }, { reps: "8", weight: 60 }, { kind: "drop", reps: "8", weight: 45 }, { kind: "amrap", weight: 40 }] }] } };
    const rows = planToTemplateDays(plan, "metric");
    expect(rows[0].exercises[0].extra).toEqual({ rest: 90 });
    const back = templateDaysToPlan(rows, "metric").Mon.exercises[0];
    expect(back.rest).toBe(90);
    expect(back.setList.map((s) => s.kind || null)).toEqual(["warmup", null, "drop", "amrap"]);
  });
});

import { normalizeExercise, workoutPayload } from "../clientLinks.js";
import { workoutDetail } from "../workouts.js";
describe("set types reach the coach", () => {
  it("the payload and the coach's history keep warm-up and drop labels", () => {
    const ex = normalizeExercise({ name: "Deadlift", sets: 4, reps: "5", rest: 90, setList: [{ kind: "warmup", reps: "8", weight: 40 }, { reps: "5", weight: 80 }, { reps: "5", weight: 80 }, { kind: "drop", reps: "5", weight: 60 }] });
    expect(ex.rest).toBe(90);
    const p = workoutPayload({ key: "Tue", type: "Pull", exercises: [ex] }, { 0: 4 }, { 0: { 3: { r: "6" } } }, "", "2026-09-22", "metric");
    expect(p.exercises[0].plan_sets.map((s) => s.k || null)).toEqual(["warmup", null, null, "drop"]);
    const w = workoutDetail({ id: "x", date: "2026-09-22", submission: { id: "s1", payload: p } });
    expect(w.exercises[0].sets.map((s) => s.k || null)).toEqual(["warmup", null, null, "drop"]);
    expect(w.exercises[0].sets[3]).toMatchObject({ w: "60", r: "6" });
  });
});
