import { describe, it, expect } from "vitest";
import { convertWeight, convertLength, convertPlan, convertSubmission, planUnits } from "../units.js";
import { linkClientData, workoutPayload, todayFromPlan } from "../clientLinks.js";
import { buildNotifications } from "../notifications.js";

describe("convertWeight / convertLength", () => {
  it("rounds gym weights to the nearest half and passes same-unit values through", () => {
    expect(convertWeight(60, "metric", "imperial")).toBe(132.5);
    expect(convertWeight(135, "imperial", "metric")).toBe(61);
    expect(convertWeight(62.3, "metric", "metric")).toBe(62.3);
    expect(convertWeight("", "metric", "imperial")).toBe(null);
    expect(convertWeight("abc", "metric", "imperial")).toBe(null);
  });
  it("body weight to a tenth, lengths to a tenth", () => {
    expect(convertWeight(154, "imperial", "metric", 0.1)).toBe(69.9);
    expect(convertLength(30, "imperial", "metric")).toBe(76.2);
    expect(convertLength(80, "metric", "imperial")).toBe(31.5);
  });
});

describe("convertPlan", () => {
  const plan = { Mon: { type: "Push", units: "metric", exercises: [{ name: "Bench", sets: 3, weight: 60 }, "Dips"] }, Tue: { type: "Rest", exercises: [] } };
  it("coach types kg, US client sees lb, and every day is stamped", () => {
    const lb = convertPlan(plan, "imperial");
    expect(lb.Mon.exercises[0].weight).toBe(132.5);
    expect(lb.Mon.exercises[1]).toBe("Dips");
    expect(planUnits(lb)).toBe("imperial");
    expect(lb.Tue.units).toBe("imperial");
  });
  it("an unstamped plan is taken to be in assumeFrom", () => {
    const un = { Mon: { type: "Push", exercises: [{ name: "Bench", weight: 135 }] } };
    expect(convertPlan(un, "metric", { assumeFrom: "imperial" }).Mon.exercises[0].weight).toBe(61);
    expect(convertPlan(un, "metric", { assumeFrom: "metric" }).Mon.exercises[0].weight).toBe(135);
  });
  it("round-trips a coach's kg target through a client's lb", () => {
    const back = convertPlan(convertPlan(plan, "imperial"), "metric");
    expect(back.Mon.exercises[0].weight).toBe(60);
  });
});

describe("a US client and an Indian coach", () => {
  const plan = { Mon: { type: "Push", units: "metric", exercises: [{ name: "Bench Press", sets: 3, reps: "8", weight: 60 }] } };
  it("the client sends lb, the coach reads kg", () => {
    const lbPlan = convertPlan(plan, "imperial");
    const mon = todayFromPlan(lbPlan, new Date(2026, 8, 14, 12));
    const payload = workoutPayload(mon, { 0: 3 }, { 0: "140" }, "", "2026-09-14", "imperial");
    expect(payload.weight_unit).toBe("imperial");
    expect(payload.exercises[0]).toMatchObject({ weight_target: 132.5, weight_used: 140 });
    const sub = { id: "w", kind: "workout", submitted_at: "2026-09-14T12:00:00.000Z", payload };
    const d = linkClientData([sub], { plan, coachUnits: "metric" });
    expect(d.submissions[0].payload.exercises[0]).toMatchObject({ weight_target: 60, weight_used: 63.5 });
    expect(d.history[0].exercises[0].sets[0].w).toBe("63.5");
  });
  it("older workouts without weight_unit are read in the plan's units", () => {
    const sub = { id: "w", kind: "workout", submitted_at: "2026-09-14T12:00:00.000Z", payload: { date: "2026-09-14", exercises: [{ name: "Bench Press", sets_planned: 3, sets_done: 3, weight_used: 60 }] } };
    expect(linkClientData([sub], { plan, coachUnits: "imperial" }).submissions[0].payload.exercises[0].weight_used).toBe(132.5);
  });
  it("measurements in lb and inches show in kg and cm, notifications too", () => {
    const m = { id: "m", kind: "measurements", submitted_at: "2026-09-14T12:00:00.000Z", manual_client_id: "x", payload: { date: "2026-09-14", unit: "imperial", weight: 154, waist: 30 } };
    expect(convertSubmission(m, "metric").payload).toMatchObject({ unit: "metric", weight: 69.9, waist: 76.2 });
    const [n] = buildNotifications({ submissions: [m], clients: [{ athlete_id: "manual:x", athlete_name: "Sam Lee" }], units: "metric" });
    expect(n.body).toBe("69.9 kg · waist 76.2 cm");
  });
});
