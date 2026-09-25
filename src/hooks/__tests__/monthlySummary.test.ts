// #102: "Still expected" on the Payments page.
import { describe, it, expect } from "vitest";
import { computeMonthlySummary } from "../usePayments";

const REF = new Date(2026, 8, 25, 12); // Fri 25 Sep 2026
const fee = (athlete_id: string, amount: number, cadence: any, start_date: string, active = true) =>
  ({ id: "f" + athlete_id, coach_id: "c", athlete_id, amount, currency: "USD", cadence, start_date, active, notes: null });
const pay = (athlete_id: string, amount: number, received_date: string) =>
  ({ id: "p" + athlete_id + received_date, coach_id: "c", athlete_id, amount, currency: "USD", received_date, notes: null });

describe("computeMonthlySummary", () => {
  it("counts only what each client still owes this month", () => {
    const fees = [fee("dana", 120, "monthly", "2026-06-24"), fee("priya", 150, "monthly", "2026-05-25"), fee("aisha", 180, "monthly", "2026-07-22")];
    const pays = [pay("aisha", 180, "2026-09-22"), pay("priya", 150, "2026-08-25")];
    const s = computeMonthlySummary(fees, pays, REF);
    expect(s.expectedThisMonth).toBe(450);
    expect(s.outstanding).toBe(270); // Dana (late) + Priya (due today); Aisha paid
    expect(s.receivedThisMonth).toBe(180);
  });

  it("one client's big payment never hides another client's unpaid cycle", () => {
    const fees = [fee("dana", 120, "monthly", "2026-06-24"), fee("yuki", 1200, "yearly", "2025-09-10")];
    const s = computeMonthlySummary(fees, [pay("yuki", 1200, "2026-09-10")], REF);
    expect(s.outstanding).toBe(120);
    expect(s.expectedThisMonth).toBe(1320);
  });

  it("weekly fees count each cycle that starts this month, paid or not", () => {
    // Mondays in September 2026: 7, 14, 21, 28 (anchor Mon 31 Aug).
    const fees = [fee("jonas", 40, "weekly", "2026-08-31")];
    const pays = [pay("jonas", 40, "2026-09-01"), pay("jonas", 40, "2026-09-08"), pay("jonas", 40, "2026-09-15"), pay("jonas", 40, "2026-09-22")];
    const s = computeMonthlySummary(fees, pays, REF);
    expect(s.expectedThisMonth).toBe(160); // 7, 14, 21, 28
    expect(s.outstanding).toBe(40); // the 28th
  });

  it("quarterly and yearly fees only count in the month they fall due; paused and future-month fees don't count", () => {
    const fees = [fee("q", 300, "quarterly", "2026-07-05"), fee("y", 1000, "yearly", "2026-03-01"), fee("off", 99, "monthly", "2026-01-01", false), fee("later", 50, "monthly", "2026-10-03")];
    const s = computeMonthlySummary(fees, [], REF);
    expect(s.expectedThisMonth).toBe(0);
    expect(s.outstanding).toBe(0);
  });

  it("a fee starting later this month is still expected this month", () => {
    const s = computeMonthlySummary([fee("new", 80, "monthly", "2026-09-28")], [], REF);
    expect(s.outstanding).toBe(80);
  });
});
