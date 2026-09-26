// #133: the plan editor must flag numbers it can't keep instead of dropping
// them. #134: "as planned" must not lend one set's weight to the others, and
// a timed exercise's "Last time" reads in seconds.
import { describe, it, expect } from "vitest";
import { cleanRepsInput, cleanWeightInput, repsTargetOk, planNumbersProblem, plannedRepsNumber, plannedSet, packSets } from "../planSets.js";
import { DAYS, DAY_LONG } from "../format.js";
import { editableSets, editNumbersProblem } from "../editWorkout.js";
import { workoutDetail, lastSetsFor, setsLine } from "../workouts.js";
import { todayFromPlan, workoutPayload, submissionToHistory } from "../clientLinks.js";

const row = (reps, weight = "", extra = {}) => ({ reps, weight, secs: "", ...extra });
const week = (exercises, type = "Legs") => {
  const out = Object.fromEntries(DAYS.map((d) => [d, { type: "Rest", exercises: [] }]));
  out.Mon = { type, exercises };
  return out;
};
const problem = (days, unit = "kg") => planNumbersProblem(days, unit, DAYS, DAY_LONG);

describe("typing numbers in the plan editor", () => {
  it("reps: no leading dash, one range dash, slashes for a list", () => {
    expect(cleanRepsInput("-5")).toBe("5");
    expect(cleanRepsInput("8-12")).toBe("8-12");
    expect(cleanRepsInput("8–12")).toBe("8–12");
    expect(cleanRepsInput("8--12")).toBe("8-12");
    expect(cleanRepsInput("8-12-")).toBe("8-12");
    expect(cleanRepsInput("12/10/8")).toBe("12/10/8");
    expect(cleanRepsInput("12//10")).toBe("12/10");
    expect(cleanRepsInput(" 8 - 12 ")).toBe("8-12");
    expect(cleanRepsInput("abc")).toBe("");
  });
  it("weight: digits and one decimal point", () => {
    expect(cleanWeightInput("7..5")).toBe("7.5");
    expect(cleanWeightInput("7.5.")).toBe("7.5");
    expect(cleanWeightInput("-5")).toBe("5");
    expect(cleanWeightInput("62.5")).toBe("62.5");
  });
  it("reps targets the plan can keep", () => {
    for (const ok of ["", "10", "8-12", "8–12", "8 - 12", "12/10/8", "10-10"]) expect(repsTargetOk(ok)).toBe(true);
    for (const bad of ["-5", "0", "12-8", "8-", "8/", "0-5", "max", "5-0"]) expect(repsTargetOk(bad)).toBe(false);
  });
});

