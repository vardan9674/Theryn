import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useInView,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";

import { WorkoutLinkPreview } from "../link/LinkPage.jsx";
import "./landing-responsive.css";

// ── THEME ─────────────────────────────────────────────────────────────────────
const ThemeCtx = createContext({ theme: "dark", toggle: () => {} });

const DARK = {
  bg: "#080808", s1: "#101010", s2: "#181818", bd: "#1E1E1E",
  tx: "#F0F0F0", sb: "#585858", sb2: "#A8AEB7",
  accent: "#C8FF00", accentText: "#C8FF00",
  teal: "#4ECDC4", tealText: "#4ECDC4",
  warm: "#FFD166", red: "#FF5C5C",
  mt: "#282828", grid: "#303030", glow: "rgba(200,255,0,0.08)",
};
const LIGHT = {
  bg: "#FFFFFF", s1: "#F6F6F6", s2: "#EEEEEE", bd: "#E2E2E2",
  tx: "#0A0A0A", sb: "#888888", sb2: "#444444",
  accent: "#C8FF00", accentText: "#3D7200",
  teal: "#2AA09A", tealText: "#1A7A72",
  warm: "#C89800", red: "#CC2222",
  mt: "#D8D8D8", grid: "#E8E8E8", glow: "rgba(0,0,0,0.03)",
};

function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(
    () => localStorage.getItem("theryn_theme") || "dark"
  );
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  const toggle = () =>
    setTheme(t => {
      const n = t === "dark" ? "light" : "dark";
      localStorage.setItem("theryn_theme", n);
      return n;
    });
  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>;
}

const useTheme = () => useContext(ThemeCtx);
const useC = () => { const { theme } = useTheme(); return theme === "dark" ? DARK : LIGHT; };

// ── UTILITIES ─────────────────────────────────────────────────────────────────
function useIsMobile() {
  const [m, setM] = useState(() => typeof window !== "undefined" && window.innerWidth < 640);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const fn = e => setM(e.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return m;
}

function useIsDesktop() {
  const [d, setD] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1024);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const fn = e => setD(e.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return d;
}

function Reveal({ children, delay = 0, y = 20 }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={{ duration: 0.6, delay, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {children}
    </motion.div>
  );
}

function CountUp({ target, suffix = "" }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 50, damping: 18, restDelta: 0.5 });
  const [display, setDisplay] = useState(0);
  useEffect(() => { if (inView) mv.set(target); }, [inView, target, mv]);
  useEffect(() => spring.on("change", v => setDisplay(Math.round(v))), [spring]);
  return <span ref={ref}>{display}{suffix}</span>;
}

// ── PHONE SHELL ───────────────────────────────────────────────────────────────
function PhoneShell({ children, c, size = "md" }) {
  const w = size === "sm" ? 190 : size === "lg" ? 270 : 220;
  const h = size === "sm" ? 320 : size === "lg" ? 430 : 380;
  return (
    <div style={{
      width: w, height: h, background: c.s2, borderRadius: 36,
      border: `1.5px solid ${c.mt}`,
      boxShadow: `0 24px 56px rgba(0,0,0,0.55), 0 0 0 1px ${c.mt}`,
      overflow: "hidden", position: "relative", flexShrink: 0,
    }}>
      {/* iOS notch */}
      <div style={{
        position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
        width: 72, height: 20, background: c.s2,
        borderRadius: "0 0 14px 14px", zIndex: 10,
      }} />
      {/* Status bar */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "18px 20px 6px", fontSize: 9, fontWeight: 700,
        color: c.tx, opacity: 0.7,
      }}>
        <span>9:41</span>
        <span style={{ letterSpacing: "0.05em" }}>●●●</span>
      </div>
      <div style={{ paddingBottom: 20 }}>{children}</div>
    </div>
  );
}

