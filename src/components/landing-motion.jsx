import React, { useEffect, useRef, useState } from "react";
import { useInView } from "framer-motion";
import { WorkoutLinkPreview } from "../link/LinkPage.jsx";
import "./landing-motion.css";

// Every choreographed block on the landing page follows the same contract:
// its markup's resting CSS *is* the end state, keyframes run once from the
// start state when the block scrolls into view, and with motion off nothing
// ever leaves the end state. `usePlayOnView` hands out that phase.
export function usePlayOnView(ref, motionOn, amount = 0.35) {
  const inView = useInView(ref, { once: true, amount });
  if (!motionOn) return "done";
  return inView ? "play" : "pending";
}

const Check = ({ size = 18, color = "#080808" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
);
const LinkIcon = ({ size = 14, color = "#080808" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5" /></svg>
);

// The four places a coach keeps one athlete today. Each card is one piece of
// Maya; the hero and the pain beat both pull them into her Theryn row.
const TOOLS = [
  { cls: "tool-whatsapp", app: "WhatsApp · Maya", text: "“did you finish yesterday?”", meta: "9:02 pm · unread" },
  { cls: "tool-excel", app: "Excel · Plans.xlsx", text: "Maya · Wk 3 · Bench 3×8 · 135", meta: "last saved Tuesday" },
  { cls: "tool-notes", app: "Notes", text: "Maya — felt heavy on bench", meta: "which week was this?" },
  { cls: "tool-reminders", app: "Reminders", text: "Chase Maya re: payment", meta: "overdue · 3 days" },
];
function ToolCards() {
  return TOOLS.map((t, i) => (
    <div key={t.app} className={`tool-card ${t.cls} tool-${i + 1}`} aria-hidden="true">
      <small>{t.app}</small><b>{t.text}</b><span>{t.meta}</span>
    </div>
  ));
}

// ── Hero: the pile collapses into Maya's row on the coach dashboard ─────────
export function HeroDashboard({ motionOn }) {
  return (
    <div className="hero-dash" data-phase={motionOn ? "play" : "done"} aria-label="Sample coach dashboard: four separate apps collapsing into one athlete row">
      <div className="dash">
        <div className="dash-bar"><span aria-hidden="true">● ● ●</span><small>Your athletes</small><span>Mon · 6:42 pm</span></div>
        <div className="dash-body">
          <div className="dash-head"><b>7 athletes</b><span>5 trained this week</span></div>
          <div className="dash-chips"><span className="on">All</span><span className="warn">1 needs attention</span><span>Payments</span></div>
          <div className="drow maya">
            <div className="drow-top"><div className="who"><span className="av">MJ</span><div><b>Maya J.</b><small>PPL · week 3</small></div></div><span className="pill now">Trained today</span></div>
            <div className="stats">
              <div className="s1">Bench<b>3×8 · 135 lb</b></div>
              <div className="s2">This week<b><span className="week"><i className="done" /><i className="done" /><i className="live" /><i /></span></b></div>
              <div className="s3">Payment<b>Paid</b></div>
            </div>
            <div className="dnote">“Felt heavy on bench today.” <span>— Maya, just now</span></div>
          </div>
          <div className="drow dim"><div className="drow-top"><div className="who"><span className="av">PS</span><div><b>Priya Sharma</b><small>Upper/Lower · week 6</small></div></div><span className="pill late">6 days quiet</span></div></div>
          <div className="drow dim"><div className="drow-top"><div className="who"><span className="av">AR</span><div><b>Aisha Rahman</b><small>Full body · week 2</small></div></div><span className="pill ok">28-day streak</span></div></div>
        </div>
      </div>
      <ToolCards />
      <div className="hero-ticket-v2"><span className="ticket-arrow" aria-hidden="true">↗</span><div><small>FROM YOUR COACH</small><strong>Your workout is ready.</strong><span>Open the link. You’re in. →</span></div></div>
      <small className="sample-label">Sample athletes</small>
    </div>
  );
}

// ── Pain beat: four tools, one athlete, one row ─────────────────────────────
export function ToolPile({ motionOn, phase: parentPhase }) {
  const ref = useRef(null);
  const ownPhase = usePlayOnView(ref, motionOn);
  const phase = parentPhase || ownPhase;
  return (
    <div ref={ref} className="tool-pile" data-phase={phase} aria-label="Four apps holding one athlete merge into a single Theryn row">
      <span className="apps-badge" aria-hidden="true">4 apps</span>
      <ToolCards />
      <div className="one-row">
        <div className="drow-top"><div className="who"><span className="av">MJ</span><b>Maya J.</b></div><span className="pill now">Trained today</span></div>
        <div className="stats"><div>Plan<b>PPL · week 3</b></div><div>Bench<b>3×8 · 135 lb</b></div><div>Payment<b>Paid</b></div></div>
        <div className="dnote">“Felt heavy on bench today.” <span>— Maya, 6:41 pm</span></div>
        <small className="one-label">One athlete · one place</small>
      </div>
    </div>
  );
}

// ── Athlete flow: Open → Tick → Send → Measure on the real link page ────────
// Frames are [screen, ticks, filled, holdMs]. The phone plays them in order
// while in view, holds on the last one, then loops.
const FLOW = [
  ["open", 0, 0, 3400],
  ["workout", 0, 0, 1100], ["workout", 1, 0, 1100], ["workout", 2, 0, 1100], ["workout", 3, 0, 1400],
  ["sent", 3, 0, 3000],
  ["measure", 3, 0, 1000], ["measure", 3, 1, 1000], ["measure", 3, 2, 1000], ["measure", 3, 3, 1300],
  ["measured", 3, 3, 3200],
];
export const FLOW_STAGES = [
  { id: "open", label: "Open", caption: "Your coach texts you a link. Tap it — no app, no account, no password." },
  { id: "workout", label: "Tick", caption: "Tap the box as you finish each exercise. Add the weight you used if you want." },
  { id: "sent", label: "Send to coach", caption: "One tap sends it. Your coach sees it the same second." },
  { id: "measure", label: "Measurements", caption: "When your coach asks for measurements, the second tab is right there. Same link." },
];
const stageOf = screen => (screen === "measured" ? "measure" : screen);

export function useAthleteFlow(active, motionOn) {
  const [frame, setFrame] = useState(motionOn ? 0 : 4);
  useEffect(() => {
    if (!motionOn || !active) return;
    const t = setTimeout(() => setFrame(f => (f + 1) % FLOW.length), FLOW[frame][3]);
    return () => clearTimeout(t);
  }, [frame, active, motionOn]);
  const [screen, ticks, filled] = FLOW[frame];
  const stage = stageOf(screen);
  // Clicking a step label jumps to the first frame of that stage.
  const jump = id => setFrame(FLOW.findIndex(f => stageOf(f[0]) === id));
  return { screen, ticks, filled, stage, jump };
}

const BAR_TITLES = { open: "Messages", workout: "Your coach’s workout link", sent: "Sent to your coach", measure: "Your coach’s workout link", measured: "Sent to your coach" };
export function AthletePhone({ screen, ticks, filled }) {
  const scroll = useRef(null);
  useEffect(() => {
    // Keep the part being acted on in frame, without touching page scroll:
    // the exercise list while ticking, the number fields while measuring.
    const win = scroll.current;
    if (!win) return;
    if (screen === "measure") {
      const field = win.querySelector(".lk-numfield");
      win.scrollTo({ top: field ? Math.max(0, field.offsetTop - 130) : 0, behavior: filled ? "auto" : "smooth" });
    } else win.scrollTop = screen === "workout" && ticks > 0 ? 300 : 0;
  }, [screen, ticks, filled]);
  return (
    <figure className="athlete-product">
      <div className="product-browser-bar">{BAR_TITLES[screen]}</div>
      <div className="product-window" ref={scroll} data-screen={screen}>
        {screen === "open"
          ? <div className="open-screen" aria-hidden="true">
              <div className="bubble">Hey Maya — your plan for this week 💪</div>
              <div className="bubble link"><span>Open it here:</span><b>theryn.fit/l/maya</b><i className="tap-ring" /></div>
              <div className="compose" />
              <i className="load-bar" />
            </div>
          : <div inert="" aria-hidden="true" className="link-rise" key={screen === "workout" && ticks === 0 ? "rise" : "still"}><WorkoutLinkPreview screen={screen} ticks={ticks} filled={filled} /></div>}
      </div>
      <figcaption>Sample athlete · automatic product demonstration</figcaption>
    </figure>
  );
}

// ── The peak: athlete ticks, coach sees it, same second ─────────────────────
export function ConnectionMoment({ motionOn }) {
  const ref = useRef(null);
  const phase = usePlayOnView(ref, motionOn, 0.4);
  return (
    <div ref={ref} className="connection" data-phase={phase} aria-label="An athlete finishes a workout on their phone and the coach's dashboard updates the same second">
      <div className="cx-phone">
        <small className="kicker">Maya · Monday push</small>
        <div className="ex"><span className="tick live"><em>01</em><Check /></span><div><b>Bench Press</b><span>3 × 8 · 135 lb</span></div><i className="tap-ring t1" /></div>
        <div className="ex"><span className="tick on"><Check /></span><div><b>Overhead Press</b><span>3 × 10 · 65 lb</span></div></div>
        <div className="ex"><span className="tick on"><Check /></span><div><b>Cable Fly</b><span>3 × 12 · 25 lb</span></div></div>
        <div className="felt-in">“Felt heavy on bench today.”</div>
        <div className="finish-wrap"><div className="finish">Finish workout</div><i className="tap-ring t2" /></div>
      </div>
      <div className="wire" aria-hidden="true">
        <svg viewBox="0 -120 320 130" preserveAspectRatio="none"><path className="trail" d="M 0 0 C 120 0, 160 -110, 300 -110" /></svg>
        <span className="pulse" />
      </div>
      <div className="dash cx-dash">
        <div className="dash-bar"><span aria-hidden="true">● ● ●</span><small>Coach dashboard</small><span>THERYN</span></div>
        <div className="dash-body">
          <div className="dash-head"><b>7 athletes</b><span>Monday · 6:42 pm</span></div>
          <div className="drow maya">
            <div className="drow-top"><div className="who"><span className="av">MJ</span><b>Maya J.</b></div><span className="swap"><span className="pill ok a">Not yet today</span><span className="pill now b">Just now</span></span></div>
            <div className="stats">
              <div>Last workout<b className="swap"><span className="a">2 days ago</span><span className="b accent">Today</span></b></div>
              <div>This week<b><span className="week"><i className="live" /><i /><i /><i /></span></b></div>
              <div>Sets done<b className="swap"><span className="a">0 of 9</span><span className="b">9 of 9</span></b></div>
            </div>
            <div className="dnote">“Felt heavy on bench today.” <span>— Maya, just now</span></div>
          </div>
          <div className="drow dim"><div className="drow-top"><div className="who"><span className="av">AR</span><b>Aisha Rahman</b></div><span className="pill ok">28-day streak</span></div></div>
        </div>
      </div>
    </div>
  );
}

// ── Payoff: Sunday's messages become Monday's check-in ──────────────────────
const FLIPS = [
  ["MAYA → YOU · SUNDAY", "Where’s my plan?", "COACH → MAYA · CHECK-IN", "You’re lifting more."],
  ["MAYA → YOU · SUNDAY", "What weight should I use?", "COACH → MAYA · CHECK-IN", "You’re showing up more often."],
  ["YOU → MAYA · SUNDAY", "Did you finish yesterday?", "COACH → MAYA · CHECK-IN", "Here’s what we’ll work on next."],
];
export function PayoffFlip({ motionOn, children }) {
  const ref = useRef(null);
  const phase = usePlayOnView(ref, motionOn);
  return (
    <div ref={ref} className="payoff" data-phase={phase}>
      <div className="payoff-msgs">
        {FLIPS.map(([oldK, oldT, newK, newT], i) => (
          <div key={newT} className={`flip flip-${i + 1}`}>
            <div className="old" aria-hidden="true"><small>{oldK}</small><strong>{oldT}</strong></div>
            <div className="new"><small>{newK}</small><strong>{newT}</strong></div>
          </div>
        ))}
        {children}
      </div>
      <div className="dash progress-card" aria-label="Sample progress: Maya's bench press over 12 weeks, 95 to 135 lb">
        <div className="dash-head"><b>Maya · Bench press</b><span>12 weeks</span></div>
        <div className="chart-wrap">
          <svg viewBox="0 0 440 150" preserveAspectRatio="none" aria-hidden="true">
            <line x1="0" y1="140" x2="440" y2="140" /><line x1="0" y1="90" x2="440" y2="90" /><line x1="0" y1="40" x2="440" y2="40" />
            <path className="chart-line" d="M 0 128 L 40 124 L 80 118 L 120 120 L 160 108 L 200 100 L 240 96 L 280 84 L 320 78 L 360 62 L 400 50 L 440 38" />
          </svg>
          <div className="chart-count"><b>135 lb</b><span>up from 95 · +40 lb</span></div>
        </div>
        <div className="stats tiles"><div>Sessions<b>31 / 36</b></div><div>Streak<b>5 wks</b></div><div className="goal">Next goal<b>145 lb</b></div></div>
      </div>
    </div>
  );
}

export { LinkIcon };
