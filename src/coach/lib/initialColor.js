// A colour per letter, so a client's initials are recognisable at a glance.
//
// These colours mean nothing: they are decoration keyed to the letter. So they
// stay out of the hues the dashboard uses to say something — the lime accent
// (done, primary action), amber (at risk), red (overdue) and the warm oranges
// of a Push day. Letters live in the cool half of the wheel (teal → blue →
// violet → pink), muted and light enough to read on the dark background.
// Anything that isn't a letter stays grey. Pure; no React.

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
// The safe band: 175° (teal) to 335° (pink). Stepping by the golden ratio
// inside it keeps letters next to each other in the alphabet far apart.
const BAND_START = 175;
const BAND_WIDTH = 160;
const hueOf = (i) => Math.round(BAND_START + ((i * 0.6180339887) % 1) * BAND_WIDTH);

/** The colour for one character: `text` for the letter, `tint` for behind it. */
export function letterColor(ch) {
  const i = LETTERS.indexOf(String(ch || "").toUpperCase());
  if (i < 0) return { text: "var(--cx-mu)", tint: "rgba(255, 255, 255, 0.05)" };
  const h = hueOf(i);
  return { text: `hsl(${h} 45% 74%)`, tint: `hsl(${h} 40% 50% / 0.13)` };
}

/** Initials split into letters with their colours, plus the circle behind them. */
export function initialColors(initials) {
  const letters = String(initials || "?").split("").slice(0, 2);
  const colors = letters.map(letterColor);
  // One flat tint, from the first letter: two blended tints made the circle busy.
  return { letters, colors, background: colors[0].tint };
}
