// A coach naming a day themselves: "Biceps + Back" instead of "Custom".
import { describe, it, expect } from "vitest";
import { cleanTypeName, typeNameProblem, isCustomTypeName, MAX_TYPE_NAME } from "../workoutTypes.js";
import { buildPlanSheets } from "../exportPlan.ts";

describe("cleaning a name", () => {
  it("tidies spacing and keeps what the coach meant", () => {
    expect(cleanTypeName("  Biceps +   Back ")).toBe("Biceps + Back");
    expect(cleanTypeName("Arms\n& Abs")).toBe("Arms & Abs");
    expect(cleanTypeName("Fight Prep")).toBe("Fight Prep");
  });

  it("caps a name that would not fit a week strip", () => {
    const long = cleanTypeName("Shoulders and arms and everything else as well");
    expect(long).toHaveLength(MAX_TYPE_NAME);
  });

  it("copes with nothing", () => {
    expect(cleanTypeName("")).toBe("");
    expect(cleanTypeName(null)).toBe("");
    expect(cleanTypeName(undefined)).toBe("");
  });
});

describe("names that are not allowed", () => {
  it("asks for a name when there isn't one", () => {
    expect(typeNameProblem("   ")).toMatch(/give the day a name/i);
  });

  it("keeps clients' rest days working by refusing to call a workout Rest", () => {
    // Streaks, consistency and the client's link all key off the exact word.
    for (const bad of ["Rest", "rest", " REST ", "Off", "rest day"]) {
      expect(typeNameProblem(bad)).toMatch(/pick rest from the list/i);
    }
  });

  it("allows an ordinary name", () => {
    for (const ok of ["Biceps + Back", "Arms & Abs", "Legs 2", "Restorative yoga"]) {
      expect(typeNameProblem(ok)).toBeNull();
    }
  });
});

describe("telling a typed name from a ready-made one", () => {
  it("knows the built-in ones", () => {
    expect(isCustomTypeName("Push")).toBe(false);
    expect(isCustomTypeName("Full Body")).toBe(false);
    expect(isCustomTypeName("Custom")).toBe(false);
    expect(isCustomTypeName("")).toBe(false);
  });
  it("knows a coach's own", () => {
    expect(isCustomTypeName("Biceps + Back")).toBe(true);
  });
});

describe("the Excel export with coach-named days", () => {
  const day = (type) => ({ type, exercises: [{ name: "Curl", sets: 3, reps: "10" }] });

  it("keeps a typed name on the sheet tab", () => {
    const sheets = buildPlanSheets({ Mon: day("Biceps + Back"), Tue: { type: "Rest", exercises: [] } });
    expect(sheets).toHaveLength(1);
    expect(sheets[0].name).toBe("Monday - Biceps + Back");
  });

  it("does not make two sheets with the same name when long names collide", () => {
    // Both truncate to the same 31 characters; Excel would refuse the second.
    const templates = {
      Mon: day("Shoulders and arms day A"),
      Tue: day("Shoulders and arms day B"),
      Wed: day("Shoulders and arms day C"),
    };
    const names = buildPlanSheets(templates).map((s) => s.name);
    expect(names).toHaveLength(3);
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(3);
    for (const n of names) expect(n.length).toBeLessThanOrEqual(31);
  });
});
