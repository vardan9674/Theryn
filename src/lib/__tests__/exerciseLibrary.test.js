// Muscle filter for the exercise picker: the right exercises come back for each muscle.
import { describe, it, expect } from "vitest";
import fs from "fs";
import { buildLibrary, filterLibrary, findInLibrary, alsoWorks, STAPLES, SLUG_TO_GROUP, MUSCLE_GROUPS, DEFAULT_EQUIPMENT } from "../exerciseLibrary.js";
import { BODY_FRONT, BODY_BACK } from "../bodyMap/bodyPaths.js";

const raw = JSON.parse(fs.readFileSync(new URL("../../../public/exercises.json", import.meta.url), "utf8"));
const lib = buildLibrary(raw);
const ALL_EQ = ["barbell", "dumbbell", "cable", "machine", "body", "ez", "kettlebell", "band", "other"];
const names = (list, n = 5) => list.slice(0, n).map((e) => e.name);

describe("buildLibrary", () => {
  it("keeps every exercise that has a muscle and a known type", () => {
    expect(lib.length).toBeGreaterThan(850);
  });
  it("applies the hand-review corrections", () => {
    expect(findInLibrary(lib, "Cable Hip Adduction").group).toBe("adductors");
    expect(findInLibrary(lib, "Mixed Grip Chin").group).toBe("upperback");
    expect(findInLibrary(lib, "Bench Press - Powerlifting").group).toBe("chest");
    expect(findInLibrary(lib, "Balance Board")).toBe(null);
    expect(findInLibrary(lib, "Air Bike").name).toBe("Air Bike (bicycle crunch)");
  });
  it("files clean, snatch and jerk lifts under Olympic, not strength", () => {
    expect(findInLibrary(lib, "Power Clean").type).toBe("power");
    expect(findInLibrary(lib, "Snatch Pull").type).toBe("power");
  });
  it("every staple exists and belongs to its own muscle", () => {
    for (const [group, list] of Object.entries(STAPLES)) {
      for (const name of list) {
        const e = findInLibrary(lib, name);
        expect(e, name).not.toBe(null);
        expect(e.group, name).toBe(group);
      }
    }
  });
});

describe("filterLibrary", () => {
  it("chest opens with the flat bench press, not a variation", () => {
    expect(names(filterLibrary(lib, { groups: ["chest"] }), 3))
      .toEqual(["Barbell Bench Press - Medium Grip", "Dumbbell Bench Press", "Barbell Incline Bench Press - Medium Grip"]);
  });
  it("each muscle returns only exercises whose main muscle it is", () => {
    for (const { id } of MUSCLE_GROUPS) {
      for (const e of filterLibrary(lib, { groups: [id], equipment: ALL_EQ, types: ["strength", "power", "plyo", "cardio", "stretch"] })) {
        expect(e.group).toBe(id);
      }
    }
  });
  it("upper back leads with pull-ups, pulldowns and rows", () => {
    expect(names(filterLibrary(lib, { groups: ["upperback"] }), 4)).toEqual(["Pullups", "Wide-Grip Lat Pulldown", "Bent Over Barbell Row", "Seated Cable Rows"]);
  });
  it("hamstrings shows no Olympic lifts unless asked", () => {
    const strength = filterLibrary(lib, { groups: ["hamstrings"] });
    expect(strength.some((e) => /clean|snatch/i.test(e.name))).toBe(false);
    expect(names(strength, 2)).toEqual(["Romanian Deadlift", "Lying Leg Curls"]);
    expect(filterLibrary(lib, { groups: ["hamstrings"], types: ["power"] }).some((e) => e.name === "Power Clean")).toBe(true);
  });
  it("equipment limits the list", () => {
    const bodyOnly = filterLibrary(lib, { groups: ["chest"], equipment: ["body"] });
    expect(bodyOnly.length).toBeGreaterThan(5);
    expect(bodyOnly.every((e) => e.equipment === "body")).toBe(true);
  });
  it("search matches every word, in any order", () => {
    expect(names(filterLibrary(lib, { groups: ["biceps"], query: "curl hammer" }), 10)).toContain("Hammer Curls");
    expect(filterLibrary(lib, { groups: ["biceps"], query: "zzz" })).toEqual([]);
  });
  it("no muscle selected means every muscle", () => {
    expect(filterLibrary(lib, { groups: [] }).length).toBe(filterLibrary(lib, { groups: MUSCLE_GROUPS.map((g) => g.id) }).length);
  });
  it("default equipment is a normal gym", () => {
    expect(DEFAULT_EQUIPMENT).toContain("barbell");
    expect(DEFAULT_EQUIPMENT).not.toContain("kettlebell");
  });
});

describe("alsoWorks", () => {
  it("names helper muscles in everyday words", () => {
    expect(alsoWorks(findInLibrary(lib, "Barbell Bench Press - Medium Grip"))).toBe("Also works: shoulders, triceps");
  });
});

describe("body drawing", () => {
  it("every tappable part maps to a muscle group", () => {
    const slugs = new Set([...BODY_FRONT, ...BODY_BACK].map((p) => p.slug));
    for (const slug of Object.keys(SLUG_TO_GROUP)) expect(slugs.has(slug), slug).toBe(true);
    for (const g of new Set(Object.values(SLUG_TO_GROUP))) expect(MUSCLE_GROUPS.some((m) => m.id === g), g).toBe(true);
  });
});

describe("findInLibrary and lastSessions", () => {
  it("is safe while the library is still loading", () => {
    expect(findInLibrary(null, "Barbell Curl")).toBe(null);
  });
  it("finds the last sessions of an exercise, newest first", async () => {
    const { lastSessions } = await import("../exerciseLibrary.js");
    const history = [
      { date: "2026-09-12", exercises: [{ name: "Barbell Curl", sets: [{ w: "60", r: "10" }, { w: "60", r: "8" }] }] },
      { date: "2026-09-26", exercises: [{ name: "barbell curl", sets: [{ w: "65", r: "8" }, { w: "60", r: "10" }] }] },
      { date: "2026-09-19", exercises: [{ name: "Squat", sets: [{ w: "200", r: "5" }] }] },
    ];
    expect(lastSessions(history, ["Barbell Curl"], 3)).toEqual([
      { key: "2026-09-26", date: "Sep 26", text: "65×8 · 60×10" },
      { key: "2026-09-12", date: "Sep 12", text: "60 × 10 · 8" },
    ]);
    expect(lastSessions(null, ["x"])).toEqual([]);
  });
});
