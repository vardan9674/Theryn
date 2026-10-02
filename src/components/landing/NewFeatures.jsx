import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import StreakRing from "../StreakRing.jsx";
import WinsPanel from "../WinsPanel.jsx";
import BodyMap from "../BodyMap.jsx";
import MuscleHeat from "../../link/MuscleHeat.jsx";
import { ReportView } from "../../link/LinkReport.jsx";
import { MUSCLE_GROUPS, GROUP_LABEL, loadLibrary, filterLibrary, alsoWorks, EQUIPMENT } from "../../lib/exerciseLibrary.js";
import { buildWeeklyReport, defaultReportWeek, reportSnapshot, DEFAULT_SECTIONS } from "../../coach/lib/weeklyReport.js";
import { CoachBubble } from "./Coach.jsx";
import "./new-features.css";

// The features added since the first landing page. Like the rest of the page,
// every product visual here is the real component running on sample data —
// the streak ring, medals, muscle map and weekly report are the app's own.

/** True once the element is on screen, and stays true: lets entry motion play on arrival. */
function useSeen(threshold = 0.3) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setSeen(true); }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [seen, threshold]);
  return [ref, seen];
}

/** Scale that fits a fixed-width app screen into its box. */
function useFit(base) {
  const ref = useRef(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / base));
    ro.observe(el);
    return () => ro.disconnect();
  }, [base]);
  return [ref, scale];
}

// ── 1. What they get back ──────────────────────────────────────────────────
const STREAKS = [3, 7, 14, 30, 100];
const WINS = [
  { name: "Bench Press", kind: "heavier", now: 135, before: 125, reps: 8 },
  { name: "Overhead Press", kind: "reps", now: 10, before: 8, weight: 65 },
  { name: "Cable Fly", kind: "more", now: 36, before: 30 },
];
const WORKED = [{ name: "Bench Press", sets: 3 }, { name: "Overhead Press", sets: 3 }, { name: "Cable Fly", sets: 3 }];

export function Payoff() {
  const [ref, seen] = useSeen(0.25);
  const [streak, setStreak] = useState({ from: 6, to: 7 });
  const pick = to => setStreak(s => ({ from: s.to, to }));
  return (
    <section className="tl-section nf-payoff" id="payoff" ref={ref}>
      <div className="tl-wrap">
        <div className="tl-sec-head">
          <CoachBubble line="This is the bit they screenshot." clip="psst" />
          <h2>They hit finish. <em>They get this.</em></h2>
          <p className="tl-lede">Their streak, a medal for every lift they beat, and the muscles they worked.</p>
        </div>
        <div className="nf-payoff-grid">
          <div className="nf-stage tl-screen nf-live cx-app">
            {/* Like the receipt: the ring is current ÷ best, so a new best closes it. */}
            {seen && <StreakRing key={`${streak.from}-${streak.to}`} from={streak.from} to={streak.to} fill={1} />}
            {seen && <div className="lk-small nf-best">That’s your best streak yet.</div>}
          </div>
          <div className="nf-days" role="group" aria-label="Try a streak length">
            <span>Try a streak</span>
            {STREAKS.map(n => <button key={n} aria-pressed={streak.to === n} onClick={() => pick(n)}>{n}</button>)}
          </div>
          <div className="nf-panel tl-screen nf-live cx-app">{seen && <WinsPanel wins={WINS} unit="lb" />}</div>
          <div className="nf-panel tl-screen nf-live cx-app">{seen && <MuscleHeat exercises={WORKED} />}</div>
        </div>
      </div>
    </section>
  );
}

// ── 2. The weekly report ───────────────────────────────────────────────────
const REPORT_PARTS = [["workouts", "Workouts"], ["wins", "Wins"], ["volume", "Weight lifted"], ["muscles", "Muscles"], ["body", "Body"], ["note", "Your note"]];

