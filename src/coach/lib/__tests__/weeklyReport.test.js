// The weekly report: what a coach reviews before choosing to share it.
import { describe, it, expect } from "vitest";
import { linkClientData } from "../clientLinks.js";
import {
  buildWeeklyReport, reportSnapshot, applySuggestion, defaultReportWeek, weekLabel, addDays, gapStatus, reportMessage, DEFAULT_SECTIONS,
} from "../weeklyReport.js";

// Maya's plan: Push, Pull, Legs, Upper, Legs. Thursday and Sunday are rest.
const PLAN = {
  Mon: { type: "Push", exercises: [{ name: "Barbell Bench Press", sets: 4 }, { name: "Overhead Press", sets: 3 }, { name: "Incline Dumbbell Press", sets: 3 }, { name: "Lateral Raise", sets: 3 }, { name: "Tricep Pushdown", sets: 3 }] },
  Tue: { type: "Pull", exercises: [{ name: "Deadlift", sets: 3 }, { name: "Pull-Up", sets: 4 }, { name: "Seated Cable Row", sets: 3 }, { name: "Barbell Curl", sets: 3 }] },
  Wed: { type: "Legs", exercises: [{ name: "Barbell Squat", sets: 4 }, { name: "Leg Press", sets: 3, alternatives: ["Goblet Squat", "Split Squat"] }, { name: "Leg Curl", sets: 3 }, { name: "Calf Raise", sets: 3 }] },
  Thu: { type: "Rest", exercises: [] },
  Fri: { type: "Upper", exercises: [{ name: "Barbell Bench Press", sets: 4 }, { name: "Pull-Up", sets: 3 }, { name: "Dumbbell Shoulder Press", sets: 3 }, { name: "Hammer Curl", sets: 3 }, { name: "Tricep Pushdown", sets: 3 }] },
  Sat: { type: "Legs", exercises: [{ name: "Barbell Squat", sets: 4 }, { name: "Romanian Deadlift", sets: 3 }, { name: "Leg Press", sets: 3 }, { name: "Calf Raise", sets: 3 }] },
  Sun: { type: "Rest", exercises: [] },
};

let seq = 0;
/** A link workout as the link page sends it. ex: [name, planned, done, weight, reps] */
function sent(date, type, feel, ex) {
  seq += 1;
  return {
    id: `sub-${seq}`, kind: "workout", submitted_at: `${date}T18:00:00Z`,
    payload: {
      date, local_date: date, type, weight_unit: "imperial", ...(feel ? { feel } : {}),
      exercises: ex.map(([name, planned, done, weight = 100, reps = 8]) => ({
        name, sets_planned: planned, sets_done: done, reps: String(reps), weight_target: weight,
        // As the link page sends them: a row per planned set, ticked ones done.
        sets: Array.from({ length: planned }, (_, i) => ({ n: i + 1, done: i < done, reps, weight })),
      })),
    },
  };
}

const WEEK = "2026-09-21"; // Monday
const SUNDAY_EVENING = new Date(2026, 8, 27, 19, 40);

// Three earlier weeks, then the week under review.
function mayaSubmissions() {
  seq = 0;
  const legs = (date, feel) => sent(date, "Legs", feel, [["Barbell Squat", 4, 4, 135], ["Leg Press", 3, 0], ["Leg Curl", 3, 3, 60], ["Calf Raise", 3, 3, 90]]);
  return [
    // 31 Aug – 6 Sep: Saturday legs done
    sent("2026-08-31", "Push", "medium", [["Barbell Bench Press", 4, 4, 130, 6]]),
    legs("2026-09-02", "medium"),
    sent("2026-09-05", "Legs", "medium", [["Barbell Squat", 4, 4, 135], ["Romanian Deadlift", 3, 3, 95], ["Leg Press", 3, 3], ["Calf Raise", 3, 3]]),
    // 7–13 Sep: Saturday legs done
    legs("2026-09-09", "easy"),
    sent("2026-09-12", "Legs", "medium", [["Barbell Squat", 4, 4, 135], ["Romanian Deadlift", 3, 3, 95], ["Calf Raise", 3, 3]]),
    // 14–20 Sep: bench 135 × 6, Saturday missed
    sent("2026-09-14", "Push", "medium", [["Barbell Bench Press", 4, 4, 135, 6]]),
    legs("2026-09-16", "medium"),
    // 21–27 Sep: the week under review
    sent("2026-09-21", "Push", "medium", [["Barbell Bench Press", 4, 4, 135, 6], ["Overhead Press", 3, 3, 65], ["Incline Dumbbell Press", 3, 3, 40], ["Lateral Raise", 3, 3, 15], ["Tricep Pushdown", 3, 3, 40]]),
    sent("2026-09-22", "Pull", "medium", [["Deadlift", 3, 3, 185], ["Pull-Up", 4, 3, 0], ["Seated Cable Row", 3, 3, 90], ["Barbell Curl", 3, 3, 50]]),
    sent("2026-09-23", "Legs", "hard", [["Barbell Squat", 4, 2, 135], ["Leg Press", 3, 0], ["Leg Curl", 3, 0], ["Calf Raise", 3, 3, 90]]),
    sent("2026-09-25", "Upper", "hard", [["Barbell Bench Press", 4, 4, 140, 6], ["Pull-Up", 3, 3, 0], ["Dumbbell Shoulder Press", 3, 3, 35], ["Hammer Curl", 3, 3, 30], ["Tricep Pushdown", 3, 3, 40]]),
  ];
}

