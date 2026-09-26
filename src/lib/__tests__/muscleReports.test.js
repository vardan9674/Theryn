// "Wrong muscle?" reports: failures read as plain sentences.
import { describe, it, expect, vi } from "vitest";
vi.mock("../supabase", () => ({ supabase: { rpc: vi.fn() } }));
import { friendlyReportError } from "../muscleReports.js";

describe("friendlyReportError", () => {
  it("a second report from the same person", () => {
    expect(friendlyReportError({ code: "23505", message: "duplicate key" })).toBe("You've already reported this exercise. We'll look into it.");
  });
  it("the server function is not there yet", () => {
    expect(friendlyReportError({ code: "PGRST202", message: "Could not find the function" })).toBe("Reports aren't switched on yet. Please try again later.");
  });
  it("offline", () => {
    expect(friendlyReportError(new TypeError("Failed to fetch"))).toBe("Couldn't send. Check your connection and try again.");
  });
  it("never shows raw server text", () => {
    expect(friendlyReportError({ code: "XX000", message: "internal error at line 3" })).toBe("Couldn't send the report. Please try again.");
  });
});
