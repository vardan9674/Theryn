import { describe, it, expect } from "vitest";
import { lastTimeLookup } from "../lastTime.js";
import { winsForSend } from "../sendWins.js";

const workout = (date, exercises, extra = {}) => ({ date, kind: "workout", payload: { date, weight_unit: "imperial", exercises, ...extra } });
const ex = (name, sets) => ({ name, sets_done: sets.length, sets: sets.map(([r, w], i) => ({ n: i + 1, done: true, reps: r, ...(w != null ? { weight: w } : {}) })) });
const phone = (entries) => ({ last: (name) => entries[String(name).toLowerCase()] || null });

describe("lastTimeLookup", () => {
  // The live case (2026-10-01): HIIT sent on Sep 25 from one browser, opened
  // on Oct 1 in another. The phone remembered nothing; the server had it all.
  it("reads the server's workouts when this phone remembers nothing", () => {
    const history = [workout("2026-09-25", [ex("Kettlebell Swing", [[20, 20], [15, 20], [15, 20]]), ex("Burpees", [[8], [8]])])];
    const last = lastTimeLookup(history, "2026-10-01", phone({}));
    expect(last("Kettlebell Swing")).toMatchObject({ date: "2026-09-25", units: "imperial", sets: [{ w: "20", r: "20" }, { w: "20", r: "15" }, { w: "20", r: "15" }] });
    expect(last("burpees").sets).toHaveLength(2);
    expect(last("Clean and Press")).toBeNull();
  });

  it("takes the latest day, and skips days the exercise wasn't done", () => {
    const history = [
      workout("2026-09-18", [ex("Slam Ball Front", [[12, 8]])]),
      workout("2026-09-25", [ex("Slam Ball Front", [[12, 10]])]),
      workout("2026-09-28", [{ name: "Slam Ball Front", sets_done: 0 }]),
    ];
    expect(lastTimeLookup(history, "2026-10-01")("Slam Ball Front").date).toBe("2026-09-25");
  });

  it("counts what the coach logged with them", () => {
    const history = [workout("2026-09-30", [ex("Squat", [[5, 100]])], { logged_by: "coach" })];
    expect(lastTimeLookup(history, "2026-10-01")("Squat").sets[0]).toMatchObject({ w: "100", r: "5" });
  });

  it("ignores today and later, and rest marks", () => {
    const history = [
      workout("2026-10-01", [ex("Plank", [[1]])]),
      { date: "2026-09-29", kind: "workout", payload: { rest: true, exercises: [] } },
    ];
    expect(lastTimeLookup(history, "2026-10-01")("Plank")).toBeNull();
  });

  it("falls back to the phone, and prefers whichever is newer", () => {
    const history = [workout("2026-09-25", [ex("Weight Shift", [[12, 12]])])];
    const newer = { date: "2026-09-28", units: "metric", sets: [{ r: "10", w: "6" }] };
    const older = { date: "2026-09-20", units: "metric", sets: [{ r: "10", w: "5" }] };
    expect(lastTimeLookup(history, "2026-10-01", phone({ "weight shift": newer }))("Weight Shift")).toBe(newer);
    expect(lastTimeLookup(history, "2026-10-01", phone({ "weight shift": older }))("Weight Shift").date).toBe("2026-09-25");
    expect(lastTimeLookup([], "2026-10-01", phone({ "weight shift": older }))("Weight Shift")).toBe(older);
    // A send from today on this phone is not "last time".
    expect(lastTimeLookup([], "2026-10-01", phone({ "weight shift": { ...older, date: "2026-10-01" } }))("Weight Shift")).toBeNull();
  });

  it("copes with no history and no phone", () => {
    expect(lastTimeLookup(undefined, "2026-10-01", null)("Anything")).toBeNull();
  });
});

describe("winsForSend uses the same last time", () => {
  it("finds a win from the server when the phone is empty", () => {
    const history = [workout("2026-09-25", [ex("Clean and Press", [[12, 10], [12, 10]])])];
    const payload = { exercises: [ex("Clean and Press", [[12, 12], [12, 12]])] };
    const wins = winsForSend(payload, "2026-10-01", "imperial", history, phone({}));
    expect(wins.map((w) => w.name)).toEqual(["Clean and Press"]);
  });
});
