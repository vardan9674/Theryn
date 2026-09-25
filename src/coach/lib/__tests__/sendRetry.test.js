// Finishing a workout when the signal drops: one tap has to mean one workout.
import { describe, it, expect } from "vitest";
import { isNetworkError, sendWithRetry, sendKey } from "../../../link/sendRetry.js";

const nope = () => Promise.resolve(); // no real waiting in tests

describe("isNetworkError", () => {
  it("knows a dropped connection from a refusal", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);        // Chrome
    expect(isNetworkError(new TypeError("Load failed"))).toBe(true);            // Safari on iOS
    expect(isNetworkError(new Error("NetworkError when attempting to fetch"))).toBe(true);
    expect(isNetworkError(new Error("Network request failed"))).toBe(true);
    expect(isNetworkError(new Error("Could not send. Try again in a moment."))).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
  });
});

describe("sendWithRetry", () => {
  it("sends once when the first try works", async () => {
    let calls = 0;
    const res = await sendWithRetry(async () => { calls++; return { ok: true, id: "1" }; }, {}, { wait: nope });
    expect(calls).toBe(1);
    expect(res).toEqual({ ok: true, id: "1" });
  });

  it("tries again after a dropped connection, and sends the same payload", async () => {
    const seen = [];
    const submit = async (p) => { seen.push(p); if (seen.length < 3) throw new TypeError("Failed to fetch"); return { ok: true, id: "3" }; };
    const payload = { client_key: "k1", date: "2026-09-24" };
    const res = await sendWithRetry(submit, payload, { wait: nope });
    expect(res.id).toBe("3");
    expect(seen).toHaveLength(3);
    expect(seen.every((p) => p.client_key === "k1")).toBe(true); // one workout, not three
  });

  it("gives up after three dropped connections", async () => {
    let calls = 0;
    await expect(sendWithRetry(async () => { calls++; throw new TypeError("Failed to fetch"); }, {}, { wait: nope }))
      .rejects.toThrow(/failed to fetch/i);
    expect(calls).toBe(3);
  });

  it("does not retry when the server answered", async () => {
    let calls = 0;
    await expect(sendWithRetry(async () => { calls++; throw new Error("That link isn't active any more."); }, {}, { wait: nope }))
      .rejects.toThrow(/isn't active/);
    expect(calls).toBe(1);
  });

  it("passes a refusal straight back instead of retrying it", async () => {
    let calls = 0;
    const res = await sendWithRetry(async () => { calls++; return { ok: false, reason: "too_many" }; }, {}, { wait: nope });
    expect(res).toEqual({ ok: false, reason: "too_many" });
    expect(calls).toBe(1);
  });

  it("waits longer before each retry", async () => {
    const waits = [];
    await sendWithRetry(async () => { if (waits.length < 2) throw new TypeError("Failed to fetch"); return { ok: true }; }, {},
      { wait: (ms) => { waits.push(ms); return Promise.resolve(); } });
    expect(waits).toEqual([1200, 2400]);
  });
});

describe("sendKey", () => {
  it("is different every time", () => {
    const keys = new Set(Array.from({ length: 200 }, sendKey));
    expect(keys.size).toBe(200);
    expect(sendKey().length).toBeLessThanOrEqual(64);
  });
});
