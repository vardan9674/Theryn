import React from "react";

// Live fire around the streak ring on the receipt. The longer the streak, the
// more of the ring burns: a few embers off the flame for a new streak, the
// top of the ring alight from 4 in a row, most of it from 7, nearly all of it
// with sparks flying at 14 (streakHeat). Heat eases between steps, so when
// the count-up crosses a step the fire visibly catches.
//
// What makes it read as fire rather than blobs:
//  - each flame is a soft teardrop, brightest near its base, drawn taller
//    than wide and tapering as it rises;
//  - it burns in the ring's own colour, sliding smoothly from a pale hot base
//    to a dark tip (pre-tinted sprites, so no colour jumps and no per-frame
//    tinting); on the lime-to-orange ring each flame matches its spot;
//  - every flame sways on one shared, slowly changing breeze, so they lean
//    together like one fire instead of jittering on their own;
//  - a low glow bed sits along the burning part of the ring;
//  - movement is per second, not per frame, so a 120 Hz phone isn't twice as fast.
//
// Canvas, additive blending, one drawImage per particle, capped. It pauses
// when the tab is hidden and never starts with reduced motion (link.css hides it).

// Sits behind the ring; the ring's centre is at (CX, CY) inside it (see .lk-fire).
const W = 280, H = 320, CX = 140, CY = 196, R = 76;
const STEPS = 24; // sprites along each heat's colour ramp

// Per heat, in units per second: flames a second, how far round the ring
// from the top they start (radians either side), size, rise speed, life in
// seconds, sparks a second, and which colour the ring is.
const HEATS = {
  1: { rate: 22, arc: 0, size: 7, rise: 46, life: 0.55, sparks: 0, ring: "lime" },
  2: { rate: 130, arc: 0.8, size: 8, rise: 58, life: 0.62, sparks: 3, ring: "lime" },
  3: { rate: 260, arc: 1.35, size: 9.5, rise: 72, life: 0.7, sparks: 10, ring: "lime" },
  // Not quite all the way round: flames off the bottom would climb through the words.
  4: { rate: 420, arc: 2.1, size: 11, rise: 88, life: 0.78, sparks: 26, ring: "hot" },
  // A month in a row. Not bigger (it would swallow the screen), hotter: white at the base.
  5: { rate: 480, arc: 2.1, size: 11.5, rise: 96, life: 0.8, sparks: 34, ring: "legend" },
  // A hundred in a row: blue, the hottest fire there is.
  6: { rate: 520, arc: 2.1, size: 12, rise: 104, life: 0.82, sparks: 42, ring: "blue" },
};
const TOP = 6;
// The heats that earn a burst of sparks the moment they're reached.
const BURST_FROM = 5;

// The fire takes the ring's colour. Until Blazing the ring is lime, so the
// fire is. At Blazing the ring runs lime → amber → orange (lk-ring-hot), and
// at Legendary amber → gold → white (lk-ring-legend), and at Unstoppable
// cyan → blue → violet (lk-ring-blue). The ring's -90° turn
// lays both from bottom-left to top-right, so each flame takes the colour of
// the part of the ring it rises from.
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lerp = (a, b, t) => a + (b - a) * t;
const LIME = "#C8FF00";
// Keep these stops in step with the ring gradients in LinkPage's Receipt.
const GRADIENTS = {
  hot: [[0, "#C8FF00"], [0.6, "#F5B84A"], [1, "#FF6B3D"]],
  legend: [[0, "#F5B84A"], [0.55, "#FFE08A"], [1, "#FFF8E6"]],
  blue: [[0, "#5BE7FF"], [0.55, "#4D7CFF"], [1, "#B06CFF"]],
};
const FAMILIES = 7; // shades sampled along each gradient
const mix = (a, b, t) => a.map((v, k) => Math.round(lerp(v, b[k], t)));
/** A flame's life in colours: a pale hot base, the ring colour, then darker to the tip. */
const rampOf = (rgb) => [mix(rgb, [255, 255, 255], 0.6), rgb, mix(rgb, [0, 0, 0], 0.45), mix(rgb, [0, 0, 0], 0.88)];
/** White-hot: a white base, the ring's gold, then cooling through orange to an ember. */
const legendRampOf = (rgb) => [[255, 255, 250], rgb, mix(rgb, [255, 110, 40], 0.6), [70, 18, 4]];
/** Blue fire: white at the base, the ring's blue, then into deep violet and night. */
const blueRampOf = (rgb) => [[245, 252, 255], rgb, mix(rgb, [90, 30, 200], 0.55), [10, 6, 40]];
const RAMP_OF = { legend: legendRampOf, blue: blueRampOf };
function gradientAt(stops, g) {
  for (let i = 1; i < stops.length; i++) {
    if (g <= stops[i][0]) { const [p, a] = stops[i - 1], [q, b] = stops[i]; return mix(hex(a), hex(b), (g - p) / (q - p)); }
  }
  return hex(stops[stops.length - 1][1]);
}