function mayaData(extra = {}) {
  const linked = linkClientData(mayaSubmissions(), { plan: PLAN, coachUnits: "imperial" });
  return {
    routine: PLAN, history: linked.history, submissions: linked.submissions, measurements: linked.measurements, weights: linked.weights,
    profile: { unit_system: "imperial", height_cm: null }, ...extra,
  };
}

const report = (data = mayaData(), opts = {}) => buildWeeklyReport(data, { start: WEEK, firstName: "Maya", now: SUNDAY_EVENING, ...opts });

describe("which week, and how it reads", () => {
  it("is this week on a Sunday, the week that ended on any other day", () => {
    expect(defaultReportWeek(new Date(2026, 8, 27, 20))).toBe("2026-09-21"); // Sunday
    expect(defaultReportWeek(new Date(2026, 8, 28, 9))).toBe("2026-09-21");  // Monday after
    expect(defaultReportWeek(new Date(2026, 8, 30, 9))).toBe("2026-09-21");   // Wednesday after
  });
  it("labels a week plainly, across a month end too", () => {
    expect(weekLabel("2026-09-21")).toBe("21–27 Sep");
    expect(weekLabel("2026-09-28")).toBe("28 Sep – 4 Oct");
  });
  it("adds days on the local calendar", () => {
    expect(addDays("2026-09-28", 1)).toBe("2026-09-29");
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
  });
});

describe("what happened this week", () => {
  const r = report();
  it("counts workouts and sets against the plan", () => {
    expect(r.workouts).toMatchObject({ planned: 5, done: 4 });
    expect(r.sets).toEqual({ planned: 71, done: 49 });
    expect(r.workouts.days.find((d) => d.key === "Sat")).toMatchObject({ planned: true, done: false, missed: true });
  });
  it("says it in one line for the coach, and kindly for the client", () => {
    expect(r.headline).toBe("Upper body on plan. Legs mostly missed.");
    expect(r.athleteHeadline).toBe("Strong upper-body week.");
  });
  it("names the muscles trained most, from sets ticked", () => {
    expect(r.muscles.top).toEqual(["chest", "shoulders"]);
    expect(r.muscles.sentence).toBe("Most sets went to chest and shoulders.");
  });
  it("marks each muscle the plan aimed at as on plan, half done or missed", () => {
    expect(r.gaps.chest).toMatchObject({ planned: 11, done: 11, status: "on" });
    expect(r.gaps.quads).toMatchObject({ planned: 14, done: 2, status: "missed" });
    expect(r.gaps.calves.status).toBe("half");
    expect(r.regions.legs).toMatchObject({ planned: 26, done: 5, verdict: "mostly missed" });
    expect(r.regions.upper).toMatchObject({ planned: 45, done: 44, verdict: "on plan" });
  });
  it("finds a new best against everything before this week", () => {
    expect(r.bests[0]).toMatchObject({ name: "Barbell Bench Press", weight: 140, reps: 6, prevWeight: 135, prevReps: 6 });
  });
  it("counts how sessions felt", () => {
    expect(r.feel).toEqual({ hard: 2, rated: 4 });
  });
});

