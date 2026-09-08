// Name-only clients live in coach_manual_clients, not in coach_athletes.
// These helpers give them the same shape the dashboard uses for app clients,
// with ids prefixed so the data layer can route reads and writes.

export const MANUAL_PREFIX = "manual:";
export const MANUAL_FEE_PREFIX = "manualfee:";
export const MANUAL_PAY_PREFIX = "manualpay:";

export function isManualId(id) {
  return typeof id === "string" && id.startsWith(MANUAL_PREFIX);
}
export function manualIdOf(clientId) {
  return isManualId(clientId) ? clientId.slice(MANUAL_PREFIX.length) : null;
}
export function toClientId(manualRowId) {
  return MANUAL_PREFIX + manualRowId;
}

export function fullName(row) {
  return [row.first_name, row.last_name].map((s) => (s || "").trim()).filter(Boolean).join(" ") || "Client";
}

/** A coach_manual_clients row → the client object the dashboard renders. */
export function manualToClient(row) {
  const clientId = toClientId(row.id);
  return {
    id: clientId,
    coach_id: row.coach_id,
    athlete_id: clientId,
    athlete_name: fullName(row),
    status: "accepted",
    created_at: row.created_at,
    manual: true,
    manualId: row.id,
  };
}

/** What loadClientData returns for a name-only client. */
export function manualClientData(row) {
  return { routine: row.plan || null, history: [], weights: [], measurements: [], profile: { height_cm: null, unit_system: "imperial" }, manual: true };
}

/** Fee stored as JSON → the ClientFee shape used by payment helpers. */
export function manualFeeRow(row, defaultCurrency = "USD") {
  if (!row.fee || typeof row.fee !== "object") return null;
  const f = row.fee;
  return {
    id: MANUAL_FEE_PREFIX + row.id,
    coach_id: row.coach_id,
    athlete_id: toClientId(row.id),
    amount: Number(f.amount) || 0,
    currency: f.currency || defaultCurrency,
    cadence: f.cadence || "monthly",
    start_date: f.start_date || (row.created_at || "").slice(0, 10),
    active: f.active !== false,
    notes: f.notes ?? null,
  };
}

/** Payments stored as JSON → PaymentEntry rows, newest first. */
export function manualPaymentRows(row) {
  const list = Array.isArray(row.payments) ? row.payments : [];
  return list
    .map((p) => ({
      id: MANUAL_PAY_PREFIX + row.id + ":" + p.id,
      coach_id: row.coach_id,
      athlete_id: toClientId(row.id),
      amount: Number(p.amount) || 0,
      currency: p.currency || "USD",
      received_date: p.received_date,
      notes: p.notes ?? null,
      created_at: p.created_at,
    }))
    .sort((a, b) => (a.received_date < b.received_date ? 1 : a.received_date > b.received_date ? -1 : 0));
}

/** Parse a manual payment id back into { manualId, paymentId }. */
export function parseManualPaymentId(id) {
  if (typeof id !== "string" || !id.startsWith(MANUAL_PAY_PREFIX)) return null;
  const rest = id.slice(MANUAL_PAY_PREFIX.length);
  const i = rest.indexOf(":");
  if (i < 0) return null;
  return { manualId: rest.slice(0, i), paymentId: rest.slice(i + 1) };
}
export function parseManualFeeId(id) {
  if (typeof id !== "string" || !id.startsWith(MANUAL_FEE_PREFIX)) return null;
  return { manualId: id.slice(MANUAL_FEE_PREFIX.length) };
}

/** Split a first/last name pair out of the Add sheet, trimmed and bounded. */
export function cleanName(first, last) {
  const f = String(first || "").trim().slice(0, 60);
  const l = String(last || "").trim().slice(0, 60);
  return { first_name: f, last_name: l };
}

export function randomId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
