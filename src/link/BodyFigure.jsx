import React from "react";
import { MEASUREMENT_FIELDS } from "../coach/lib/clientLinks.js";

// Front-view figure with callout labels. Drawing from mockups/share-links.
const REGIONS = {
  chest: { x: 160, y: 127, rx: 40, ry: 10, side: "left" },
  waist: { x: 160, y: 176, rx: 30, ry: 8, side: "left" },
  hips: { x: 160, y: 214, rx: 39, ry: 10, side: "left" },
  arm: { x: 217, y: 146, rx: 12, ry: 23, side: "right" },
  thigh: { x: 182, y: 287, rx: 18, ry: 11, side: "right" },
};

export default function BodyFigure({ requested, selected, onSelect }) {
  const fields = MEASUREMENT_FIELDS.filter((f) => requested.includes(f.id));
  return (
    <svg className="lk-body" viewBox="0 0 320 440" role="group" aria-label="Body measurement diagram">
      <defs>
        <linearGradient id="lk-shade" x1="0" x2="1">
          <stop offset="0" stopColor="#181818" /><stop offset=".5" stopColor="#202020" /><stop offset="1" stopColor="#181818" />
        </linearGradient>
      </defs>
      <path className="lk-grid" d="M160 10v416M91 127h138M102 176h116M101 214h118M109 287h102" />
      <g className="lk-human" fill="url(#lk-shade)">
        <path d="M140 40c0-17 8-26 20-26s20 9 20 26l-3 17c-2 10-10 18-17 18s-15-8-17-18Z" />
        <path d="M147 71v13c-9 7-20 10-33 13-11 3-18 12-21 24l-10 40-9 39-9 27-7 14-2 16c0 5 4 7 7 2l5-11-1 12c0 5 5 5 7 0l7-19 6-11 9-25 13-31 9-31 6 34-6 29-5 26c8 10 24 16 47 16s39-6 47-16l-5-26-6-29 6-34 9 31 13 31 9 25 6 11 7 19c2 5 7 5 7 0l-1-12 5 11c3 5 7 3 7-2l-2-16-7-14-9-27-9-39-10-40c-3-12-10-21-21-24-13-3-24-6-33-13V71" />
        <path d="M113 230c-1 22 2 46 8 66l7 29-3 32 7 39-3 12-8 8c-4 5-1 8 6 8h17c5-1 8-5 8-10l-2-19 3-38-1-32 7-66h2l7 66-1 32 3 38-2 19c0 5 3 9 8 10h17c7 0 10-3 6-8l-8-8-3-12 7-39-3-32 7-29c6-20 9-44 8-66" />
      </g>
      <g className="lk-muscles">
        <path d="M145 88l15 9 15-9M160 99v43M123 113q17-13 32-5M165 108q15-8 32 5M122 132q14 12 33 3M165 135q19 9 33-3M136 146l-5 19 5 21M184 146l5 19-5 21M145 157h10M165 157h10M145 172h10M165 172h10M150 189q10 5 20 0M126 202l27 30M194 202l-27 30M160 216v25M127 249l9 38 2 27M193 249l-9 38-2 27M135 326q9-5 14 1M171 327q5-6 14-1M137 342l6 42M183 342l-6 42" />
        <path d="M112 103q-10 12-11 27M208 103q10 12 11 27M98 139l-9 35M222 139l9 35M86 190l-9 32M234 190l9 32" />
      </g>
      {fields.map((f) => {
        const r = REGIONS[f.id];
        const left = r.side === "left";
        const active = selected === f.id;
        const sx = left ? r.x - r.rx : r.x + r.rx;
        const labelY = f.id === "arm" ? 146 : r.y;
        return (
          <g key={f.id} className={`lk-region ${active ? "on" : ""}`} role="button" tabIndex={0} aria-pressed={active} aria-label={`Show how to measure ${f.label.toLowerCase()}`}
            onClick={() => onSelect(f.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(f.id); } }}>
            <ellipse className="lk-band" cx={r.x} cy={r.y} rx={r.rx} ry={r.ry} />
            <path className="lk-callout" d={`M${sx} ${r.y} H${left ? 86 : 240} L${left ? 75 : 246} ${labelY} H${left ? 10 : 310}`} />
            <rect x={left ? 2 : 240} y={labelY - 26} width="78" height="48" fill="transparent" />
            <text x={left ? 9 : 311} y={labelY - 7} textAnchor={left ? "start" : "end"}>{f.label}</text>
            <circle cx={sx} cy={r.y} r="3.5" />
          </g>
        );
      })}
    </svg>
  );
}
