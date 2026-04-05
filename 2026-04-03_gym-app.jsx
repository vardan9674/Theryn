import { useState } from "react";
import { BarChart, Bar, XAxis, Cell, ResponsiveContainer, Tooltip } from "recharts";

// ── TOKENS ──────────────────────────────────────────────────────────────
const A   = "#C8FF00";
const BG  = "#080808";
const S1  = "#101010";
const S2  = "#181818";
const BD  = "#1E1E1E";
const TX  = "#F0F0F0";
const SB  = "#585858";
const MT  = "#2C2C2C";
const RED = "#FF5C5C";

// ── CONSTANTS ────────────────────────────────────────────────────────────
const DAYS          = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const WORKOUT_TYPES = ["Push","Pull","Legs","Upper","Lower","Full Body","Cardio","Rest"];
const WEEK_VOL      = [
  { d:"M", v:18500 },{ d:"T", v:22100 },{ d:"W", v:0 },
  { d:"T", v:19800 },{ d:"F", v:25300 },{ d:"S", v:0 },{ d:"S", v:0 },
];
const TYPE_COLORS   = { Push:"#FF8C42", Pull:"#4ECDC4", Legs:"#A8E6CF", Upper:"#C77DFF", Lower:"#FFD166", Rest:SB, Cardio:"#06D6A0", "Full Body":A };

// ── HELPERS ──────────────────────────────────────────────────────────────
const getToday   = () => { const d = new Date(); return DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1]; };
const todayStr   = () => new Date().toISOString().split("T")[0];
const fmtDate    = (s) => new Date(s + "T12:00:00").toLocaleDateString("en-US",{ month:"short", day:"numeric" });
const fmtDayLong = () => new Date().toLocaleDateString("en-US",{ weekday:"long", month:"short", day:"numeric" });

// ── DEFAULT DATA ─────────────────────────────────────────────────────────
const DEFAULT_TEMPLATES = {
  Mon: { type:"Push", exercises:["Bench Press","Incline DB Press","Cable Fly","Tricep Pushdown","Lateral Raise"] },
  Tue: { type:"Pull", exercises:["Deadlift","Barbell Row","Lat Pulldown","Face Pull","Barbell Curl"] },
  Wed: { type:"Legs", exercises:["Squat","Leg Press","Romanian DL","Leg Curl","Calf Raise"] },
  Thu: { type:"Push", exercises:["OHP","DB Shoulder Press","Dips","Lateral Raise","Skull Crushers"] },
  Fri: { type:"Pull", exercises:["Cable Row","Pull Ups","Chest-Supported Row","Hammer Curl","Face Pull"] },
  Sat: { type:"Legs", exercises:["Front Squat","Leg Press","Leg Extension","Leg Curl","Calf Raise"] },
  Sun: { type:"Rest", exercises:[] },
};

const INIT_WEIGHTS = [
  { id:1, date:"2026-04-02", weight:179.0 },
  { id:2, date:"2026-04-01", weight:179.5 },
  { id:3, date:"2026-03-31", weight:180.0 },
  { id:4, date:"2026-03-30", weight:179.5 },
  { id:5, date:"2026-03-29", weight:180.5 },
  { id:6, date:"2026-03-28", weight:181.0 },
  { id:7, date:"2026-03-27", weight:180.5 },
];

const MEASURE_SUGGESTIONS = [
  "Neck","Chest","Waist","Hips","L Arm","R Arm","L Thigh","R Thigh","Calves",
  "Shoulders","Forearm","L Calf","R Calf",
];

const toKey = (label) => label.toLowerCase().replace(/\s+/g,"_");

const DEFAULT_ACTIVE_FIELDS = [
  "Chest","Waist","Hips","L Arm","R Arm","L Thigh","R Thigh","Calves",
];

const INIT_MEASUREMENTS = [
  { id:1, date:"2026-04-02", neck:15.5, chest:42, waist:33, hips:38, lArm:15, rArm:15.5, lThigh:24, rThigh:24.5, calves:15 },
  { id:2, date:"2026-03-26", neck:15.5, chest:41.5, waist:33.5, hips:38, lArm:14.5, rArm:15, lThigh:23.5, rThigh:24, calves:15 },
];

const INIT_PRS = [
  { id:1, name:"Bench Press",      w:225, r:1, date:"Mar 15" },
  { id:2, name:"Squat",            w:315, r:3, date:"Mar 8"  },
  { id:3, name:"Deadlift",         w:365, r:1, date:"Feb 28" },
  { id:4, name:"OHP",              w:155, r:3, date:"Mar 12" },
  { id:5, name:"Incline DB Press", w:75,  r:8, date:"Mar 19" },
  { id:6, name:"Romanian DL",      w:275, r:5, date:"Mar 20" },
];

// ── SHARED STYLES ────────────────────────────────────────────────────────
const card     = { background:S1, borderRadius:"12px", border:`1px solid ${BD}`, padding:"14px 18px", marginBottom:"8px" };
const subLbl   = { fontSize:"10px", color:SB, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:"4px" };
const inputSt  = { background:S2, border:`1px solid ${BD}`, borderRadius:"8px", color:TX, fontSize:"16px", padding:"9px 14px", outline:"none", boxSizing:"border-box" };
const btnPrim  = { background:A, border:"none", borderRadius:"8px", color:"#000", fontWeight:"700", fontSize:"14px", padding:"11px 16px", cursor:"pointer" };
const btnGhost = { background:"none", border:`1px solid ${MT}`, borderRadius:"8px", color:SB, fontSize:"14px", padding:"11px 16px", cursor:"pointer" };

// ── SHARED HEADER ────────────────────────────────────────────────────────
function ScreenHeader({ sup, title }) {
  return (
    <div style={{ padding:"52px 24px 24px", borderBottom:`1px solid ${BD}` }}>
      <div style={{ ...subLbl, marginBottom:"6px" }}>{sup}</div>
      <div style={{ fontSize:"30px", fontWeight:"700", letterSpacing:"-0.04em" }}>{title}</div>
    </div>
  );
}