export function WeeklyReport() {
  const [ref, seen] = useSeen(0.15);
  const [fitRef, scale] = useFit(390);
  const [report, setReport] = useState(null);
  const [sections, setSections] = useState({ ...DEFAULT_SECTIONS, body: true });
  const [shared, setShared] = useState(false);

  // Sample coach data is only fetched when the section comes into view.
  useEffect(() => {
    if (!seen || report) return;
    let alive = true;
    (async () => {
      const { createMockCoachData } = await import("../../coach/data/mockCoachData.js");
      const data = createMockCoachData();
      const clients = await data.loadClients();
      const now = new Date();
      // Use the sample athlete with the fullest week, so the report has something to say.
      let best = null;
      for (const c of clients.slice(0, 5)) {
        const d = await data.loadClientData(c.athlete_id);
        const first = (c.name || "").split(" ")[0] || "Maya";
        const r = buildWeeklyReport(d, { start: defaultReportWeek(now), firstName: first, now });
        const score = (r.workouts?.done || 0) * 10 + (r.wins?.length || 0);
        if (!best || score > best.score) best = { r, first, score };
      }
      if (alive && best) setReport(best);
    })().catch(() => {});
    return () => { alive = false; };
  }, [seen, report]);

  const snapshot = useMemo(() => report && reportSnapshot(report.r, {
    sections, coachName: "Vardan", firstName: report.first,
    note: "Strong week. Bench moved for the first time in a month.", focus: "Keep Friday. It is the one that slips.",
  }), [report, sections]);

  return (
    <section className="tl-section tl-band nf-report" id="report" ref={ref}>
      <div className="tl-wrap nf-report-grid">
        <div className="nf-report-copy">
          <CoachBubble line="I do the maths. You add the note." clip="count" />
          <h2>Their week. <em>Already written.</em></h2>
          <p className="tl-lede">Pick what they see, add a line, send it to their link.</p>
          <div className="nf-chips" role="group" aria-label="Choose what the athlete sees">
            {REPORT_PARTS.map(([k, label]) => (
              <button key={k} aria-pressed={!!sections[k]} onClick={() => setSections(s => ({ ...s, [k]: !s[k] }))}>{label}</button>
            ))}
          </div>
          <button className="tl-btn tl-btn-ghost nf-share" aria-pressed={shared} onClick={() => setShared(s => !s)}>
            {shared ? "Shared. Seen 2 hours ago" : "Share this week →"}
          </button>
        </div>
        <div className="nf-phone">
          <span className={`nf-state${shared ? " on" : ""}`}>{shared ? "Shared" : "Draft"}</span>
          <div className="nf-phone-face">
            <div ref={fitRef} className="tl-screen nf-report-screen">
              <div className="tl-screen-in nf-report-in cx-app" style={{ transform: `scale(${scale})`, opacity: scale && snapshot ? 1 : 0 }}>
                {snapshot && <ReportView snapshot={snapshot} inSheet onBack={() => {}} backLabel="" />}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── 3. The exercise library ────────────────────────────────────────────────
const ALL_EQUIPMENT = EQUIPMENT.map(e => e.id);

export function Library() {
  const [ref, seen] = useSeen(0.15);
  const [library, setLibrary] = useState(null);
  const [group, setGroup] = useState("chest");

  useEffect(() => {
    if (!seen || library) return;
    let alive = true;
    loadLibrary().then(l => { if (alive) setLibrary(l); }).catch(() => {});
    return () => { alive = false; };
  }, [seen, library]);

  const found = useMemo(() => (library ? filterLibrary(library, { groups: [group], equipment: ALL_EQUIPMENT }) : []), [library, group]);
  const groups = MUSCLE_GROUPS.map(g => g.id);
  const toggle = id => { if (groups.includes(id)) setGroup(id); };

  return (
    <section className="tl-section nf-library" id="library" ref={ref}>
      <div className="tl-wrap">
        <div className="tl-sec-head">
          <CoachBubble line="Stuck for an exercise?" clip="point" />
          <h2>{library ? library.length : "870"} exercises. <em>Tap the body.</em></h2>
          <p className="tl-lede">Every exercise shows what it works and how to do it.</p>
        </div>
        <div className="nf-lib-grid">
          <div className="nf-body tl-screen nf-live cx-app">
            <BodyMap view="front" main={[group]} onToggle={toggle} width={132} />
            <BodyMap view="back" main={[group]} onToggle={toggle} width={132} />
          </div>
          <div className="nf-lib-side">
            <div className="nf-chips nf-muscles" role="group" aria-label="Choose a muscle">
              {MUSCLE_GROUPS.map(g => <button key={g.id} aria-pressed={group === g.id} onClick={() => setGroup(g.id)}>{g.label}</button>)}
            </div>
            <p className="nf-count" aria-live="polite"><b>{library ? found.length : "…"}</b> for {GROUP_LABEL[group]}</p>
            <ul className="nf-exlist">
              {found.slice(0, 5).map((e, i) => {
                const also = alsoWorks(e);
                return (
                  <li key={`${group}-${e.name}`} style={{ "--i": i }}>
                    <b>{e.name}</b>
                    <span>{also || GROUP_LABEL[group]}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
