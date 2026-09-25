// #99: cardio distance and duration reach workout_sets; a database without the
// columns yet still saves the rest. Supabase is mocked.
import { describe, it, expect, vi, beforeEach } from "vitest";

const store = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, String(v)); }, removeItem: (k: string) => { store.delete(k); } };

const inserts: any[] = [];
let setsError: any = null;
const q = (table: string): any => {
  const b: any = {
    insert: (v: any) => { inserts.push({ table, v }); b._v = v; return b; },
    select: () => b, eq: () => b, ilike: () => b, limit: () => b, delete: () => b,
    maybeSingle: () => Promise.resolve({ data: { id: "ex1" }, error: null }),
    single: () => Promise.resolve({ data: { id: table === "workout_sessions" ? "sess1" : "ex1" }, error: null }),
    then: (res: any) => {
      if (table === "workout_sets") { const e = setsError; setsError = null; return Promise.resolve({ error: e }).then(res); }
      return Promise.resolve({ data: [{ id: "ex1", name: "Run" }], error: null }).then(res);
    },
  };
  return b;
};
vi.mock("../../lib/supabase", () => ({ supabase: { from: (t: string) => q(t), rpc: () => Promise.resolve({ data: [{ id: "ex1", name: "Run" }], error: null }) } }));
vi.mock("../../lib/offlineQueue", async (orig) => ({ ...(await orig() as any), enqueueAction: () => {} }));
const { saveCompletedWorkout } = await import("../useWorkouts");

const workout = { type: "Cardio", startedAt: "2026-09-25T07:00:00.000Z", duration: 1800, totalSets: 1, totalVolume: 0,
  exercises: [{ name: "Run", sets: [{ dist: "5.2", dur: "30" }] }] } as any;

beforeEach(() => { inserts.length = 0; setsError = null; store.clear(); });

describe("#99 cardio sets", () => {
  it("saves distance and the minutes as seconds", async () => {
    await saveCompletedWorkout("u1", workout);
    const sets = inserts.filter((i) => i.table === "workout_sets").map((i) => i.v)[0];
    expect(sets[0]).toMatchObject({ distance: 5.2, duration_seconds: 1800, weight: null, reps: null });
  });

  it("before the columns exist, retries without them instead of failing", async () => {
    setsError = { code: "PGRST204", message: "Could not find the 'distance' column of 'workout_sets'" };
    await expect(saveCompletedWorkout("u1", workout)).resolves.toBe("sess1");
    const tries = inserts.filter((i) => i.table === "workout_sets").map((i) => i.v[0]);
    expect(tries).toHaveLength(2);
    expect(tries[1]).not.toHaveProperty("distance");
  });
});
