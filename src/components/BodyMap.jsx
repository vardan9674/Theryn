import React from "react";
import { BODY_FRONT, BODY_BACK, VIEWBOX } from "../lib/bodyMap/bodyPaths.js";
import { SLUG_TO_GROUP, GROUP_LABEL } from "../lib/exerciseLibrary.js";

// Front or back muscle drawing. Muscles in `main` are lime, in `helpers` dim green,
// everything else grey. With `onToggle`, tapping a muscle calls onToggle(groupId).
// The drawing is decorative for screen readers; pair it with real buttons for each
// muscle (the picker's muscle chips) so keyboard and screen-reader users can choose too.

const A = "#C8FF00";
const HELPER = "#5E7310";
const MUSCLE = "#3D3D3D";
const SKIN = "#2A2A2A";

export default function BodyMap({ view = "front", main = [], helpers = [], onToggle, width = 120, stroke = "#101010", label }) {
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
        const fill = group ? (main.includes(group) ? A : helpers.includes(group) ? HELPER : MUSCLE) : SKIN;
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
