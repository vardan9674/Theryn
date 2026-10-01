// Account deletion — the clean-up that has to run before the auth user is removed.
//
// Deleting a row in auth.users cascades through profiles to every table that
// holds the person's data (workouts, body data, routines, messages, coach
// links, plans, payments, reports, device tokens …). These steps cover the
// few places a foreign key doesn't reach: personal details copied into other
// rows, and tables that store a user id without a foreign key.
//
// Kept free of Deno imports so it can be unit-tested with vitest.

export type Step =
  | { kind: "update"; table: string; set: Record<string, null>; where: Record<string, string>; why: string }
  | { kind: "delete"; table: string; where: Record<string, string>; why: string }
  | { kind: "deleteIlike"; table: string; column: string; value: string; also: Record<string, unknown>; why: string };

export function cleanupSteps(userId: string, email: string | null): Step[] {
  const steps: Step[] = [
    { kind: "update", table: "client_links", set: { connected_name: null, connected_email: null }, where: { connected_user_id: userId },
      why: "name and email copied from the account when it connected to a coach's link" },
    { kind: "delete", table: "coach_code_attempts", where: { coach_id: userId }, why: "no foreign key" },
    { kind: "delete", table: "exercise_muscle_reports", where: { reporter: userId }, why: "no foreign key" },
    { kind: "update", table: "exercise_muscle_reports", set: { resolved_by: null }, where: { resolved_by: userId }, why: "no foreign key" },
    { kind: "update", table: "exercise_muscle_status", set: { checked_by: null }, where: { checked_by: userId }, why: "no foreign key" },
  ];
  if (email) {
    steps.push({ kind: "deleteIlike", table: "coach_athletes", column: "coach_email", value: email, also: { coach_id: null, status: "pending" },
      why: "invites addressed to this email that were never accepted" });
  }
  return steps;
}

// Minimal shape of the supabase-js query builder these steps need.
type Filterable = {
  eq(col: string, v: unknown): Filterable;
  is(col: string, v: null): Filterable;
  ilike(col: string, v: string): Filterable;
  then: PromiseLike<{ error: { message: string; code?: string } | null }>["then"];
};
type Client = { from(t: string): { update(v: Record<string, null>): Filterable; delete(): Filterable } };

// A table or column that isn't in this database yet (an optional feature that
// was never migrated) must not stop someone deleting their account.
const MISSING = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);

export async function runCleanup(client: Client, steps: Step[]): Promise<string[]> {
  const skipped: string[] = [];
  for (const s of steps) {
    let q: Filterable;
    if (s.kind === "update") {
      q = client.from(s.table).update(s.set);
      for (const [k, v] of Object.entries(s.where)) q = q.eq(k, v);
    } else if (s.kind === "delete") {
      q = client.from(s.table).delete();
      for (const [k, v] of Object.entries(s.where)) q = q.eq(k, v);
    } else {
      q = client.from(s.table).delete().ilike(s.column, s.value.replace(/[%_\\]/g, (c) => "\\" + c));
      for (const [k, v] of Object.entries(s.also)) q = v === null ? q.is(k, null) : q.eq(k, v);
    }
    const { error } = await q;
    if (error) {
      if (error.code && MISSING.has(error.code)) { skipped.push(`${s.table}: ${error.code}`); continue; }
      throw new Error(`${s.table}: ${error.message}`);
    }
  }
  return skipped;
}
