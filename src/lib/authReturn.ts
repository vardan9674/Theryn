// Where to go after a sign-in that leaves the page (Google, or the link in the
// sign-in email). Both come back to /oauth/consent, the one redirect URL the
// project already allows; main.jsx reads this to reopen a client's link page.
const KEY = "theryn_return_to";
const MAX_AGE_MS = 30 * 60 * 1000;

export function setReturnTo(path: string): void {
  try { localStorage.setItem(KEY, JSON.stringify({ path, at: Date.now() })); } catch { /* private mode */ }
}

export function peekReturnTo(): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!v || typeof v.path !== "string" || Date.now() - Number(v.at) > MAX_AGE_MS) return null;
    // Only ever a path on this site.
    return v.path.startsWith("/") && !v.path.startsWith("//") ? v.path : null;
  } catch { return null; }
}

export function clearReturnTo(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export const AUTH_CALLBACK_PATH = "/oauth/consent";