// ── HERO ANIMATION FRAMES ─────────────────────────────────────────────────────
function HeroFrame({ frame, c }) {
  // Frame 0 — They train: live workout logging
  if (frame === 0) return (
    <div style={{ padding: "12px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: c.tx }}>Push Day</div>
          <div style={{ fontSize: 9, color: "#FF8C42", fontWeight: 600 }}>● Live session</div>
        </div>
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          style={{ fontSize: 18, fontWeight: 900, color: c.accentText }}
        >
          205 lbs
        </motion.div>
      </div>
      {[["Bench Press", 3, 3], ["Overhead Press", 3, 2], ["Dumbbell Fly", 3, 0]].map(([ex, total, done]) => (
        <div key={ex} style={{ background: c.s2, borderRadius: 10, padding: "9px 11px", marginBottom: 5 }}>
          <div style={{ fontSize: 11, color: c.tx, fontWeight: 600, marginBottom: 5 }}>{ex}</div>
          <div style={{ display: "flex", gap: 4 }}>
            {Array(total).fill(0).map((_, s) => (
              <div key={s} style={{
                width: 19, height: 19, borderRadius: 4,
                background: s < done ? c.accent : c.s1,
                border: `1px solid ${s < done ? c.accent : c.bd}`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {s < done && <span style={{ fontSize: 8, color: "#000", fontWeight: 800 }}>✓</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  // Frame 1 — You see: coach dashboard with status badges
  if (frame === 1) return (
    <div style={{ padding: "10px 12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 9, color: c.sb, letterSpacing: "0.1em", textTransform: "uppercase" }}>Your athletes</div>
        <div style={{ fontSize: 8, color: c.accentText, fontWeight: 700 }}>3 active</div>
      </div>
      <div style={{ background: "rgba(217,119,87,0.12)", border: "1px solid rgba(217,119,87,0.35)", borderRadius: 10, padding: "7px 10px", marginBottom: 8 }}>
        <div style={{ fontSize: 8, color: "#D97757", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>Needs attention</div>
        <div style={{ fontSize: 10, color: c.tx, fontWeight: 600 }}>Jordan M. — 6 days inactive</div>
      </div>
      {[
        { name: "Maya J.",   init: "M", vol: "42k", bw: "138", sess: "5/5", badge: "New PR",    bc: c.accent },
        { name: "Alex R.",   init: "A", vol: "31k", bw: "185", sess: "4/5", badge: "On track",  bc: c.teal },
        { name: "Jordan M.", init: "J", vol: "8k",  bw: "192", sess: "1/5", badge: "Falling",   bc: "#D97757" },
      ].map(({ name, init, vol, bw, sess, badge, bc }) => (
        <div key={name} style={{ background: c.s2, borderRadius: 10, padding: "8px 10px", marginBottom: 5, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 26, height: 26, borderRadius: "50%", background: c.s1, border: `1px solid ${c.bd}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: c.sb2, flexShrink: 0 }}>{init}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: c.tx }}>{name}</span>
              <span style={{ fontSize: 8, fontWeight: 700, color: bc === c.accent ? c.accentText : bc, background: `${bc}18`, border: `1px solid ${bc}40`, borderRadius: 100, padding: "2px 6px" }}>{badge}</span>
            </div>
            <div style={{ display: "flex", gap: 5 }}>
              {[vol + " vol", bw + " lbs", sess + " sess"].map(stat => (
                <span key={stat} style={{ fontSize: 8.5, color: c.sb }}>{stat}</span>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  // Frame 2 — You adjust: routine update with diff
  if (frame === 2) return (
    <div style={{ padding: "12px 16px" }}>
      <div style={{ fontSize: 9, color: c.sb, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
        Routine updated
      </div>
      <motion.div
        animate={{ boxShadow: [`0 0 0px ${c.accent}00`, `0 0 24px ${c.accent}45`, `0 0 0px ${c.accent}00`] }}
        transition={{ duration: 2.2, repeat: Infinity }}
        style={{ background: c.s2, borderRadius: 14, padding: "14px 16px", border: `1px solid ${c.accent}50`, marginBottom: 12 }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, color: c.tx, marginBottom: 8 }}>Bench Press</div>
        <div style={{ fontSize: 11, color: c.sb, textDecoration: "line-through", marginBottom: 4 }}>4 × 8 @ 185 lbs</div>
        <motion.div
          initial={{ x: -8, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.25 }}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <span style={{ fontSize: 11, color: c.accent, fontWeight: 800 }}>↑</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: c.accentText }}>5 × 5 @ 205 lbs</span>
        </motion.div>
      </motion.div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center", padding: "8px 12px", background: c.s2, borderRadius: 100, border: `1px solid ${c.bd}` }}>
        <motion.span
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.4, repeat: Infinity }}
          style={{ width: 6, height: 6, borderRadius: "50%", background: c.accent, display: "inline-block" }}
        />
        <span style={{ fontSize: 10, color: c.sb2, fontWeight: 600 }}>Pushed to Maya · live now</span>
      </div>
    </div>
  );

  // Frame 3 — They improve: PR celebration + progress
  return (
    <div style={{ padding: "12px 16px" }}>
      <motion.div
        animate={{ opacity: [1, 0.6, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
        style={{ fontSize: 10, color: c.accentText, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10, fontWeight: 800 }}
      >
        New PR
      </motion.div>
      <motion.div
        animate={{ boxShadow: [`0 0 0px ${c.accent}00`, `0 0 28px ${c.accent}50`, `0 0 0px ${c.accent}00`] }}
        transition={{ duration: 2.2, repeat: Infinity }}
        style={{ background: c.s2, borderRadius: 14, padding: "16px", textAlign: "center", border: `1px solid ${c.accent}50`, marginBottom: 12 }}
      >
        <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-0.03em", color: c.accentText, lineHeight: 1 }}>225 lbs</div>
        <div style={{ fontSize: 10, color: c.sb, marginTop: 4 }}>Bench Press · +20 lbs in 4 weeks</div>
      </motion.div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 4, height: 32, marginBottom: 8, padding: "0 4px" }}>
        {[35, 45, 50, 60, 75, 85, 100].map((h, i) => (
          <motion.div
            key={i}
            initial={{ scaleY: 0 }} animate={{ scaleY: 1 }}
            transition={{ delay: i * 0.06, duration: 0.4 }}
            style={{
              flex: 1, height: `${h}%`,
              background: i === 6 ? c.accent : `${c.accent}55`,
              borderRadius: 2, transformOrigin: "bottom",
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: c.s2, borderRadius: 10, padding: "8px 10px" }}>
        <div style={{ width: 24, height: 24, borderRadius: "50%", background: c.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#000" }}>M</div>
        <span style={{ fontSize: 11, color: c.tx, fontWeight: 600 }}>Maya J.</span>
        <span style={{ fontSize: 10, color: c.sb, marginLeft: "auto" }}>Up from 205</span>
      </div>
    </div>
  );
}

const LandingMotion = createContext(true);
function ScrollReveal({ children }) {
  const enabled = useContext(LandingMotion);
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, .25, .75, 1], [24, 0, 0, -24]);
  const opacity = useTransform(scrollYProgress, [0, .16, .84, 1], [.25, 1, 1, .25]);
  return <motion.div ref={ref} className="landing-reveal" style={{ y: enabled ? y : 0, opacity: enabled ? opacity : 1 }}>{children}</motion.div>;
}
function AthleteProduct({ step }) {
  const scroll = useRef(null);
  useEffect(() => {
    // Keep the active exercise visible without hijacking the page scroll.
    if (scroll.current) scroll.current.scrollTop = step === 1 ? 300 : 0;
  }, [step]);
  return <figure className="athlete-product">
    <div className="product-browser-bar">{["Your coach’s workout link", "Sets ticked · ready to send", "Sent to your coach"][step]}</div>
    <div className="product-window" ref={scroll} data-story-step={step}>
      <div inert="" aria-hidden="true"><WorkoutLinkPreview step={step} /></div>
    </div>
    <figcaption>Sample athlete · automatic product demonstration</figcaption>
  </figure>;
}
function CoachProduct({ screen = "dashboard", compact = false }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(compact ? 300 : 900);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const base = compact || width < 600 ? 375 : 1280;
  const height = compact ? 620 : 660;
  // The hero only ever shows the dashboard; the showcase keeps all three
  // screens mounted and crossfades, so switching never shows an empty frame.
  const screens = compact ? ["dashboard"] : ["plan", "templates", "dashboard"];
  return <div className={compact ? "coach-product compact" : "coach-product"}>
    <div className="coach-browser-bar"><span aria-hidden="true">● ● ●</span><small>{compact ? "Your athletes" : {plan:"Routine builder", templates:"Plan templates", dashboard:"Coach dashboard"}[screen]}</small><span>THERYN</span></div>
    <div ref={ref} className="coach-product-viewport" style={{height:height * width / base}} inert="" aria-hidden="true">
      {screens.map(s => <iframe key={s} title="Theryn coach product with sample data" tabIndex={-1} loading="lazy" src={`/product-preview.html?screen=${s}`} data-active={s === screen} style={{width:base, height, transform:`scale(${width / base})`, transformOrigin:"top left", border:0}} />)}
    </div>
  </div>;
}
function FittedHero() {
  return <div className="hero-product">
    <CoachProduct compact />
    <div className="hero-ticket"><span className="ticket-arrow" aria-hidden="true">↗</span><div><small>FROM YOUR COACH</small><strong>Your workout is ready.</strong><span>Open the link. You’re in. →</span></div></div>
    <small className="sample-label">Sample athletes</small>
  </div>;
}

// ── NAVBAR ────────────────────────────────────────────────────────────────────
function SunIcon({ color }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round">
      <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  );
}
function MoonIcon({ color }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}

function Navbar({ onGetStarted }) {
  const c = useC();
  const { theme, toggle } = useTheme();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const navBg = scrolled
    ? theme === "dark" ? "rgba(8,8,8,0.88)" : "rgba(255,255,255,0.88)"
    : "transparent";

  return (
    <motion.nav
      initial={{ y: -56, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 clamp(16px, 4vw, 40px)", height: 60,
        background: navBg,
        backdropFilter: scrolled ? "blur(20px) saturate(180%)" : "none",
        WebkitBackdropFilter: scrolled ? "blur(20px) saturate(180%)" : "none",
        borderBottom: `1px solid ${scrolled ? c.bd : "transparent"}`,
        transition: "background 0.3s, border-color 0.3s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <img src="/theryn-logo.svg" alt="" style={{ width: 28, height: 28, borderRadius: 7 }} />
        <span style={{ fontSize: 16, fontWeight: 900, color: c.tx, letterSpacing: "-0.05em" }}>Theryn</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={toggle}
          aria-label="Toggle theme"
          style={{
            width: 36, height: 36, borderRadius: 9, border: `1px solid ${c.bd}`,
            background: c.s1, cursor: "pointer", display: "flex",
            alignItems: "center", justifyContent: "center",
          }}
        >
          {theme === "dark" ? <SunIcon color={c.sb2} /> : <MoonIcon color={c.sb2} />}
        </button>
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={onGetStarted}
          style={{
            background: c.accent, border: "none", borderRadius: 9,
            color: "#000", fontWeight: 800, fontSize: 13,
            padding: "9px 18px", cursor: "pointer", letterSpacing: "0.01em",
          }}
        >
          Start Free
        </motion.button>
      </div>
    </motion.nav>
  );
}

// ── WORD REVEAL ───────────────────────────────────────────────────────────────
function WordReveal({ text }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const words = text.split(" ");
  return (
    <span ref={ref} style={{ display: "inline" }}>
      {words.map((word, i) => (
        <span key={i} style={{ display: "inline-block", overflow: "hidden", verticalAlign: "bottom" }}>
          <motion.span
            style={{ display: "inline-block", willChange: "transform" }}
            initial={{ y: "110%" }}
            animate={inView ? { y: "0%" } : { y: "110%" }}
            transition={{ duration: 0.55, delay: i * 0.07, ease: [0.25, 0.1, 0.25, 1] }}
          >
            {word}
          </motion.span>
          {i < words.length - 1 && " "}
        </span>
      ))}
    </span>
  );
}

const heroContainerVariants = {
  hidden: {},
  show: { transition: { delayChildren: 0.25, staggerChildren: 0.09 } },
};
const heroItemVariants = {
  hidden: { opacity: 0, y: 32, filter: "blur(4px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.65, ease: [0.25, 0.1, 0.25, 1] } },
};

// ── SECTION 1: HERO ───────────────────────────────────────────────────────────
const FRAME_LABELS = ["They train", "You see", "You adjust", "They improve"];

function HeroSection({ onEnterApp }) {
  const c = useC();
  const { theme } = useTheme();
  const isDesktop = useIsDesktop();
  const [frame, setFrame] = useState(0);

  // Scroll parallax for desktop phone
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const phoneParallaxY = useTransform(scrollYProgress, [0, 1], [0, -30]);

  useEffect(() => {
    const t = setInterval(() => setFrame(f => (f + 1) % 4), 1500);
    return () => clearInterval(t);
  }, []);

  const scrollToHow = () =>
    document.getElementById("how")?.scrollIntoView({ behavior: "smooth" });

  const phoneBlock = (
    <motion.div
      initial={{ opacity: 0, y: 44 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
      style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}
    >
      {/* Float wrapper */}
      <motion.div
        animate={{ y: [0, -12, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        style={{ display: "flex", flexDirection: "column", alignItems: "center", willChange: "transform" }}
      >
        <div style={{ position: "relative" }}>
          <div style={{
            position: "absolute", bottom: -30, left: "50%", transform: "translateX(-50%)",
            width: 160, height: 60,
            background: `radial-gradient(ellipse, ${c.accent}25 0%, transparent 70%)`,
            filter: "blur(20px)", pointerEvents: "none",
          }} />
          <PhoneShell c={c} size={isDesktop ? "lg" : "md"}>
            <AnimatePresence mode="wait">
              <motion.div
                key={frame}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.28 }}
              >
                <HeroFrame frame={frame} c={c} />
              </motion.div>
            </AnimatePresence>
          </PhoneShell>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 18 }}>
          {[0,1,2,3].map(i => (
            <motion.button
              key={i}
              onClick={() => setFrame(i)}
              animate={{ width: frame === i ? 22 : 7, background: frame === i ? c.accent : c.bd }}
              transition={{ duration: 0.3 }}
              style={{ height: 7, borderRadius: 3.5, border: "none", cursor: "pointer", padding: 0 }}
            />
          ))}
        </div>
        <div style={{ textAlign: "center", marginTop: 8, fontSize: 10, color: c.sb, height: 14 }}>
          {FRAME_LABELS[frame]}
        </div>
      </motion.div>
    </motion.div>
  );

  return (
    <section ref={heroRef} style={{
      minHeight: "100svh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "80px clamp(16px, 4vw, 64px) 60px",
      position: "relative", overflow: "hidden", background: c.bg,
    }}>
      {/* Radial glows — breathing */}
      <motion.div
        animate={{ opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute", inset: 0, pointerEvents: "none", willChange: "opacity",
          background: theme === "dark"
            ? `radial-gradient(ellipse 65% 50% at 50% 18%, rgba(200,255,0,0.09) 0%, transparent 68%), radial-gradient(ellipse 45% 40% at 82% 65%, rgba(78,205,196,0.05) 0%, transparent 60%)`
            : `radial-gradient(ellipse 65% 50% at 50% 18%, rgba(200,255,0,0.18) 0%, transparent 68%)`,
        }}
      />
      {/* Grid */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: `linear-gradient(${c.grid} 1px, transparent 1px), linear-gradient(90deg, ${c.grid} 1px, transparent 1px)`,
        backgroundSize: "52px 52px", opacity: 0.5,
      }} />

      {isDesktop ? (
        /* Desktop: side-by-side */
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: "clamp(48px, 7vw, 96px)", width: "100%", maxWidth: 1160,
          position: "relative", zIndex: 1,
        }}>
          {/* Text block */}
          <motion.div
            variants={heroContainerVariants}
            initial="hidden"
            animate="show"
            style={{ flex: "1 1 0", minWidth: 0, maxWidth: 560, willChange: "transform" }}
          >
            <motion.div variants={heroItemVariants} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: c.s1, borderRadius: 100, padding: "5px 14px", border: `1px solid ${c.bd}`, marginBottom: 24 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.accent, display: "inline-block" }} />
              <span style={{ fontSize: 11, color: c.tx, fontWeight: 600, letterSpacing: "0.03em" }}>Coaching platform for personal trainers</span>
            </motion.div>
            <motion.h1 variants={heroItemVariants} style={{
              fontSize: "clamp(44px, 5.5vw, 72px)", fontWeight: 900,
              letterSpacing: "-0.045em", lineHeight: 1.03, color: c.tx, margin: "0 0 4px", willChange: "transform",
            }}>
              <WordReveal text="Built for Coaches." />
            </motion.h1>
            <motion.h1 variants={heroItemVariants} className="text-gradient" style={{
              fontSize: "clamp(44px, 5.5vw, 72px)", fontWeight: 900,
              letterSpacing: "-0.045em", lineHeight: 1.03, margin: "0 0 24px",
              background: `linear-gradient(120deg, ${c.accent} 0%, ${c.teal} 50%, ${c.accent} 100%)`,
              backgroundSize: "200% auto", animation: "gradientShimmer 5s ease infinite", willChange: "transform",
            }}>
              Loved by Athletes.
            </motion.h1>
            <motion.p variants={heroItemVariants} style={{ fontSize: "clamp(15px, 1.5vw, 18px)", color: c.sb2, margin: "0 0 28px", lineHeight: 1.65, maxWidth: 420 }}>
              Your athlete <span style={{ color: c.accent, fontWeight: 700 }}>trains.</span> You <span style={{ background: `linear-gradient(90deg, ${c.accent}, ${c.teal})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontWeight: 700 }}>see it.</span> You <span style={{ color: c.teal, fontWeight: 700 }}>adjust.</span> They <span style={{ background: `linear-gradient(90deg, ${c.teal}, ${c.accent})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontWeight: 700 }}>improve.</span>
            </motion.p>
            <motion.p variants={heroItemVariants} style={{ fontSize: 13, fontWeight: 700, color: c.accent, margin: "0 0 28px", letterSpacing: "0.01em" }}>
              Close the loop. Watch them improve.
            </motion.p>
            <motion.div variants={heroItemVariants} style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <motion.button
                whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                onClick={() => onEnterApp("coach")}
                style={{
                  background: c.accent, border: "none", borderRadius: 11,
                  color: "#000", fontWeight: 800, fontSize: 15,
                  padding: "14px 30px", cursor: "pointer",
                  boxShadow: theme === "dark" ? `0 8px 32px ${c.accent}30` : `0 4px 16px ${c.accent}60`,
                }}
              >Start Free →</motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }}
                onClick={scrollToHow}
                style={{
                  background: "none", border: `1.5px solid ${c.bd}`, borderRadius: 11,
                  color: c.tx, fontWeight: 600, fontSize: 15,
                  padding: "14px 30px", cursor: "pointer",
                }}
              >See How It Works</motion.button>
            </motion.div>
          </motion.div>

          {/* Phone */}
          <motion.div
            initial={{ opacity: 0, x: 32 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
            style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", y: phoneParallaxY, willChange: "transform" }}
          >
            {phoneBlock}
          </motion.div>
        </div>
      ) : (
        /* Mobile: stacked */
        <>
          <motion.div
            variants={heroContainerVariants}
            initial="hidden"
            animate="show"
            style={{ textAlign: "center", position: "relative", zIndex: 1, maxWidth: 600 }}
          >
            <motion.div variants={heroItemVariants} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: c.s1, borderRadius: 100, padding: "5px 14px", border: `1px solid ${c.bd}`, marginBottom: 20 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.accent, display: "inline-block" }} />
              <span style={{ fontSize: 11, color: c.tx, fontWeight: 600, letterSpacing: "0.03em" }}>Coaching platform for personal trainers</span>
            </motion.div>
            <motion.h1 variants={heroItemVariants} style={{ fontSize: "clamp(42px, 8.5vw, 76px)", fontWeight: 900, letterSpacing: "-0.045em", lineHeight: 1.03, color: c.tx, margin: "0 0 4px", willChange: "transform" }}>
              <WordReveal text="Built for Coaches." />
            </motion.h1>
            <motion.h1 variants={heroItemVariants} className="text-gradient" style={{
              fontSize: "clamp(42px, 8.5vw, 76px)", fontWeight: 900,
              letterSpacing: "-0.045em", lineHeight: 1.03, margin: "0 0 20px",
              background: `linear-gradient(120deg, ${c.accent} 0%, ${c.teal} 50%, ${c.accent} 100%)`,
              backgroundSize: "200% auto", animation: "gradientShimmer 5s ease infinite", willChange: "transform",
            }}>
              Loved by Athletes.
            </motion.h1>
            <motion.p variants={heroItemVariants} style={{ fontSize: "clamp(15px, 2.5vw, 18px)", color: c.sb2, margin: "0 auto 0", lineHeight: 1.6, maxWidth: 380 }}>
              Your athlete <span style={{ color: c.accent, fontWeight: 700 }}>trains.</span> You <span style={{ background: `linear-gradient(90deg, ${c.accent}, ${c.teal})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontWeight: 700 }}>see it.</span> You <span style={{ color: c.teal, fontWeight: 700 }}>adjust.</span> They <span style={{ background: `linear-gradient(90deg, ${c.teal}, ${c.accent})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontWeight: 700 }}>improve.</span>
            </motion.p>
          </motion.div>
          <div style={{ marginTop: 40, position: "relative", zIndex: 1 }}>{phoneBlock}</div>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            style={{ textAlign: "center", marginTop: 20, position: "relative", zIndex: 1 }}
          >
            <p style={{ fontSize: 13, fontWeight: 700, color: c.accent, margin: "0 0 24px", letterSpacing: "0.01em" }}>
              Close the loop. Watch them improve.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={() => onEnterApp("coach")}
                style={{ background: c.accent, border: "none", borderRadius: 11, color: "#000", fontWeight: 800, fontSize: 15, padding: "14px 30px", cursor: "pointer", boxShadow: theme === "dark" ? `0 8px 32px ${c.accent}30` : `0 4px 16px ${c.accent}60` }}>
                Start Free →
              </motion.button>
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }} onClick={scrollToHow}
                style={{ background: "none", border: `1.5px solid ${c.bd}`, borderRadius: 11, color: c.tx, fontWeight: 600, fontSize: 15, padding: "14px 30px", cursor: "pointer" }}>
                See How It Works
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </section>
  );
}

// ── SECTION 2: SPLIT ──────────────────────────────────────────────────────────
function SplitSection({ onEnterApp }) {
  const c = useC();
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  const cards = [
    {
      role: "coach", title: "COACH", cta: "Start coaching →",
      headline: "20 athletes.\nOne screen.",
      stat: "Closes the loop for every athlete.",
      accent: c.accent, accentText: c.accentText,
      items: [
        "Build routines, push instantly",
        "Live data on every athlete",
        "Catch slippage in real-time",
        "Adjust plans on the fly",
      ],
    },
    {
      role: "athlete", title: "ATHLETE", cta: "Join as athlete →",
      headline: "Tap.\nLog.\nDone.",
      stat: "Today's plan, ready when you are.",
      accent: c.teal, accentText: c.tealText,
      items: [
        "Coach-assigned plans daily",
        "Tap-to-log every set",
        "PRs flagged automatically",
        "Watch your strength climb",
      ],
    },
  ];

  return (
    <section style={{ padding: "90px clamp(16px, 4vw, 48px)", background: c.bg }}>
      <Reveal>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ fontSize: 10, color: c.sb, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 10 }}>
            Built for both sides
          </div>
          <h2 style={{ fontSize: "clamp(30px, 5.5vw, 48px)", fontWeight: 900, letterSpacing: "-0.045em", color: c.tx }}>
            <WordReveal text="Pick your side." />
          </h2>
        </div>
      </Reveal>

      <div ref={ref} style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
        gap: 20, maxWidth: 960, margin: "0 auto",
      }}>
        {cards.map((card, i) => (
          <motion.div
            key={card.role}
            initial={{ opacity: 0, x: i === 0 ? -36 : 36 }}
            animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: i === 0 ? -36 : 36 }}
            transition={{ duration: 0.55, delay: i * 0.1, ease: [0.25, 0.1, 0.25, 1] }}
            whileHover={{ y: -5, transition: { duration: 0.2 } }}
            onClick={() => onEnterApp(card.role)}
            style={{
              background: c.s1, border: `1.5px solid ${c.bd}`,
              borderRadius: 22, padding: "28px 24px",
              cursor: "pointer",
              transition: "border-color 0.25s, background 0.25s",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = card.accent;
              e.currentTarget.style.background = `${card.accent}08`;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = c.bd;
              e.currentTarget.style.background = c.s1;
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.16em", color: card.accentText, marginBottom: 14 }}>
              {card.title}
            </div>
            <div style={{
              fontSize: "clamp(28px, 4.5vw, 38px)", fontWeight: 900,
              letterSpacing: "-0.045em", color: c.tx, lineHeight: 1.08,
              whiteSpace: "pre-line", marginBottom: 14,
            }}>
              {card.headline}
            </div>
            <div style={{ fontSize: 12, color: card.accentText, fontWeight: 700, marginBottom: 20 }}>
              {card.stat}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 24 }}>
              {card.items.map(item => (
                <div key={item} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: card.accent, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: c.sb2 }}>{item}</span>
                </div>
              ))}
            </div>
            <div style={{
              background: card.accent, borderRadius: 11, padding: "13px 16px",
              textAlign: "center", fontWeight: 800, fontSize: 14, color: "#000",
            }}>
              {card.cta}
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

// ── REPLACE BADGE ─────────────────────────────────────────────────────────────
function ReplaceBadge({ app, clr, lightClr, index, darkBg }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const col = darkBg ? clr : lightClr;

  const style = darkBg ? {
    background: `${col}14`,
    border: `1.5px solid ${col}60`,
    color: col,
    boxShadow: `0 4px 16px ${col}20`,
  } : {
    background: `${col}12`,
    border: `1.5px solid ${col}70`,
    color: lightClr,
    boxShadow: `0 4px 14px ${col}18`,
  };

  const lineColor = col;
  const lineHeight = 2;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.5, y: 24 }}
      animate={inView ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.5, y: 24 }}
      transition={{
        duration: 0.5, delay: index * 0.08,
        type: "spring", stiffness: 260, damping: 16,
      }}
      whileHover={{
        scale: 1.12, y: -3,
        transition: { type: "spring", stiffness: 400, damping: 14 },
      }}
      style={{
        position: "relative", display: "inline-block",
        borderRadius: 100, padding: "9px 20px",
        fontSize: 14, fontWeight: 700,
        cursor: "default", letterSpacing: "-0.01em",
        ...style,
      }}
    >
      {/* Continuous bob */}
      <motion.span
        animate={{ y: [0, -2.5, 0] }}
        transition={{
          duration: 2.8 + (index % 3) * 0.3,
          repeat: Infinity, ease: "easeInOut", delay: index * 0.15,
        }}
        style={{ display: "inline-block", position: "relative", zIndex: 1 }}
      >
        {app}
      </motion.span>
      {/* Animated strikethrough */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={inView ? { scaleX: 1 } : { scaleX: 0 }}
        transition={{ duration: 0.45, delay: 0.35 + index * 0.08, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: "absolute", left: 12, right: 12, top: "50%",
          height: lineHeight, background: lineColor, borderRadius: 2,
          transformOrigin: "left center", marginTop: -lineHeight / 2,
          boxShadow: darkBg ? `0 0 6px ${col}80` : "none",
        }}
      />
    </motion.div>
  );
}

// ── SECTION 3: EMOTIONAL HIT ──────────────────────────────────────────────────
function EmotionalHitSection() {
  const c = useC();
  const { theme } = useTheme();
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section style={{
      padding: "100px clamp(16px, 4vw, 48px)",
      background: c.s1,
      borderTop: `1px solid ${c.bd}`,
      borderBottom: `1px solid ${c.bd}`,
      position: "relative", overflow: "hidden",
    }}>
      {theme === "dark" && (
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: `radial-gradient(ellipse 80% 60% at 50% 50%, rgba(200,255,0,0.04) 0%, transparent 70%)`,
        }} />
      )}

      <Reveal>
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <h2 style={{
            fontSize: "clamp(38px, 7.5vw, 68px)", fontWeight: 900,
            letterSpacing: "-0.045em", color: c.tx, lineHeight: 1.04, margin: "0 0 16px",
          }}>
            <WordReveal text="More results." /><br />
            <span className="text-gradient" style={{
              background: `linear-gradient(120deg, ${c.accent} 0%, ${c.teal} 100%)`,
            }}>
              Less chaos.
            </span>
          </h2>
          <p style={{ fontSize: "clamp(14px, 2vw, 16px)", color: c.sb, maxWidth: 340, margin: "0 auto" }}>
            Built for coaches who coach—not manage tools.
          </p>
        </div>
      </Reveal>

      <div ref={ref} style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: 16, maxWidth: 960, margin: "0 auto",
      }}>
        {[
          {
            label: "ROSTER",
            icon: (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            ),
            headline: "Your full roster.",
            sub: "One glance.",
            accent: c.accent,
          },
          {
            label: "ALERTS",
            icon: (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
            ),
            headline: "Know who's slipping",
            sub: "before they quit.",
            accent: c.teal,
          },
          {
            label: "LIVE UPDATES",
            icon: (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="13 2 13 9 20 9"/>
                <path d="M21 3L13 11"/>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7"/>
              </svg>
            ),
            headline: "Update their plan.",
            sub: "They see it live.",
            accent: c.warm,
          },
        ].map((item, i) => (
          <motion.div
            key={item.headline}
            initial={{ opacity: 0, y: 28 }}
            animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 28 }}
            transition={{ duration: 0.5, delay: i * 0.12 }}
            whileHover={{ y: -4, transition: { duration: 0.2 } }}
            style={{
              background: c.s1,
              border: `1.5px solid ${c.bd}`,
              borderRadius: 22,
              padding: "28px 26px 26px",
              cursor: "default",
              transition: "border-color 0.25s",
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = item.accent}
            onMouseLeave={e => e.currentTarget.style.borderColor = c.bd}
          >
            <div style={{
              width: 52, height: 52, borderRadius: 16,
              background: `${item.accent}20`,
              display: "flex", alignItems: "center", justifyContent: "center",
              marginBottom: 20, color: item.accent,
              flexShrink: 0,
            }}>
              {item.icon}
            </div>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", color: item.accent, marginBottom: 10 }}>
              {item.label}
            </div>
            <div style={{ fontSize: "clamp(20px, 2.5vw, 24px)", fontWeight: 900, color: c.tx, letterSpacing: "-0.03em", lineHeight: 1.15 }}>
              {item.headline}
            </div>
            <div style={{ fontSize: "clamp(20px, 2.5vw, 24px)", fontWeight: 900, color: c.sb, letterSpacing: "-0.03em", lineHeight: 1.15 }}>
              {item.sub}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Replaces row */}
      <div style={{ marginTop: 64, textAlign: "center" }}>
        <Reveal>
          <div style={{ fontSize: 11, color: c.sb, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 22, fontWeight: 700 }}>
            Replaces
          </div>
        </Reveal>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12 }}>
          {[
            ["Excel",          "#FF5C5C", "#C53030"],
            ["WhatsApp",       "#06D6A0", "#047857"],
            ["Notes.app",      "#E5A82E", "#92630C"],
            ["Notion",         "#C77DFF", "#7C3AED"],
            ["TrainingPeaks",  "#FF8C42", "#C2410C"],
            ["Google Sheets",  "#4ECDC4", "#0F766E"],
          ].map(([app, clr, lightClr], i) => (
            <ReplaceBadge key={app} app={app} clr={clr} lightClr={lightClr} index={i} darkBg={theme === "dark"} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ── SECTION 4: THE LOOP ───────────────────────────────────────────────────────
const LOOP_PANELS = [
  {
    label: "Your athlete trains.",
    caption: "Live logging. Every set, weight, rep. PRs auto-flagged.",
    frame: (c) => (
      <div style={{ padding: "12px 16px" }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: c.tx, marginBottom: 10 }}>Push Day</div>
        {[["Bench Press", 3], ["Overhead Press", 2]].map(([ex, done]) => (
          <div key={ex} style={{ background: c.s2, borderRadius: 10, padding: "9px 11px", marginBottom: 6 }}>
            <div style={{ fontSize: 11, color: c.tx, fontWeight: 600, marginBottom: 5 }}>{ex}</div>
            <div style={{ display: "flex", gap: 4 }}>
              {[1,2,3].map(s => (
                <div key={s} style={{ width: 19, height: 19, borderRadius: 4, background: s <= done ? c.accent : c.s1, border: `1px solid ${s <= done ? c.accent : c.bd}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {s <= done && <span style={{ fontSize: 8, color: "#000", fontWeight: 800 }}>✓</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    label: "You see it.",
    caption: "Volume, streaks, attendance. Real-time. Zero DMs to chase.",
    frame: (c) => (
      <div style={{ padding: "10px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 9, color: c.sb, letterSpacing: "0.1em", textTransform: "uppercase" }}>Your athletes</div>
          <div style={{ fontSize: 8, color: c.accentText, fontWeight: 700 }}>3 active</div>
        </div>
        <div style={{ background: "rgba(217,119,87,0.12)", border: "1px solid rgba(217,119,87,0.35)", borderRadius: 10, padding: "7px 10px", marginBottom: 8 }}>
          <div style={{ fontSize: 8, color: "#D97757", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>Needs attention</div>
          <div style={{ fontSize: 10, color: c.tx, fontWeight: 600 }}>Jordan M. — 6 days inactive</div>
        </div>
        {[
          { name: "Maya J.",   init: "M", vol: "42k", bw: "↓138", sess: "5/5", badge: "New PR",    bc: c.accent },
          { name: "Alex R.",   init: "A", vol: "31k", bw: "→185", sess: "4/5", badge: "On track",  bc: c.teal },
          { name: "Jordan M.", init: "J", vol: "8k",  bw: "↑192", sess: "1/5", badge: "Falling",   bc: "#D97757" },
        ].map(({ name, init, vol, bw, sess, badge, bc }) => (
          <div key={name} style={{ background: c.s2, borderRadius: 10, padding: "8px 10px", marginBottom: 5, display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: c.s1, border: `1px solid ${c.bd}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: c.sb2, flexShrink: 0 }}>{init}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: c.tx }}>{name}</span>
                <span style={{ fontSize: 8, fontWeight: 700, color: bc === c.accent ? c.accentText : bc, background: `${bc}18`, border: `1px solid ${bc}40`, borderRadius: 100, padding: "2px 6px" }}>{badge}</span>
              </div>
              <div style={{ display: "flex", gap: 5 }}>
                {[vol + " vol", bw + " lbs", sess + " sess"].map(stat => (
                  <span key={stat} style={{ fontSize: 8.5, color: c.sb }}>{stat}</span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    label: "You adjust.",
    caption: "Push a new plan. They see it next session.",
    frame: (c) => (
      <div style={{ padding: "12px 16px" }}>
        <div style={{ fontSize: 9, color: c.sb, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Routine updated</div>
        <motion.div
          animate={{ boxShadow: [`0 0 0px ${c.accent}00`, `0 0 22px ${c.accent}40`, `0 0 0px ${c.accent}00`] }}
          transition={{ duration: 2.4, repeat: Infinity }}
          style={{ background: c.s2, borderRadius: 12, padding: "12px 14px", border: `1px solid ${c.accent}50`, marginBottom: 10 }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: c.tx, marginBottom: 8 }}>Bench Press</div>
          <div style={{ fontSize: 10, color: c.sb, textDecoration: "line-through", marginBottom: 4 }}>4 × 8 @ 185 lbs</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, color: c.accent }}>↑</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: c.accentText }}>5 × 5 @ 205 lbs</span>
          </div>
        </motion.div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center", padding: "6px 10px", background: c.s2, borderRadius: 100, border: `1px solid ${c.bd}` }}>
          <motion.span
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.4, repeat: Infinity }}
            style={{ width: 6, height: 6, borderRadius: "50%", background: c.accent, display: "inline-block" }}
          />
          <span style={{ fontSize: 9, color: c.sb2, fontWeight: 600 }}>Pushed to Maya · live now</span>
        </div>
      </div>
    ),
  },
  {
    label: "They improve.",
    caption: "PRs land. Volume climbs. The loop closes — and starts again.",
    frame: (c) => (
      <div style={{ padding: "12px 16px" }}>
        <div style={{ fontSize: 9, color: c.accentText, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10, fontWeight: 800 }}>New PR</div>
        <div style={{ background: c.s2, borderRadius: 12, padding: "14px", textAlign: "center", border: `1px solid ${c.accent}50`, marginBottom: 10 }}>
          <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: "-0.03em", color: c.accentText, lineHeight: 1 }}>225 lbs</div>
          <div style={{ fontSize: 9, color: c.sb, marginTop: 4 }}>Bench Press · +20 lbs in 4 weeks</div>
        </div>
        {/* Mini sparkline */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 3, height: 28, marginBottom: 8, padding: "0 4px" }}>
          {[35, 45, 50, 60, 75, 85, 100].map((h, i) => (
            <div key={i} style={{
              flex: 1, height: `${h}%`,
              background: i === 6 ? c.accent : `${c.accent}55`,
              borderRadius: 2,
            }} />
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: c.s2, borderRadius: 10, padding: "7px 10px" }}>
          <div style={{ width: 22, height: 22, borderRadius: "50%", background: c.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#000" }}>M</div>
          <span style={{ fontSize: 10, color: c.tx, fontWeight: 600 }}>Maya J.</span>
          <span style={{ fontSize: 9, color: c.sb, marginLeft: "auto" }}>Up from 205</span>
        </div>
      </div>
    ),
  },
];

function HowItWorksSection() {
  const c = useC();
  const { theme } = useTheme();

  return (
    <section id="how" style={{
      padding: "100px clamp(16px, 4vw, 64px)",
      background: c.bg,
      position: "relative", overflow: "hidden",
    }}>
      {theme === "dark" && (
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: `radial-gradient(ellipse 70% 50% at 50% 30%, rgba(200,255,0,0.04) 0%, transparent 70%)`,
        }} />
      )}

      <Reveal>
        <div style={{ textAlign: "center", marginBottom: 56, position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: 10, color: c.sb, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 14, fontWeight: 700 }}>
            The loop
          </div>
          <h2 style={{
            fontSize: "clamp(34px, 5.5vw, 56px)", fontWeight: 900,
            letterSpacing: "-0.045em", color: c.tx, lineHeight: 1.05, margin: 0,
          }}>
            <div><WordReveal text="Your athlete trains." /></div>
            <div><WordReveal text="You see it." /></div>
            <div><WordReveal text="You adjust." /></div>
            <span className="text-gradient" style={{
              background: `linear-gradient(120deg, ${c.accent} 0%, ${c.teal} 100%)`,
            }}>
              They improve.
            </span>
          </h2>
          <p style={{ fontSize: "clamp(14px, 2vw, 16px)", color: c.sb, maxWidth: 420, margin: "20px auto 0" }}>
            Most people train blind. Theryn closes the loop.
          </p>
        </div>
      </Reveal>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 18, maxWidth: 1200, margin: "0 auto",
        position: "relative", zIndex: 1,
      }}>
        {LOOP_PANELS.map((panel, i) => (
          <Reveal key={panel.label} delay={i * 0.12}>
            <motion.div
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              style={{
                background: c.s1, border: `1.5px solid ${c.bd}`,
                borderRadius: 22, padding: "24px 20px 22px",
                display: "flex", flexDirection: "column", alignItems: "center",
                height: "100%",
                transition: "border-color 0.25s",
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = `${c.accent}80`}
              onMouseLeave={e => e.currentTarget.style.borderColor = c.bd}
            >
              {/* Step number badge */}
              <div style={{
                fontSize: 9, fontWeight: 800, letterSpacing: "0.18em",
                color: c.sb, marginBottom: 14,
              }}>
                {String(i + 1).padStart(2, "0")}
              </div>
              {/* Phone mockup */}
              <PhoneShell c={c} size="sm">
                {panel.frame(c)}
              </PhoneShell>
              {/* Label */}
              <div style={{
                fontSize: "clamp(15px, 1.6vw, 17px)", fontWeight: 900,
                color: c.tx, letterSpacing: "-0.02em",
                marginTop: 18, textAlign: "center",
              }}>
                {panel.label}
              </div>
              {/* Caption */}
              <div style={{
                fontSize: 11.5, color: c.sb, lineHeight: 1.5,
                marginTop: 6, textAlign: "center", maxWidth: 200,
              }}>
                {panel.caption}
              </div>
            </motion.div>
          </Reveal>
        ))}
      </div>

      {/* Section payoff */}
      <Reveal delay={0.5}>
        <div style={{ textAlign: "center", marginTop: 48, position: "relative", zIndex: 1 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 10,
            fontSize: 13, fontWeight: 700, color: c.accent, letterSpacing: "0.01em",
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            <span>The loop closes. They keep improving.</span>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

// ── SECTION 5: PRICING ────────────────────────────────────────────────────────
const PLANS = [
  {
    id: "free", label: "Free", cta: "Try it", price: "$0", per: "forever",
    highlight: false, accent: null,
    features: ["Up to 2 athletes", "Workout logging", "Routine builder", "Progress charts", "Personal records", "Payment tracking"],
  },
  {
    id: "pro", label: "Pro", cta: "Grow", price: "$19", per: "/ month",
    highlight: true, badge: "Most popular", accent: "#C8FF00",
    features: ["Up to 10 athletes", "Needs-attention alerts", "Advanced analytics", "Priority support", "Payment tracking"],
  },
  {
    id: "elite", label: "Elite", cta: "Scale", price: "$49", per: "/ month",
    highlight: false, accent: "#4ECDC4",
    features: ["Unlimited athletes", "Everything in Pro", "Team collaboration", "API access", "White-label option", "Payment tracking"],
  },
];

function PricingSection({ onEnterApp }) {
  const c = useC();
  const [expanded, setExpanded] = useState("pro");
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section style={{ padding: "100px clamp(16px, 4vw, 48px)", background: c.s1, borderTop: `1px solid ${c.bd}` }}>
      <Reveal>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ fontSize: 10, color: c.sb, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 10 }}>Pricing</div>
          <h2 style={{ fontSize: "clamp(30px, 5.5vw, 48px)", fontWeight: 900, letterSpacing: "-0.045em", color: c.tx }}>
            Simple. Honest. Fair.
          </h2>
        </div>
      </Reveal>

      <div ref={ref} style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        gap: 16, maxWidth: 1040, margin: "0 auto",
      }}>
        {PLANS.map((plan, i) => {
          const isOpen = expanded === plan.id;
          const planAccent = plan.accent || c.sb;
          return (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 28 }}
              animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 28 }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              style={{
                background: plan.highlight ? `${c.accent}09` : c.bg,
                border: `1.5px solid ${plan.highlight ? c.accent : c.bd}`,
                borderRadius: 20, padding: "24px", position: "relative", overflow: "hidden",
              }}
            >
              {plan.badge && (
                <div style={{
                  position: "absolute", top: 16, right: 16,
                  background: c.accent, color: "#000",
                  fontSize: 9, fontWeight: 900, letterSpacing: "0.05em",
                  padding: "3px 9px", borderRadius: 100,
                }}>
                  {plan.badge}
                </div>
              )}

              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", color: c.sb, textTransform: "uppercase", marginBottom: 10 }}>
                {plan.label}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginBottom: 18 }}>
                <span style={{ fontSize: 40, fontWeight: 900, letterSpacing: "-0.04em", color: c.tx }}>{plan.price}</span>
                <span style={{ fontSize: 13, color: c.sb }}>{plan.per}</span>
              </div>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.28, ease: "easeInOut" }}
                    style={{ overflow: "hidden" }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 18 }}>
                      {plan.features.map(f => (
                        <div key={f} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                          <div style={{
                            width: 15, height: 15, borderRadius: "50%", flexShrink: 0,
                            background: planAccent === c.sb ? c.s2 : planAccent,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            <span style={{ fontSize: 8, color: planAccent === c.sb ? c.sb : "#000", fontWeight: 900 }}>✓</span>
                          </div>
                          <span style={{ fontSize: 12, color: c.sb2 }}>{f}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => onEnterApp("coach")}
                style={{
                  width: "100%", border: "none", borderRadius: 11,
                  background: plan.highlight ? c.accent : c.s2,
                  color: plan.highlight ? "#000" : c.tx,
                  fontWeight: 800, fontSize: 14, padding: "13px", cursor: "pointer",
                  marginBottom: 10,
                }}
              >
                {plan.cta} →
              </motion.button>

              <button
                onClick={() => setExpanded(isOpen ? null : plan.id)}
                style={{
                  width: "100%", background: "none", border: "none", cursor: "pointer",
                  fontSize: 11, color: c.sb, padding: "4px 0",
                }}
              >
                {isOpen ? "Hide features ↑" : `${plan.features.length} features · tap to see ↓`}
              </button>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

// ── SECTION 6: CLOSE + FOOTER ─────────────────────────────────────────────────
function CloseSection({ onEnterApp }) {
  const c = useC();
  const { theme } = useTheme();

  return (
    <section style={{
      padding: "120px clamp(16px, 4vw, 48px) 0",
      background: c.bg, borderTop: `1px solid ${c.bd}`,
      position: "relative", overflow: "hidden",
    }}>
      {theme === "dark" && (
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: `radial-gradient(ellipse 80% 60% at 50% 40%, rgba(200,255,0,0.05) 0%, transparent 70%)`,
        }} />
      )}

      <Reveal>
        <div style={{ textAlign: "center", marginBottom: 48, position: "relative" }}>
          <h2 style={{
            fontSize: "clamp(38px, 7.5vw, 68px)", fontWeight: 900,
            letterSpacing: "-0.045em", color: c.tx, lineHeight: 1.03, margin: "0 0 14px",
          }}>
            Your athletes are ready. Are you?
          </h2>
          <p style={{ fontSize: "clamp(14px, 2vw, 16px)", color: c.sb, marginBottom: 36, maxWidth: 320, margin: "0 auto 36px" }}>
            Free to start. First athlete in under 2 minutes.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => onEnterApp("coach")}
              style={{
                background: c.accent, border: "none", borderRadius: 12,
                color: "#000", fontWeight: 800, fontSize: 16,
                padding: "16px 34px", cursor: "pointer",
                boxShadow: theme === "dark" ? `0 8px 32px ${c.accent}30` : `0 4px 20px ${c.accent}50`,
              }}
            >
              I'm a coach →
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => onEnterApp("athlete")}
              style={{
                background: "none", border: `1.5px solid ${c.bd}`, borderRadius: 12,
                color: c.tx, fontWeight: 600, fontSize: 16,
                padding: "16px 34px", cursor: "pointer",
              }}
            >
              I'm an athlete →
            </motion.button>
          </div>
        </div>
      </Reveal>

      {/* Footer */}
      <footer style={{
        borderTop: `1px solid ${c.bd}`,
        padding: "28px 0 36px",
        display: "flex", flexWrap: "wrap", gap: 16,
        alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <img src="/theryn-logo.svg" alt="Theryn" style={{ width: 24, height: 24, borderRadius: 6 }} />
          <span style={{ fontSize: 14, fontWeight: 900, color: c.tx, letterSpacing: "-0.04em" }}>Theryn</span>
        </div>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          {["Privacy", "Terms", "Support", "Contact"].map(l => (
            <span key={l} style={{ fontSize: 12, color: c.sb, cursor: "pointer", transition: "color 0.2s" }}
              onMouseEnter={e => e.target.style.color = c.tx}
              onMouseLeave={e => e.target.style.color = c.sb}
            >{l}</span>
          ))}
        </div>
        <span style={{ fontSize: 11, color: c.mt }}>© 2026 Theryn. All rights reserved.</span>
      </footer>
    </section>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
function LandingContent({ onEnterApp }) {
  const c = useC();
  const { theme } = useTheme();

  useEffect(() => {
    document.body.style.background = theme === "dark" ? "#080808" : "#FFFFFF";
    document.body.style.color = theme === "dark" ? "#F0F0F0" : "#0A0A0A";
  }, [theme]);

  return (
    <div style={{
      fontFamily: "-apple-system, 'Helvetica Neue', Helvetica, sans-serif",
      background: c.bg, color: c.tx, minHeight: "100vh",
    }}>
      <Navbar onGetStarted={() => onEnterApp("coach")} />
      <HeroSection onEnterApp={onEnterApp} />
      <SplitSection onEnterApp={onEnterApp} />
      <EmotionalHitSection />
      <HowItWorksSection />
      <CloseSection onEnterApp={onEnterApp} />
    </div>
  );
}

const ASK_COACH_MESSAGE = "Hey coach — can you set me up on Theryn? It's free, and you send my workouts as a link so I don't need another app. https://theryn.fit";

// Conversion landing composition. It keeps the existing product tokens and
// the original hero frames, while routing every coach CTA through App.jsx's
// existing Supabase OAuth entry point.
function ConversionLandingContent({ onEnterApp }) {
  const c = useC();
  const { theme, toggle } = useTheme();
  const [step, setStep] = useState(0);
  const [coachFrame, setCoachFrame] = useState(1);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const motionOn = !reducedMotion;
  const athleteRef = useRef(null);
  const athleteVisible = useInView(athleteRef, { amount: .15 });
  useEffect(() => {
    if (!motionOn) return;
    const athleteTimer = athleteVisible ? setInterval(() => setStep(s => (s + 1) % 3), 3200) : null;
    const coachTimer = setInterval(() => setCoachFrame(s => (s + 1) % 3), 3200);
    return () => { clearInterval(athleteTimer); clearInterval(coachTimer); };
  }, [motionOn, athleteVisible]);
  const steps = ["Open", "Tick", "Send to coach"];
  const scrollTo = id => document.getElementById(id)?.scrollIntoView({ behavior: motionOn ? "smooth" : "auto" });
  // Athletes never sign in from here: the closer hands them a ready-made
  // message for their coach via the native share sheet, falling back to the
  // clipboard, then to showing the text so it can be copied by hand.
  const [askState, setAskState] = useState("idle");
  const askCoach = async () => {
    try {
      if (navigator.share) { await navigator.share({ text: ASK_COACH_MESSAGE }); return; }
      await navigator.clipboard.writeText(ASK_COACH_MESSAGE);
      setAskState("copied");
    } catch (err) {
      if (err?.name === "AbortError") return; // user closed the share sheet
      setAskState("failed");
    }
  };
  return (
    <LandingMotion.Provider value={motionOn}><div className="theryn-conversion-landing" data-motion={motionOn ? "on" : "off"} style={{ fontFamily: "-apple-system, 'Helvetica Neue', Helvetica, sans-serif", background: c.bg, color: c.tx, minHeight: "100vh", overflow: "clip" }}>
      <header style={{ height: 76, maxWidth: 1320, margin: "0 auto", padding: "0 clamp(18px, 5vw, 64px)", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${c.bd}`, position: "relative", zIndex: 10 }}>
        <a href="#home" style={{ display: "flex", gap: 9, alignItems: "center", color: c.tx, textDecoration: "none", fontWeight: 900, letterSpacing: "0.16em" }}><img src="/theryn-logo.svg" alt="" style={{ width: 25, height: 25 }} />THERYN</a>
        <nav style={{ display: "flex", gap: 26, fontSize: 12, color: c.sb2 }}><a href="#coaches" style={{ color: "inherit", textDecoration: "none" }}>For coaches</a><a href="#athletes" style={{ color: "inherit", textDecoration: "none" }}>For athletes</a></nav>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><button aria-label="Toggle theme" onClick={toggle} style={{ width: 31, height: 31, borderRadius: 20, border: `1px solid ${c.bd}`, background: "none", color: c.tx }}>{theme === "dark" ? "☀" : "☾"}</button><button onClick={() => onEnterApp("coach")} style={{ border: 0, background: "none", color: c.tx, fontSize: 12, fontWeight: 700 }}>Coach sign in ↗</button></div>
      </header>
      <main>
        <section id="home" style={{ maxWidth: 1320, minHeight: "calc(100vh - 76px)", margin: "0 auto", padding: "clamp(65px, 10vw, 135px) clamp(18px, 6vw, 80px) 100px", display: "grid", gridTemplateColumns: "1.1fr .9fr", alignItems: "center", gap: 60, position: "relative" }}>
          <div><div style={{ fontSize: 10, letterSpacing: "0.2em", color: c.sb2, marginBottom: 24 }}>YOUR COACHING. ONE LINK.</div><h1 style={{ fontSize: "clamp(48px, 6.3vw, 86px)", lineHeight: .98, letterSpacing: "-.055em", margin: 0, maxWidth: 700 }}>Get your athletes training with <span style={{ color: c.accentText }}>one link.</span></h1><p style={{ fontSize: 20, lineHeight: 1.55, color: c.sb2, margin: "28px 0" }}>Coaches, send the plan.<br />Athletes, open it and train.</p><div className="hero-actions" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><button onClick={() => onEnterApp("coach")} style={{ background: c.accent, color: "#000", border: 0, borderRadius: 10, padding: "16px 22px", fontWeight: 800 }}><small>I’m a coach</small><strong>Sign in</strong><span className="action-arrow" aria-hidden="true">↗</span></button><button onClick={() => scrollTo("get-link")} style={{ background: c.s1, color: c.tx, border: `1px solid ${c.bd}`, borderRadius: 10, padding: "16px 22px", fontWeight: 700 }}><small>I’m an athlete</small><strong>Get my workout link</strong><span className="action-arrow" aria-hidden="true">↓</span></button></div><div style={{ color: c.sb, fontSize: 11, marginTop: 15 }}>Free for coaches and athletes.</div></div>
          <FittedHero />
        </section>
        <ScrollReveal><section style={{ maxWidth: 1080, margin: "0 auto", padding: "110px clamp(18px, 6vw, 80px)", borderTop: `1px solid ${c.bd}`, textAlign: "center" }}><div style={{ color: c.sb2, fontSize: 10, letterSpacing: ".18em", marginBottom: 25 }}>01 / FOR COACHES</div><h2 style={{ fontSize: "clamp(38px, 5vw, 64px)", letterSpacing: "-.05em", margin: 0 }}>You sent the workout.<br /><span style={{ color: c.sb }}>Now you’re chasing the update.</span></h2><div style={{ display: "grid", gap: 12, maxWidth: 670, margin: "50px auto 0" }}>{["Where’s my plan?", "What weight should I use?", "Did you finish yesterday?"].map((msg, i) => <motion.div key={msg} whileInView={{ x: 0, opacity: 1 }} initial={{ x: i % 2 ? 35 : -35, opacity: 0 }} viewport={{ once: false }} transition={{ delay: i * .12 }} style={{ padding: "18px 21px", border: `1px solid ${c.bd}`, background: c.s1, borderRadius: 13, display: "flex", justifyContent: "space-between", textAlign: "left" }}><span><small style={{ display: "block", color: c.sb, fontSize: 8, letterSpacing: ".15em", marginBottom: 6 }}>{i === 2 ? "YOU → MAYA" : "MAYA → YOU"}</small><strong>{msg}</strong></span><small style={{ color: c.sb }}>9:{String(2 + i * 2).padStart(2, "0")}</small></motion.div>)}</div><p style={{ color: c.sb2, marginTop: 48, fontSize: 19 }}>Give every athlete <span style={{ color: c.accentText }}>one link</span> to come back to.</p></section></ScrollReveal>
        <ScrollReveal><section ref={athleteRef} id="athletes" style={{ maxWidth: 1320, margin: "0 auto", padding: "110px clamp(18px, 6vw, 80px)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 75, alignItems: "center" }}><div><div style={{ color: c.sb2, fontSize: 10, letterSpacing: ".18em", marginBottom: 25 }}>02 / FOR ATHLETES</div><h2 style={{ fontSize: "clamp(40px, 5vw, 64px)", letterSpacing: "-.05em", margin: 0 }}>Your next workout<br />is <span style={{ color: c.accentText }}>one tap away.</span></h2><p style={{ marginTop: 26 }}>Open your coach’s link. See the plan.<br />Tick it off. Send it to your coach.</p><div className="athlete-steps" style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 30 }}>{steps.map((s, i) => <React.Fragment key={s}><button onClick={() => setStep(i)} style={{ background: "none", border: 0, borderBottom: `2px solid ${step === i ? c.accentText : "transparent"}`, color: step === i ? c.accentText : c.sb2, padding: "0 0 7px", fontSize: 18 }}>{s}</button>{i < 2 && <span style={{ color: c.sb }}>→</span>}</React.Fragment>)}</div><div style={{ color: c.sb, fontSize: 12, marginTop: 19 }}>{["Open the workout link your coach sent.", "Tick the sets you complete.", "Send the finished workout to your coach."][step]}</div><p style={{ fontSize: 13, marginTop: 20 }}>No app or sign-in needed.<br />Logging weights is optional.</p><button onClick={() => onEnterApp("athlete")} style={{ background: "none", color: c.accentText, border: 0, padding: 0, marginTop: 18, fontWeight: 700 }}>Want more? Explore the athlete app →</button></div><AthleteProduct step={step} /></section></ScrollReveal>
        <ScrollReveal><section id="coaches" style={{ maxWidth: 1320, margin: "0 auto", padding: "110px clamp(18px, 6vw, 80px)", borderTop: `1px solid ${c.bd}` }}><div style={{ display: "flex", justifyContent: "space-between", gap: 30, alignItems: "end" }}><div><div style={{ color: c.sb2, fontSize: 10, letterSpacing: ".18em", marginBottom: 25 }}>03 / FOR COACHES</div><h2 style={{ fontSize: "clamp(40px, 5vw, 64px)", letterSpacing: "-.05em", margin: 0 }}>Your side<br />of the link.</h2></div><p style={{ maxWidth: 370 }}>Build the plan once. Save it as a template.<br />Send it to your athletes.<br /><br />See who trained today, who didn’t,<br />and what they wrote.</p></div><div className="coach-showcase"><div className="coach-story-labels">{["Build the plan", "Save a template", "See your athletes"].map((label, i) => <span key={label} className={i === coachFrame ? "active" : ""}><small>0{i + 1}</small>{label}</span>)}</div><CoachProduct screen={["plan", "templates", "dashboard"][coachFrame]} /><p className="sample-label">Sample athletes · actual Theryn coach screens</p></div></section></ScrollReveal>
        <ScrollReveal><section style={{ maxWidth: 1000, margin: "0 auto", padding: "100px clamp(18px, 6vw, 80px)", textAlign: "center", borderTop: `1px solid ${c.bd}` }}><div style={{ color: c.sb2, fontSize: 10, letterSpacing: ".18em", marginBottom: 25 }}>04 / THE PAYOFF</div><h2 style={{ fontSize: "clamp(38px, 5vw, 62px)", letterSpacing: "-.05em", margin: 0 }}>Show athletes what<br />their effort is <span style={{ color: c.accentText }}>building.</span></h2><p style={{ marginTop: 25 }}>At your next check-in, open their progress together.</p><div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12, marginTop: 40 }}>{["You’re lifting more.", "You’re showing up more often.", "Here’s what we’ll work on next."].map(t => <div key={t} style={{ borderLeft: `2px solid ${c.accentText}`, padding: "17px 20px", background: c.s1, textAlign: "left", borderRadius: "0 12px 12px 0" }}><small style={{ display: "block", color: c.sb, fontSize: 8, letterSpacing: ".12em", marginBottom: 7 }}>COACH → MAYA</small><strong>{t}</strong></div>)}</div><h3 style={{ marginTop: 45, fontSize: 26 }}>Make the progress visible.<br />Make the next goal clear.</h3></section></ScrollReveal>
        <ScrollReveal><section className="landing-trust"><div className="trust-intro"><span className="trust-kicker">LESS FRICTION. MORE TRAINING.</span><h2>One link.<br /><span>Zero barriers.</span></h2><p>Free for coaches and athletes.</p></div><div className="trust-facts">{[["01", "Free", "For coaches and athletes."], ["02", "Any browser", "Open your workout wherever you are."], ["03", "No installation", "Your coach sends a link. You’re ready."]].map(([n, title, text]) => <div key={n}><span className="trust-number">{n}</span><h3>{title}</h3><p>{text}</p><span className="trust-check" aria-hidden="true">✓</span></div>)}</div></section></ScrollReveal>
        <ScrollReveal><section className="closing-grid" style={{ maxWidth: 1100, margin: "0 auto", padding: "110px clamp(18px, 6vw, 80px)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60 }}><div><div style={{ color: c.sb2, fontSize: 10, letterSpacing: ".18em", marginBottom: 25 }}>FOR COACHES</div><h2 style={{ fontSize: 42, letterSpacing: "-.05em", margin: 0 }}>Build your first plan.<br />Send your first link.</h2><p style={{ margin: "22px 0" }}>Give your athletes clear workouts.<br />Give yourself a clearer picture of their training.</p><button onClick={() => onEnterApp("coach")} style={{ background: c.accent, color: "#000", border: 0, borderRadius: 10, padding: "16px 22px", fontWeight: 800 }}>Coach sign in ↗</button><div style={{ color: c.sb, fontSize: 11, marginTop: 13 }}>Free for coaches and athletes.</div></div><div id="get-link" style={{ borderLeft: `1px solid ${c.bd}`, paddingLeft: 55 }}><div style={{ color: c.sb2, fontSize: 10, letterSpacing: ".18em", marginBottom: 25 }}>FOR ATHLETES</div><h2 style={{ fontSize: 42, letterSpacing: "-.05em", margin: 0 }}>Bring your coach.<br />Get your plan.<br /><span style={{ color: c.accentText }}>Start training.</span></h2><p style={{ margin: "22px 0" }}>Send your coach a quick message.<br />They set up your workout. You open the link.</p><button onClick={askCoach} style={{ background: c.s1, color: c.tx, border: `1px solid ${c.bd}`, borderRadius: 10, padding: "16px 22px", fontWeight: 700 }}>Ask my coach for a workout link ↗</button><div aria-live="polite" style={{ color: c.sb, fontSize: 12, marginTop: 14, minHeight: 18 }}>{askState === "copied" ? "Message copied — paste it to your coach." : askState === "failed" ? "Couldn’t open sharing. Copy this message to your coach:" : "Already have your link? Open it directly — no sign-in needed."}</div>{askState === "failed" && <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, color: c.sb2, background: c.s1, border: `1px solid ${c.bd}`, borderRadius: 10, padding: 14, marginTop: 10 }}>{ASK_COACH_MESSAGE}</pre>}</div></section></ScrollReveal>
      </main>
      <footer style={{ borderTop: `1px solid ${c.bd}`, padding: "28px clamp(18px, 6vw, 80px)", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 15, color: c.sb, fontSize: 11 }}><span>THERYN · Better connected. Better coached.</span><span>© 2026 Theryn</span></footer>
    </div></LandingMotion.Provider>
  );
}

export default function LandingPage({ onEnterApp }) {
  useEffect(() => {
    document.body.setAttribute("data-landing", "true");
    // Unlock scroll — index.css hides overflow on html/body for the app shell
    document.documentElement.style.overflow = "auto";
    document.documentElement.style.height = "auto";
    document.body.style.overflow = "auto";
    document.body.style.height = "auto";
    const root = document.getElementById("root");
    if (root) { root.style.maxWidth = "none"; root.style.overflow = "visible"; root.style.height = "auto"; }

    return () => {
      document.body.removeAttribute("data-landing");
      document.documentElement.style.overflow = "";
      document.documentElement.style.height = "";
      document.body.style.overflow = "";
      document.body.style.height = "";
      document.body.style.background = "";
      document.body.style.color = "";
      if (root) { root.style.maxWidth = ""; root.style.overflow = ""; root.style.height = ""; }
    };
  }, []);

  return (
    <ThemeProvider>
      <ConversionLandingContent onEnterApp={onEnterApp} />
    </ThemeProvider>
  );
}
