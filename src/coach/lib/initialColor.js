// A colour per letter, so a client's initials are recognisable at a glance.
// Same idea as the workout type colours: soft, never loud, and readable on the
// dark background. A–Z each get their own hue, spread around the wheel and
// nudged away from the muddy yellow-green that clashes with the app's accent.
// Anything that isn't a letter falls back to grey. Pure; no React.

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
// 26 hues, stepped so neighbours in the alphabet don't look alike.
const hueOf = (i) => Math.round((i * 138.5 + 14) % 360);

/** The colour for one character: `text` for the letter, `tint` for behind it. */
export function letterColor(ch) {
  const i = LETTERS.indexOf(String(ch || "").toUpperCase());
  if (i < 0) return { text: "var(--cx-mu)", tint: "rgba(255, 255, 255, 0.06)" };
  const h = hueOf(i);
  return { text: `hsl(${h} 62% 72%)`, tint: `hsl(${h} 55% 55% / 0.16)` };
}

/** Initials split into letters with their colours, plus the background behind them. */
export function initialColors(initials) {
  const letters = String(initials || "?").split("").slice(0, 2);
  const colors = letters.map(letterColor);
  const background = colors.length > 1
    ? `linear-gradient(135deg, ${colors[0].tint}, ${colors[1].tint})`
    : colors[0].tint;
  return { letters, colors, background };
}