describe("what Theryn noticed", () => {
  const r = report();
  const kinds = r.patterns.map((p) => p.kind);
  it("catches an exercise left out of workout after workout", () => {
    // Done once on 5 Sep, then skipped on 9, 16 and 23 Sep: a run of 3.
    const p = r.patterns.find((x) => x.kind === "skipped");
    expect(p.title).toBe("Leg Press skipped 3 times in a row");
    expect(p.seen).toBe("Left out of the last 3 workouts it was planned in.");
  });
  it("doesn't count a day they never opened as a skip", () => {
    // Saturday's missed Leg Press would make it 4; the run stays 3.
    expect(r.patterns.find((x) => x.kind === "skipped").title).not.toContain("4");
  });
  it("never guesses why, it asks", () => {
    for (const p of r.patterns.filter((x) => x.ask)) expect(p.ask.trim().endsWith("?") || p.ask.includes("?")).toBe(true);
    expect(r.patterns.find((x) => x.kind === "skipped").ask).toContain("Maya hasn't said why");
  });
  it("flags hard sessions in a row, and that it's a first", () => {
    const p = r.patterns.find((x) => x.kind === "hard");
    expect(p.seen).toContain("Wednesday and Friday both felt hard");
    expect(p.seen).toContain("first time");
  });
  it("puts an uneven push/pull split on the plan when the client followed it", () => {
    const p = r.patterns.find((x) => x.kind === "plan_lean");
    expect(p).toBeTruthy();
    expect(p.title).toBe("The plan leans to pushing, not Maya");
    expect(kinds).not.toContain("client_lean");
  });
  it("puts it on the client when the plan was even and they skipped one side", () => {
    const even = { ...PLAN, Mon: { type: "Push", exercises: [{ name: "Barbell Bench Press", sets: 4 }, { name: "Lateral Raise", sets: 4 }] }, Tue: { type: "Pull", exercises: [{ name: "Pull-Up", sets: 4 }, { name: "Seated Cable Row", sets: 4 }] }, Fri: { type: "Rest", exercises: [] } };
    seq = 0;
    const subs = [
      sent("2026-09-21", "Push", null, [["Barbell Bench Press", 4, 4], ["Lateral Raise", 4, 4]]),
      sent("2026-09-22", "Pull", null, [["Pull-Up", 4, 1], ["Seated Cable Row", 4, 0]]),
      sent("2026-09-23", "Legs", null, [["Barbell Squat", 4, 4]]),
    ];
    const linked = linkClientData(subs, { plan: even, coachUnits: "imperial" });
    const r2 = report({ routine: even, history: linked.history, submissions: linked.submissions, weights: [], measurements: [], profile: {} });
    const p = r2.patterns.find((x) => x.kind === "client_lean");
    expect(p.title).toBe("Pulling is what got skipped");
    expect(r2.patterns.map((x) => x.kind)).not.toContain("plan_lean");
  });
  it("notices the same day being missed week after week", () => {
    const p = r.patterns.find((x) => x.kind === "missed_day");
    expect(p.title).toBe("Saturday's Legs keeps getting missed");
    expect(p.seen).toBe("Missed 2 of the last 3 weeks.");
  });
  it("celebrates a best", () => {
    expect(kinds).toContain("best");
  });
});

describe("suggestions the coach can apply", () => {
  const r = report();
  it("offers a stand-in the coach already set, and never invents one", () => {
    expect(r.suggestions.find((s) => s.kind === "swap")).toMatchObject({ from: "Leg Press", to: "Goblet Squat" });
    const noAlts = { ...PLAN, Wed: { ...PLAN.Wed, exercises: PLAN.Wed.exercises.map((e) => ({ ...e, alternatives: [] })) } };
    expect(report(mayaData({ routine: noAlts })).suggestions.find((s) => s.kind === "swap")).toBeUndefined();
  });
  it("offers to move a missed day to the nearest free day", () => {
    expect(r.suggestions.find((s) => s.kind === "move")).toMatchObject({ from: "Sat", to: "Sun" });
  });
  it("swaps an exercise and keeps the old one as a stand-in", () => {
    const next = applySuggestion(PLAN, { kind: "swap", from: "Leg Press", to: "Goblet Squat" });
    const wed = next.Wed.exercises.find((e) => e.name === "Goblet Squat");
    expect(wed.sets).toBe(3);
    expect(wed.alternatives).toEqual(["Leg Press", "Split Squat"]);
    expect(next.Sat.exercises.some((e) => e.name === "Goblet Squat")).toBe(true);
    expect(PLAN.Wed.exercises[1].name).toBe("Leg Press"); // the original is untouched
  });
  it("moves a day by swapping it with the free one", () => {
    const next = applySuggestion(PLAN, { kind: "move", from: "Sat", to: "Sun" });
    expect(next.Sun.type).toBe("Legs");
    expect(next.Sat.type).toBe("Rest");
  });
});

