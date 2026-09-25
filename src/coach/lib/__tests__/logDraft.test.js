// A coach half-way through logging a workout must not lose it by closing the
// sheet, checking something, and coming back.
import { describe, it, expect, beforeEach } from "vitest";
import { readDraft, saveDraft, clearDraft, isEmpty } from "../logDraft.js";

// A stand-in for localStorage, so the tests say what they mean.
function memory() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), size: () => map.size, raw: map };
}
let s;
beforeEach(() => { s = memory(); });

const full = { 0: 3, 1: 3 };            // both exercises, every set
const typed = { ticks: { 0: 2, 1: 3 }, log: { 0: { 0: { r: "8", w: "60" } } }, note: "felt strong" };

describe("keeping what the coach typed", () => {
  it("gives it back for the same client and day", () => {
    saveDraft("c1", "2026-09-25", typed, full, s);
    expect(readDraft("c1", "2026-09-25", s)).toEqual({ ticks: { 0: 2, 1: 3 }, log: { 0: { 0: { r: "8", w: "60" } } }, note: "felt strong" });
  });

  it("keeps days and clients apart", () => {
    saveDraft("c1", "2026-09-25", typed, full, s);
    expect(readDraft("c1", "2026-09-24", s)).toBeNull();
    expect(readDraft("c2", "2026-09-25", s)).toBeNull();
  });

  it("forgets it once the workout is sent", () => {
    saveDraft("c1", "2026-09-25", typed, full, s);
    clearDraft("c1", "2026-09-25", s);
    expect(readDraft("c1", "2026-09-25", s)).toBeNull();
  });

  it("does not keep a sheet nobody touched", () => {
    saveDraft("c1", "2026-09-25", { ticks: { ...full }, log: {}, note: "" }, full, s);
    expect(readDraft("c1", "2026-09-25", s)).toBeNull();
  });

  it("keeps a sheet where a set was unticked, even with nothing typed", () => {
    saveDraft("c1", "2026-09-25", { ticks: { 0: 1, 1: 3 }, log: {}, note: "" }, full, s);
    expect(readDraft("c1", "2026-09-25", s).ticks).toEqual({ 0: 1, 1: 3 });
  });

  it("drops a draft that is emptied back out again", () => {
    saveDraft("c1", "2026-09-25", typed, full, s);
    saveDraft("c1", "2026-09-25", { ticks: { ...full }, log: {}, note: "" }, full, s);
    expect(readDraft("c1", "2026-09-25", s)).toBeNull();
  });

  it("remembers a handful of days, not a year of them", () => {
    for (const d of ["2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25"]) {
      saveDraft("c1", d, { ...typed, note: d }, full, s);
    }
    expect(readDraft("c1", "2026-09-25", s).note).toBe("2026-09-25");
    expect(readDraft("c1", "2026-09-21", s).note).toBe("2026-09-21");
    expect(readDraft("c1", "2026-09-19", s)).toBeNull(); // the oldest fell off
  });

  it("survives junk in the store instead of throwing", () => {
    s.setItem("theryn_coachlog_c1", "{not json");
    expect(readDraft("c1", "2026-09-25", s)).toBeNull();
  });

  it("caps a long note", () => {
    saveDraft("c1", "2026-09-25", { ...typed, note: "x".repeat(500) }, full, s);
    expect(readDraft("c1", "2026-09-25", s).note).toHaveLength(300);
  });
});

describe("isEmpty", () => {
  it("is true for the sheet as it opens and false once anything changes", () => {
    expect(isEmpty({ ticks: { ...full }, log: {}, note: "" }, full)).toBe(true);
    expect(isEmpty({ ticks: { ...full }, log: {}, note: " " }, full)).toBe(true);
    expect(isEmpty({ ticks: { ...full }, log: { 0: { 0: { w: "60" } } }, note: "" }, full)).toBe(false);
    expect(isEmpty({ ticks: { 0: 0, 1: 3 }, log: {}, note: "" }, full)).toBe(false);
    expect(isEmpty(null, full)).toBe(true);
  });
});
