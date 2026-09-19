import { describe, it, expect } from "vitest";
import { workoutPayload, submissionToHistory, doneSets, todayFromPlan } from "../clientLinks.js";
import { workoutDetail } from "../workouts.js";
import { convertSubmission } from "../units.js";

const plan = { Mon: { type: "Push", exercises: [{ name: "Bench Press", sets: 3, reps: "8-10", weight: 60 }, { name: "Dips", sets: 2, reps: "12" }] } };
const mon = todayFromPlan(plan, new Date(2026, 8, 14, 12));

describe("per-set reps and weight from the link page", () => {
  it("ticking only sends no per-set detail (as planned)", () => {
    const p = workoutPayload(mon, { 0: 3, 1: 2 }, {}, "", "2026-09-14", "metric");
    expect(p.exercises[0].sets).toBeUndefined();
    expect(doneSets(p.exercises[0])).toEqual([{ w: "60", r: "8" }, { w: "60", r: "8" }, { w: "60", r: "8" }]);
  });
  it("typed sets are sent, blanks mean as planned", () => {
    const log = { 0: { 1: { r: "7" }, 2: { r: "6", w: "55" } } };
    const p = workoutPayload(mon, { 0: 3 }, log, "", "2026-09-14", "metric");
    expect(p.exercises[0].sets).toEqual([{ n: 1, done: true }, { n: 2, done: true, reps: 7 }, { n: 3, done: true, reps: 6, weight: 55 }]);
    expect(p.exercises[0].weight_used).toBe(55);
    expect(doneSets(p.exercises[0])).toEqual([{ w: "60", r: "8" }, { w: "60", r: "7" }, { w: "55", r: "6" }]);
  });
  it("the coach sees each set and which ones changed", () => {
    const log = { 0: { 1: { r: "9" }, 2: { r: "6", w: "55" } } };
    const payload = workoutPayload(mon, { 0: 3 }, log, "", "2026-09-14", "metric");
    const sub = { id: "s", kind: "workout", submitted_at: "2026-09-14T12:00:00.000Z", payload };
    const d = workoutDetail({ ...submissionToHistory(sub), submission: sub });
    expect(d.exercises[0].sets).toEqual([
      { w: "60", r: "8-10", changed: false },
      { w: "60", r: "9", changed: false },
      { w: "55", r: "6", changed: true },
    ]);
    expect(d.exercises[0]).toMatchObject({ done: 3, planned: 3 });
  });
  it("per-set weights convert with the rest (client in lb, coach in kg)", () => {
    const lbMon = todayFromPlan({ Mon: { type: "Push", exercises: [{ name: "Bench Press", sets: 2, reps: "8", weight: 135 }] } }, new Date(2026, 8, 14, 12));
    const payload = workoutPayload(lbMon, { 0: 2 }, { 0: { 1: { w: "140" } } }, "", "2026-09-14", "imperial");
    const kg = convertSubmission({ kind: "workout", payload }, "metric").payload.exercises[0];
    expect(kg.sets[1].weight).toBe(63.5);
    expect(kg.weight_target).toBe(61);
  });
  it("older drafts with one weight per exercise still work", () => {
    expect(workoutPayload(mon, { 0: 3 }, { 0: "62.5" }, "", "2026-09-14").exercises[0].weight_used).toBe(62.5);
  });
});

import { lastSetsFor, setsLine } from "../workouts.js";
describe("last time", () => {
  const history = [
    { date: "2026-09-10", exercises: [{ name: "Bench Press", sets: [{ w: "40", r: "8" }] }] },
    { date: "2026-09-17", exercises: [{ name: "bench press", sets: [{ w: "45", r: "10" }, { w: "40", r: "6" }] }, { name: "Dips", sets: [{ w: "", r: "12" }] }] },
  ];
  it("finds the newest session with the exercise, any case", () => {
    expect(lastSetsFor(history, "Bench Press")).toEqual({ date: "2026-09-17", sets: [{ w: "45", r: "10" }, { w: "40", r: "6" }] });
    expect(lastSetsFor(history, "Squat")).toBe(null);
  });
  it("reads as reps × weight", () => {
    expect(setsLine(lastSetsFor(history, "Bench Press").sets)).toBe("10×45, 6×40");
    expect(setsLine(lastSetsFor(history, "Dips").sets)).toBe("12");
  });
});

import { buildNotifications } from "../notifications.js";
describe("how did it feel", () => {
  it("is sent only when it's one of the three, and reaches the coach", () => {
    expect(workoutPayload(mon, { 0: 3 }, {}, "", "2026-09-14", "metric", "hard").feel).toBe("hard");
    expect(workoutPayload(mon, { 0: 3 }, {}, "", "2026-09-14", "metric", "brutal").feel).toBeUndefined();
    expect(workoutPayload(mon, { 0: 3 }, {}, "", "2026-09-14", "metric").feel).toBeUndefined();
    const payload = workoutPayload(mon, { 0: 3 }, {}, "Shoulder tight", "2026-09-14", "metric", "hard");
    const sub = { id: "s", kind: "workout", submitted_at: "2026-09-14T12:00:00.000Z", manual_client_id: "x", payload };
    expect(workoutDetail({ ...submissionToHistory(sub), submission: sub }).feel).toBe("hard");
    const [n] = buildNotifications({ submissions: [sub], clients: [{ athlete_id: "manual:x", athlete_name: "Sam Lee" }] });
    expect(n.body).toBe('3 of 5 sets · felt hard · "Shoulder tight"');
  });
});
