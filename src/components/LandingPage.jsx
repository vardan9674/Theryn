import { useEffect, useRef, useState } from "react";

const A   = "#C8FF00";
const AT  = "#4ECDC4";
const AW  = "#FFD166";
const BG  = "#080808";
const S1  = "#101010";
const S2  = "#181818";
const BD  = "#1E1E1E";
const TX  = "#F5F6F8";
const SB  = "#A8AEB7";
const SB2 = "#D0D4DA";
const MT  = "#2C2C2C";
const RED = "#FF5C5C";

// Workout-type colors — mirrors TYPE_COLORS in App.jsx so the landing page
// speaks the same visual language as the real app.
const TYPE_COLORS = {
  Push:      "#FF8C42",
  Pull:      "#4ECDC4",
  Legs:      "#A8E6CF",
  Upper:     "#C77DFF",
  Lower:     "#FFD166",
  "Full Body": "#C8FF00",
  Cardio:    "#06D6A0",
  Core:      "#FFD166",
  Run:       "#06D6A0",
  Swim:      "#4ECDC4",
  Bike:      "#FFD166",
  HIIT:      "#FF8C42",
  Yoga:      "#C77DFF",
  Rest:      "#A8AEB7",
};

// Render an athlete's "last session" line with the workout type colored —
// "Push Day · today" → "Push" in Push-orange, " Day · today" in secondary.
function SessionLabel({ text, fontSize = 11, warn = false }) {
  const m = text.match(/^([A-Za-z ]+?)(\s?Day)?(\s·\s.+)$/);
  if (!m) return <span style={{ fontSize, color: warn ? TYPE_COLORS.Push : SB }}>{text}</span>;
  const typeKey = m[1].trim();
  const color = TYPE_COLORS[typeKey] || (warn ? TYPE_COLORS.Push : SB);
  return (
    <span style={{ fontSize, color: warn ? TYPE_COLORS.Push : SB }}>
      <span style={{ color, fontWeight: 600 }}>{typeKey}</span>
      {m[2] || ""}{m[3]}
    </span>
  );
}

// ── PHONE MOCKUP ─────────────────────────────────────────────────────────────
function StatusBar({ platform }) {
  const isIOS = platform === "ios";
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: isIOS ? "6px 18px 3px 18px" : "6px 12px 3px 12px",
      height: 22,
      fontSize: 9.5, color: TX, fontWeight: 600,
      letterSpacing: "-0.01em",
      position: "relative",
      zIndex: 5,
    }}>
      <span style={{ minWidth: 26, textAlign: "left" }}>9:41</span>
      <div style={{ display:"flex", gap:5, alignItems:"center" }}>
        {/* cell bars */}
        <div style={{ display:"flex", gap:1.2, alignItems:"flex-end" }}>
          {[3,5,7,9].map((h,i) => (
            <div key={i} style={{ width:2, height:h, background:TX, borderRadius:0.5 }} />
          ))}
        </div>
        {/* wifi arc */}
        <svg width="11" height="8" viewBox="0 0 11 8" fill="none">
          <path d="M5.5 7.5 L7 5.5 A2 2 0 0 0 4 5.5 Z" fill={TX}/>
          <path d="M1 3 A6 6 0 0 1 10 3" stroke={TX} strokeWidth="1.2" fill="none" opacity="0.85"/>
        </svg>
        {/* battery */}
        <div style={{ width:17, height:8, border:`1px solid ${TX}`, borderRadius:2.5, padding:1, boxSizing:"border-box", position:"relative", display:"flex" }}>
          <div style={{ width:"72%", height:"100%", background:TX, borderRadius:1 }}/>
          <div style={{ position:"absolute", right:-2.5, top:2, width:1.4, height:3, background:TX, borderRadius:"0 1px 1px 0" }}/>
        </div>
      </div>
    </div>
  );
}

function HomeIndicator({ platform }) {
  const isIOS = platform === "ios";
  return (
    <div style={{ display:"flex", justifyContent:"center", padding: isIOS ? "4px 0 7px" : "5px 0 7px" }}>
      <div style={{
        width: isIOS ? 92 : 78,
        height: isIOS ? 4 : 3,
        borderRadius: 3,
        background: TX,
        opacity: isIOS ? 0.7 : 0.55,
      }} />
    </div>
  );
}

