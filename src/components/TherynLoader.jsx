import React from "react";

/**
 * The boot loader: the Theryn monogram extruded in CSS 3D.
 *
 * No WebGL and no dependency, so it can sit in the entry bundle and paint
 * before any lazy chunk arrives — that's what covers the blank gap a client
 * used to get when they first opened a /f/<token> link.
 *
 * The mark is rebuilt as clean geometry rather than traced from
 * public/theryn-logo.svg, which is a raster trace (159 anti-aliasing paths)
 * and can't be extruded. Bar width 1, one T = crossbar 5×1 plus stem
 * 1×1.975; the pair is that T plus its 180° rotation, leaning 45°.
 *
 * Styles live in index.css under "Boot loader", which main.jsx imports
 * unconditionally — so this works on the athlete app, the coach dashboard
 * and the public link page, none of which share a token system.
 */

const LAYERS = 22;          // enough that the stack shows no seams edge-on
const DEPTH_RATIO = 0.107;  // extrusion depth = 0.62 × bar width
const CAP = [0xc5, 0xfc, 0x01]; // sampled from theryn-logo.svg

// Caps keep the true brand colour; walls darken toward the middle of the
// extrusion so the depth reads as the mark turns. Computed once.
const LAYER_COLORS = Array.from({ length: LAYERS }, (_, i) => {
  const isCap = i === 0 || i === LAYERS - 1;
  const k = Math.abs((2 * i) / (LAYERS - 1) - 1); // 1 at the caps, 0 mid-stack
  const f = isCap ? 1 : 0.42 + 0.34 * k;
  return "#" + CAP.map((c) => Math.round(c * f).toString(16).padStart(2, "0")).join("");
});

// When the app first showed a loader. A second loader mounting later (the
// Suspense fallback handing off to LinkPage's own fetch, say) picks the
// animation up where the first left off instead of restarting the tumble.
let bootAt = null;

function Mark({ fill }) {
  return (
    <svg viewBox="-2.9 -2.9 5.8 5.8" aria-hidden="true">
      <g transform="rotate(45)" fill={fill}>
        <rect x="-2.5" y="0.475" width="5" height="1" />
        <rect x="-0.5" y="1.475" width="1" height="1.975" />
        <rect x="-2.5" y="-1.475" width="5" height="1" />
        <rect x="-0.5" y="-3.45" width="1" height="1.975" />
      </g>
    </svg>
  );
}

export default function TherynLoader({ size = 76, fullscreen = true, label = "Loading" }) {
  if (bootAt === null) bootAt = Date.now();
  const elapsed = Math.max(0, Date.now() - bootAt);

  const depth = size * DEPTH_RATIO;
  const step = depth / (LAYERS - 1);

  const mark = (
    <div
      className="tl-loader"
      style={{ width: size, height: size, perspective: Math.round(size * 3.75) }}
      role="status"
      aria-label={label}
    >
      <div className="tl-spin">
        {LAYER_COLORS.map((color, i) => (
          <div
            key={i}
            className="tl-layer"
            style={{ transform: `translateZ(${(i * step - depth / 2).toFixed(2)}px)` }}
          >
            <Mark fill={color} />
          </div>
        ))}
      </div>
    </div>
  );

  // Negative delay on the tumble, matching positive offset on the idle, so a
  // remount resumes rather than replays.
  const clock = { "--tl-t": `-${elapsed}ms` };

  if (!fullscreen) {
    return <div className="tl-inline" style={clock}>{mark}</div>;
  }

  return (
    <div className="tl-screen" style={clock}>
      {mark}
      <div className="tl-track"><div className="tl-fill" /></div>
    </div>
  );
}
