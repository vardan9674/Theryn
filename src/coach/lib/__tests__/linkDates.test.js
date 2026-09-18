// Coaches and clients are in India (UTC+5:30). link_submit stores its own UTC
// date, so anything sent between midnight and 5:30 am lands on the day before.
process.env.TZ = "Asia/Kolkata";
import { describe, it, expect } from "vitest";
import { submissionDate, linkClientData, planUnits, workoutPayload, todayFromPlan } from "../clientLinks.js";

// 19 Sep 2026, 03:10 IST = 18 Sep 2026, 21:40 UTC
const EARLY = "2026-09-18T21:40:00.000Z";

describe("submissionDate", () => {
  it("uses the client's local_date when the server clamped to its UTC day", () => {
    expect(submissionDate({ submitted_at: EARLY, payload: { date: "2026-09-18", local_date: "2026-09-19" } })).toBe("2026-09-19");
  });
  it("recovers older submissions without local_date from the time they were sent", () => {
    expect(submissionDate({ submitted_at: EARLY, payload: { date: "2026-09-18" } })).toBe("2026-09-19");
  });
  it("keeps a past date the client picked on purpose", () => {
    expect(submissionDate({ submitted_at: "2026-09-19T06:00:00.000Z", payload: { date: "2026-09-15" } })).toBe("2026-09-15");
    expect(submissionDate({ submitted_at: EARLY, payload: { date: "2026-09-15", local_date: "2026-09-15" } })).toBe("2026-09-15");
  });
  it("ignores a local_date far from the server's date", () => {
    expect(submissionDate({ submitted_at: "2026-09-19T06:00:00.000Z", payload: { date: "2026-09-19", local_date: "2026-01-01" } })).toBe("2026-09-19");
  });
  it("afternoon submissions are unchanged", () => {
    expect(submissionDate({ submitted_at: "2026-09-19T10:00:00.000Z", payload: { date: "2026-09-19" } })).toBe("2026-09-19");
  });
});

describe("workout payload for another day", () => {
  it("carries the chosen day as date and local_date", () => {
    const plan = { Mon: { type: "Push", exercises: ["Bench Press"] } };
    const mon = todayFromPlan(plan, new Date(2026, 8, 14, 12));
    const p = workoutPayload(mon, { 0: 3 }, {}, "", "2026-09-14");
    expect(p).toMatchObject({ date: "2026-09-14", local_date: "2026-09-14", day: "Mon", type: "Push" });
  });
});

describe("linkClientData", () => {
  const subs = [
    { id: "m2", kind: "measurements", submitted_at: "2026-09-18T04:00:00.000Z", payload: { date: "2026-09-18", unit: "imperial", weight: 154, waist: 30 } },
    { id: "m1", kind: "measurements", submitted_at: "2026-09-01T04:00:00.000Z", payload: { date: "2026-09-01", unit: "metric", weight: 72, waist: 80 } },
    { id: "w1", kind: "workout", submitted_at: EARLY, payload: { date: "2026-09-18", type: "Push", exercises: [{ name: "Bench Press", sets_planned: 3, sets_done: 3, reps: "8" }] } },
  ];
  it("puts every entry in the coach's units", () => {
    const d = linkClientData(subs, { plan: { Mon: { type: "Push", exercises: [], units: "imperial" } }, coachUnits: "metric" });
    expect(d.unitSystem).toBe("metric");
    expect(d.measurements.map((m) => [m.weight, m.waist, m.unit])).toEqual([[69.9, 76.2, "cm"], [72, 80, "cm"]]);
    expect(d.weights.map((w) => w.weight)).toEqual([69.9, 72]);
  });
  it("defaults to imperial when the coach's units are unknown", () => {
    expect(linkClientData(subs).unitSystem).toBe("imperial");
    expect(linkClientData([], { coachUnits: "metric" }).unitSystem).toBe("metric");
  });
  it("dates workouts on the client's day", () => {
    expect(linkClientData(subs).history[0].date).toBe("2026-09-19");
  });
  it("reads plan units", () => {
    expect(planUnits({ Tue: { units: "imperial" } })).toBe("imperial");
    expect(planUnits({ Mon: { type: "Push" } })).toBe(null);
    expect(planUnits(null)).toBe(null);
  });
});
