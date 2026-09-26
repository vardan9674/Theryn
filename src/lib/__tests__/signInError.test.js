// #125: a failed Google sign-in says so instead of silently showing the home page.
import { describe, it, expect } from "vitest";
import { signInErrorFromUrl, friendlySignInError, addressWithoutSignInError } from "../signInError.js";

const loc = (url) => { const u = new URL(url); return { pathname: u.pathname, search: u.search, hash: u.hash }; };

describe("signInErrorFromUrl", () => {
  it("an expired sign-in (the case that was silent) gets a clear sentence", () => {
    expect(signInErrorFromUrl(loc("https://www.theryn.fit/?error=invalid_request&error_code=bad_oauth_state&error_description=OAuth+state+has+expired")))
      .toBe("That sign-in took too long, so it didn't go through. Please sign in again.");
  });
  it("reads errors after # too", () => {
    expect(signInErrorFromUrl(loc("https://www.theryn.fit/#error=access_denied&error_description=User+cancelled")))
      .toBe("Sign-in was cancelled. You can try again whenever you're ready.");
  });
  it("no error, no message (a normal return with ?code=)", () => {
    expect(signInErrorFromUrl(loc("https://www.theryn.fit/oauth/consent?code=abc"))).toBe(null);
    expect(signInErrorFromUrl(loc("https://www.theryn.fit/"))).toBe(null);
  });
  it("anything else gets a generic retry line, never raw error text", () => {
    expect(signInErrorFromUrl(loc("https://www.theryn.fit/?error=server_error&error_description=Database+error+saving+new+user")))
      .toBe("Sign-in didn't finish. Please try again.");
    expect(friendlySignInError({ message: "TypeError: Failed to fetch" })).toBe("Couldn't reach Google. Check your connection and try again.");
  });
});

describe("addressWithoutSignInError", () => {
  it("drops only the error parameters", () => {
    expect(addressWithoutSignInError(loc("https://www.theryn.fit/?error=invalid_request&error_code=bad_oauth_state&error_description=x"))).toBe("/");
    expect(addressWithoutSignInError(loc("https://www.theryn.fit/?utm_source=ig&error=access_denied#section"))).toBe("/?utm_source=ig#section");
  });
  it("leaves /oauth/consent for the home page", () => {
    expect(addressWithoutSignInError(loc("https://www.theryn.fit/oauth/consent?error=access_denied"))).toBe("/");
  });
});
