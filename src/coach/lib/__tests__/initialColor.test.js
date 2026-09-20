import { describe, it, expect } from "vitest";
import { letterColor, initialColors } from "../initialColor.js";

describe("a colour per letter", () => {
  it("is the same every time for a letter, and ignores case", () => {
    expect(letterColor("r")).toEqual(letterColor("R"));
    expect(letterColor("R")).toEqual(letterColor("R"));
  });
  it("keeps every letter out of the colours that mean something (lime, amber, red)", () => {
    for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
      const h = Number(letterColor(ch).text.match(/hsl\((\d+)/)[1]);
      expect(h).toBeGreaterThanOrEqual(175); // past the warm oranges and the lime accent
      expect(h).toBeLessThanOrEqual(335);
    }
  });
  it("gives neighbouring letters clearly different colours", () => {
    const hue = (c) => Number(c.text.match(/hsl\((\d+)/)[1]);
    const gap = Math.abs(hue(letterColor("A")) - hue(letterColor("B")));
    expect(Math.min(gap, 360 - gap)).toBeGreaterThan(40);
  });
  it("colours each letter of the initials and tints the circle", () => {
    const { letters, colors, background } = initialColors("RP");
    expect(letters).toEqual(["R", "P"]);
    expect(colors[0].text).not.toBe(colors[1].text);
    expect(background).toBe(colors[0].tint);
  });
  it("handles one letter, and anything that isn't one", () => {
    expect(initialColors("S").background).toBe(letterColor("S").tint);
    expect(letterColor("?").text).toBe("var(--cx-mu)");
    expect(initialColors("").letters).toEqual(["?"]);
  });
});