// ── TAB ICONS ────────────────────────────────────────────────────────────
function TabIcon({ id, active }) {
  const c = active ? A : SB;
  const p = { width:20, height:20, viewBox:"0 0 24 24", fill:"none", stroke:c, strokeWidth:"1.8", strokeLinecap:"round", strokeLinejoin:"round" };
  if (id==="log")      return <svg {...p}><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/></svg>;
  if (id==="routine")  return <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
  if (id==="body")     return <svg {...p}><circle cx="12" cy="5" r="2"/><line x1="12" y1="7" x2="12" y2="14"/><polyline points="8 11 12 14 16 11"/><line x1="9.5" y1="19" x2="12" y2="14"/><line x1="14.5" y1="19" x2="12" y2="14"/></svg>;
  if (id==="progress") return <svg {...p}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
  if (id==="prs")      return <svg {...p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
}

// ════════════════════════════════════════════════════════════════════════
// ROOT APP
// ════════════════════════════════════════════════════════════════════════
export default function GymApp() {
  const [tab,             setTab]             = useState("log");
  const [pendingTab,      setPendingTab]      = useState(null);
  const [showPrompt,      setShowPrompt]      = useState(false);
  const [templates,       setTemplates]       = useState(DEFAULT_TEMPLATES);
  const [weightLog,       setWeightLog]       = useState(INIT_WEIGHTS);
  const [measureLog,      setMeasureLog]      = useState(INIT_MEASUREMENTS);
  const [measureFields,   setMeasureFields]   = useState(DEFAULT_ACTIVE_FIELDS);
  const [prs,             setPrs]             = useState(INIT_PRS);
  const [sessionModified, setSessionModified] = useState(false);
  const [session, setSession] = useState(() =>
    DEFAULT_TEMPLATES[getToday()].exercises.map((name,i) => ({ id:i, name, sets:[] }))
  );

  const handleTabClick = (next) => {
    if (tab==="log" && sessionModified && next!=="log") {
      setPendingTab(next); setShowPrompt(true);
    } else { setTab(next); }
  };

  const resolvePrompt = (save) => {
    if (save) {
      const day = getToday();
      setTemplates(p => ({ ...p, [day]:{ ...p[day], exercises:session.map(e => e.name) } }));
    }
    setSessionModified(false); setShowPrompt(false);
    if (pendingTab) { setTab(pendingTab); setPendingTab(null); }
  };

  const TABS = [
    { id:"log",      label:"Log"      },
    { id:"routine",  label:"Routine"  },
    { id:"body",     label:"Body"     },
    { id:"progress", label:"Progress" },
    { id:"prs",      label:"Records"  },
  ];

  return (
    <div style={{ background:BG, minHeight:"100vh", maxWidth:"390px", margin:"0 auto",
      fontFamily:"-apple-system,'Helvetica Neue',Helvetica,sans-serif",
      color:TX, position:"relative", paddingBottom:"76px" }}>

      {tab==="log"      && <LogScreen session={session} setSession={setSession} templates={templates} setSessionModified={setSessionModified}/>}
      {tab==="routine"  && <RoutineScreen templates={templates} setTemplates={setTemplates}/>}
      {tab==="body"     && <BodyScreen weightLog={weightLog} setWeightLog={setWeightLog} measureLog={measureLog} setMeasureLog={setMeasureLog} measureFields={measureFields} setMeasureFields={setMeasureFields}/>}
      {tab==="progress" && <ProgressScreen/>}
      {tab==="prs"      && <PRsScreen prs={prs}/>}

      {/* ── SAVE PROMPT ── */}
      {showPrompt && (
        <div onClick={() => resolvePrompt(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.72)", display:"flex", alignItems:"flex-end", zIndex:200, maxWidth:"390px", left:"50%", transform:"translateX(-50%)" }}>
          <div onClick={e => e.stopPropagation()} style={{ background:S1, borderRadius:"20px 20px 0 0", padding:"20px 24px 34px", width:"100%", border:`1px solid ${BD}`, boxSizing:"border-box" }}>
            <div style={{ width:"36px", height:"4px", background:MT, borderRadius:"2px", margin:"0 auto 20px" }}/>
            <div style={{ fontSize:"17px", fontWeight:"700", marginBottom:"8px" }}>Save Session Changes?</div>
            <div style={{ fontSize:"13px", color:SB, lineHeight:"1.6", marginBottom:"22px" }}>
              You modified today's{" "}
              <span style={{ color:TYPE_COLORS[templates[getToday()]?.type]||TX, fontWeight:"600" }}>
                {templates[getToday()]?.type} Day
              </span>{" "}
              session. Update the weekly template with these exercises?
            </div>
            <button onClick={() => resolvePrompt(true)} style={{ ...btnPrim, width:"100%", padding:"14px", fontSize:"15px", display:"block", marginBottom:"10px" }}>
              Update Template
            </button>
            <button onClick={() => resolvePrompt(false)} style={{ ...btnGhost, width:"100%", padding:"14px", fontSize:"15px", display:"block" }}>
              Just for Today
            </button>
          </div>
        </div>
      )}

      {/* ── TAB BAR ── */}
      <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:"390px", background:"rgba(8,8,8,0.96)", backdropFilter:"blur(16px)", borderTop:`1px solid ${BD}`, display:"flex", paddingTop:"10px", paddingBottom:"18px", zIndex:100 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => handleTabClick(t.id)} style={{ flex:1, background:"none", border:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:"4px", color:tab===t.id?A:SB, fontSize:"9px", fontWeight:tab===t.id?"600":"400", letterSpacing:"0.06em", textTransform:"uppercase" }}>
            <TabIcon id={t.id} active={tab===t.id}/>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// LOG SCREEN
// ════════════════════════════════════════════════════════════════════════
function LogScreen({ session, setSession, templates, setSessionModified }) {
  const [addingTo,  setAddingTo]  = useState(null);
  const [newSet,    setNewSet]    = useState({ w:"", r:"" });
  const [showAddEx, setShowAddEx] = useState(false);
  const [newExName, setNewExName] = useState("");

  const dayKey    = getToday();
  const tmpl      = templates[dayKey];
  const dayLong   = fmtDayLong();
  const totalSets = session.reduce((a,ex) => a + ex.sets.length, 0);
  const totalVol  = session.reduce((a,ex) => a + ex.sets.reduce((s,set) => s + set.w * set.r, 0), 0);
  const mark      = () => setSessionModified(true);

  const addSet = (id) => {
    if (!newSet.w || !newSet.r) return;
    setSession(p => p.map(ex => ex.id===id ? { ...ex, sets:[...ex.sets, { w:parseFloat(newSet.w), r:parseInt(newSet.r) }] } : ex));
    mark(); setNewSet({ w:"", r:"" }); setAddingTo(null);
  };

  const removeSet = (exId, si) => {
    setSession(p => p.map(ex => ex.id===exId ? { ...ex, sets:ex.sets.filter((_,i)=>i!==si) } : ex)); mark();
  };

  const removeExercise = (id) => { setSession(p => p.filter(ex => ex.id!==id)); mark(); };

  const addExercise = () => {
    if (!newExName.trim()) return;
    setSession(p => [...p, { id:Date.now(), name:newExName.trim(), sets:[] }]);
    mark(); setNewExName(""); setShowAddEx(false);
  };

  if (tmpl.type === "Rest") return (
    <div>
      <ScreenHeader sup={`${dayKey} · Template`} title={dayLong.split(",")[0] + ", " + dayLong.split(", ")[1]}/>
      <div style={{ padding:"60px 24px", textAlign:"center" }}>
        <div style={{ fontSize:"56px", marginBottom:"16px" }}>🛌</div>
        <div style={{ fontSize:"20px", fontWeight:"700", marginBottom:"8px" }}>Rest Day</div>
        <div style={{ fontSize:"14px", color:SB }}>Scheduled rest. Recover well.</div>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ padding:"52px 24px 20px", borderBottom:`1px solid ${BD}` }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"4px" }}>
          <span style={{ ...subLbl, marginBottom:0 }}>{dayKey} · {tmpl.type} Day</span>
          {totalSets > 0 && <span style={{ fontSize:"11px", color:A, letterSpacing:"0.06em" }}>● Active</span>}
        </div>
        <div style={{ fontSize:"30px", fontWeight:"700", letterSpacing:"-0.04em", marginBottom:"18px" }}>
          {dayLong.split(",")[0]}, {dayLong.split(", ")[1]}
        </div>
        <div style={{ display:"flex", gap:"28px" }}>
          {[
            { val: totalVol>=1000 ? `${(totalVol/1000).toFixed(1)}k` : (totalVol||"—"), label:"lbs vol", hi:totalVol>0 },
            { val: totalSets||"—", label:"sets" },
            { val: session.length, label:"exercises" },
          ].map((s,i) => (
            <div key={i}>
              <div style={{ fontSize:"26px", fontWeight:"700", letterSpacing:"-0.04em", color:s.hi?A:TX }}>{s.val}</div>
              <div style={subLbl}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding:"12px 12px 0" }}>
        {session.map(ex => (
          <div key={ex.id} style={card}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:(ex.sets.length||addingTo===ex.id)?"12px":0 }}>
              <span style={{ fontSize:"15px", fontWeight:"600" }}>{ex.name}</span>
              <div style={{ display:"flex", gap:"6px" }}>
                <button onClick={() => setAddingTo(addingTo===ex.id ? null : ex.id)} style={{ background:"none", border:`1px solid ${addingTo===ex.id?A:MT}`, borderRadius:"6px", color:addingTo===ex.id?A:SB, cursor:"pointer", padding:"3px 10px", fontSize:"12px" }}>
                  {addingTo===ex.id ? "✕" : "+ set"}
                </button>
                <button onClick={() => removeExercise(ex.id)} style={{ background:"none", border:`1px solid ${MT}`, borderRadius:"6px", color:RED, cursor:"pointer", padding:"3px 8px", fontSize:"12px" }}>✕</button>
              </div>
            </div>

            {ex.sets.length===0 && addingTo!==ex.id && <div style={{ fontSize:"12px", color:MT }}>No sets logged yet</div>}

            {ex.sets.map((set,si) => (
              <div key={si} style={{ display:"flex", alignItems:"baseline", gap:"6px", padding:"4px 0", borderBottom:si<ex.sets.length-1?`1px solid ${MT}`:"none" }}>
                <span style={{ fontSize:"11px", color:MT, width:"18px" }}>{si+1}</span>
                <span style={{ fontSize:"18px", fontWeight:"700", letterSpacing:"-0.03em" }}>{set.w}</span>
                <span style={{ fontSize:"12px", color:SB }}>lbs ×</span>
                <span style={{ fontSize:"18px", fontWeight:"700", letterSpacing:"-0.03em" }}>{set.r}</span>
                <span style={{ fontSize:"12px", color:SB, flex:1 }}>reps</span>
                <button onClick={() => removeSet(ex.id,si)} style={{ background:"none", border:"none", color:MT, cursor:"pointer", fontSize:"14px", padding:"0 2px" }}>✕</button>
              </div>
            ))}

            {addingTo===ex.id && (
              <div style={{ marginTop:"12px", background:S2, padding:"12px", borderRadius:"8px" }}>
                <div style={{ display:"flex", gap:"8px", marginBottom:"8px" }}>
                  <div style={{ flex:1 }}>
                    <div style={{ ...subLbl, marginBottom:"5px" }}>Weight (lbs)</div>
                    <input style={{ ...inputSt, width:"100%" }} type="number" placeholder="185" value={newSet.w} onChange={e => setNewSet(p => ({ ...p, w:e.target.value }))}/>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ ...subLbl, marginBottom:"5px" }}>Reps</div>
                    <input style={{ ...inputSt, width:"100%" }} type="number" placeholder="8" value={newSet.r} onChange={e => setNewSet(p => ({ ...p, r:e.target.value }))}/>
                  </div>
                </div>
                <button onClick={() => addSet(ex.id)} style={{ ...btnPrim, width:"100%" }}>Log Set</button>
              </div>
            )}
          </div>
        ))}

        {showAddEx ? (
          <div style={card}>
            <div style={{ ...subLbl, marginBottom:"8px" }}>Add to today's session</div>
            <input style={{ ...inputSt, width:"100%", marginBottom:"10px" }} placeholder="e.g. Tricep Pushdown" value={newExName} onChange={e => setNewExName(e.target.value)} onKeyDown={e => e.key==="Enter" && addExercise()}/>
            <div style={{ display:"flex", gap:"8px" }}>
              <button onClick={addExercise} style={{ ...btnPrim, flex:1 }}>Add</button>
              <button onClick={() => setShowAddEx(false)} style={{ ...btnGhost, flex:1 }}>Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAddEx(true)} style={{ width:"100%", background:"none", border:`1px dashed ${MT}`, borderRadius:"12px", color:SB, cursor:"pointer", padding:"16px", fontSize:"13px", marginBottom:"16px", display:"flex", alignItems:"center", justifyContent:"center", gap:"6px" }}>
            <span style={{ fontSize:"18px", color:A }}>+</span> Add Exercise
          </button>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// ROUTINE SCREEN
// ════════════════════════════════════════════════════════════════════════
function RoutineScreen({ templates, setTemplates }) {
  const [expanded,    setExpanded]    = useState(null);
  const [editingType, setEditingType] = useState(null);
  const [newEx,       setNewEx]       = useState("");
  const todayDay = getToday();

  const toggle   = (d) => { setExpanded(expanded===d?null:d); setEditingType(null); setNewEx(""); };
  const setType  = (d,t) => { setTemplates(p => ({ ...p, [d]:{ ...p[d], type:t, exercises:t==="Rest"?[]:p[d].exercises } })); setEditingType(null); };
  const removeEx = (d,i) => setTemplates(p => ({ ...p, [d]:{ ...p[d], exercises:p[d].exercises.filter((_,j)=>j!==i) } }));
  const addEx    = (d) => { if(!newEx.trim()) return; setTemplates(p => ({ ...p, [d]:{ ...p[d], exercises:[...p[d].exercises, newEx.trim()] } })); setNewEx(""); };

  return (
    <div>
      <ScreenHeader sup="Weekly Schedule" title="Routine"/>
      <div style={{ padding:"12px" }}>
        <div style={{ ...subLbl, paddingLeft:"4px", marginBottom:"12px", lineHeight:"1.6", fontSize:"11px" }}>
          Tap any day to edit its template. These exercises load automatically on that day.
        </div>

        {DAYS.map(day => {
          const t      = templates[day];
          const isOpen = expanded===day;
          const isToday= day===todayDay;

          return (
            <div key={day} style={{ ...card, padding:0, overflow:"hidden" }}>
              <button onClick={() => toggle(day)} style={{ width:"100%", background:"none", border:"none", cursor:"pointer", padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                  <span style={{ fontSize:"14px", fontWeight:isToday?"700":"500", color:isToday?A:TX, width:"30px" }}>{day}</span>
                  <span style={{ fontSize:"12px", fontWeight:"600", color:TYPE_COLORS[t.type]||TX, letterSpacing:"0.04em" }}>{t.type}</span>
                  {t.exercises.length > 0 && <span style={{ fontSize:"11px", color:SB }}>{t.exercises.length} ex.</span>}
                  {isToday && <span style={{ fontSize:"9px", background:A, color:"#000", borderRadius:"4px", padding:"2px 6px", fontWeight:"700", letterSpacing:"0.06em" }}>TODAY</span>}
                </div>
                <span style={{ color:SB, fontSize:"14px", display:"block", transform:isOpen?"rotate(180deg)":"none", transition:"transform 0.2s" }}>⌄</span>
              </button>

              {isOpen && (
                <div style={{ borderTop:`1px solid ${BD}`, padding:"14px 18px 16px" }}>
                  {/* Type selector */}
                  {editingType===day ? (
                    <div style={{ marginBottom:"14px" }}>
                      <div style={{ ...subLbl, marginBottom:"8px" }}>Workout Type</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:"6px" }}>
                        {WORKOUT_TYPES.map(wt => (
                          <button key={wt} onClick={() => setType(day,wt)} style={{ background:t.type===wt?A:S2, color:t.type===wt?"#000":SB, border:`1px solid ${t.type===wt?A:MT}`, borderRadius:"6px", padding:"5px 12px", fontSize:"12px", cursor:"pointer", fontWeight:t.type===wt?"700":"400" }}>
                            {wt}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setEditingType(day)} style={{ ...btnGhost, fontSize:"12px", padding:"5px 14px", marginBottom:"14px" }}>
                      Change Type
                    </button>
                  )}

                  {t.exercises.length===0 && t.type!=="Rest" && (
                    <div style={{ fontSize:"12px", color:MT, marginBottom:"10px" }}>No exercises yet.</div>
                  )}

                  {t.exercises.map((ex,i) => (
                    <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:i<t.exercises.length-1?`1px solid ${MT}`:"none" }}>
                      <span style={{ fontSize:"13px" }}>{ex}</span>
                      <button onClick={() => removeEx(day,i)} style={{ background:"none", border:"none", color:SB, cursor:"pointer", fontSize:"15px", padding:"0 4px" }}>✕</button>
                    </div>
                  ))}

                  {t.type!=="Rest" && (
                    <div style={{ display:"flex", gap:"8px", marginTop:"12px" }}>
                      <input style={{ ...inputSt, flex:1 }} placeholder="Add exercise…" value={newEx} onChange={e => setNewEx(e.target.value)} onKeyDown={e => e.key==="Enter" && addEx(day)}/>
                      <button onClick={() => addEx(day)} style={{ ...btnPrim, padding:"9px 16px" }}>+</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// BODY SCREEN
// ════════════════════════════════════════════════════════════════════════
function BodyScreen({ weightLog, setWeightLog, measureLog, setMeasureLog, measureFields, setMeasureFields }) {
  const [inputW,    setInputW]    = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editW,     setEditW]     = useState("");

  // ── Measurement state ──
  const [mInputs,       setMInputs]       = useState({});
  const [mEditingId,    setMEditingId]    = useState(null);
  const [mEditInputs,   setMEditInputs]   = useState({});
  const [showMeasure,   setShowMeasure]   = useState(true);
  const [showAddField,  setShowAddField]  = useState(false);
  const [customField,   setCustomField]   = useState("");

  const todayEntry = weightLog.find(e => e.date===todayStr());
  const sorted     = [...weightLog].sort((a,b) => b.date.localeCompare(a.date));
  const latest     = sorted[0]?.weight;
  const prev       = sorted[1]?.weight;
  const delta      = (latest && prev) ? (latest - prev).toFixed(1) : null;
  const deltaNum   = delta ? parseFloat(delta) : 0;

  const logToday = () => {
    const w = parseFloat(inputW); if(isNaN(w)) return;
    if (todayEntry) {
      setWeightLog(p => p.map(e => e.date===todayStr() ? { ...e, weight:w } : e));
    } else {
      setWeightLog(p => [{ id:Date.now(), date:todayStr(), weight:w }, ...p]);
    }
    setInputW("");
  };

  const saveEdit   = (id) => { const w=parseFloat(editW); if(isNaN(w)) return; setWeightLog(p => p.map(e => e.id===id?{ ...e, weight:w }:e)); setEditingId(null); };
  const deleteEnt  = (id) => setWeightLog(p => p.filter(e => e.id!==id));
  const startEdit  = (e)  => { setEditingId(e.id); setEditW(String(e.weight)); };

  const history = sorted.filter(e => e.date !== todayStr());

  // ── Measurement helpers ──
  const activeFields = measureFields.map(label => ({ key:toKey(label), label }));
  const mSorted      = [...measureLog].sort((a,b) => b.date.localeCompare(a.date));
  const mTodayEntry  = measureLog.find(e => e.date===todayStr());
  const mHasAnyInput = activeFields.some(f => mInputs[f.key] && mInputs[f.key] !== "");

  const addField = (label) => {
    if (!label.trim()) return;
    const trimmed = label.trim();
    if (!measureFields.includes(trimmed)) setMeasureFields(p => [...p, trimmed]);
    setCustomField(""); setShowAddField(false);
  };
  const removeField = (label) => setMeasureFields(p => p.filter(l => l !== label));
  const unusedSuggestions = MEASURE_SUGGESTIONS.filter(s => !measureFields.includes(s));

  const logMeasurements = () => {
    if (!mHasAnyInput) return;
    const entry = { id:Date.now(), date:todayStr() };
    activeFields.forEach(f => { const v = parseFloat(mInputs[f.key]); if (!isNaN(v)) entry[f.key] = v; });
    if (mTodayEntry) {
      setMeasureLog(p => p.map(e => e.date===todayStr() ? { ...e, ...entry, id:e.id } : e));
    } else {
      setMeasureLog(p => [entry, ...p]);
    }
    setMInputs({});
  };

  const startMEdit = (entry) => {
    setMEditingId(entry.id);
    const vals = {};
    activeFields.forEach(f => { vals[f.key] = entry[f.key] != null ? String(entry[f.key]) : ""; });
    setMEditInputs(vals);
  };

  const saveMEdit = (id) => {
    const updates = {};
    activeFields.forEach(f => { const v = parseFloat(mEditInputs[f.key]); if (!isNaN(v)) updates[f.key] = v; else updates[f.key] = undefined; });
    setMeasureLog(p => p.map(e => e.id===id ? { ...e, ...updates } : e));
    setMEditingId(null);
  };

  const deleteMEntry = (id) => setMeasureLog(p => p.filter(e => e.id!==id));

  const mHistory = mSorted.filter(e => e.date !== todayStr());

  return (
    <div>
      <div style={{ padding:"52px 24px 24px", borderBottom:`1px solid ${BD}` }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end" }}>
          <div>
            <div style={{ ...subLbl, marginBottom:"6px" }}>Daily Tracking</div>
            <div style={{ fontSize:"30px", fontWeight:"700", letterSpacing:"-0.04em" }}>Body</div>
          </div>
          {delta!==null && (
            <div style={{ textAlign:"right", marginBottom:"4px" }}>
              <div style={{ fontSize:"18px", fontWeight:"700", letterSpacing:"-0.03em", color:deltaNum<0?A:RED }}>
                {deltaNum>0?"+":""}{delta}
              </div>
              <div style={{ fontSize:"10px", color:SB, letterSpacing:"0.06em" }}>vs yesterday</div>
            </div>
          )}
        </div>
      </div>

      <div style={{ padding:"14px" }}>

        {/* ═══ WEIGHT SECTION ═══ */}
        <div style={{ ...subLbl, paddingLeft:"4px", marginBottom:"8px" }}>Weight</div>

        {/* ── Today's weight card ── */}
        <div style={{ ...card, background:S2, marginBottom:"16px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"10px" }}>
            <div style={{ ...subLbl, marginBottom:0 }}>
              Today · {new Date().toLocaleDateString("en-US",{ month:"short", day:"numeric" })}
            </div>
            {todayEntry && editingId!==todayEntry.id && (
              <div style={{ display:"flex", gap:"6px" }}>
                <button onClick={() => startEdit(todayEntry)} style={{ background:"none", border:`1px solid ${MT}`, borderRadius:"6px", color:SB, cursor:"pointer", padding:"3px 12px", fontSize:"11px" }}>Edit</button>
                <button onClick={() => deleteEnt(todayEntry.id)} style={{ background:"none", border:`1px solid ${MT}`, borderRadius:"6px", color:RED, cursor:"pointer", padding:"3px 12px", fontSize:"11px" }}>Delete</button>
              </div>
            )}
          </div>

          {todayEntry && editingId===todayEntry.id ? (
            <div style={{ display:"flex", gap:"8px" }}>
              <input style={{ ...inputSt, flex:1 }} type="number" step="0.1" value={editW} onChange={e => setEditW(e.target.value)} autoFocus onKeyDown={e => e.key==="Enter"&&saveEdit(todayEntry.id)}/>
              <button onClick={() => saveEdit(todayEntry.id)} style={btnPrim}>Save</button>
              <button onClick={() => setEditingId(null)} style={btnGhost}>✕</button>
            </div>
          ) : todayEntry ? (
            <div style={{ display:"flex", alignItems:"baseline", gap:"6px" }}>
              <span style={{ fontSize:"48px", fontWeight:"700", letterSpacing:"-0.05em", color:A }}>{todayEntry.weight}</span>
              <span style={{ fontSize:"18px", color:SB }}>lbs</span>
            </div>
          ) : (
            <div>
              <div style={{ fontSize:"13px", color:SB, marginBottom:"10px" }}>Log your weight for today</div>
              <div style={{ display:"flex", gap:"8px" }}>
                <input style={{ ...inputSt, flex:1 }} type="number" step="0.1" placeholder="178.5" value={inputW} onChange={e => setInputW(e.target.value)} onKeyDown={e => e.key==="Enter"&&logToday()}/>
                <button onClick={logToday} style={btnPrim}>Log</button>
              </div>
            </div>
          )}
        </div>

        {/* ── Weight History ── */}
        {history.length > 0 && <div style={{ ...subLbl, paddingLeft:"4px", marginBottom:"8px" }}>Weight History</div>}

        {history.map((entry, idx) => {
          const nextEntry = history[idx + 1];
          const d   = nextEntry ? (entry.weight - nextEntry.weight).toFixed(1) : null;
          const dn  = d ? parseFloat(d) : 0;

          return (
            <div key={entry.id} style={{ ...card, padding:"12px 18px" }}>
              {editingId===entry.id ? (
                <div>
                  <div style={{ ...subLbl, marginBottom:"8px" }}>{fmtDate(entry.date)}</div>
                  <div style={{ display:"flex", gap:"8px" }}>
                    <input style={{ ...inputSt, flex:1 }} type="number" step="0.1" value={editW} onChange={e => setEditW(e.target.value)} autoFocus onKeyDown={e => e.key==="Enter"&&saveEdit(entry.id)}/>
                    <button onClick={() => saveEdit(entry.id)} style={btnPrim}>Save</button>
                    <button onClick={() => setEditingId(null)} style={btnGhost}>✕</button>
                  </div>
                </div>
              ) : (
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div>
                    <div style={{ fontSize:"11px", color:SB, letterSpacing:"0.04em", marginBottom:"3px" }}>{fmtDate(entry.date)}</div>
                    <div style={{ display:"flex", alignItems:"baseline", gap:"6px" }}>
                      <span style={{ fontSize:"20px", fontWeight:"700", letterSpacing:"-0.03em" }}>{entry.weight}</span>
                      <span style={{ fontSize:"12px", color:SB }}>lbs</span>
                      {d && dn!==0 && (
                        <span style={{ fontSize:"11px", fontWeight:"600", color:dn<0?A:RED }}>{dn>0?"+":""}{d}</span>
                      )}
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:"6px" }}>
                    <button onClick={() => startEdit(entry)} style={{ background:"none", border:`1px solid ${MT}`, borderRadius:"6px", color:SB, cursor:"pointer", padding:"4px 12px", fontSize:"11px" }}>Edit</button>
                    <button onClick={() => deleteEnt(entry.id)} style={{ background:"none", border:`1px solid ${MT}`, borderRadius:"6px", color:RED, cursor:"pointer", padding:"4px 12px", fontSize:"11px" }}>Delete</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* ═══ MEASUREMENTS SECTION ═══ */}
        <div style={{ marginTop:"24px", borderTop:`1px solid ${BD}`, paddingTop:"16px" }}>
          <button onClick={() => setShowMeasure(!showMeasure)} style={{ width:"100%", background:"none", border:"none", cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center", padding:"0 4px", marginBottom:"12px" }}>
            <span style={{ ...subLbl, marginBottom:0 }}>Measurements (in)</span>
            <span style={{ color:SB, fontSize:"14px", display:"block", transform:showMeasure?"rotate(180deg)":"none", transition:"transform 0.2s" }}>⌄</span>
          </button>

          {showMeasure && (
            <>
              {/* ── Active Fields Manager ── */}
              <div style={{ ...card, padding:"12px 18px", marginBottom:"10px" }}>
                <div style={{ ...subLbl, marginBottom:"8px" }}>Tracking</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:"6px", marginBottom: (showAddField || activeFields.length===0) ? "12px" : 0 }}>
                  {activeFields.map(f => (
                    <span key={f.key} style={{ display:"inline-flex", alignItems:"center", gap:"4px", background:S2, border:`1px solid ${BD}`, borderRadius:"6px", padding:"4px 10px", fontSize:"12px", color:TX }}>
                      {f.label}
                      <button onClick={() => removeField(f.label)} style={{ background:"none", border:"none", color:SB, cursor:"pointer", fontSize:"13px", padding:"0 2px", lineHeight:1 }}>✕</button>
                    </span>
                  ))}
                  <button onClick={() => setShowAddField(!showAddField)} style={{ background:"none", border:`1px dashed ${showAddField?A:MT}`, borderRadius:"6px", color:showAddField?A:SB, cursor:"pointer", padding:"4px 10px", fontSize:"12px" }}>
                    {showAddField ? "Done" : "+ Add"}
                  </button>
                </div>
                {showAddField && (
                  <div>
                    {unusedSuggestions.length > 0 && (
                      <div style={{ display:"flex", flexWrap:"wrap", gap:"6px", marginBottom:"10px" }}>
                        {unusedSuggestions.map(s => (
                          <button key={s} onClick={() => addField(s)} style={{ background:S2, border:`1px solid ${MT}`, borderRadius:"6px", color:SB, cursor:"pointer", padding:"4px 10px", fontSize:"11px" }}>
                            + {s}
                          </button>
                        ))}
                      </div>
                    )}
                    <div style={{ display:"flex", gap:"8px" }}>
                      <input style={{ ...inputSt, flex:1, fontSize:"13px" }} placeholder="Custom field name…" value={customField} onChange={e => setCustomField(e.target.value)} onKeyDown={e => e.key==="Enter" && addField(customField)}/>
                      <button onClick={() => addField(customField)} style={{ ...btnPrim, padding:"9px 14px", fontSize:"12px" }}>Add</button>
                    </div>
                  </div>
                )}
              </div>

              {activeFields.length === 0 && (
                <div style={{ textAlign:"center", padding:"20px 0", color:MT, fontSize:"13px" }}>Tap "+ Add" above to choose which body parts to track.</div>
              )}

              {/* ── Today's measurement card ── */}
              {activeFields.length > 0 && (
                <div style={{ ...card, background:S2, marginBottom:"12px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"12px" }}>
                    <div style={{ ...subLbl, marginBottom:0 }}>
                      Today · {new Date().toLocaleDateString("en-US",{ month:"short", day:"numeric" })}
                    </div>
                    {mTodayEntry && mEditingId!==mTodayEntry.id && (
                      <div style={{ display:"flex", gap:"6px" }}>
                        <button onClick={() => startMEdit(mTodayEntry)} style={{ background:"none", border:`1px solid ${MT}`, borderRadius:"6px", color:SB, cursor:"pointer", padding:"3px 12px", fontSize:"11px" }}>Edit</button>
                        <button onClick={() => deleteMEntry(mTodayEntry.id)} style={{ background:"none", border:`1px solid ${MT}`, borderRadius:"6px", color:RED, cursor:"pointer", padding:"3px 12px", fontSize:"11px" }}>Delete</button>
                      </div>
                    )}
                  </div>

                  {mTodayEntry && mEditingId===mTodayEntry.id ? (
                    <div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"8px", marginBottom:"10px" }}>
                        {activeFields.map(f => (
                          <div key={f.key}>
                            <div style={{ ...subLbl, marginBottom:"4px" }}>{f.label}</div>
                            <input style={{ ...inputSt, width:"100%" }} type="number" step="0.1" placeholder="—" value={mEditInputs[f.key]||""} onChange={e => setMEditInputs(p => ({ ...p, [f.key]:e.target.value }))}/>
                          </div>
                        ))}
                      </div>
                      <div style={{ display:"flex", gap:"8px" }}>
                        <button onClick={() => saveMEdit(mTodayEntry.id)} style={{ ...btnPrim, flex:1 }}>Save</button>
                        <button onClick={() => setMEditingId(null)} style={{ ...btnGhost, flex:1 }}>Cancel</button>
                      </div>
                    </div>
                  ) : mTodayEntry ? (
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"6px 12px" }}>
                      {activeFields.map(f => {
                        const val = mTodayEntry[f.key];
                        const prevEntry = mHistory[0];
                        const prevVal = prevEntry?.[f.key];
                        const d2 = (val != null && prevVal != null) ? (val - prevVal).toFixed(1) : null;
                        const dn2 = d2 ? parseFloat(d2) : 0;
                        return (
                          <div key={f.key} style={{ padding:"4px 0" }}>
                            <div style={{ fontSize:"10px", color:SB, letterSpacing:"0.06em", textTransform:"uppercase", marginBottom:"2px" }}>{f.label}</div>
                            <div style={{ display:"flex", alignItems:"baseline", gap:"4px" }}>
                              <span style={{ fontSize:"18px", fontWeight:"700", letterSpacing:"-0.03em", color:val!=null?TX:MT }}>{val!=null?val:"—"}</span>
                              <span style={{ fontSize:"10px", color:SB }}>in</span>
                              {d2 && dn2!==0 && (
                                <span style={{ fontSize:"10px", fontWeight:"600", color:dn2>0?A:dn2<0?"#4ECDC4":SB }}>{dn2>0?"+":""}{d2}</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize:"13px", color:SB, marginBottom:"10px" }}>Log your measurements for today</div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"8px", marginBottom:"10px" }}>
                        {activeFields.map(f => (
                          <div key={f.key}>
                            <div style={{ ...subLbl, marginBottom:"4px" }}>{f.label}</div>
                            <input style={{ ...inputSt, width:"100%" }} type="number" step="0.1" placeholder="—" value={mInputs[f.key]||""} onChange={e => setMInputs(p => ({ ...p, [f.key]:e.target.value }))}/>
                          </div>
                        ))}
                      </div>
                      <button onClick={logMeasurements} style={{ ...btnPrim, width:"100%" }}>Log Measurements</button>
                    </div>
                  )}
                </div>
              )}

              {/* ── Measurement History ── */}
              {mHistory.length > 0 && <div style={{ ...subLbl, paddingLeft:"4px", marginBottom:"8px" }}>Measurement History</div>}

              {mHistory.map((entry, idx) => {
                const prevEntry = mHistory[idx + 1];
                // show all keys that have data in this entry, not just current activeFields
                const entryFields = activeFields.filter(f => entry[f.key] != null);
                // also include any keys from the entry not in activeFields
                const allEntryKeys = Object.keys(entry).filter(k => k !== "id" && k !== "date" && entry[k] != null);
                const extraFields = allEntryKeys.filter(k => !activeFields.some(f => f.key === k)).map(k => ({ key:k, label:k.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase()) }));
                const displayFields = [...entryFields, ...extraFields];

                return (
                  <div key={entry.id} style={{ ...card, padding:"12px 18px" }}>
                    {mEditingId===entry.id ? (
                      <div>
                        <div style={{ ...subLbl, marginBottom:"8px" }}>{fmtDate(entry.date)}</div>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"8px", marginBottom:"10px" }}>
                          {activeFields.map(f => (
                            <div key={f.key}>
                              <div style={{ ...subLbl, marginBottom:"4px" }}>{f.label}</div>
                              <input style={{ ...inputSt, width:"100%" }} type="number" step="0.1" placeholder="—" value={mEditInputs[f.key]||""} onChange={e => setMEditInputs(p => ({ ...p, [f.key]:e.target.value }))}/>
                            </div>
                          ))}
                        </div>
                        <div style={{ display:"flex", gap:"8px" }}>
                          <button onClick={() => saveMEdit(entry.id)} style={{ ...btnPrim, flex:1 }}>Save</button>
                          <button onClick={() => setMEditingId(null)} style={{ ...btnGhost, flex:1 }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"8px" }}>
                          <div style={{ fontSize:"11px", color:SB, letterSpacing:"0.04em" }}>{fmtDate(entry.date)}</div>
                          <div style={{ display:"flex", gap:"6px" }}>
                            <button onClick={() => startMEdit(entry)} style={{ background:"none", border:`1px solid ${MT}`, borderRadius:"6px", color:SB, cursor:"pointer", padding:"3px 12px", fontSize:"11px" }}>Edit</button>
                            <button onClick={() => deleteMEntry(entry.id)} style={{ background:"none", border:`1px solid ${MT}`, borderRadius:"6px", color:RED, cursor:"pointer", padding:"3px 12px", fontSize:"11px" }}>Delete</button>
                          </div>
                        </div>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"4px 12px" }}>
                          {displayFields.map(f => {
                            const val = entry[f.key];
                            const pv  = prevEntry?.[f.key];
                            const d3  = (val!=null && pv!=null) ? (val-pv).toFixed(1) : null;
                            const dn3 = d3 ? parseFloat(d3) : 0;
                            return (
                              <div key={f.key} style={{ padding:"3px 0" }}>
                                <div style={{ fontSize:"10px", color:SB, letterSpacing:"0.06em", textTransform:"uppercase" }}>{f.label}</div>
                                <div style={{ display:"flex", alignItems:"baseline", gap:"3px" }}>
                                  <span style={{ fontSize:"15px", fontWeight:"700", letterSpacing:"-0.03em" }}>{val}</span>
                                  <span style={{ fontSize:"10px", color:SB }}>in</span>
                                  {d3 && dn3!==0 && (
                                    <span style={{ fontSize:"10px", fontWeight:"600", color:dn3>0?A:"#4ECDC4" }}>{dn3>0?"+":""}{d3}</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>

      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// PROGRESS SCREEN
// ════════════════════════════════════════════════════════════════════════
function ProgressScreen() {
  const totalVol  = WEEK_VOL.reduce((s,d) => s + d.v, 0);
  const sessions  = WEEK_VOL.filter(d => d.v > 0).length;
  const bestLifts = [
    { name:"Bench Press", w:195, r:5 },
    { name:"Incline DB Press", w:65, r:10 },
    { name:"Cable Fly", w:42.5, r:12 },
  ];
  return (
    <div>
      <ScreenHeader sup="Week of Mar 31" title="Progress"/>
      <div style={{ padding:"14px" }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px", marginBottom:"8px" }}>
          {[{ label:"Sessions", val:sessions, sub:"of 7 days", hi:true }, { label:"Volume", val:`${(totalVol/1000).toFixed(0)}k`, sub:"lbs this week" }].map((s,i) => (
            <div key={i} style={{ ...card, marginBottom:0 }}>
              <div style={subLbl}>{s.label}</div>
              <div style={{ fontSize:"42px", fontWeight:"700", letterSpacing:"-0.05em", lineHeight:1.1, color:s.hi?A:TX }}>{s.val}</div>
              <div style={{ fontSize:"12px", color:SB, marginTop:"2px" }}>{s.sub}</div>
            </div>
          ))}
        </div>
        <div style={{ ...card, marginBottom:"8px" }}>
          <div style={subLbl}>Daily Volume</div>
          <ResponsiveContainer width="100%" height={90}>
            <BarChart data={WEEK_VOL} barSize={26} margin={{ top:6, right:0, left:-20, bottom:0 }}>
              <XAxis dataKey="d" axisLine={false} tickLine={false} tick={{ fill:SB, fontSize:11, fontFamily:"inherit" }}/>
              <Tooltip cursor={false} contentStyle={{ background:S2, border:`1px solid ${BD}`, borderRadius:"8px", fontSize:"12px", color:TX }} formatter={(v) => v>0?[`${(v/1000).toFixed(1)}k lbs`,"Volume"]:["Rest",""]}/>
              <Bar dataKey="v" radius={[4,4,0,0]}>
                {WEEK_VOL.map((d,i) => <Cell key={i} fill={d.v===0?MT:(i===4?A:"#4A6600")}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ ...subLbl, paddingLeft:"4px", marginBottom:"8px", marginTop:"10px" }}>Best This Week</div>
        {bestLifts.map((l,i) => (
          <div key={i} style={{ ...card, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:"14px", fontWeight:"500" }}>{l.name}</span>
            <div><span style={{ fontSize:"18px", fontWeight:"700", letterSpacing:"-0.03em" }}>{l.w}</span><span style={{ fontSize:"12px", color:SB }}> lbs × {l.r}</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// PRs SCREEN
// ════════════════════════════════════════════════════════════════════════
function PRsScreen({ prs }) {
  return (
    <div>
      <ScreenHeader sup="All Time" title="Records"/>
      <div style={{ padding:"14px" }}>
        {prs.map(pr => (
          <div key={pr.id} style={{ ...card, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <div style={{ fontSize:"14px", fontWeight:"600" }}>{pr.name}</div>
              <div style={{ fontSize:"11px", color:SB, marginTop:"2px", letterSpacing:"0.04em" }}>{pr.date}</div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div><span style={{ fontSize:"24px", fontWeight:"700", color:A, letterSpacing:"-0.04em" }}>{pr.w}</span><span style={{ fontSize:"12px", color:SB }}> lbs</span></div>
              <div style={{ fontSize:"11px", color:SB }}>× {pr.r} {pr.r===1?"rep":"reps"}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