describe("planNumbersProblem", () => {
  it("a sensible week has none", () => {
    expect(problem(week([{ name: "Squat", rows: [row("8-12", "60"), row("8-12", "62.5"), row("", "")] }]))).toBe(null);
  });
  it("names the day, exercise and set of a weight past the limit", () => {
    const days = week([{ name: "Lunge", rows: [row("10")] }, { name: "Squat", rows: [row("8", "60"), row("8", "99999")] }]);
    expect(problem(days)).toEqual({ day: "Mon", index: 1, set: 1, message: "Monday · Squat, set 2: weight should be between 0 and 2000 kg." });
    expect(problem(days, "lb").message).toBe("Monday · Squat, set 2: weight should be between 0 and 2000 lb.");
  });
  it("catches an unreadable or zero weight", () => {
    expect(problem(week([{ name: "Squat", rows: [row("8", ".")] }])).message).toMatch(/set 1: weight should be/);
    expect(problem(week([{ name: "Squat", rows: [row("8", "0")] }])).message).toMatch(/set 1: weight should be/);
  });
  it("catches negative and backwards reps", () => {
    expect(problem(week([{ name: "Squat", rows: [row("-5", "60")] }])).message).toBe("Monday · Squat, set 1: reps should be a whole number like 10, or a range like 8-12.");
    expect(problem(week([{ name: "Squat", rows: [row("10"), row("12-8")] }])).set).toBe(1);
  });
  it("labels warm-up and drop sets the way the editor does, and skips AMRAP reps", () => {
    const days = week([{ name: "Bench", rows: [row("10", "20", { kind: "warmup" }), row("8", "60"), row("-1", "45", { kind: "drop" })] }]);
    expect(problem(days).message).toMatch(/^Monday · Bench, drop set: reps/);
    expect(problem(week([{ name: "Bench", rows: [row("8", "60"), row("", "", { kind: "amrap" })] }]))).toBe(null);
    expect(problem(week([{ name: "Bench", rows: [row("8", "60", { kind: "warmup" }), row("8", "60"), row("-2")] }])).message).toMatch(/Bench, set 2: reps/);
  });
  it("timed sets: up to 6 hours", () => {
    const timed = (secs) => week([{ name: "Plank", mode: "time", rows: [row("", "", { secs })] }], "Core");
    expect(problem(timed("00:45"))).toBe(null);
    expect(problem(timed("5:59:59"))).toBe(null);
    expect(problem(timed("6:00:01")).message).toBe("Monday · Plank, set 1: time should be between 1 second and 6 hours.");
    expect(problem(timed("99:00:00"))).not.toBe(null);
    expect(problem(timed(""))).toBe(null); // blank stays blank, it isn't dropped
    // Reps left over from before the switch to time don't matter.
    expect(problem(week([{ name: "Plank", mode: "time", rows: [row("-5", "", { secs: "00:30" })] }]))).toBe(null);
  });
  it("rest days are not checked", () => {
    const days = week([]);
    days.Tue = { type: "Rest", exercises: [{ name: "Squat", rows: [row("-5")] }] };
    expect(problem(days)).toBe(null);
  });
  it("finds the first problem in week order", () => {
    const days = week([{ name: "Squat", rows: [row("8")] }]);
    days.Wed = { type: "Pull", exercises: [{ name: "Row", rows: [row("8", "5000")] }] };
    days.Fri = { type: "Push", exercises: [{ name: "Bench", rows: [row("-1")] }] };
    expect(problem(days)).toMatchObject({ day: "Wed", index: 0, set: 0 });
  });
});

describe("planned numbers of a sent set", () => {
  it("reps count as the low end of a range; anything else counts for nothing", () => {
    expect(plannedRepsNumber("10")).toBe(10);
    expect(plannedRepsNumber("8-12")).toBe(8);
    expect(plannedRepsNumber("8–12")).toBe(8);
    expect(plannedRepsNumber("12/10/8")).toBe(12);
    for (const x of ["-5", "max", "–", "", null, "0"]) expect(plannedRepsNumber(x)).toBe(null);
  });
  it("with per-set plans, a set without a weight has none", () => {
    const e = { reps: "8-12/8-12/5", weight_target: 60.5, plan_sets: [{ r: "8-12" }, { r: "8-12" }, { r: "5", w: 60.5 }] };
    expect([0, 1, 2].map((i) => plannedSet(e, i).w)).toEqual([null, null, 60.5]);
    expect(plannedSet(e, 0).r).toBe("8-12");
    expect(plannedSet({ reps: "10", weight_target: 50 }, 2)).toMatchObject({ r: "10", w: 50 });
  });
});

// The plan seen live: two 8-12 sets with no weight, then -5 @ 60.5 kg.
const liveSquat = packSets([{ reps: "8-12" }, { reps: "8-12" }, { reps: "-5", weight: 60.5 }]);
const livePlan = { Mon: { type: "Legs", units: "metric", exercises: [{ name: "Squat", ...liveSquat }, { name: "Plank", mode: "time", sets: 3, secs: 45 }] } };
const monday = new Date(2026, 8, 21, 12);

