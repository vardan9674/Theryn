import React from "react";

// A medal that carries its own number: on the weekly report ("Earned this
// week") and straight after a workout ("Better than last time"). Gold is a
// best-ever; lime is a win or a milestone. One drawing, so the two places
// can't drift apart.

const TONE = {
  gold: { main: "#F5B84A", ribbonA: "#8A6524", ribbonB: "#6E4F1A" },
  lime: { main: "#C8FF00", ribbonA: "#6B8A00", ribbonB: "#536B00" },
};
const DISPLAY = "'Big Shoulders Display', 'Arial Narrow', 'Helvetica Neue', sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const FLAME = "M12 2c1.5 4 6 5.5 6 11a6 6 0 0 1-12 0c0-2.2 1.2-3.6 1.2-3.6S8.4 12 9.6 12c0-3 1.2-6.4 2.4-10z";

// The medal's faces load only where a medal is shown; the rest of the link
// and the app stay on system fonts. Until they arrive the fallbacks stand in.
const FONTS_HREF = "https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@800;900&family=JetBrains+Mono:wght@500;700&display=swap";
export function useDisplayFonts() {
  React.useEffect(() => {
    if (typeof document === "undefined" || document.querySelector('link[href*="Big+Shoulders+Display"]')) return;
    const l = document.createElement("link");
    l.rel = "stylesheet"; l.href = FONTS_HREF;
    document.head.appendChild(l);
  }, []);
}

/**
 * @param tone   "gold" | "lime"
 * @param value  what's on the face: "15", "19K", "1:00"
 * @param unit   small letters under it: "lb", "reps", "min" (optional)
 * @param flame  a flame above the number instead of a unit (streaks)
 * @param label  what a screen reader says; "" hides it (the parent says it instead)
 */
export default function Medal({ tone = "lime", value, unit = "", flame = false, size = 62, label }) {
  useDisplayFonts();
  const c = TONE[tone] || TONE.lime;
  const text = String(value ?? "");
  // Longer numbers get smaller so "42.5" and "1:00" stay inside the rim.
  const fs = text.length <= 2 ? 24 : text.length === 3 ? 21 : text.length === 4 ? 17 : 14;
  return (
    <svg width={size} height={Math.round(size * 84 / 72)} viewBox="0 0 72 84" style={{ display: "block", flexShrink: 0 }}
      {...(label === "" ? { "aria-hidden": true } : { role: "img", "aria-label": label || `${text} ${unit}`.trim() })}>
      <path d="M25 50 17 80l10-6 6 8 6-30z" fill={c.ribbonA} />
      <path d="M47 50l8 30-10-6-6 8-6-30z" fill={c.ribbonB} />
      {/* A reeded rim, like the edge of a coin */}
      <circle cx="36" cy="32" r="27" fill="none" stroke={c.main} strokeWidth="5" strokeDasharray="3 2.655" />
      <circle cx="36" cy="32" r="24" fill="#1B1B1E" stroke={c.main} strokeWidth="1.5" />
      {flame && <path transform="translate(30 11) scale(0.5)" d={FLAME} fill={c.main} />}
      <text x="36" y={flame ? 46 : unit ? 38 : 40} textAnchor="middle" fontFamily={DISPLAY} fontWeight="900" fontSize={fs} fill={c.main}>{text}</text>
      {!flame && unit && <text x="36" y="48" textAnchor="middle" fontFamily={MONO} fontWeight="700" fontSize="7.5" letterSpacing="1.2" fill={c.main}>{String(unit).toUpperCase()}</text>}
    </svg>
  );
}
