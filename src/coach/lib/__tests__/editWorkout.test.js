import { describe, it, expect } from "vitest";
import { editableSets, applyEdits, weightLooksOff } from "../editWorkout.js";

const sent = {
  date: "2026-09-21", type: "Push", note: "Felt good",
  exercises: [
    { name: "Lateral Raise", sets_planned: 3, sets_done: 3, reps: "12", weight_target: 7.5, weight_used: 75,
      sets: [{ n: 1, done: true, weight: 75 }, { n: 2, done: true }, { n: 3, done: true, reps: 10 }] },
    { name: "Plank", mode: "time", sets_planned: 2, sets_done: 2, secs_target: 45, sets: [{ n: 1, done: true, secs: 50 }] },
    { name: "Dips", sets_planned: 3, sets_done: 0, reps: "10" },
  ],
};

describe("coach corrects a client's workout", () => {
  it("lists the done sets with what the client sent, or the plan for blanks", () => {
    expect(editableSets(sent.exercises[0])).toEqual([
      { n: 1, reps: 12, weight: 75, secs: null },
      { n: 2, reps: 12, weight: 75, secs: null },
      { n: 3, reps: 10, weight: 75, secs: null },
    ]);
    expect(editableSets(sent.exercises[1]).map((s) => s.secs)).toEqual([50, 45]);
    expect(editableSets(sent.exercises[2])).toEqual([]);
  });
  it("fixes 75 → 7.5 and keeps everything else, with the original kept once", () => {
    const rows = editableSets(sent.exercises[0]).map((r) => ({ ...r, weight: 7.5 }));
    const out = applyEdits(sent, { 0: rows }, new Date("2026-09-22T10:00:00Z"));
    expect(out.exercises[0].sets.map((s) => s.weight)).toEqual([7.5, 7.5, 7.5]);
    expect(out.exercises[0].sets.every((s) => s.done)).toBe(true);
    expect(out.exercises[0].weight_used).toBe(7.5);
    expect(out.exercises[1]).toEqual(sent.exercises[1]); // untouched
    expect(out.note).toBe("Felt good");
    expect(out.edited_by_coach_at).toBe("2026-09-22T10:00:00.000Z");
    expect(out.original_exercises).toEqual(sent.exercises);
    const again = applyEdits(out, { 0: rows });
    expect(again.original_exercises).toEqual(sent.exercises); // still the client's first version
  });
  it("edits a timed set's time", () => {
    const out = applyEdits(sent, { 1: [{ n: 1, secs: 60 }, { n: 2, secs: 45 }] });
    expect(out.exercises[1].sets.map((s) => s.secs)).toEqual([60, 45]);
  });
  it("flags a weight that looks like a typo", () => {
    expect(weightLooksOff(75, 7.5)).toBe(true);
    expect(weightLooksOff(7.5, 75)).toBe(true);
    expect(weightLooksOff(10, 7.5)).toBe(false);
    expect(weightLooksOff(600, null)).toBe(true);
    expect(weightLooksOff(80, null)).toBe(false);
  });
});