describe("a quiet week", () => {
  it("says what they did and won't name a muscle they 'trained most'", () => {
    seq = 0;
    const subs = [sent("2026-09-23", "Push", null, [["Barbell Bench Press", 4, 3], ["Lateral Raise", 3, 2]])];
    const linked = linkClientData(subs, { plan: PLAN, coachUnits: "imperial" });
    const r = report({ routine: PLAN, history: linked.history, submissions: linked.submissions, weights: [], measurements: [], profile: {} });
    expect(r.quiet).toBe(true);
    expect(r.headline).toBe("Quiet week. 1 of 5 workouts.");
    expect(r.athleteHeadline).toBe("A quiet week.");
    expect(r.muscles.top).toEqual([]);
    expect(r.muscles.sentence).toBe("");
    expect(r.doneList).toEqual([{ name: "Barbell Bench Press", sets: 3 }, { name: "Lateral Raise", sets: 2 }]);
    expect(r.draftNote).toContain("Everything OK?");
  });
});

describe("app clients, who send no planned sets", () => {
  it("takes the plan from the routine and the work from their history", () => {
    const history = [
      { id: "s1", date: "2026-09-21", exercises: [{ name: "Barbell Bench Press", sets: [{ w: "135", r: "6" }, { w: "135", r: "6" }, { w: "135", r: "6" }, { w: "135", r: "6" }] }] },
    ];
    const r = report({ routine: PLAN, history, submissions: [], weights: [], measurements: [], profile: {} });
    expect(r.workouts).toMatchObject({ planned: 5, done: 1 });
    // Monday's other four exercises count as skipped: planned, not done.
    expect(r.gaps.shoulders).toMatchObject({ planned: 9, done: 0 });
    expect(r.gaps.chest.done).toBe(4);
  });
  it("still reports a client with no plan at all", () => {
    const history = [{ id: "s1", date: "2026-09-21", exercises: [{ name: "Barbell Squat", sets: [{ w: "100", r: "5" }] }] }, { id: "s2", date: "2026-09-23", exercises: [{ name: "Barbell Squat", sets: [{ w: "100", r: "5" }] }] }];
    const r = report({ routine: null, history, submissions: [], weights: [], measurements: [], profile: {} });
    expect(r.headline).toBe("2 workouts this week.");
    expect(r.gaps).toEqual({});
  });
});

describe("body", () => {
  it("averages the week's weigh-ins and compares with last week", () => {
    const weights = [{ date: "2026-09-22", weight: 138 }, { date: "2026-09-24", weight: 138.6 }, { date: "2026-09-26", weight: 138.6 }, { date: "2026-09-16", weight: 139 }];
    const r = report(mayaData({ weights, profile: { unit_system: "imperial", height_cm: 165 } }));
    expect(r.body).toMatchObject({ weight: 138.4, weighIns: 3, weightDelta: -0.6, weightUnit: "lb" });
    expect(r.body.bmi).toBeCloseTo(23.1, 1);
    expect(r.body.bmiCategory).toBe("Normal");
  });
  it("gives no BMI without a height", () => {
    const r = report(mayaData({ weights: [{ date: "2026-09-22", weight: 138 }] }));
    expect(r.body.bmi).toBeNull();
    expect(r.body.heightCm).toBeNull();
  });
});

