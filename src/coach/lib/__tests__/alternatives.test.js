// Coach-set alternatives survive every path from the plan editor to the athlete.
import { describe, it, expect } from "vitest";
import { toTemplates } from "../../pages/PlanEditor.jsx";
import { planToTemplateDays, templateDaysToPlan } from "../manualTemplates.js";
import { cleanAlternatives, normalizeExercise } from "../clientLinks.js";
import { todayFromPlan } from "../clientLinks.js";

const day = (exercises) => ({ Mon: { type: "Push", exercises }, Tue: { type: "Rest", exercises: [] }, Wed: { type: "Rest", exercises: [] }, Thu: { type: "Rest", exercises: [] }, Fri: { type: "Rest", exercises: [] }, Sat: { type: "Rest", exercises: [] }, Sun: { type: "Rest", exercises: [] } });
const editorEx = (over = {}) => ({ _key: "ex1", name: "Barbell Bench Press", coachNote: "", alternatives: ["Dumbbell Bench Press", "Push-Up"], mode: "reps", superset: null, rest: null, same: true, rows: [{ _k: "s1", reps: "8", weight: "60", secs: "", kind: null }], ...over });

describe("cleanAlternatives", () => {
  it("trims, drops blanks and repeats, and never repeats the exercise itself", () => {
    expect(cleanAlternatives([" Push-Up ", "push-up", "", null, "Bench"], "bench")).toEqual(["Push-Up"]);
  });
  it("keeps at most four", () => {
    expect(cleanAlternatives(["a", "b", "c", "d", "e"]).length).toBe(4);
  });
  it("nothing in, nothing out", () => {
    expect(cleanAlternatives(undefined)).toEqual([]);
  });
});

describe("through the coach's plan", () => {
  it("editor → plan JSON keeps them", () => {
    const t = toTemplates(day([editorEx()]), "imperial");
    expect(t.Mon.exercises[0].alternatives).toEqual(["Dumbbell Bench Press", "Push-Up"]);
  });
  it("an exercise with no alternatives has no extra field", () => {
    expect(toTemplates(day([editorEx({ alternatives: [] })]), "imperial").Mon.exercises[0].alternatives).toBeUndefined();
  });
  it("saved plan round-trip (template rows → plan)", () => {
    const rows = planToTemplateDays(toTemplates(day([editorEx()]), "imperial"), "imperial");
    expect(rows[0].exercises[0].extra.alternatives).toEqual(["Dumbbell Bench Press", "Push-Up"]);
    expect(templateDaysToPlan(rows, "imperial").Mon.exercises[0].alternatives).toEqual(["Dumbbell Bench Press", "Push-Up"]);
  });
  it("alternatives ride alongside timed settings and rest", () => {
    const rows = planToTemplateDays(toTemplates(day([editorEx({ mode: "time", rest: 60, rows: [{ _k: "s1", reps: "", weight: "", secs: "0:45", kind: null }] })]), "imperial"), "imperial");
    const back = templateDaysToPlan(rows, "imperial").Mon.exercises[0];
    expect(back.alternatives).toEqual(["Dumbbell Bench Press", "Push-Up"]);
    expect(back).toMatchObject({ mode: "time", rest: 60 });
  });
  it("the client link page receives them", () => {
    const plan = toTemplates(day([editorEx()]), "imperial");
    expect(normalizeExercise(plan.Mon.exercises[0]).alternatives).toEqual(["Dumbbell Bench Press", "Push-Up"]);
    // a Monday, so todayFromPlan returns the Monday plan
    const today = todayFromPlan(plan, new Date("2026-09-21T10:00:00"));
    expect(today.exercises[0].alternatives).toEqual(["Dumbbell Bench Press", "Push-Up"]);
  });
});
