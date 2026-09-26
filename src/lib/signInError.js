// What to tell someone whose Google sign-in came back with an error (#125).
//
// Supabase sends the person back to the site with the error in the address,
// e.g. /?error=invalid_request&error_code=bad_oauth_state&error_description=
// OAuth+state+has+expired (in the query, or after # for older flows). The site
// used to ignore it and quietly show the home page, so a sign-in that took too
// long, or was cancelled, just looked like nothing happened.

const PARAMS = ["error", "error_code", "error_description"];

/** A plain message for the error in `loc` (window.location-like), or null. */
export function signInErrorFromUrl(loc) {
  if (!loc) return null;
  const q = new URLSearchParams(loc.search || "");
  const h = new URLSearchParams(String(loc.hash || "").replace(/^#/, ""));
  const get = (k) => q.get(k) || h.get(k) || "";
  const error = get("error");
  if (!error) return null;
  return friendlySignInError({ error, code: get("error_code"), description: get("error_description") });
}

/** Map an OAuth / Supabase error to one sentence a coach can act on. */
export function friendlySignInError({ error = "", code = "", description = "", message = "" } = {}) {
  const all = `${error} ${code} ${description} ${message}`.toLowerCase();
  if (/bad_oauth_state|state.*(expired|missing|invalid)|flow_state/.test(all)) {
    return "That sign-in took too long, so it didn't go through. Please sign in again.";
  }
  if (/access_denied|cancel/.test(all)) {
    return "Sign-in was cancelled. You can try again whenever you're ready.";
  }
  if (/network|fetch|offline|timeout/.test(all)) {
    return "Couldn't reach Google. Check your connection and try again.";
  }
  return "Sign-in didn't finish. Please try again.";
}

/** The same address without the error parameters (and off /oauth/consent). */
export function addressWithoutSignInError(loc) {
  const q = new URLSearchParams(loc.search || "");
  const h = new URLSearchParams(String(loc.hash || "").replace(/^#/, ""));
  PARAMS.forEach((k) => { q.delete(k); h.delete(k); });
  const path = loc.pathname === "/oauth/consent" ? "/" : (loc.pathname || "/");
  const qs = q.toString();
  // Only rebuild the hash when it carried the error; a plain #section stays as is.
  const hadHashError = PARAMS.some((k) => new URLSearchParams(String(loc.hash || "").replace(/^#/, "")).has(k));
  const hs = hadHashError ? h.toString() : String(loc.hash || "").replace(/^#/, "");
  return `${path}${qs ? `?${qs}` : ""}${hs ? `#${hs}` : ""}`;
}
