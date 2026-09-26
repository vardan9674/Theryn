// Getting a client into their own account: the invite address the coach
// sends, and the way back if Google drops them on the home page.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { inviteUrl, inviteMessage, joinCodeFrom, linkUrl } from "../clientLinks.js";
import { rememberJoinLink, takeJoinLink, forgetJoinLink } from "../../../link/joinReturn.js";

describe("the invite address", () => {
  it("is their everyday link with the code on the end", () => {
    expect(inviteUrl("tok123", "AB12CD", "https://theryn.fit")).toBe("https://theryn.fit/f/tok123?join=AB12CD");
  });

  it("is just the link when there is no code", () => {
    expect(inviteUrl("tok123", "", "https://theryn.fit")).toBe(linkUrl("tok123", "https://theryn.fit"));
    expect(inviteUrl("tok123", null, "https://theryn.fit")).toBe("https://theryn.fit/f/tok123");
  });

  it("carries the code in upper case, however it was stored", () => {
    expect(inviteUrl("tok123", " ab12cd ", "https://theryn.fit")).toContain("?join=AB12CD");
  });

  it("names the client in the message and keeps the address in it", () => {
    const url = inviteUrl("tok123", "AB12CD", "https://theryn.fit");
    const msg = inviteMessage("Asha", url);
    expect(msg).toContain("Hi Asha");
    expect(msg).toContain(url);
  });
});

describe("reading the code back off the address", () => {
  it("finds it", () => {
    expect(joinCodeFrom("?join=AB12CD")).toBe("AB12CD");
    expect(joinCodeFrom("?tab=measurements&join=ab12cd")).toBe("AB12CD");
  });

  it("forgives spacing and punctuation someone's keyboard added", () => {
    expect(joinCodeFrom("?join=ab-12%20cd")).toBe("AB12CD");
  });

  it("is null when there is no invite", () => {
    expect(joinCodeFrom("")).toBeNull();
    expect(joinCodeFrom("?tab=measurements")).toBeNull();
    expect(joinCodeFrom("?join=")).toBeNull();
    expect(joinCodeFrom(null)).toBeNull();
  });
});

describe("finding the way back to the link", () => {
  let store;
  beforeEach(() => {
    const map = new Map();
    store = { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
  });

  it("sends them back to the link they started from", () => {
    rememberJoinLink("tok123", store);
    expect(takeJoinLink(Date.now(), store)).toBe("/f/tok123");
  });

  it("only answers once, so a bounce cannot become a loop", () => {
    rememberJoinLink("tok123", store);
    expect(takeJoinLink(Date.now(), store)).toBe("/f/tok123");
    expect(takeJoinLink(Date.now(), store)).toBeNull();
  });

  it("forgets a sign-in that was abandoned half an hour ago", () => {
    rememberJoinLink("tok123", store);
    expect(takeJoinLink(Date.now() + 31 * 60 * 1000, store)).toBeNull();
  });

  it("says nothing when no sign-in was started", () => {
    expect(takeJoinLink(Date.now(), store)).toBeNull();
  });

  it("refuses a token that would not be safe in an address", () => {
    store.setItem("theryn_join_link", JSON.stringify({ token: "../../evil?x=1", at: Date.now() }));
    expect(takeJoinLink(Date.now(), store)).toBeNull();
  });

  it("copes with junk in the store", () => {
    store.setItem("theryn_join_link", "{not json");
    expect(takeJoinLink(Date.now(), store)).toBeNull();
  });

  it("can be forgotten deliberately", () => {
    rememberJoinLink("tok123", store);
    forgetJoinLink(store);
    expect(takeJoinLink(Date.now(), store)).toBeNull();
  });

  it("does not throw when storage is unavailable", () => {
    const dead = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
    expect(() => rememberJoinLink("tok123", dead)).not.toThrow();
    expect(takeJoinLink(Date.now(), dead)).toBeNull();
  });
});
