import { describe, it, expect } from "vitest";
import { loadKind, withoutKit, asLogged, swapFor, bandLevel } from "../exerciseLoad.js";

describe("loadKind", () => {
  it("knows the bodyweight moves of an ab day", () => {
    for (const n of ["Leg Raise", "Hanging Leg Raises", "Crunches", "Bicycle Crunch", "Russian Twist", "Mountain Climbers", "Dead Bug", "V-Ups", "Flutter Kicks", "Plank", "Push-Ups", "Pull-up", "Chin Up", "Dips", "Sit-ups", "Burpees", "Glute Bridge"]) {
      expect(loadKind(n), n).toBe("body");
    }
  });
  it("a named load beats a bodyweight word", () => {
    for (const n of ["Weighted Pull-Up", "Cable Crunch", "Dumbbell Russian Twist", "Crunch Machine", "Plate Sit-Up", "Smith Machine Dips"]) {
      expect(loadKind(n), n).toBe("weight");
    }
  });
  it("bands are bands, whatever else the name says", () => {
    for (const n of ["Banded Leg Raise", "Leg Raise with Band", "Resistance Band Row", "Mini Band Walk", "Band Pull-Apart", "Banded Push-Up"]) {
      expect(loadKind(n), n).toBe("band");
    }
  });
  it("anything it doesn't know keeps the weight box", () => {
    for (const n of ["Barbell Bench Press", "Squat", "Lunge", "Romanian Deadlift", "Bulgarian Split Squat", "", null]) {
      expect(loadKind(n), String(n)).toBe("weight");
    }
  });
  it("does not read a body word inside another word", () => {
    expect(loadKind("Dippers Row")).toBe("weight");
    expect(loadKind("Lat Pulldown")).toBe("weight");
  });
});

describe("withoutKit", () => {
  it("takes the band or the added weight off", () => {
    expect(withoutKit("Banded Leg Raise")).toBe("Leg Raise");
    expect(withoutKit("Leg Raise with Band")).toBe("Leg Raise");
    expect(withoutKit("Leg raise (with resistance band)")).toBe("Leg raise");
    expect(withoutKit("Resistance Band Glute Bridge")).toBe("Glute Bridge");
    expect(withoutKit("Weighted Dips")).toBe("Dips");
  });
  it("offers nothing when there is no kit to take off, or it's the lift itself", () => {
    expect(withoutKit("Leg Raise")).toBeNull();
    expect(withoutKit("Barbell Squat")).toBeNull();
    expect(withoutKit("Band")).toBeNull();
    expect(withoutKit("")).toBeNull();
  });
});

describe("asLogged", () => {
  it("gives a plank written as reps the timer, with the reps as seconds", () => {
    expect(asLogged({ name: "Plank", sets: 3, reps: "30" })).toMatchObject({ mode: "time", secs: 30 });
    expect(asLogged({ name: "Side Plank", sets: 2, reps: "45s" })).toMatchObject({ mode: "time", secs: 45 });
    expect(asLogged({ name: "Wall Sit", sets: 3, reps: "1:00" })).toMatchObject({ mode: "time", secs: 60 });
    expect(asLogged({ name: "Hollow Hold", sets: 3, reps: "30-45" })).toMatchObject({ mode: "time", secs: 30 });
  });
  it("counts up when the reps can't be seconds", () => {
    expect(asLogged({ name: "Plank", sets: 3, reps: null })).toMatchObject({ mode: "time", secs: null });
    expect(asLogged({ name: "Plank", sets: 3, reps: "1" })).toMatchObject({ mode: "time", secs: null });
  });
  it("fills per-set times from per-set reps", () => {
    const out = asLogged({ name: "Plank", sets: 2, reps: "30", setList: [{ reps: "30", weight: null }, { reps: "45", weight: null }] });
    expect(out.setList.map((s) => s.secs)).toEqual([30, 45]);
  });
  it("leaves timed and non-hold exercises alone", () => {
    const timed = { name: "Plank", mode: "time", secs: 60 };
    expect(asLogged(timed)).toBe(timed);
    for (const name of ["Hang Clean", "Rope Pushdown", "Leg Raise", "Treadmill Run"]) {
      const ex = { name, sets: 3, reps: "10" };
      expect(asLogged(ex), name).toBe(ex);
    }
  });
});

describe("swapFor", () => {
  const banded = { name: "Banded Leg Raise", sets: 3, reps: "15", weight: 10, alternatives: ["Leg Raise"] };
  it("keeps sets and reps, drops the weight target and remembers the plan's exercise", () => {
    const out = swapFor(banded, { name: "Leg Raise", mode: "reps" });
    expect(out).toMatchObject({ name: "Leg Raise", swappedFrom: "Banded Leg Raise", sets: 3, reps: "15", weight: null });
    expect(out.alternatives).toBeUndefined();
    expect(out.mode).toBeUndefined();
  });
  it("switches to a timer when they held a plank instead", () => {
    const out = swapFor(banded, { name: "Plank", mode: "time" });
    expect(out).toMatchObject({ name: "Plank", mode: "time", secs: null, sets: 3 });
  });
  it("takes the time off when a hold becomes reps", () => {
    const out = swapFor({ name: "Plank", sets: 3, mode: "time", secs: 45, setList: [{ secs: 45 }, { secs: 45 }, { secs: 45 }] }, { name: "Dead Bug", mode: "reps" });
    expect(out.mode).toBeUndefined();
    expect(out.secs).toBeUndefined();
    expect(out.reps).toBeNull();
    expect(out.setList.every((s) => s.secs === undefined && s.reps === null)).toBe(true);
  });
  it("reps or time follows the name when not picked", () => {
    expect(swapFor(banded, { name: "Side Plank" }).mode).toBe("time");
  });
  it("is a no-op for a blank name or the same name", () => {
    expect(swapFor(banded, { name: "  " })).toBe(banded);
    expect(swapFor(banded, { name: "banded leg raise" })).toBe(banded);
  });
});

it("bandLevel only accepts the three words", () => {
  expect(bandLevel("hard")).toBe("hard");
  expect(bandLevel("heavy")).toBeNull();
});
