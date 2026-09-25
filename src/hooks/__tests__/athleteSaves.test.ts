// QA pass 2026-09-25: #109 (refusals aren't "saved offline") and #110 (every
// measurement field reaches its column). Supabase is mocked.
import { describe, it, expect, vi, beforeEach } from "vitest";

// A small in-memory localStorage (Node has none).
const store = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, String(v)); }, removeItem: (k: string) => { store.delete(k); }, clear: () => store.clear(), key: () => null, length: 0 };

const calls: any[] = [];
let nextResult: any = { data: { id: "row1" }, error: null };
let selectRows: any[] = [];
const chain = (table: string) => {
  const q: any = {
    insert: (v: any) => { calls.push({ table, op: "insert", v }); return q; },
    upsert: (v: any) => { calls.push({ table, op: "upsert", v }); return q; },
    delete: () => { calls.push({ table, op: "delete" }); return q; },
    select: () => q, eq: () => q, order: () => q, limit: () => Promise.resolve({ data: selectRows, error: null }),
    single: () => Promise.resolve(typeof nextResult === "function" ? nextResult(table) : nextResult),
    then: (res: any) => Promise.resolve({ error: null }).then(res),
  };
  return q;
};
vi.mock("../../lib/supabase", () => ({ supabase: { from: (t: string) => chain(t) } }));
const queued: any[] = [];
vi.mock("../../lib/offlineQueue", async (orig) => {
  const real: any = await orig();
  return { ...real, enqueueAction: (a: any) => queued.push(a) };
});

const { saveMeasurement, loadMeasurements, saveBodyWeight } = await import("../useBody");
const { shouldQueueForLater } = await import("../../lib/offlineQueue");

beforeEach(() => { calls.length = 0; queued.length = 0; nextResult = { data: { id: "row1" }, error: null }; selectRows = []; store.clear(); });

describe("#109 what gets queued for later", () => {
  it("queues outages, not refusals", () => {
    expect(shouldQueueForLater(new TypeError("Failed to fetch"))).toBe(true);
    expect(shouldQueueForLater({ status: 503 })).toBe(true);
    expect(shouldQueueForLater({ code: "22003", message: "numeric field overflow" })).toBe(false);
    expect(shouldQueueForLater({ status: 403 })).toBe(false);
  });

  it("a refused body weight throws with its code and is not queued", async () => {
    nextResult = { data: null, error: { code: "22003", message: "numeric field overflow" } };
    await expect(saveBodyWeight("u1", 99999, "2026-09-25")).rejects.toMatchObject({ code: "22003" });
    expect(queued).toHaveLength(0);
  });

  it("a body weight saved while offline is queued", async () => {
    nextResult = () => { throw new TypeError("Failed to fetch"); };
    await expect(saveBodyWeight("u1", 180, "2026-09-25")).resolves.toBe("offline_saved");
    expect(queued.map((q) => q.type)).toEqual(["SAVE_WEIGHT"]);
  });
});

describe("#110 every measurement field reaches its column", () => {
  it("the Body screen's keys (l_arm, r_calf, neck…) are saved", async () => {
    await saveMeasurement("u1", { chest: 40, l_arm: "14.5", r_arm: 14.6, l_thigh: 22, r_thigh: 22.1, calves: 15, r_calf: 15.2, neck: 15.5, shoulders: 48, forearm: 12, custom_thing: 3 }, "2026-09-25");
    const row = calls.find((c) => c.table === "body_measurements" && c.op === "insert").v;
    expect(row).toEqual({ user_id: "u1", logged_at: "2026-09-25", chest: 40, bicep_l: 14.5, bicep_r: 14.6, thigh_l: 22, thigh_r: 22.1, calf_l: 15, calf_r: 15.2, neck: 15.5, shoulders: 48, forearm_l: 12 });
  });

  it("the coach's keys (lArm, rCalf…) are saved too", async () => {
    await saveMeasurement("u1", { lArm: 13, rCalf: 14, lForearm: 11 }, "2026-09-25");
    const row = calls.find((c) => c.op === "insert").v;
    expect(row).toMatchObject({ bicep_l: 13, calf_r: 14, forearm_l: 11 });
  });

  it("loading gives both spellings back", async () => {
    selectRows = [{ id: "m1", logged_at: "2026-09-25", chest: "40", bicep_l: "14.5", calf_r: "15.2", neck: "15.5" }];
    const [m] = await loadMeasurements("u1", { fresh: true });
    expect(m).toMatchObject({ id: "m1", date: "2026-09-25", chest: 40, lArm: 14.5, l_arm: 14.5, rCalf: 15.2, r_calf: 15.2, neck: 15.5 });
  });
});
