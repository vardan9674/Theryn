// Payment totals across currencies: convert, never just relabel.
import { describe, it, expect } from "vitest";
import { describeTotal, convert, sumByCurrency, loadRates } from "../money.js";
import { computeMonthlySummary } from "../../../hooks/usePayments.ts";

const RATES = { USD: 1, INR: 96, EUR: 0.88 };

describe("describeTotal", () => {
  it("one currency, the coach's own: exact, no note", () => {
    expect(describeTotal({ INR: 12000 }, "INR", RATES)).toEqual({ main: "₹12,000", note: null, converted: false });
  });
  it("switching the coach's currency converts the number, not just the symbol", () => {
    const usd = describeTotal({ USD: 620 }, "USD", RATES).main;
    const inr = describeTotal({ USD: 620 }, "INR", RATES);
    expect(usd).toBe("$620");
    expect(inr.main).toBe("≈ ₹59,520");
    expect(inr.note).toBe("$620");
    expect(inr.converted).toBe(true);
  });
  it("mixed currencies add up after converting, with the parts underneath", () => {
    const t = describeTotal({ USD: 150, INR: 8000 }, "INR", RATES);
    expect(t.main).toBe("≈ ₹22,400");
    expect(t.note).toBe("₹8,000 + $150");
  });
  it("without rates, shows each currency instead of a wrong single number", () => {
    expect(describeTotal({ USD: 150, INR: 8000 }, "INR", null)).toEqual({ main: "₹8,000 + $150", note: null, converted: false });
  });
  it("nothing owed reads zero in the coach's currency", () => {
    expect(describeTotal({}, "INR", RATES).main).toBe("₹0");
  });
});

describe("helpers", () => {
  it("convert goes through USD and refuses unknown currencies", () => {
    expect(convert(96, "INR", "USD", RATES)).toBe(1);
    expect(convert(10, "XYZ", "USD", RATES)).toBe(null);
  });
  it("sumByCurrency groups and skips blanks", () => {
    expect(sumByCurrency([{ a: 100, c: "USD" }, { a: 50, c: "USD" }, { a: 800, c: "INR" }, { a: null, c: "INR" }], (x) => x.a, (x) => x.c)).toEqual({ USD: 150, INR: 800 });
  });
  it("the monthly summary keeps each fee's currency", () => {
    const fee = (id, amount, currency) => ({ id, coach_id: "c", athlete_id: id, amount, currency, cadence: "monthly", start_date: "2026-08-20", active: true, notes: null });
    const s = computeMonthlySummary([fee("a", 150, "USD"), fee("b", 8000, "INR")], [{ id: "p", coach_id: "c", athlete_id: "a", amount: 150, currency: "USD", received_date: "2026-09-20", notes: null }], new Date(2026, 8, 25, 12));
    expect(s.receivedByCurrency).toEqual({ USD: 150 });
    expect(s.outstandingByCurrency).toEqual({ INR: 8000 });
  });
});

describe("loadRates", () => {
  const memory = () => { let v = null; return { get: () => v, set: (x) => { v = x; } }; };
  const ok = (rates) => async () => ({ json: async () => ({ result: "success", rates, time_last_update_utc: "Sat, 26 Sep 2026 00:02:32 +0000" }) });
  it("fetches, caches for 12 hours, then refreshes", async () => {
    const cache = memory();
    let calls = 0;
    const f = async (...a) => { calls++; return ok(RATES)(...a); };
    const r1 = await loadRates({ fetchImpl: f, now: 0, cache });
    expect(r1.rates.INR).toBe(96); expect(r1.day).toBe("2026-09-26");
    await loadRates({ fetchImpl: f, now: 60 * 60 * 1000, cache });
    expect(calls).toBe(1);
    await loadRates({ fetchImpl: f, now: 13 * 60 * 60 * 1000, cache });
    expect(calls).toBe(2);
  });
  it("offline: uses the last rates it had, or nothing", async () => {
    const cache = memory();
    const down = async () => { throw new TypeError("Failed to fetch"); };
    expect(await loadRates({ fetchImpl: down, now: 0, cache })).toBe(null);
    await loadRates({ fetchImpl: ok(RATES), now: 0, cache });
    expect((await loadRates({ fetchImpl: down, now: 20 * 60 * 60 * 1000, cache })).rates.INR).toBe(96);
  });
});