describe("what the client gets when the coach shares it", () => {
  const r = report();
  const snap = reportSnapshot(r, { note: "Great week, Maya!", focus: "Both leg days", coachName: "Vardan", firstName: "Maya" });

  it("never carries what Theryn noticed or suggested", () => {
    const text = JSON.stringify(snap);
    expect(snap.patterns).toBeUndefined();
    expect(snap.suggestions).toBeUndefined();
    expect(text).not.toContain("skipped every time");
    expect(text).not.toContain("hasn't said why");
  });
  it("leaves body weight out unless the coach turns it on", () => {
    expect(DEFAULT_SECTIONS.body).toBe(false);
    expect(snap.body).toBeUndefined();
    const withBody = reportSnapshot(report(mayaData({ weights: [{ date: "2026-09-22", weight: 138 }] })), { sections: { body: true } });
    expect(withBody.body).toMatchObject({ weight: 138, unit: "lb" });
  });
  it("carries the kind headline, the muscles, the weak spot, the wins and the note", () => {
    expect(snap).toMatchObject({ v: 2, coach: "Vardan", first: "Maya", headline: "Strong upper-body week.", note: "Great week, Maya!", focus: "Both leg days" });
    expect(snap.muscles.top).toEqual(["chest", "shoulders"]);
    expect(snap.gap).toEqual({ weak: { label: "Legs", done: 5, planned: 26 }, strong: { label: "Upper body", done: 44, planned: 45 } });
    // Bench went from 135 to 140: better than last week, and the best ever.
    expect(snap.wins).toEqual({ unit: "lb", items: [{ name: "Barbell Bench Press", kind: "heavier", now: 140, before: 135, reps: 6, ever: true }], more: 0 });
    expect(snap.best).toBeUndefined(); // the wins say it now
  });
  it("carries the weight lifted, week by week, this week last", () => {
    expect(snap.volume.unit).toBe("lb");
    expect(snap.volume.weeks).toHaveLength(6);
    expect(snap.volume.weeks[5]).toEqual({ s: WEEK, t: snap.volume.total });
    expect(snap.volume.total).toBeGreaterThan(snap.volume.weeks[4].t);
    expect(snap.volume.trend).toBe("up");
  });
  it("drops any section the coach switched off, the workouts too", () => {
    const s = reportSnapshot(r, { sections: { workouts: false, wins: false, volume: false, muscles: false, gap: false, note: false }, note: "x" });
    for (const k of ["workouts", "wins", "volume", "muscles", "gap", "note", "body"]) expect(s[k]).toBeUndefined();
    expect(s.headline).toBe("Strong upper-body week.");
  });
  it("has every section on by default except body", () => {
    expect(DEFAULT_SECTIONS).toEqual({ workouts: true, wins: true, volume: true, muscles: true, gap: true, body: false, note: true });
  });
  it("stays small enough for the database's cap", () => {
    expect(JSON.stringify(snap).length).toBeLessThan(4000);
    const long = reportSnapshot(r, { note: "x".repeat(5000), focus: "y".repeat(500) });
    expect(long.note.length).toBe(600);
    expect(long.focus.length).toBe(80);
  });
});

describe("reopening a report already shared", () => {
  it("keeps the coach's choices", async () => {
    const { sectionsFrom } = await import("../weeklyReport.js");
    expect(sectionsFrom({ v: 2, workouts: {}, wins: {}, muscles: {}, note: "x" })).toEqual({ workouts: true, wins: true, volume: false, muscles: true, gap: false, body: false, note: true });
  });
  it("turns on what an older report didn't have yet, so sharing again sends it all", async () => {
    const { sectionsFrom } = await import("../weeklyReport.js");
    expect(sectionsFrom({ v: 1, workouts: {}, muscles: {}, note: "x" })).toEqual({ workouts: true, wins: true, volume: true, muscles: true, gap: false, body: false, note: true });
  });
  it("starts from the defaults when nothing was shared", async () => {
    const { sectionsFrom } = await import("../weeklyReport.js");
    expect(sectionsFrom(null)).toEqual(DEFAULT_SECTIONS);
  });
});

describe("small pieces", () => {
  it("rates a muscle's week against its plan", () => {
    expect(gapStatus(9, 10)).toBe("on");
    expect(gapStatus(3, 6)).toBe("half");
    expect(gapStatus(2, 14)).toBe("missed");
    expect(gapStatus(0, 0)).toBeNull();
  });
  it("writes a plain message with no numbers in it", () => {
    expect(reportMessage("Maya", "https://theryn.fit/f/abc?r=1")).toBe("Hi Maya, your week is ready. Have a look before your next session: https://theryn.fit/f/abc?r=1");
  });
});

