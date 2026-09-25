// Sending from a phone with patchy signal.
//
// A gym basement, a train, Indian mobile data at 7am: the request dies on the
// way out often enough that one tap has to mean one workout, not "sorry, try
// again". A dead connection is retried twice, a second or so apart, and every
// send carries a key that stays the same until the coach has it — so a send
// that did land and a retry that follows it count once. Pure; no React.

/** A connection problem (worth retrying), not the server saying no. */
export function isNetworkError(e) {
  return /failed to fetch|networkerror|network request failed|load failed|timeout|timed out|offline|connection/i.test(e?.message || "");
}

/**
 * Sends, retrying only connection failures. Anything the server actually
 * answered — including a refusal — comes straight back.
 */
export async function sendWithRetry(submit, payload, { tries = 3, wait = (ms) => new Promise((r) => setTimeout(r, ms)), gap = 1200 } = {}) {
  let last = null;
  for (let attempt = 0; attempt < tries; attempt++) {
    if (attempt) await wait(attempt * gap);
    try { return await submit(payload); } catch (e) {
      if (!isNetworkError(e)) throw e;
      last = e;
    }
  }
  throw last;
}

/** One key per workout being sent, kept until the coach has it. */
export const sendKey = () => `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
