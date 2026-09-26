import { describe, it, expect } from "vitest";
import {
  normalizeExerciseName, mapKeys, musclesForExercise,
  heatFromWorkout, heatSentence, muscleWords, unknownNote,
} from "../muscleHeat.js";
import { MUSCLE_MAP } from "../muscleMap.generated.js";

const main = (name) => (musclesForExercise(name, MUSCLE_MAP) || [])[0] || null;

describe("normalizing a name", () => {
  it("folds case, punctuation, accents and plurals to the same words", () => {
    expect(normalizeExerciseName("Pull-Ups")).toBe("pull up");
    expect(normalizeExerciseName("  BARBELL   curl  ")).toBe("barbell curl");
    expect(normalizeExerciseName("Crunches")).toBe("crunch");
    expect(normalizeExerciseName("Bench Press")).toBe(normalizeExerciseName("bench press"));
  });

  it("keeps a double s, so a press stays a press", () => {
    expect(normalizeExerciseName("Press")).toBe("press");
    expect(normalizeExerciseName("Presses")).toBe("press");
    expect(normalizeExerciseName("Leg Press")).toBe("leg press");
  });

  it("stems a stem to itself, so keys and lookups always agree", () => {
    for (const n of ["Calf Raises", "Crunches", "Pull-Ups", "Dips", "Presses", "Flyes", "Abs"]) {
      const once = normalizeExerciseName(n);
      expect(normalizeExerciseName(once), n).toBe(once);
    }
    expect(normalizeExerciseName("Calf Raises")).toBe("calf raise");
  });

  it("survives nothing at all", () => {
    expect(normalizeExerciseName(null)).toBe("");
    expect(normalizeExerciseName(undefined)).toBe("");
    expect(mapKeys("")).toEqual([]);
    expect(mapKeys("   ")).toEqual([]);
  });
});

describe("reducing a name to look it up", () => {
  it("takes equipment and setup words off the front, one at a time", () => {
    expect(mapKeys("Incline Dumbbell Bench Press"))
      .toEqual(["incline dumbbell bench press", "dumbbell bench press", "bench press"]);
  });

  it("takes qualifiers off the end", () => {
    expect(mapKeys("Bench Press - Medium Grip")).toContain("bench press");
  });

  it("stops at the first word that means something", () => {
    // "leg" must survive, or a Leg Curl becomes a biceps curl
    expect(mapKeys("Lying Leg Curl")).toEqual(["lying leg curl", "leg curl"]);
    expect(mapKeys("Lying Leg Curl")).not.toContain("curl");
  });

  it("never reduces a name that is all meaning to nothing", () => {
    expect(mapKeys("Deadlift")).toEqual(["deadlift"]);
  });
});

describe("finding the muscles a coach's wording means", () => {
  it("handles the names coaches actually type", () => {
    expect(main("Bench Press")).toBe("chest");
    expect(main("Dumbbell Bench Press")).toBe("chest");
    expect(main("Squat")).toBe("quads");
    expect(main("Deadlift")).toBe("lowerback");
    expect(main("Romanian Deadlift")).toBe("hamstrings");
    expect(main("Pull-Up")).toBe("upperback");
    expect(main("Lateral Raise")).toBe("shoulders");
    expect(main("Tricep Pushdown")).toBe("triceps");
    expect(main("Plank")).toBe("abs");
    expect(main("Calf Raise")).toBe("calves");
  });

  it("does not let a dropped word change which muscle it is", () => {
    expect(main("Leg Curl")).toBe("hamstrings");        // not biceps
    expect(main("Lying Leg Curl")).toBe("hamstrings");
    expect(main("Overhead Press")).toBe("shoulders");   // not chest
    expect(main("Leg Extension")).toBe("quads");
  });

  it("keeps equipment variants together, because the muscle is the same", () => {
    for (const n of ["Barbell Bench Press", "Dumbbell Bench Press", "Smith Machine Bench Press"]) {
      expect(main(n)).toBe("chest");
    }
  });

  it("says it does not know, rather than guessing", () => {
    expect(musclesForExercise("Sunday Long Walk", MUSCLE_MAP)).toBeNull();
    expect(musclesForExercise("", MUSCLE_MAP)).toBeNull();
    expect(musclesForExercise("Bench Press", null)).toBeNull();
  });
});

