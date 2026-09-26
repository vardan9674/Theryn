import React from "react";
import { MEASUREMENT_FIELDS } from "../coach/lib/clientLinks.js";
import { BODY_FRONT } from "../lib/bodyMap/bodyPaths.js";

// Front-view body with a band and a callout label for each measurement.
// The body drawing is the same one the exercise picker uses (src/lib/bodyMap/bodyPaths.js).
// The figure faces you: the client's left arm is on your right.
// Coordinates are in the drawing's own units. ly: where the label sits, so labels on
// the same side never overlap.
const REGIONS = {
  neck: { x: 364, y: 292, rx: 32, ry: 10, side: "left", ly: 238 },
  shoulders: { x: 364, y: 345, rx: 170, ry: 16, side: "left", ly: 318 },
  chest: { x: 364, y: 388, rx: 112, ry: 16, side: "left", ly: 398 },
  back: { x: 364, y: 430, rx: 118, ry: 14, side: "right", ly: 362, dashed: true },
  arm_r: { x: 217, y: 450, rx: 38, ry: 11, side: "left", ly: 478 },
  arm: { x: 511, y: 450, rx: 38, ry: 11, side: "right", ly: 450 },
  forearm_r: { x: 186, y: 548, rx: 32, ry: 10, side: "left", ly: 558 },
  forearm_l: { x: 542, y: 548, rx: 32, ry: 10, side: "right", ly: 548 },
  waist: { x: 364, y: 578, rx: 104, ry: 14, side: "left", ly: 638 },
  belly: { x: 364, y: 632, rx: 108, ry: 14, side: "left", ly: 718 },
  hips: { x: 364, y: 700, rx: 124, ry: 16, side: "left", ly: 798 },
  thigh_r: { x: 296, y: 790, rx: 58, ry: 14, side: "left", ly: 878 },
  thigh: { x: 432, y: 790, rx: 58, ry: 14, side: "right", ly: 790 },
  calf_r: { x: 288, y: 1090, rx: 40, ry: 12, side: "left", ly: 1090 },
  calf_l: { x: 440, y: 1090, rx: 40, ry: 12, side: "right", ly: 1090 },
};

// Label columns sit outside the body on both sides.
const LEFT_TEXT = -318, LEFT_ELBOW = -40, RIGHT_TEXT = 1046, RIGHT_ELBOW = 768;
const SKIN = new Set(["head", "hair", "neck", "hands", "feet", "knees", "ankles"]);

export default function BodyFigure({ requested, selected, onSelect }) {
  const fields = MEASUREMENT_FIELDS.filter((f) => requested.includes(f.id) && REGIONS[f.id]);
  return (
    <svg className="lk-body" viewBox="-330 80 1388 1290" role="group" aria-label="Body measurement diagram">
      <g className="lk-human" aria-hidden="true">
        {BODY_FRONT.map((part) => part.paths.map((d, i) => (
          <path key={`${part.slug}-${i}`} d={d} className={SKIN.has(part.slug) ? "lk-part lk-skin" : "lk-part"} />
        )))}
      </g>
      {fields.map((f) => {
        const r = REGIONS[f.id];
        const left = r.side === "left";
        const active = selected === f.id;
        const sx = left ? r.x - r.rx : r.x + r.rx;
        const labelY = r.ly ?? r.y;
        const elbow = left ? LEFT_ELBOW : RIGHT_ELBOW;
        const end = left ? LEFT_TEXT : RIGHT_TEXT;
        return (
          <g key={f.id} className={`lk-region ${active ? "on" : ""}`} role="button" tabIndex={0} aria-pressed={active} aria-label={`Show how to measure ${f.label.toLowerCase()}`}
            onClick={() => onSelect(f.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(f.id); } }}>
            <ellipse className="lk-band" cx={r.x} cy={r.y} rx={r.rx} ry={r.ry} strokeDasharray={r.dashed ? "12 9" : undefined} />
            <path className="lk-callout" d={`M${sx} ${r.y} H${elbow} L${left ? elbow - 30 : elbow + 30} ${labelY} H${end}`} />
            <rect x={left ? -330 : 748} y={labelY - 70} width="310" height="100" fill="transparent" />
            <text x={end} y={labelY - 14} textAnchor={left ? "start" : "end"}>{f.label}</text>
            <circle cx={sx} cy={r.y} r="9" />
          </g>
        );
      })}
    </svg>
  );
}
