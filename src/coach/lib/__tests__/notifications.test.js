import { describe, it, expect } from "vitest";
import { buildNotifications, unreadCount, groupByDay } from "../notifications.js";

const clients = [{ athlete_id: "a1", athlete_name: "Vaishnavi Gillala" }, { athlete_id: "manual:m1", athlete_name: "Ravi Patel" }];

describe("notifications", () => {
  it("builds workout and measurement items from submissions and app sessions, newest first, with unread against seenAt", () => {
    const items = buildNotifications({
      clients,
      seenAt: "2026-09-12T12:00:00Z",
      submissions: [
        { id: "s1", kind: "workout", submitted_at: "2026-09-13T00:49:10Z", athlete_id: "a1", payload: { type: "Full Body", exercises: [{ sets_planned: 3, sets_done: 3 }, { sets_planned: 3, sets_done: 2 }], note: "I feel okay" } },
        { id: "s2", kind: "measurements", submitted_at: "2026-09-11T00:00:00Z", manual_client_id: "m1", payload: { unit: "imperial", weight: 168, chest: 36, waist: 28 } },
        { id: "s3", kind: "workout", submitted_at: "2026-09-13T01:00:00Z", athlete_id: "nobody", payload: {} },
      ],
      sessions: [{ id: "w1", athlete_id: "a1", type: "Push", completed_at: "2026-09-12T18:00:00Z", totalSets: 12, durationMin: 48 }],
    });
    expect(items.map((i) => i.id)).toEqual(["sub:s1", "ses:w1", "sub:s2"]);
    expect(items[0]).toMatchObject({ title: "Vaishnavi finished Full Body via their link", body: '5 of 6 sets · "I feel okay"', tab: "progress", unread: true });
    expect(items[1]).toMatchObject({ title: "Vaishnavi logged Push in the app", body: "12 sets · 48 min", unread: true });
    expect(items[2]).toMatchObject({ title: "Ravi sent measurements", body: "168 lb · chest 36, waist 28 in", tab: "body", clientId: "manual:m1", unread: false });
    expect(unreadCount(items)).toBe(2);
  });

  it("groups by local day", () => {
    const now = new Date(2026, 8, 13, 15, 0, 0);
    const g = groupByDay([{ at: new Date(2026, 8, 13, 9).toISOString() }, { at: new Date(2026, 8, 12, 23).toISOString() }, { at: new Date(2026, 8, 1).toISOString() }], now);
    expect(g.map((x) => [x.label, x.items.length])).toEqual([["Today", 1], ["Yesterday", 1], ["Earlier", 1]]);
  });
});
