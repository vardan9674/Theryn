import { describe, it, expect } from "vitest";
import { buildPlanSheets, lastLiftedWeight, planFileName, safeSheetName, buildPlanWorkbook } from "../exportPlan";

const templates: any = {
  Mon: { type: "Push", exercises: [{ name: "Bench Press", sets: 4, reps: "8", coachNote: "Breathe out" }, "Lateral Raise"] },
  Tue: { type: "Rest", exercises: [] },
  Wed: { type: "Pull", exercises: [{ name: "Deadlift", sets: 3, reps: "5" }] },
  Thu: { type: "Legs", exercises: [] }, // no exercises → skipped
};
const history: any = [
  { date: "2026-09-01", exercises: [{ name: "bench press", sets: [{ w: "135", r: "8" }, { w: "145", r: "6" }] }] },
  { date: "2026-09-05", exercises: [{ name: "Bench Press", sets: [{ w: "150", r: "5" }, { w: "", r: "8" }] }] },
];

describe("buildPlanSheets", () => {
  it("makes one sheet per training day with exercises, skipping rest and empty days", () => {
    const sheets = buildPlanSheets(templates);
    expect(sheets.map((s) => s.name)).toEqual(["Monday - Push", "Wednesday - Pull"]);
    expect(sheets[0].rows[0]).toEqual(["#", "Exercise", "Sets", "Reps", "Weight (lb)", "Coach note"]);
    expect(sheets[0].rows[1]).toEqual([1, "Bench Press", "4", "8", "", "Breathe out"]);
    expect(sheets[0].rows[2]).toEqual([2, "Lateral Raise", "", "", "", ""]);
  });
  it("fills last lifted weights from the most recent session, taking the heaviest set", () => {
    const sheets = buildPlanSheets(templates, { includeLastWeights: true, history });
    expect(sheets[0].rows[1][4]).toBe(150);
    expect(sheets[0].rows[2][4]).toBe("");
  });
  it("adds blank columns when asked", () => {
    const sheets = buildPlanSheets(templates, { blankColumns: true, unit: "kg" });
    expect(sheets[0].rows[0].slice(4)).toEqual(["Weight (kg)", "Coach note", "Done sets", "Done reps", "Done weight (kg)", "How it felt"]);
    expect(sheets[0].rows[1].length).toBe(10);
  });
});

describe("helpers", () => {
  it("lastLiftedWeight is case-insensitive and ignores blank weights", () => {
    expect(lastLiftedWeight(history, "BENCH PRESS")).toBe(150);
    expect(lastLiftedWeight(history, "Squat")).toBeNull();
    expect(lastLiftedWeight(null, "x")).toBeNull();
  });
  it("planFileName strips unsafe characters", () => {
    expect(planFileName("Priya S.")).toBe("Priya-S-plan.xlsx");
    expect(planFileName("  ")).toBe("client-plan.xlsx");
  });
  it("safeSheetName obeys Excel limits", () => {
    expect(safeSheetName("A/B:C?").includes("/")).toBe(false);
    expect(safeSheetName("x".repeat(40)).length).toBe(31);
  });
});

describe("buildPlanWorkbook", () => {
  it("produces a non-empty xlsx byte array", async () => {
    const bytes = await buildPlanWorkbook(templates, { includeLastWeights: true, history });
    expect(bytes.length).toBeGreaterThan(1000);
    // xlsx files are zip archives: PK header
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });
});
