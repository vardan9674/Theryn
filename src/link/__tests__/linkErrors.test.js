// When the link page goes wrong: a turned-off link, a failed load, a sign-in
// that came back with an error, and the coach's sheet failing to load (#130, #138).
import { describe, it, expect } from "vitest";
import { linkIsGone, submitRefusal, loadFailure, canRetryLoad, failedSignIn, isLinkSetupError, LINK_OFF_MESSAGE } from "../linkErrors.js";

describe("submitRefusal", () => {
  it("tells them plainly when the link was turned off or replaced", () => {
    for (const reason of ["revoked", "invalid", "expired"]) {
      expect(linkIsGone(reason)).toBe(true);
      expect(submitRefusal({ ok: false, reason }, "workout")).toEqual({ message: LINK_OFF_MESSAGE, gone: true });
      expect(submitRefusal({ ok: false, reason }, "measurements").gone).toBe(true);
    }
    expect(LINK_OFF_MESSAGE).not.toMatch(/try again/i);
  });

  it("keeps the old wording for everything else", () => {
    expect(submitRefusal({ ok: false, reason: "too_many" }, "workout")).toEqual({ message: "You've sent several workouts in the last 24 hours already. Your coach has them.", gone: false });
    expect(submitRefusal({ ok: false, reason: "too_many" }, "measurements").message).toMatch(/measurements a few times today/);
    expect(submitRefusal({ ok: false, reason: "out_of_range" }, "measurements").message).toBe("One of the numbers looks off. Please check it.");
    expect(submitRefusal({ ok: false, reason: "bad_payload" }, "workout")).toEqual({ message: "Could not send. Try again in a moment.", gone: false });
    expect(submitRefusal(null, "workout").gone).toBe(false);
    expect(linkIsGone("too_many")).toBe(false);
  });
});

describe("loading the link", () => {
  it("counts Safari's 'Load failed' as the connection, not the server", () => {
    expect(loadFailure(new TypeError("Load failed"))).toBe("network");
    expect(loadFailure(new TypeError("Failed to fetch"))).toBe("network");
    expect(loadFailure(new Error("permission denied for function link_view"))).toBe("server");
    expect(loadFailure(undefined)).toBe("server");
  });

  it("offers Try again only when getting there failed", () => {
    expect(canRetryLoad("network")).toBe(true);
    expect(canRetryLoad("server")).toBe(true);
    expect(canRetryLoad("revoked")).toBe(false);
    expect(canRetryLoad("invalid")).toBe(false);
    expect(canRetryLoad(null)).toBe(false);
  });
});

describe("failedSignIn", () => {
  const loc = (pathname, search = "", hash = "") => ({ pathname, search, hash });

  it("is nothing on an ordinary visit", () => {
    expect(failedSignIn(loc("/f/abc", "?tab=measurements"))).toBe(null);
  });

  it("reads an expired sign-in from the query and keeps the rest of the address", () => {
    const r = failedSignIn(loc("/f/abc", "?tab=measurements&error=invalid_request&error_code=bad_oauth_state&error_description=OAuth+state+has+expired"));
    expect(r.message).toMatch(/took too long/);
    expect(r.address).toBe("/f/abc?tab=measurements");
  });

  it("reads a cancelled sign-in from the hash and stays on the link", () => {
    const r = failedSignIn(loc("/f/abc", "", "#error=access_denied&error_description=User+cancelled"));
    expect(r.message).toMatch(/cancelled/);
    expect(r.address).toBe("/f/abc");
  });
});

describe("isLinkSetupError", () => {
  it("is only the missing-table message from the data layer", () => {
    expect(isLinkSetupError("Run supabase/migrations/20260912120000_client_links.sql in the Supabase SQL editor.")).toBe(true);
    expect(isLinkSetupError("Failed to fetch")).toBe(false);
    expect(isLinkSetupError("Load failed")).toBe(false);
    expect(isLinkSetupError("JWT expired")).toBe(false);
    expect(isLinkSetupError(undefined)).toBe(false);
  });
});
