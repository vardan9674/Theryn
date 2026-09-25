// When a coach says "the first payment is due on the 1st of October", the
// dashboard has to say "due in 6 days", not "late by 24 days".
import { describe, it, expect } from "vitest";
import { cycleStartForDate, cycleEndForStart, athletePaymentStatus } from "../../../hooks/usePayments.ts";
import { paymentFact } from "../clientFacts.js";

const on = (iso) => new Date(`${iso}T10:00:00`);           // a local morning
const fee = (start, cadence = "monthly") => ({ id: "f1", athlete_id: "a1", amount: 5000, currency: "INR", cadence, start_date: start, active: true, notes: null });
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

describe("a fee that starts in the future", () => {
  it("is not late — the reported case, 1 Oct set on 25 Sep", () => {
    const s = athletePaymentStatus(fee("2026-10-01"), [], on("2026-09-25"));
    expect(s.status).toBe("upcoming");
    expect(s.label).toBe("Due in 6 days");
    expect(iso(s.cycleStart)).toBe("2026-10-01");
  });

  it("never invents a cycle before the coach's date", () => {
    for (const cadence of ["weekly", "monthly", "quarterly", "yearly"]) {
      const start = cycleStartForDate(cadence, "2026-10-01", on("2026-09-25"));
      expect(iso(start)).toBe("2026-10-01");
    }
  });

  it("counts down, then falls due, then goes late", () => {
    const f = fee("2026-10-01");
    expect(athletePaymentStatus(f, [], on("2026-09-30")).label).toBe("Due tomorrow");
    const due = athletePaymentStatus(f, [], on("2026-10-01"));
    expect(due.status).toBe("due");
    expect(due.label).toBe("Due today");
    const late = athletePaymentStatus(f, [], on("2026-10-03"));
    expect(late.status).toBe("overdue");
    expect(late.label).toBe("Late by 2 days");
  });

  it("reads as a quiet note on the dashboard, not a red one", () => {
    const f = paymentFact(fee("2026-10-01"), [], "INR", on("2026-09-25"));
    expect(f.status).toBe("upcoming");
    expect(f.label).toBe("Due in 6 days");
    expect(f.tone).toBe("muted");
  });

  it("is paid if the client pays early", () => {
    const paid = [{ id: "p1", athlete_id: "a1", amount: 5000, currency: "INR", received_date: "2026-10-02", notes: null }];
    expect(athletePaymentStatus(fee("2026-10-01"), paid, on("2026-10-05")).status).toBe("paid");
  });
});

describe("a fee that has already started", () => {
  it("still finds the cycle containing today", () => {
    const s = athletePaymentStatus(fee("2026-06-05"), [], on("2026-09-25"));
    expect(iso(s.cycleStart)).toBe("2026-09-05");
    expect(s.status).toBe("overdue");
    expect(s.label).toBe("Late by 20 days");
  });

  it("is paid when a payment landed inside this cycle", () => {
    const paid = [{ id: "p1", athlete_id: "a1", amount: 5000, currency: "INR", received_date: "2026-09-06", notes: null }];
    expect(athletePaymentStatus(fee("2026-06-05"), paid, on("2026-09-25")).status).toBe("paid");
  });

  it("ignores a payment from the cycle before", () => {
    const paid = [{ id: "p1", athlete_id: "a1", amount: 5000, currency: "INR", received_date: "2026-08-06", notes: null }];
    expect(athletePaymentStatus(fee("2026-06-05"), paid, on("2026-09-25")).status).toBe("overdue");
  });

  it("handles weekly, quarterly and yearly the same way", () => {
    expect(iso(cycleStartForDate("weekly", "2026-09-07", on("2026-09-25")))).toBe("2026-09-21");
    expect(iso(cycleStartForDate("quarterly", "2026-01-15", on("2026-09-25")))).toBe("2026-07-15");
    expect(iso(cycleStartForDate("yearly", "2024-03-10", on("2026-09-25")))).toBe("2026-03-10");
  });
});

describe("month ends", () => {
  it("bills on the last day of a short month instead of skipping into the next", () => {
    expect(iso(cycleStartForDate("monthly", "2026-01-31", on("2026-02-28")))).toBe("2026-02-28");
    // On the 30th of March the 31st hasn't come round yet, so February's cycle still stands.
    expect(iso(cycleStartForDate("monthly", "2026-01-31", on("2026-03-30")))).toBe("2026-02-28");
    expect(iso(cycleStartForDate("monthly", "2026-01-31", on("2026-03-31")))).toBe("2026-03-31");
  });

  it("gives a 31st fee a cycle that ends the day before the next one starts", () => {
    const start = cycleStartForDate("monthly", "2026-01-31", on("2026-02-28"));
    const end = cycleEndForStart("monthly", start);
    expect(end.getTime()).toBeGreaterThan(start.getTime());
  });

  it("puts a 29 February anchor on 28 February in an ordinary year", () => {
    expect(iso(cycleStartForDate("yearly", "2024-02-29", on("2026-06-01")))).toBe("2026-02-28");
  });
});

describe("the day the fee starts", () => {
  it("is due, not late, and not upcoming", () => {
    const s = athletePaymentStatus(fee("2026-09-25"), [], on("2026-09-25"));
    expect(s.status).toBe("due");
    expect(s.daysIntoCycle).toBe(0);
  });
});
