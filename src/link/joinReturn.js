// Getting a client back to their own link after Google.
//
// The sign-in is told to come back to /f/<token>. If that address isn't on the
// project's allow-list, Supabase quietly sends them to the site root instead —
// and the person lands on the home page, is asked to pick a role, and ends up
// on "download the app", with an account that belongs to nobody. That is what
// happens today, and it is silent.
//
// So the link page writes down where it sent them just before it leaves. The
// main app reads it on boot and sends them back. Short-lived on purpose: this
// is for the minute after a sign-in, not a bookmark.
//
// Pure apart from localStorage; no React.

const KEY = "theryn_join_link";
const GOOD_FOR_MS = 30 * 60 * 1000; // half an hour

const store = () => { try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; } };

/** Called by the link page just before it hands over to Google. */
export function rememberJoinLink(token, s = store()) {
  if (!token) return;
  try { s?.setItem(KEY, JSON.stringify({ token: String(token), at: Date.now() })); } catch { /* private window */ }
}

/**
 * The link to send them back to, or null. Only answers for a sign-in that was
 * started here in the last half hour, and only once — reading it clears it, so
 * a bounce can never become a loop.
 */
export function takeJoinLink(now = Date.now(), s = store()) {
  let raw = null;
  try { raw = s?.getItem(KEY); } catch { return null; }
  if (!raw) return null;
  try { s?.removeItem(KEY); } catch { /* ignore */ }
  try {
    const { token, at } = JSON.parse(raw) || {};
    if (!token || typeof token !== "string") return null;
    if (!/^[A-Za-z0-9_-]{6,128}$/.test(token)) return null;      // it goes into a URL
    if (!Number.isFinite(at) || now - at > GOOD_FOR_MS) return null;
    return `/f/${token}`;
  } catch { return null; }
}

export function forgetJoinLink(s = store()) {
  try { s?.removeItem(KEY); } catch { /* ignore */ }
}
