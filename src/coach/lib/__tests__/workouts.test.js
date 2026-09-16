import { describe, it, expect } from "vitest";
import { attachSubmissions, workoutDetail, workoutSummary, clientIdOfSubmission } from "../workouts.js";

const linkSub = (id, date, exercises, note = "") => ({ id, kind: "workout", submitted_at: `${date}T20:00:00Z`, athlete_id: "a1", payload: { date, type: "Push", exercises, note } });

describe("workouts", () => {
  it("resolves the dashboard client id of a submission", () => {
    expect(clientIdOfSubmission({ athlete_id: "a1" })).toBe("a1");
    expect(clientIdOfSubmission({ manual_client_id: "m1" })).toBe("manual:m1");
    expect(clientIdOfSubmission({ clientId: "manual:m9" })).toBe("manual:m9");
  });

  it("attaches a link submission to the promoted session by date, and by exercises when there are two that day", () => {
    const history = [
      { id: "s1", date: "2026-09-12", source: "link", exercises: [{ name: "Bench Press", sets: [{ w: "40", r: "8" }] }] },
      { id: "s2", date: "2026-09-12", source: "link", exercises: [{ name: "Squat", sets: [{ w: "60", r: "5" }] }] },
      { id: "s3", date: "2026-09-11", source: "app", exercises: [] },
    ];
    const subs = [
      linkSub("x", "2026-09-12", [{ name: "Squat", sets_planned: 3, sets_done: 3 }]),
      linkSub("y", "2026-09-12", [{ name: "Bench Press", sets_planned: 3, sets_done: 1 }]),
    ];
    const out = attachSubmissions(history, subs);
    expect(out[0].submission.id).toBe("y");
    expect(out[1].submission.id).toBe("x");
    expect(out[2].submission).toBeUndefined();
  });

  it("uses the submission itself for name-only clients (same id)", () => {
    const sub = linkSub("sub-1", "2026-09-10", [{ name: "Row", sets_planned: 3, sets_done: 2 }]);
    const out = attachSubmissions([{ id: "sub-1", date: "2026-09-10", source: "link", exercises: [] }], [sub]);
    expect(out[0].submission).toBe(sub);
  });

  it("describes a link workout: done vs planned, skipped, weight used over target, note", () => {
    const entry = { id: "s1", date: "2026-09-12", type: "Push", source: "link", exercises: [],
      submission: linkSub("y", "2026-09-12", [
        { name: "Bench Press", sets_planned: 3, sets_done: 3, reps: "8", weight_target: 40, weight_used: 42.5 },
        { name: "Row", sets_planned: 3, sets_done: 0, reps: "10", weight_target: 30, weight_used: null },
      ], "Felt strong") };
    const d = workoutDetail(entry);
    expect(d.viaLink).toBe(true);
    expect(d.totalSets).toBe(3);
    expect(d.plannedSets).toBe(6);
    expect(d.exercises[0]).toMatchObject({ done: 3, planned: 3, weight: 42.5, weightChanged: true, skipped: false });
    expect(d.exercises[1]).toMatchObject({ done: 0, planned: 3, weight: 30, weightChanged: false, skipped: true });
    expect(d.note).toBe("Felt strong");
    expect(workoutSummary(d)).toBe("3 of 6 sets");
  });

  it("describes an app workout from its sets", () => {
    const d = workoutDetail({ id: "s3", date: "2026-09-11", type: "Legs", duration: 2700, totalSets: 2, exercises: [{ name: "Squat", sets: [{ w: "60", r: "5" }, { w: "65", r: "5" }] }] });
    expect(d.viaLink).toBe(false);
    expect(d.exercises[0].sets).toEqual([{ w: "60", r: "5" }, { w: "65", r: "5" }]);
    expect(workoutSummary(d)).toBe("2 sets · 45 min");
  });
});