function PhoneMockup({ screen = "log", platform = "ios", style = {} }) {
  const screens = {
    log: <LogScreen />,
    body: <BodyScreen />,
    progress: <ProgressScreen />,
    coach: <CoachScreen />,
  };
  const isIOS = platform === "ios";
  const outerRadius = isIOS ? 42 : 30;
  const innerRadius = isIOS ? 36 : 24;

  return (
    <div style={{
      position: "relative",
      width: 220,
      height: 460,
      ...style,
    }}>
      {/* Titanium / aluminum rim */}
      <div style={{
        position: "absolute", inset: 0,
        background: isIOS
          ? "linear-gradient(145deg, #3a3a3c 0%, #1a1a1c 48%, #0a0a0c 100%)"
          : "linear-gradient(145deg, #2a2a2e 0%, #141416 52%, #060608 100%)",
        borderRadius: outerRadius,
        boxShadow: "0 40px 80px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 1px rgba(0,0,0,0.6)",
        padding: isIOS ? 3 : 4,
      }}>
        {/* Side buttons */}
        {isIOS ? (
          <>
            {/* action button (iPhone 15 Pro+) */}
            <div style={{ position:"absolute", left:-2, top:78, width:3, height:22, background:"linear-gradient(90deg,#1a1a1a,#2a2a2c)", borderRadius:"2px 0 0 2px" }} />
            {/* volume up */}
            <div style={{ position:"absolute", left:-2, top:116, width:3, height:40, background:"linear-gradient(90deg,#1a1a1a,#2a2a2c)", borderRadius:"2px 0 0 2px" }} />
            {/* volume down */}
            <div style={{ position:"absolute", left:-2, top:164, width:3, height:40, background:"linear-gradient(90deg,#1a1a1a,#2a2a2c)", borderRadius:"2px 0 0 2px" }} />
            {/* power / side button */}
            <div style={{ position:"absolute", right:-2, top:130, width:3, height:64, background:"linear-gradient(270deg,#1a1a1a,#2a2a2c)", borderRadius:"0 2px 2px 0" }} />
          </>
        ) : (
          <>
            {/* volume rocker */}
            <div style={{ position:"absolute", right:-2, top:108, width:3, height:52, background:"linear-gradient(270deg,#0c0c0c,#242426)", borderRadius:"0 2px 2px 0" }} />
            {/* power button (lower, typical Android layout) */}
            <div style={{ position:"absolute", right:-2, top:170, width:3, height:36, background:"linear-gradient(270deg,#0c0c0c,#242426)", borderRadius:"0 2px 2px 0" }} />
          </>
        )}

        {/* Inner display */}
        <div style={{
          position: "absolute", inset: isIOS ? 3 : 4,
          background: BG,
          borderRadius: innerRadius,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}>
          {/* Notch / island / punch-hole */}
          {isIOS ? (
            <div style={{
              position: "absolute", top: 7, left: "50%", transform: "translateX(-50%)",
              width: 78, height: 22,
              background: "#000",
              borderRadius: 14,
              zIndex: 10,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "0 9px",
              boxShadow: "inset 0 0 0 1px #0a0a0a",
            }}>
              {/* face id sensor */}
              <div style={{ width:5, height:5, borderRadius:"50%", background:"#101012", border:"1px solid #1a1a1c" }} />
              {/* front camera */}
              <div style={{ width:7, height:7, borderRadius:"50%", background:"#07070a", border:"1px solid #1a1a1c", position:"relative" }}>
                <div style={{ position:"absolute", top:1, left:1.5, width:2, height:2, borderRadius:"50%", background:"#1e3a5a" }} />
              </div>
            </div>
          ) : (
            <div style={{
              position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)",
              width: 11, height: 11,
              background: "#000",
              borderRadius: "50%",
              zIndex: 10,
              boxShadow: "inset 0 0 0 1.5px #0a0a0a, 0 0 0 1px rgba(0,0,0,0.6)",
            }}>
              <div style={{ position:"absolute", top:2.5, left:3, width:3, height:3, borderRadius:"50%", background:"#142238" }} />
            </div>
          )}

          <StatusBar platform={platform} />

          <div style={{ flex:1, overflow:"hidden" }}>
            {screens[screen]}
          </div>

          <PhoneTabBar />
          <HomeIndicator platform={platform} />
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
        <span style={{ fontSize:14, fontWeight:700, letterSpacing:"-0.03em" }}>
          <span style={{ color: TYPE_COLORS.Push }}>Push</span>
          <span style={{ color: TX }}> Day</span>
        </span>
        <span style={{ fontSize:8, background:TYPE_COLORS.Push, color:"#000", borderRadius:3, padding:"1px 5px", fontWeight:700, letterSpacing:"0.06em" }}>TODAY</span>
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

// ── DESKTOP / LAPTOP COACH DASHBOARD MOCKUP ──────────────────────────────────
// Mirrors the real coach app: tabs (Athletes, Routines, Body, Progress, Payments),
// a big invite code, a "Needs Attention" card, and an athlete list with streaks.
function DesktopMockup({ style = {} }) {
  const roster = [
    { name: "Alex Mercer",   last: "Push Day · today",       streak: 6, color: A },
    { name: "Jordan Kim",    last: "Upper · yesterday",      streak: 4, color: AT },
    { name: "Sam Rivera",    last: "Pull · 5 days ago",      streak: 0, color: "#FF8C42" },
    { name: "Maya Chen",     last: "Legs · today",           streak: 9, color: "#B580FF" },
    { name: "Devon Wright",  last: "Full Body · 2 days ago", streak: 3, color: AW },
  ];
  const tabs = [
    ["Athletes",  true],
    ["Routines",  false],
    ["Body",      false],
    ["Progress",  false],
    ["Payments",  false],
  ];
  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 960, ...style }}>
      {/* Laptop frame */}
      <div style={{
        background: "linear-gradient(145deg, #1a1a1a 0%, #0c0c0c 100%)",
        borderRadius: "14px 14px 4px 4px",
        padding: "14px 14px 22px",
        border: "1px solid #262626",
        boxShadow: "0 40px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
      }}>
        {/* Browser / app top bar */}
        <div style={{
          background: S1,
          borderRadius: "8px 8px 0 0",
          borderBottom: `1px solid ${BD}`,
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 14px",
        }}>
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#FF5F57" }} />
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#FEBC2E" }} />
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#28C840" }} />
          </div>
          <div style={{
            flex: 1, marginLeft: 14,
            background: BG, border: `1px solid ${BD}`, borderRadius: 6,
            padding: "4px 10px",
            fontSize: 11, color: SB,
            letterSpacing: "0.02em",
          }}>
            theryn.fit
          </div>
          <div style={{ width: 22, height: 22, borderRadius: "50%", background: A, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#000" }}>D</div>
        </div>

        {/* App body */}
        <div style={{ background: BG, borderRadius: "0 0 8px 8px", display: "flex", minHeight: 440 }}>
          {/* Sidebar — matches real COACH_TABS */}
          <div style={{ width: 176, borderRight: `1px solid ${BD}`, padding: "18px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, background: A }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: TX, letterSpacing: "-0.02em" }}>theryn</span>
            </div>
            {tabs.map(([l, active]) => (
              <div key={l} style={{
                fontSize: 12,
                color: active ? TX : SB,
                background: active ? S1 : "transparent",
                border: active ? `1px solid ${BD}` : "1px solid transparent",
                borderRadius: 6,
                padding: "7px 10px",
                fontWeight: active ? 600 : 400,
                letterSpacing: "0.02em",
              }}>{l}</div>
            ))}

            {/* Invite code card — real feature */}
            <div style={{ marginTop: "auto", padding: "12px 12px", background: S1, borderRadius: 10, border: `1px solid ${BD}` }}>
              <div style={{ fontSize: 9, color: SB, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Your invite code</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: A, letterSpacing: "0.16em" }}>K7M4NP</div>
              <div style={{ fontSize: 10, color: SB, marginTop: 4 }}>Share to connect athletes</div>
            </div>
          </div>

          {/* Main — Athletes tab */}
          <div style={{ flex: 1, padding: "18px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: TX, letterSpacing: "-0.03em" }}>My Athletes</div>
              <div style={{ fontSize: 12, color: SB, marginTop: 2 }}>5 athletes</div>
            </div>

            {/* Needs Attention — real feature (from coachInsights signals) */}
            <div style={{ background: S2, border: `1px solid ${MT}`, borderRadius: 14, overflow: "hidden" }}>
              <div style={{
                padding: "10px 14px",
                borderBottom: `1px solid ${MT}`,
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: AW, letterSpacing: "0.1em" }}>NEEDS ATTENTION</span>
                <span style={{ fontSize: 10, color: SB }}>1 of 5</span>
              </div>
              <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%", background: "#FF8C42",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 800, color: "#000",
                }}>S</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: TX }}>Sam Rivera</div>
                  <div style={{ fontSize: 11, color: "#FF8C42" }}>No session logged in 5 days · volume ↓ 42%</div>
                </div>
                <div style={{
                  fontSize: 10, padding: "3px 9px", borderRadius: 100, fontWeight: 700,
                  background: "#FF8C4222", color: "#FF8C42", border: `1px solid #FF8C4244`,
                }}>URGENT</div>
              </div>
            </div>

            {/* Athlete cards list — matches real list layout */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {roster.map(r => (
                <div key={r.name} style={{
                  background: S1, border: `1px solid ${BD}`, borderRadius: 12,
                  padding: "12px 14px",
                  display: "flex", alignItems: "center", gap: 12,
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%", background: r.color,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 800, color: "#000",
                  }}>{r.name[0]}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: TX }}>{r.name}</div>
                    <SessionLabel text={r.last} fontSize={11} />
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: r.streak > 0 ? A : SB, letterSpacing: "-0.02em" }}>
                      {r.streak > 0 ? `🔥 ${r.streak}` : "—"}
                    </div>
                    <div style={{ fontSize: 9, color: SB, letterSpacing: "0.06em", textTransform: "uppercase" }}>Streak</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Laptop base */}
      <div style={{
        margin: "0 -4%",
        height: 14,
        background: "linear-gradient(180deg, #242424 0%, #0e0e0e 100%)",
        borderRadius: "0 0 20px 20px",
        boxShadow: "0 18px 30px rgba(0,0,0,0.6)",
      }}>
        <div style={{ width: 80, height: 6, margin: "0 auto", background: "#050505", borderRadius: "0 0 8px 8px" }} />
      </div>
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
    <RevealDiv delay={delay} style={{ height: "100%" }}>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          background: hover ? S2 : S1,
          border: `1px solid ${hover ? A + "44" : BD}`,
          borderRadius: 16,
          padding: "28px 26px",
          transition: "all 0.3s ease",
          transform: hover ? "translateY(-4px)" : "none",
          boxShadow: hover ? `0 20px 40px rgba(200,255,0,0.06)` : "none",
          height: "100%",
          boxSizing: "border-box",
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 14 }}>{icon}</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: TX, marginBottom: 8, letterSpacing: "-0.02em" }}>{title}</div>
        <div style={{ fontSize: 13.5, color: SB, lineHeight: 1.7 }}>{desc}</div>
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
      <div style={{ fontSize: "clamp(36px, 4.2vw, 56px)", fontWeight: 700, color: A, letterSpacing: "-0.05em", lineHeight: 1 }}>
        {formatted}{suffix}
      </div>
      <div style={{ fontSize: 12, color: SB, marginTop: 8, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

// ── FLOATING PHONE SECTION ────────────────────────────────────────────────────
function FloatingPhoneSection({ screen, platform = "ios", side = "right", title, subtitle, features, accentColor = A, delay = 0 }) {
  const { ref: phoneRef, offset } = useParallax(0.25);
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 80,
      padding: "120px 48px",
      maxWidth: 1240,
      margin: "0 auto",
      flexDirection: side === "right" ? "row" : "row-reverse",
      flexWrap: "wrap",
    }}>
      <div style={{ flex: "1 1 360px", maxWidth: 500 }}>
        <RevealDiv delay={delay}>
          <div style={{ fontSize: 11, color: accentColor, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 16, fontWeight: 600 }}>
            {subtitle}
          </div>
          <h2 style={{
            fontSize: "clamp(30px, 4.4vw, 52px)",
            fontWeight: 700,
            color: TX,
            margin: "0 0 24px",
            lineHeight: 1.1,
            letterSpacing: "-0.035em",
          }}>{title}</h2>
        </RevealDiv>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {features.map((f, i) => (
            <RevealDiv key={f.title} delay={delay + 0.1 + i * 0.08}>
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  background: accentColor + "18",
                  border: `1px solid ${accentColor}30`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0, marginTop: 2,
                  fontSize: 17,
                }}>
                  {f.icon}
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: TX, marginBottom: 4 }}>{f.title}</div>
                  <div style={{ fontSize: 13.5, color: SB, lineHeight: 1.65 }}>{f.desc}</div>
                </div>
              </div>
            </RevealDiv>
          ))}
        </div>
      </div>

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
          <PhoneMockup screen={screen} platform={platform} />
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
      padding: "0 clamp(20px, 4vw, 48px)",
      height: 64,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      background: scrolled ? "rgba(8,8,8,0.88)" : "transparent",
      backdropFilter: scrolled ? "blur(18px) saturate(120%)" : "none",
      WebkitBackdropFilter: scrolled ? "blur(18px) saturate(120%)" : "none",
      borderBottom: scrolled ? `1px solid ${BD}` : "1px solid transparent",
      transition: "all 0.3s ease",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <img src="/theryn-logo.svg" alt="Theryn" style={{ width: 32, height: 32, borderRadius: 8, objectFit: "cover" }} />
        <span style={{ fontSize: 18, fontWeight: 700, color: TX, letterSpacing: "-0.03em" }}>theryn</span>
      </div>
      <div className="theryn-nav-links" style={{ display: "flex", gap: 32, alignItems: "center" }}>
        {[["Coaches","coaches"],["Athletes","athletes"],["Features","features"],["Pricing","cta"]].map(([l, id]) => (
          <a
            key={l}
            href={`#${id}`}
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
            fontWeight: 700, fontSize: 13, padding: "9px 18px", cursor: "pointer",
            letterSpacing: "0.01em",
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
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const { ref: mockupRef, offset: mockupOffset } = useParallax(0.15);

  useEffect(() => {
    const fn = (e) => setMousePos({
      x: (e.clientX / window.innerWidth - 0.5) * 2,
      y: (e.clientY / window.innerHeight - 0.5) * 2,
    });
    window.addEventListener("mousemove", fn);
    return () => window.removeEventListener("mousemove", fn);
  }, []);

  return (
    <section style={{
      position: "relative",
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      background: BG,
      paddingTop: 100,
      paddingBottom: 60,
    }}>
      {/* Aurora glows */}
      <div style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(ellipse 55% 45% at 50% 22%, rgba(200,255,0,0.09) 0%, transparent 70%), radial-gradient(ellipse 40% 40% at 85% 50%, rgba(78,205,196,0.05) 0%, transparent 60%), radial-gradient(ellipse 40% 40% at 10% 70%, rgba(181,128,255,0.04) 0%, transparent 60%)`,
        pointerEvents: "none",
      }} />
      {/* Grid lines */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `linear-gradient(${BD} 1px, transparent 1px), linear-gradient(90deg, ${BD} 1px, transparent 1px)`,
        backgroundSize: "64px 64px",
        opacity: 0.35,
        pointerEvents: "none",
        maskImage: "radial-gradient(ellipse 85% 80% at 50% 50%, black 0%, transparent 100%)",
        WebkitMaskImage: "radial-gradient(ellipse 85% 80% at 50% 50%, black 0%, transparent 100%)",
      }} />

      {/* Headline block */}
      <div style={{
        position: "relative", zIndex: 2,
        maxWidth: 1040, width: "100%",
        padding: "40px clamp(20px, 4vw, 48px) 40px",
        textAlign: "center",
      }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: A + "15", border: `1px solid ${A}30`,
          borderRadius: 100, padding: "5px 14px",
          marginBottom: 28,
          animation: "fadeInDown 0.6s ease",
        }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: A }} />
          <span style={{ fontSize: 11, color: A, fontWeight: 600, letterSpacing: "0.12em" }}>BUILT FOR COACHES · NOW IN BETA</span>
        </div>

        <h1 style={{
          fontSize: "clamp(44px, 8vw, 104px)",
          fontWeight: 700,
          color: TX,
          margin: "0 0 24px",
          lineHeight: 0.98,
          letterSpacing: "-0.045em",
          animation: "fadeInUp 0.7s ease 0.1s both",
        }}>
          Coaching,<br />
          <span style={{
            background: `linear-gradient(120deg, ${A} 0%, ${AT} 100%)`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>without the chaos.</span>
        </h1>

        <p style={{
          fontSize: "clamp(15px, 1.35vw, 19px)",
          color: SB2,
          lineHeight: 1.65,
          margin: "0 auto 40px",
          maxWidth: 640,
          animation: "fadeInUp 0.7s ease 0.2s both",
        }}>
          No more spreadsheets. No more scattered notes. No more "what did Jordan squat last week?"
          Theryn turns your messy client life into one organized system — so you can coach,
          not chase.
        </p>

        <div style={{
          display: "flex", gap: 12, flexWrap: "wrap",
          justifyContent: "center",
          animation: "fadeInUp 0.7s ease 0.3s both",
          marginBottom: 20,
        }}>
          <button
            onClick={onGetStarted}
            style={{
              background: A, border: "none", borderRadius: 10, color: "#000",
              fontWeight: 700, fontSize: 15, padding: "14px 30px", cursor: "pointer",
              letterSpacing: "0.01em",
              transition: "transform 0.2s, box-shadow 0.2s",
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.03)"; e.currentTarget.style.boxShadow = `0 8px 32px ${A}40`; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "none"; }}
          >
            Start Free →
          </button>
          <a
            href="#coaches"
            style={{
              background: "none", border: `1px solid ${MT}`, borderRadius: 10, color: TX,
              fontWeight: 600, fontSize: 15, padding: "14px 30px", cursor: "pointer",
              transition: "border-color 0.2s",
              textDecoration: "none",
              display: "inline-flex", alignItems: "center",
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = SB}
            onMouseLeave={e => e.currentTarget.style.borderColor = MT}
          >
            See how it works
          </a>
        </div>

        <div style={{
          display: "flex", gap: 24, flexWrap: "wrap",
          justifyContent: "center",
          marginTop: 20,
          animation: "fadeInUp 0.7s ease 0.4s both",
        }}>
          {["No spreadsheets","Free to start","iOS, Android & Web","Cancel anytime"].map(tag => (
            <div key={tag} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: A }} />
              <span style={{ fontSize: 12, color: SB }}>{tag}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Hero device — desktop dashboard with floating phones */}
      <div ref={mockupRef} style={{
        position: "relative",
        width: "100%",
        maxWidth: 1240,
        padding: "40px clamp(20px, 4vw, 48px) 20px",
        zIndex: 2,
        transform: `translateY(${mockupOffset * -0.4}px)`,
        animation: "fadeInUp 0.9s ease 0.5s both",
      }}>
        <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
          <div style={{
            transform: `perspective(1400px) rotateX(${6 + mousePos.y * 1.5}deg) rotateY(${mousePos.x * -1.5}deg)`,
            transition: "transform 0.2s ease",
            width: "100%",
            maxWidth: 960,
            filter: "drop-shadow(0 60px 80px rgba(0,0,0,0.6))",
          }}>
            <DesktopMockup />
          </div>

          {/* Floating phone — right */}
          <div className="theryn-hero-phone-right" style={{
            position: "absolute",
            right: "clamp(-40px, -2vw, 0px)",
            bottom: "-40px",
            transform: `rotate(6deg) translate(${mousePos.x * 10}px, ${mousePos.y * 6}px)`,
            transition: "transform 0.2s ease",
            animation: "floatPhone 5s ease-in-out infinite 0.5s",
            filter: "drop-shadow(0 30px 50px rgba(0,0,0,0.8))",
            zIndex: 3,
          }}>
            <PhoneMockup screen="coach" platform="android" style={{ width: 180, height: 378 }} />
          </div>

          {/* Floating phone — left */}
          <div className="theryn-hero-phone-left" style={{
            position: "absolute",
            left: "clamp(-40px, -2vw, 0px)",
            bottom: "-60px",
            transform: `rotate(-8deg) translate(${mousePos.x * -8}px, ${mousePos.y * 4}px)`,
            transition: "transform 0.2s ease",
            animation: "floatPhone 6s ease-in-out infinite 1s",
            filter: "drop-shadow(0 30px 50px rgba(0,0,0,0.8))",
            zIndex: 3,
            opacity: 0.95,
          }}>
            <PhoneMockup screen="log" platform="ios" style={{ width: 160, height: 336 }} />
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div style={{
        position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
        animation: "bounce 2s ease-in-out infinite",
        cursor: "pointer",
        zIndex: 4,
      }} onClick={() => window.scrollTo({ top: window.innerHeight, behavior: "smooth" })}>
        <span style={{ fontSize: 11, color: SB, letterSpacing: "0.14em" }}>SCROLL</span>
        <div style={{ width: 1, height: 20, background: `linear-gradient(${SB}, transparent)` }} />
      </div>
    </section>
  );
}

// ── CHAOS → CLARITY ──────────────────────────────────────────────────────────
function ChaosToClarity() {
  const chaosItems = [
    { label: "athletes_v4_FINAL_final.xlsx", rot: -6, x: "4%", y: "6%", color: "#1e6f41" },
    { label: "IMG_2847.jpg · form check", rot: 5, x: "58%", y: "3%", color: "#555" },
    { label: "WhatsApp — Jordan (17)", rot: -3, x: "44%", y: "28%", color: "#1a5a3a" },
    { label: "Google Sheets · Macros", rot: 8, x: "8%", y: "40%", color: "#1e5e3f" },
    { label: "Notes.app · Sam's PR's", rot: -7, x: "62%", y: "48%", color: "#635a1a" },
    { label: "DM · Alex new plan?", rot: 4, x: "22%", y: "68%", color: "#3a3a3a" },
    { label: "Calendar · 3 conflicts", rot: -2, x: "54%", y: "72%", color: "#5a1a1a" },
  ];
  return (
    <section style={{
      padding: "140px clamp(20px, 4vw, 48px)",
      background: `linear-gradient(180deg, ${BG} 0%, ${S1} 50%, ${BG} 100%)`,
      borderTop: `1px solid ${BD}`,
      borderBottom: `1px solid ${BD}`,
    }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <RevealDiv style={{ textAlign: "center", marginBottom: 80 }}>
          <div style={{ fontSize: 11, color: A, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 14, fontWeight: 600 }}>
            The Transformation
          </div>
          <h2 style={{
            fontSize: "clamp(32px, 5vw, 64px)",
            fontWeight: 700,
            color: TX,
            margin: "0 0 20px",
            letterSpacing: "-0.04em",
            lineHeight: 1.05,
          }}>
            From 47 tabs open<br />
            to <span style={{
              background: `linear-gradient(120deg, ${A} 0%, ${AT} 100%)`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>one organized system.</span>
          </h2>
          <p style={{
            fontSize: 17,
            color: SB,
            lineHeight: 1.7,
            maxWidth: 640,
            margin: "0 auto",
          }}>
            Every coach starts the same way: spreadsheets, screenshots, WhatsApp threads,
            and a notes app held together with vibes. Theryn replaces all of it.
          </p>
        </RevealDiv>

        <div className="theryn-chaos-grid" style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          gap: 32,
        }}>
          {/* LEFT — Chaos */}
          <RevealDiv>
            <div style={{
              position: "relative",
              height: 440,
              background: "linear-gradient(145deg, #0d0d0d 0%, #070707 100%)",
              border: `1px solid ${BD}`,
              borderRadius: 20,
              overflow: "hidden",
              padding: 20,
            }}>
              <div style={{
                position: "absolute", top: 16, left: 20,
                fontSize: 10, color: SB, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600,
                zIndex: 20,
              }}>Before · The Chaos</div>
              {chaosItems.map((it, i) => (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    left: it.x,
                    top: it.y,
                    transform: `rotate(${it.rot}deg)`,
                    background: S2,
                    border: `1px solid ${MT}`,
                    borderLeft: `3px solid ${it.color}`,
                    borderRadius: 6,
                    padding: "10px 14px",
                    fontSize: 11,
                    color: "#888",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    letterSpacing: "-0.01em",
                    boxShadow: "0 10px 22px rgba(0,0,0,0.5)",
                    whiteSpace: "nowrap",
                    maxWidth: "90%",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {it.label}
                </div>
              ))}
              {/* Chaotic scribbles overlay */}
              <svg viewBox="0 0 300 400" style={{ position: "absolute", inset: 0, opacity: 0.08, pointerEvents: "none" }}>
                <path d="M20,80 Q80,40 140,100 T260,120" stroke="#FF5C5C" strokeWidth="2" fill="none" />
                <path d="M40,220 Q100,180 160,240 T280,260" stroke="#FF8C42" strokeWidth="2" fill="none" />
                <path d="M10,340 Q80,300 150,360 T290,350" stroke="#FF5C5C" strokeWidth="2" fill="none" />
              </svg>
              <div style={{
                position: "absolute", bottom: 16, left: 20, right: 20,
                fontSize: 11, color: "#FF5C5C88", textAlign: "center", fontWeight: 600,
                letterSpacing: "0.04em",
              }}>
                ⚠ 4 things missed. 2 clients frustrated. 1 weekend gone.
              </div>
            </div>
          </RevealDiv>

          {/* ARROW */}
          <RevealDiv delay={0.3} style={{ display: "flex", justifyContent: "center" }}>
            <div className="theryn-chaos-arrow" style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%",
                background: A + "15", border: `1px solid ${A}40`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 24, color: A,
              }}>→</div>
              <div style={{
                fontSize: 12, fontWeight: 700, color: A, letterSpacing: "0.16em",
              }}>THERYN</div>
            </div>
          </RevealDiv>

          {/* RIGHT — Clarity */}
          <RevealDiv delay={0.2}>
            <div style={{
              position: "relative",
              height: 440,
              background: `linear-gradient(145deg, ${S1} 0%, #0b0b0b 100%)`,
              border: `1px solid ${A}40`,
              borderRadius: 20,
              overflow: "hidden",
              padding: 20,
              boxShadow: `0 0 0 1px ${A}20, 0 40px 80px rgba(200,255,0,0.08)`,
            }}>
              <div style={{
                position: "absolute", top: 0, left: 0, right: 0, height: 1,
                background: `linear-gradient(90deg, transparent, ${A}, transparent)`,
              }} />
              <div style={{
                fontSize: 10, color: A, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600,
                marginBottom: 14,
              }}>After · One System</div>

              {/* Clean dashboard preview — mirrors real Athletes tab */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{
                  background: BG, border: `1px solid ${BD}`, borderRadius: 10,
                  padding: "12px 14px",
                }}>
                  <div style={{ fontSize: 10, color: SB, letterSpacing: "0.08em", textTransform: "uppercase" }}>My Athletes</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: TX, letterSpacing: "-0.02em", marginTop: 2 }}>5 athletes</div>
                </div>

                {[
                  { name: "Alex Mercer", last: "Push Day · today",        streak: 6, color: A },
                  { name: "Jordan Kim",  last: "Upper · yesterday",       streak: 4, color: AT },
                  { name: "Sam Rivera",  last: "Pull · 5 days ago",       streak: 0, color: "#FF8C42", warn: true },
                  { name: "Maya Chen",   last: "Legs · today",            streak: 9, color: "#B580FF" },
                ].map(a => (
                  <div key={a.name} style={{
                    background: BG, border: `1px solid ${BD}`, borderRadius: 10,
                    padding: "10px 12px",
                    display: "flex", alignItems: "center", gap: 10,
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: "50%", background: a.color,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 700, color: "#000",
                    }}>{a.name[0]}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: TX }}>{a.name}</div>
                      <SessionLabel text={a.last} fontSize={11} warn={a.warn} />
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: a.streak > 0 ? A : SB }}>
                      {a.streak > 0 ? `🔥 ${a.streak}` : "—"}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{
                position: "absolute", bottom: 16, left: 20, right: 20,
                fontSize: 11, color: A, textAlign: "center", fontWeight: 600,
                letterSpacing: "0.04em",
              }}>
                ✓ Everything in one place. Nothing falls through.
              </div>
            </div>
          </RevealDiv>
        </div>

        {/* Replaces what? */}
        <RevealDiv delay={0.2} style={{ marginTop: 80, textAlign: "center" }}>
          <div style={{ fontSize: 11, color: SB, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600, marginBottom: 18 }}>
            Replaces
          </div>
          <div style={{
            display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center",
            maxWidth: 820, margin: "0 auto",
          }}>
            {[
              "Excel / Google Sheets",
              "WhatsApp check-ins",
              "Notes.app",
              "Notion templates",
              "Screenshot tracking",
              "TrainingPeaks",
              "Trainerize",
              "Google Forms",
            ].map(t => (
              <div key={t} style={{
                fontSize: 13, padding: "8px 16px",
                background: S1, border: `1px solid ${BD}`, borderRadius: 100,
                color: SB, position: "relative",
              }}>
                <span style={{ textDecoration: "line-through", textDecorationColor: A + "88", textDecorationThickness: 2 }}>{t}</span>
              </div>
            ))}
          </div>
        </RevealDiv>
      </div>
    </section>
  );
}

