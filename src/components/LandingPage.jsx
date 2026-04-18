import { useEffect, useRef, useState } from "react";

const A   = "#C8FF00";
const BG  = "#080808";
const S1  = "#101010";
const S2  = "#181818";
const BD  = "#1E1E1E";
const TX  = "#F0F0F0";
const SB  = "#585858";
const MT  = "#2C2C2C";
const RED = "#FF5C5C";

// ── PHONE MOCKUP ─────────────────────────────────────────────────────────────
function PhoneMockup({ screen = "log", style = {} }) {
  const screens = {
    log: <LogScreen />,
    body: <BodyScreen />,
    progress: <ProgressScreen />,
    coach: <CoachScreen />,
  };
  return (
    <div style={{
      position: "relative",
      width: 220,
      height: 460,
      ...style,
    }}>
      {/* Phone shell */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(145deg, #1a1a1a 0%, #0a0a0a 100%)",
        borderRadius: 36,
        border: "2px solid #2a2a2a",
        boxShadow: "0 40px 80px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 1px rgba(0,0,0,0.5)",
        overflow: "hidden",
      }}>
        {/* Side buttons */}
        <div style={{ position:"absolute", left:-3, top:80, width:3, height:30, background:"#1a1a1a", borderRadius:"2px 0 0 2px" }} />
        <div style={{ position:"absolute", left:-3, top:120, width:3, height:30, background:"#1a1a1a", borderRadius:"2px 0 0 2px" }} />
        <div style={{ position:"absolute", right:-3, top:100, width:3, height:50, background:"#1a1a1a", borderRadius:"0 2px 2px 0" }} />

        {/* Screen */}
        <div style={{
          position: "absolute", inset: 2,
          background: BG,
          borderRadius: 34,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}>
          {/* Notch */}
          <div style={{
            position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
            width: 80, height: 22,
            background: "#0a0a0a",
            borderRadius: "0 0 14px 14px",
            zIndex: 10,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:"#1a1a1a", border:"1px solid #2a2a2a" }} />
            <div style={{ width:40, height:8, borderRadius:4, background:"#1a1a1a", border:"1px solid #2a2a2a" }} />
          </div>
          {/* Screen content */}
          <div style={{ flex:1, overflow:"hidden", paddingTop:24 }}>
            {screens[screen]}
          </div>
          {/* Tab bar */}
          <PhoneTabBar />
        </div>
      </div>
    </div>
  );
}

function PhoneTabBar() {
  const tabs = ["Log","Routine","Body","Progress","Records"];
  return (
    <div style={{
      display:"flex", justifyContent:"space-around", alignItems:"center",
      padding:"8px 4px 12px",
      background: "rgba(8,8,8,0.96)",
      borderTop: `1px solid ${BD}`,
    }}>
      {tabs.map((t, i) => (
        <div key={t} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
          <div style={{ width:16, height:16, borderRadius:2, background: i===0 ? A : MT }} />
          <span style={{ fontSize:7, color: i===0 ? A : SB, letterSpacing:"0.04em" }}>{t}</span>
        </div>
      ))}
    </div>
  );
}

function LogScreen() {
  const exercises = [
    { name:"Bench Press", sets:[{w:185,r:5},{w:185,r:5},{w:185,r:4}] },
    { name:"Incline DB Press", sets:[{w:70,r:10},{w:70,r:8}] },
    { name:"Cable Fly", sets:[{w:40,r:12},{w:40,r:12}] },
  ];
  return (
    <div style={{ padding:"8px 10px", display:"flex", flexDirection:"column", gap:6 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
        <span style={{ fontSize:14, fontWeight:700, color:TX, letterSpacing:"-0.03em" }}>Push Day</span>
        <span style={{ fontSize:8, background:A, color:"#000", borderRadius:3, padding:"1px 5px", fontWeight:700, letterSpacing:"0.06em" }}>TODAY</span>
      </div>
      {exercises.map(ex => (
        <div key={ex.name} style={{ background:S1, borderRadius:8, border:`1px solid ${BD}`, padding:"7px 9px" }}>
          <div style={{ fontSize:9, fontWeight:600, color:TX, marginBottom:5 }}>{ex.name}</div>
          <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
            {ex.sets.map((s, i) => (
              <div key={i} style={{ background:S2, borderRadius:4, padding:"3px 6px", fontSize:8, color:TX }}>
                {s.w}×{s.r}
              </div>
            ))}
            <div style={{ background:"none", border:`1px dashed ${MT}`, borderRadius:4, padding:"3px 6px", fontSize:8, color:SB }}>+</div>
          </div>
        </div>
      ))}
      <div style={{ display:"flex", gap:6, marginTop:2 }}>
        {[["3","Exercises"],["8","Sets"],["4,240","Volume"]].map(([v,l]) => (
          <div key={l} style={{ flex:1, background:S1, borderRadius:6, border:`1px solid ${BD}`, padding:"5px 6px", textAlign:"center" }}>
            <div style={{ fontSize:11, fontWeight:700, color:A }}>{v}</div>
            <div style={{ fontSize:7, color:SB }}>{l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BodyScreen() {
  return (
    <div style={{ padding:"8px 10px", display:"flex", flexDirection:"column", gap:6 }}>
      <span style={{ fontSize:14, fontWeight:700, color:TX, letterSpacing:"-0.03em", marginBottom:2 }}>Body</span>
      <div style={{ background:S2, borderRadius:8, border:`1px solid ${BD}`, padding:"8px 10px" }}>
        <div style={{ fontSize:7, color:SB, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:3 }}>Today's Weight</div>
        <div style={{ display:"flex", alignItems:"baseline", gap:4 }}>
          <span style={{ fontSize:26, fontWeight:700, color:A, letterSpacing:"-0.04em" }}>183.4</span>
          <span style={{ fontSize:9, color:SB }}>lbs</span>
          <span style={{ fontSize:9, color:A, marginLeft:4 }}>↓ 0.6</span>
        </div>
      </div>
      {[["Chest","42.0 in","↑ 0.5"],["Waist","31.2 in","↓ 0.3"],["Arms","15.8 in","↑ 0.2"]].map(([name,val,delta]) => (
        <div key={name} style={{ background:S1, borderRadius:7, border:`1px solid ${BD}`, padding:"6px 9px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontSize:9, color:TX }}>{name}</span>
          <div style={{ display:"flex", gap:6, alignItems:"center" }}>
            <span style={{ fontSize:9, fontWeight:600, color:TX }}>{val}</span>
            <span style={{ fontSize:8, color: delta.startsWith("↑") ? A : "#4ECDC4" }}>{delta}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProgressScreen() {
  const bars = [
    { d:"M", h:55, active:false }, { d:"T", h:70, active:false }, { d:"W", h:0, active:false },
    { d:"T", h:62, active:false }, { d:"F", h:80, active:true }, { d:"S", h:0, active:false }, { d:"S", h:0, active:false },
  ];
  return (
    <div style={{ padding:"8px 10px", display:"flex", flexDirection:"column", gap:8 }}>
      <span style={{ fontSize:14, fontWeight:700, color:TX, letterSpacing:"-0.03em" }}>This Week</span>
      <div style={{ display:"flex", gap:5 }}>
        {[["85.2k","Volume"],["4","Sessions"]].map(([v,l]) => (
          <div key={l} style={{ flex:1, background:S1, borderRadius:7, border:`1px solid ${BD}`, padding:"6px 8px" }}>
            <div style={{ fontSize:14, fontWeight:700, color:A }}>{v}</div>
            <div style={{ fontSize:7, color:SB }}>{l}</div>
          </div>
        ))}
      </div>
      {/* Mini bar chart */}
      <div style={{ background:S1, borderRadius:8, border:`1px solid ${BD}`, padding:"8px 10px" }}>
        <div style={{ display:"flex", alignItems:"flex-end", gap:4, height:50 }}>
          {bars.map((b, i) => (
            <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
              <div style={{
                width:"100%", height: b.h > 0 ? `${b.h}%` : 3,
                background: b.active ? A : b.h > 0 ? MT : BD,
                borderRadius:3,
                minHeight: 3,
              }} />
              <span style={{ fontSize:7, color: b.active ? A : SB }}>{b.d}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CoachScreen() {
  const athletes = [
    { name:"Alex M.", weight:"183 lbs", sessions:4, color:"#C8FF00" },
    { name:"Jordan K.", weight:"165 lbs", sessions:5, color:"#4ECDC4" },
    { name:"Sam R.", weight:"198 lbs", sessions:3, color:"#FF8C42" },
  ];
  return (
    <div style={{ padding:"8px 10px", display:"flex", flexDirection:"column", gap:6 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:2 }}>
        <span style={{ fontSize:14, fontWeight:700, color:TX, letterSpacing:"-0.03em" }}>Athletes</span>
        <span style={{ fontSize:9, color:A }}>3 active</span>
      </div>
      {athletes.map(a => (
        <div key={a.name} style={{ background:S1, borderRadius:8, border:`1px solid ${BD}`, padding:"8px 10px", display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:28, height:28, borderRadius:"50%", background:a.color, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <span style={{ fontSize:10, fontWeight:700, color:"#000" }}>{a.name[0]}</span>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:10, fontWeight:600, color:TX }}>{a.name}</div>
            <div style={{ fontSize:8, color:SB }}>{a.weight} · {a.sessions} sessions</div>
          </div>
          <div style={{ width:6, height:6, borderRadius:"50%", background:A }} />
        </div>
      ))}
    </div>
  );
}

// ── PARALLAX HOOK ─────────────────────────────────────────────────────────────
function useParallax(speed = 0.5) {
  const ref = useRef(null);
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      const rect = el.getBoundingClientRect();
      const center = rect.top + rect.height / 2 - window.innerHeight / 2;
      setOffset(center * speed);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [speed]);
  return { ref, offset };
}

// ── SCROLL REVEAL ─────────────────────────────────────────────────────────────
function useReveal(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

function RevealDiv({ children, style = {}, delay = 0 }) {
  const { ref, visible } = useReveal();
  return (
    <div ref={ref} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0)" : "translateY(32px)",
      transition: `opacity 0.7s ease ${delay}s, transform 0.7s ease ${delay}s`,
      ...style,
    }}>
      {children}
    </div>
  );
}

// ── FEATURE CARD ──────────────────────────────────────────────────────────────
function FeatureCard({ icon, title, desc, delay = 0 }) {
  const [hover, setHover] = useState(false);
  return (
    <RevealDiv delay={delay} style={{ flex: "1 1 220px", minWidth: 200 }}>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          background: hover ? S2 : S1,
          border: `1px solid ${hover ? A + "44" : BD}`,
          borderRadius: 16,
          padding: "28px 24px",
          transition: "all 0.3s ease",
          transform: hover ? "translateY(-4px)" : "none",
          boxShadow: hover ? `0 20px 40px rgba(200,255,0,0.06)` : "none",
          height: "100%",
          boxSizing: "border-box",
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 14 }}>{icon}</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: TX, marginBottom: 8, letterSpacing: "-0.02em" }}>{title}</div>
        <div style={{ fontSize: 13, color: SB, lineHeight: 1.7 }}>{desc}</div>
      </div>
    </RevealDiv>
  );
}

// ── STAT COUNTER ──────────────────────────────────────────────────────────────
function StatCounter({ value, label, delay = 0 }) {
  const [count, setCount] = useState(0);
  const { ref, visible } = useReveal(0.3);
  useEffect(() => {
    if (!visible) return;
    let start = 0;
    const end = parseInt(value.replace(/\D/g, ""), 10);
    const duration = 1600;
    const step = Math.ceil(end / (duration / 16));
    const timer = setInterval(() => {
      start = Math.min(start + step, end);
      setCount(start);
      if (start >= end) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [visible, value]);
  const suffix = value.replace(/[\d,]/g, "");
  const formatted = count >= 1000 ? count.toLocaleString() : count;
  return (
    <div ref={ref} style={{
      textAlign: "center",
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0)" : "translateY(20px)",
      transition: `opacity 0.6s ease ${delay}s, transform 0.6s ease ${delay}s`,
    }}>
      <div style={{ fontSize: 48, fontWeight: 700, color: A, letterSpacing: "-0.05em", lineHeight: 1 }}>
        {formatted}{suffix}
      </div>
      <div style={{ fontSize: 13, color: SB, marginTop: 6, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

// ── FLOATING PHONE SECTION ────────────────────────────────────────────────────
function FloatingPhoneSection({ screen, side = "right", title, subtitle, features, accentColor = A, delay = 0 }) {
  const { ref: phoneRef, offset } = useParallax(0.25);
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 60,
      padding: "80px 40px",
      maxWidth: 1100,
      margin: "0 auto",
      flexDirection: side === "right" ? "row" : "row-reverse",
      flexWrap: "wrap",
    }}>
      {/* Text */}
      <div style={{ flex: "1 1 340px", maxWidth: 460 }}>
        <RevealDiv delay={delay}>
          <div style={{ fontSize: 11, color: accentColor, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 16, fontWeight: 600 }}>
            {subtitle}
          </div>
          <h2 style={{
            fontSize: "clamp(28px, 4vw, 42px)",
            fontWeight: 700,
            color: TX,
            margin: "0 0 20px",
            lineHeight: 1.15,
            letterSpacing: "-0.03em",
          }}>{title}</h2>
        </RevealDiv>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {features.map((f, i) => (
            <RevealDiv key={f.title} delay={delay + 0.1 + i * 0.08}>
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: accentColor + "18",
                  border: `1px solid ${accentColor}30`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0, marginTop: 2,
                  fontSize: 16,
                }}>
                  {f.icon}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: TX, marginBottom: 4 }}>{f.title}</div>
                  <div style={{ fontSize: 13, color: SB, lineHeight: 1.65 }}>{f.desc}</div>
                </div>
              </div>
            </RevealDiv>
          ))}
        </div>
      </div>

      {/* Phone */}
      <div ref={phoneRef} style={{
        flex: "0 0 auto",
        transform: `translateY(${offset}px)`,
        transition: "transform 0.05s linear",
        filter: "drop-shadow(0 40px 60px rgba(0,0,0,0.7))",
      }}>
        <div style={{
          position: "relative",
          animation: "floatPhone 4s ease-in-out infinite",
        }}>
          <PhoneMockup screen={screen} />
          {/* Glow under phone */}
          <div style={{
            position: "absolute",
            bottom: -20, left: "50%", transform: "translateX(-50%)",
            width: 140, height: 30,
            background: accentColor,
            borderRadius: "50%",
            filter: "blur(30px)",
            opacity: 0.25,
          }} />
        </div>
      </div>
    </div>
  );
}

// ── NAVBAR ────────────────────────────────────────────────────────────────────
function Navbar({ onGetStarted }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);
  return (
    <nav style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
      padding: "0 40px",
      height: 60,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      background: scrolled ? "rgba(8,8,8,0.92)" : "transparent",
      backdropFilter: scrolled ? "blur(16px)" : "none",
      borderBottom: scrolled ? `1px solid ${BD}` : "1px solid transparent",
      transition: "all 0.3s ease",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <img src="/theryn-logo.svg" alt="Theryn" style={{ width: 32, height: 32, borderRadius: 8, objectFit: "cover" }} />
        <span style={{ fontSize: 18, fontWeight: 700, color: TX, letterSpacing: "-0.03em" }}>theryn</span>
      </div>
      <div style={{ display: "flex", gap: 32, alignItems: "center" }}>
        {["Athletes","Coaches","Features"].map(l => (
          <a
            key={l}
            href={`#${l.toLowerCase()}`}
            style={{ fontSize: 13, color: SB, textDecoration: "none", letterSpacing: "0.02em",
              transition: "color 0.2s", cursor: "pointer" }}
            onMouseEnter={e => e.target.style.color = TX}
            onMouseLeave={e => e.target.style.color = SB}
          >{l}</a>
        ))}
        <button
          onClick={onGetStarted}
          style={{
            background: A, border: "none", borderRadius: 8, color: "#000",
            fontWeight: 700, fontSize: 13, padding: "8px 18px", cursor: "pointer",
            letterSpacing: "0.02em",
          }}
        >
          Get Started
        </button>
      </div>
    </nav>
  );
}

// ── HERO ──────────────────────────────────────────────────────────────────────
function Hero({ onGetStarted }) {
  const { ref: heroRef, offset: heroOffset } = useParallax(0.4);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const fn = (e) => setMousePos({ x: (e.clientX / window.innerWidth - 0.5) * 2, y: (e.clientY / window.innerHeight - 0.5) * 2 });
    window.addEventListener("mousemove", fn);
    return () => window.removeEventListener("mousemove", fn);
  }, []);

  return (
    <section style={{
      position: "relative",
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      background: BG,
    }}>
      {/* Radial glow background */}
      <div style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(ellipse 60% 50% at 50% 30%, rgba(200,255,0,0.07) 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />
      {/* Grid lines */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `linear-gradient(${BD} 1px, transparent 1px), linear-gradient(90deg, ${BD} 1px, transparent 1px)`,
        backgroundSize: "60px 60px",
        opacity: 0.4,
        pointerEvents: "none",
        maskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black 0%, transparent 100%)",
        WebkitMaskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black 0%, transparent 100%)",
      }} />

      {/* Content */}
      <div style={{
        position: "relative", zIndex: 2,
        maxWidth: 1200, width: "100%",
        padding: "100px 40px 60px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 40,
        flexWrap: "wrap",
      }}>
        {/* Left text */}
        <div style={{ flex: "1 1 400px", maxWidth: 560 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: A + "15", border: `1px solid ${A}30`,
            borderRadius: 100, padding: "5px 14px",
            marginBottom: 28,
            animation: "fadeInDown 0.6s ease",
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: A }} />
            <span style={{ fontSize: 12, color: A, fontWeight: 600, letterSpacing: "0.08em" }}>NOW IN BETA · iOS & ANDROID</span>
          </div>

          <h1 style={{
            fontSize: "clamp(36px, 6vw, 72px)",
            fontWeight: 700,
            color: TX,
            margin: "0 0 16px",
            lineHeight: 1.05,
            letterSpacing: "-0.04em",
            animation: "fadeInUp 0.7s ease 0.1s both",
          }}>
            Train Smarter.<br />
            <span style={{ color: A }}>Track Everything.</span><br />
            Dominate.
          </h1>

          <p style={{
            fontSize: 17,
            color: SB,
            lineHeight: 1.7,
            marginBottom: 36,
            maxWidth: 460,
            animation: "fadeInUp 0.7s ease 0.2s both",
          }}>
            Theryn gives athletes and coaches a single platform to log workouts,
            track body composition, monitor progress, and hit personal records — all in real time.
          </p>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", animation: "fadeInUp 0.7s ease 0.3s both" }}>
            <button
              onClick={onGetStarted}
              style={{
                background: A, border: "none", borderRadius: 10, color: "#000",
                fontWeight: 700, fontSize: 15, padding: "13px 28px", cursor: "pointer",
                letterSpacing: "0.01em",
                transition: "transform 0.2s, box-shadow 0.2s",
                boxShadow: `0 0 0 0 ${A}`,
              }}
              onMouseEnter={e => { e.target.style.transform = "scale(1.03)"; e.target.style.boxShadow = `0 8px 30px ${A}40`; }}
              onMouseLeave={e => { e.target.style.transform = "scale(1)"; e.target.style.boxShadow = "none"; }}
            >
              Start Free →
            </button>
            <button
              onClick={onGetStarted}
              style={{
                background: "none", border: `1px solid ${MT}`, borderRadius: 10, color: TX,
                fontWeight: 600, fontSize: 15, padding: "13px 28px", cursor: "pointer",
                transition: "border-color 0.2s",
              }}
              onMouseEnter={e => e.target.style.borderColor = SB}
              onMouseLeave={e => e.target.style.borderColor = MT}
            >
              Watch Demo
            </button>
          </div>

          {/* App store badges */}
          <div style={{ display: "flex", gap: 12, marginTop: 24, animation: "fadeInUp 0.7s ease 0.4s both" }}>
            {["App Store", "Google Play"].map(store => (
              <div key={store} style={{
                display: "flex", alignItems: "center", gap: 8,
                background: S1, border: `1px solid ${BD}`, borderRadius: 8,
                padding: "7px 14px", cursor: "pointer",
              }}>
                <div style={{ fontSize: 18 }}>{store === "App Store" ? "🍎" : "🤖"}</div>
                <div>
                  <div style={{ fontSize: 9, color: SB, letterSpacing: "0.06em" }}>DOWNLOAD ON</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: TX }}>{store}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right — 3 floating phones */}
        <div ref={heroRef} style={{
          flex: "1 1 340px",
          position: "relative",
          height: 520,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: `translateY(${heroOffset}px)`,
          transition: "transform 0.05s linear",
        }}>
          {/* Back phone - body screen */}
          <div style={{
            position: "absolute",
            left: "calc(50% - 160px)",
            top: 40,
            transform: `rotate(-12deg) translate(${mousePos.x * -8}px, ${mousePos.y * -4}px)`,
            transition: "transform 0.15s ease",
            opacity: 0.7,
            animation: "floatPhone 5s ease-in-out infinite 1s",
            zIndex: 1,
          }}>
            <PhoneMockup screen="body" style={{ width: 180, height: 378 }} />
          </div>

          {/* Front phone - log screen (center) */}
          <div style={{
            position: "absolute",
            left: "calc(50% - 110px)",
            top: 0,
            transform: `translate(${mousePos.x * 6}px, ${mousePos.y * 6}px)`,
            transition: "transform 0.15s ease",
            animation: "floatPhone 4s ease-in-out infinite",
            zIndex: 3,
            filter: "drop-shadow(0 30px 60px rgba(0,0,0,0.9))",
          }}>
            <PhoneMockup screen="log" />
            <div style={{
              position: "absolute",
              bottom: -15, left: "50%", transform: "translateX(-50%)",
              width: 120, height: 20,
              background: A,
              borderRadius: "50%",
              filter: "blur(20px)",
              opacity: 0.3,
            }} />
          </div>

          {/* Right phone - progress */}
          <div style={{
            position: "absolute",
            left: "calc(50% + 60px)",
            top: 50,
            transform: `rotate(11deg) translate(${mousePos.x * 8}px, ${mousePos.y * -4}px)`,
            transition: "transform 0.15s ease",
            opacity: 0.7,
            animation: "floatPhone 4.5s ease-in-out infinite 0.5s",
            zIndex: 2,
          }}>
            <PhoneMockup screen="progress" style={{ width: 180, height: 378 }} />
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div style={{
        position: "absolute", bottom: 32, left: "50%", transform: "translateX(-50%)",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
        animation: "bounce 2s ease-in-out infinite",
        cursor: "pointer",
      }} onClick={() => window.scrollTo({ top: window.innerHeight, behavior: "smooth" })}>
        <span style={{ fontSize: 11, color: SB, letterSpacing: "0.1em" }}>SCROLL</span>
        <div style={{ width: 1, height: 24, background: `linear-gradient(${SB}, transparent)` }} />
      </div>
    </section>
  );
}

// ── SOCIAL PROOF TICKER ───────────────────────────────────────────────────────
function Ticker() {
  const items = ["185 lbs Bench Press PR","25,300 lbs Volume Today","Coach added 3 athletes","Squat 315 lbs × 3","Body weight down 0.6 lbs","New PR on Deadlift 405 lbs","Weekly volume up 12%","6 sessions this week"];
  return (
    <div style={{
      overflow: "hidden",
      borderTop: `1px solid ${BD}`,
      borderBottom: `1px solid ${BD}`,
      padding: "12px 0",
      background: S1,
    }}>
      <div style={{
        display: "flex",
        gap: 60,
        animation: "ticker 24s linear infinite",
        width: "max-content",
      }}>
        {[...items, ...items].map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, whiteSpace: "nowrap" }}>
            <div style={{ width: 4, height: 4, borderRadius: "50%", background: A }} />
            <span style={{ fontSize: 12, color: SB, letterSpacing: "0.04em" }}>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── TESTIMONIALS ──────────────────────────────────────────────────────────────
function Testimonials() {
  const quotes = [
    { text: "Theryn changed how I track my progress. The body metrics alone are worth it — I can see exactly what's changing week over week.", name: "Marcus T.", role: "Competitive Powerlifter", color: "#C8FF00" },
    { text: "As a coach, having real-time access to all my athletes' logs means I can adjust programming the same day. No more waiting for check-ins.", name: "Coach Dana L.", role: "Strength & Conditioning", color: "#4ECDC4" },
    { text: "Finally an app that doesn't feel like a spreadsheet. Dark theme, fast, and the PR tracking is addictive.", name: "Ryan K.", role: "CrossFit Athlete", color: "#FF8C42" },
  ];
  return (
    <section style={{ padding: "100px 40px", background: BG }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <RevealDiv>
          <div style={{ textAlign: "center", marginBottom: 60 }}>
            <div style={{ fontSize: 11, color: A, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 12, fontWeight: 600 }}>Testimonials</div>
            <h2 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 700, color: TX, margin: 0, letterSpacing: "-0.03em" }}>
              Built with athletes,<br />refined by coaches.
            </h2>
          </div>
        </RevealDiv>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", justifyContent: "center" }}>
          {quotes.map((q, i) => (
            <RevealDiv key={q.name} delay={i * 0.12} style={{ flex: "1 1 280px", maxWidth: 360 }}>
              <div style={{
                background: S1, border: `1px solid ${BD}`, borderRadius: 16, padding: "28px 24px",
                height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 20,
              }}>
                <div style={{ fontSize: 28, color: q.color, lineHeight: 1 }}>"</div>
                <p style={{ fontSize: 14, color: TX, lineHeight: 1.7, margin: 0, flex: 1 }}>{q.text}</p>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%",
                    background: q.color,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#000" }}>{q.name[0]}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: TX }}>{q.name}</div>
                    <div style={{ fontSize: 11, color: SB }}>{q.role}</div>
                  </div>
                </div>
              </div>
            </RevealDiv>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── MAIN LANDING PAGE ─────────────────────────────────────────────────────────
export default function LandingPage({ onEnterApp }) {
  return (
    <div style={{ background: BG, minHeight: "100vh", fontFamily: "-apple-system, 'Helvetica Neue', Helvetica, sans-serif", WebkitFontSmoothing: "antialiased" }}>
      <style>{`
        @keyframes floatPhone {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-14px); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeInDown {
          from { opacity: 0; transform: translateY(-12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes bounce {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50% { transform: translateX(-50%) translateY(6px); }
        }
        @keyframes ticker {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        * { box-sizing: border-box; }
        html { scroll-behavior: smooth; }
      `}</style>

      <Navbar onGetStarted={onEnterApp} />

      {/* HERO */}
      <Hero onGetStarted={onEnterApp} />

      {/* TICKER */}
      <Ticker />

      {/* STATS */}
      <section style={{ padding: "80px 40px", background: S1, borderTop: `1px solid ${BD}`, borderBottom: `1px solid ${BD}` }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", gap: 40, justifyContent: "space-around", flexWrap: "wrap" }}>
          <StatCounter value="10,000+" label="Athletes Tracked" delay={0} />
          <StatCounter value="500+" label="Coaches Active" delay={0.1} />
          <StatCounter value="2,400,000+" label="Sets Logged" delay={0.2} />
          <StatCounter value="95%" label="Retention Rate" delay={0.3} />
        </div>
      </section>

      {/* FOR ATHLETES */}
      <section id="athletes" style={{ background: BG }}>
        <FloatingPhoneSection
          screen="log"
          side="right"
          title={<>Every rep.<br />Every set.<br /><span style={{ color: A }}>Every PR.</span></>}
          subtitle="For Athletes"
          accentColor={A}
          delay={0}
          features={[
            { icon: "⚡", title: "Instant Workout Logging", desc: "Log sets with weight and reps in seconds. Ghost values remember your last set so you never lose your place." },
            { icon: "📊", title: "Real-Time Volume Tracking", desc: "See your total session volume, set count, and exercise count update live as you train." },
            { icon: "🏆", title: "Personal Records", desc: "Theryn automatically detects and saves your all-time best lifts. Every PR is permanent." },
            { icon: "📐", title: "Body Composition", desc: "Track weight and 9+ body measurements with per-entry delta indicators so you always know the trend." },
          ]}
        />
      </section>

      {/* FOR COACHES */}
      <section id="coaches" style={{ background: S1, borderTop: `1px solid ${BD}`, borderBottom: `1px solid ${BD}` }}>
        <FloatingPhoneSection
          screen="coach"
          side="left"
          title={<>Your athletes.<br /><span style={{ color: "#4ECDC4" }}>Your vision.</span><br />One dashboard.</>}
          subtitle="For Coaches"
          accentColor="#4ECDC4"
          delay={0}
          features={[
            { icon: "👥", title: "Multi-Athlete Dashboard", desc: "See all your athletes in one place — their weights, session counts, and weekly volume at a glance." },
            { icon: "🔗", title: "Invite System", desc: "Athletes join via your unique invite code. Accept or decline requests to control your roster." },
            { icon: "📈", title: "Progress Monitoring", desc: "Review any athlete's full history — body weight trends, measurement changes, and workout logs." },
            { icon: "🎯", title: "Program Alignment", desc: "Athletes follow routines you review. Real data, not self-reported check-ins — see what's actually happening." },
          ]}
        />
      </section>

      {/* FEATURES GRID */}
      <section id="features" style={{ padding: "100px 40px", background: BG }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <RevealDiv style={{ textAlign: "center", marginBottom: 60 }}>
            <div style={{ fontSize: 11, color: A, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 12, fontWeight: 600 }}>Platform Power</div>
            <h2 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 700, color: TX, margin: "0 0 16px", letterSpacing: "-0.03em" }}>
              Everything you need.<br />Nothing you don't.
            </h2>
            <p style={{ fontSize: 16, color: SB, maxWidth: 480, margin: "0 auto", lineHeight: 1.7 }}>
              Theryn is purpose-built for the gym. Every feature exists for one reason: to make you better.
            </p>
          </RevealDiv>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <FeatureCard icon="📅" title="Weekly Routine Builder" desc="Design your 7-day training split with push, pull, legs, cardio, and 10+ workout types. Your template loads automatically each day." delay={0} />
            <FeatureCard icon="📉" title="Body Weight Trends" desc="Log daily weigh-ins and see lime/red delta indicators. Your 30-day trajectory is always visible." delay={0.07} />
            <FeatureCard icon="💪" title="15+ Workout Types" desc="Push, Pull, Legs, HIIT, Cardio, Swim, Yoga, and more — each with type-specific color coding and default exercises." delay={0.14} />
            <FeatureCard icon="🔢" title="Volume Analytics" desc="Weekly volume bar chart with daily breakdown. Know your hardest training day, your rest patterns, and your output trend." delay={0.21} />
            <FeatureCard icon="🌗" title="Dark by Default" desc="Designed from the ground up for dim gyms and late-night sessions. High-contrast, near-black UI. Zero eye strain." delay={0.28} />
            <FeatureCard icon="📱" title="iOS & Android Native" desc="Built with Capacitor for a true native feel. Offline-ready, fast, and optimized for one-thumb use during your workout." delay={0.35} />
          </div>
        </div>
      </section>

      {/* PROGRESS PHONE + VISUAL */}
      <section style={{ background: S1, borderTop: `1px solid ${BD}`, borderBottom: `1px solid ${BD}` }}>
        <FloatingPhoneSection
          screen="progress"
          side="right"
          title={<>One week.<br /><span style={{ color: "#FFD166" }}>Full picture.</span></>}
          subtitle="Weekly Analytics"
          accentColor="#FFD166"
          delay={0}
          features={[
            { icon: "📊", title: "Daily Volume Bars", desc: "Visual bar chart of your weekly output — instantly see which days you trained hard and which you took off." },
            { icon: "🥇", title: "Best Lifts This Week", desc: "Your top performances across all exercises for the current week, highlighted automatically." },
            { icon: "🔄", title: "Sessions vs. Plan", desc: "See how many of your 7 planned sessions you've completed. Keep your consistency streak alive." },
          ]}
        />
      </section>

      {/* TESTIMONIALS */}
      <Testimonials />

      {/* CTA */}
      <section style={{
        padding: "120px 40px",
        background: BG,
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", inset: 0,
          background: `radial-gradient(ellipse 60% 60% at 50% 50%, rgba(200,255,0,0.06) 0%, transparent 70%)`,
          pointerEvents: "none",
        }} />
        <RevealDiv style={{ position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: 11, color: A, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 20, fontWeight: 600 }}>
            Get Started Today
          </div>
          <h2 style={{
            fontSize: "clamp(32px, 5vw, 64px)",
            fontWeight: 700, color: TX,
            margin: "0 0 20px",
            letterSpacing: "-0.04em",
            lineHeight: 1.1,
          }}>
            Your next PR is<br />
            <span style={{ color: A }}>one session away.</span>
          </h2>
          <p style={{ fontSize: 17, color: SB, maxWidth: 440, margin: "0 auto 40px", lineHeight: 1.7 }}>
            Join athletes and coaches already using Theryn to train with purpose and track what matters.
          </p>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={onEnterApp}
              style={{
                background: A, border: "none", borderRadius: 12,
                color: "#000", fontWeight: 700, fontSize: 16,
                padding: "15px 36px", cursor: "pointer",
                letterSpacing: "0.01em",
                transition: "transform 0.2s, box-shadow 0.2s",
              }}
              onMouseEnter={e => { e.target.style.transform = "scale(1.04)"; e.target.style.boxShadow = `0 12px 40px ${A}50`; }}
              onMouseLeave={e => { e.target.style.transform = "scale(1)"; e.target.style.boxShadow = "none"; }}
            >
              Start Training Free →
            </button>
            <button
              onClick={onEnterApp}
              style={{
                background: "none", border: `1px solid ${MT}`, borderRadius: 12,
                color: TX, fontWeight: 600, fontSize: 16,
                padding: "15px 36px", cursor: "pointer",
                transition: "border-color 0.2s",
              }}
              onMouseEnter={e => e.target.style.borderColor = SB}
              onMouseLeave={e => e.target.style.borderColor = MT}
            >
              I'm a Coach →
            </button>
          </div>
          <div style={{ marginTop: 48, display: "flex", gap: 32, justifyContent: "center", flexWrap: "wrap" }}>
            {["Free to start","iOS & Android","No credit card","Cancel anytime"].map(tag => (
              <div key={tag} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 4, height: 4, borderRadius: "50%", background: A }} />
                <span style={{ fontSize: 12, color: SB }}>{tag}</span>
              </div>
            ))}
          </div>
        </RevealDiv>
      </section>

      {/* FOOTER */}
      <footer style={{
        borderTop: `1px solid ${BD}`,
        padding: "40px 40px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 20,
        background: S1,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/theryn-logo.svg" alt="Theryn" style={{ width: 28, height: 28, borderRadius: 6, objectFit: "cover" }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: TX, letterSpacing: "-0.02em" }}>theryn</span>
        </div>
        <div style={{ display: "flex", gap: 28 }}>
          {["Privacy","Terms","Support","Contact"].map(l => (
            <span key={l} style={{ fontSize: 12, color: SB, cursor: "pointer", transition: "color 0.2s" }}
              onMouseEnter={e => e.target.style.color = TX}
              onMouseLeave={e => e.target.style.color = SB}>{l}</span>
          ))}
        </div>
        <span style={{ fontSize: 12, color: MT }}>© 2026 Theryn. All rights reserved.</span>
      </footer>
    </div>
  );
}
