import { describe, it, expect } from "vitest";
import { templateDaysToPlan, planToTemplateDays, manualPlanFromTemplate } from "../manualTemplates.js";
import { toTemplates } from "../../pages/PlanEditor.jsx";
import { planSets } from "../planSets.js";

// A week as the plan editor holds it: Monday has per-set targets, Tuesday is plain.
const row = (reps, weight) => ({ _k: Math.random().toString(36), reps, weight });
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function editorWeek() {
  const days = {};
  for (const d of DAYS) days[d] = { type: "Rest", exercises: [] };
  days.Mon = { type: "Push", exercises: [
    { _key: "a", name: "Bench Press", coachNote: "Pause on the chest", same: false, rows: [row("12", "60"), row("10", "65"), row("8", "70")] },
    { _key: "b", name: "Lateral Raise", coachNote: "", same: true, rows: [row("15", ""), row("15", ""), row("15", "")] },
  ] };
  days.Tue = { type: "Pull", exercises: [{ _key: "c", name: "Barbell Row", coachNote: "", same: true, rows: [row("8", "50"), row("8", "50")] }] };
  return days;
}

describe("saved plans keep per-set targets and weights", () => {
  it("round-trips editor → template rows → plan", () => {
    const plan = toTemplates(editorWeek(), "metric");
    const rows = planToTemplateDays(plan, "metric");
    expect(rows).toHaveLength(7);
    const bench = rows[0].exercises[0];
    expect(bench).toMatchObject({ exercise_name: "Bench Press", target_sets: 3, target_reps: "12/10/8", target_weight: 60, weight_unit: "kg", notes: "Pause on the chest" });
    expect(bench.set_list).toEqual([{ reps: "12", weight: 60 }, { reps: "10", weight: 65 }, { reps: "8", weight: 70 }]);
    expect(rows[0].exercises[1]).toMatchObject({ target_reps: "15", target_weight: null, set_list: null, weight_unit: null });
    expect(rows[1].exercises[0]).toMatchObject({ target_sets: 2, target_weight: 50, set_list: null });

    const back = templateDaysToPlan(rows, "metric");
    expect(planSets(back.Mon.exercises[0])).toEqual([{ reps: "12", weight: 60 }, { reps: "10", weight: 65 }, { reps: "8", weight: 70 }]);
    expect(back.Mon.exercises[0].coachNote).toBe("Pause on the chest");
    expect(planSets(back.Tue.exercises[0])).toEqual([{ reps: "8", weight: 50 }, { reps: "8", weight: 50 }]);
    expect(back.Wed).toEqual({ type: "Rest", exercises: [] });
  });

  it("reads weights in the coach's current units", () => {
    const rows = planToTemplateDays(toTemplates(editorWeek(), "metric"), "metric");
    const lb = templateDaysToPlan(rows, "imperial");
    expect(planSets(lb.Mon.exercises[0]).map((s) => s.weight)).toEqual([132.5, 143.5, 154.5]);
    expect(lb.Tue.exercises[0].weight).toBe(110);
  });

  it("gives name-only clients the per-set week", () => {
    const rows = planToTemplateDays(toTemplates(editorWeek(), "imperial"), "imperial");
    const plan = manualPlanFromTemplate({ id: "t1", name: "PPL", version: 4 }, rows, "imperial");
    expect(plan.Mon.units).toBe("imperial");
    expect(plan.Mon.template).toEqual({ id: "t1", name: "PPL", version: 4, overridden: false });
    expect(plan.Mon.exercises[0].setList).toHaveLength(3);
    expect(plan.Mon.exercises[0].reps).toBe("12/10/8");
  });

  it("keeps library links for exercises that were already there", () => {
    const prev = [{ day_index: 0, exercises: [{ exercise_name: "Bench Press", source_exercise_id: "ex-1", muscle_group: "Chest" }] }];
    const rows = planToTemplateDays(toTemplates(editorWeek(), "metric"), "metric", prev);
    expect(rows[0].exercises[0]).toMatchObject({ source_exercise_id: "ex-1", muscle_group: "Chest" });
    expect(rows[0].exercises[1].source_exercise_id).toBeUndefined();
  });

  it("reads old rows (no weight columns) as before", () => {
    const plan = templateDaysToPlan([{ day_index: 0, workout_type: "Push", exercises: [{ exercise_name: "Bench Press", target_sets: 4, target_reps: "6-8" }] }], "metric");
    expect(plan.Mon.exercises[0]).toEqual({ name: "Bench Press", sets: 4, reps: "6-8" });
  });
});

import { templateHasWorkouts } from "../manualTemplates.js";
describe("empty saved plans can't be given to clients", () => {
  it("needs a workout day with an exercise", () => {
    expect(templateHasWorkouts([])).toBe(false);
    expect(templateHasWorkouts([{ workout_type: "Push", exercises: [] }, { workout_type: "Rest", exercises: [] }])).toBe(false);
    expect(templateHasWorkouts([{ workout_type: "Push", exercises: [{ exercise_name: "Bench Press" }] }])).toBe(true);
  });
});
