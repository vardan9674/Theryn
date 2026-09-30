// A session rarely matches the plan: the rack was taken, the shoulder hurt,
// there was time for one more set. The coach logs what happened, and the plan
// stays as it is for next week.
import { describe, it, expect } from "vitest";
import { swapTo, withSets, shapeExercises, anyChanges, plannedSets, setCount, MAX_SETS } from "../logChanges.js";
import { workoutPayload, normalizeExercise } from "../clientLinks.js";

const bench = normalizeExercise({ name: "Barbell Bench Press", sets: 3, reps: "8", weight: 60, alternatives: ["Dumbbell Bench Press"] });
const perSet = normalizeExercise({ name: "Back Squat", sets: 3, reps: "12/10/8", setList: [{ reps: "12", weight: 60, kind: "warmup" }, { reps: "10", weight: 80 }, { reps: "8", weight: 90 }] });
const plank = normalizeExercise({ name: "Plank", mode: "time", sets: 3, secs: 45 });
const day = (exercises) => ({ key: "Mon", type: "Push", exercises, isRest: false });

describe("swapping one exercise for another", () => {
  it("keeps the sets and reps, and says what it stood in for", () => {
    const e = swapTo(bench, "Machine Chest Press");
    expect(e.name).toBe("Machine Chest Press");
    expect(e.swappedFrom).toBe("Barbell Bench Press");
    expect(plannedSets(e)).toBe(3);
    expect(e.reps).toBe("8");
  });

  it("drops the weight the plan asked for: 60 on a barbell is not 60 on dumbbells", () => {
    expect(swapTo(bench, "Dumbbell Bench Press").weight).toBeNull();
    expect(swapTo(perSet, "Hack Squat").setList.every((s) => s.weight === null)).toBe(true);
  });

  it("keeps the per-set reps and the warm-up", () => {
    const s = swapTo(perSet, "Hack Squat");
    expect(s.setList.map((x) => x.reps)).toEqual(["12", "10", "8"]);
    expect(s.setList[0].kind).toBe("warmup");
  });

  it("keeps the coach's own stand-ins, so a second swap can still use them", () => {
    expect(swapTo(bench, "Machine Chest Press").alternatives).toEqual(["Dumbbell Bench Press"]);
  });

  it("swapping back to the planned name changes nothing", () => {
    expect(swapTo(bench, "barbell bench press")).toBe(bench);
    expect(swapTo(bench, "   ")).toBe(bench);
  });
});

describe("more or fewer sets than planned", () => {
  it("a fourth set copies the third", () => {
    const e = withSets(bench, 4);
    expect(plannedSets(e)).toBe(4);
    expect(e.setList).toHaveLength(4);
    expect(e.setList[3]).toEqual({ reps: "8", weight: 60 });
  });

  it("an added set is a working set, never a second warm-up", () => {
    const e = withSets(normalizeExercise({ name: "Row", setList: [{ reps: "12", kind: "warmup" }] }), 2);
    expect(e.setList[0].kind).toBe("warmup");
    expect(e.setList[1].kind).toBeUndefined();
  });

  it("dropping a set keeps the ones before it", () => {
    const e = withSets(perSet, 2);
    expect(e.setList.map((s) => s.reps)).toEqual(["12", "10"]);
  });

  it("a timed exercise keeps its seconds", () => {
    expect(withSets(plank, 4).setList.every((s) => s.secs === 45)).toBe(true);
  });

  it("stays between one set and twenty", () => {
    expect(plannedSets(withSets(bench, 99))).toBe(MAX_SETS);
    expect(withSets(bench, 0)).toBe(bench);
    expect(setCount("abc")).toBeNull();
  });
});

describe("the day as the coach logs it", () => {
  it("leaves an untouched day exactly as planned", () => {
    expect(shapeExercises([bench, plank], {})).toEqual([bench, plank]);
    expect(anyChanges([bench, plank], {})).toBe(false);
  });

  it("notices a skip, a swap or a changed set count", () => {
    expect(anyChanges([bench], { skipped: { 0: true } })).toBe(true);
    expect(anyChanges([bench], { swaps: { 0: "Machine Chest Press" } })).toBe(true);
    expect(anyChanges([bench], { sets: { 0: 4 } })).toBe(true);
    expect(anyChanges([bench], { swaps: { 0: "Barbell Bench Press" }, sets: { 0: 3 } })).toBe(false);
  });
});

describe("what gets sent", () => {
  const send = (exercises, ticks, changes = {}) =>
    workoutPayload(day(shapeExercises(exercises, changes)), ticks, {}, "", "2026-09-28", "metric");

  it("a swap carries what the plan asked for alongside what they did", () => {
    const [e] = send([bench], { 0: 3 }, { swaps: { 0: "Machine Chest Press" } }).exercises;
    expect(e.name).toBe("Machine Chest Press");
    expect(e.swapped_from).toBe("Barbell Bench Press");
    expect(e.sets_done).toBe(3);
    expect(e.weight_target).toBeNull();
  });

  it("an exercise as planned says nothing about swaps", () => {
    expect(send([bench], { 0: 3 }).exercises[0].swapped_from).toBeUndefined();
  });

  it("a skipped exercise is still sent, with no sets done", () => {
    const [e] = send([bench], { 0: 0 }, { skipped: { 0: true } }).exercises;
    expect(e.name).toBe("Barbell Bench Press");
    expect(e.sets_planned).toBe(3);
    expect(e.sets_done).toBe(0);
  });

  it("a fourth set is sent as done", () => {
    const [e] = send([bench], { 0: 4 }, { sets: { 0: 4 } }).exercises;
    expect(e.sets_planned).toBe(4);
    expect(e.sets_done).toBe(4);
  });
});
