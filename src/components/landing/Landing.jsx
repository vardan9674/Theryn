import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { WorkoutLinkPreview } from "../../link/LinkPage.jsx";
import "./landing.css";

// Public marketing page. Mobile-first: most visitors arrive on a phone from a
// link a coach shared. Every product screen here is the real UI — the athlete
// link renders <WorkoutLinkPreview> and the coach screens load
// product-preview.html — with sample data, so the page never drifts from the app.

const LINK_URL = "theryn.fit/f/k7Qm2xVd";
const ASK_COACH_MESSAGE = "Hey coach — can you set me up on Theryn? It's free, and you send my workouts as a link so I don't need another app. https://theryn.fit";

const BENEFITS = [
  { id: "cons", title: <>Better <u>consistency</u></>, text: "They always know today’s plan, so they show up.", to: "consistency" },
  { id: "prog", title: <>Visible <u>progress</u></>, text: "Every lift charted, so they see it working.", to: "consistency" },
  { id: "fast", title: <><u>4 min</u></>, text: "to send your first plan.", to: "how" },
  { id: "brain", title: <><u>0 lb</u> to remember</>, text: "Theryn remembers every weight they lift.", to: "problem" },
];

const COMPARE = [
  ["Athlete setup", "Tap a link", "Download an app, sign up, verify email"],
  ["Works on", "Any phone browser", "App store installs"],
  ["Your plans", "Export to Excel anytime", "Kept inside the app"],
  ["See who trained", "The second they tap Finish", "When they open the app"],
  ["Cost to start", "Free", "Usually a monthly fee"],
];

const FAQ = [
  ["Do my athletes need to download anything?", "No. The link opens in any phone browser with no account and no password. There’s an optional athlete app for people who want more, but they never need it."],
  ["How do I send the link?", "Copy it and send it however you already talk to them: WhatsApp, iMessage, SMS or email. Each athlete gets their own private link."],
  ["Can I bring my Excel plans?", "Build the week once in the plan builder, save it as a template and give it to any athlete. You can export any plan back to Excel whenever you want."],
  ["Do athletes have to log weights?", "No. They can just tick each set. If they want, they can add reps and weight, rate how it felt and leave you a note."],
  ["Can I track payments and measurements?", "Yes. Mark who has paid and see who is overdue. Ask for body measurements and they fill them in on the same link."],
  ["Is it really free?", "Yes, for coaches and athletes. Sign in with Google and start. No card needed."],
];

// 12 weeks × 4 planned sessions: patchy until the link, then near-perfect.
const WEEKS = [[1,0,0,0],[1,1,0,0],[0,0,0,0],[1,0,1,0],[1,1,1,0],[1,1,1,1],[1,1,0,1],[1,1,1,1],[1,1,1,1],[1,1,1,1],[1,1,1,1],[1,1,1,1]];
const BENCH = [95, 95, 100, 105, 105, 110, 115, 115, 120, 125, 130, 135];

const TABS = {
  dashboard: ["Athletes", <><b>Every athlete, one screen.</b> Last workout, streak, this week, payment, and what to do next.</>],
  plan: ["Plan builder", <><b>Build the week once.</b> Exercises, sets and notes, with a live preview of what your athlete sees.</>],
  templates: ["Templates", <><b>Save it as a template.</b> Give it to any number of athletes, update them all in one tap, or export to Excel.</>],
};

const DEMO = [
  ["Tap the link", <><b>Your coach texts you a link.</b> Tap it.</>],
  ["Tick a set", <><b>Today’s plan opens.</b> No app, no sign-in. Tick off your first exercise.</>],
  ["Tick the rest", <><b>Finished exercises fold away.</b> Keep going.</>],
  ["Finish workout", <><b>All three done.</b> Tell your coach how it felt, then send.</>],
  ["Flip to the coach’s view ↻", <><b>Sent to Coach Vardan.</b> Now see what your coach sees.</>],
  ["Start over", <><b>Your coach knows the same second.</b> No more “did you train?” texts.</>],
];

// ── hooks ──────────────────────────────────────────────────────────────────
function useMedia(query) {
  const [on, setOn] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const fn = () => setOn(m.matches);
    m.addEventListener("change", fn);
    return () => m.removeEventListener("change", fn);
  }, [query]);
  return on;
}
const useReducedMotion = () => useMedia("(prefers-reduced-motion: reduce)");

