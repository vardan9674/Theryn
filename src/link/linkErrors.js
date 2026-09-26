// What the link page (and the coach's share sheet) says when something goes
// wrong, kept apart from the screens so each case can be tested. Pure; no React.
import { isNetworkError } from "./sendRetry.js";
import { signInErrorFromUrl, addressWithoutSignInError } from "../lib/signInError.js";

// link_submit / link_view answer "revoked" for a link that was turned off or
// replaced, and "invalid" for a token that was never right. Neither gets
// better by trying again. "expired" is not sent today; it is here so a future
// server that adds it is not read as a passing hiccup.
const GONE = new Set(["revoked", "invalid", "expired"]);

/** The server says this link no longer works, so retrying can't help. */
export const linkIsGone = (reason) => GONE.has(reason);

export const LINK_OFF_MESSAGE = "This link has been turned off, so this can't be sent. Ask your coach for a new link.";

/**
 * Why link_submit said no, in the client's words. `kind` is "workout" or
 * "measurements". `gone` marks a link that has stopped working for good.
 */
export function submitRefusal(res, kind) {
  const r = res?.reason;
  if (linkIsGone(r)) return { message: LINK_OFF_MESSAGE, gone: true };
  if (r === "too_many") {
    return { message: kind === "measurements"
      ? "You've sent measurements a few times today already. Your coach has them."
      : "You've sent several workouts in the last 24 hours already. Your coach has them.", gone: false };
  }
  if (r === "out_of_range" && kind === "measurements") return { message: "One of the numbers looks off. Please check it.", gone: false };
  return { message: "Could not send. Try again in a moment.", gone: false };
}

/** A thrown load is the connection or the server, never the link itself. */
export const loadFailure = (e) => (isNetworkError(e) ? "network" : "server");

/** Only a load that failed on the way is worth a "Try again" button. */
export const canRetryLoad = (reason) => reason === "network" || reason === "server";

/**
 * Back from Google with an error in the address (a sign-in that expired or
 * was cancelled): the message to show, and the same address without it.
 * Other parameters, like ?tab=measurements, stay.
 */
export function failedSignIn(loc) {
  const message = signInErrorFromUrl(loc);
  if (!message) return null;
  return { message, address: addressWithoutSignInError(loc) };
}

/**
 * The coach's data layer turns a missing client_links table or function into
 * "Run supabase/migrations/…client_links.sql…". Only that is a database
 * update; anything else (a dropped connection, a timeout) is worth a retry.
 */
export const isLinkSetupError = (message) => /supabase\/migrations\/\S*client_links\S*\.sql/i.test(String(message || ""));