const smooth = (t) => t * t * (3 - 2 * t);

/** A colour `t` (0–1) of the way along a ramp of [r, g, b] colours. */
function along(ramp, t) {
  const x = t * (ramp.length - 1), i = Math.min(ramp.length - 2, Math.floor(x));
  return mix(ramp[i], ramp[i + 1], x - i);
}

/** A soft teardrop of one colour, brightest low down, transparent at the edges. */
function teardrop([r, g, b]) {
  const c = document.createElement("canvas");
  c.width = 48; c.height = 80;
  const x = c.getContext("2d");
  x.translate(24, 52);
  x.scale(1, 1.65);
  const grad = x.createRadialGradient(0, 0, 0, 0, 0, 24);
  grad.addColorStop(0, `rgba(${r},${g},${b},0.95)`);
  grad.addColorStop(0.4, `rgba(${r},${g},${b},0.45)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = grad;
  x.beginPath(); x.arc(0, 0, 24, 0, Math.PI * 2); x.fill();
  return c;
}
function dot(mid = "255,190,110", edge = "255,120,60") {
  const c = document.createElement("canvas");
  c.width = c.height = 16;
  const x = c.getContext("2d");
  const grad = x.createRadialGradient(8, 8, 0, 8, 8, 8);
  grad.addColorStop(0, "rgba(255,250,225,1)");
  grad.addColorStop(0.4, `rgba(${mid},0.6)`);
  grad.addColorStop(1, `rgba(${edge},0)`);
  x.fillStyle = grad; x.fillRect(0, 0, 16, 16);
  return c;
}

export default function StreakFire({ heat = 1, flameRef }) {
  const canvasRef = React.useRef(null);
  const target = React.useRef(heat);
  target.current = heat;

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof window === "undefined") return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    // Colour families, each pre-drawn in STEPS shades from base to tip:
    // "lime", and FAMILIES shades along each gradient ring ("hot:3").
    const shades = (rgb, toRamp = rampOf) => { const r = toRamp(rgb); return Array.from({ length: STEPS }, (_, i) => teardrop(along(r, i / (STEPS - 1)))); };
    const ramps = { lime: shades(hex(LIME)) };
    for (const [name, stops] of Object.entries(GRADIENTS)) {
      for (let i = 0; i < FAMILIES; i++) ramps[`${name}:${i}`] = shades(gradientAt(stops, i / (FAMILIES - 1)), RAMP_OF[name] || rampOf);
    }
    // Which family a point on the ring burns in, for the ring as it is now.
    const familyAt = (x, y, ring) => {
      if (ring === "lime") return "lime";
      const g = Math.max(0, Math.min(1, ((x - CX) - (y - CY)) / (2 * R) + 0.5));
      return `${ring}:${Math.round(g * (FAMILIES - 1))}`;
    };
    const sparks = { lime: dot("226,255,120", "200,255,0"), hot: dot(), legend: dot("255,236,170", "255,200,90"), blue: dot("170,225,255", "120,110,255") };

    let parts = [];
    let level = target.current; // eases toward the target heat
    let reached = target.current; // the highest heat seen, for the one-off bursts
    let carry = 0, sparkCarry = 0, raf = 0, last = 0, clock = 0, sinceFind = 1;
    let flame = { x: CX, y: CY - 22 };

    // Where the centre flame is, so embers come off it; checked now and then.
    const findFlame = () => {
      const el = flameRef?.current;
      if (!el) return;
      const a = el.getBoundingClientRect(), b = canvas.getBoundingClientRect();
      if (!b.width) return;
      flame = { x: (a.left + a.width / 2 - b.left) * (W / b.width), y: (a.top + a.height * 0.3 - b.top) * (H / b.height) };
    };

    const cfg = () => {
      const lo = Math.max(1, Math.min(TOP, Math.floor(level))), hi = Math.min(TOP, lo + 1), t = smooth(Math.max(0, Math.min(1, level - lo)));
      const A = HEATS[lo], B = HEATS[hi];
      return { rate: lerp(A.rate, B.rate, t), arc: lerp(A.arc, B.arc, t), size: lerp(A.size, B.size, t), rise: lerp(A.rise, B.rise, t), life: lerp(A.life, B.life, t), sparks: lerp(A.sparks, B.sparks, t), ring: (t > 0.5 ? B : A).ring };
    };

    // Flames are thicker at the top of the ring and thin out down its sides.
    const spawn = (c) => {
      const fromFlame = c.arc < 0.05 || Math.random() < 0.08;
      let x, y, edge = 1;
      if (fromFlame) { x = flame.x + (Math.random() - 0.5) * 8; y = flame.y; }
      else {
        const u = Math.random() * 2 - 1;
        const ang = Math.sign(u) * Math.pow(Math.abs(u), 1.35) * c.arc;
        edge = 1 - 0.45 * Math.abs(ang) / Math.max(c.arc, 0.01);
        x = CX + Math.sin(ang) * R + (Math.random() - 0.5) * 4;
        y = CY - Math.cos(ang) * R + (Math.random() - 0.5) * 4;
      }
      parts.push({
        x, y, age: 0, spark: false, ramp: fromFlame ? (c.ring === "lime" ? "lime" : `${c.ring}:${FAMILIES - 1}`) : familyAt(x, y, c.ring),
        life: c.life * (0.6 + Math.random() * 0.7) * (fromFlame ? 0.8 : 1),
        vy: -c.rise * (0.75 + Math.random() * 0.5) * edge,
        vx: (Math.random() - 0.5) * 8,
        size: c.size * (fromFlame ? 0.6 : 0.75 + Math.random() * 0.5) * (0.7 + 0.3 * edge),
        seed: Math.random() * 100,
      });
    };
    const spawnSpark = (c) => {
      const ang = (Math.random() * 2 - 1) * Math.max(c.arc, 0.6) * 0.8;
      parts.push({ x: CX + Math.sin(ang) * R, y: CY - Math.cos(ang) * R, age: 0, spark: true, tint: c.ring, life: 0.9 + Math.random() * 0.8, vx: (Math.random() - 0.5) * 40, vy: -(70 + Math.random() * 90), size: 1.6 + Math.random() * 1.6, seed: Math.random() * 100 });
    };

    // Crossing into Legendary (30) or Unstoppable (100): one ring of sparks in
    // that level's colour, thrown outward all the way round. Once, not every
    // time the page draws.
    const burst = (tint) => {
      for (let i = 0; i < 90; i++) {
        const ang = (i / 90) * Math.PI * 2 + Math.random() * 0.07, sp = 90 + Math.random() * 120;
        parts.push({ x: CX + Math.sin(ang) * R, y: CY - Math.cos(ang) * R, age: 0, spark: true, tint, life: 0.8 + Math.random() * 0.7, vx: Math.sin(ang) * sp, vy: -Math.cos(ang) * sp - 30, size: 1.8 + Math.random() * 1.8, seed: Math.random() * 100 });
      }
    };

    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden) { last = now; return; }
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
      last = now; clock += dt;
      sinceFind += dt;
      if (sinceFind > 0.3) { findFlame(); sinceFind = 0; }
      if (target.current >= BURST_FROM && target.current > reached) burst(HEATS[Math.min(TOP, target.current)].ring);
      reached = Math.max(reached, target.current);
      level = lerp(level, target.current, 1 - Math.exp(-dt * 2.5));
      const c = cfg();
      carry += c.rate * dt;
      while (carry >= 1) { spawn(c); carry -= 1; }
      sparkCarry += c.sparks * dt;
      while (sparkCarry >= 1) { spawnSpark(c); sparkCarry -= 1; }
      if (parts.length > 900) parts = parts.slice(-900);

      // One breeze for the whole fire: slow, smooth, never the same twice.
      const breeze = Math.sin(clock * 0.9) * 10 + Math.sin(clock * 2.3 + 1.7) * 5;

      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";

      // The glow bed: a soft band along the burning part of the ring.
      if (c.arc > 0.05) {
        const steps = 18;
        for (let i = 0; i <= steps; i++) {
          const ang = (i / steps * 2 - 1) * c.arc;
          const bx = CX + Math.sin(ang) * R, by = CY - Math.cos(ang) * R;
          const img = ramps[familyAt(bx, by, c.ring)][Math.round(STEPS * 0.3)];
          const s = c.size * 2.2 * (1 - 0.4 * Math.abs(ang) / c.arc);
          ctx.globalAlpha = 0.16 + 0.05 * Math.sin(clock * 6 + i);
          ctx.drawImage(img, CX + Math.sin(ang) * R - s, CY - Math.cos(ang) * R - s * 1.3, s * 2, s * 2.4);
        }
      }

      const next = [];
      for (const p of parts) {
        p.age += dt;
        if (p.age >= p.life) continue;
        const t = p.age / p.life;
        if (p.spark) {
          p.vy += 60 * dt; // they slow, then fall back a little
          p.x += (p.vx + breeze * 0.6) * dt;
          p.y += p.vy * dt;
          ctx.globalAlpha = (1 - t) * (0.6 + 0.4 * Math.sin(p.seed + clock * 20));
          const s = p.size * 2;
          ctx.drawImage(sparks[p.tint] || sparks.hot, p.x - s, p.y - s, s * 2, s * 2);
        } else {
          // Rise faster as they go, lean with the breeze, and flicker a little.
          const lift = 1 + t * 0.8;
          p.x += (p.vx + breeze * t + Math.sin(p.seed + clock * 7) * 6 * t) * dt;
          p.y += p.vy * lift * dt;
          // Swell quickly, then taper to a point.
          const grow = t < 0.15 ? smooth(t / 0.15) : 1 - smooth((t - 0.15) / 0.85) * 0.85;
          const w = p.size * grow, h = p.size * grow * (1.5 + t * 1.2);
          // Fade out near the top of the canvas so nothing gets cut off.
          const roof = Math.min(1, Math.max(0, p.y / 40));
          ctx.globalAlpha = 0.5 * (1 - smooth(t)) * roof;
          const img = ramps[p.ramp][Math.min(STEPS - 1, Math.floor(t * STEPS))];
          ctx.drawImage(img, p.x - w, p.y - h * 1.3, w * 2, h * 2);
        }
        next.push(p);
      }
      parts = next;
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [flameRef]);

  return <canvas ref={canvasRef} className="lk-fire" aria-hidden="true" />;
}
