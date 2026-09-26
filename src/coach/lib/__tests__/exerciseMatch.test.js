// Before a coach creates an exercise, does it already exist?
import { describe, it, expect } from "vitest";
import { checkNewExercise, nameKey, normalizeName } from "../exerciseMatch.js";

const LIB = [
  { id: "1", name: "Dumbbell Curl", equipment: "dumbbell" },
  { id: "2", name: "Barbell Curl", equipment: "barbell" },
  { id: "3", name: "Hammer Curl", equipment: "dumbbell" },
  { id: "4", name: "Barbell Bench Press", equipment: "barbell" },
  { id: "5", name: "Tempo Squat", equipment: "barbell" },
  { id: "6", name: "Pause Squat", equipment: "barbell" },
  { id: "7", name: "Banded Hip Abduction", equipment: "bands" },
];
const v = (name, eq) => checkNewExercise(name, eq, LIB);

describe("normalizeName", () => {
  it("expands shorthand and ignores plurals and punctuation", () => {
    expect(nameKey("DB curls")).toBe(nameKey("Dumbbell Curl"));
    expect(nameKey("Curl, dumbbell")).toBe(nameKey("Dumbbell Curl"));
    expect(normalizeName("OHP")).toBe("overhead press");
  });
  it("treats medium grip as the standard grip", () => {
    expect(nameKey("Barbell Bench Press - Medium Grip")).toBe(nameKey("Barbell Bench Press"));
  });
});

describe("checkNewExercise", () => {
  it("catches an exact duplicate written differently", () => {
    const r = v("db curls", "dumbbell");
    expect(r.verdict).toBe("exists");
    expect(r.matches[0].name).toBe("Dumbbell Curl");
  });
  it("different equipment is a different exercise", () => {
    expect(v("BB curl", "barbell").matches[0].name).toBe("Barbell Curl");
    expect(v("Cable curl", "cable").verdict).not.toBe("exists");
  });
  it("asks about close names instead of merging", () => {
    const r = v("Tempo pause squat", "barbell");
    expect(r.verdict).toBe("similar");
    expect(r.matches.map((m) => m.name).sort()).toEqual(["Pause Squat", "Tempo Squat"]);
  });
  it("a genuinely new exercise is new", () => {
    expect(v("Kang squat hold", "barbell").verdict).not.toBe("exists");
    expect(v("Sledgehammer tyre hit", "other").verdict).toBe("new");
  });
  it("never confuses adduction with abduction", () => {
    expect(v("Banded hip adduction", "bands").verdict).not.toBe("exists");
  });
  it("an empty name is new", () => {
    expect(v("   ", "barbell")).toEqual({ verdict: "new", matches: [] });
  });
});
