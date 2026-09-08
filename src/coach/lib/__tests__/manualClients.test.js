import { describe, it, expect } from "vitest";
import { isManualId, manualIdOf, toClientId, manualToClient, manualFeeRow, manualPaymentRows, parseManualPaymentId, parseManualFeeId, cleanName, fullName } from "../manualClients.js";

const row = {
  id: "abc-123", coach_id: "coach-1", first_name: " Priya ", last_name: "Sharma", created_at: "2026-09-01T10:00:00Z",
  plan: { Mon: { type: "Push", exercises: ["Bench Press"] } },
  fee: { amount: "120", cadence: "monthly", start_date: "2026-09-01" },
  payments: [{ id: "p1", amount: 120, received_date: "2026-08-01" }, { id: "p2", amount: 120, currency: "USD", received_date: "2026-09-01", notes: "cash" }],
};

describe("manual client ids", () => {
  it("round-trips the prefix", () => {
    expect(isManualId(toClientId("x"))).toBe(true);
    expect(isManualId("x")).toBe(false);
    expect(manualIdOf(toClientId("abc"))).toBe("abc");
    expect(manualIdOf("abc")).toBeNull();
  });
  it("parses fee and payment ids", () => {
    expect(parseManualFeeId("manualfee:abc")).toEqual({ manualId: "abc" });
    expect(parseManualPaymentId("manualpay:abc:p1")).toEqual({ manualId: "abc", paymentId: "p1" });
    expect(parseManualPaymentId("real-uuid")).toBeNull();
  });
});

describe("shapes", () => {
  it("maps a row to a client with a trimmed full name", () => {
    const c = manualToClient(row);
    expect(c.athlete_id).toBe("manual:abc-123");
    expect(c.athlete_name).toBe("Priya Sharma");
    expect(c.manual).toBe(true);
    expect(fullName({ first_name: "Sam", last_name: "" })).toBe("Sam");
  });
  it("maps fee JSON to a ClientFee with defaults", () => {
    const f = manualFeeRow(row, "EUR");
    expect(f.amount).toBe(120);
    expect(f.currency).toBe("EUR");
    expect(f.active).toBe(true);
    expect(f.athlete_id).toBe("manual:abc-123");
    expect(manualFeeRow({ ...row, fee: null })).toBeNull();
  });
  it("maps payments newest first with composite ids", () => {
    const p = manualPaymentRows(row);
    expect(p.map((x) => x.received_date)).toEqual(["2026-09-01", "2026-08-01"]);
    expect(p[0].id).toBe("manualpay:abc-123:p2");
    expect(manualPaymentRows({ ...row, payments: null })).toEqual([]);
  });
  it("cleans names", () => {
    expect(cleanName("  Dana ", "Kim")).toEqual({ first_name: "Dana", last_name: "Kim" });
    expect(cleanName("x".repeat(80), "").first_name.length).toBe(60);
  });
});
