// What a coach has typed into "Log a workout" but not sent yet.
//
// They get interrupted: a client walks in, they check something on the plan
// tab, the phone locks. Closing the sheet used to throw the lot away. Now it
// is kept on their device, per client and per day, until it is sent.
//
// Small and boring on purpose: a JSON blob in localStorage, the last few days
// per client, and never anything the coach hasn't typed.

const KEY = (clientId) => `theryn_coachlog_${String(clientId || "unknown").slice(0, 64)}`;
const KEEP_DAYS = 5;

const store = (s) => s || (typeof localStorage !== "undefined" ? localStorage : null);

function readAll(clientId, s) {
  try { return JSON.parse(store(s)?.getItem(KEY(clientId)) || "{}") || {}; } catch { return {}; }
}
function writeAll(clientId, all, s) {
  try {
    const kept = Object.fromEntries(Object.entries(all).sort(([a], [b]) => (a < b ? 1 : -1)).slice(0, KEEP_DAYS));
    if (Object.keys(kept).length) store(s)?.setItem(KEY(clientId), JSON.stringify(kept));
    else store(s)?.removeItem(KEY(clientId));
  } catch { /* a full or blocked store just means no draft */ }
}

/** What they had typed for that client on that day, or null. */
export function readDraft(clientId, date, s) {
  const d = readAll(clientId, s)[date];
  if (!d || typeof d !== "object") return null;
  return { ticks: d.ticks || {}, log: d.log || {}, note: typeof d.note === "string" ? d.note : "" };
}

/**
 * Keeps a draft. A day where nothing has been typed and nothing unticked is
 * not worth keeping, so it is dropped instead.
 */
export function saveDraft(clientId, date, draft, allDone = {}, s) {
  if (!date) return;
  const all = readAll(clientId, s);
  if (isEmpty(draft, allDone)) delete all[date];
  else all[date] = { ticks: draft.ticks || {}, log: draft.log || {}, note: (draft.note || "").slice(0, 300) };
  writeAll(clientId, all, s);
}

/** Sent, so the draft has done its job. */
export function clearDraft(clientId, date, s) {
  const all = readAll(clientId, s);
  if (!(date in all)) return;
  delete all[date];
  writeAll(clientId, all, s);
}

/**
 * Nothing typed, nothing unticked: the sheet as it opens, which is not worth
 * keeping. `allDone` is what every exercise ticked looks like for that day.
 */
export function isEmpty(draft, allDone = {}) {
  if (!draft) return true;
  if ((draft.note || "").trim()) return false;
  const typed = Object.values(draft.log || {}).some((sets) => Object.values(sets || {}).some((v) => v && Object.values(v).some((x) => String(x ?? "").trim() !== "")));
  if (typed) return false;
  const ticks = draft.ticks || {};
  const keys = new Set([...Object.keys(ticks), ...Object.keys(allDone)]);
  return [...keys].every((i) => Number(ticks[i] ?? 0) === Number(allDone[i] ?? 0));
}