describe("the draft the coach starts from", () => {
  it("writes a note and a focus in a coach's words", () => {
    const r = report();
    expect(r.draftNote).toBe("Great upper-body week, Maya. A new best on Barbell Bench Press! Next week let's get every leg day in. Tell me if the Leg Press is giving you trouble.");
    expect(r.draftFocus).toBe("Every leg day");
  });
});

describe("showing up is not the same as finishing", () => {
  it("says every workout started but was cut short, instead of calling it missed", () => {
    const plan = { Mon: PLAN.Mon, Tue: PLAN.Tue, Wed: { type: "Rest", exercises: [] }, Thu: { type: "Rest", exercises: [] }, Fri: { type: "Rest", exercises: [] }, Sat: { type: "Rest", exercises: [] }, Sun: { type: "Rest", exercises: [] } };
    const history = [
      { id: "h1", date: "2026-09-21", exercises: [{ name: "Barbell Bench Press", sets: [{ w: "100", r: "8" }, { w: "100", r: "8" }] }, { name: "Overhead Press", sets: [{ w: "50", r: "8" }] }] },
      { id: "h2", date: "2026-09-22", exercises: [{ name: "Deadlift", sets: [{ w: "150", r: "5" }] }, { name: "Pull-Up", sets: [{ w: "0", r: "6" }] }] },
    ];
    const r = report({ routine: plan, history, submissions: [], weights: [], measurements: [], profile: {} });
    expect(r.workouts).toMatchObject({ planned: 2, done: 2 });
    expect(r.headline).toBe("Every workout started, but only 5 of 29 sets done.");
    expect(r.athleteHeadline).toBe("You showed up every time.");
    const p = r.patterns.find((x) => x.kind === "cut_short");
    expect(p.title).toBe("Workouts cut short");
    expect(p.ask).toContain("only ticking some");
    expect(r.draftNote).toContain("You showed up every time, Maya");
    expect(r.draftFocus).toBe("Full sessions");
  });
  it("doesn't call a full week short", () => {
    expect(report().patterns.map((p) => p.kind)).not.toContain("cut_short");
  });
});

describe("fair on real data", () => {
  it("doesn't count a day still to come against the plan", () => {
    // Thursday evening: Friday and Saturday's legs haven't happened yet.
    const r = report(mayaData(), { now: new Date(2026, 8, 24, 20, 0) });
    const sat = r.workouts.days.find((d) => d.key === "Sat");
    expect(sat).toMatchObject({ planned: true, done: false, upcoming: true, missed: false });
    expect(r.regions.legs.planned).toBe(13); // Wednesday's legs only
    // Once the week is over, Saturday's legs (missed) count as well.
    expect(report().regions.legs.planned).toBe(26);
  });
  it("gives no % change against a week with one workout", () => {
    // Only the 14 Sep push the week before: one workout.
    const subs = mayaSubmissions().filter((s) => s.payload.date >= "2026-09-14" && s.payload.date !== "2026-09-16");
    const linked = linkClientData(subs, { plan: PLAN, coachUnits: "imperial" });
    const r = report({ ...mayaData(), history: linked.history, submissions: linked.submissions });
    expect(r.volume.total).toBeGreaterThan(0);
    expect(r.volume.pct).toBeNull();
  });
  it("leaves a weigh-in typo out of the average", () => {
    const r = report(mayaData({ weights: [{ date: "2026-09-21", weight: 168 }, { date: "2026-09-22", weight: 167 }, { date: "2026-09-23", weight: 76 }, { date: "2026-09-24", weight: 166 }] }));
    expect(r.body.weight).toBe(167);
  });
});

describe("gym shorthand finds the muscles", () => {
  it("reads DB, Bentover, Rowing and everyday names", async () => {
    const { musclesForExercise } = await import("../../../lib/muscleHeat.js");
    const { MUSCLE_MAP } = await import("../../../lib/muscleMap.generated.js");
    const first = (n) => (musclesForExercise(n, MUSCLE_MAP) || [])[0] || null;
    expect(first("Flat DB Press")).toBe("chest");
    expect(first("DB Overhead Press")).toBe("shoulders");
    expect(first("Dumbbell Bentover Rowing")).toBe("upperback");
    expect(first("Rope Tricep Pushdown")).toBe("triceps");
    expect(first("Sumo Squat")).toBe("quads");
    expect(first("Burpees")).toBe("quads");
    expect(first("Weight Shift")).toBeNull(); // unclear, so unknown rather than guessed
  });
});
