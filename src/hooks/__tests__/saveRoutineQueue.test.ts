// #129: a plan save that the server refused is an error, not "saved offline".
import { describe, it, expect, vi } from "vitest";

vi.mock("../../lib/supabase", () => ({ supabase: {} }));
const { shouldQueueRoutine } = await import("../useRoutine");

describe("shouldQueueRoutine", () => {
  it("queues when the request never got through", () => {
    expect(shouldQueueRoutine(new TypeError("Failed to fetch"))).toBe(true);
    expect(shouldQueueRoutine(new TypeError("Load failed"))).toBe(true); // Safari
    expect(shouldQueueRoutine(new Error("NetworkError when attempting to fetch resource."))).toBe(true);
  });
  it("does not queue what the server refused", () => {
    expect(shouldQueueRoutine(new Error("new row violates row-level security policy for table \"routine_days\""))).toBe(false);
    expect(shouldQueueRoutine(new Error("Could not save Mon's exercises: value too long"))).toBe(false);
    expect(shouldQueueRoutine(new Error("Couldn't find \"Zercher hold\". Nothing was changed; try again."))).toBe(false);
  });
});
