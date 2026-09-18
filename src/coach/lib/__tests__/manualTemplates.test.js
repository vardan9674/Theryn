import { describe, it, expect } from "vitest";
import { templateDaysToPlan, planTemplate, stampTemplate, manualPlanFromTemplate } from "../manualTemplates.js";
import { convertPlan } from "../units.js";
import { todayFromPlan } from "../clientLinks.js";

const days = [
  { day_index: 0, workout_type: "Push", exercises: [{ exercise_name: "Bench Press", target_sets: 4, target_reps: "6-8", notes: "Pause on the chest" }] },
  { day_index: 3, workout_type: "Legs", exercises: [{ exercise_name: "Back Squat", target_sets: 5, target_reps: "5" }] },
];
const tpl = { id: "t1", name: "PPL Intermediate", version: 3 };

describe("saved plans for name-only clients", () => {
  it("builds the week, stamped with the plan and the coach's units", () => {
    const plan = manualPlanFromTemplate(tpl, days, "metric");
    expect(plan.Mon).toMatchObject({ type: "Push", units: "metric" });
    expect(plan.Mon.exercises[0]).toEqual({ name: "Bench Press", sets: 4, reps: "6-8", coachNote: "Pause on the chest" });
    expect(plan.Tue.type).toBe("Rest");
    expect(planTemplate(plan)).toEqual({ id: "t1", name: "PPL Intermediate", version: 3, overridden: false });
  });
  it("the link page still reads the week (the stamp is ignored there)", () => {
    const plan = manualPlanFromTemplate(tpl, days, "metric");
    const mon = todayFromPlan(convertPlan(plan, "imperial"), new Date(2026, 8, 14, 12));
    expect(mon.type).toBe("Push");
    expect(mon.exercises[0].name).toBe("Bench Press");
  });
  it("taking the plan away keeps the week", () => {
    const plan = stampTemplate(manualPlanFromTemplate(tpl, days, "metric"), null);
    expect(planTemplate(plan)).toBe(null);
    expect(plan.Thu.exercises[0].name).toBe("Back Squat");
  });
  it("templateDaysToPlan fills rest days", () => {
    expect(Object.keys(templateDaysToPlan([]))).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  });
});
