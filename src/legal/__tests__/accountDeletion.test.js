import { describe, it, expect } from "vitest";
import { cleanupSteps, runCleanup } from "../../../supabase/functions/delete-account/steps.ts";
import { LEGAL, legalTodos, fact } from "../legalConfig.js";

// A stand-in for the supabase-js query builder that records every call.
function fakeClient(errors = {}) {
  const calls = [];
  const builder = (table, op, payload) => {
    const call = { table, op, payload, filters: [] };
    calls.push(call);
    const q = {
      eq(c, v) { call.filters.push(["eq", c, v]); return q; },
      is(c, v) { call.filters.push(["is", c, v]); return q; },
      ilike(c, v) { call.filters.push(["ilike", c, v]); return q; },
      then(res, rej) { return Promise.resolve({ error: errors[table] || null }).then(res, rej); },
    };
    return q;
  };
  return { calls, from: (t) => ({ update: (v) => builder(t, "update", v), delete: () => builder(t, "delete") }) };
}

describe("delete-account clean-up", () => {
  const uid = "11111111-2222-3333-4444-555555555555";

  it("only ever targets the signed-in user's own id or email", async () => {
    const c = fakeClient();
    await runCleanup(c, cleanupSteps(uid, "Asha_100%@Example.com"));
    for (const call of c.calls) {
      const values = call.filters.map((f) => f[2]).filter((v) => v !== null && v !== "pending");
      expect(values.length).toBeGreaterThan(0);
      for (const v of values) expect([uid, "Asha\\_100\\%@Example.com"]).toContain(v);
    }
  });

  it("escapes LIKE wildcards in the email, so it can't match other people's invites", async () => {
    const c = fakeClient();
    await runCleanup(c, cleanupSteps(uid, "a%b_c@x.io"));
    const invite = c.calls.find((x) => x.table === "coach_athletes");
    expect(invite.op).toBe("delete");
    expect(invite.filters).toContainEqual(["ilike", "coach_email", "a\\%b\\_c@x.io"]);
    expect(invite.filters).toContainEqual(["is", "coach_id", null]);
    expect(invite.filters).toContainEqual(["eq", "status", "pending"]);
  });

  it("removes the name and email copied into a coach's link, without deleting the link", async () => {
    const c = fakeClient();
    await runCleanup(c, cleanupSteps(uid, null));
    const link = c.calls.find((x) => x.table === "client_links");
    expect(link.op).toBe("update");
    expect(link.payload).toEqual({ connected_name: null, connected_email: null });
    expect(c.calls.some((x) => x.table === "coach_athletes")).toBe(false); // no email, no invite clean-up
  });

  it("skips a table this database doesn't have, but stops on a real error", async () => {
    const missing = fakeClient({ exercise_muscle_status: { code: "42P01", message: "relation does not exist" } });
    await expect(runCleanup(missing, cleanupSteps(uid, null))).resolves.toEqual(["exercise_muscle_status: 42P01"]);
    const broken = fakeClient({ client_links: { code: "42501", message: "permission denied" } });
    await expect(runCleanup(broken, cleanupSteps(uid, null))).rejects.toThrow("client_links: permission denied");
  });
});

describe("legal facts", () => {
  it("never shows a TODO placeholder as if it were a fact", () => {
    for (const k of legalTodos()) expect(fact(k)).toBe("[to be added]");
    expect(fact("appName")).toBe("Theryn");
    expect(LEGAL.minimumAge).toBeGreaterThanOrEqual(13);
  });
});
