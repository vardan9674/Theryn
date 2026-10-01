import React from "react";
import { streakHeat } from "../coach/lib/streak.js";
import StreakFire from "./StreakFire.jsx";
import "./streak.css";

// The streak ring with its fire, straight after a workout: on the client
// link's receipt and the athlete app's "Workout complete". The number counts
// up from the streak before this workout to the streak now, and the fire
// heats up with it (streakHeat), so crossing 4, 7, 14, 30 or 100 happens in
// front of them: a shockwave off the ring and a punch on the number.

const FLAME = "M12 2c1.5 4 6 5.5 6 11a6 6 0 0 1-12 0c0-2.2 1.2-3.6 1.2-3.6S8.4 12 9.6 12c0-3 1.2-6.4 2.4-10z";
const R = 76, C = 2 * Math.PI * R;

/** Counts from `from` up to `to`, a step at a time; straight to `to` with reduced motion. */
export function useCountUp(from, to) {
  const [n, setN] = React.useState(from);
  React.useEffect(() => {
    if (to <= from || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setN(to); return undefined; }
    let cur = from;
    const t = setInterval(() => { cur += 1; setN(cur); if (cur >= to) clearInterval(t); }, Math.max(90, 500 / (to - from)));
    return () => clearInterval(t);
  }, [from, to]);
  return n;
}

/** Bumps each time the heat goes up, so the ring plays its shockwave once per step. */
function useLevelUps(level) {
  const [n, setN] = React.useState(0);
  const prev = React.useRef(level);
  React.useEffect(() => { if (level > prev.current) setN((x) => x + 1); prev.current = level; }, [level]);
  return n;
}

/** The small flame in the middle; burns hotter with the number. */
const StreakFlame = React.forwardRef(function StreakFlame({ n }, ref) {
  return (
    <span ref={ref} className={`lk-flame h${streakHeat(n).level}`} aria-hidden="true">
      <svg viewBox="0 0 24 24"><path className="outer" d={FLAME} /><path className="mid" d={FLAME} /><path className="core" d={FLAME} /></svg>
    </span>
  );
});

/**
 * @param from   the streak before this workout (where the count starts)
 * @param to     the streak now
 * @param fill   how much of the ring is drawn, 0–1
 * @param noun   ["workout", "workouts"] or ["day", "days"]: what the streak counts
 */
export default function StreakRing({ from, to, fill = 1, noun = ["workout", "workouts"] }) {
  const shown = useCountUp(Math.min(from ?? to, to), to);
  const heatNow = streakHeat(shown).level;
  const boom = useLevelUps(heatNow);
  const flameRef = React.useRef(null);
  const final = streakHeat(to);
  const word = to === 1 ? noun[0] : noun[1];
  return (
    <>
      <div className={`lk-ring h${heatNow}`} role="img" aria-label={`${to} ${word} in a row${final.word ? `, ${final.word.toLowerCase()}` : ""}`}>
        <svg width="168" height="168" viewBox="0 0 168 168">
          <circle cx="84" cy="84" r={R} fill="none" stroke="var(--cx-bd, #2A2A2A)" strokeWidth="8" />
          <defs>
            <linearGradient id="lk-ring-hot" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#C8FF00" /><stop offset="0.6" stopColor="#F5B84A" /><stop offset="1" stopColor="#FF6B3D" /></linearGradient>
            <linearGradient id="lk-ring-legend" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#F5B84A" /><stop offset="0.55" stopColor="#FFE08A" /><stop offset="1" stopColor="#FFF8E6" /></linearGradient>
            <linearGradient id="lk-ring-blue" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5BE7FF" /><stop offset="0.55" stopColor="#4D7CFF" /><stop offset="1" stopColor="#B06CFF" /></linearGradient>
          </defs>
          <circle className="lk-ring-fill" cx="84" cy="84" r={R} fill="none" stroke={heatNow >= 6 ? "url(#lk-ring-blue)" : heatNow >= 5 ? "url(#lk-ring-legend)" : heatNow >= 4 ? "url(#lk-ring-hot)" : "var(--cx-a, #C8FF00)"}
            strokeWidth="8" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - Math.max(0, Math.min(1, fill)))} style={{ "--c": C }} />
        </svg>
        <StreakFire heat={heatNow} flameRef={flameRef} />
        {boom > 0 && <span key={boom} className="lk-shock" aria-hidden="true" />}
        <div className="lk-ring-in"><StreakFlame ref={flameRef} n={shown} /><b key={boom} className={boom ? "punch" : ""}>{shown}</b><span>{word}<br />in a row</span></div>
      </div>
      {final.word && <span className={`lk-heat-word h${final.level}`}>{final.word}</span>}
    </>
  );
}
