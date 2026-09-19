// The per-set plan end to end: the coach's editor saves it, the client's link
// reads it, the client sends a workout, and the coach reads that back.
import { describe, it, expect } from "vitest";
import { toTemplates } from "../../pages/PlanEditor.jsx";
import { todayFromPlan, workoutPayload, submissionToHistory, doneSets } from "../clientLinks.js";
import { workoutDetail } from "../workouts.js";
import { convertPlan, convertSubmission } from "../units.js";
import { setsReps } from "../format.js";
import { buildPlanSheets } from "../exportPlan.ts";

const blank = { type: "Rest", exercises: [] };
const days = {
  Mon: { type: "Push", exercises: [
    { name: "Bench Press", coachNote: "Pause at the bottom", rows: [{ reps: "12", weight: "60" }, { reps: "10", weight: "65" }, { reps: "8", weight: "70" }] },
    { name: "Dips", coachNote: "", rows: [{ reps: "10", weight: "" }, { reps: "10", weight: "" }] },
    { name: "  ", coachNote: "", rows: [{ reps: "", weight: "" }] },
  ] },
  Tue: blank, Wed: blank, Thu: blank, Fri: blank, Sat: blank, Sun: blank,
};

describe("coach's editor → plan JSON", () => {
  const plan = toTemplates(days, "metric");
  it("keeps per-set targets only where they differ, and drops unnamed exercises", () => {
    expect(plan.Mon.exercises).toEqual([
      { name: "Bench Press", sets: 3, reps: "12/10/8", weight: 60, setList: [{ reps: "12", weight: 60 }, { reps: "10", weight: 65 }, { reps: "8", weight: 70 }], coachNote: "Pause at the bottom" },
      { name: "Dips", sets: 2, reps: "10" },
    ]);
    expect(plan.Mon.units).toBe("metric");
  });
  it("reads well on the Plan tab and in Excel", () => {
    expect(setsReps(plan.Mon.exercises[0], "kg")).toBe("3 × 12/10/8 · 60–70 kg");
    expect(setsReps(plan.Mon.exercises[1], "kg")).toBe("2 × 10");
    const [sheet] = buildPlanSheets(plan, { unit: "kg" });
    expect(sheet.rows[1]).toEqual([1, "Bench Press", "3", "12/10/8", "60/65/70", "Pause at the bottom"]);
  });
});

describe("client's link → coach", () => {
  const plan = toTemplates(days, "metric");
  const mon = todayFromPlan(plan, new Date(2026, 8, 14, 12));
  it("the link sees each set's own target", () => {
    expect(mon.exercises[0].setList).toEqual([{ reps: "12", weight: 60 }, { reps: "10", weight: 65 }, { reps: "8", weight: 70 }]);
    expect(mon.exercises[0].sets).toBe(3);
  });
  it("ticked as planned: the coach sees each planned set", () => {
    const payload = workoutPayload(mon, { 0: 3 }, {}, "", "2026-09-14", "metric");
    expect(payload.exercises[0].plan_sets).toEqual([{ r: "12", w: 60 }, { r: "10", w: 65 }, { r: "8", w: 70 }]);
    expect(doneSets(payload.exercises[0])).toEqual([{ w: "60", r: "12" }, { w: "65", r: "10" }, { w: "70", r: "8" }]);
    const sub = { id: "s", kind: "workout", submitted_at: "2026-09-14T12:00:00.000Z", payload };
    expect(workoutDetail({ ...submissionToHistory(sub), submission: sub }).exercises[0].sets).toEqual([
      { w: "60", r: "12", changed: false }, { w: "65", r: "10", changed: false }, { w: "70", r: "8", changed: false },
    ]);
  });
  it("a change is judged against that set's own target", () => {
    const payload = workoutPayload(mon, { 0: 3 }, { 0: { 2: { r: "6" } } }, "", "2026-09-14", "metric");
    const sub = { id: "s", kind: "workout", submitted_at: "2026-09-14T12:00:00.000Z", payload };
    expect(workoutDetail({ ...submissionToHistory(sub), submission: sub }).exercises[0].sets).toEqual([
      { w: "60", r: "12", changed: false }, { w: "65", r: "10", changed: false }, { w: "70", r: "6", changed: true },
    ]);
  });
  it("per-set weights convert between kg and lb, both in the plan and in what comes back", () => {
    const lb = convertPlan(plan, "imperial");
    expect(lb.Mon.exercises[0].setList.map((s) => s.weight)).toEqual([132.5, 143.5, 154.5]);
    const payload = workoutPayload(todayFromPlan(lb, new Date(2026, 8, 14, 12)), { 0: 3 }, {}, "", "2026-09-14", "imperial");
    const back = convertSubmission({ kind: "workout", payload }, "metric").payload.exercises[0];
    expect(back.plan_sets.map((s) => s.w)).toEqual([60, 65, 70]);
  });
});
