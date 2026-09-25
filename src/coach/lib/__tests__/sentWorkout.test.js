// Tapping "Edit workout" has to put the client back in front of what they
// sent — on any phone, including one that never had it typed into it.
import { describe, it, expect } from "vitest";
import { editStateFromPayload } from "../../../link/sentWorkout.js";

const plan = [
  { name: "Deadlift", sets: 3 },
  { name: "Pull-Up", sets: 3 },
  { name: "Barbell Row", sets: 3 },
];

const sent = {
  date: "2026-09-22", day: "Tue", type: "Pull", weight_unit: "metric", note: "back felt good", feel: "hard",
  exercises: [
    { name: "Deadlift", sets_planned: 3, sets_done: 3, reps: "5", weight_target: 80,
      sets: [{ n: 1, done: true, reps: 5, weight: 80 }, { n: 2, done: true, reps: 5, weight: 85 }, { n: 3, done: true, reps: 4, weight: 85 }] },
    { name: "Pull-Up", sets_planned: 3, sets_done: 2, reps: "8" },
    { name: "Barbell Row", sets_planned: 3, sets_done: 0, reps: "10" },
  ],
};

describe("reopening what was sent", () => {
  const s = editStateFromPayload(sent, plan, "metric");

  it("ticks each exercise where it was left", () => {
    expect(s.ticks).toEqual({ 0: 3, 1: 2, 2: 0 });
  });

  it("puts every number back in its own box", () => {
    expect(s.log[0]).toEqual({ 0: { r: "5", w: "80" }, 1: { r: "5", w: "85" }, 2: { r: "4", w: "85" } });
  });

  it("remembers what was skipped, and the note and feel", () => {
    expect(s.skipped).toEqual({ 2: true });
    expect(s.note).toBe("back felt good");
    expect(s.feel).toBe("hard");
  });

  it("has nothing of their own to add back", () => {
    expect(s.extras).toEqual([]);
  });
});

describe("units", () => {
  it("shows kilos as pounds for a client reading in pounds", () => {
    const s = editStateFromPayload(sent, plan, "imperial");
    expect(Number(s.log[0][0].w)).toBe(176.5); // 80 kg, rounded the way the app shows weights
  });

  it("leaves numbers alone when the units match", () => {
    expect(editStateFromPayload(sent, plan, "metric").log[0][1].w).toBe("85");
  });
});

describe("what the client added themselves", () => {
  const withExtra = {
    ...sent,
    exercises: [
      ...sent.exercises,
      { name: "Evening run", sets_planned: 1, sets_done: 1, mode: "time", secs_target: 1200, added_by_client: true, sets: [{ n: 1, done: true, secs: 1380 }] },
    ],
  };
  const s = editStateFromPayload(withExtra, plan, "metric");

  it("comes back as theirs, after the coach's exercises", () => {
    expect(s.extras).toEqual([{ name: "Evening run", sets: 1, mode: "time", secs: 1200 }]);
    expect(s.ticks[3]).toBe(1);          // the plan has 3, so theirs is the fourth
    expect(s.log[3]).toEqual({ 0: { s: "23:00" } });
  });
});

describe("older and awkward sends", () => {
  it("spreads a single weight across the sets that were done", () => {
    const old = { exercises: [{ name: "Deadlift", sets_planned: 3, sets_done: 2, reps: "5", weight_used: 70 }] };
    const s = editStateFromPayload(old, plan, "metric");
    expect(s.log[0]).toEqual({ 0: { w: "70" }, 1: { w: "70" } });
  });

  it("drops an exercise the coach has since taken off the plan", () => {
    const gone = { exercises: [{ name: "Shrugs", sets_planned: 3, sets_done: 3, reps: "10" }] };
    const s = editStateFromPayload(gone, plan, "metric");
    expect(s.ticks).toEqual({});
    expect(s.extras).toEqual([]);
  });

  it("lines up a plan that has the same exercise twice", () => {
    const twice = [{ name: "Deadlift", sets: 3 }, { name: "Deadlift", sets: 2 }];
    const p = { exercises: [{ name: "Deadlift", sets_planned: 3, sets_done: 3 }, { name: "Deadlift", sets_planned: 2, sets_done: 1 }] };
    expect(editStateFromPayload(p, twice, "metric").ticks).toEqual({ 0: 3, 1: 1 });
  });

  it("copes with nothing at all", () => {
    expect(editStateFromPayload(null, plan, "metric")).toEqual({ ticks: {}, log: {}, skipped: {}, note: "", feel: null, extras: [] });
    expect(editStateFromPayload({}, plan, "metric").ticks).toEqual({});
  });
});