// Light by default; the toggle switches to dark and the pick is remembered on
// this device. index.html reads the same key to paint the first frame.
const THEME_KEY = "theryn_landing_theme";
const THEME_BG = { dark: "#080808", light: "#fbfcf8" };
function useTheme() {
  const [picked, setPicked] = useState(() => {
    try { return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : null; } catch { return null; }
  });
  const theme = picked || "light";
  const toggle = () => {
    const next = theme === "light" ? "dark" : "light";
    setPicked(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* private mode: still switches for this visit */ }
  };
  return [theme, toggle];
}

function ThemeToggle({ theme, onToggle }) {
  const toLight = theme === "dark";
  return (
    <button className="tl-theme" onClick={onToggle} aria-label={toLight ? "Switch to light mode" : "Switch to dark mode"} title={toLight ? "Light mode" : "Dark mode"}>
      {toLight
        ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
        : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" /></svg>}
    </button>
  );
}

/** Width of the element divided by `base`: the scale that fits a fixed-size screen into it. */
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

/** True once the element has come within `margin` of the viewport, and stays true. */
function useNear(margin = "400px") {
  const ref = useRef(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setNear(true); }, { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [margin, near]);
  return [ref, near];
}

// ── real product screens ───────────────────────────────────────────────────
/** The real athlete link at phone size (390×780), scaled to fit its box. */
function LinkScreen({ screen = "workout", ticks = 0, filled = 0, scroll = 0, innerRef }) {
  const [ref, scale] = useFit(390);
  const pageRef = useRef(null);
  useEffect(() => {
    const page = ref.current?.querySelector(".lk-page");
    pageRef.current = page;
    if (innerRef) innerRef.current = page;
    if (page && typeof scroll === "number") page.scrollTop = scroll;
  });
  return (
    <div ref={ref} className="tl-screen" inert="" aria-hidden="true">
      <div className="tl-screen-in" style={{ transform: `scale(${scale})`, opacity: scale ? 1 : 0 }}>
        <WorkoutLinkPreview screen={screen} ticks={ticks} filled={filled} />
      </div>
    </div>
  );
}

/** A real coach screen from product-preview.html, loaded once it is near the viewport. */
function CoachFrame({ screen, base = 390, height = 780, eager = false }) {
  const [fitRef, scale] = useFit(base);
  const [nearRef, near] = useNear("300px");
  const setRefs = useCallback(el => { fitRef.current = el; nearRef.current = el; }, [fitRef, nearRef]);
  const [loaded, setLoaded] = useState(false);
  // Eager frames still wait for the page itself to finish loading, so the
  // coach bundle never competes with first paint on a phone.
  const [pageReady, setPageReady] = useState(false);
  useEffect(() => {
    if (!eager) return;
    let t;
    const go = () => { t = setTimeout(() => setPageReady(true), 300); };
    if (document.readyState === "complete") go(); else window.addEventListener("load", go, { once: true });
    return () => { clearTimeout(t); window.removeEventListener("load", go); };
  }, [eager]);
  const show = eager ? pageReady : near;
  return (
    <div ref={setRefs} className="tl-frame" style={{ aspectRatio: `${base} / ${height}` }} inert="" aria-hidden="true">
      {show && scale > 0 && (
        <iframe
          title="Theryn coach screen with sample athletes"
          src={`/product-preview.html?screen=${screen}`}
          tabIndex={-1}
          onLoad={() => setLoaded(true)}
          style={{ width: base, height, transform: `scale(${scale})`, opacity: loaded ? 1 : 0 }}
        />
      )}
    </div>
  );
}

function Mark({ size = 28, style }) {
  return <span className="tl-mark" style={{ width: size, ...style }} aria-hidden="true" />;
}

/** The real logo as a solid object: 11 masked layers stacked in depth. */
function Logo3D({ className }) {
  return <div className={`tl-logo3d ${className || ""}`} aria-hidden="true">{Array.from({ length: 11 }, (_, i) => <i key={i} />)}</div>;
}

/** A phone with real thickness around any screen. */
function Phone({ className, style, children }) {
  return (
    <div className={`tl-phone ${className || ""}`} style={style}>
      {Array.from({ length: 6 }, (_, i) => <i key={i} />)}
      <div className="tl-phone-face"><div className="tl-phone-screen">{children}</div></div>
    </div>
  );
}

/** The one screen that isn't Theryn: the coach's text message with the link. */
function MessageScreen() {
  return (
    <div className="tl-msg">
      <div className="tl-msg-head"><span>V</span><b>Coach Vardan</b></div>
      <div className="tl-msg-body">
        <div className="tl-msg-time">Today 7:02 am</div>
        <div className="tl-bubble">Hey Maya, your plan for this week 💪</div>
        <div className="tl-linkcard" data-target="link"><div className="tl-linkcard-top"><Mark size={40} /></div><div className="tl-linkcard-txt"><b>Your workout is ready</b><small>{LINK_URL}</small></div></div>
      </div>
    </div>
  );
}

// ── sections ───────────────────────────────────────────────────────────────
function Hero({ onStart, onAskCoach, askState, heroCtaRef, desktop, reduce }) {
  const stageRef = useRef(null);
  const sceneRef = useRef(null);
  // Drag (touch) or hover (mouse) tilts the scene on top of its ambient sway.
  useEffect(() => {
    const stage = stageRef.current, scene = sceneRef.current;
    if (!stage || reduce) return;
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0, down = false, sx = 0, sy = 0, bx = 0, by = 0;
    const loop = () => {
      cx += (tx - cx) * .1; cy += (ty - cy) * .1;
      scene.style.setProperty("--ry", `${cx.toFixed(2)}deg`);
      scene.style.setProperty("--rx", `${cy.toFixed(2)}deg`);
      raf = Math.abs(tx - cx) > .02 || Math.abs(ty - cy) > .02 ? requestAnimationFrame(loop) : 0;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
    const onDown = e => { down = true; sx = e.clientX; sy = e.clientY; bx = tx; by = ty; };
    const onUp = () => { if (down) { down = false; tx = 0; ty = 0; kick(); } };
    const onMove = e => {
      if (e.pointerType === "mouse" && !down) {
        const r = stage.getBoundingClientRect();
        tx = ((e.clientX - r.left) / r.width - .5) * 22; ty = -((e.clientY - r.top) / r.height - .5) * 12;
      } else if (down) {
        tx = Math.max(-40, Math.min(40, bx + (e.clientX - sx) * .25)); ty = Math.max(-14, Math.min(14, by - (e.clientY - sy) * .1));
      } else return;
      kick();
    };
    const onLeave = e => { if (e.pointerType === "mouse") { tx = 0; ty = 0; kick(); } };
    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerleave", onLeave);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      cancelAnimationFrame(raf);
      stage.removeEventListener("pointerdown", onDown);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [reduce]);

  return (
    <section className="tl-hero" id="top">
      <div className="tl-wrap tl-hero-grid">
        <div className="tl-hero-copy">
          <span className="tl-chip"><b>FREE</b> No app for your athletes</span>
          <h1>Your athletes train from <em>one link.</em></h1>
          <div className="tl-cta-col" ref={heroCtaRef}>
            <button className="tl-btn tl-btn-primary" onClick={onStart}>Start free: send your first plan →</button>
            <a className="tl-btn tl-btn-ghost" href="#demo">See what your athlete sees</a>
          </div>
          <div className="tl-trust"><span>Free for coaches and athletes</span><span>Export plans to Excel anytime</span></div>
          <AthleteLine onAskCoach={onAskCoach} askState={askState} />
        </div>

        <div className="tl-stage" ref={stageRef} role="img" aria-label="The real Theryn coach dashboard and athlete workout link, with sample athletes">
          <div className="tl-scene" ref={sceneRef}><div className="tl-sway">
            <div className="tl-floor" />
            <div className="tl-slab">
              <div className="tl-slab-bar"><span>● ● ●</span><span>Your athletes</span><span>THERYN</span></div>
              {desktop ? <CoachFrame screen="dashboard" base={1280} height={720} eager /> : <CoachFrame screen="dashboard" base={390} height={640} eager />}
            </div>
            <div className="tl-beam" />
            <Phone className="tl-hero-phone"><LinkScreen screen="workout" /></Phone>
            <Logo3D className="tl-hero-logo" />
            <div className="tl-tag tl-tag-a"><span className="tl-dot">✓</span><span>Maya finished Push<small>9 of 9 sets · just now</small></span></div>
            <div className="tl-tag tl-tag-b"><Mark size={22} /><span>Maya’s workout link<small>{LINK_URL}</small></span></div>
          </div></div>
          <span className="tl-stage-hint">Real Theryn screens · sample data{reduce ? "" : " · drag to rotate"}</span>
        </div>
      </div>
    </section>
  );
}

function AthleteLine({ onAskCoach, askState }) {
  return (
    <p className="tl-athlete-line" aria-live="polite">
      {askState === "copied" ? "Message copied. Paste it to your coach."
        : askState === "failed" ? <>Couldn’t open sharing. Send your coach this: <span className="tl-ask-text">{ASK_COACH_MESSAGE}</span></>
        : <>Got a link from your coach? Just tap it, no sign-in. <button className="tl-textbtn" onClick={onAskCoach}>No link yet? Ask your coach →</button></>}
    </p>
  );
}

function Benefits({ onPick }) {
  return (
    <div className="tl-bene">
      <div className="tl-wrap tl-bene-grid">
        {BENEFITS.map(b => (
          <a key={b.id} href={`#${b.to}`} onClick={() => onPick(b.id)}><b>{b.title}</b><span>{b.text}</span></a>
        ))}
      </div>
    </div>
  );
}

function ProgressChart() {
  const X = i => 34 + i * 24.6, Y = v => 140 - (v - 90) / 60 * 120;
  const pts = BENCH.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const last = BENCH.length - 1;
  return (
    <svg className="tl-chart" viewBox="0 0 320 160" role="img" aria-label="Illustration: bench press rising from 95 to 135 pounds over twelve weeks, with a next goal of 145 pounds">
      {[100, 120, 140].map(v => <g key={v}><line className="grid" x1="34" x2="310" y1={Y(v)} y2={Y(v)} /><text x="28" y={Y(v) + 4} textAnchor="end">{v}</text></g>)}
      <line className="goal" x1="34" x2="310" y1={Y(145)} y2={Y(145)} />
      <text className="tg" x="38" y={Y(145) - 6}>NEXT GOAL 145 LB</text>
      <polygon className="area" points={`${X(0)},140 ${pts} ${X(last)},140`} />
      <polyline className="line" points={pts} />
      <circle className="halo" cx={X(last)} cy={Y(135)} r="9" /><circle className="dot" cx={X(last)} cy={Y(135)} r="4.5" />
      <text className="hi" x={X(last) - 14} y={Y(135) - 8} textAnchor="end">135 LB</text>
      <text x={X(0)} y={Y(95) - 10}>95 LB</text>
      <text x="34" y="156">WEEK 1</text><text x="310" y="156" textAnchor="end">WEEK 12</text>
    </svg>
  );
}

function Consistency({ view, setView }) {
  return (
    <section className="tl-cons" id="consistency">
      <div className="tl-wrap tl-cons-grid">
        <h2 className="tl-cons-title">They show up. <em>They see it working.</em></h2>
        <ul className="tl-cons-list">
          <li><i>✓</i>Today’s plan, one tap away</li>
          <li><i>✓</i>Slipping? You know on day 3</li>
          <li><i>✓</i>Every lift charted</li>
        </ul>
        <div className="tl-cons-vis">
          <div className="tl-cons-card">
            <div className="tl-seg" role="tablist" aria-label="Choose view">
              {[["cons", "Consistency"], ["prog", "Progress"]].map(([id, label]) => (
                <button key={id} role="tab" aria-selected={view === id} onClick={() => setView(id)}>{label}</button>
              ))}
            </div>
            <div className="tl-cons-top"><span><b>Maya J.</b><small>4 sessions planned each week</small></span><span className="tl-streak">▲ 27-day streak</span></div>
            {view === "cons" ? (
              <div className="tl-view">
                <div className="tl-weeks" role="img" aria-label="Illustration: twelve weeks of training. Patchy attendance for four weeks, then nearly every session done after the coach sends a Theryn link.">
                  {WEEKS.map((w, wi) => <div className="wk" key={wi}>{w.map((v, si) => <i key={si} className={v ? "hit" : wi < 4 ? "miss" : ""} />)}</div>)}
                  <div className="tl-linksent"><span>Link sent</span></div>
                </div>
                <div className="tl-axis"><span>Week 1</span><span>Week 12</span></div>
                <div className="tl-foot"><div><small>Before</small><b>5 / 16</b><span>sessions done</span></div><div className="after"><small>With the link</small><b>30 / 32</b><span>sessions done</span></div></div>
              </div>
            ) : (
              <div className="tl-view">
                <ProgressChart />
                <div className="tl-foot"><div><small>Bench · week 1</small><b>95 lb</b><span>3 × 8</span></div><div className="after"><small>Bench · week 12</small><b>135 lb</b><span>+40 lb · next goal 145</span></div></div>
              </div>
            )}
            <p className="tl-illus">Illustration with a sample athlete</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// Each note names the job it does, so the picture explains the problem on its own.
const SCRAPS = [
  { job: "The plan", app: "Excel", dot: "#21a366", text: "Maya · Wk 3 · Bench 3×8", meta: "plans_v7_FINAL.xlsx" },
  { job: "The questions", app: "WhatsApp", dot: "#25d366", text: "“did you finish yesterday?”", meta: "9:02 pm · unread" },
  { job: "Your notes", app: "Notes app", dot: "#e8b400", text: "Maya: felt heavy on bench", meta: "which week was this?" },
  { job: "The payments", app: "Reminders", dot: "#ff9500", text: "Chase Maya re: payment", meta: "overdue · 3 days" },
];

function Problem() {
  const [solved, setSolved] = useState(false);
  return (
    <section className="tl-section" id="problem">
      <div className="tl-wrap tl-problem-grid">
        <div className="tl-problem-copy">
          <h2>Your coaching lives in <em>four apps.</em></h2>
          <p className="tl-lede">None of them talk to each other. So you chase, copy and remember, for every athlete.</p>
        </div>
        <div className={`tl-chaos${solved ? " solved" : ""}`}>
          <div className="tl-chaos-scene">
            {SCRAPS.map((s, i) => (
              <div className={`tl-scrap s${i + 1}`} key={s.app}>
                <small><i style={{ background: s.dot }} />{s.job} · {s.app}</small>
                <b>{s.text}</b><span>{s.meta}</span>
              </div>
            ))}
            <div className="tl-oneplace"><CoachFrame screen="dashboard" base={390} height={560} /></div>
          </div>
        </div>
        <div className="tl-problem-cta">
          <button className="tl-btn tl-btn-ghost" aria-pressed={solved} onClick={() => setSolved(s => !s)}>{solved ? "← Show the four apps again" : "Put it all in one place →"}</button>
          {solved && <p className="tl-solved-note">One row per athlete: plan, last workout, notes and payment.</p>}
        </div>
      </div>
    </section>
  );
}

const FLOW = [
  { key: "text", title: "Get the text", text: "You send the link however you already talk.", body: <MessageScreen /> },
  { key: "plan", title: "See today’s plan", text: "Opens in the browser. No account, no password.", body: <LinkScreen screen="workout" /> },
  { key: "tick", title: "Tick it off", text: "Tap each set. Logging weights is optional.", body: <LinkScreen screen="workout" ticks={3} scroll={330} /> },
  { key: "sent", title: "Send to coach", text: "One tap. You see it the same second.", body: <LinkScreen screen="sent" /> },
  { key: "measure", title: "Check-ins too", text: "Measurements live on the same link.", body: <LinkScreen screen="measure" filled={3} scroll={200} /> },
];

function HowItWorks({ reduce }) {
  const flowRef = useRef(null);
  const [active, setActive] = useState(1);
  const [nearRef, near] = useNear("600px");
  // Coverflow: each phone turns and sinks by its distance from the centre.
  useEffect(() => {
    const flow = flowRef.current;
    if (!flow || !near) return;
    const items = [...flow.children];
    let raf = 0;
    const paint = () => {
      raf = 0;
      const fr = flow.getBoundingClientRect(), mid = fr.left + fr.width / 2;
      let best = 0, bd = Infinity;
      items.forEach((it, i) => {
        const r = it.getBoundingClientRect(), o = (r.left + r.width / 2 - mid) / r.width, a = Math.min(Math.abs(o), 2.2);
        it.style.setProperty("--ry", `${(Math.max(-2.2, Math.min(2.2, o)) * -24).toFixed(1)}deg`);
        it.style.setProperty("--tz", `${(-a * 70).toFixed(0)}px`);
        it.style.setProperty("--op", Math.max(.25, 1 - a * .7).toFixed(2));
        if (Math.abs(o) < bd) { bd = Math.abs(o); best = i; }
      });
      setActive(best);
    };
    const queue = () => { if (!raf) raf = requestAnimationFrame(paint); };
    if (flow.scrollWidth > flow.clientWidth + 4 && items[1]) flow.scrollLeft = items[1].offsetLeft - (flow.clientWidth - items[1].offsetWidth) / 2;
    paint();
    flow.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    return () => { cancelAnimationFrame(raf); flow.removeEventListener("scroll", queue); window.removeEventListener("resize", queue); };
  }, [near]);
  const go = i => flowRef.current?.children[i]?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", inline: "center", block: "nearest" });
  return (
    <section className="tl-section tl-band" id="how" ref={nearRef}>
      <div className="tl-wrap">
        <div className="tl-sec-head">
          <span className="tl-eyebrow">How it works for your athlete</span>
          <h2>Tap. Train. <em>Done.</em></h2>
        </div>
        <div className="tl-flow" ref={flowRef} tabIndex={0} aria-label="Athlete link screens. Scroll sideways.">
          {FLOW.map((f, i) => (
            <div className="tl-flow-item" key={f.key}>
              <Phone>{near ? f.body : null}</Phone>
              <div className="tl-flow-cap"><b><i>{i + 1}</i>{f.title}</b><span>{f.text}</span></div>
            </div>
          ))}
        </div>
        <div className="tl-flow-dots">
          {FLOW.map((f, i) => <button key={f.key} aria-label={`Show ${f.title}`} aria-current={active === i} onClick={() => go(i)} />)}
        </div>
      </div>
    </section>
  );
}

// Demo steps drive the live link UI: [screen, ticks, which element the tap ring points at]
const DEMO_SCREENS = [null, ["workout", 0], ["workout", 1], ["workout", 3], ["sent", 3], ["sent", 3]];
function Demo() {
  const [step, setStep] = useState(0);
  const [nearRef, near] = useNear("400px");
  const screenRef = useRef(null);
  const pageRef = useRef(null);
  const [ring, setRing] = useState(null);
  const flipped = step === 5;

  // Keep the next thing to tap in view, and point the ring at it.
  useEffect(() => {
    const box = screenRef.current;
    if (!box) return;
    const t = setTimeout(() => {
      const page = pageRef.current;
      let target = null;
      if (step === 0) target = box.querySelector("[data-target=link]");
      else if (page && (step === 1 || step === 2)) {
        // Finished exercises fold away, so the first set row left is the next one to tick.
        target = page.querySelector(".lk-srow-circle");
        // Keep the next set row clear of the fixed Finish bar (the first one sits
        // lower, so the plan header above it stays in view).
        if (target) {
          const pr = page.getBoundingClientRect(), tr = target.getBoundingClientRect(), s = pr.width / 390;
          page.scrollTop += (tr.top - pr.top) / s - (step === 1 ? 470 : 200);
        }
      } else if (page && step === 3) {
        page.scrollTop = page.scrollHeight;
        target = page.querySelector(".lk-send");
      }
      if (!target) return setRing(null);
      const br = box.getBoundingClientRect(), r = target.getBoundingClientRect();
      const x = step === 3 ? r.left + r.width / 2 : r.left + Math.min(r.width, r.height) / 2;
      setRing({ left: `${((x - br.left) / br.width) * 100}%`, top: `${((r.top + r.height / 2 - br.top) / br.height) * 100}%` });
    }, 350);
    return () => clearTimeout(t);
  }, [step, near]);

  const next = () => setStep(s => (s + 1) % 6);
  const [screen, ticks] = DEMO_SCREENS[step] || [];
  return (
    <section className="tl-section" id="demo" ref={nearRef}>
      <div className="tl-wrap">
        <div className="tl-sec-head">
          <span className="tl-eyebrow">Try it as an athlete. No sign-up.</span>
          <h2>Be Maya for ten seconds.</h2>
        </div>
        <div className="tl-demo-grid">
          <div className="tl-flip-stage">
            <div className={`tl-flip${flipped ? " is-flipped" : ""}`} onClick={next}>
              {Array.from({ length: 4 }, (_, i) => <i key={i} />)}
              <div className="tl-phone-face tl-front"><div className="tl-phone-screen" ref={screenRef}>
                {step === 0 || !near ? <MessageScreen /> : <LinkScreen screen={screen} ticks={ticks} scroll={null} innerRef={pageRef} />}
                {ring && step < 4 && <span className="tl-ring" style={ring} />}
              </div></div>
              <div className="tl-phone-face tl-back"><div className="tl-phone-screen">
                {step >= 3 && <CoachFrame screen="dashboard" base={390} height={780} eager />}
                <div className="tl-toast"><Mark size={30} /><span><b>Maya J. finished Push</b><small>9 of 9 sets · just now</small></span></div>
              </div></div>
            </div>
          </div>
          <div className="tl-demo-ctrl">
            <div className="tl-demo-steps" aria-hidden="true">{[0, 1, 2, 3, 4].map(i => <i key={i} className={i < step ? "on" : ""} />)}</div>
            <p className="tl-demo-cap" aria-live="polite">{DEMO[step][1]}</p>
            <button className="tl-btn tl-btn-primary" onClick={next}>{DEMO[step][0]}</button>
            {step > 0 && step < 5 && <button className="tl-textbtn" onClick={() => setStep(0)}>Start over</button>}
          </div>
        </div>
      </div>
    </section>
  );
}

function CoachSide({ desktop, reduce }) {
  const [tab, setTab] = useState("dashboard");
  const [seen, setSeen] = useState({ dashboard: true });
  const [nudge, setNudge] = useState(false);
  const pick = k => {
    setTab(k); setSeen(s => ({ ...s, [k]: true }));
    if (!reduce) { setNudge(true); setTimeout(() => setNudge(false), 450); }
  };
  const base = desktop ? [1280, 754] : [390, 754];
  return (
    <section className="tl-section tl-band" id="coach">
      <div className="tl-wrap">
        <div className="tl-sec-head">
          <span className="tl-eyebrow">Your side of the link</span>
          <h2>Build once. Send to everyone.</h2>
        </div>
        <div className="tl-tabs" role="tablist">
          {Object.entries(TABS).map(([k, [label]]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => pick(k)}>{label}</button>)}
        </div>
        <div className="tl-device-stage">
          <div className={`tl-device${nudge ? " nudge" : ""}`}>
            <div className="tl-device-bar"><span>● ● ●</span><span>{TABS[tab][0]}</span><span>THERYN</span></div>
            <div className="tl-device-view">
              {Object.keys(TABS).map(k => seen[k] && (
                <div key={`${k}-${base[0]}`} className="tl-device-layer" data-active={tab === k}><CoachFrame screen={k} base={base[0]} height={base[1]} /></div>
              ))}
            </div>
          </div>
        </div>
        <p className="tl-tab-cap">{TABS[tab][1]}</p>
        <p className="tl-real-tag">Actual Theryn coach screens · sample athletes</p>
      </div>
    </section>
  );
}

function Compare() {
  return (
    <section className="tl-section" id="compare">
      <div className="tl-wrap">
        <div className="tl-sec-head">
          <span className="tl-eyebrow">Why coaches switch</span>
          <h2>Your clients shouldn’t need an app to train.</h2>
        </div>
        <div className="tl-cmp">
          {COMPARE.map(([row, us, them]) => (
            <div className="tl-cmp-row" key={row}><h3>{row}</h3><div className="us"><small>Theryn</small>{us}</div><div className="them"><small>Typical apps</small>{them}</div></div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing({ onStart }) {
  return (
    <section className="tl-section" id="pricing">
      <div className="tl-wrap">
        <div className="tl-sec-head"><span className="tl-eyebrow">Pricing</span><h2>Free. So what’s the catch?</h2></div>
        <div className="tl-catch-grid">
          <div className="tl-price">
            <span className="tl-eyebrow">For coaches</span>
            <span className="tl-big">$0</span>
            <ul><li>Plans &amp; templates</li><li>Athlete links, no app needed</li><li>Live coach dashboard</li><li>Progress, streaks &amp; measurements</li><li>Payment tracking</li></ul>
            <button className="tl-btn" onClick={onStart}>Start free →</button>
          </div>
          <div className="tl-promise">
            <div><b>No card, no trial clock</b><span>Sign in with Google. Nothing to cancel.</span></div>
            <div><b>Athletes never pay or sign up</b><span>They just open your link.</span></div>
            <div><b>Your plans stay yours</b><span>Export to Excel anytime.</span></div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section className="tl-section tl-faq-section" id="faq">
      <div className="tl-wrap">
        <div className="tl-sec-head"><span className="tl-eyebrow">FAQ</span><h2>Before you ask.</h2></div>
        <div className="tl-faq">
          {FAQ.map(([q, a], i) => <details key={q} open={i === 0}><summary>{q}</summary><p>{a}</p></details>)}
        </div>
      </div>
    </section>
  );
}

function Final({ onStart, onAskCoach, askState, finalRef }) {
  return (
    <section className="tl-final" id="start" ref={finalRef}>
      <div className="tl-wrap">
        <div className="tl-final-logo"><Logo3D className="tl-final-mark" /></div>
        <h2>Send one link.<br /><em>Watch them train.</em></h2>
        <button className="tl-btn tl-btn-primary" onClick={onStart}>Create my free coach account →</button>
        <div className="tl-trust"><span>No credit card</span><span>Sign in with Google</span></div>
        <AthleteLine onAskCoach={onAskCoach} askState={askState} />
      </div>
    </section>
  );
}

// ── page ───────────────────────────────────────────────────────────────────
const FONTS_HREF = "https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@800;900&family=Figtree:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap";

export default function Landing({ onEnterApp }) {
  const desktop = useMedia("(min-width: 960px)");
  const reduce = useReducedMotion();
  const [theme, toggleTheme] = useTheme();
  const [consView, setConsView] = useState("cons");
  const [askState, setAskState] = useState("idle");
  const heroCtaRef = useRef(null);
  const finalRef = useRef(null);
  const [showSticky, setShowSticky] = useState(false);
  const onStart = () => onEnterApp("coach");

  // The app shell locks scrolling and zoom; the marketing page needs both.
  useEffect(() => {
    const html = document.documentElement, body = document.body, root = document.getElementById("root");
    body.setAttribute("data-landing", "true");
    html.style.overflow = "visible"; html.style.height = "auto";
    body.style.overflow = "visible"; body.style.height = "auto";
    if (root) { root.style.maxWidth = "none"; root.style.overflow = "visible"; root.style.height = "auto"; }
    const viewport = document.querySelector('meta[name="viewport"]');
    const lockedViewport = viewport?.getAttribute("content");
    viewport?.setAttribute("content", "width=device-width, initial-scale=1.0, viewport-fit=cover");
    let fonts = document.getElementById("tl-fonts");
    if (!fonts) {
      fonts = Object.assign(document.createElement("link"), { id: "tl-fonts", rel: "stylesheet", href: FONTS_HREF });
      document.head.appendChild(fonts);
    }
    return () => {
      body.removeAttribute("data-landing");
      html.classList.remove("tl-light-boot");
      html.style.overflow = ""; html.style.height = "";
      body.style.overflow = ""; body.style.height = ""; body.style.background = "";
      if (root) { root.style.maxWidth = ""; root.style.overflow = ""; root.style.height = ""; }
      if (lockedViewport) viewport.setAttribute("content", lockedViewport);
    };
  }, []);

  // Page behind the overscroll bounce and the phone status bar follow the theme.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    const before = meta?.getAttribute("content");
    document.body.style.background = THEME_BG[theme];
    meta?.setAttribute("content", THEME_BG[theme]);
    return () => { if (before) meta.setAttribute("content", before); };
  }, [theme]);

  // Phone thumb bar: only once the hero buttons are gone, and not over the closer.
  useEffect(() => {
    const seen = new Map();
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => seen.set(e.target, e.isIntersecting));
      setShowSticky(seen.get(heroCtaRef.current) === false && !seen.get(finalRef.current));
    });
    [heroCtaRef.current, finalRef.current].forEach(el => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  // Athletes never sign in from here: hand them a message for their coach via
  // the share sheet, then the clipboard, then as text to copy by hand.
  const askCoach = async () => {
    try {
      if (navigator.share) { await navigator.share({ text: ASK_COACH_MESSAGE }); return; }
      await navigator.clipboard.writeText(ASK_COACH_MESSAGE);
      setAskState("copied");
    } catch (err) {
      if (err?.name === "AbortError") return;
      setAskState("failed");
    }
  };

  return (
    <div className="tl" data-theme={theme}>
      <nav className="tl-nav" aria-label="Main">
        <div className="tl-wrap">
          <a className="tl-logo" href="#top" aria-label="Theryn"><Mark /><span className="tl-logo-word">THERYN</span></a>
          <div className="tl-nav-links"><a href="#how">How it works</a><a href="#demo">Try the demo</a><a href="#coach">For coaches</a><a href="#pricing">Pricing</a><a href="#faq">FAQ</a></div>
          <div className="tl-nav-cta"><ThemeToggle theme={theme} onToggle={toggleTheme} /><button className="tl-signin" onClick={onStart}>Sign in</button><button className="tl-btn tl-btn-primary" onClick={onStart}>Start free</button></div>
        </div>
      </nav>
      <main>
        <Hero onStart={onStart} onAskCoach={askCoach} askState={askState} heroCtaRef={heroCtaRef} desktop={desktop} reduce={reduce} />
        <Benefits onPick={id => { if (id === "cons" || id === "prog") setConsView(id); }} />
        <Consistency view={consView} setView={setConsView} />
        <Problem />
        <HowItWorks reduce={reduce} />
        <Demo />
        <CoachSide desktop={desktop} reduce={reduce} />
        <Compare />
        <Pricing onStart={onStart} />
        <Faq />
        <Final onStart={onStart} onAskCoach={askCoach} askState={askState} finalRef={finalRef} />
      </main>
      <footer className="tl-footer">
        <div className="tl-wrap">
          <a className="tl-logo" href="#top"><Mark size={22} />THERYN</a>
          <nav aria-label="Footer"><a href="#faq">FAQ</a><a href="#pricing">Pricing</a><button className="tl-textbtn" onClick={() => onEnterApp("athlete")}>Athlete app</button></nav>
          <span>© {new Date().getFullYear()} Theryn</span>
        </div>
      </footer>
      <div className={`tl-sticky${showSticky ? " show" : ""}`} aria-hidden={!showSticky}>
        <button className="tl-btn tl-btn-primary" tabIndex={showSticky ? 0 : -1} onClick={onStart}>Start free</button>
        <a className="tl-btn tl-btn-ghost" tabIndex={showSticky ? 0 : -1} href="#demo">Try demo</a>
      </div>
    </div>
  );
}
