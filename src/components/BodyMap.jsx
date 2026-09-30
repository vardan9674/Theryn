import React from "react";
import { BODY_FRONT, BODY_BACK, VIEWBOX } from "../lib/bodyMap/bodyPaths.js";
import { SLUG_TO_GROUP, GROUP_LABEL } from "../lib/exerciseLibrary.js";

// Front or back muscle drawing. Muscles in `main` are lime, in `helpers` dim green,
// everything else grey. With `onToggle`, tapping a muscle calls onToggle(groupId).
// The drawing is decorative for screen readers; pair it with real buttons for each
// muscle (the picker's muscle chips) so keyboard and screen-reader users can choose too.
//
// `levels` is the other way to colour it: groupId → 1, 2 or 3, brightest at 3. It
// takes the place of main/helpers and is what the workout heat map uses, where the
// question is how hard a muscle worked rather than whether it is the target.
//
// `fills` is the most direct: groupId → a colour, for a map that says something
// other than "how much", like the weekly report's plan-versus-done view.

const A = "#C8FF00";
const HELPER = "#5E7310";
const MUSCLE = "#3D3D3D";
const SKIN = "#2A2A2A";

// Three steps, not a smooth gradient: the numbers behind this are sets counted off
// a name-matched exercise list, which is nowhere near precise enough to justify a
// shade per muscle. Three steps say "most", "a fair bit", "some" and no more.
const LEVEL_FILL = { 3: A, 2: "#93BC00", 1: "#49590F" };

export default function BodyMap({ view = "front", main = [], helpers = [], levels = null, fills = null, onToggle, width = 120, stroke = "#101010", label }) {
  const parts = view === "back" ? BODY_BACK : BODY_FRONT;
  const height = Math.round(width * 2);
  return (
    <svg
      width={width}
      height={height}
      viewBox={VIEWBOX[view === "back" ? "back" : "front"]}
      role="img"
      aria-label={label || `${view === "back" ? "Back" : "Front"} of body${main.length ? `, ${main.map((g) => GROUP_LABEL[g]).join(", ")} highlighted` : ""}`}
      style={{ display: "block", flexShrink: 0 }}
    >
      {parts.map((part) => {
        const group = SLUG_TO_GROUP[part.slug];
        const fill = !group ? SKIN
          : fills ? (fills[group] || MUSCLE)
          : levels ? (LEVEL_FILL[levels[group]] || MUSCLE)
          : main.includes(group) ? A
          : helpers.includes(group) ? HELPER
          : MUSCLE;
        const tappable = Boolean(group && onToggle);
        return part.paths.map((d, i) => (
          <path
            key={`${part.slug}-${i}`}
            d={d}
            fill={fill}
            stroke={stroke}
            strokeWidth={3}
            onClick={tappable ? () => onToggle(group) : undefined}
            style={tappable ? { cursor: "pointer" } : undefined}
          />
        ));
      })}
    </svg>
  );
}
