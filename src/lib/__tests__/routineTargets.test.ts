// #129: an app client's plan keeps weights, per-set targets, timed sets, supersets and rest.
import { describe, it, expect, vi } from "vitest";
import { targetColumns, targetsFromRow, unitsFromRows } from "../routineTargets";

vi.mock("../supabase", () => ({ supabase: {} }));

describe("targetColumns (plan exercise → row)", () => {
  it("a bare name or a plain exercise stores nothing new", () => {
    expect(targetColumns("Squat", "metric")).toEqual({ target_weight: null, set_list: null, weight_unit: null, extra: null });
    expect(targetColumns({ name: "Squat", sets: 3, reps: "8-12" }, "metric")).toEqual({ target_weight: null, set_list: null, weight_unit: null, extra: null });
  });
  it("keeps the weight, the per-set list and the unit it was typed in", () => {
    const c = targetColumns({ name: "Bench", sets: 3, reps: "12/10/8", weight: 40, setList: [{ reps: "12", weight: 40 }, { reps: "10", weight: 42.5 }, { kind: "drop", reps: "8", weight: 30 }] }, "metric");
    expect(c.target_weight).toBe(40);
    expect(c.weight_unit).toBe("kg");
    expect(c.set_list).toEqual([{ reps: "12", weight: 40 }, { reps: "10", weight: 42.5 }, { kind: "drop", reps: "8", weight: 30 }]);
    expect(targetColumns({ name: "Row", weight: 95 }, "imperial").weight_unit).toBe("lb");
  });
  it("timed sets, supersets and rest go in extra", () => {
    expect(targetColumns({ name: "Plank", mode: "time", secs: 45, superset: "A", rest: 60 }, "metric").extra).toEqual({ mode: "time", secs: 45, superset: "A", rest: 60 });
  });
  it("junk is left out rather than stored", () => {
    const c = targetColumns({ name: "X", weight: -5, rest: "abc", setList: [{ reps: " ", weight: "0", kind: "weird" }] }, "metric");
    expect(c.target_weight).toBe(null);
    expect(c.weight_unit).toBe(null);
    expect(c.extra).toBe(null);
    expect(c.set_list).toEqual([{}]);
  });
});

describe("targetsFromRow (row → plan exercise)", () => {
  it("reads back what targetColumns wrote", () => {
    const ex = { name: "Bench", weight: 40, setList: [{ reps: "12", weight: 40 }, { kind: "amrap", weight: 30 }], mode: undefined, superset: "B", rest: 90 };
    const back = targetsFromRow({ ...targetColumns(ex, "metric"), target_weight: "40" /* numeric comes back as text */ });
    expect(back).toEqual({ weight: 40, setList: [{ reps: "12", weight: 40 }, { kind: "amrap", weight: 30 }], superset: "B", rest: 90 });
  });
  it("timed exercises come back timed", () => {
    expect(targetsFromRow({ extra: { mode: "time", secs: 45 } })).toEqual({ mode: "time", secs: 45 });
  });
  it("an old row with none of the columns adds nothing", () => {
    expect(targetsFromRow({ target_sets: 3, target_reps: "8-12" })).toEqual({});
  });
});

describe("unitsFromRows", () => {
  it("the day's unit comes from any weighted row", () => {
    expect(unitsFromRows([{ weight_unit: null }, { weight_unit: "kg" }])).toBe("metric");
    expect(unitsFromRows([{ weight_unit: "lb" }])).toBe("imperial");
    expect(unitsFromRows([{}])).toBe(null);
  });
});
