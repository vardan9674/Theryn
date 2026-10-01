import { describe, it, expect } from "vitest";
import { workoutDetail, mergeSameDay, partsLine, workoutSummary } from "../workouts.js";
import { coachDoneByIndex, movePayload, replacePayload, submissionDate } from "../clientLinks.js";

// The Oct 1 case: the coach ran the weights and logged the whole day as done;
// the client did the abs at home and sent those through the link.
const STRENGTH = ["Flat bench dumbbell press", "Butterfly", "Seated Overhead Press", "Lateral Raise", "Single Arm Overhead Extension", "Kick backs"];
const ABS = ["Leg raises", "Russian Twist", "Bicycle Crunch", "Banana Hold", "Plank"];
const ex = (name, done, planned = 3) => ({ name, sets_planned: planned, sets_done: done });
const coachSub = (exercises) => ({ id: "coach1", kind: "workout", submitted_at: "2026-10-01T01:26:52Z", payload: { date: "2026-10-01", local_date: "2026-10-01", day: "Thu", type: "Push", logged_by: "coach", exercises, note: "" } });
const clientSub = { id: "asha1", kind: "workout", submitted_at: "2026-10-01T07:45:16Z", payload: { date: "2026-10-01", local_date: "2026-10-01", day: "Thu", type: "Push", feel: "medium", note: "Russian twist without weight", exercises: [ex("Leg raises", 2), ex("Russian Twist", 2), ex("Bicycle Crunch", 3), ex("Banana Hold", 2), ex("Plank", 2)] } };
const detail = (sub) => workoutDetail({ id: sub.id, date: sub.payload.date, source: "link", submission: sub, exercises: [] });

describe("a day logged in two parts", () => {
  it("reads as one day, each exercise counted once, from whoever did it last", () => {
    const coach = coachSub([...STRENGTH.map((n) => ex(n, 3)), ...ABS.map((n) => ex(n, 3))]);
    const [day] = mergeSameDay([detail(clientSub), detail(coach)]);
    expect(day.merged).toBe(true);
    expect(day.parts.map((p) => p.submissionId)).toEqual(["coach1", "asha1"]);
    expect(day.exercises.map((e) => e.name)).toEqual([...STRENGTH, ...ABS]);
    expect(day.exercises.slice(0, 6).every((e) => e.by === "coach")).toBe(true);
    expect(day.exercises.slice(6).every((e) => e.by === "client")).toBe(true);
    expect(workoutSummary(day)).toBe("29 of 33 sets");
    expect(partsLine(day, "Asha")).toBe("6 logged by you, 5 by Asha");
    expect(day.feel).toBe("medium");
    expect(day.notes).toEqual([{ byCoach: false, text: "Russian twist without weight" }]);
  });

  it("gives the same day when the coach's part leaves the abs unticked", () => {
    const coach = coachSub([...STRENGTH.map((n) => ex(n, 3)), ...ABS.map((n) => ex(n, 0))]);
    const [day] = mergeSameDay([detail(clientSub), detail(coach)]);
    expect(workoutSummary(day)).toBe("29 of 33 sets");
    expect(day.exercises.find((e) => e.name === "Plank")).toMatchObject({ done: 2, by: "client" });
  });

  it("leaves a single workout, and different workout types on one day, alone", () => {
    const legs = { ...clientSub, id: "legs", payload: { ...clientSub.payload, type: "Legs" } };
    const out = mergeSameDay([detail(clientSub), detail(legs)]);
    expect(out).toHaveLength(2);
    expect(out.some((w) => w.merged)).toBe(false);
  });
});

describe("the client's link after the coach logged part of the day", () => {
  const plan = [...STRENGTH, ...ABS].map((name) => ({ name, sets: 3 }));
  it("knows which exercises the coach already has", () => {
    const entries = [{ by_coach: true, payload: { logged_by: "coach", exercises: [...STRENGTH.map((n) => ex(n, 3)), ...ABS.map((n) => ex(n, 0))] } }];
    expect(coachDoneByIndex(entries, plan)).toEqual({ 0: 3, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 });
  });
  it("matches a swapped exercise to the plan's, and ignores the client's own sends", () => {
    const entries = [
      { by_coach: true, payload: { exercises: [{ name: "Machine Fly", swapped_from: "Butterfly", sets_planned: 3, sets_done: 3 }] } },
      { by_coach: false, payload: { exercises: [ex("Plank", 3)] } },
    ];
    expect(coachDoneByIndex(entries, plan)).toEqual({ 1: 3 });
  });
});

describe("the coach moves or redoes a workout", () => {
  it("moves both dates and remembers where it was", () => {
    const p = movePayload(clientSub.payload, "2026-09-30", new Date("2026-10-02T10:00:00Z"));
    expect(p).toMatchObject({ date: "2026-09-30", local_date: "2026-09-30", day: "Wed", moved_from: "2026-10-01", moved_by_coach_at: "2026-10-02T10:00:00.000Z" });
    expect(submissionDate({ submitted_at: clientSub.submitted_at, payload: p })).toBe("2026-09-30");
    // Moving again keeps the first place it was logged.
    expect(movePayload(p, "2026-09-29").moved_from).toBe("2026-10-01");
    expect(() => movePayload(p, "")).toThrow();
  });
  it("redoes in place: keeps who sent it, the day, and the first version", () => {
    const next = { date: "2026-10-01", type: "Push", logged_by: "coach", exercises: [ex("Plank", 1)], note: "" };
    const p = replacePayload(clientSub.payload, next, new Date("2026-10-02T10:00:00Z"));
    expect(p.logged_by).toBeUndefined();
    expect(p.exercises).toEqual([ex("Plank", 1)]);
    expect(p.original_exercises).toEqual(clientSub.payload.exercises);
    expect(p.feel).toBe("medium");
    expect(p.local_date).toBe("2026-10-01");
    expect(replacePayload(coachSub([]).payload, next).logged_by).toBe("coach");
  });
});
