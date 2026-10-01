import React from "react";

// Live fire around the streak ring on the receipt. The longer the streak, the
// more of the ring burns: a few embers off the flame for a new streak, the
// top of the ring alight from 4 in a row, most of it from 7, all of it with
// sparks flying at 14 (streakHeat). Heat eases between steps, so when the
// count-up crosses a step the fire visibly catches.
//
// Canvas, additive blending, pre-drawn glow sprites: one drawImage per
// particle, a few hundred at most. It stops when the tab is hidden, and never
// starts for someone who asked for reduced motion (link.css hides it too).

// Sits behind the ring; the ring's centre is at (CX, CY) inside it (see .lk-fire).
const W = 280, H = 320, CX = 140, CY = 196, R = 76;

// Per heat: particles a frame, how far round the ring from the top they start
// (radians either side), size, rise speed, life in frames, sparks a frame,
// and the colours a flame passes through as it burns out.
const HEATS = {
  1: { rate: 0.5, arc: 0, size: 6, rise: 0.8, life: 30, sparks: 0, colors: ["#E6FF7A", "#C8FF00", "#4F6600"] },
  2: { rate: 3, arc: 0.75, size: 7.5, rise: 1.1, life: 36, sparks: 0.06, colors: ["#E6FF7A", "#C8FF00", "#6E8F00"] },
  3: { rate: 6, arc: 1.3, size: 9, rise: 1.45, life: 42, sparks: 0.22, colors: ["#FFD27A", "#F5B84A", "#E07A2A", "#8A3A10"] },
  // Not quite all the way round: flames off the bottom would climb through the words.
  4: { rate: 11, arc: 2.1, size: 10.5, rise: 1.85, life: 48, sparks: 0.6, colors: ["#FFC36B", "#FF9A3D", "#FF6B3D", "#A8261A"] },
};

/** A soft round glow in one colour, drawn once and stamped for every particle. */
function sprite(color) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, color + "EE");
  grad.addColorStop(0.45, color + "66");
  grad.addColorStop(1, color + "00");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

const lerp = (a, b, t) => a + (b - a) * t;

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

    const sprites = {};
    for (const h of Object.values(HEATS)) for (const col of h.colors) if (!sprites[col]) sprites[col] = sprite(col);
    sprites.spark = sprite("#FFF6D8");

    let parts = [];
    let level = target.current; // eases toward the target heat
    let carry = 0, sparkCarry = 0, frame = 0, raf = 0;
    let flame = { x: CX, y: CY - 22 };

    // Where the centre flame is, so embers come off it; checked now and then, not every frame.
    const findFlame = () => {
      const el = flameRef?.current;
      if (!el) return;
      const a = el.getBoundingClientRect(), b = canvas.getBoundingClientRect();
      if (!b.width) return;
      flame = { x: (a.left + a.width / 2 - b.left) * (W / b.width), y: (a.top + a.height * 0.35 - b.top) * (H / b.height) };
    };

    const cfg = () => {
      const lo = Math.max(1, Math.floor(level)), hi = Math.min(4, lo + 1), t = level - lo;
      const A = HEATS[lo], B = HEATS[hi];
      return { rate: lerp(A.rate, B.rate, t), arc: lerp(A.arc, B.arc, t), size: lerp(A.size, B.size, t), rise: lerp(A.rise, B.rise, t), life: lerp(A.life, B.life, t), sparks: lerp(A.sparks, B.sparks, t), colors: (t > 0.5 ? B : A).colors };
    };

    const spawn = (c) => {
      // Some from the flame in the middle, the rest from the ring itself.
      const fromFlame = c.arc === 0 || Math.random() < 0.18;
      let x, y;
      if (fromFlame) { x = flame.x + (Math.random() - 0.5) * 10; y = flame.y; }
      else {
        const ang = (Math.random() * 2 - 1) * c.arc;
        x = CX + Math.sin(ang) * R + (Math.random() - 0.5) * 6;
        y = CY - Math.cos(ang) * R + (Math.random() - 0.5) * 6;
      }
      const life = c.life * (0.7 + Math.random() * 0.6);
      parts.push({ x, y, vx: (Math.random() - 0.5) * 0.5, vy: -c.rise * (0.7 + Math.random() * 0.6), life, age: 0, size: c.size * (fromFlame ? 0.6 : 0.8 + Math.random() * 0.5), colors: c.colors, spark: false });
    };
    const spawnSpark = (c) => {
      const ang = (Math.random() * 2 - 1) * Math.max(c.arc, 0.6);
      parts.push({ x: CX + Math.sin(ang) * R, y: CY - Math.cos(ang) * R, vx: (Math.random() - 0.5) * 1.6, vy: -(1.6 + Math.random() * 2.2), life: 50 + Math.random() * 40, age: 0, size: 3 + Math.random() * 2.5, spark: true });
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (document.hidden) return;
      frame += 1;
      if (frame % 20 === 1) findFlame();
      level = lerp(level, target.current, 0.04);
      const c = cfg();
      carry += c.rate;
      while (carry >= 1) { spawn(c); carry -= 1; }
      sparkCarry += c.sparks;
      while (sparkCarry >= 1) { spawnSpark(c); sparkCarry -= 1; }
      if (parts.length > 700) parts = parts.slice(-700);

      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      const next = [];
      for (const p of parts) {
        p.age += 1;
        if (p.age >= p.life) continue;
        const t = p.age / p.life;
        // Flames sway as they rise; sparks drift and fall back a little.
        p.x += p.vx + (p.spark ? 0 : Math.sin((p.age + p.y) * 0.12) * 0.35);
        p.y += p.vy;
        if (p.spark) p.vy += 0.03;
        const s = p.spark ? p.size : p.size * (1 - t * 0.7);
        ctx.globalAlpha = p.spark ? (1 - t) : 0.6 * Math.min(1, (1 - t) * 1.4) * (t < 0.1 ? t * 10 : 1);
        const img = p.spark ? sprites.spark : sprites[p.colors[Math.min(p.colors.length - 1, Math.floor(t * p.colors.length))]];
        if (p.spark) ctx.drawImage(img, p.x - s, p.y - s, s * 2, s * 2);
        else ctx.drawImage(img, p.x - s * 1.1, p.y - s * 2, s * 2.2, s * 3.6); // a tongue, taller than it is wide
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
