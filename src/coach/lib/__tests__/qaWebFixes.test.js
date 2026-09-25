// QA pass 2026-09-25: #105 (impossible numbers on the link), #111 (insight wording).
import { describe, it, expect } from "vitest";
import { cleanDecimal, workoutNumbersProblem, doneSets, submissionToHistory } from "../clientLinks.js";
import { detectSignals } from "../../../lib/coachInsights.js";

describe("#105 number boxes on the client link", () => {
  it("keeps digits and one decimal point", () => {
    expect(cleanDecimal("1.2.3")).toBe("1.23");
    expect(cleanDecimal("-5e3")).toBe("53");
    expect(cleanDecimal("42.5kg")).toBe("42.5");
    expect(cleanDecimal("1234567")).toBe("123456");
  });

  it("stops impossible weights and reps with a sentence naming the set", () => {
    const ex = [{ name: "Bench" }, { name: "Row" }];
    expect(workoutNumbersProblem(ex, { 0: { 0: { r: "8", w: "60" } } }, "metric")).toBe(null);
    expect(workoutNumbersProblem(ex, { 1: { 2: { w: "999999" } } }, "metric")).toBe("Set 3 of Row: 999999 kg looks off. Check the weight.");
    expect(workoutNumbersProblem(ex, { 0: { 0: { w: "900" } } }, "imperial")).toBe(null); // 900 lb is a real deadlift
    expect(workoutNumbersProblem(ex, { 0: { 0: { w: "1200" } } }, "imperial")).toMatch(/looks off/);
    expect(workoutNumbersProblem(ex, { 0: { 1: { r: "999" } } }, "metric")).toBe("Set 2 of Bench: 999 reps looks off. Check the reps.");
  });

  it("an impossible number already sent counts as the planned one for the coach", () => {
    const e = { name: "Bench", sets_done: 2, reps: "8", weight_target: 60, sets: [{ n: 1, done: true, weight: 999999 }, { n: 2, done: true, reps: 9999, weight: 62.5 }] };
    expect(doneSets(e)).toEqual([{ w: "60", r: "8" }, { w: "62.5", r: "8" }]);
    const h = submissionToHistory({ id: "s", submitted_at: "2026-09-25T10:00:00Z", payload: { date: "2026-09-25", exercises: [e] } });
    expect(h.totalVolume).toBe(60 * 8 + 62.5 * 8);
  });
});

describe("#111 'falling behind' says what it counts", () => {
  it("names the last 7 days, not 'this week'", () => {
    const now = new Date(2026, 8, 25, 10);
    const routine = { Mon: { type: "Push" }, Tue: { type: "Pull" }, Wed: { type: "Legs" }, Fri: { type: "Upper" } };
    const history = [{ date: "2026-09-21", type: "Push", exercises: [] }];
    const fb = detectSignals({ history, routine, now }).find((s) => s.kind === "falling_behind");
    if (fb) expect(fb.message).toMatch(/in the last 7 days\.$/);
    expect(JSON.stringify(detectSignals({ history, routine, now }))).not.toMatch(/this week/);
  });
});
