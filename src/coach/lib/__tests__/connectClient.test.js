// A client who connects their own account can add sessions the coach didn't
// plan. Those have to reach the coach marked as theirs, and never be mistaken
// for part of the plan.
import { describe, it, expect } from "vitest";
import { connectCode, CODE_ALPHABET, workoutPayload } from "../clientLinks.js";
import { workoutDetail } from "../workouts.js";

const day = (exercises) => ({ key: "Mon", type: "Push", isRest: false, exercises });

describe("connect code", () => {
  it("is six characters a client can read out over the phone", () => {
    for (let i = 0; i < 50; i++) {
      const c = connectCode();
      expect(c).toHaveLength(6);
      expect(c).toMatch(/^[A-Z0-9]{6}$/);
      // Nothing that reads as something else: no O/0, no I/1.
      expect(c).not.toMatch(/[OI01]/);
      for (const ch of c) expect(CODE_ALPHABET).toContain(ch);
    }
  });

  it("is not the same code twice", () => {
    const seen = new Set(Array.from({ length: 200 }, () => connectCode()));
    expect(seen.size).toBeGreaterThan(190);
  });
});

describe("exercises the client added themselves", () => {
  it("are marked in what the coach receives", () => {
    const p = workoutPayload(day([
      { name: "Bench Press", sets: 3, reps: "8", weight: 60 },
      { name: "Evening run", sets: 1, mode: "time", secs: 1200, addedByClient: true },
    ]), { 0: 3, 1: 1 }, {}, "", "2026-09-23", "metric");
    expect(p.exercises[0].added_by_client).toBeUndefined();
    expect(p.exercises[1].added_by_client).toBe(true);
  });

  it("do not change anything for a plan the client only ticked off", () => {
    const p = workoutPayload(day([{ name: "Squat", sets: 3, reps: "5", weight: 100 }]), { 0: 3 }, {}, "", "2026-09-23", "metric");
    expect(JSON.stringify(p)).not.toContain("added_by_client");
  });

  it("reach the coach's dashboard tagged, with their own sets", () => {
    const w = workoutDetail({
      id: "s1", date: "2026-09-23", source: "link",
      submission: { id: "sub1", payload: { type: "Push", exercises: [
        { name: "Bench Press", sets_planned: 3, sets_done: 3, reps: "8", weight_target: 60 },
        { name: "Evening run", sets_planned: 1, sets_done: 1, mode: "time", secs_target: 1200, added_by_client: true, sets: [{ n: 1, done: true, secs: 1380 }] },
      ] } },
    });
    expect(w.exercises[0].addedByClient).toBe(false);
    const run = w.exercises[1];
    expect(run.addedByClient).toBe(true);
    expect(run.timed).toBe(true);
    expect(run.sets[0].t).toBe("23 min");
  });
});