describe("turning a finished workout into a heat map", () => {
  const push = [
    { name: "Barbell Bench Press", sets: 4 },
    { name: "Incline Dumbbell Press", sets: 3 },
    { name: "Tricep Pushdown", sets: 3 },
  ];

  it("lights the muscles the work was for, brightest first", () => {
    const heat = heatFromWorkout(push, MUSCLE_MAP);
    expect(heat.levels.chest).toBe(3);
    expect(heat.worked[0]).toBe("chest");
    expect(heat.counted).toBe(3);
    expect(heat.unknown).toEqual([]);
  });

  it("leaves a skipped exercise's muscles cold", () => {
    const heat = heatFromWorkout([
      { name: "Barbell Bench Press", sets: 4 },
      { name: "Barbell Squat", sets: 0 },
    ], MUSCLE_MAP);
    expect(heat.levels.chest).toBe(3);
    expect(heat.levels.quads).toBeUndefined();
    expect(heat.worked).not.toContain("quads");
  });

  it("counts a helper muscle as less work than the one it is for", () => {
    const heat = heatFromWorkout([{ name: "Barbell Bench Press", sets: 4 }], MUSCLE_MAP);
    expect(heat.levels.chest).toBe(3);
    expect(heat.levels.triceps).toBeLessThan(3);
  });

  it("counts more sets as more work", () => {
    const heat = heatFromWorkout([
      { name: "Barbell Squat", sets: 6 },
      { name: "Barbell Curl", sets: 1 },
    ], MUSCLE_MAP);
    expect(heat.levels.quads).toBe(3);
    expect(heat.levels.biceps).toBeLessThan(3);
  });

  it("tints a muscle nothing was aimed at, but does not name it", () => {
    const heat = heatFromWorkout([{ name: "Barbell Bench Press", sets: 4 }], MUSCLE_MAP);
    expect(heat.levels.triceps).toBe(1);          // still shaded on the figure
    expect(heat.worked).toEqual(["chest"]);       // but not listed
    expect(heat.top).toEqual(["chest"]);
  });

  it("does not let piled-up helper work name a muscle nobody trained", () => {
    // Squats and deadlifts lend the calves a little from almost every exercise.
    // The calves still get their own 3 sets here, so they are shaded — but the
    // sentence belongs to what the session was actually for.
    const heat = heatFromWorkout([
      { name: "Barbell Squat", sets: 5 },
      { name: "Romanian Deadlift", sets: 4 },
      { name: "Leg Curl", sets: 3 },
      { name: "Calf Raise", sets: 3 },
    ], MUSCLE_MAP);
    expect(heat.top).toEqual(["hamstrings", "quads"]);
    expect(heat.top).not.toContain("calves");
    expect(heat.levels.quads).toBe(3);            // the figure agrees with the words
    expect(heat.worked).toContain("calves");      // real work, so still listed
  });

  it("never names more than two muscles, however many were worked", () => {
    const heat = heatFromWorkout([
      { name: "Barbell Bench Press", sets: 3 },
      { name: "Barbell Squat", sets: 3 },
      { name: "Pull-Up", sets: 3 },
      { name: "Barbell Curl", sets: 3 },
      { name: "Plank", sets: 3 },
    ], MUSCLE_MAP);
    expect(heat.top.length).toBeLessThanOrEqual(2);
    expect(heatSentence(heat).split(",").length).toBeLessThanOrEqual(2);
  });

  it("names what it could not place and still draws the rest", () => {
    const heat = heatFromWorkout([
      { name: "Barbell Bench Press", sets: 4 },
      { name: "Vibration Plate Thing", sets: 3 },
    ], MUSCLE_MAP);
    expect(heat.counted).toBe(1);
    expect(heat.unknown).toEqual(["Vibration Plate Thing"]);
    expect(heat.levels.chest).toBe(3);
  });

  it("gives nothing to draw when there is nothing to draw", () => {
    for (const input of [[], null, undefined, [{ name: "Barbell Squat", sets: 0 }]]) {
      const heat = heatFromWorkout(input, MUSCLE_MAP);
      expect(heat.worked).toEqual([]);
      expect(heat.top).toEqual([]);
      expect(heatSentence(heat)).toBe("");
    }
  });

  it("does not list the same unknown exercise twice", () => {
    const heat = heatFromWorkout([
      { name: "Wobble Board", sets: 2 },
      { name: "Wobble Board", sets: 3 },
    ], MUSCLE_MAP);
    expect(heat.unknown).toEqual(["Wobble Board"]);
  });

  it("ignores sets that are not numbers", () => {
    const heat = heatFromWorkout([
      { name: "Barbell Squat", sets: "4" },
      { name: "Barbell Curl", sets: null },
      { name: "Plank", sets: NaN },
    ], MUSCLE_MAP);
    expect(heat.levels.quads).toBe(3);
    expect(heat.worked).not.toContain("biceps");
    expect(heat.worked).not.toContain("abs");
  });
});

describe("saying it in words", () => {
  it("joins muscle names the way a person would", () => {
    expect(muscleWords(["chest"])).toBe("chest");
    expect(muscleWords(["chest", "triceps"])).toBe("chest and triceps");
    expect(muscleWords(["chest", "shoulders", "triceps"])).toBe("chest, shoulders and triceps");
    expect(muscleWords([])).toBe("");
    expect(muscleWords(null)).toBe("");
  });

  it("uses plain words, not dataset labels", () => {
    expect(muscleWords(["upperback", "adductors"])).toBe("upper back and inner thighs");
  });

  it("writes one short sentence about the hardest-worked muscles", () => {
    const heat = heatFromWorkout([{ name: "Barbell Squat", sets: 5 }], MUSCLE_MAP);
    expect(heatSentence(heat)).toMatch(/^Mostly .+\.$/);
    expect(heatSentence(heat)).toContain("quads");
  });

  it("names one unplaced exercise but counts several", () => {
    expect(unknownNote({ unknown: [] })).toBe("");
    expect(unknownNote({ unknown: ["Chest Fly Machine"] }))
      .toBe("Chest Fly Machine isn't in our exercise list yet, so it isn't shown here.");
    expect(unknownNote({ unknown: ["A", "B", "C"] }))
      .toBe("3 exercises aren't in our list yet, so they aren't shown here.");
    expect(unknownNote(null)).toBe("");
  });
});

describe("the generated map itself", () => {
  it("only ever names muscle groups the body drawing can shade", () => {
    const ok = new Set(["chest", "shoulders", "biceps", "triceps", "forearms", "abs", "traps",
      "upperback", "lowerback", "glutes", "quads", "hamstrings", "adductors", "calves", "neck"]);
    for (const [key, groups] of Object.entries(MUSCLE_MAP)) {
      expect(Array.isArray(groups) && groups.length > 0, key).toBe(true);
      for (const g of groups) expect(ok.has(g), `${key} → ${g}`).toBe(true);
      expect(new Set(groups).size, `${key} repeats a group`).toBe(groups.length);
    }
  });

  it("is keyed in the same normalised form lookups use", () => {
    for (const key of Object.keys(MUSCLE_MAP)) expect(normalizeExerciseName(key)).toBe(key);
  });
});
