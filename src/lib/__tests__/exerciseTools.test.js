// Swap suggestions, quick workouts and saved equipment.
import { describe, it, expect } from "vitest";
import fs from "fs";
import { buildLibrary, findInLibrary } from "../exerciseLibrary.js";
import { suggestAlternatives } from "../exerciseAlternatives.js";
import { buildQuickWorkout, FOCUS_PRESETS } from "../quickWorkout.js";
import { readEquipment, cleanEquipment, presetFor, saveEquipment } from "../equipmentProfile.js";

const lib = buildLibrary(JSON.parse(fs.readFileSync(new URL("../../../public/exercises.json", import.meta.url), "utf8")));
const bench = findInLibrary(lib, "Barbell Bench Press - Medium Grip");

describe("suggestAlternatives", () => {
  it("offers chest exercises the person can do, never the same one", () => {
    const alts = suggestAlternatives(lib, bench);
    expect(alts.length).toBe(5);
    expect(alts.every((e) => e.group === "chest" && e.name !== bench.name)).toBe(true);
    expect(alts[0].name).toBe("Dumbbell Bench Press");
  });
  it("with only bodyweight, suggests push-ups", () => {
    const alts = suggestAlternatives(lib, bench, { equipment: ["body"] });
    expect(alts.every((e) => e.equipment === "body")).toBe(true);
    expect(alts.map((e) => e.name)).toContain("Pushups");
  });
  it("when the bench is busy, other equipment comes first", () => {
    const alts = suggestAlternatives(lib, bench, { reason: "equipment" });
    expect(alts[0].equipment).not.toBe("barbell");
  });
  it("skips names the coach already suggested", () => {
    expect(suggestAlternatives(lib, bench, { exclude: ["Dumbbell Bench Press"] }).some((e) => e.name === "Dumbbell Bench Press")).toBe(false);
  });
});

describe("buildQuickWorkout", () => {
  const push = FOCUS_PRESETS.find((p) => p.id === "push").groups;
  it("30 minutes of push gives 5 exercises across chest, shoulders and triceps", () => {
    const w = buildQuickWorkout(lib, { groups: push, minutes: 30 });
    expect(w.length).toBe(5);
    expect(new Set(w.map((x) => x.group))).toEqual(new Set(["chest", "shoulders", "triceps"]));
    expect(w[0]).toMatchObject({ name: "Barbell Bench Press - Medium Grip", sets: 3, reps: "8-10" });
  });
  it("uses only the equipment given, and no duplicates", () => {
    const w = buildQuickWorkout(lib, { groups: push, minutes: 45, equipment: ["dumbbell", "body", "band"] });
    expect(w.length).toBe(6);
    expect(w.every((x) => ["dumbbell", "body", "band"].includes(x.equipment))).toBe(true);
    expect(new Set(w.map((x) => x.name)).size).toBe(w.length);
  });
  it("prefers exercises the person has done before", () => {
    const history = [{ date: "2026-09-20", exercises: [{ name: "Cable Crossover", sets: [{ w: "30", r: "12" }] }] }];
    expect(buildQuickWorkout(lib, { groups: ["chest"], minutes: 20, history })[0].name).toBe("Cable Crossover");
  });
  it("shuffle gives a different workout for the same focus", () => {
    const a = buildQuickWorkout(lib, { groups: push, minutes: 30 }).map((x) => x.name);
    const b = buildQuickWorkout(lib, { groups: push, minutes: 30, shuffle: 1 }).map((x) => x.name);
    expect(a).not.toEqual(b);
  });
  it("no focus, no workout", () => {
    expect(buildQuickWorkout(lib, { groups: [] })).toEqual([]);
  });
});

describe("equipment", () => {
  const mem = () => { const m = {}; return { getItem: (k) => m[k] ?? null, setItem: (k, v) => { m[k] = v; } }; };
  it("defaults to a normal gym until chosen", () => {
    expect(readEquipment(mem())).toMatchObject({ saved: false });
  });
  it("always keeps bodyweight and drops unknown ids", () => {
    expect(cleanEquipment(["dumbbell", "rocket"])).toEqual(["dumbbell", "body"]);
  });
  it("recognises presets", () => {
    expect(presetFor(["body", "band", "dumbbell"])).toBe("home");
    expect(presetFor(["body", "barbell"])).toBe("custom");
  });
  it("saves on the device when the profile column does not exist yet", async () => {
    const storage = mem();
    const supabase = { from: () => ({ update: () => ({ eq: async () => ({ error: { code: "42703", message: "column does not exist" } }) }) }) };
    expect(await saveEquipment(["dumbbell"], { supabase, userId: "u1", storage })).toBe("device");
    expect(readEquipment(storage)).toEqual({ equipment: ["dumbbell", "body"], saved: true });
  });
  it("reports a real sync failure instead of hiding it", async () => {
    const supabase = { from: () => ({ update: () => ({ eq: async () => ({ error: { code: "500", message: "boom" } }) }) }) };
    await expect(saveEquipment(["dumbbell"], { supabase, userId: "u1", storage: mem() })).rejects.toThrow(/couldn't sync/);
  });
});
