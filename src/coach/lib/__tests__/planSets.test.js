import { describe, it, expect } from "vitest";
import { planSets, packSets, setsAreSame, repsSummary, weightSummary, setsLine } from "../planSets.js";

describe("planSets", () => {
  it("reads the old one-line shape as N identical sets", () => {
    expect(planSets({ name: "Bench", sets: 3, reps: "8-10", weight: 60 })).toEqual([
      { reps: "8-10", weight: 60 }, { reps: "8-10", weight: 60 }, { reps: "8-10", weight: 60 },
    ]);
  });
  it("reads per-set targets", () => {
    expect(planSets({ name: "Bench", sets: 3, setList: [{ reps: "12", weight: 60 }, { reps: 10, weight: "65" }, { reps: "8" }] })).toEqual([
      { reps: "12", weight: 60 }, { reps: "10", weight: 65 }, { reps: "8", weight: null },
    ]);
  });
  it("a bare name gives empty sets", () => {
    expect(planSets("Squat")).toHaveLength(3);
    expect(planSets("Squat")[0]).toEqual({ reps: "", weight: null });
    expect(planSets({ name: "Squat" }, 2)).toHaveLength(2);
  });
});

describe("packSets", () => {
  it("identical sets stay compact (no setList)", () => {
    expect(packSets([{ reps: "10", weight: 60 }, { reps: "10", weight: "60" }])).toEqual({ sets: 2, reps: "10", weight: 60 });
  });
  it("different sets keep a setList and a readable summary", () => {
    const p = packSets([{ reps: "12", weight: 60 }, { reps: "10", weight: 65 }, { reps: "8", weight: 70 }]);
    expect(p).toEqual({ sets: 3, reps: "12/10/8", weight: 60, setList: [{ reps: "12", weight: 60 }, { reps: "10", weight: 65 }, { reps: "8", weight: 70 }] });
    expect(planSets(p)).toEqual([{ reps: "12", weight: 60 }, { reps: "10", weight: 65 }, { reps: "8", weight: 70 }]);
  });
  it("round-trips the old shape unchanged", () => {
    const ex = { name: "Row", sets: 4, reps: "8-12", weight: 50 };
    expect(packSets(planSets(ex))).toEqual({ sets: 4, reps: "8-12", weight: 50 });
  });
  it("blank fields are left out; nonsense weights are dropped", () => {
    expect(packSets([{ reps: "", weight: "" }, { reps: "", weight: "abc" }])).toEqual({ sets: 2 });
  });
});

describe("summaries", () => {
  const list = [{ reps: "12", weight: 60 }, { reps: "10", weight: 65 }, { reps: "8", weight: 70 }];
  it("reads well", () => {
    expect(setsAreSame(list)).toBe(false);
    expect(repsSummary(list)).toBe("12/10/8");
    expect(weightSummary(list)).toBe("60–70");
    expect(setsLine(list, "kg")).toBe("3 sets · 12/10/8 reps · 60–70 kg");
    expect(setsLine([{ reps: "10", weight: null }], "kg")).toBe("1 set · 10 reps");
  });
});
