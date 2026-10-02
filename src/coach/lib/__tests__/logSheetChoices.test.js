import { describe, it, expect } from "vitest";
import { planWorkouts, planForDay, restPayload, isRestMark, linkClientData } from "../clientLinks.js";
import { streakStats, consistencyStats } from "../streak.js";
import { weekProgress } from "../clientFacts.js";
import { readDraft, saveDraft, isEmpty } from "../logDraft.js";

// Minhaj's week: Push on Mon and Thu, Pull Tue and Fri, Legs Wed, Run Sat.
const ex = (name) => ({ name, sets: 3, reps: "10" });
const plan = {
  Mon: { type: "Push", exercises: [ex("Bench Press"), ex("Cable Fly")] },
  Tue: { type: "Pull", exercises: [ex("Lat Pulldown"), ex("Row")] },
  Wed: { type: "Legs", exercises: [ex("Squat")] },
  Thu: { type: "Push", exercises: [ex("Bench Press"), ex("Cable Fly")] },
  Fri: { type: "Pull", exercises: [ex("Lat Pulldown"), ex("Row")] },
  Sat: { type: "Run", exercises: [{ name: "Run", mode: "time", sets: 1, secs: 1800 }] },
  Sun: { type: "Rest", exercises: [] },
};
const thu = new Date(2026, 9, 1, 12); // Thursday, Oct 1 2026
const sun = new Date(2026, 8, 27, 12);

describe("what they did instead of the day's plan", () => {
  it("lists each workout in the plan once, in week order", () => {
    expect(planWorkouts(plan)).toEqual([{ key: "Mon", type: "Push" }, { key: "Tue", type: "Pull" }, { key: "Wed", type: "Legs" }, { key: "Sat", type: "Run" }]);
  });
  it("swaps Push for Pull on Thursday: Pull's exercises, still Thursday", () => {
    const p = planForDay(plan, thu, "Pull");
    expect(p).toMatchObject({ key: "Thu", type: "Pull", isRest: false, swappedFrom: "Push" });
    expect(p.exercises.map((e) => e.name)).toEqual(["Lat Pulldown", "Row"]);
  });
  it("keeps the day's plan when nothing or the same workout is picked", () => {
    expect(planForDay(plan, thu).type).toBe("Push");
    expect(planForDay(plan, thu, "push").swappedFrom).toBeUndefined();
  });
  it("lets a workout be logged on a rest day", () => {
    expect(planForDay(plan, sun, "Legs")).toMatchObject({ key: "Sun", type: "Legs", isRest: false, swappedFrom: "Rest" });
  });
});

describe("a day marked as rested", () => {
  const rest = { id: "r1", kind: "workout", submitted_at: "2026-10-01T05:00:00Z", payload: restPayload("2026-10-01", "Fever") };
  it("is saved as the coach's, with no exercises", () => {
    expect(rest.payload).toMatchObject({ date: "2026-10-01", local_date: "2026-10-01", day: "Thu", type: "Rest", rest: true, exercises: [], note: "Fever", logged_by: "coach" });
    expect(isRestMark(rest)).toBe(true);
    expect(isRestMark({ payload: { rest: true } })).toBe(false); // only the coach marks rest
  });
  it("isn't a workout, but is listed as a rested day", () => {
    const d = linkClientData([rest], { plan, coachUnits: "metric" });
    expect(d.history).toEqual([]);
    expect(d.restDates).toEqual(["2026-10-01"]);
  });
  it("keeps the streak like a rest day, and isn't missed or counted as planned", () => {
    const done = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-02"]; // Mon Tue Wed, rested Thu, Fri
    const now = new Date(2026, 9, 2, 20);
    expect(streakStats(done, plan, now).current).toBe(1); // without the mark Thursday breaks it
    expect(streakStats(done, plan, now, ["2026-10-01"]).current).toBe(4);
    expect(streakStats(done, plan, now, ["2026-10-01"]).days.find((x) => x.iso === "2026-10-01").state).toBe("rest");
    const c = consistencyStats(done, plan, "2026-09-28", now, ["2026-10-01"]);
    expect(c).toMatchObject({ planned: 4, done: 4, pct: 100 });
    const w = weekProgress(done.map((date) => ({ date })), plan, now, ["2026-10-01"]);
    expect(w.days.find((x) => x.iso === "2026-10-01")).toMatchObject({ planned: false, rested: true, missed: false });
  });
});

describe("the log sheet's draft", () => {
  const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
  it("remembers the workout picked instead of the plan", () => {
    const s = mem();
    saveDraft("c1", "2026-10-01", { ticks: {}, kind: "Pull" }, {}, s);
    expect(readDraft("c1", "2026-10-01", s).kind).toBe("Pull");
    expect(isEmpty({ ticks: {}, kind: "Pull" })).toBe(false);
    expect(isEmpty({ ticks: {} })).toBe(true);
  });
});

describe("replacing a swapped workout", () => {
  it("drops the old \"instead of\" when it goes back to the planned workout", async () => {
    const { replacePayload } = await import("../clientLinks.js");
    const pull = { date: "2026-09-28", type: "Pull", instead_of: "Push", logged_by: "coach", exercises: [] };
    expect(replacePayload(pull, { date: "2026-09-28", type: "Push", exercises: [] }).instead_of).toBeUndefined();
    expect(replacePayload(pull, { date: "2026-09-28", type: "Legs", instead_of: "Push", exercises: [] }).instead_of).toBe("Push");
  });
});
