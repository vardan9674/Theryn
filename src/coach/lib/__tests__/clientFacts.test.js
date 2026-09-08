import { describe, it, expect } from "vitest";
import { daysSinceLastWorkout, lastWorkoutLabel, weekProgress, routineStreak, whatToDo, paymentFact, attentionBucket, sortClients } from "../clientFacts.js";

// Wednesday 2026-09-09, midday local.
const NOW = new Date(2026, 8, 9, 12, 0, 0);
const routine = {
  Mon: { type: "Push", exercises: ["Bench Press"] },
  Tue: { type: "Pull", exercises: ["Deadlift"] },
  Wed: { type: "Rest", exercises: [] },
  Thu: { type: "Legs", exercises: ["Squat"] },
  Fri: { type: "Rest", exercises: [] },
  Sat: { type: "Upper", exercises: ["Row"] },
  Sun: { type: "Rest", exercises: [] },
};
const session = (date, type = "Push") => ({ id: date, date, type, duration: 3000, startedAt: date + "T10:00:00Z", exercises: [], totalSets: 10, totalVolume: 5000 });

describe("last workout", () => {
  it("handles empty history", () => {
    expect(daysSinceLastWorkout([], NOW)).toBeNull();
    expect(lastWorkoutLabel(null, NOW)).toBe("Never");
  });
  it("labels today, yesterday, N days", () => {
    expect(lastWorkoutLabel([session("2026-09-09")], NOW)).toBe("Today");
    expect(lastWorkoutLabel([session("2026-09-08")], NOW)).toBe("Yesterday");
    expect(lastWorkoutLabel([session("2026-09-04"), session("2026-09-01")], NOW)).toBe("5 days ago");
  });
});

describe("week progress", () => {
  it("counts planned days Mon..Sun and marks done/missed", () => {
    const wp = weekProgress([session("2026-09-07")], routine, NOW);
    expect(wp.planned).toBe(4); // Mon Tue Thu Sat
    expect(wp.done).toBe(1);
    const tue = wp.days.find((d) => d.key === "Tue");
    expect(tue.missed).toBe(true); // Tuesday planned, past, not done
    const thu = wp.days.find((d) => d.key === "Thu");
    expect(thu.missed).toBe(false); // upcoming
  });
  it("does not count a workout from last week", () => {
    const wp = weekProgress([session("2026-09-01")], routine, NOW);
    expect(wp.done).toBe(0);
  });
});

describe("streak", () => {
  it("counts rest days and stops at the first missed planned day", () => {
    // Mon 7th done, Tue 8th done, Wed 9th (today) is rest → 3
    const s = routineStreak([session("2026-09-07"), session("2026-09-08")], routine, NOW);
    expect(s).toBe(3);
  });
  it("is zero with no history", () => {
    expect(routineStreak([], routine, NOW)).toBe(0);
  });
});

describe("what to do", () => {
  it("flags long inactivity as urgent", () => {
    const r = whatToDo({ history: [session("2026-06-01")], routine, weights: [], measurements: [] }, NOW);
    expect(r.severity).toBe("urgent");
    expect(r.text.toLowerCase()).toContain("no activity");
  });
  it("falls back to a calm sentence when nothing is wrong", () => {
    const r = whatToDo({ history: [], routine, weights: [], measurements: [] }, NOW);
    expect(r.text).toMatch(/Nothing needed|check-in|activity|first routine/i);
  });
});

describe("payment fact", () => {
  const fee = { id: "f", coach_id: "c", athlete_id: "a", amount: 120, currency: "USD", cadence: "monthly", start_date: "2026-08-01", active: true, notes: null };
  it("paid when a payment lands in the current cycle", () => {
    const p = paymentFact(fee, [{ id: "p", coach_id: "c", athlete_id: "a", amount: 120, currency: "USD", received_date: "2026-09-02", notes: null }], "USD", NOW);
    expect(p.status).toBe("paid");
  });
  it("late by N days when the cycle started and nothing was paid", () => {
    // Monthly anchored on the 1st; NOW is the 9th → 8 days into the cycle.
    const p = paymentFact(fee, [], "USD", NOW);
    expect(p.status).toBe("overdue");
    expect(p.label).toBe("Late by 8 days");
  });
  it("due today on the first day of a cycle", () => {
    const p = paymentFact({ ...fee, start_date: "2026-09-09" }, [], "USD", NOW);
    expect(p.status).toBe("due");
    expect(p.label).toBe("Due today");
  });
  it("paused when the fee is switched off", () => {
    expect(paymentFact({ ...fee, active: false }, [], "USD", NOW).label).toBe("Paused");
  });
  it("no fee set when there is no fee", () => {
    expect(paymentFact(null, [], "USD", NOW).label).toBe("No fee set");
  });
});

describe("buckets and sorting", () => {
  it("ranks attention before payment before ok", () => {
    const rows = [
      { name: "Zed", bucket: attentionBucket({ todo: { severity: null }, payment: { status: "paid" } }) },
      { name: "Amy", bucket: attentionBucket({ todo: { severity: "urgent" }, payment: { status: "paid" } }) },
      { name: "Bob", bucket: attentionBucket({ todo: { severity: null }, payment: { status: "overdue" } }) },
    ];
    expect(sortClients(rows).map((r) => r.name)).toEqual(["Amy", "Bob", "Zed"]);
  });
});
