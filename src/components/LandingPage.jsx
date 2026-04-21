import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useInView,
  useMotionValue,
  useScroll,
  useSpring,
} from "framer-motion";

// ── THEME ─────────────────────────────────────────────────────────────────────
const ThemeCtx = createContext({ theme: "dark", toggle: () => {} });

const DARK = {
  bg: "#080808", s1: "#101010", s2: "#181818", bd: "#1E1E1E",
  tx: "#F0F0F0", sb: "#585858", sb2: "#A8AEB7",
  accent: "#C8FF00", accentText: "#C8FF00",
  teal: "#4ECDC4", tealText: "#4ECDC4",
  warm: "#FFD166", red: "#FF5C5C",
  mt: "#282828", grid: "#1E1E1E", glow: "rgba(200,255,0,0.08)",
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
    () => localStorage.getItem("theryn_theme") || "light"
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
  const w = size === "sm" ? 190 : 220;
  return (
    <div style={{
      width: w, background: c.s1, borderRadius: 36,
      border: `1.5px solid ${c.bd}`,
      boxShadow: `0 24px 56px rgba(0,0,0,0.4), 0 0 0 1px ${c.bd}`,
      overflow: "hidden", position: "relative", flexShrink: 0,
    }}>
      {/* iOS notch */}
      <div style={{
        position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
        width: 72, height: 20, background: c.s1,
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
  if (frame === 0) return (
    <div style={{ padding: "12px 16px" }}>
      <div style={{ fontSize: 9, color: c.sb, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
        Your invite code
      </div>
      <motion.div
        animate={{ boxShadow: [`0 0 0px ${c.accent}00`, `0 0 28px ${c.accent}50`, `0 0 0px ${c.accent}00`] }}
        transition={{ duration: 2.2, repeat: Infinity }}
        style={{
          background: c.s2, borderRadius: 14, padding: "18px 16px",
          border: `1px solid ${c.accent}50`, textAlign: "center", marginBottom: 14,
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: "0.24em", color: c.accentText }}>K7M4NP</div>
        <div style={{ fontSize: 9, color: c.sb, marginTop: 4 }}>Tap to share →</div>
      </motion.div>
      {[["Alex M.", c.accent, "Push Day"], ["Jordan K.", c.teal, "Upper"], ["Sam R.", c.warm, "Legs"]].map(([n, col, type]) => (
        <div key={n} style={{ display: "flex", alignItems: "center", gap: 8, background: c.s2, borderRadius: 9, padding: "7px 10px", marginBottom: 5 }}>
          <div style={{ width: 22, height: 22, borderRadius: "50%", background: col, opacity: 0.85, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: c.tx, fontWeight: 600 }}>{n}</span>
          <span style={{ fontSize: 10, color: c.sb, marginLeft: "auto" }}>{type}</span>
        </div>
      ))}
    </div>
  );

  if (frame === 1) return (
    <div style={{ padding: "12px 16px" }}>
      <div style={{ fontSize: 9, color: c.sb, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
        New connection
      </div>
      <motion.div
        initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        style={{
          background: `linear-gradient(135deg, ${c.teal}18, ${c.accent}10)`,
          border: `1px solid ${c.teal}60`, borderRadius: 14, padding: "14px",
          display: "flex", alignItems: "center", gap: 10, marginBottom: 12,
        }}
      >
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: c.teal, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#fff", flexShrink: 0 }}>M</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: c.tx }}>Maya J.</div>
          <div style={{ fontSize: 10, color: c.teal }}>Wants to join →</div>
        </div>
      </motion.div>
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.35 }}
        style={{ background: c.accent, borderRadius: 10, padding: "11px", textAlign: "center" }}
      >
        <span style={{ fontSize: 12, fontWeight: 800, color: "#000" }}>Approve athlete</span>
      </motion.div>
      <div style={{ marginTop: 10, fontSize: 10, color: c.sb, textAlign: "center" }}>Now on your roster</div>
    </div>
  );

  if (frame === 2) return (
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

  return (
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
        <span style={{ fontSize: 16, fontWeight: 900, color: c.tx, letterSpacing: "-0.05em" }}>theryn</span>
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

// ── SECTION 1: HERO ───────────────────────────────────────────────────────────
const FRAME_LABELS = ["Share code", "Athlete joins", "Log session", "Coach sees it"];

function HeroSection({ onEnterApp }) {
  const c = useC();
  const { theme } = useTheme();
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setFrame(f => (f + 1) % 4), 1500);
    return () => clearInterval(t);
  }, []);

  const scrollToHow = () =>
    document.getElementById("how")?.scrollIntoView({ behavior: "smooth" });

  return (
    <section style={{
      minHeight: "100svh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "80px clamp(16px, 4vw, 48px) 60px",
      position: "relative", overflow: "hidden", background: c.bg,
    }}>
      {/* Radial glows */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: theme === "dark"
          ? `radial-gradient(ellipse 65% 50% at 50% 18%, rgba(200,255,0,0.09) 0%, transparent 68%), radial-gradient(ellipse 45% 40% at 82% 65%, rgba(78,205,196,0.05) 0%, transparent 60%)`
          : `radial-gradient(ellipse 65% 50% at 50% 18%, rgba(200,255,0,0.18) 0%, transparent 68%)`,
      }} />
      {/* Grid */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: `linear-gradient(${c.grid} 1px, transparent 1px), linear-gradient(90deg, ${c.grid} 1px, transparent 1px)`,
        backgroundSize: "52px 52px", opacity: theme === "dark" ? 0.25 : 0.5,
      }} />

      {/* Text block */}
      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
        style={{ textAlign: "center", position: "relative", zIndex: 1, maxWidth: 600 }}
      >
        {/* Badge */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: c.s1, borderRadius: 100, padding: "5px 14px", border: `1px solid ${c.bd}`, marginBottom: 20 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.accent, display: "inline-block" }} />
          <span style={{ fontSize: 11, color: c.sb, fontWeight: 600, letterSpacing: "0.03em" }}>iOS · Android · Web · Free to start</span>
        </div>

        <h1 style={{
          fontSize: "clamp(42px, 8.5vw, 76px)", fontWeight: 900,
          letterSpacing: "-0.045em", lineHeight: 1.03, color: c.tx, margin: "0 0 4px",
        }}>
          Built for Coaches.
        </h1>
        <h1 className="text-gradient" style={{
          fontSize: "clamp(42px, 8.5vw, 76px)", fontWeight: 900,
          letterSpacing: "-0.045em", lineHeight: 1.03, margin: "0 0 20px",
          background: `linear-gradient(120deg, ${c.accent} 0%, ${c.teal} 100%)`,
        }}>
          Loved by Athletes.
        </h1>
        <p style={{ fontSize: "clamp(15px, 2.5vw, 18px)", color: c.sb, margin: "0 auto 32px", lineHeight: 1.6, maxWidth: 380 }}>
          One app. Real data. Zero spreadsheets.
        </p>

        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => onEnterApp("coach")}
            style={{
              background: c.accent, border: "none", borderRadius: 11,
              color: "#000", fontWeight: 800, fontSize: 15,
              padding: "14px 30px", cursor: "pointer",
              boxShadow: theme === "dark" ? `0 8px 32px ${c.accent}30` : `0 4px 16px ${c.accent}60`,
            }}
          >
            Start Free →
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            onClick={scrollToHow}
            style={{
              background: "none", border: `1.5px solid ${c.bd}`, borderRadius: 11,
              color: c.tx, fontWeight: 600, fontSize: 15,
              padding: "14px 30px", cursor: "pointer",
            }}
          >
            See How It Works
          </motion.button>
        </div>
      </motion.div>

      {/* Product loop */}
      <motion.div
        initial={{ opacity: 0, y: 44 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
        style={{ marginTop: 48, position: "relative", zIndex: 1 }}
      >
        <div style={{ position: "relative" }}>
          {/* Glow under phone */}
          <div style={{
            position: "absolute", bottom: -30, left: "50%", transform: "translateX(-50%)",
            width: 160, height: 60,
            background: `radial-gradient(ellipse, ${c.accent}25 0%, transparent 70%)`,
            filter: "blur(20px)", pointerEvents: "none",
          }} />
          <PhoneShell c={c}>
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

        {/* Frame dots */}
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
      stat: "5 hrs saved weekly",
      accent: c.accent, accentText: c.accentText,
      items: ["Full athlete roster", "Routine builder", "Needs-attention alerts", "Payment tracking"],
    },
    {
      role: "athlete", title: "ATHLETE", cta: "Join as athlete →",
      headline: "Tap.\nLog.\nDone.",
      stat: "2-second set logging",
      accent: c.teal, accentText: c.tealText,
      items: ["Coach-assigned routines", "Personal records", "Body tracking", "Progress charts"],
    },
  ];

  return (
    <section style={{ padding: "90px clamp(16px, 4vw, 48px)", background: c.bg }}>
      <Reveal>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ fontSize: 10, color: c.sb, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 10 }}>
            Find yourself
          </div>
          <h2 style={{ fontSize: "clamp(30px, 5.5vw, 48px)", fontWeight: 900, letterSpacing: "-0.045em", color: c.tx }}>
            Who are you?
          </h2>
        </div>
      </Reveal>

      <div ref={ref} style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: 14, maxWidth: 740, margin: "0 auto",
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
            More results.<br />
            <span className="text-gradient" style={{
              background: `linear-gradient(120deg, ${c.accent} 0%, ${c.teal} 100%)`,
            }}>
              Less effort.
            </span>
          </h2>
          <p style={{ fontSize: "clamp(14px, 2vw, 16px)", color: c.sb, maxWidth: 300, margin: "0 auto" }}>
            Built for coaches who do the work, not the admin.
          </p>
        </div>
      </Reveal>

      <div ref={ref} style={{
        display: "flex", justifyContent: "center",
        gap: "clamp(28px, 7vw, 80px)", flexWrap: "wrap",
      }}>
        {[
          { target: 5, suffix: " hrs", label: "saved weekly", sub: "of admin per coach" },
          { target: 2, suffix: "×", label: "retention rate", sub: "vs. WhatsApp coaching" },
          { target: 100, suffix: "%", label: "real data", sub: "no self-reported guesses" },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 24 }}
            animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
            transition={{ duration: 0.5, delay: i * 0.14 }}
            style={{ textAlign: "center" }}
          >
            <div style={{
              fontSize: "clamp(48px, 8.5vw, 72px)", fontWeight: 900,
              letterSpacing: "-0.045em", color: c.tx, lineHeight: 1,
            }}>
              <CountUp target={s.target} suffix={s.suffix} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: c.sb2, marginTop: 6 }}>{s.label}</div>
            <div style={{ fontSize: 11, color: c.sb, marginTop: 3 }}>{s.sub}</div>
          </motion.div>
        ))}
      </div>

      {/* Replaces row */}
      <Reveal delay={0.3}>
        <div style={{ marginTop: 56, textAlign: "center" }}>
          <div style={{ fontSize: 10, color: c.sb, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>
            Replaces
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
            {[
              ["Excel", "#FF5C5C"],
              ["WhatsApp", "#06D6A0"],
              ["Notes.app", "#FFD166"],
              ["Notion", "#C77DFF"],
              ["TrainingPeaks", "#FF8C42"],
              ["Google Sheets", "#4ECDC4"],
            ].map(([app, clr]) => (
              <div key={app} style={{
                background: `${clr}18`,
                border: `1px solid ${clr}70`,
                borderRadius: 100, padding: "5px 14px", fontSize: 12,
                color: clr, textDecoration: "line-through", fontWeight: 600,
              }}>
                {app}
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}

// ── SECTION 4: HOW IT WORKS ───────────────────────────────────────────────────
const STEPS = [
  {
    n: "01", title: "Share code", desc: "6-character code. No forms, no email chains, no awkward setup calls.",
    frame: (c) => (
      <div style={{ padding: "12px 16px" }}>
        <div style={{ fontSize: 9, color: c.sb, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Your invite code</div>
        <div style={{ background: c.s2, borderRadius: 12, padding: "16px", textAlign: "center", border: `1px solid ${c.accent}50`, marginBottom: 10 }}>
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: "0.22em", color: c.accentText }}>K7M4NP</div>
          <div style={{ fontSize: 9, color: c.sb, marginTop: 4 }}>Tap to copy</div>
        </div>
        <div style={{ fontSize: 10, color: c.sb, textAlign: "center" }}>Share via message or link</div>
      </div>
    ),
  },
  {
    n: "02", title: "Athlete joins", desc: "Athlete enters code, requests to join. Coach approves in one tap.",
    frame: (c) => (
      <div style={{ padding: "12px 16px" }}>
        <div style={{ fontSize: 9, color: c.sb, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>New request</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: `${c.teal}14`, border: `1px solid ${c.teal}50`, borderRadius: 12, padding: "12px", marginBottom: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: c.teal, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#fff", fontSize: 13 }}>M</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: c.tx }}>Maya J.</div>
            <div style={{ fontSize: 10, color: c.teal }}>Wants to join</div>
          </div>
        </div>
        <div style={{ background: c.accent, borderRadius: 10, padding: "10px", textAlign: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: "#000" }}>Approve →</span>
        </div>
      </div>
    ),
  },
  {
    n: "03", title: "Log sessions", desc: "Athletes log every set, weight, and rep. Auto-detected personal records.",
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
    n: "04", title: "Coach sees everything", desc: "Volume, streaks, needs-attention flags. All real-time. Zero guessing.",
    frame: (c) => (
      <div style={{ padding: "10px 12px" }}>
        {/* Header row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 9, color: c.sb, letterSpacing: "0.1em", textTransform: "uppercase" }}>Your athletes</div>
          <div style={{ fontSize: 8, color: c.accentText, fontWeight: 700 }}>3 active</div>
        </div>
        {/* Needs Attention banner */}
        <div style={{ background: "rgba(217,119,87,0.12)", border: "1px solid rgba(217,119,87,0.35)", borderRadius: 10, padding: "7px 10px", marginBottom: 8 }}>
          <div style={{ fontSize: 8, color: "#D97757", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>Needs attention</div>
          <div style={{ fontSize: 10, color: c.tx, fontWeight: 600 }}>Jordan M. — 6 days inactive</div>
        </div>
        {/* Athlete cards */}
        {[
          { name: "Maya J.",   init: "M", vol: "42k", bw: "↓138", sess: "5/5", badge: "New PR",    bc: c.accent,    bt: "#000" },
          { name: "Alex R.",   init: "A", vol: "31k", bw: "→185", sess: "4/5", badge: "On track",  bc: c.teal,      bt: "#fff" },
          { name: "Jordan M.", init: "J", vol: "8k",  bw: "↑192", sess: "1/5", badge: "Falling",   bc: "#D97757",   bt: "#fff" },
        ].map(({ name, init, vol, bw, sess, badge, bc, bt }) => (
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
];

function HowItWorksSection() {
  const c = useC();
  const isMobile = useIsMobile();
  const containerRef = useRef(null);
  const [activeStep, setActiveStep] = useState(0);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  useEffect(() => {
    if (isMobile) return;
    return scrollYProgress.on("change", v => {
      setActiveStep(Math.min(3, Math.floor(v * 4.0)));
    });
  }, [scrollYProgress, isMobile]);

  if (isMobile) {
    return (
      <section id="how" style={{ padding: "80px clamp(16px, 4vw, 32px)", background: c.bg }}>
        <Reveal>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ fontSize: 10, color: c.sb, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 10 }}>
              How it works
            </div>
            <h2 style={{ fontSize: "clamp(28px, 6vw, 44px)", fontWeight: 900, letterSpacing: "-0.045em", color: c.tx }}>
              Four steps. Forever.
            </h2>
          </div>
        </Reveal>
        {STEPS.map((step, i) => (
          <Reveal key={step.n} delay={i * 0.08}>
            <div style={{ display: "flex", gap: 16, marginBottom: 32, alignItems: "flex-start" }}>
              <div style={{
                width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                background: c.accent, display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 10, fontWeight: 900, color: "#000",
              }}>
                {step.n}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: c.tx, marginBottom: 4 }}>{step.title}</div>
                <div style={{ fontSize: 13, color: c.sb, lineHeight: 1.55, marginBottom: 14 }}>{step.desc}</div>
                <div style={{ background: c.s1, borderRadius: 16, border: `1px solid ${c.bd}`, overflow: "hidden" }}>
                  {step.frame(c)}
                </div>
              </div>
            </div>
          </Reveal>
        ))}
      </section>
    );
  }

  return (
    <section id="how" ref={containerRef} style={{ height: "400vh", position: "relative" }}>
      <div style={{
        position: "sticky", top: 0, height: "100vh",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: "0 clamp(24px, 5vw, 64px)", background: c.bg, overflow: "hidden",
      }}>
        <Reveal>
          <div style={{ textAlign: "center", marginBottom: 44 }}>
            <div style={{ fontSize: 10, color: c.sb, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 10 }}>
              How it works
            </div>
            <h2 style={{ fontSize: "clamp(28px, 4.5vw, 44px)", fontWeight: 900, letterSpacing: "-0.045em", color: c.tx }}>
              Four steps. Forever.
            </h2>
          </div>
        </Reveal>

        <div style={{
          display: "flex", gap: "clamp(32px, 6vw, 72px)",
          alignItems: "center", width: "100%", maxWidth: 820, justifyContent: "center",
        }}>
          {/* Steps list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 240, maxWidth: 280 }}>
            {STEPS.map((step, i) => (
              <motion.div
                key={step.n}
                animate={{ opacity: activeStep === i ? 1 : 0.35 }}
                transition={{ duration: 0.3 }}
                style={{ cursor: "pointer", display: "flex", gap: 14, alignItems: "flex-start" }}
                onClick={() => setActiveStep(i)}
              >
                <div style={{
                  width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                  background: activeStep === i ? c.accent : c.s2,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 900,
                  color: activeStep === i ? "#000" : c.sb,
                  transition: "background 0.3s, color 0.3s",
                }}>
                  {step.n}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: c.tx, marginBottom: 3 }}>{step.title}</div>
                  <div style={{ fontSize: 12, color: c.sb, lineHeight: 1.55 }}>{step.desc}</div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Phone mockup */}
          <div style={{ position: "relative" }}>
            <div style={{
              position: "absolute", inset: -40,
              background: `radial-gradient(circle, ${c.accent}14 0%, transparent 70%)`,
              filter: "blur(20px)", pointerEvents: "none",
            }} />
            <PhoneShell c={c}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeStep}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -14 }}
                  transition={{ duration: 0.25 }}
                >
                  {STEPS[activeStep].frame(c)}
                </motion.div>
              </AnimatePresence>
            </PhoneShell>
          </div>
        </div>

        {/* Progress dots */}
        <div style={{ display: "flex", gap: 8, marginTop: 36 }}>
          {STEPS.map((_, i) => (
            <motion.button
              key={i}
              onClick={() => setActiveStep(i)}
              animate={{ width: activeStep === i ? 24 : 8, background: activeStep === i ? c.accent : c.bd }}
              transition={{ duration: 0.3 }}
              style={{ height: 8, borderRadius: 4, border: "none", cursor: "pointer", padding: 0 }}
            />
          ))}
        </div>
        <div style={{ marginTop: 10, fontSize: 10, color: c.sb }}>Scroll to advance</div>
      </div>
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
        gap: 14, maxWidth: 860, margin: "0 auto",
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
            Coach, don't chase.
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
          <span style={{ fontSize: 14, fontWeight: 900, color: c.tx, letterSpacing: "-0.04em" }}>theryn</span>
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
      <PricingSection onEnterApp={onEnterApp} />
      <CloseSection onEnterApp={onEnterApp} />
    </div>
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
    if (root) { root.style.maxWidth = "none"; root.style.overflow = "auto"; }

    return () => {
      document.body.removeAttribute("data-landing");
      document.documentElement.style.overflow = "";
      document.documentElement.style.height = "";
      document.body.style.overflow = "";
      document.body.style.height = "";
      document.body.style.background = "";
      document.body.style.color = "";
      if (root) { root.style.maxWidth = ""; root.style.overflow = ""; }
    };
  }, []);

  return (
    <ThemeProvider>
      <LandingContent onEnterApp={onEnterApp} />
    </ThemeProvider>
  );
}
