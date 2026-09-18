import { describe, it, expect } from "vitest";
import { generateToken, hashToken, linkUrl, shareMessage, whatsappUrl, todayFromPlan, validateMeasurements, measurementsPayload, workoutPayload, submissionToMeasurement, submissionToHistory } from "../clientLinks.js";

const plan = {
  Mon: { type: "Push", exercises: [{ name: "Bench Press", sets: 3, reps: "8-10", weight: 40, coachNote: "Slow down" }, "Lateral Raise"] },
  Tue: { type: "Rest", exercises: [] },
  Wed: { type: "Legs", exercises: ["Squat"] },
  Thu: { type: "Rest", exercises: [] }, Fri: { type: "Rest", exercises: [] }, Sat: { type: "Rest", exercises: [] }, Sun: { type: "Rest", exercises: [] },
};

describe("tokens and urls", () => {
  it("makes url-safe tokens of the right size and hashes them", async () => {
    const t = generateToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const h = await hashToken(t);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashToken(t)).toBe(h);
    expect(await hashToken(generateToken())).not.toBe(h);
  });
  it("builds link, message and whatsapp url", () => {
    const url = linkUrl("abc", "https://theryn.fit/");
    expect(url).toBe("https://theryn.fit/f/abc");
    expect(shareMessage("Priya", url)).toContain("Hi Priya,");
    expect(shareMessage("", url)).toContain("Hi,");
    expect(whatsappUrl("a b")).toBe("https://wa.me/?text=a%20b");
  });
});

describe("todayFromPlan", () => {
  it("returns today's exercises normalized", () => {
    const mon = new Date(2026, 8, 14, 12); // Monday
    const t = todayFromPlan(plan, mon);
    expect(t.isRest).toBe(false);
    expect(t.type).toBe("Push");
    expect(t.exercises[0]).toEqual({ name: "Bench Press", sets: 3, reps: "8-10", weight: 40, note: "Slow down" });
    expect(t.exercises[1].name).toBe("Lateral Raise");
  });
  it("finds the next training day on a rest day", () => {
    const tue = new Date(2026, 8, 15, 12);
    const t = todayFromPlan(plan, tue);
    expect(t.isRest).toBe(true);
    expect(t.next).toEqual({ key: "Wed", type: "Legs" });
  });
  it("handles no plan", () => {
    expect(todayFromPlan(null).isRest).toBe(true);
  });
});

describe("measurements validation", () => {
  it("requires the requested fields", () => {
    const r = validateMeasurements({ chest: "" }, "metric", ["chest"]);
    expect(r.ok).toBe(false); expect(r.field).toBe("chest");
  });
  it("rejects out of range values per unit", () => {
    expect(validateMeasurements({ waist: "300" }, "metric", []).ok).toBe(false);
    expect(validateMeasurements({ waist: "30" }, "imperial", []).ok).toBe(true);
    expect(validateMeasurements({ weight: "10" }, "metric", []).ok).toBe(false);
    expect(validateMeasurements({ weight: "150" }, "imperial", []).ok).toBe(true);
  });
  it("builds a payload with numbers and drops blanks", () => {
    expect(measurementsPayload({ chest: "96.5", waist: "", weight: "70" }, "metric", "2026-09-14")).toEqual({ unit: "metric", date: "2026-09-14", local_date: "2026-09-14", weight: 70, chest: 96.5 });
  });
});

describe("workout payload and submission shapes", () => {
  it("caps ticks at planned sets and carries weights", () => {
    const today = todayFromPlan(plan, new Date(2026, 8, 14, 12));
    const p = workoutPayload(today, { 0: 5, 1: 2 }, { 0: "45" }, "felt good", "2026-09-14");
    expect(p.exercises[0]).toMatchObject({ name: "Bench Press", sets_done: 3, weight_used: 45, weight_target: 40 });
    expect(p.exercises[1]).toMatchObject({ name: "Lateral Raise", sets_done: 2, weight_used: null });
    expect(p.note).toBe("felt good");
  });
  it("maps submissions back to dashboard shapes", () => {
    const m = submissionToMeasurement({ id: "s1", submitted_at: "2026-09-14T10:00:00Z", payload: { unit: "metric", date: "2026-09-14", chest: 96, weight: 70 } });
    expect(m).toMatchObject({ date: "2026-09-14", unit: "cm", chest: 96, weight: 70, source: "link" });
    const h = submissionToHistory({ id: "s2", submitted_at: "2026-09-14T18:00:00Z", payload: { date: "2026-09-14", type: "Push", exercises: [{ name: "Bench Press", sets_planned: 3, sets_done: 2, reps: "8-10", weight_used: 45 }, { name: "Skipped", sets_planned: 3, sets_done: 0 }] } });
    expect(h.exercises.length).toBe(1);
    expect(h.totalSets).toBe(2);
    expect(h.totalVolume).toBe(2 * 45 * 8);
    expect(h.plannedSets).toBe(6);
  });
});