describe("done as planned (#134)", () => {
  const payload = { ...workoutPayload(todayFromPlan(livePlan, monday), { 0: 3, 1: 3 }, {}, "", "2026-09-21", "metric"), logged_by: "coach" };
  const sub = { id: "s1", kind: "workout", submitted_at: "2026-09-21T12:00:00.000Z", manual_client_id: "m1", payload };

  it("the stored plan is what the editor packed", () => {
    expect(liveSquat.setList).toEqual([{ reps: "8-12" }, { reps: "8-12" }, { reps: "-5", weight: 60.5 }]);
  });
  it("the workout detail keeps each set's own planned numbers", () => {
    const d = workoutDetail({ id: "s1", date: "2026-09-21", submission: sub });
    expect(d.exercises[0].sets.map((s) => [s.r, s.w])).toEqual([["8-12", ""], ["8-12", ""], ["-5", "60.5"]]);
  });
  it("a typed set with a blank weight doesn't borrow another set's", () => {
    const typed = workoutPayload(todayFromPlan(livePlan, monday), { 0: 3 }, { 0: { 0: { r: "10" } } }, "", "2026-09-21", "metric");
    const d = workoutDetail({ id: "s2", date: "2026-09-21", submission: { ...sub, id: "s2", payload: typed } });
    expect(d.exercises[0].sets.map((s) => [s.r, s.w])).toEqual([["10", ""], ["8-12", ""], ["-5", "60.5"]]);
  });
  it("fixing the workout starts from each set's own numbers", () => {
    expect(editableSets(payload.exercises[0])).toEqual([
      { n: 1, reps: 8, weight: null, secs: null },
      { n: 2, reps: 8, weight: null, secs: null },
      { n: 3, reps: null, weight: 60.5, secs: null },
    ]);
  });
  it("a timed exercise's Last time reads in seconds", () => {
    const history = [submissionToHistory(sub)];
    expect(setsLine(lastSetsFor(history, "Plank").sets, "kg")).toBe("45 s, 45 s, 45 s");
  });
});

describe("Last time line", () => {
  it("ends in the unit, in reps, or nothing when every set was timed", () => {
    expect(setsLine([{ w: "60", r: "8" }, { w: "55", r: "6" }], "kg")).toBe("8×60, 6×55 kg");
    expect(setsLine([{ w: "", r: "10" }, { w: "", r: "8" }], "kg")).toBe("10, 8 reps");
    expect(setsLine([{ w: "", r: "", s: 45 }, { w: "", r: "", s: 90 }], "kg")).toBe("45 s, 1:30");
    expect(setsLine([{ w: "20", r: "", s: 60 }], "kg")).toBe("1 min at 20 kg");
    // App workouts carry minutes in `dur`.
    expect(setsLine([{ w: "", r: "", dur: "0.75" }], "lb")).toBe("45 s");
    // Without a unit it reads as before.
    expect(setsLine([{ w: "60", r: "8" }, { w: "", r: "" }])).toBe("8×60, ?");
  });
  it("keeps the seconds of a timed set", () => {
    expect(lastSetsFor([{ date: "2026-09-21", exercises: [{ name: "Plank", sets: [{ w: "", r: "", s: 45 }] }] }], "plank").sets).toEqual([{ w: "", r: "", s: 45 }]);
  });
});

describe("fixing a sent workout", () => {
  const exercises = [{ name: "Squat" }, { name: "Plank", mode: "time" }];
  it("flags a weight that can't be read instead of erasing it", () => {
    expect(editNumbersProblem(exercises, { 0: [{ reps: "8", weight: "." }] }, "kg")).toBe("Set 1 of Squat: . kg looks off. Check the weight.");
    expect(editNumbersProblem(exercises, { 0: [{ reps: "8", weight: "60" }, { reps: "8", weight: "900" }] }, "kg")).toMatch(/^Set 2 of Squat/);
    expect(editNumbersProblem(exercises, { 0: [{ reps: "8", weight: "900" }] }, "lb")).toBe(null);
  });
  it("blank is fine", () => {
    expect(editNumbersProblem(exercises, { 0: [{ reps: "", weight: "" }], 1: [{ reps: "", weight: "" }] }, "kg")).toBe(null);
  });
});