// ── SOCIAL PROOF TICKER ───────────────────────────────────────────────────────
function Ticker() {
  const items = [
    "Alex logged Push Day · 4,240 lbs volume",
    "Jordan hit a 315 × 3 squat PR",
    "Coach Dana connected 2 athletes",
    "Maya — bodyweight down 1.2 lbs this week",
    "Sam's routine updated · 4 days / week",
    "Needs Attention · Sam — 5 days since last session",
    "Chest measurement up 0.4 in for Alex",
    "Weekly volume up 21% across roster",
  ];
  return (
    <div style={{
      overflow: "hidden",
      borderTop: `1px solid ${BD}`,
      borderBottom: `1px solid ${BD}`,
      padding: "14px 0",
      background: S1,
    }}>
      <div style={{
        display: "flex",
        gap: 60,
        animation: "ticker 28s linear infinite",
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
    { text: "I was running 12 athletes on three different spreadsheets and WhatsApp. After two weeks on Theryn, I deleted all of them. I get my Sundays back now.", name: "Coach Dana L.", role: "Strength & Conditioning · 12 athletes", color: AT },
    { text: "The roster view tells me in five seconds who's crushing it and who's drifting. That used to be an hour of scrolling through chats and screenshots.", name: "Marcus T.", role: "Powerlifting Coach · 8 athletes", color: A },
    { text: "My clients take it more seriously because it feels like a real product, not a shared Google Sheet. That alone changed my retention.", name: "Ryan K.", role: "Online Hybrid Coach · 20 athletes", color: "#FF8C42" },
  ];
  return (
    <section style={{ padding: "120px clamp(20px, 4vw, 48px)", background: BG }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <RevealDiv>
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <div style={{ fontSize: 11, color: A, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 12, fontWeight: 600 }}>Coaches who switched</div>
            <h2 style={{ fontSize: "clamp(30px, 4.4vw, 52px)", fontWeight: 700, color: TX, margin: 0, letterSpacing: "-0.035em", lineHeight: 1.1 }}>
              Built with coaches.<br />Refined until it just works.
            </h2>
          </div>
        </RevealDiv>
        <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
          {quotes.map((q, i) => (
            <RevealDiv key={q.name} delay={i * 0.12}>
              <div style={{
                background: S1, border: `1px solid ${BD}`, borderRadius: 18, padding: "32px 28px",
                height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 22,
              }}>
                <div style={{ fontSize: 32, color: q.color, lineHeight: 0.5, height: 16 }}>"</div>
                <p style={{ fontSize: 15, color: TX, lineHeight: 1.7, margin: 0, flex: 1 }}>{q.text}</p>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%",
                    background: q.color,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "#000" }}>{q.name[0]}</span>
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
  useEffect(() => {
    // Unlock scroll for the marketing page — the app shell normally locks
    // html/body/#root to overflow:hidden to prevent rubber-band on native.
    // The landing page is a long document that needs normal page scroll.
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById("root");

    const prev = {
      htmlOverflow: html.style.overflow, htmlHeight: html.style.height,
      bodyOverflow: body.style.overflow, bodyHeight: body.style.height,
      rootOverflow: root?.style.overflow, rootHeight: root?.style.height,
    };

    html.style.overflow = "auto";
    html.style.height   = "auto";
    body.style.overflow = "auto";
    body.style.height   = "auto";
    body.dataset.landing = "true";
    if (root) { root.style.overflow = "auto"; root.style.height = "auto"; }

    return () => {
      html.style.overflow = prev.htmlOverflow;
      html.style.height   = prev.htmlHeight;
      body.style.overflow = prev.bodyOverflow;
      body.style.height   = prev.bodyHeight;
      delete body.dataset.landing;
      if (root) { root.style.overflow = prev.rootOverflow; root.style.height = prev.rootHeight; }
    };
  }, []);

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
        body { margin: 0; }

        @media (max-width: 900px) {
          .theryn-hero-phone-left, .theryn-hero-phone-right { display: none !important; }
          .theryn-chaos-grid { grid-template-columns: 1fr !important; }
          .theryn-chaos-arrow { transform: rotate(90deg); }
        }
        @media (max-width: 700px) {
          .theryn-nav-links a { display: none !important; }
        }
      `}</style>

      <Navbar onGetStarted={onEnterApp} />

      <Hero onGetStarted={onEnterApp} />

      {/* CHAOS → CLARITY (THE WOW MOMENT) */}
      <ChaosToClarity />

      {/* TICKER */}
      <Ticker />

      {/* STATS */}
      <section style={{ padding: "80px clamp(20px, 4vw, 48px)", background: S1, borderTop: `1px solid ${BD}`, borderBottom: `1px solid ${BD}` }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 40 }}>
          <StatCounter value="500+" label="Coaches Active" delay={0} />
          <StatCounter value="10,000+" label="Athletes Tracked" delay={0.1} />
          <StatCounter value="2,400,000+" label="Sets Logged" delay={0.2} />
          <StatCounter value="95%" label="Coach Retention" delay={0.3} />
        </div>
      </section>

      {/* FOR COACHES (PRIMARY) */}
      <section id="coaches" style={{ background: BG }}>
        <FloatingPhoneSection
          screen="coach"
          platform="ios"
          side="right"
          title={<>Your whole roster.<br /><span style={{
            background: `linear-gradient(120deg, ${AT} 0%, ${A} 100%)`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>One dashboard.</span></>}
          subtitle="For Coaches"
          accentColor={AT}
          delay={0}
          features={[
            { icon: "👥", title: "Every athlete at a glance", desc: "Weights, sessions, weekly volume, and adherence — all in one sortable view. Know who needs you before they message." },
            { icon: "🔗", title: "Invite in one tap", desc: "Share your code. Athletes join. You approve. No onboarding docs, no form-filling, no awkward setup calls." },
            { icon: "📈", title: "Real data, not self-reports", desc: "See what actually happened in the gym — every set, every rep, every weigh-in. Program from reality, not vibes." },
            { icon: "🎯", title: "Catch drift early", desc: "Red flags when volume drops, sessions get skipped, or bodyweight trends off-plan. Save clients before they quit." },
          ]}
        />
      </section>

      {/* FOR ATHLETES */}
      <section id="athletes" style={{ background: S1, borderTop: `1px solid ${BD}`, borderBottom: `1px solid ${BD}` }}>
        <FloatingPhoneSection
          screen="log"
          platform="android"
          side="left"
          title={<>Every rep.<br />Every set.<br /><span style={{ color: A }}>Every PR.</span></>}
          subtitle="For Athletes"
          accentColor={A}
          delay={0}
          features={[
            { icon: "⚡", title: "Log a set in 2 seconds", desc: "Ghost values remember your last weight and reps. Tap to confirm. Keep moving — the app stays out of your way." },
            { icon: "🏆", title: "Automatic PRs", desc: "Theryn detects your all-time best on every lift. No setup, no logging a PR — it just appears." },
            { icon: "📐", title: "Body composition", desc: "Weight and 9+ measurements with trend deltas. One tap to see if you're actually moving in the right direction." },
            { icon: "📊", title: "Weekly dashboard", desc: "Volume bars, session streaks, best lifts — your week summarized so you know what to fix next." },
          ]}
        />
      </section>

      {/* FEATURES GRID */}
      <section id="features" style={{ padding: "120px clamp(20px, 4vw, 48px)", background: BG }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <RevealDiv style={{ textAlign: "center", marginBottom: 64 }}>
            <div style={{ fontSize: 11, color: A, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 12, fontWeight: 600 }}>One App · Zero Chaos</div>
            <h2 style={{ fontSize: "clamp(30px, 4.4vw, 52px)", fontWeight: 700, color: TX, margin: "0 0 18px", letterSpacing: "-0.035em", lineHeight: 1.1 }}>
              Everything a coach needs.<br />Nothing a coach doesn't.
            </h2>
            <p style={{ fontSize: 16, color: SB, maxWidth: 560, margin: "0 auto", lineHeight: 1.7 }}>
              Theryn replaces your spreadsheets, your check-in forms, your client notes, and your scattered tabs —
              so you can spend your time actually coaching.
            </p>
          </RevealDiv>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 20,
          }}>
            <FeatureCard icon="📅" title="Routine Builder" desc="Design each athlete's 7-day routine with push, pull, legs, cardio, and 10+ workout types. Review and edit what they train, day by day." delay={0} />
            <FeatureCard icon="🚨" title="Needs-Attention Alerts" desc="Theryn watches every athlete's volume, streak, and bodyweight. When someone drifts, they get surfaced to the top — urgency-ranked, not buried." delay={0.05} />
            <FeatureCard icon="🔗" title="Invite by Code" desc="Share your 6-character invite code. Athletes join, you approve. No onboarding forms, no awkward setup calls, no shared spreadsheets." delay={0.1} />
            <FeatureCard icon="📱" title="Coach & Athlete Apps" desc="Same data, tuned for each role. Athletes log workouts on iOS/Android. You run the business from anywhere — phone or laptop." delay={0.15} />
            <FeatureCard icon="💳" title="Payments Built-In" desc="Track monthly fees per athlete, log payments, and see who's current vs. overdue. One login for training and billing — no Stripe dashboard required." delay={0.2} />
            <FeatureCard icon="🔒" title="Your Brand, Your Data" desc="No data lock-in. Export anytime. Private by default — clients only see what you share. Built for serious coaches." delay={0.25} />
          </div>
        </div>
      </section>

      {/* PROGRESS PHONE */}
      <section style={{ background: S1, borderTop: `1px solid ${BD}`, borderBottom: `1px solid ${BD}` }}>
        <FloatingPhoneSection
          screen="progress"
          platform="ios"
          side="right"
          title={<>One week.<br /><span style={{ color: AW }}>Full picture.</span></>}
          subtitle="Weekly Analytics"
          accentColor={AW}
          delay={0}
          features={[
            { icon: "📊", title: "Daily volume bars", desc: "Visual bar chart of the week's output. Spot hard days, easy days, and skipped days in one glance." },
            { icon: "🥇", title: "Best lifts, highlighted", desc: "Top performances across all exercises this week — automatically surfaced, never manually tracked." },
            { icon: "🔄", title: "Sessions vs. plan", desc: "How many of 7 planned sessions got done. Streak counter keeps the consistency flywheel spinning." },
          ]}
        />
      </section>

      {/* TESTIMONIALS */}
      <Testimonials />

      {/* CTA */}
      <section id="cta" style={{
        padding: "140px clamp(20px, 4vw, 48px)",
        background: BG,
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", inset: 0,
          background: `radial-gradient(ellipse 60% 60% at 50% 50%, rgba(200,255,0,0.08) 0%, transparent 70%), radial-gradient(ellipse 40% 40% at 20% 80%, rgba(78,205,196,0.05) 0%, transparent 70%)`,
          pointerEvents: "none",
        }} />
        <RevealDiv style={{ position: "relative", zIndex: 1, maxWidth: 900, margin: "0 auto" }}>
          <div style={{ fontSize: 11, color: A, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 22, fontWeight: 600 }}>
            Stop juggling. Start coaching.
          </div>
          <h2 style={{
            fontSize: "clamp(36px, 6vw, 80px)",
            fontWeight: 700, color: TX,
            margin: "0 0 24px",
            letterSpacing: "-0.045em",
            lineHeight: 1.02,
          }}>
            Your unorganized<br />
            client life, <span style={{
              background: `linear-gradient(120deg, ${A} 0%, ${AT} 100%)`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>organized.</span>
          </h2>
          <p style={{ fontSize: 17, color: SB, maxWidth: 520, margin: "0 auto 44px", lineHeight: 1.7 }}>
            Free to start. No credit card. Invite your first athletes in under two minutes —
            and feel what a clean coaching setup actually looks like.
          </p>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => onEnterApp("coach")}
              style={{
                background: A, border: "none", borderRadius: 12,
                color: "#000", fontWeight: 700, fontSize: 16,
                padding: "16px 38px", cursor: "pointer",
                letterSpacing: "0.01em",
                transition: "transform 0.2s, box-shadow 0.2s",
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.04)"; e.currentTarget.style.boxShadow = `0 12px 40px ${A}50`; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "none"; }}
            >
              Start Free as a Coach →
            </button>
            <button
              onClick={() => onEnterApp("athlete")}
              style={{
                background: "none", border: `1px solid ${MT}`, borderRadius: 12,
                color: TX, fontWeight: 600, fontSize: 16,
                padding: "16px 38px", cursor: "pointer",
                transition: "border-color 0.2s",
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = SB}
              onMouseLeave={e => e.currentTarget.style.borderColor = MT}
            >
              I'm an Athlete →
            </button>
          </div>
          <div style={{ marginTop: 52, display: "flex", gap: 32, justifyContent: "center", flexWrap: "wrap" }}>
            {["Free to start","iOS, Android & Web","No credit card","Cancel anytime"].map(tag => (
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
        padding: "40px clamp(20px, 4vw, 48px)",
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
