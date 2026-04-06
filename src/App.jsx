import { useState, useEffect, useRef } from "react";
import { BarChart, Bar, XAxis, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { supabase } from "./lib/supabase";
import { Capacitor } from "@capacitor/core";
import { Haptics } from "@capacitor/haptics";
import { App as CapApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { saveCompletedWorkout, loadWorkoutHistory } from "./hooks/useWorkouts";
import { loadBodyWeights, saveBodyWeight, deleteBodyWeight, loadMeasurements, saveMeasurement, deleteMeasurement } from "./hooks/useBody";
import { loadRoutine, saveRoutine } from "./hooks/useRoutine";
import { ensureInviteCode, findProfileByCode, sendCoachRequest, loadCoachLinks, acceptCoachRequest, removeCoachLink, loadAthleteData } from "./hooks/useCoach";
import { requestNotificationPermissions, scheduleDailyRoutine, scheduleReflection, scheduleStreakReminder, triggerCoachEditNotification } from "./hooks/useNotifications";

export function playRestTimerBeep() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  
  osc.type = "sine";
  osc.frequency.setValueAtTime(440, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
  
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
  
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.5);
}

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
const WORKOUT_TYPES = ["Push","Pull","Legs","Upper","Lower","Full Body","Core","Cardio","Rest","Run","Swim","Bike","HIIT","Yoga","Custom"];
const WEEK_VOL      = [
  { d:"M", v:18500 },{ d:"T", v:22100 },{ d:"W", v:0 },
  { d:"T", v:19800 },{ d:"F", v:25300 },{ d:"S", v:0 },{ d:"S", v:0 },
];
const TYPE_COLORS   = { Push:"#FF8C42", Pull:"#4ECDC4", Legs:"#A8E6CF", Upper:"#C77DFF", Lower:"#FFD166", Rest:SB, Cardio:"#06D6A0", "Full Body":A, Core:"#FFD166", Run:"#06D6A0", Swim:"#4ECDC4", Bike:"#FFD166", HIIT:"#FF8C42", Yoga:"#C77DFF", Custom:SB };

// Cardio-style types use distance/duration instead of weight/reps
const CARDIO_TYPES = new Set(["Cardio","Run","Swim","Bike","HIIT"]);

// Default exercises per workout type (used when switching types)
const TYPE_EXERCISES = {
  Push:      ["Bench Press","Incline DB Press","Cable Fly","Tricep Pushdown","Lateral Raise"],
  Pull:      ["Deadlift","Barbell Row","Lat Pulldown","Face Pull","Barbell Curl"],
  Legs:      ["Squat","Leg Press","Romanian DL","Leg Curl","Calf Raise"],
  Upper:     ["Bench Press","Barbell Row","OHP","Barbell Curl","Tricep Pushdown"],
  Lower:     ["Squat","Romanian DL","Leg Press","Leg Curl","Calf Raise"],
  "Full Body":["Squat","Bench Press","Deadlift","OHP","Pull Ups"],
  Core:      ["Plank","Hanging Leg Raise","Cable Crunch","Ab Wheel Rollout","Russian Twist"],
  Run:       ["Treadmill Run"],
  Swim:      ["Swimming"],
  Bike:      ["Stationary Bike"],
  HIIT:      ["Burpees","Jump Squat","Mountain Climbers","Battle Ropes"],
  Yoga:      ["Stretch Flow"],
  Cardio:    ["Treadmill Run","Stationary Bike","Rowing Machine"],
  Custom:    [],
  Rest:      [],
};

// Exercises that always use distance/duration regardless of workout type
const CARDIO_EXERCISES = new Set([
  "Treadmill Run","Swimming","Stationary Bike","Rowing Machine","Elliptical",
  "Stair Climber","Jump Rope","Battle Ropes","Burpees","Jump Squat",
  "Mountain Climbers","Stretch Flow",
]);

// Compound lifts → longer rest (180s default); everything else → 90s; cardio → 60s
const COMPOUND_EXERCISES = new Set([
  "Squat","Front Squat","Barbell Squat","Deadlift","Romanian DL","Sumo Deadlift",
  "Bench Press","Incline DB Press","OHP","Overhead Press","Barbell Row",
  "Pull Ups","Chin Ups","Dips","Leg Press","Hip Thrust","Cable Row",
  "Chest-Supported Row","DB Shoulder Press","Skull Crushers",
]);

// Returns rest duration in seconds based on exercise name
const getDefaultRest = () => 15;

// Returns true if an exercise name should use distance/duration inputs
const isCardioExercise = (name) => CARDIO_EXERCISES.has(name);

// Timed Exercises use stopwatch overlays (and rely on "Sec" instead of "Reps")
const TIMED_EXERCISES_LIST = ["Plank", "Wall Sit", "Farmer", "L-Sit", "Hollow Hold", "Static Hang", "Dead Hang", "Stretching", "Hold"];
const isTimedExercise = (name) => {
  if (!name) return false;
  const n = name.trim().toLowerCase();
  return TIMED_EXERCISES_LIST.some(ex => n.includes(ex.toLowerCase()));
};

// Profile avatar colors
const PROFILE_COLORS = ["#C8FF00","#4ECDC4","#FF8C42","#C77DFF","#FFD166","#FF5C5C","#06D6A0","#4A90D9"];

// Format seconds to MM:SS or H:MM:SS
const fmtTimer = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

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

const INIT_WEIGHTS = [];

const MEASURE_SUGGESTIONS = [
  "Neck","Chest","Waist","Hips","L Arm","R Arm","L Thigh","R Thigh","Calves",
  "Shoulders","Forearm","L Calf","R Calf",
];

const toKey = (label) => label.toLowerCase().replace(/\s+/g,"_");

const DEFAULT_ACTIVE_FIELDS = [
  "Chest","Waist","Hips","L Arm","R Arm","L Thigh","R Thigh","Calves",
];

const INIT_MEASUREMENTS = [];

const INIT_PRS = [
  { id:1, name:"Bench Press",      w:225, r:1, date:"Mar 15" },
  { id:2, name:"Squat",            w:315, r:3, date:"Mar 8"  },
  { id:3, name:"Deadlift",         w:365, r:1, date:"Feb 28" },
  { id:4, name:"OHP",              w:155, r:3, date:"Mar 12" },
  { id:5, name:"Incline DB Press", w:75,  r:8, date:"Mar 19" },
  { id:6, name:"Romanian DL",      w:275, r:5, date:"Mar 20" },
];

// ── SHARED STYLES ────────────────────────────────────────────────────────
const card     = { background:S1, borderRadius:"14px", border:`1px solid ${BD}`, padding:"16px", marginBottom:"1px" };
const cardInner = { background:S1, borderRadius:"14px", border:`1px solid ${BD}`, padding:"16px", marginBottom:"10px", marginLeft:"14px", marginRight:"14px" };
const subLbl   = { fontSize:"11px", color:SB, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:"6px" };
const inputSt  = { background:S2, border:`1px solid ${BD}`, borderRadius:"10px", color:TX, fontSize:"16px", padding:"12px 14px", outline:"none", boxSizing:"border-box", transition:"border-color 0.2s ease, box-shadow 0.2s ease" };
const btnPrim  = { background:A, border:"none", borderRadius:"10px", color:"#000", fontWeight:"700", fontSize:"15px", padding:"14px 20px", cursor:"pointer" };
const btnGhost = { background:"none", border:`1px solid ${MT}`, borderRadius:"10px", color:SB, fontSize:"15px", padding:"14px 20px", cursor:"pointer" };

// ── SHARED HEADER ────────────────────────────────────────────────────────
function ScreenHeader({ sup, title, profile, onProfileTap }) {
  return (
    <div style={{ padding:"48px 16px 20px", borderBottom:`1px solid ${BD}` }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div>
          <div style={{ ...subLbl, marginBottom:"4px" }}>{sup}</div>
          <div style={{ fontSize:"28px", fontWeight:"700", letterSpacing:"-0.04em" }}>{title}</div>
        </div>
        {profile && onProfileTap && (
          <button onClick={onProfileTap} style={{
            width:"32px", height:"32px", borderRadius:"50%", background: profile.setup ? profile.color : MT,
            border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:"11px", fontWeight:"700", color:"#000", letterSpacing:"-0.02em", marginTop:"4px", flexShrink:0,
          }}>
            {profile.setup ? profile.initials : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 10-16 0"/></svg>}
          </button>
        )}
      </div>
    </div>
  );
}

// ── TAB ICONS ────────────────────────────────────────────────────────────
function TabIcon({ id, active }) {
  const c = active ? A : SB;
  const p = { width:24, height:24, viewBox:"0 0 24 24", fill:"none", stroke:c, strokeWidth:"1.8", strokeLinecap:"round", strokeLinejoin:"round" };
  if (id==="log")      return <svg {...p}><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/></svg>;
  if (id==="routine")  return <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
  if (id==="body")     return <svg {...p}><circle cx="12" cy="5" r="2"/><line x1="12" y1="7" x2="12" y2="14"/><polyline points="8 11 12 14 16 11"/><line x1="9.5" y1="19" x2="12" y2="14"/><line x1="14.5" y1="19" x2="12" y2="14"/></svg>;
  if (id==="progress") return <svg {...p}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
  if (id==="prs")      return <svg {...p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
}

// ════════════════════════════════════════════════════════════════════════
// EXERCISE PICKER OVERLAY (Global Database Search)
// ════════════════════════════════════════════════════════════════════════
let EXDB_CACHE = null;

function ExercisePicker({ onClose, onSelect }) {
  const [db, setDb] = useState(EXDB_CACHE || []);
  const [q, setQ]     = useState("");
  const [visible, setVisible] = useState(false);

  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

  useEffect(() => {
    if (EXDB_CACHE) return;
    fetch("/exercises.json").then(r => r.json()).then(data => {
      EXDB_CACHE = data;
      setDb(data);
    }).catch(e => console.error("DB Load Error", e));
  }, []);

  const closeOverlay = () => {
    setVisible(false);
    setTimeout(onClose, 280);
  };

  const results = q.trim() ? db.filter(e => e.name.toLowerCase().includes(q.toLowerCase())).slice(0, 30) : [];
  
  return (
    <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background: visible ? "rgba(0,0,0,0.75)" : "rgba(0,0,0,0)", zIndex:500, display:"flex", alignItems:"flex-end", transition:"background 0.28s ease" }} onClick={closeOverlay}>
      <div onClick={e => e.stopPropagation()} style={{ background:S1, borderRadius:"24px 24px 0 0", width:"100%", height:"85vh", borderTop:`1px solid ${BD}`, display:"flex", flexDirection:"column", transform: visible ? "translateY(0)" : "translateY(100%)", transition:"transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)" }}>
        
        {/* Header & Search */}
        <div style={{ padding:"16px 20px" }}>
          <div style={{ width:"40px", height:"5px", background:MT, borderRadius:"3px", margin:"0 auto 16px" }}/>
          <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"12px" }}>
            <input autoFocus style={{ ...inputSt, flex:1, fontSize:"16px", padding:"14px 16px" }} placeholder="Search exercises..." value={q} onChange={e => setQ(e.target.value)} />
            <button onClick={closeOverlay} style={{ background:"none", border:"none", color:SB, fontSize:"15px", fontWeight:"600", cursor:"pointer", padding:"10px" }}>Cancel</button>
          </div>
        </div>

        {/* Results List */}
        <div style={{ flex:1, overflowY:"auto", padding:"0 20px 40px" }}>
          {q.trim() && results.length === 0 && (
            <button onClick={() => { onSelect(q.trim()); closeOverlay(); }} style={{ width:"100%", textAlign:"left", background:S2, border:`1px solid ${A}`, borderRadius:"12px", padding:"16px", cursor:"pointer", marginBottom:"8px" }}>
              <div style={{ fontSize:"16px", fontWeight:"700", color:A }}>+ Add custom "{q.trim()}"</div>
              <div style={{ fontSize:"13px", color:SB, marginTop:"4px" }}>Create your own exercise</div>
            </button>
          )}

          {results.map(ex => (
            <button key={ex.id} onClick={() => { onSelect(ex.name); closeOverlay(); }} style={{ width:"100%", textAlign:"left", background:S2, border:`1px solid ${BD}`, borderRadius:"12px", padding:"14px 16px", cursor:"pointer", marginBottom:"8px", display:"flex", flexDirection:"column", gap:"4px" }}>
              <div style={{ fontSize:"16px", fontWeight:"600", color:TX }}>{ex.name}</div>
              <div style={{ fontSize:"12px", color:SB, textTransform:"uppercase", letterSpacing:"0.04em" }}>
                {ex.primaryMuscles?.[0] || ex.category} • {ex.equipment}
              </div>
            </button>
          ))}
          
          {!q.trim() && db.length > 0 && (
            <div style={{ textAlign:"center", padding:"40px 20px", color:MT, fontSize:"14px" }}>
              Type to search over 800+ exercises across all equipment types and muscle groups.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// ROOT APP
// ════════════════════════════════════════════════════════════════════════
const StopwatchOverlay = ({ onSave, onCancel, targetName }) => {
  const [time, setTime] = useState(0);
  const [running, setRunning] = useState(false);
  const startTimeRef = useRef(null);
  
  useEffect(() => {
    if (!running) {
      startTimeRef.current = null;
      return;
    }
    startTimeRef.current = Date.now() - (time * 1000); // Anchor start time accounting for existing accumulated time
    
    const t = setInterval(() => {
      const now = Date.now();
      setTime(Math.floor((now - startTimeRef.current) / 1000));
    }, 200); // Run tighter loop to sync UI smoothly on wakeup
    
    return () => clearInterval(t);
  }, [running]);

  return (
    <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"#000", zIndex:1000, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
      <div style={{ color:A, fontSize:"24px", fontWeight:"700", marginBottom:"40px", textTransform:"uppercase", letterSpacing:"0.1em" }}>{targetName}</div>
      
      <div style={{ display:"flex", alignItems:"center", gap:"20px", marginBottom:"80px" }}>
        <button onClick={() => { setRunning(false); setTime(t => Math.max(0, t - 15)); }} style={{ background:"none", border:"none", color:SB, fontSize:"32px", cursor:"pointer", padding:"20px" }}>-</button>
        
        <div style={{ fontSize:"96px", fontWeight:"800", color:"#FFF", fontVariantNumeric:"tabular-nums", width:"240px", textAlign:"center" }}>
          {fmtTimer(time)}
        </div>
        
        <button onClick={() => { setRunning(false); setTime(t => t + 15); }} style={{ background:"none", border:"none", color:SB, fontSize:"32px", cursor:"pointer", padding:"20px" }}>+</button>
      </div>

      <div style={{ display:"flex", gap:"24px" }}>
        <button onClick={() => setRunning(!running)} style={{ width:"88px", height:"88px", borderRadius:"50%", border:`3px solid ${running ? RED : A}`, background:"transparent", color:running ? RED : A, fontSize:"18px", fontWeight:"800", cursor:"pointer" }}>
          {running ? "PAUSE" : "START"}
        </button>
        <button onClick={() => onSave(time)} style={{ width:"88px", height:"88px", borderRadius:"50%", border:"none", background:"#FFF", color:"#000", fontSize:"18px", fontWeight:"800", cursor:"pointer" }}>
          SAVE
        </button>
      </div>
      <button onClick={onCancel} style={{ position:"absolute", top:"48px", right:"32px", color:SB, background:"none", border:"none", fontSize:"16px", fontWeight:"700", cursor:"pointer", padding:"8px" }}>✕ CANCEL</button>
    </div>
  );
};

export default function GymApp() {
  const [tab,             setTab]             = useState("log");
  const [pendingTab,      setPendingTab]      = useState(null);
  const [showPrompt,      setShowPrompt]      = useState(false);
  const [templates,       setTemplates]       = useState(DEFAULT_TEMPLATES);
  const [prevTemplates,   setPrevTemplates]   = useState(null);
  const [undoToast,       setUndoToast]       = useState(null);
  const [weightLog,       setWeightLog]       = useState(INIT_WEIGHTS);
  const [measureLog,      setMeasureLog]      = useState(INIT_MEASUREMENTS);
  const [measureFields,   setMeasureFields]   = useState(DEFAULT_ACTIVE_FIELDS);
  const [prs,             setPrs]             = useState(INIT_PRS);
  const [exercisesChanged, setExercisesChanged] = useState(false);
  const [todayType, setTodayType] = useState(DEFAULT_TEMPLATES[getToday()].type);
  const [session, setSession] = useState(() =>
    DEFAULT_TEMPLATES[getToday()].exercises.map((name,i) => ({
      id:i, name,
      sets: isCardioExercise(name)
        ? [{ id: `${i}-0`, dist:"", dur:"", done: false }]
        : Array.from({ length: 3 }, (_, si) => ({ id: `${i}-${si}`, w:"", r:"", done: false })),
    }))
  );
  const [workoutHistory, setWorkoutHistory] = useState([]);
  const [workoutActive, setWorkoutActive] = useState(false);
  const [workoutPaused, setWorkoutPaused] = useState(false);
  const [workoutElapsed, setWorkoutElapsed] = useState(0);
  const [workoutStartTime, setWorkoutStartTime] = useState(null);
  const [profile, setProfile] = useState({ initials:"", color:PROFILE_COLORS[0], setup:false });
  const [authUser,   setAuthUser]   = useState(null);   // Supabase user object
  const [authLoading, setAuthLoading] = useState(true); // true while session is being checked
  const [authError,  setAuthError]  = useState(null);   // error message from OAuth callback
  const [showTour, setShowTour] = useState(false);
  const [hasCustomizedRoutine, setHasCustomizedRoutine] = useState(false);

  // Coach links cached at root level to prevent flicker on tab switches
  const [coachLinks, setCoachLinks] = useState([]);
  const [coachLinksLoaded, setCoachLinksLoaded] = useState(false);
  // AthleteView lifted here so it renders outside the animated screen-enter wrapper
  const [athleteView, setAthleteView] = useState(null);

  // ── Supabase auth listener ────────────────────────────────────────────
  useEffect(() => {
    // Check existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthUser(session?.user ?? null);
      setAuthLoading(false);
    });

    // Listen for auth state changes (login / logout / token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setAuthUser(user);
      setAuthLoading(false);

      if (user) {
        // Auto-derive initials and avatar color from Google account
        const name = user.user_metadata?.full_name || user.user_metadata?.name || "";
        const parts = name.trim().split(" ").filter(Boolean);
        const initials = parts.length >= 2
          ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
          : (parts[0]?.[0] || user.email?.[0] || "?").toUpperCase();
        const colorIdx = user.id.charCodeAt(0) % PROFILE_COLORS.length;
        setProfile(p => p.setup ? p : {
          initials,
          color: PROFILE_COLORS[colorIdx],
          units: "imperial",
          setup: true,
        });

        // Upsert profile row — runs as the authenticated user so RLS allows it
        supabase.from("profiles").upsert({
          id: user.id,
          display_name: name || user.email?.split("@")[0] || "User",
          avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
        }, { onConflict: "id", ignoreDuplicates: true }).then(({ error }) => {
          if (error) console.error("Profile upsert error:", error.message);
        });

        // Show tour on first-ever login (localStorage persists across reloads)
        const tourKey = `theryn_tour_done_${user.id}`;
        if (!localStorage.getItem(tourKey)) {
          setShowTour(true);
        }
      }
    });

    // Handle OAuth deep link redirect on native (Android/iOS)
    // When Google redirects to com.theryn.app://login-callback?code=...
    // Capacitor fires appUrlOpen — we extract the code and exchange it for a session
    let appUrlListener;
    if (Capacitor.isNativePlatform()) {
      CapApp.addListener("appUrlOpen", async ({ url }) => {
        if (url.startsWith("com.theryn.app://")) {
          await Browser.close().catch(() => {});
          try {
            const normalized = url.replace("com.theryn.app://", "https://x/");
            const parsed = new URL(normalized);
            const qp = parsed.searchParams;
            const hp = new URLSearchParams(parsed.hash.replace(/^#/, ""));

            // Check for OAuth error first
            const oauthError = qp.get("error") || hp.get("error");
            if (oauthError) {
              setAuthError(`OAuth error: ${oauthError} — ${qp.get("error_description") || hp.get("error_description") || ""}`);
              setAuthLoading(false);
              return;
            }

            const code = qp.get("code") || hp.get("code");
            const accessToken = qp.get("access_token") || hp.get("access_token");
            const refreshToken = qp.get("refresh_token") || hp.get("refresh_token");

            if (code) {
              // PKCE: exchange code for session (try full URL first, then just code)
              let result = await supabase.auth.exchangeCodeForSession(code);
              if (!result.data?.session && result.error) {
                result = await supabase.auth.exchangeCodeForSession(url);
              }
              if (result.data?.session) {
                setAuthUser(result.data.session.user);
                setAuthError(null);
              } else {
                setAuthError(`Code exchange failed: ${result.error?.message}. URL: ${url}`);
              }
            } else if (accessToken && refreshToken) {
              // Implicit flow: set session directly from tokens in URL
              const { data, error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
              if (data?.session) {
                setAuthUser(data.session.user);
                setAuthError(null);
              } else {
                setAuthError(`Set session failed: ${error?.message}. URL: ${url}`);
              }
            } else {
              setAuthError(`No auth params found. Full URL: ${url}`);
            }
          } catch (e) {
            setAuthError(`Callback error: ${e.message}. URL: ${url}`);
          }
          setAuthLoading(false);
        }
      }).then(listener => { appUrlListener = listener; });
    }

    return () => {
      subscription.unsubscribe();
      appUrlListener?.remove();
    };
  }, []);

  // Flag to skip auto-save when we receive an external update (e.g. from coach)
  const skipAutoSaveRef = useRef(false);
  const routineSaveRef = useRef(null);
  const isLocalSaveRef = useRef(0);

  // ── Load data from Supabase when user logs in ─────────────────────────
  useEffect(() => {
    if (!authUser) return;
    const uid = authUser.id;

    // Load workout history
    loadWorkoutHistory(uid).then(history => {
      if (history.length > 0) setWorkoutHistory(history);
    }).catch(console.error);

    // Load body weights
    loadBodyWeights(uid).then(weights => {
      if (weights.length > 0) setWeightLog(weights);
    }).catch(console.error);

    // Load measurements
    loadMeasurements(uid).then(measurements => {
      if (measurements.length > 0) setMeasureLog(measurements);
    }).catch(console.error);

    // Load routine
    skipAutoSaveRef.current = true;
    loadRoutine(uid).then(routine => {
      if (routine) {
        setTemplates(routine);
        setTodayType(routine[getToday()]?.type || 'Custom');
        scheduleDailyRoutine(routine);
      }
      // Allow auto-save after initial load settles
      setTimeout(() => { skipAutoSaveRef.current = false; }, 3000);
    }).catch(() => { skipAutoSaveRef.current = false; });

    // Load coach links once at root level
    loadCoachLinks(uid).then(links => {
      setCoachLinks(links);
      setCoachLinksLoaded(true);
    }).catch(() => setCoachLinksLoaded(true));
    const channel = supabase
      .channel('routine-updates')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'routines', filter: `user_id=eq.${uid}` },
        () => {
          if (Date.now() - isLocalSaveRef.current < 15000) return; // Ignore echo of local save (up to 15s delay)

          triggerCoachEditNotification();
          // Coach saved a change — re-fetch the full routine
          skipAutoSaveRef.current = true;
          loadRoutine(uid).then(routine => {
            if (routine) {
              setTemplates(routine);
              setTodayType(routine[getToday()]?.type || 'Custom');
            }
            setTimeout(() => { skipAutoSaveRef.current = false; }, 3000);
          }).catch(() => { skipAutoSaveRef.current = false; });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [authUser?.id]);

  useEffect(() => {
    if (!authUser) return;
    // Don't auto-save if this change came from a coach update or initial load
    if (skipAutoSaveRef.current) return;
    clearTimeout(routineSaveRef.current);
    routineSaveRef.current = setTimeout(() => {
      isLocalSaveRef.current = Date.now();
      saveRoutine(authUser.id, templates).catch(console.error);
      scheduleDailyRoutine(templates);
    }, 2000);
    return () => clearTimeout(routineSaveRef.current);
  }, [templates, authUser?.id]);

  // Only show prompt when exercises are added/removed (not value edits)
  const handleTabClick = (next) => {
    if (tab==="log" && exercisesChanged && next!=="log") {
      setPendingTab(next); setShowPrompt(true);
    } else { setTab(next); }
  };

  const resolvePrompt = (save) => {
    if (save) {
      const day = getToday();
      setPrevTemplates({ ...templates });
      setTemplates(p => ({ ...p, [day]:{ ...p[day], type: todayType, exercises:session.map(e => e.name) } }));
      showUndo("Template updated");
    }
    setExercisesChanged(false); setShowPrompt(false);
    if (pendingTab) { setTab(pendingTab); setPendingTab(null); }
  };

  // Undo system
  const showUndo = (msg) => {
    setUndoToast(msg);
    setTimeout(() => setUndoToast(null), 5000);
  };
  const revertTemplates = () => {
    if (prevTemplates) {
      setTemplates(prevTemplates);
      setPrevTemplates(null);
      setUndoToast(null);
    }
  };

  // Sync today's session whenever the template for today changes (only when not mid-workout)
  const todayKey = getToday();
  useEffect(() => {
    if (workoutActive) return;
    const tmpl = templates[todayKey];
    setSession(
      tmpl.exercises.map((name, i) => ({
        id: Date.now() + i, name,
        sets: isCardioExercise(name)
          ? [{ id: `${Date.now()+i}-0`, dist:"", dur:"", done:false }]
          : Array.from({ length:3 }, (_, si) => ({ id:`${Date.now()+i}-${si}`, w:"", r:"", done:false })),
      }))
    );
    setTodayType(tmpl.type);
  }, [templates[todayKey].exercises.join(','), templates[todayKey].type]);

  const TABS = [
    { id:"log",      label:"Log"      },
    { id:"routine",  label:"Routine"  },
    { id:"body",     label:"Body"     },
    { id:"progress", label:"Progress" },
    { id:"prs",      label:"Records"  },
  ];

  // ── Android back button handler ──────────────────────────────────────
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const handler = CapApp.addListener('backButton', ({ canGoBack }) => {
      // Priority: close any overlay first
      if (tab === 'profile') { setTab('log'); return; }
      if (tab !== 'log') { setTab('log'); return; }
      // On Log tab with nothing open → minimize app
      CapApp.minimizeApp();
    });
    return () => { handler.then(h => h.remove()); };
  }, [tab]);

  // Show a minimal loading screen while Supabase checks for an existing session
  if (authLoading) return (
    <div style={{ background:BG, height:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ width:"32px", height:"32px", borderRadius:"50%", border:`3px solid ${MT}`, borderTopColor:A, animation:"spin 0.8s linear infinite" }}/>
    </div>
  );

  if (!authUser) return (
    <LoginScreen authError={authError} onClearError={() => setAuthError(null)}/>
  );

  return (
    <div style={{ background:BG, minHeight:"100vh",
      fontFamily:"-apple-system,'Helvetica Neue',Helvetica,sans-serif",
      color:TX, position:"relative", paddingBottom:"76px" }}>

      <style>{`
        @keyframes screenIn { from { opacity:0; } to { opacity:1; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        .screen-enter { animation: screenIn 0.18s ease forwards; }
        .press-scale { -webkit-tap-highlight-color: transparent; }
        .press-scale:active { opacity: 0.75; }
        *::-webkit-scrollbar { display: none; }
        * { scrollbar-width: none; -ms-overflow-style: none; }
      `}</style>

      <div key={tab} className="screen-enter">
        {tab==="log"      && <LogScreen session={session} setSession={setSession} templates={templates} setTemplates={setTemplates} exercisesChanged={exercisesChanged} setExercisesChanged={setExercisesChanged} todayType={todayType} setTodayType={setTodayType} setPrevTemplates={setPrevTemplates} showUndo={showUndo} workoutActive={workoutActive} setWorkoutActive={setWorkoutActive} workoutPaused={workoutPaused} setWorkoutPaused={setWorkoutPaused} workoutElapsed={workoutElapsed} setWorkoutElapsed={setWorkoutElapsed} workoutStartTime={workoutStartTime} setWorkoutStartTime={setWorkoutStartTime} workoutHistory={workoutHistory} setWorkoutHistory={setWorkoutHistory} profile={profile} onProfileTap={() => setTab("profile")} units={profile.units||"imperial"} hasCustomizedRoutine={hasCustomizedRoutine} setHasCustomizedRoutine={setHasCustomizedRoutine} authUser={authUser}/>}
        {tab==="routine"  && <RoutineScreen templates={templates} setTemplates={setTemplates} setPrevTemplates={setPrevTemplates} showUndo={showUndo} profile={profile} onProfileTap={() => setTab("profile")} onCustomized={() => setHasCustomizedRoutine(true)} authUser={authUser} coachLinks={coachLinks} setCoachLinks={setCoachLinks} coachLinksLoaded={coachLinksLoaded} onOpenAthlete={(view) => setAthleteView(view)} athleteView={athleteView}/>}
        {tab==="body"     && <BodyScreen weightLog={weightLog} setWeightLog={setWeightLog} measureLog={measureLog} setMeasureLog={setMeasureLog} measureFields={measureFields} setMeasureFields={setMeasureFields} profile={profile} onProfileTap={() => setTab("profile")} units={profile.units||"imperial"} authUser={authUser}/>}
        {tab==="progress" && <ProgressScreen profile={profile} onProfileTap={() => setTab("profile")} workoutHistory={workoutHistory} units={profile.units||"imperial"}/>}
        {tab==="prs"      && <PRsScreen prs={prs} profile={profile} onProfileTap={() => setTab("profile")} units={profile.units||"imperial"} workoutHistory={workoutHistory}/>}
        {tab==="profile"  && <ProfileScreen profile={profile} setProfile={setProfile} workoutHistory={workoutHistory} onSignOut={() => { setAuthUser(null); setShowTour(false); setHasCustomizedRoutine(false); }}/>}
      </div>

      {/* AthleteView rendered outside animation wrapper so position:fixed works correctly */}
      {athleteView && (
        <AthleteView
          athleteView={athleteView}
          setAthleteView={setAthleteView}
          athleteId={coachLinks.find(l => l.athlete_name === athleteView.name && l.coach_id === authUser?.id)?.athlete_id}
          todayDay={getToday()}
          onRoutineUpdated={(newRoutine) => setAthleteView(p => ({ ...p, routine: newRoutine }))}
        />
      )}

      {/* ── SAVE PROMPT (only for exercise add/remove) ── */}
      {showPrompt && (
        <div onClick={() => resolvePrompt(false)} style={{ position:"fixed", top:0, bottom:0, left:0, right:0, width:"100%", background:"rgba(0,0,0,0.8)", display:"flex", alignItems:"flex-end", zIndex:200 }}>
          <div onClick={e => e.stopPropagation()} style={{ background:S1, borderRadius:"20px 20px 0 0", padding:"20px 24px 34px", width:"100%", border:`1px solid ${BD}`, boxSizing:"border-box" }}>
            <div style={{ width:"36px", height:"4px", background:MT, borderRadius:"2px", margin:"0 auto 20px" }}/>
            <div style={{ fontSize:"17px", fontWeight:"700", marginBottom:"8px" }}>Update Template?</div>
            <div style={{ fontSize:"13px", color:SB, lineHeight:"1.6", marginBottom:"22px" }}>
              You changed exercises in today's{" "}
              <span style={{ color:TYPE_COLORS[todayType]||TX, fontWeight:"600" }}>
                {todayType} Day
              </span>.
              Save to the weekly template?
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

      {/* ── UNDO TOAST ── */}
      {undoToast && (
        <div style={{ position:"fixed", bottom:"86px", left:"50%", transform:"translateX(-50%)", background:S2, border:`1px solid ${BD}`, borderRadius:"10px", padding:"10px 16px", display:"flex", alignItems:"center", gap:"12px", zIndex:150, maxWidth:"360px" }}>
          <span style={{ fontSize:"13px", color:TX, flex:1 }}>{undoToast}</span>
          <button onClick={revertTemplates} style={{ background:"none", border:`1px solid ${A}`, borderRadius:"6px", color:A, cursor:"pointer", padding:"4px 12px", fontSize:"12px", fontWeight:"600" }}>Undo</button>
        </div>
      )}

      {/* ── IN-APP TOUR ── */}
      {showTour && <TourOverlay onDone={() => { setShowTour(false); setTab("routine"); }}/>}

      {/* ── TAB BAR ── */}
      <div style={{ position:"fixed", bottom:0, left:0, right:0, width:"100%", background:"rgba(8,8,8,0.97)", backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)", borderTop:`1px solid ${BD}`, display:"flex", paddingTop:"10px", paddingBottom:"22px", zIndex:100 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => handleTabClick(t.id)} style={{ flex:1, background:"none", border:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:"4px", color:tab===t.id?A:SB, fontSize:"11px", fontWeight:tab===t.id?"700":"400", letterSpacing:"0.05em", textTransform:"uppercase", transition:"color 0.15s", WebkitTapHighlightColor:"transparent", padding:"2px 0" }}>
            <div style={{ transform: tab===t.id ? "scale(1.08)" : "scale(1)", transition:"transform 0.15s cubic-bezier(0.34,1.56,0.64,1)" }}>
              <TabIcon id={t.id} active={tab===t.id}/>
            </div>
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
function LogScreen({ session, setSession, templates, setTemplates, exercisesChanged, setExercisesChanged, todayType, setTodayType, setPrevTemplates, showUndo, workoutActive, setWorkoutActive, workoutPaused, setWorkoutPaused, workoutElapsed, setWorkoutElapsed, workoutStartTime, setWorkoutStartTime, workoutHistory, setWorkoutHistory, profile, onProfileTap, units, hasCustomizedRoutine, setHasCustomizedRoutine, authUser }) {
  const [showAddEx,        setShowAddEx]        = useState(false);
  const [newExName,        setNewExName]        = useState("");
  const [showTypePick,     setShowTypePick]     = useState(false);
  const [collapsed,        setCollapsed]        = useState({});
  const [showHistory,      setShowHistory]      = useState(false);
  const [showEndConfirm,   setShowEndConfirm]   = useState(false);
  const [showTemplatePrompt, setShowTemplatePrompt] = useState(false);
  const [removeConfirmId,  setRemoveConfirmId]  = useState(null);
  const timerRef = useRef(null);

  const wUnit = units === "metric" ? "kg" : "lbs";
  const dUnit = units === "metric" ? "km" : "mi";

  const dayKey    = getToday();
  const dayLong   = fmtDayLong();
  const doneSets  = session.reduce((a,ex) => a + ex.sets.filter(s => s.done).length, 0);
  const totalSets = session.reduce((a,ex) => a + ex.sets.length, 0);
  const totalVol  = session.reduce((a,ex) => a + ex.sets.reduce((s,set) => {
    if (!set.done) return s;
    return s + (parseFloat(set.w)||0) * (parseInt(set.r)||0);
  }, 0), 0);

  // Rest timer state (local to LogScreen)
  const [restTimer, setRestTimer] = useState(null); // { total, remaining, exName, active }
  const [customRest, setCustomRest] = useState({}); // exId → override seconds
  const [activeStopwatch, setActiveStopwatch] = useState(null); // { exId, setId, name }
  const restRef = useRef(null);
  const notifTimeoutRef = useRef(null);

  const getPrevTime = (exName) => {
    for (let i = workoutHistory.length - 1; i >= 0; i--) {
      const w = workoutHistory[i];
      if (!w.session) continue;
      const match = w.session.find(e => e.name.toLowerCase() === exName.toLowerCase());
      if (match && match.sets) {
        let maxT = 0;
        for (const s of match.sets) {
          if (s.done && s.r) maxT = Math.max(maxT, Number(s.r));
        }
        if (maxT > 0) return maxT;
      }
    }
    return null;
  };


  const handleStopwatchSave = (timeInSecs) => {
    if (!activeStopwatch) return;
    const { exId, setId } = activeStopwatch;
    setSession(p => p.map(ex => {
      if (ex.id !== exId) return ex;
      return { ...ex, sets: ex.sets.map(s => s.id === setId ? { ...s, r: timeInSecs, done: true } : s) };
    }));
    setActiveStopwatch(null);
  };

  // Workout timer
  useEffect(() => {
    if (workoutActive && !workoutPaused) {
      timerRef.current = setInterval(() => setWorkoutElapsed(p => p + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [workoutActive, workoutPaused]);

  // Rest timer countdown
  useEffect(() => {
    if (restTimer?.active && restTimer.remaining > 0) {
      restRef.current = setInterval(() => {
        setRestTimer(p => p ? { ...p, remaining: p.remaining - 1 } : null);
      }, 1000);
    } else {
      clearInterval(restRef.current);
      if (restTimer?.active && restTimer.remaining === 0) {
        fireRestNotification(restTimer.exName);
        setTimeout(() => setRestTimer(null), 2000);
      }
    }
    return () => clearInterval(restRef.current);
  }, [restTimer?.active, restTimer?.remaining]);

  // Request notification permission once
  useEffect(() => {
    requestNotificationPermissions();
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const fireRestNotification = async (exName) => {
    playRestTimerBeep();
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("Rest complete — time to lift!", {
        body: `Your rest after ${exName} is done. Get back to it!`,
        icon: "/favicon.ico",
        silent: false,
      });
    }
    // High-fidelity native haptics
    try {
      if (Capacitor.isNativePlatform()) {
        await Haptics.vibrate();
        setTimeout(() => Haptics.vibrate().catch(()=>{}), 300);
      } else {
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      }
    } catch(e) {}
  };

  const startRest = (exId, exName) => {
    const base = customRest[exId] ?? getDefaultRest();
    clearTimeout(notifTimeoutRef.current);
    // Schedule notification for when background
    notifTimeoutRef.current = setTimeout(() => fireRestNotification(exName), base * 1000);
    setRestTimer({ total: base, remaining: base, exName, active: true });
  };

  const skipRest = () => { clearTimeout(notifTimeoutRef.current); setRestTimer(null); };

  const adjustRest = (delta) => {
    setRestTimer(p => {
      if (!p) return null;
      const newRemaining = Math.max(1, p.remaining + delta);
      const newTotal = Math.max(p.total, newRemaining);
      return { ...p, remaining: newRemaining, total: newTotal };
    });
  };

  const startWorkout = () => {
    // Pre-fill sets with last known values from workout history
    setSession(p => p.map(ex => {
      if (isCardioExercise(ex.name)) return ex;
      let lastW = "", lastR = "";
      for (const w of workoutHistory) {
        const found = w.exercises?.find(e => e.name === ex.name);
        if (found && found.sets?.length > 0) {
          const lastSet = found.sets[found.sets.length - 1];
          lastW = lastSet.w || "";
          lastR = lastSet.r || "";
          break;
        }
      }
      if (!lastW && !lastR) return ex;
      return {
        ...ex,
        sets: ex.sets.map(s => ({ ...s, w: s.w || lastW, r: s.r || lastR })),
      };
    }));
    setWorkoutActive(true);
    setWorkoutPaused(false);
    setWorkoutElapsed(0);
    setWorkoutStartTime(new Date().toISOString());
  };

  // Workout summary state — shown between End Workout and the template prompt
  const [workoutSummary, setWorkoutSummary] = useState(null);

  const endWorkout = () => {
    setShowEndConfirm(false);
    setRestTimer(null);
    clearTimeout(notifTimeoutRef.current);
    // Only save if there are completed sets with actual values
    const completedExercises = session.map(ex => ({
      name: ex.name,
      sets: ex.sets.filter(s => {
        if (!s.done) return false;
        if (isCardioExercise(ex.name)) return s.dist || s.dur;
        return s.w || s.r;
      }).map(s => isCardioExercise(ex.name) ? { dist: s.dist, dur: s.dur } : { w: s.w, r: s.r }),
    })).filter(ex => ex.sets.length > 0);

    // Build summary before resetting state
    const summary = {
      type: todayType,
      duration: workoutElapsed,
      totalSets: doneSets,
      totalVolume: totalVol,
      exercises: completedExercises,
    };

    if (completedExercises.length > 0) {
      const entry = {
        id: Date.now(),
        date: todayStr(),
        type: todayType,
        duration: workoutElapsed,
        startedAt: workoutStartTime,
        exercises: completedExercises,
        totalSets: doneSets,
        totalVolume: totalVol,
      };
      setWorkoutHistory(p => {
        const newHistory = [entry, ...p];
        
        let streak = 1;
        for (let i = 0; i < newHistory.length - 1; i++) {
          const d1 = new Date(newHistory[i].date).getTime();
          const d2 = new Date(newHistory[i+1].date).getTime();
          const diffDays = Math.floor((d1 - d2) / (1000 * 60 * 60 * 24));
          if (diffDays <= 2) streak++; // Allow skipping 1 day
          else break;
        }
        scheduleStreakReminder(streak);
        
        return newHistory;
      });

      scheduleReflection(completedExercises);

      // Save to Supabase in background (if user is logged in)
      if (authUser) {
        saveCompletedWorkout(authUser.id, {
          type: todayType,
          startedAt: workoutStartTime || new Date().toISOString(),
          duration: workoutElapsed,
          exercises: completedExercises,
          totalSets: doneSets,
          totalVolume: totalVol,
        }).catch(console.error);
      }
    }

    setWorkoutActive(false);
    setWorkoutPaused(false);
    setWorkoutElapsed(0);
    setWorkoutStartTime(null);

    // Show workout summary first, template prompt comes after
    setWorkoutSummary(summary);
  };

  const dismissSummary = () => {
    setWorkoutSummary(null);
    setShowTemplatePrompt(true);
  };

  const resetSession = (exercises) => {
    setSession(
      exercises.map((name, i) => ({
        id: Date.now() + i, name,
        sets: isCardioExercise(name)
          ? [{ id: `${Date.now()+i}-0`, dist:"", dur:"", done: false }]
          : Array.from({ length: 3 }, (_, si) => ({ id: `${Date.now()+i}-${si}`, w:"", r:"", done: false })),
      }))
    );
  };

  const resolveTemplatePrompt = (save) => {
    const day = dayKey;
    const currentExercises = session.map(e => e.name);
    if (save) {
      setPrevTemplates({ ...templates });
      setTemplates(p => ({ ...p, [day]: { ...p[day], type: todayType, exercises: currentExercises } }));
      showUndo("Routine updated");
      // Reset using the (now-saved) current exercises
      resetSession(currentExercises);
    } else {
      // Reset using the stored template (ignoring any mid-workout changes)
      resetSession(templates[day].exercises);
    }
    setExercisesChanged(false);
    setShowTemplatePrompt(false);
  };

  // Only mark exercises changed (not value edits)
  const markExChange = () => setExercisesChanged(true);

  // Switch workout type — also update the template
  const switchType = (newType) => {
    setTodayType(newType);
    setShowTypePick(false);
    const exercises = TYPE_EXERCISES[newType] || [];
    if (newType === "Rest") {
      setSession([]);
    } else {
      setSession(exercises.map((name, i) => ({
        id: Date.now() + i, name,
        sets: isCardioExercise(name)
          ? [{ id: `${Date.now()+i}-0`, dist:"", dur:"", done: false }]
          : Array.from({ length: 3 }, (_, si) => ({ id: `${Date.now()+i}-${si}`, w:"", r:"", done: false })),
      })));
    }
    setPrevTemplates({ ...templates });
    setTemplates(p => ({ ...p, [dayKey]: { ...p[dayKey], type: newType, exercises } }));
    showUndo(`Switched to ${newType}`);
  };

  const toggleSet = (exId, setId) => {
    const targetEx = session.find(ex => ex.id === exId);
    const targetSet = targetEx?.sets.find(s => s.id === setId);
    if (!targetEx || !targetSet) return;

    const isCompleting = !targetSet.done;
    if (isCompleting) {
      const isCardio = isCardioExercise(targetEx.name);
      const isEmpty = isCardio ? (!targetSet.dist && !targetSet.dur) : (!targetSet.w && !targetSet.r);
      if (isEmpty) return; // Block clicking if completely empty
    }

    setSession(p => {
      const updated = p.map(ex => {
        if (ex.id !== exId) return ex;
        let newSets = ex.sets.map(s => s.id === setId ? { ...s, done: !s.done } : s);
        // Carry forward weight/reps to next undone set when completing
        if (isCompleting && !isCardioExercise(ex.name)) {
          const doneIdx = newSets.findIndex(s => s.id === setId);
          const nextIdx = doneIdx + 1;
          if (nextIdx < newSets.length && !newSets[nextIdx].done) {
            const done = newSets[doneIdx];
            newSets = newSets.map((s, i) => i !== nextIdx ? s : {
              ...s,
              w: done.w || s.w,
              r: done.r || s.r,
            });
          }
        }
        return { ...ex, sets: newSets };
      });

      if (isCompleting) {
        const thisEx = updated.find(ex => ex.id === exId);
        const exAllDone = thisEx?.sets.every(s => s.done);

        // Auto-collapse exercise when all its sets are completed
        if (exAllDone) {
          setTimeout(() => setCollapsed(c => ({ ...c, [exId]: true })), 400);
        }

        // Check if ALL exercises are done → prompt to end
        const allDone = updated.every(ex => ex.sets.length > 0 && ex.sets.every(s => s.done));
        if (allDone) {
          setTimeout(() => setShowEndConfirm(true), 500);
        }
      }

      return updated;
    });

    // Start rest timer outside the updater (side-effect-safe)
    if (isCompleting && workoutActive && targetEx) {
      setTimeout(() => startRest(exId, targetEx.name), 150);
    }
  };

  const updateSet = (exId, setId, field, value) => {
    setSession(p => p.map(ex => ex.id === exId ? {
      ...ex,
      sets: ex.sets.map(s => s.id === setId ? { ...s, [field]: value } : s)
    } : ex));
  };

  const removeSet = (exId, setId) => {
    setSession(p => p.map(ex => ex.id === exId ? {
      ...ex, sets: ex.sets.filter(s => s.id !== setId)
    } : ex));
  };

  // Add a new set — carries over values from the last set, respects per-exercise type
  const addSetToEx = (exId) => {
    setSession(p => p.map(ex => {
      if (ex.id !== exId) return ex;
      const lastSet = ex.sets[ex.sets.length - 1];
      const exIsCardio = isCardioExercise(ex.name);
      const newSet = exIsCardio
        ? { id: `${exId}-${Date.now()}`, dist: lastSet?.dist || "", dur: lastSet?.dur || "", done: false }
        : { id: `${exId}-${Date.now()}`, w: lastSet?.w || "", r: lastSet?.r || "", done: false };
      return { ...ex, sets: [...ex.sets, newSet] };
    }));
  };

  const removeExercise = (id) => { setSession(p => p.filter(ex => ex.id !== id)); markExChange(); };

  // Add exercise — per-exercise type detection
  const addExercise = () => {
    if (!newExName.trim()) return;
    const id = Date.now();
    const name = newExName.trim();
    const exIsCardio = isCardioExercise(name);
    setSession(p => [...p, {
      id, name,
      sets: exIsCardio
        ? [{ id: `${id}-0`, dist:"", dur:"", done: false }]
        : Array.from({ length: 3 }, (_, si) => ({ id: `${id}-${si}`, w:"", r:"", done: false })),
    }]);
    markExChange(); setNewExName(""); setShowAddEx(false);
  };

  const toggleCollapse = (exId) => setCollapsed(p => ({ ...p, [exId]: !p[exId] }));

  // Rest day
  if (todayType === "Rest" && !workoutActive) return (
    <div>
      <div style={{ padding:"52px 16px 20px", borderBottom:`1px solid ${BD}` }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"4px" }}>
          <span style={{ ...subLbl, marginBottom:0 }}>{dayKey} · Rest Day</span>
          <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
            {workoutHistory.length > 0 && (
              <button onClick={() => setShowHistory(!showHistory)} style={{ background:"none", border:`1px solid ${MT}`, borderRadius:"6px", color:SB, cursor:"pointer", padding:"3px 10px", fontSize:"11px" }}>History</button>
            )}
            <button onClick={onProfileTap} style={{ width:"28px", height:"28px", borderRadius:"50%", background: profile.setup ? profile.color : MT, border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"11px", fontWeight:"700", color:"#000", flexShrink:0 }}>
              {profile.setup ? profile.initials : "?"}
            </button>
          </div>
        </div>
        <div style={{ fontSize:"30px", fontWeight:"700", letterSpacing:"-0.04em", marginBottom:"18px" }}>
          {dayLong.split(",")[0]}, {dayLong.split(", ")[1]}
        </div>
      </div>
      {showHistory ? renderHistory() : (
        <div style={{ padding:"60px 24px", textAlign:"center" }}>
          <div style={{ fontSize:"20px", fontWeight:"700", marginBottom:"8px" }}>Rest Day</div>
          <div style={{ fontSize:"14px", color:SB, marginBottom:"24px" }}>Scheduled rest. Recover well.</div>
          <button onClick={() => setShowTypePick(true)} style={{ ...btnGhost, fontSize:"12px", padding:"8px 16px" }}>
            Switch to a workout
          </button>
          {showTypePick && (
            <div style={{ display:"flex", flexWrap:"wrap", gap:"6px", marginTop:"16px", justifyContent:"center" }}>
              {WORKOUT_TYPES.filter(t => t !== "Rest").map(wt => (
                <button key={wt} onClick={() => switchType(wt)} style={{ background:S2, color:TYPE_COLORS[wt]||SB, border:`1px solid ${MT}`, borderRadius:"6px", padding:"5px 12px", fontSize:"12px", cursor:"pointer", fontWeight:"500" }}>
                  {wt}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  function renderHistory() {
    return (
      <div style={{ padding:"12px" }}>
        <div style={{ ...subLbl, paddingLeft:"4px", marginBottom:"10px" }}>Workout History</div>
        {workoutHistory.length === 0 && <div style={{ textAlign:"center", padding:"40px 0", color:MT, fontSize:"13px" }}>No workouts recorded yet.</div>}
        {workoutHistory.map(w => (
          <div key={w.id} style={{ ...card, padding:"14px 18px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"10px" }}>
              <div>
                <div style={{ fontSize:"17px", fontWeight:"600" }}>{fmtDate(w.date)}</div>
                <div style={{ fontSize:"14px", color:TYPE_COLORS[w.type]||SB, fontWeight:"600", marginTop:"2px" }}>{w.type}</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:"18px", fontWeight:"700", color:A, letterSpacing:"-0.03em" }}>{fmtTimer(w.duration)}</div>
                <div style={{ fontSize:"10px", color:SB }}>duration</div>
              </div>
            </div>
            <div style={{ display:"flex", gap:"20px", marginBottom:"10px" }}>
              <div>
                <span style={{ fontSize:"16px", fontWeight:"700" }}>{w.totalSets}</span>
                <span style={{ fontSize:"11px", color:SB, marginLeft:"4px" }}>sets</span>
              </div>
              {w.totalVolume > 0 && (
                <div>
                  <span style={{ fontSize:"16px", fontWeight:"700" }}>{w.totalVolume >= 1000 ? `${(w.totalVolume/1000).toFixed(1)}k` : w.totalVolume}</span>
                  <span style={{ fontSize:"11px", color:SB, marginLeft:"4px" }}>lbs</span>
                </div>
              )}
              <div>
                <span style={{ fontSize:"16px", fontWeight:"700" }}>{w.exercises.length}</span>
                <span style={{ fontSize:"11px", color:SB, marginLeft:"4px" }}>exercises</span>
              </div>
            </div>
            <div style={{ borderTop:`1px solid ${MT}`, paddingTop:"8px" }}>
              {w.exercises.map((ex, ei) => (
                <div key={ei} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"3px 0" }}>
                  <span style={{ fontSize:"15px", color:TX }}>{ex.name}</span>
                  <span style={{ fontSize:"14px", color:SB }}>{ex.sets.length} sets</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Rest time label for an exercise
  const restLabel = (exId, exName) => {
    const secs = customRest[exId] ?? getDefaultRest();
    return secs >= 60 ? `${secs/60}m` : `${secs}s`;
  };

  return (
    <div>
      {/* ── Header (sticky so timer stays visible while scrolling) ── */}
      <div style={{ position:"sticky", top:0, zIndex:50, background:BG, padding:"52px 16px 16px", borderBottom:`1px solid ${BD}` }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"4px" }}>
          <button onClick={() => setShowTypePick(!showTypePick)} style={{ ...subLbl, marginBottom:0, background:"none", border:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:"4px" }}>
            <span style={{ color: TYPE_COLORS[todayType] || SB }}>{dayKey} · {todayType} Day</span>
            <span style={{ fontSize:"10px", color:SB, transform: showTypePick ? "rotate(180deg)" : "none", transition:"transform 0.2s" }}>⌄</span>
          </button>
          <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
            {workoutHistory.length > 0 && (
              <button onClick={() => setShowHistory(!showHistory)} style={{ background:"none", border:`1px solid ${MT}`, borderRadius:"6px", color: showHistory ? A : SB, cursor:"pointer", padding:"3px 10px", fontSize:"11px" }}>
                {showHistory ? "Back" : "History"}
              </button>
            )}
            <button onClick={onProfileTap} style={{ width:"28px", height:"28px", borderRadius:"50%", background: profile.setup ? profile.color : MT, border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"11px", fontWeight:"700", color:"#000", flexShrink:0 }}>
              {profile.setup ? profile.initials : "?"}
            </button>
          </div>
        </div>

        {showTypePick && !showHistory && (
          <div style={{ display:"flex", flexWrap:"wrap", gap:"6px", marginBottom:"10px", marginTop:"8px" }}>
            {WORKOUT_TYPES.map(wt => (
              <button key={wt} onClick={() => switchType(wt)} style={{
                background: todayType===wt ? A : S2, color: todayType===wt ? "#000" : (TYPE_COLORS[wt]||SB),
                border: `1px solid ${todayType===wt ? A : MT}`, borderRadius:"6px", padding:"5px 12px", fontSize:"12px", cursor:"pointer",
                fontWeight: todayType===wt ? "700" : "400"
              }}>{wt}</button>
            ))}
          </div>
        )}

        <div style={{ fontSize:"32px", fontWeight:"700", letterSpacing:"-0.04em", marginBottom:"14px" }}>
          {dayLong.split(",")[0]}, {dayLong.split(", ")[1]}
        </div>

        {/* ── Workout controls + timer ── */}
        {!showHistory && (
          <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"12px" }}>
            {!workoutActive ? (
              <button onClick={startWorkout} style={{ display:"flex", alignItems:"center", gap:"6px", background:A, border:"none", borderRadius:"10px", color:"#000", fontWeight:"700", fontSize:"16px", padding:"10px 20px", cursor:"pointer", flexShrink:0 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="#000"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Start
              </button>
            ) : (
              <>
                {/* Timer display */}
                <div style={{ flex:1, background:S2, borderRadius:"10px", padding:"8px 12px", border:`1px solid ${workoutPaused ? "#FFD166" : BD}`, display:"flex", alignItems:"center", gap:"8px" }}>
                  <div style={{ width:"7px", height:"7px", borderRadius:"50%", background: workoutPaused ? "#FFD166" : A, flexShrink:0 }}/>
                  <span style={{ fontSize:"20px", fontWeight:"700", fontVariantNumeric:"tabular-nums", letterSpacing:"-0.02em", color: workoutPaused ? "#FFD166" : A }}>{fmtTimer(workoutElapsed)}</span>
                </div>
                {/* Pause */}
                <button onClick={() => setWorkoutPaused(!workoutPaused)} style={{ width:"36px", height:"36px", borderRadius:"10px", border:`1px solid ${MT}`, background:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  {workoutPaused
                    ? <svg width="14" height="14" viewBox="0 0 24 24" fill={A}><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    : <svg width="14" height="14" viewBox="0 0 24 24" fill={SB}><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                  }
                </button>
                {/* Stop */}
                <button onClick={() => setShowEndConfirm(true)} style={{ width:"36px", height:"36px", borderRadius:"10px", border:"none", background:RED, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="#fff"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
                </button>
              </>
            )}
          </div>
        )}

        {/* Stats row */}
        {!showHistory && (
          <div style={{ display:"flex", gap:"24px" }}>
            {[
              { val: totalVol>=1000 ? `${(totalVol/1000).toFixed(1)}k` : (totalVol||"—"), label:`${wUnit} vol`, hi:totalVol>0 },
              { val: `${doneSets}/${totalSets}`, label:"sets", hi: doneSets > 0 },
              { val: session.length, label:"exercises" },
            ].map((s,i) => (
              <div key={i}>
                <div style={{ fontSize:"24px", fontWeight:"700", letterSpacing:"-0.04em", color:s.hi?A:TX }}>{s.val}</div>
                <div style={subLbl}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Exercise Progress Bar — flush on top of tab bar ── */}
      {workoutActive && session.length > 0 && (() => {
        const doneEx = session.filter(ex => ex.sets.length > 0 && ex.sets.every(s => s.done)).length;
        const pct = doneEx / session.length;
        return (
          <div style={{ position:"fixed", bottom:"79px", left:0, right:0, width:"100%", zIndex:105, height:"4px", background:MT }}>
            <div style={{
              height:"100%",
              width:`${pct * 100}%`,
              background: `linear-gradient(90deg, ${A}cc, ${A})`,
              borderRadius:"0 3px 3px 0",
              transition:"width 0.6s cubic-bezier(0.4,0,0.2,1)",
              boxShadow: pct > 0 ? `0 0 12px ${A}99, 0 0 4px ${A}66` : "none",
            }}/>
          </div>
        );
      })()}

      {/* ── Rest Timer — slides up above the tab bar ── */}
      {restTimer && (
        <div style={{ position:"fixed", bottom:"88px", left:0, right:0, width:"100%", zIndex:110, padding:"0 12px", boxSizing:"border-box" }}>
          <div style={{
            background:`rgba(16,16,16,0.97)`,
            backdropFilter:"blur(16px)",
            WebkitBackdropFilter:"blur(16px)",
            border:`1px solid ${restTimer.remaining <= 5 ? RED+"88" : BD}`,
            borderRadius:"16px",
            padding:"12px 14px",
            display:"flex", alignItems:"center", gap:"10px",
            boxShadow:`0 -4px 24px rgba(0,0,0,0.5), 0 0 0 1px ${restTimer.remaining <= 5 ? RED+"33" : A+"11"}`,
          }}>
            {/* Progress ring */}
            <svg width="36" height="36" style={{ flexShrink:0, transform:"rotate(-90deg)" }}>
              <circle cx="18" cy="18" r="14" fill="none" stroke={MT} strokeWidth="3"/>
              <circle cx="18" cy="18" r="14" fill="none" stroke={restTimer.remaining <= 5 ? RED : A} strokeWidth="3"
                strokeDasharray={2 * Math.PI * 14}
                strokeDashoffset={2 * Math.PI * 14 * (1 - restTimer.remaining / restTimer.total)}
                strokeLinecap="round" style={{ transition:"stroke-dashoffset 1s linear" }}
              />
            </svg>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:"12px", color:SB, marginBottom:"1px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>Rest — {restTimer.exName}</div>
              <div style={{ fontSize:"22px", fontWeight:"700", fontVariantNumeric:"tabular-nums", color: restTimer.remaining <= 5 ? RED : TX, letterSpacing:"-0.02em" }}>
                {fmtTimer(restTimer.remaining)}
              </div>
            </div>
            <button onClick={() => adjustRest(-15)} style={{ background:"none", border:`1px solid ${MT}`, borderRadius:"8px", color:SB, cursor:"pointer", padding:"7px 12px", fontSize:"14px", fontWeight:"600", flexShrink:0 }}>−15</button>
            <button onClick={() => adjustRest(+15)} style={{ background:`${A}15`, border:`1px solid ${A}44`, borderRadius:"8px", color:A, cursor:"pointer", padding:"7px 12px", fontSize:"14px", fontWeight:"600", flexShrink:0 }}>+15</button>
            <button onClick={skipRest} style={{ background:"none", border:`1px solid ${MT}`, borderRadius:"8px", color:SB, cursor:"pointer", padding:"7px 13px", fontSize:"13px", flexShrink:0 }}>Skip</button>
          </div>
        </div>
      )}

      {showHistory ? renderHistory() : (
        <>
          {/* ── Exercises ── */}
          <div style={{ padding:"10px 6px 0" }}>

            {/* Setup routine prompt (first-time users) */}
            {!hasCustomizedRoutine && !workoutActive && (
              <div style={{ background:`linear-gradient(135deg, ${S1}, #0d1a00)`, border:`1px solid ${A}33`, borderRadius:"12px", padding:"16px 18px", marginBottom:"10px" }}>
                <div style={{ fontSize:"13px", fontWeight:"700", color:TX, marginBottom:"4px" }}>Personalize your routine first</div>
                <div style={{ fontSize:"12px", color:SB, lineHeight:"1.6", marginBottom:"12px" }}>The default schedule is pre-loaded. Tap below to customize your weekly exercises.</div>
                <button onClick={() => { setHasCustomizedRoutine(true); }} style={{ background:A, border:"none", borderRadius:"8px", color:"#000", fontWeight:"700", fontSize:"12px", padding:"8px 16px", cursor:"pointer" }}>
                  Got it, use defaults
                </button>
              </div>
            )}

            {/* Greyed-out overlay before workout starts */}
            {!workoutActive && session.length > 0 && (
              <div style={{ background:S2, border:`1px dashed ${MT}`, borderRadius:"12px", padding:"16px", textAlign:"center", marginBottom:"8px" }}>
                <div style={{ fontSize:"15px", color:SB }}>Press <span style={{ color:A, fontWeight:"700" }}>Start</span> to begin logging your sets</div>
              </div>
            )}

            <div style={{ opacity: workoutActive ? 1 : 0.35, pointerEvents: workoutActive ? "auto" : "none", transition:"opacity 0.3s" }}>
            {session.map(ex => {
              const exDone = ex.sets.length > 0 && ex.sets.every(s => s.done);
              const isCol = collapsed[ex.id];
              const exIsCardio = isCardioExercise(ex.name);
              const exIsTimed = isTimedExercise(ex.name);
              const defaultRest = customRest[ex.id] ?? getDefaultRest();
              return (
                <div key={ex.id} style={{ ...card, borderColor: exDone ? A : BD, opacity: isCol ? 0.7 : 1 }}>
                  {/* Exercise header */}
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: isCol ? 0 : "10px" }}>
                    <button onClick={() => toggleCollapse(ex.id)} style={{ background:"none", border:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:"6px", padding:0 }}>
                      <span style={{ fontSize:"20px", fontWeight:"600", color: exDone ? A : TX }}>{ex.name}</span>
                      {exIsCardio && <span style={{ fontSize:"9px", background:"#06D6A0", color:"#000", borderRadius:"4px", padding:"1px 5px", fontWeight:"700" }}>CARDIO</span>}
                      {exDone && <span style={{ fontSize:"9px", background:A, color:"#000", borderRadius:"4px", padding:"1px 5px", fontWeight:"700" }}>DONE</span>}
                      <span style={{ fontSize:"10px", color:SB, transform: isCol ? "none" : "rotate(180deg)", transition:"transform 0.2s" }}>⌄</span>
                    </button>
                    {/* Remove with inline confirmation */}
                    {removeConfirmId === ex.id ? (
                      <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                        <span style={{ fontSize:"11px", color:SB }}>Remove?</span>
                        <button onClick={() => { removeExercise(ex.id); setRemoveConfirmId(null); }} style={{ background:"none", border:`1px solid ${RED}`, borderRadius:"6px", color:RED, cursor:"pointer", fontSize:"11px", padding:"3px 10px", fontWeight:"600" }}>Yes</button>
                        <button onClick={() => setRemoveConfirmId(null)} style={{ background:"none", border:`1px solid ${MT}`, borderRadius:"6px", color:SB, cursor:"pointer", fontSize:"11px", padding:"3px 10px" }}>No</button>
                      </div>
                    ) : (
                      <button onClick={() => setRemoveConfirmId(ex.id)} style={{ background:"none", border:"none", color:SB, cursor:"pointer", fontSize:"11px", padding:"3px 8px" }}>Remove</button>
                    )}
                  </div>

                  {!isCol && (
                    <>
                      {/* Column headers — per exercise type */}
                      <div style={{ display:"grid", gridTemplateColumns: exIsTimed ? "24px 1fr 1fr 44px 44px 20px" : "24px 1fr 1fr 44px 20px", gap: exIsTimed ? "4px" : "8px", alignItems:"center", padding:"0 0 8px" }}>
                        <span style={{ fontSize:"14px", color:MT, textAlign:"center" }}>#</span>
                        {exIsCardio ? (
                          <>
                            <span style={{ fontSize:"14px", color:SB, textTransform:"uppercase", letterSpacing:"0.06em", textAlign:"center" }}>Distance</span>
                            <span style={{ fontSize:"14px", color:SB, textTransform:"uppercase", letterSpacing:"0.06em", textAlign:"center" }}>Duration</span>
                          </>
                        ) : exIsTimed ? (
                          <>
                            <span style={{ fontSize:"12px", color:MT, textTransform:"uppercase", letterSpacing:"0.06em", textAlign:"center" }}>Prev Time</span>
                            <span style={{ fontSize:"14px", color:SB, textTransform:"uppercase", letterSpacing:"0.06em", textAlign:"center" }}>Time</span>
                          </>
                        ) : (
                          <>
                            <span style={{ fontSize:"14px", color:SB, textTransform:"uppercase", letterSpacing:"0.06em", textAlign:"center" }}>Weight</span>
                            <span style={{ fontSize:"14px", color:SB, textTransform:"uppercase", letterSpacing:"0.06em", textAlign:"center" }}>Reps</span>
                          </>
                        )}
                        <span/>
                        {exIsTimed && <span/>}
                        <span/>
                      </div>

                      {/* Set rows */}
                      {ex.sets.map((set, si) => (
                        <div key={set.id} style={{ display:"grid", gridTemplateColumns: exIsTimed ? "24px 1fr 1fr 44px 44px 20px" : "24px 1fr 1fr 44px 20px", gap: exIsTimed ? "4px" : "8px", alignItems:"center", padding:"10px 0", borderBottom: si < ex.sets.length-1 ? `1px solid ${MT}` : "none" }}>
                          <span style={{ fontSize:"16px", color: set.done ? A : MT, fontWeight:"600", textAlign:"center" }}>{si+1}</span>

                          {exIsCardio ? (
                            <>
                              <input
                                style={{ ...inputSt, width:"100%", fontSize:"19px", padding:"11px 6px", textAlign:"center", color: set.done ? A : TX, background: set.done ? "transparent" : S2, border: set.done ? `1px solid ${MT}` : `1px solid ${BD}` }}
                                type="number" inputMode="decimal" placeholder={dUnit}
                                value={set.dist} onChange={e => updateSet(ex.id, set.id, "dist", e.target.value)}
                                readOnly={set.done}
                              />
                              <input
                                style={{ ...inputSt, width:"100%", fontSize:"19px", padding:"11px 6px", textAlign:"center", color: set.done ? A : TX, background: set.done ? "transparent" : S2, border: set.done ? `1px solid ${MT}` : `1px solid ${BD}` }}
                                type="number" inputMode="numeric" placeholder="min"
                                value={set.dur} onChange={e => updateSet(ex.id, set.id, "dur", e.target.value)}
                                readOnly={set.done}
                              />
                            </>
                          ) : exIsTimed ? (
                            <>
                              <div style={{ width:"100%", fontSize:"19px", padding:"11px 6px", textAlign:"center", color: MT, background: "transparent", border: "none" }}>
                                {getPrevTime(ex.name) ? fmtTimer(getPrevTime(ex.name)) : "-:--"}
                              </div>
                              <div style={{ width:"100%", fontSize:"19px", padding:"11px 6px", textAlign:"center", color: set.done ? A : TX, background: set.done ? "transparent" : S2, border: set.done ? `1px solid ${MT}` : `1px solid ${BD}`, borderRadius: "10px", lineHeight: "19px" }}>
                                {fmtTimer(set.r ? Number(set.r) : 0)}
                              </div>
                            </>
                          ) : (
                            <>
                              <input
                                style={{ ...inputSt, width:"100%", fontSize:"19px", padding:"11px 6px", textAlign:"center", color: set.done ? A : TX, background: set.done ? "transparent" : S2, border: set.done ? `1px solid ${MT}` : `1px solid ${BD}` }}
                                type="number" inputMode="decimal" placeholder={wUnit}
                                value={set.w} onChange={e => updateSet(ex.id, set.id, "w", e.target.value)}
                                readOnly={set.done}
                              />
                              <input
                                style={{ ...inputSt, width:"100%", fontSize:"19px", padding:"11px 6px", textAlign:"center", color: set.done ? A : TX, background: set.done ? "transparent" : S2, border: set.done ? `1px solid ${MT}` : `1px solid ${BD}` }}
                                type="number" inputMode="numeric" placeholder="reps"
                                value={set.r} onChange={e => updateSet(ex.id, set.id, "r", e.target.value)}
                                readOnly={set.done}
                              />
                            </>
                          )}

                          <button onClick={() => toggleSet(ex.id, set.id)} style={{
                            width:"44px", height:"44px", borderRadius:"10px", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
                            background: set.done ? A : "none",
                            border: set.done ? "none" : `2px solid ${SB}`,
                            color: set.done ? "#000" : SB, fontSize:"18px", fontWeight:"700",
                          }}>
                            {set.done ? "✓" : ""}
                          </button>

                          {exIsTimed && (
                            <button onClick={() => setActiveStopwatch({ exId: ex.id, setId: set.id, name: ex.name })} style={{ width:"44px", height:"44px", borderRadius:"10px", background: S2, border:`1px solid ${BD}`, color:A, fontSize:"20px", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>
                              ⏱
                            </button>
                          )}

                          <button onClick={() => removeSet(ex.id, set.id)} style={{ background:"none", border:"none", color:MT, cursor:"pointer", fontSize:"16px", padding:0, textAlign:"center", lineHeight:1 }}>✕</button>
                        </div>
                      ))}

                      <button onClick={() => addSetToEx(ex.id)} style={{ width:"100%", background:"none", border:"none", cursor:"pointer", color:SB, fontSize:"15px", padding:"10px 0 2px", textAlign:"center" }}>
                        + Add Set
                      </button>
                    </>
                  )}
                </div>
              );
            })}
            </div>{/* end greyed-out wrapper */}

            {/* Add exercise */}
            {showAddEx && (
              <ExercisePicker onClose={() => setShowAddEx(false)} onSelect={(name) => {
                const exStr = name.trim();
                setShowAddEx(false);
                if (!exStr) return;
                setSession(p => {
                  const x = { id:Date.now(), name:exStr, sets:[{ id:1, w:"", r:"", done:false }] };
                  return [...p, x];
                });
                setExercisesChanged(true);
              }}/>
            )}
            
            <button onClick={() => setShowAddEx(true)} style={{ width:"100%", background:"none", border:`1px dashed ${MT}`, borderRadius:"12px", color:SB, cursor:"pointer", padding:"16px", fontSize:"16px", marginBottom:"16px", display:"flex", alignItems:"center", justifyContent:"center", gap:"6px" }}>
              <span style={{ fontSize:"18px", color:A }}>+</span> Add Exercise
            </button>
          </div>
        </>
      )}

      {/* ── Workout Summary Overlay ── */}
      {workoutSummary && (
        <div style={{ position:"fixed", top:0, bottom:0, left:0, right:0, width:"100%", background:"rgba(0,0,0,0.92)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:215 }}>
          <div onClick={e => e.stopPropagation()} style={{ background:S1, borderRadius:"24px", padding:"32px 24px", width:"calc(100% - 32px)", maxWidth:"380px", border:`1px solid ${BD}`, boxSizing:"border-box" }}>
            {/* Celebration icon */}
            <div style={{ textAlign:"center", marginBottom:"20px" }}>
              <div style={{ width:"64px", height:"64px", borderRadius:"50%", background:`${A}18`, border:`2px solid ${A}44`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto", fontSize:"28px" }}>💪</div>
            </div>
            <div style={{ textAlign:"center", marginBottom:"6px" }}>
              <span style={{ fontSize:"12px", color:TYPE_COLORS[workoutSummary.type]||SB, fontWeight:"600", letterSpacing:"0.08em", textTransform:"uppercase" }}>{workoutSummary.type} Day</span>
            </div>
            <div style={{ fontSize:"24px", fontWeight:"700", textAlign:"center", marginBottom:"24px", letterSpacing:"-0.03em" }}>Workout Complete!</div>

            {/* Stats grid */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"10px", marginBottom:"20px" }}>
              <div style={{ background:S2, borderRadius:"12px", padding:"14px 8px", textAlign:"center", border:`1px solid ${BD}` }}>
                <div style={{ fontSize:"24px", fontWeight:"700", color:A, letterSpacing:"-0.03em" }}>{fmtTimer(workoutSummary.duration)}</div>
                <div style={{ fontSize:"11px", color:SB, marginTop:"4px", textTransform:"uppercase", letterSpacing:"0.06em" }}>Duration</div>
              </div>
              <div style={{ background:S2, borderRadius:"12px", padding:"14px 8px", textAlign:"center", border:`1px solid ${BD}` }}>
                <div style={{ fontSize:"24px", fontWeight:"700", color:TX, letterSpacing:"-0.03em" }}>{workoutSummary.totalSets}</div>
                <div style={{ fontSize:"11px", color:SB, marginTop:"4px", textTransform:"uppercase", letterSpacing:"0.06em" }}>Sets</div>
              </div>
              <div style={{ background:S2, borderRadius:"12px", padding:"14px 8px", textAlign:"center", border:`1px solid ${BD}` }}>
                <div style={{ fontSize:"24px", fontWeight:"700", color:TX, letterSpacing:"-0.03em" }}>{workoutSummary.totalVolume >= 1000 ? `${(workoutSummary.totalVolume/1000).toFixed(1)}k` : workoutSummary.totalVolume}</div>
                <div style={{ fontSize:"11px", color:SB, marginTop:"4px", textTransform:"uppercase", letterSpacing:"0.06em" }}>{units === "metric" ? "kg" : "lbs"} Vol</div>
              </div>
            </div>

            {/* Exercise breakdown */}
            {workoutSummary.exercises.length > 0 && (
              <div style={{ background:S2, borderRadius:"12px", border:`1px solid ${BD}`, padding:"14px 16px", marginBottom:"24px" }}>
                <div style={{ fontSize:"11px", color:SB, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"10px" }}>Exercises Completed</div>
                {workoutSummary.exercises.map((ex, i) => (
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom: i < workoutSummary.exercises.length - 1 ? `1px solid ${MT}` : "none" }}>
                    <span style={{ fontSize:"15px", fontWeight:"500", color:TX }}>{ex.name}</span>
                    <span style={{ fontSize:"13px", color:A, fontWeight:"600" }}>{ex.sets.length} {ex.sets.length === 1 ? "set" : "sets"}</span>
                  </div>
                ))}
              </div>
            )}

            <button onClick={dismissSummary} style={{ ...btnPrim, width:"100%", padding:"16px", fontSize:"16px", display:"block" }}>
              Continue
            </button>
          </div>
        </div>
      )}

      {/* ── Update routine after workout ── */}
      {showTemplatePrompt && (
        <div style={{ position:"fixed", top:0, bottom:0, left:0, right:0, width:"100%", background:"rgba(0,0,0,0.85)", display:"flex", alignItems:"flex-end", zIndex:210 }}>
          <div onClick={e => e.stopPropagation()} style={{ background:S1, borderRadius:"20px 20px 0 0", padding:"24px 24px 110px", width:"100%", border:`1px solid ${BD}`, boxSizing:"border-box" }}>
            <div style={{ width:"36px", height:"4px", background:MT, borderRadius:"2px", margin:"0 auto 22px" }}/>
            <div style={{ fontSize:"20px", fontWeight:"700", marginBottom:"10px" }}>Save to Routine?</div>
            <div style={{ fontSize:"15px", color:SB, lineHeight:"1.6", marginBottom:"24px" }}>
              {exercisesChanged
                ? <>You changed the exercises for <span style={{ color: TYPE_COLORS[todayType] || TX, fontWeight:"600" }}>{todayType}</span>. Save this list to your weekly routine?</>
                : <>Save today's <span style={{ color: TYPE_COLORS[todayType] || TX, fontWeight:"600" }}>{todayType}</span> exercise list to your weekly routine?</>
              }
            </div>
            <button onClick={() => resolveTemplatePrompt(true)} style={{ ...btnPrim, width:"100%", padding:"16px", display:"block", marginBottom:"10px" }}>
              Yes, update routine
            </button>
            <button onClick={() => resolveTemplatePrompt(false)} style={{ ...btnGhost, width:"100%", padding:"16px", display:"block" }}>
              No, keep original
            </button>
          </div>
        </div>
      )}

      {/* ── Auto-end confirmation popup ── */}
      {showEndConfirm && (
        <div onClick={() => setShowEndConfirm(false)} style={{ position:"fixed", top:0, bottom:0, left:0, right:0, width:"100%", background:"rgba(0,0,0,0.8)", display:"flex", alignItems:"flex-end", zIndex:200 }}>
          <div onClick={e => e.stopPropagation()} style={{ background:S1, borderRadius:"20px 20px 0 0", padding:"20px 24px 110px", width:"100%", border:`1px solid ${BD}`, boxSizing:"border-box" }}>
            <div style={{ width:"36px", height:"4px", background:MT, borderRadius:"2px", margin:"0 auto 20px" }}/>
            <div style={{ fontSize:"17px", fontWeight:"700", marginBottom:"8px" }}>Finish Workout?</div>
            <div style={{ fontSize:"13px", color:SB, lineHeight:"1.6", marginBottom:"8px" }}>
              {doneSets > 0 ? (
                <>You completed <span style={{ color:A, fontWeight:"600" }}>{doneSets} sets</span> across <span style={{ color:A, fontWeight:"600" }}>{session.filter(ex => ex.sets.some(s => s.done)).length} exercises</span> in <span style={{ color:A, fontWeight:"600" }}>{fmtTimer(workoutElapsed)}</span>.</>
              ) : (
                "No sets completed yet."
              )}
            </div>
            {doneSets === totalSets && doneSets > 0 && (
              <div style={{ fontSize:"11px", color:SB, marginBottom:"16px" }}>All sets complete. Great workout!</div>
            )}
            <button onClick={endWorkout} style={{ ...btnPrim, width:"100%", padding:"14px", fontSize:"15px", display:"block", marginBottom:"10px" }}>
              End Workout
            </button>
            <button onClick={() => setShowEndConfirm(false)} style={{ ...btnGhost, width:"100%", padding:"14px", fontSize:"15px", display:"block" }}>
              Keep Going
            </button>
          </div>
        </div>
      )}

      {activeStopwatch && (
        <StopwatchOverlay
          targetName={activeStopwatch.name}
          onSave={handleStopwatchSave}
          onCancel={() => setActiveStopwatch(null)}
        />
      )}
    </div>
  );
}
// ════════════════════════════════════════════════════════════════════════
// ROUTINE SCREEN
// ════════════════════════════════════════════════════════════════════════
function RoutineScreen({ templates, setTemplates, setPrevTemplates, showUndo, profile, onProfileTap, onCustomized, authUser, coachLinks, setCoachLinks, coachLinksLoaded, onOpenAthlete, athleteView }) {
  const [expanded,      setExpanded]      = useState(null);
  const [editingType,   setEditingType]   = useState(null);
  const [pickingExDay,  setPickingExDay]  = useState(null);
  const [showCoach,     setShowCoach]     = useState(false);
  const [athleteLoading, setAthleteLoading] = useState(false);
  const [expandedAthlete, setExpandedAthlete] = useState(null); // for multi-athlete collapse
  const todayDay = getToday();

  const openAthleteView = async (link) => {
    setAthleteLoading(true);
    try {
      const data = await loadAthleteData(link.athlete_id);
      onOpenAthlete({ name: link.athlete_name, ...data });
    } catch (e) {
      console.error(e);
    } finally {
      setAthleteLoading(false);
    }
  };

  // Accepted athletes I'm coaching
  const myAthletes = coachLinks.filter(l => l.coach_id === authUser?.id && l.status === "accepted");
  // Any accepted connection (as athlete or coach)
  const isConnected = coachLinks.some(l => l.status === "accepted");

  const toggle   = (d) => { setExpanded(expanded===d?null:d); setEditingType(null); setNewEx(""); };
  const setType  = (d,t) => {
    setPrevTemplates({ ...templates });
    setTemplates(p => ({ ...p, [d]:{ ...p[d], type:t, exercises:t==="Rest"?[]:(TYPE_EXERCISES[t]||p[d].exercises) } }));
    setEditingType(null);
    showUndo(`Changed ${d} to ${t}`);
    onCustomized?.();
  };
  const removeEx = (d,i) => {
    setPrevTemplates({ ...templates });
    setTemplates(p => ({ ...p, [d]:{ ...p[d], exercises:p[d].exercises.filter((_,j)=>j!==i) } }));
    showUndo("Exercise removed");
    onCustomized?.();
  };
  const addEx    = (d, name) => {
    if(!name.trim()) return;
    setPrevTemplates({ ...templates });
    setTemplates(p => ({ ...p, [d]:{ ...p[d], exercises:[...p[d].exercises, name.trim()] } }));
    showUndo("Exercise added");
    onCustomized?.();
  };

  return (
    <div>
      <ScreenHeader sup="Weekly Schedule" title="Routine" profile={profile} onProfileTap={onProfileTap}/>
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
                  <span style={{ fontSize:"17px", fontWeight:isToday?"700":"500", color:isToday?A:TX, width:"36px" }}>{day}</span>
                  <span style={{ fontSize:"15px", fontWeight:"600", color:TYPE_COLORS[t.type]||TX, letterSpacing:"0.04em" }}>{t.type}</span>
                  {t.exercises.length > 0 && <span style={{ fontSize:"14px", color:SB }}>{t.exercises.length} ex.</span>}
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
                      <span style={{ fontSize:"16px" }}>{ex}</span>
                      <button onClick={() => removeEx(day,i)} style={{ background:"none", border:"none", color:SB, cursor:"pointer", fontSize:"15px", padding:"0 4px" }}>✕</button>
                    </div>
                  ))}

                  {t.type!=="Rest" && (
                    <div style={{ padding:"12px 0 0" }}>
                      <button onClick={() => setPickingExDay(day)} style={{ width:"100%", background:"none", border:`1px dashed ${MT}`, borderRadius:"12px", color:SB, cursor:"pointer", padding:"14px", fontSize:"15px", display:"flex", alignItems:"center", justifyContent:"center", gap:"6px" }}>
                        <span style={{ fontSize:"18px", color:A }}>+</span> Add Exercise
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {pickingExDay && (
           <ExercisePicker onClose={() => setPickingExDay(null)} onSelect={(name) => addEx(pickingExDay, name)} />
        )}

        {/* Coach Access Card */}
        <div style={{ background:`linear-gradient(135deg, ${S1} 0%, #0d1a00 100%)`, borderRadius:"12px", border:`1px solid ${isConnected ? A : A+"22"}`, padding:"20px 18px", marginBottom:"8px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"12px" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={A} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
            <span style={{ fontSize:"16px", fontWeight:"700", color:TX }}>Coach Access</span>
            {isConnected && (
              <span style={{ fontSize:"11px", background:A, color:"#000", borderRadius:"4px", padding:"2px 8px", fontWeight:"700", marginLeft:"auto" }}>CONNECTED</span>
            )}
          </div>

          {/* Athletes I'm coaching — dynamic: 1 = full-screen button, multiple = inline collapse */}
          {myAthletes.length === 1 && (
            <button
              onClick={() => openAthleteView(myAthletes[0])}
              disabled={athleteLoading}
              style={{ width:"100%", background:S2, border:`1px solid ${A}44`, borderRadius:"12px", padding:"14px 16px", marginBottom:"12px", display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer" }}
            >
              <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                <div style={{ width:"36px", height:"36px", borderRadius:"50%", background:`${A}22`, border:`1px solid ${A}44`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"15px", fontWeight:"700", color:A }}>
                  {myAthletes[0].athlete_name?.[0]?.toUpperCase() || "?"}
                </div>
                <div style={{ textAlign:"left" }}>
                  <div style={{ fontSize:"16px", fontWeight:"600", color:TX }}>{myAthletes[0].athlete_name}</div>
                  <div style={{ fontSize:"12px", color:A, display:"flex", alignItems:"center", gap:"4px", marginTop:"2px" }}>
                    <div style={{ width:"6px", height:"6px", borderRadius:"50%", background:A }}/>Active
                  </div>
                </div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:"6px", color:A, fontSize:"14px", fontWeight:"700" }}>
                {athleteLoading ? <div style={{ width:"14px", height:"14px", borderRadius:"50%", border:`2px solid ${MT}`, borderTopColor:A, animation:"spin 0.7s linear infinite" }}/> : null}
                View
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={A} strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            </button>
          )}

          {myAthletes.length > 1 && (
            <div style={{ marginBottom:"12px" }}>
              <div style={{ ...subLbl, marginBottom:"8px" }}>Your Athletes ({myAthletes.length})</div>
              {myAthletes.map(l => {
                const isExpanded = expandedAthlete === l.id;
                return (
                  <div key={l.id} style={{ marginBottom:"6px", background:S2, borderRadius:"12px", border:`1px solid ${isExpanded ? A+"44" : MT}`, overflow:"hidden", transition:"border-color 0.2s" }}>
                    <button
                      onClick={() => setExpandedAthlete(isExpanded ? null : l.id)}
                      style={{ width:"100%", background:"none", border:"none", padding:"12px 14px", display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer" }}
                    >
                      <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                        <div style={{ width:"32px", height:"32px", borderRadius:"50%", background:`${A}22`, border:`1px solid ${A}44`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"13px", fontWeight:"700", color:A }}>
                          {l.athlete_name?.[0]?.toUpperCase() || "?"}
                        </div>
                        <span style={{ fontSize:"15px", fontWeight:"600", color:TX }}>{l.athlete_name}</span>
                      </div>
                      <span style={{ color:SB, fontSize:"14px", transform: isExpanded ? "rotate(180deg)" : "none", transition:"transform 0.2s", display:"block" }}>⌄</span>
                    </button>
                    {isExpanded && (
                      <div style={{ borderTop:`1px solid ${BD}`, padding:"12px 14px 14px" }}>
                        <button
                          onClick={() => openAthleteView(l)}
                          disabled={athleteLoading}
                          style={{ ...btnPrim, width:"100%", padding:"12px", fontSize:"15px" }}
                        >
                          {athleteLoading ? "Loading…" : `Open ${l.athlete_name}'s Profile`}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {coachLinksLoaded && !isConnected && (
            <div style={{ fontSize:"14px", color:SB, lineHeight:"1.5", marginBottom:"16px" }}>
              Connect with a coach to share your progress, or coach someone else.
            </div>
          )}

          {!coachLinksLoaded ? (
            <div style={{ height:"48px", background:MT, borderRadius:"10px", opacity:0.5 }}/>
          ) : (
            <button onClick={() => { setShowCoach(true); loadCoachLinks(authUser?.id).then(setCoachLinks).catch(()=>{}); }} style={{ ...(isConnected ? btnGhost : btnPrim), display:"flex", alignItems:"center", gap:"6px", transition:"background 0.2s, color 0.2s" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isConnected ? SB : "#000"} strokeWidth="2.5" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
              {isConnected ? "Manage Connections" : "Connect Coach"}
            </button>
          )}
        </div>

        {showCoach && (
          <CoachModal authUser={authUser} onClose={() => { setShowCoach(false); loadCoachLinks(authUser?.id).then(setCoachLinks).catch(()=>{}); }}/>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// ATHLETE VIEW (coach editable view of an athlete's routine + workouts)
// ════════════════════════════════════════════════════════════════════════
function AthleteView({ athleteView, setAthleteView, athleteId, todayDay, onRoutineUpdated }) {
  const [editRoutine,  setEditRoutine]  = useState(athleteView.routine ? JSON.parse(JSON.stringify(athleteView.routine)) : { ...DEFAULT_TEMPLATES });
  const [expandedDay,  setExpandedDay]  = useState(null);
  const [editingType,  setEditingType]  = useState(null);
  const [pickingExDay, setPickingExDay] = useState(null);
  const [saving,       setSaving]       = useState(false);
  const [saveMsg,      setSaveMsg]      = useState(null);

  const toggleDay = (d) => { setExpandedDay(expandedDay === d ? null : d); setEditingType(null); setNewEx(""); };

  const setType = (day, type) => {
    setEditRoutine(p => ({ ...p, [day]: { ...p[day], type, exercises: type === "Rest" ? [] : (TYPE_EXERCISES[type] || p[day].exercises) } }));
    setEditingType(null);
  };

  const removeEx = (day, i) => {
    setEditRoutine(p => ({ ...p, [day]: { ...p[day], exercises: p[day].exercises.filter((_, j) => j !== i) } }));
  };

  const addEx = (day, name) => {
    if (!name.trim()) return;
    setEditRoutine(p => ({ ...p, [day]: { ...p[day], exercises: [...p[day].exercises, name.trim()] } }));
  };

  const handleSave = async () => {
    if (!athleteId) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      await saveRoutine(athleteId, editRoutine);
      onRoutineUpdated(editRoutine);
      setSaveMsg({ text: "Routine saved!", ok: true });
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (e) {
      setSaveMsg({ text: `Save failed: ${e.message}`, ok: false });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position:"fixed", top:0, bottom:0, left:0, right:0, background:BG, zIndex:200, overflowY:"auto", paddingBottom:"100px" }}>
      {/* Header */}
      <div style={{ position:"sticky", top:0, background:BG, zIndex:10, padding:"52px 16px 14px", borderBottom:`1px solid ${BD}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:"12px" }}>
          <button onClick={() => setAthleteView(null)} style={{ background:"none", border:"none", color:SB, cursor:"pointer", fontSize:"22px", padding:0, lineHeight:1 }}>←</button>
          <div>
            <div style={{ ...subLbl, marginBottom:"2px" }}>Coach View</div>
            <div style={{ fontSize:"20px", fontWeight:"700" }}>{athleteView.name}</div>
          </div>
        </div>
        <button onClick={handleSave} disabled={saving} style={{ ...btnPrim, padding:"10px 20px", opacity: saving ? 0.7 : 1 }}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {/* Coach Tabs */}
      <div style={{ display:"flex", gap:"8px", padding:"16px", background:BG, position:"sticky", top:"80px", zIndex:9, borderBottom:`1px solid ${BD}` }}>
        <button onClick={() => setEditingType("TAB_ROUTINE")} style={{ flex:1, padding:"8px", background: editingType !== "TAB_BODY" ? A : S2, color: editingType !== "TAB_BODY" ? "#000" : SB, border:`1px solid ${editingType !== "TAB_BODY" ? A : MT}`, borderRadius:"8px", fontSize:"13px", fontWeight:"600", cursor:"pointer" }}>Routine & Log</button>
        <button onClick={() => setEditingType("TAB_BODY")} style={{ flex:1, padding:"8px", background: editingType === "TAB_BODY" ? A : S2, color: editingType === "TAB_BODY" ? "#000" : SB, border:`1px solid ${editingType === "TAB_BODY" ? A : MT}`, borderRadius:"8px", fontSize:"13px", fontWeight:"600", cursor:"pointer" }}>Body Stats</button>
      </div>

      <div style={{ padding:"14px" }}>
        {saveMsg && (
          <div style={{ background: saveMsg.ok ? `${A}15` : `${RED}15`, border:`1px solid ${saveMsg.ok ? A : RED}`, borderRadius:"10px", padding:"12px 16px", fontSize:"14px", color: saveMsg.ok ? A : RED, marginBottom:"14px" }}>
            {saveMsg.text}
          </div>
        )}

        {editingType === "TAB_BODY" ? (
          <div>
            <div style={{ ...subLbl, paddingLeft:"4px", marginBottom:"10px" }}>Weight Log</div>
            {athleteView.weights && athleteView.weights.length > 0 ? athleteView.weights.slice(0, 5).map((w, i) => (
              <div key={i} style={{ ...card, display:"flex", justifyContent:"space-between", padding:"14px 18px", marginBottom:"6px" }}>
                <span style={{ fontSize:"15px", color:SB }}>{fmtDate(w.date)}</span>
                <span style={{ fontSize:"16px", fontWeight:"700", color:A }}>{w.weight}</span>
              </div>
            )) : <div style={{ fontSize:"14px", color:MT, padding:"10px" }}>No weight logs found.</div>}

            <div style={{ ...subLbl, paddingLeft:"4px", marginTop:"24px", marginBottom:"10px" }}>Recent Measurements</div>
            {athleteView.measurements && athleteView.measurements.length > 0 ? athleteView.measurements.slice(0, 5).map((m, i) => (
              <div key={i} style={{ ...card, padding:"14px 18px", marginBottom:"6px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"6px" }}>
                  <span style={{ fontSize:"15px", color:SB }}>{fmtDate(m.date)}</span>
                </div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:"10px" }}>
                  {Object.entries(m).filter(([key, val]) => val != null && key !== "id" && key !== "date").map(([key, val]) => (
                    <div key={key} style={{ background:S2, border:`1px solid ${MT}`, padding:"6px 10px", borderRadius:"6px", fontSize:"13px" }}>
                      <span style={{ color:SB, marginRight:"6px" }}>{key}</span><span style={{ fontWeight:"600", color:TX }}>{String(val)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )) : <div style={{ fontSize:"14px", color:MT, padding:"10px" }}>No measurements found.</div>}
          </div>
        ) : (
          <div>
            {/* Editable routine */}
            <div style={{ ...subLbl, paddingLeft:"4px", marginBottom:"10px" }}>Weekly Routine</div>
            {DAYS.map(day => {
              const t = editRoutine[day] || { type: "Rest", exercises: [] };
              const isOpen = expandedDay === day;
              const isToday = day === todayDay;
              return (
                <div key={day} style={{ ...card, padding:0, overflow:"hidden", marginBottom:"10px" }}>
                  <button onClick={() => toggleDay(day)} style={{ width:"100%", background:"none", border:"none", cursor:"pointer", padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                      <span style={{ fontSize:"17px", fontWeight:isToday?"700":"500", color:isToday?A:TX, width:"36px" }}>{day}</span>
                      <span style={{ fontSize:"15px", fontWeight:"600", color:TYPE_COLORS[t.type]||TX }}>{t.type}</span>
                      {t.exercises.length > 0 && <span style={{ fontSize:"13px", color:SB }}>{t.exercises.length} ex.</span>}
                      {isToday && <span style={{ fontSize:"9px", background:A, color:"#000", borderRadius:"4px", padding:"2px 6px", fontWeight:"700" }}>TODAY</span>}
                    </div>
                    <span style={{ color:SB, fontSize:"14px", transform:isOpen?"rotate(180deg)":"none", transition:"transform 0.2s" }}>⌄</span>
                  </button>

                  {isOpen && (
                    <div style={{ borderTop:`1px solid ${BD}`, padding:"14px 18px 16px" }}>
                      {/* Type picker */}
                      {editingType === day ? (
                        <div style={{ marginBottom:"14px" }}>
                          <div style={{ ...subLbl, marginBottom:"8px" }}>Workout Type</div>
                          <div style={{ display:"flex", flexWrap:"wrap", gap:"6px" }}>
                            {WORKOUT_TYPES.map(wt => (
                              <button key={wt} onClick={() => setType(day, wt)} style={{ background:t.type===wt?A:S2, color:t.type===wt?"#000":SB, border:`1px solid ${t.type===wt?A:MT}`, borderRadius:"6px", padding:"5px 12px", fontSize:"12px", cursor:"pointer", fontWeight:t.type===wt?"700":"400" }}>{wt}</button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setEditingType(day)} style={{ ...btnGhost, fontSize:"13px", padding:"6px 14px", marginBottom:"14px" }}>Change Type</button>
                      )}

                      {t.exercises.length === 0 && t.type !== "Rest" && (
                        <div style={{ fontSize:"13px", color:MT, marginBottom:"10px" }}>No exercises yet.</div>
                      )}

                      {t.exercises.map((ex, i) => (
                        <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom: i < t.exercises.length - 1 ? `1px solid ${MT}` : "none" }}>
                          <span style={{ fontSize:"15px" }}>{ex}</span>
                          <button onClick={() => removeEx(day, i)} style={{ background:"none", border:"none", color:SB, cursor:"pointer", fontSize:"16px", padding:"0 4px" }}>✕</button>
                        </div>
                      ))}

                      {t.type !== "Rest" && (
                        <div style={{ padding:"12px 0 0" }}>
                          <button onClick={() => setPickingExDay(day)} style={{ width:"100%", background:"none", border:`1px dashed ${MT}`, borderRadius:"12px", color:SB, cursor:"pointer", padding:"14px", fontSize:"15px", display:"flex", alignItems:"center", justifyContent:"center", gap:"6px" }}>
                            <span style={{ fontSize:"18px", color:A }}>+</span> Add Exercise
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {pickingExDay && (
              <ExercisePicker onClose={() => setPickingExDay(null)} onSelect={(name) => addEx(pickingExDay, name)} />
            )}

            {/* Recent workouts — read only */}
            <div style={{ ...subLbl, paddingLeft:"4px", marginTop:"20px", marginBottom:"10px" }}>Recent Workouts</div>
            {athleteView.history && athleteView.history.length > 0 ? athleteView.history.slice(0, 10).map(w => (
              <div key={w.id} style={{ ...card, padding:"14px 18px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"8px" }}>
                  <div>
                    <div style={{ fontSize:"16px", fontWeight:"600" }}>{fmtDate(w.date)}</div>
                    <div style={{ fontSize:"13px", color:TYPE_COLORS[w.type]||SB, fontWeight:"600", marginTop:"2px" }}>{w.type}</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:"18px", fontWeight:"700", color:A }}>{fmtTimer(w.duration)}</div>
                    <div style={{ fontSize:"12px", color:SB }}>{w.totalSets} sets</div>
                  </div>
                </div>
                {w.exercises.map((ex, ei) => (
                  <div key={ei} style={{ display:"flex", justifyContent:"space-between", padding:"3px 0", borderTop: ei === 0 ? `1px solid ${MT}` : "none" }}>
                    <span style={{ fontSize:"14px", color:TX }}>{ex.name}</span>
                    <span style={{ fontSize:"13px", color:SB }}>{ex.sets.length} sets</span>
                  </div>
                ))}
              </div>
            )) : (
              <div style={{ ...card, textAlign:"center", padding:"30px", color:SB, fontSize:"14px" }}>No workouts recorded yet.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// COACH MODAL
// ════════════════════════════════════════════════════════════════════════
function CoachModal({ authUser, onClose }) {
  const [view,        setView]        = useState("home");
  const [myCode,      setMyCode]      = useState(null);
  const [codeInput,   setCodeInput]   = useState("");
  const [links,       setLinks]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [msg,         setMsg]         = useState(null);
  const [copied,      setCopied]      = useState(false);
  const [visible,     setVisible]     = useState(false);

  // Animate in on mount
  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

  const closeModal = () => {
    setVisible(false);
    setTimeout(onClose, 280);
  };

  useEffect(() => {
    if (!authUser) return;
    Promise.all([ensureInviteCode(authUser.id), loadCoachLinks(authUser.id)])
      .then(([code, lnks]) => { setMyCode(code); setLinks(lnks); })
      .catch(e => setMsg({ text: e.message, ok: false }))
      .finally(() => setLoading(false));
  }, [authUser]);

  const refresh = () => loadCoachLinks(authUser.id).then(setLinks).catch(() => {});

  const goTo = (v) => { setMsg(null); setView(v); };

  const handleConnect = async () => {
    if (codeInput.trim().length < 6) return;
    setActionLoading(true); setMsg(null);
    try {
      const athlete = await findProfileByCode(codeInput.trim());
      if (!athlete) return setMsg({ text: "No account found with that code. Double-check and try again.", ok: false });
      if (athlete.id === authUser.id) return setMsg({ text: "That's your own code.", ok: false });
      await sendCoachRequest(authUser.id, athlete.id);
      setMsg({ text: `Request sent to ${athlete.display_name}. Waiting for their approval.`, ok: true });
      setCodeInput("");
      await refresh();
      setTimeout(() => goTo("home"), 1800);
    } catch (e) {
      setMsg({ text: e.message.includes("duplicate") ? "You already sent a request to this athlete." : e.message, ok: false });
    } finally { setActionLoading(false); }
  };

  const handleAccept = async (linkId) => {
    setActionLoading(true);
    try { await acceptCoachRequest(linkId); await refresh(); setMsg({ text: "Coach accepted!", ok: true }); }
    catch (e) { setMsg({ text: e.message, ok: false }); }
    finally { setActionLoading(false); }
  };

  const handleRemove = async (linkId) => {
    setActionLoading(true);
    try { await removeCoachLink(linkId); await refresh(); }
    catch (e) { setMsg({ text: e.message, ok: false }); }
    finally { setActionLoading(false); }
  };

  const copyCode = () => {
    if (!myCode) return;
    if (navigator.clipboard) navigator.clipboard.writeText(myCode);
    if (navigator.share) navigator.share({ title: "My Theryn Invite Code", text: `Join me on Theryn! My invite code is: ${myCode}` }).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const myLinks      = links.filter(l => l.coach_id === authUser?.id);
  const coachLinks   = links.filter(l => l.athlete_id === authUser?.id);
  const pendingForMe = coachLinks.filter(l => l.status === "pending");
  const activeCoaches = coachLinks.filter(l => l.status === "accepted");
  const hasAny = myLinks.length > 0 || coachLinks.length > 0;

  return (
    <div
      onClick={closeModal}
      style={{ position:"fixed", top:0, bottom:0, left:0, right:0, background: visible ? "rgba(0,0,0,0.75)" : "rgba(0,0,0,0)", display:"flex", alignItems:"flex-end", zIndex:300, transition:"background 0.28s ease" }}
    >
      <style>{`
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes fadeIn  { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .coach-content { animation: fadeIn 0.22s ease; }
        .code-char { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 56px; background: ${S2}; border: 2px solid ${BD}; border-radius: 12px; font-size: 26px; font-weight: 800; color: ${A}; letter-spacing: 0; margin: 0 3px; font-variant-numeric: tabular-nums; }
      `}</style>

      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: S1, borderRadius:"24px 24px 0 0", width:"100%",
          border:`1px solid ${BD}`, boxSizing:"border-box", padding:"32px 24px 110px", maxHeight:"88vh", overflowY:"auto",
          transform: visible ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        {/* Drag handle */}
        <div style={{ width:"40px", height:"5px", background:MT, borderRadius:"3px", margin:"14px auto 0" }}/>

        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"18px 20px 0" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
            {view !== "home" && (
              <button onClick={() => goTo("home")} style={{ background:"none", border:"none", color:SB, cursor:"pointer", fontSize:"20px", padding:"0 6px 0 0", lineHeight:1 }}>←</button>
            )}
            <div style={{ fontSize:"20px", fontWeight:"700" }}>
              {view === "home"    && "Coach & Athletes"}
              {view === "mycode" && "Your Invite Code"}
              {view === "connect" && "Add Athlete"}
            </div>
          </div>
          <button onClick={closeModal} style={{ background:"none", border:`1px solid ${MT}`, borderRadius:"10px", color:SB, cursor:"pointer", padding:"8px 16px", fontSize:"14px" }}>Close</button>
        </div>

        <div style={{ padding:"20px 20px 48px" }}>

          {/* Loading spinner */}
          {loading && (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:"12px", padding:"40px 0", color:SB }}>
              <div style={{ width:"20px", height:"20px", borderRadius:"50%", border:`2px solid ${MT}`, borderTopColor:A, animation:"spin 0.7s linear infinite" }}/>
              <span style={{ fontSize:"15px" }}>Loading…</span>
            </div>
          )}

          {/* Message banner */}
          {msg && (
            <div className="coach-content" style={{ background: msg.ok ? `${A}18` : `${RED}18`, border:`1px solid ${msg.ok ? A+"66" : RED+"66"}`, borderRadius:"12px", padding:"14px 16px", fontSize:"14px", color: msg.ok ? A : RED, marginBottom:"18px", display:"flex", alignItems:"center", gap:"10px" }}>
              {msg.ok
                ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={A} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              }
              {msg.text}
            </div>
          )}

          {/* ── HOME VIEW ── */}
          {!loading && view === "home" && (
            <div className="coach-content">

              {/* Pending coach requests */}
              {pendingForMe.length > 0 && (
                <div style={{ marginBottom:"24px" }}>
                  <div style={{ ...subLbl, marginBottom:"12px", color:"#FFD166" }}>
                    {pendingForMe.length} Pending Request{pendingForMe.length > 1 ? "s" : ""}
                  </div>
                  {pendingForMe.map(l => (
                    <div key={l.id} style={{ background:`linear-gradient(135deg, ${S2}, #1a1800)`, border:`1px solid #FFD16644`, borderRadius:"16px", padding:"16px 18px", marginBottom:"10px" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"14px" }}>
                        <div style={{ width:"40px", height:"40px", borderRadius:"50%", background:"#FFD16622", border:`1px solid #FFD16644`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"16px", fontWeight:"700", color:"#FFD166" }}>
                          {l.coach_name?.[0]?.toUpperCase() || "?"}
                        </div>
                        <div>
                          <div style={{ fontSize:"16px", fontWeight:"700" }}>{l.coach_name}</div>
                          <div style={{ fontSize:"13px", color:SB }}>wants to coach you</div>
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:"8px" }}>
                        <button onClick={() => handleAccept(l.id)} disabled={actionLoading} style={{ ...btnPrim, flex:1, padding:"13px" }}>
                          {actionLoading ? "…" : "Accept"}
                        </button>
                        <button onClick={() => handleRemove(l.id)} disabled={actionLoading} style={{ background:"none", border:`1px solid ${MT}`, borderRadius:"10px", color:SB, cursor:"pointer", flex:1, padding:"13px", fontSize:"15px" }}>
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Active coaches */}
              {activeCoaches.length > 0 && (
                <div style={{ marginBottom:"24px" }}>
                  <div style={{ ...subLbl, marginBottom:"12px" }}>Your Coach</div>
                  {activeCoaches.map(l => (
                    <div key={l.id} style={{ ...card, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:"12px" }}>
                        <div style={{ width:"38px", height:"38px", borderRadius:"50%", background:`${A}22`, border:`1px solid ${A}44`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"15px", fontWeight:"700", color:A }}>
                          {l.coach_name?.[0]?.toUpperCase() || "?"}
                        </div>
                        <div>
                          <div style={{ fontSize:"16px", fontWeight:"600" }}>{l.coach_name}</div>
                          <div style={{ fontSize:"12px", color:A, marginTop:"2px", display:"flex", alignItems:"center", gap:"4px" }}>
                            <div style={{ width:"6px", height:"6px", borderRadius:"50%", background:A }}/>Active
                          </div>
                        </div>
                      </div>
                      <button onClick={() => handleRemove(l.id)} disabled={actionLoading} style={{ background:"none", border:`1px solid ${MT}`, borderRadius:"8px", color:RED, cursor:"pointer", padding:"8px 14px", fontSize:"13px" }}>Remove</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Athletes I'm coaching */}
              {myLinks.length > 0 && (
                <div style={{ marginBottom:"24px" }}>
                  <div style={{ ...subLbl, marginBottom:"12px" }}>Athletes You Coach</div>
                  {myLinks.map(l => (
                    <div key={l.id} style={{ ...card, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:"12px" }}>
                        <div style={{ width:"38px", height:"38px", borderRadius:"50%", background: l.status==="accepted" ? `${A}22` : `${SB}22`, border:`1px solid ${l.status==="accepted" ? A+"44" : MT}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"15px", fontWeight:"700", color: l.status==="accepted" ? A : SB }}>
                          {l.athlete_name?.[0]?.toUpperCase() || "?"}
                        </div>
                        <div>
                          <div style={{ fontSize:"16px", fontWeight:"600" }}>{l.athlete_name}</div>
                          <div style={{ fontSize:"12px", marginTop:"2px", display:"flex", alignItems:"center", gap:"4px", color: l.status==="accepted" ? A : l.status==="pending" ? "#FFD166" : RED }}>
                            <div style={{ width:"6px", height:"6px", borderRadius:"50%", background: l.status==="accepted" ? A : l.status==="pending" ? "#FFD166" : RED }}/>
                            {l.status === "pending" ? "Awaiting approval" : l.status === "accepted" ? "Active" : "Declined"}
                          </div>
                        </div>
                      </div>
                      <button onClick={() => handleRemove(l.id)} disabled={actionLoading} style={{ background:"none", border:`1px solid ${MT}`, borderRadius:"8px", color:RED, cursor:"pointer", padding:"8px 14px", fontSize:"13px" }}>Remove</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Empty state */}
              {!hasAny && (
                <div style={{ textAlign:"center", padding:"20px 0 28px" }}>
                  <div style={{ width:"64px", height:"64px", borderRadius:"50%", background:`${A}15`, border:`1px solid ${A}30`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px" }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={A} strokeWidth="1.6" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
                  </div>
                  <div style={{ fontSize:"17px", fontWeight:"700", marginBottom:"6px" }}>No connections yet</div>
                  <div style={{ fontSize:"14px", color:SB, lineHeight:"1.6" }}>Share your code with a coach, or enter an athlete's code to get started.</div>
                </div>
              )}

              {/* Divider */}
              <div style={{ borderTop:`1px solid ${BD}`, margin:"4px 0 20px" }}/>

              {/* Action tiles */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px" }}>
                <button onClick={() => goTo("mycode")} style={{ background:S2, border:`1px solid ${BD}`, borderRadius:"16px", padding:"18px 14px", cursor:"pointer", textAlign:"left" }}>
                  <div style={{ width:"36px", height:"36px", borderRadius:"10px", background:`${A}20`, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:"12px" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={A} strokeWidth="2" strokeLinecap="round"><rect x="2" y="2" width="20" height="20" rx="4"/><path d="M7 7h.01M12 7h.01M17 7h.01M7 12h.01M12 12h.01M17 12h.01M7 17h.01M12 17h.01"/></svg>
                  </div>
                  <div style={{ fontSize:"15px", fontWeight:"700", color:TX, marginBottom:"4px" }}>My Code</div>
                  <div style={{ fontSize:"12px", color:SB, lineHeight:"1.5" }}>Share with your coach</div>
                </button>
                <button onClick={() => goTo("connect")} style={{ background:S2, border:`1px solid ${BD}`, borderRadius:"16px", padding:"18px 14px", cursor:"pointer", textAlign:"left" }}>
                  <div style={{ width:"36px", height:"36px", borderRadius:"10px", background:`${A}20`, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:"12px" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={A} strokeWidth="2" strokeLinecap="round"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                  </div>
                  <div style={{ fontSize:"15px", fontWeight:"700", color:TX, marginBottom:"4px" }}>Add Athlete</div>
                  <div style={{ fontSize:"12px", color:SB, lineHeight:"1.5" }}>Enter their invite code</div>
                </button>
              </div>
            </div>
          )}

          {/* ── MY CODE VIEW ── */}
          {!loading && view === "mycode" && (
            <div className="coach-content">
              <div style={{ fontSize:"15px", color:SB, lineHeight:"1.6", marginBottom:"28px" }}>
                Share this code with your coach. Once they enter it, you'll get a request to approve.
              </div>
              {myCode ? (
                <>
                  {/* Code display — individual character boxes */}
                  <div style={{ display:"flex", justifyContent:"center", marginBottom:"28px" }}>
                    {myCode.split("").map((ch, i) => (
                      <div key={i} className="code-char">{ch}</div>
                    ))}
                  </div>
                  <button onClick={copyCode} style={{ ...btnPrim, width:"100%", padding:"16px", display:"flex", alignItems:"center", justifyContent:"center", gap:"10px", fontSize:"17px" }}>
                    {copied ? (
                      <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> Copied!</>
                    ) : (
                      <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy & Share Code</>
                    )}
                  </button>
                  <div style={{ textAlign:"center", fontSize:"13px", color:SB, marginTop:"12px" }}>Your code never changes</div>
                </>
              ) : (
                <div style={{ textAlign:"center", padding:"40px 0", color:SB }}>Generating your code…</div>
              )}
            </div>
          )}

          {/* ── CONNECT VIEW ── */}
          {!loading && view === "connect" && (
            <div className="coach-content">
              <div style={{ fontSize:"15px", color:SB, lineHeight:"1.6", marginBottom:"28px" }}>
                Ask your athlete for their 6-letter code and enter it below. They'll receive a request to approve.
              </div>

              {/* 6-box code input */}
              <div style={{ display:"flex", justifyContent:"center", gap:"6px", marginBottom:"28px" }}>
                {[0,1,2,3,4,5].map(i => (
                  <div key={i} style={{ width:"44px", height:"56px", borderRadius:"12px", background:S2, border:`2px solid ${codeInput[i] ? A : BD}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"26px", fontWeight:"800", color:A, transition:"border-color 0.15s" }}>
                    {codeInput[i] || ""}
                  </div>
                ))}
              </div>
              {/* Hidden real input for keyboard */}
              <input
                autoFocus
                style={{ ...inputSt, width:"100%", textAlign:"center", fontSize:"20px", fontWeight:"700", letterSpacing:"0.2em", textTransform:"uppercase", marginBottom:"16px" }}
                placeholder="Type code here"
                maxLength={6}
                value={codeInput}
                onChange={e => { setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"")); setMsg(null); }}
                onKeyDown={e => e.key === "Enter" && codeInput.length === 6 && handleConnect()}
              />
              <button
                onClick={handleConnect}
                disabled={actionLoading || codeInput.trim().length < 6}
                style={{ ...btnPrim, width:"100%", padding:"16px", opacity: codeInput.trim().length < 6 ? 0.45 : 1, display:"flex", alignItems:"center", justifyContent:"center", gap:"8px", transition:"opacity 0.2s" }}
              >
                {actionLoading
                  ? <><div style={{ width:"16px", height:"16px", borderRadius:"50%", border:"2px solid #000", borderTopColor:"transparent", animation:"spin 0.7s linear infinite" }}/> Sending…</>
                  : "Send Request"
                }
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// BODY SCREEN
// ════════════════════════════════════════════════════════════════════════
function BodyScreen({ weightLog, setWeightLog, measureLog, setMeasureLog, measureFields, setMeasureFields, profile, onProfileTap, units, authUser }) {
  const wLabel = units === "metric" ? "kg" : "lbs";
  const mLabel = units === "metric" ? "cm" : "in";
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
    // Save to Supabase in background
    if (authUser) {
      saveBodyWeight(authUser.id, w, todayStr()).catch(console.error);
    }
  };

  const saveEdit   = (id) => { const w=parseFloat(editW); if(isNaN(w)) return; setWeightLog(p => p.map(e => e.id===id?{ ...e, weight:w }:e)); setEditingId(null); };
  const deleteEnt  = (id) => {
    setWeightLog(p => p.filter(e => e.id!==id));
    if (authUser) deleteBodyWeight(id).catch(console.error);
  };
  const startEdit  = (e)  => { setEditingId(e.id); setEditW(String(e.weight)); };

  const history = sorted.filter(e => e.date !== todayStr());

  // ── Measurement helpers ──
  const activeFields = measureFields.map(label => ({ key:toKey(label), label }));
  const mSorted      = [...measureLog].sort((a,b) => b.date.localeCompare(a.date));
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
    setMeasureLog(p => [entry, ...p]);
    
    // Save to Supabase in background
    if (authUser) {
      const measureData = {};
      activeFields.forEach(f => { const v = parseFloat(mInputs[f.key]); if (!isNaN(v)) measureData[f.key] = v; });
      saveMeasurement(authUser.id, measureData, todayStr()).catch(console.error);
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

  const deleteMEntry = (id) => {
    setMeasureLog(p => p.filter(e => e.id!==id));
    if (authUser) deleteMeasurement(id).catch(console.error);
  };

  return (
    <div>
      <div style={{ padding:"52px 16px 24px", borderBottom:`1px solid ${BD}` }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div>
            <div style={{ ...subLbl, marginBottom:"6px" }}>Daily Tracking</div>
            <div style={{ fontSize:"36px", fontWeight:"700", letterSpacing:"-0.04em" }}>Body</div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:"10px", marginTop:"4px" }}>
          {delta!==null && (
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:"18px", fontWeight:"700", letterSpacing:"-0.03em", color:deltaNum<0?A:RED }}>
                {deltaNum>0?"+":""}{delta}
              </div>
              <div style={{ fontSize:"10px", color:SB, letterSpacing:"0.06em" }}>vs yesterday</div>
            </div>
          )}
          <button onClick={onProfileTap} style={{ width:"32px", height:"32px", borderRadius:"50%", background: profile.setup ? profile.color : MT, border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"12px", fontWeight:"700", color:"#000", flexShrink:0 }}>
            {profile.setup ? profile.initials : "?"}
          </button>
          </div>
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
            {todayEntry && (
              <button onClick={() => deleteEnt(todayEntry.id)} style={{ background:"none", border:`1px solid ${MT}`, borderRadius:"6px", color:RED, cursor:"pointer", padding:"3px 12px", fontSize:"11px" }}>Delete</button>
            )}
          </div>

          {todayEntry && (
            <div style={{ display:"flex", alignItems:"baseline", gap:"6px", marginBottom:"10px" }}>
              <span style={{ fontSize:"48px", fontWeight:"700", letterSpacing:"-0.05em", color:A }}>{todayEntry.weight}</span>
              <span style={{ fontSize:"18px", color:SB }}>{wLabel}</span>
            </div>
          )}
          <div>
            {!todayEntry && <div style={{ fontSize:"14px", color:SB, marginBottom:"10px" }}>Log your weight for today</div>}
            <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
              <input style={{ ...inputSt, width:"100%" }} type="number" step="0.1" placeholder={todayEntry ? String(todayEntry.weight) : "178.5"} value={inputW} onChange={e => setInputW(e.target.value)} onKeyDown={e => e.key==="Enter"&&logToday()}/>
              <button onClick={logToday} style={{ ...btnPrim, width:"100%" }}>{todayEntry ? "Update" : "Log"}</button>
            </div>
            {todayEntry && <div style={{ fontSize:"13px", color:SB, marginTop:"6px" }}>Enter a new value to update today's weight</div>}
          </div>
        </div>

        {/* ── Weight History (previous days only) ── */}
        {history.length > 0 && (
          <>
            <div style={{ ...subLbl, paddingLeft:"4px", marginBottom:"8px", marginTop:"8px" }}>Previous Days</div>
            {history.map((entry, idx) => {
              const nextEntry = history[idx + 1];
              const d  = nextEntry ? (entry.weight - nextEntry.weight).toFixed(1) : null;
              const dn = d ? parseFloat(d) : 0;
              return (
                <div key={entry.id} style={{ ...card, padding:"14px 18px" }}>
                  {editingId === entry.id ? (
                    <div>
                      <div style={{ fontSize:"13px", color:SB, marginBottom:"8px" }}>{fmtDate(entry.date)}</div>
                      <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                        <input style={{ ...inputSt, width:"100%" }} type="number" step="0.1" value={editW} onChange={e => setEditW(e.target.value)} autoFocus onKeyDown={e => e.key==="Enter" && saveEdit(entry.id)}/>
                        <div style={{ display:"flex", gap:"8px" }}>
                          <button onClick={() => saveEdit(entry.id)} style={{ ...btnPrim, flex:1 }}>Save</button>
                          <button onClick={() => setEditingId(null)} style={{ ...btnGhost, flex:1 }}>Cancel</button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div>
                        <div style={{ fontSize:"13px", color:SB, marginBottom:"4px" }}>{fmtDate(entry.date)}</div>
                        <div style={{ display:"flex", alignItems:"baseline", gap:"6px" }}>
                          <span style={{ fontSize:"22px", fontWeight:"700", letterSpacing:"-0.03em" }}>{entry.weight}</span>
                          <span style={{ fontSize:"14px", color:SB }}>{wLabel}</span>
                          {d && dn !== 0 && (
                            <span style={{ fontSize:"13px", fontWeight:"600", color: dn < 0 ? A : RED }}>{dn > 0 ? "+" : ""}{d}</span>
                          )}
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:"8px" }}>
                        <button onClick={() => startEdit(entry)} style={{ background:"none", border:`1px solid ${MT}`, borderRadius:"8px", color:SB, cursor:"pointer", padding:"8px 14px", fontSize:"13px" }}>Edit</button>
                        <button onClick={() => deleteEnt(entry.id)} style={{ background:"none", border:`1px solid ${MT}`, borderRadius:"8px", color:RED, cursor:"pointer", padding:"8px 14px", fontSize:"13px" }}>Delete</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* ═══ MEASUREMENTS SECTION ═══ */}
        <div style={{ marginTop:"24px", borderTop:`1px solid ${BD}`, paddingTop:"16px" }}>
          <button onClick={() => setShowMeasure(!showMeasure)} style={{ width:"100%", background:"none", border:"none", cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center", padding:"0 4px", marginBottom:"12px" }}>
            <span style={{ ...subLbl, marginBottom:0 }}>Measurements ({mLabel})</span>
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

              {/* ── Add New Measurement ── */}
              {activeFields.length > 0 && (
                <div style={{ ...card, background:S2, marginBottom:"12px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"12px" }}>
                    <div style={{ ...subLbl, marginBottom:0 }}>
                      Log Measurement
                    </div>
                  </div>

                  <div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px", marginBottom:"10px" }}>
                      {activeFields.map(f => (
                        <div key={f.key}>
                          <div style={{ ...subLbl, marginBottom:"4px" }}>{f.label}</div>
                          <input style={{ ...inputSt, width:"100%" }} type="number" step="0.1" placeholder="—" value={mInputs[f.key]||""} onChange={e => setMInputs(p => ({ ...p, [f.key]:e.target.value }))}/>
                        </div>
                      ))}
                    </div>
                    <button onClick={logMeasurements} style={{ ...btnPrim, width:"100%" }}>Log Measurements</button>
                  </div>
                </div>
              )}

              {/* ── Measurement History ── */}
              {mSorted.length > 0 && <div style={{ ...subLbl, paddingLeft:"4px", marginBottom:"8px" }}>Measurement History</div>}

              {mSorted.map((entry, idx) => {
                const prevEntry = mSorted[idx + 1];
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
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px", marginBottom:"10px" }}>
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
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"4px 12px" }}>
                          {displayFields.map(f => {
                            const val = entry[f.key];
                            const pv  = prevEntry?.[f.key];
                            const d3  = (val!=null && pv!=null) ? (val-pv).toFixed(1) : null;
                            const dn3 = d3 ? parseFloat(d3) : 0;
                            return (
                              <div key={f.key} style={{ padding:"3px 0" }}>
                                <div style={{ fontSize:"12px", color:SB, letterSpacing:"0.06em", textTransform:"uppercase" }}>{f.label}</div>
                                <div style={{ display:"flex", alignItems:"baseline", gap:"3px" }}>
                                  <span style={{ fontSize:"17px", fontWeight:"700", letterSpacing:"-0.03em" }}>{val}</span>
                                  <span style={{ fontSize:"12px", color:SB }}>{mLabel}</span>
                                  {d3 && dn3!==0 && (
                                    <span style={{ fontSize:"12px", fontWeight:"600", color:dn3>0?A:"#4ECDC4" }}>{dn3>0?"+":""}{d3}</span>
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
// ════════════════════════════════════════════════════════════════════════
// STREAK CALENDAR COMPONENT
// ════════════════════════════════════════════════════════════════════════
function StreakCalendar({ workoutHistory }) {
  const [view, setView] = useState("week"); // "week" | "month"
  const today = new Date();
  today.setHours(0,0,0,0);

  // Build a Set of ISO date strings that have workouts
  const workedOutDays = new Set(
    workoutHistory.map(w => w.date)
  );

  // Calculate current streak (consecutive days ending today or yesterday)
  const calcStreak = () => {
    let streak = 0;
    let check = new Date(today);
    // If today hasnt been worked out yet, still count from yesterday
    while (true) {
      const iso = check.toISOString().split("T")[0];
      if (workedOutDays.has(iso)) {
        streak++;
        check.setDate(check.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  };
  const streak = calcStreak();

  // Week view: Mon–Sun of current week
  const getWeekDays = () => {
    const day = today.getDay();
    const diff = day === 0 ? 6 : day - 1; // Monday = 0
    const monday = new Date(today);
    monday.setDate(today.getDate() - diff);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  };

  // Month view: all days in current month grouped by week
  const getMonthWeeks = () => {
    const year = today.getFullYear();
    const month = today.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    // Pad to Monday start
    const startOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    const start = new Date(firstDay);
    start.setDate(firstDay.getDate() - startOffset);
    const weeks = [];
    let cur = new Date(start);
    while (cur <= lastDay || weeks.length % 1 !== 0) {
      const week = [];
      for (let i = 0; i < 7; i++) {
        week.push(new Date(cur));
        cur.setDate(cur.getDate() + 1);
        if (cur > lastDay && i === 6) break;
      }
      weeks.push(week);
      if (cur > lastDay) break;
    }
    return weeks;
  };

  const DAY_LABELS = ["M","T","W","T","F","S","S"];
  const isToday = (d) => d.toISOString().split("T")[0] === today.toISOString().split("T")[0];
  const isFuture = (d) => d > today;
  const hasWorkout = (d) => workedOutDays.has(d.toISOString().split("T")[0]);
  const isCurrentMonth = (d) => d.getMonth() === today.getMonth();

  const monthName = today.toLocaleDateString("en-US", { month:"long", year:"numeric" });
  const weekRange = (() => {
    const days = getWeekDays();
    const s = days[0].toLocaleDateString("en-US", { month:"short", day:"numeric" });
    const e = days[6].toLocaleDateString("en-US", { month:"short", day:"numeric" });
    return `${s} – ${e}`;
  })();

  const DayDot = ({ date, showLabel = false, small = false }) => {
    const worked = hasWorkout(date);
    const tod    = isToday(date);
    const future = isFuture(date);
    const inMonth = isCurrentMonth(date);
    const size = small ? 30 : 38;

    return (
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"4px" }}>
        {showLabel && <div style={{ fontSize:"9px", color:SB, letterSpacing:"0.06em", fontWeight:"600", marginBottom:"2px" }}>{DAY_LABELS[date.getDay() === 0 ? 6 : date.getDay() - 1]}</div>}
        <div style={{
          width:size, height:size, borderRadius:"50%",
          display:"flex", alignItems:"center", justifyContent:"center",
          background: worked ? `${A}20` : "transparent",
          border: worked ? `2px solid ${A}` : tod ? `2px solid ${MT}` : "2px solid transparent",
          opacity: future ? 0.3 : !inMonth && !worked ? 0.25 : 1,
          transition: "all 0.2s ease",
        }}>
          <span style={{
            fontSize: small ? "11px" : "13px",
            fontWeight: tod ? "700" : "500",
            color: worked ? A : tod ? TX : SB,
          }}>{date.getDate()}</span>
        </div>
        {/* Dot indicator for worked days in month view */}
        {small && worked && !showLabel && (
          <div style={{ width:"4px", height:"4px", borderRadius:"50%", background:A, marginTop:"-2px" }}/>
        )}
      </div>
    );
  };

  return (
    <div style={{ background:S1, borderBottom:`1px solid ${BD}`, paddingBottom:"16px" }}>
      {/* Header row */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 16px 10px" }}>
        <div>
          <div style={subLbl}>Streak</div>
          <div style={{ display:"flex", alignItems:"baseline", gap:"4px" }}>
            <span style={{ fontSize:"32px", fontWeight:"700", letterSpacing:"-0.04em", color: streak > 0 ? A : TX }}>{streak}</span>
            <span style={{ fontSize:"13px", color:SB }}>day{streak !== 1 ? "s" : ""}</span>
          </div>
        </div>
        {/* Week / Month toggle */}
        <div style={{ display:"flex", background:S2, borderRadius:"8px", border:`1px solid ${BD}`, overflow:"hidden" }}>
          {["week","month"].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              background: view===v ? MT : "transparent",
              border:"none", color: view===v ? TX : SB,
              padding:"6px 14px", fontSize:"12px", fontWeight:"600",
              cursor:"pointer", textTransform:"capitalize", letterSpacing:"0.04em",
              transition:"background 0.15s",
            }}>{v}</button>
          ))}
        </div>
      </div>

      {/* Period label */}
      <div style={{ fontSize:"11px", color:SB, letterSpacing:"0.06em", padding:"0 16px 10px", textTransform:"uppercase" }}>
        {view === "week" ? weekRange : monthName}
      </div>

      {/* WEEK VIEW */}
      {view === "week" && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", padding:"0 8px" }}>
          {getWeekDays().map((d,i) => (
            <div key={i} style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
              <DayDot date={d} showLabel={true} />
            </div>
          ))}
        </div>
      )}

      {/* MONTH VIEW */}
      {view === "month" && (
        <div style={{ padding:"0 8px" }}>
          {/* Day header */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", marginBottom:"4px" }}>
            {DAY_LABELS.map((l,i) => (
              <div key={i} style={{ textAlign:"center", fontSize:"9px", color:SB, fontWeight:"600", letterSpacing:"0.06em", padding:"2px 0" }}>{l}</div>
            ))}
          </div>
          {getMonthWeeks().map((week, wi) => (
            <div key={wi} style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", marginBottom:"4px" }}>
              {week.map((d, di) => (
                <div key={di} style={{ display:"flex", justifyContent:"center" }}>
                  <DayDot date={d} showLabel={false} small={true} />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// PROGRESS SCREEN
// ════════════════════════════════════════════════════════════════════════
function ProgressScreen({ profile, onProfileTap, workoutHistory, units }) {
  const wLabel = units === "metric" ? "kg" : "lbs";

  // Compute current week's data from workoutHistory
  const getWeekStart = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const mon = new Date(d);
    mon.setDate(d.getDate() - diff);
    mon.setHours(0,0,0,0);
    return mon;
  };
  const weekStart = getWeekStart();
  const thisWeek  = workoutHistory.filter(w => new Date(w.date + "T00:00:00") >= weekStart);

  const weekVol   = DAYS.map(d => {
    const wk = thisWeek.find(w => {
      const wd = new Date(w.date + "T00:00:00");
      return DAYS[wd.getDay() === 0 ? 6 : wd.getDay() - 1] === d;
    });
    return { d: d[0], v: wk?.totalVolume || 0 };
  });

  const totalVol   = weekVol.reduce((s, d) => s + d.v, 0);
  const sessions   = thisWeek.length;

  // Best lift per exercise this week
  const bestMap = {};
  thisWeek.forEach(session => {
    session.exercises.forEach(ex => {
      ex.sets.forEach(set => {
        const w = parseFloat(set.w) || 0;
        const r = parseInt(set.r) || 0;
        if (w > 0 && (!bestMap[ex.name] || w > bestMap[ex.name].w)) {
          bestMap[ex.name] = { w, r };
        }
      });
    });
  });
  const bestLifts = Object.entries(bestMap).slice(0, 5).map(([name, d]) => ({ name, ...d }));

  const weekLabel = weekStart.toLocaleDateString("en-US", { month:"short", day:"numeric" });

  return (
    <div>
      <ScreenHeader sup={`Week of ${weekLabel}`} title="Progress" profile={profile} onProfileTap={onProfileTap}/>

      {/* ── Streak Calendar — edge to edge ── */}
      <StreakCalendar workoutHistory={workoutHistory} />

      <div style={{ padding:"14px 14px 0" }}>
        {workoutHistory.length === 0 ? (
          <div style={{ ...card, textAlign:"center", padding:"40px 20px" }}>
            <div style={{ fontSize:"17px", fontWeight:"600", marginBottom:"6px" }}>No data yet</div>
            <div style={{ fontSize:"15px", color:SB }}>Complete a workout to see your progress here.</div>
          </div>
        ) : (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px", marginBottom:"8px", marginTop:"12px" }}>
              {[
                { label:"Sessions", val:sessions, sub:"this week", hi:true },
                { label:"Volume", val: totalVol >= 1000 ? `${(totalVol/1000).toFixed(1)}k` : (totalVol || "—"), sub:`${wLabel} this week` }
              ].map((s,i) => (
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
                <BarChart data={weekVol} barSize={26} margin={{ top:6, right:0, left:-20, bottom:0 }}>
                  <XAxis dataKey="d" axisLine={false} tickLine={false} tick={{ fill:SB, fontSize:11, fontFamily:"inherit" }}/>
                  <Tooltip cursor={false} contentStyle={{ background:S2, border:`1px solid ${BD}`, borderRadius:"8px", fontSize:"12px", color:TX }} formatter={(v) => v>0?[`${(v/1000).toFixed(1)}k ${wLabel}`,"Volume"]:["Rest",""]}/>
                  <Bar dataKey="v" radius={[4,4,0,0]}>
                    {weekVol.map((d,i) => <Cell key={i} fill={d.v===0?MT:A}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {bestLifts.length > 0 && (
              <>
                <div style={{ ...subLbl, paddingLeft:"4px", marginBottom:"8px", marginTop:"10px" }}>Best This Week</div>
                {bestLifts.map((l,i) => (
                  <div key={i} style={{ ...card, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span style={{ fontSize:"17px", fontWeight:"500" }}>{l.name}</span>
                    <div><span style={{ fontSize:"20px", fontWeight:"700", letterSpacing:"-0.03em" }}>{l.w}</span><span style={{ fontSize:"14px", color:SB }}> {wLabel} × {l.r}</span></div>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// PRs SCREEN
// ════════════════════════════════════════════════════════════════════════
function PRsScreen({ prs, profile, onProfileTap, units, workoutHistory }) {
  const wLabel = units === "metric" ? "kg" : "lbs";

  // Derive PRs from workout history (max weight per exercise)
  const prMap = {};
  workoutHistory.forEach(session => {
    session.exercises.forEach(ex => {
      ex.sets.forEach(set => {
        const w = parseFloat(set.w) || 0;
        const r = parseInt(set.r) || 0;
        if (w > 0) {
          if (!prMap[ex.name] || w > prMap[ex.name].w) {
            prMap[ex.name] = { w, r, date: fmtDate(session.date) };
          }
        }
      });
    });
  });

  const derivedPRs = Object.entries(prMap).map(([name, d], i) => ({ id:i, name, ...d }));
  const displayPRs = derivedPRs.length > 0 ? derivedPRs : prs; // fall back to seed data if no history

  return (
    <div>
      <ScreenHeader sup="All Time" title="Records" profile={profile} onProfileTap={onProfileTap}/>
      <div style={{ padding:"14px" }}>
        {workoutHistory.length === 0 && (
          <div style={{ ...card, textAlign:"center", padding:"40px 20px", marginBottom:"8px" }}>
            <div style={{ fontSize:"15px", fontWeight:"600", marginBottom:"6px" }}>No records yet</div>
            <div style={{ fontSize:"13px", color:SB }}>Complete a workout with weight entries and your PRs will appear here automatically.</div>
          </div>
        )}
        {displayPRs.map(pr => (
          <div key={pr.id} style={{ ...card, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <div style={{ fontSize:"17px", fontWeight:"600" }}>{pr.name}</div>
              <div style={{ fontSize:"13px", color:SB, marginTop:"2px", letterSpacing:"0.04em" }}>{pr.date}</div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div><span style={{ fontSize:"26px", fontWeight:"700", color:A, letterSpacing:"-0.04em" }}>{pr.w}</span><span style={{ fontSize:"14px", color:SB }}> {wLabel}</span></div>
              <div style={{ fontSize:"13px", color:SB }}>× {pr.r} {pr.r===1?"rep":"reps"}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// PROFILE SCREEN
// ════════════════════════════════════════════════════════════════════════
function ProfileScreen({ profile, setProfile, workoutHistory, onSignOut }) {
  const [initials, setInitials] = useState(profile.initials);
  const [color, setColor]       = useState(profile.color);
  const [selectedUnits, setSelectedUnits] = useState(profile.units || "imperial");
  const [saveState, setSaveState] = useState("idle"); // "idle" | "saved"

  // Track if user changed anything from the saved profile
  const hasChanges = initials.trim().toUpperCase().slice(0,2) !== profile.initials || color !== profile.color;

  // Reset button state when user makes a change after saving
  useEffect(() => {
    if (saveState === "saved" && hasChanges) {
      setSaveState("idle");
    }
  }, [initials, color, hasChanges]);

  const saveProfile = () => {
    if (!initials.trim()) return;
    setProfile({ initials: initials.trim().toUpperCase().slice(0,2), color, units: selectedUnits, setup: true });
    setSaveState("saved");
  };

  const totalWorkouts = workoutHistory.length;
  const totalTime = workoutHistory.reduce((a,w) => a + w.duration, 0);
  const totalVol = workoutHistory.reduce((a,w) => a + (w.totalVolume||0), 0);

  const btnLabel = saveState === "saved" ? "Updated" : (profile.setup ? "Update" : "Save");
  const isSaved = saveState === "saved";

  return (
    <div>
      <ScreenHeader sup="Account" title="Profile"/>
      <div style={{ padding:"14px" }}>

        {/* Avatar + setup */}
        <div style={{ ...card, padding:"24px 18px", textAlign:"center" }}>
          <div style={{ width:"72px", height:"72px", borderRadius:"50%", background:color, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px", fontSize:"28px", fontWeight:"700", color:"#000", letterSpacing:"-0.02em" }}>
            {profile.setup ? profile.initials : "?"}
          </div>

          {!profile.setup ? (
            <>
              <div style={{ fontSize:"15px", fontWeight:"600", marginBottom:"4px" }}>Set up your profile</div>
              <div style={{ fontSize:"12px", color:SB, marginBottom:"16px" }}>Choose your initials and a color</div>
            </>
          ) : (
            <div style={{ fontSize:"15px", fontWeight:"600", marginBottom:"14px" }}>{profile.initials}</div>
          )}

          <div style={{ maxWidth:"200px", margin:"0 auto", marginBottom:"14px" }}>
            <div style={{ ...subLbl, marginBottom:"6px", textAlign:"left" }}>Initials</div>
            <input
              style={{ ...inputSt, width:"100%", textAlign:"center", fontSize:"18px", fontWeight:"700", letterSpacing:"0.1em", textTransform:"uppercase" }}
              maxLength={2} placeholder="VC" value={initials}
              onChange={e => setInitials(e.target.value)}
            />
          </div>

          <div style={{ marginBottom:"16px" }}>
            <div style={{ ...subLbl, marginBottom:"8px" }}>Color</div>
            <div style={{ display:"flex", gap:"10px", justifyContent:"center" }}>
              {PROFILE_COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)} style={{
                  width:"32px", height:"32px", borderRadius:"50%", background:c, border: color===c ? "3px solid #fff" : "3px solid transparent",
                  cursor:"pointer", transition:"border 0.15s",
                }}/>
              ))}
            </div>
          </div>

          <button onClick={saveProfile} style={{
            ...btnPrim, padding:"10px 32px",
            background: isSaved ? `linear-gradient(135deg, ${A}, #a8e600)` : A,
            boxShadow: isSaved ? `0 0 18px ${A}55, 0 2px 8px rgba(0,0,0,0.3)` : "none",
            color: "#000", letterSpacing: isSaved ? "0.06em" : "0",
            transition: "all 0.35s ease",
          }}>
            {btnLabel}
          </button>
        </div>

        {/* Stats summary */}
        {totalWorkouts > 0 && (
          <>
            <div style={{ ...subLbl, paddingLeft:"4px", marginTop:"16px", marginBottom:"8px" }}>All-Time Stats</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px" }}>
              {[
                { label:"Workouts", val:totalWorkouts },
                { label:"Time", val: totalTime >= 3600 ? `${(totalTime/3600).toFixed(1)}h` : `${Math.floor(totalTime/60)}m` },
                { label:"Volume", val: totalVol >= 1000 ? `${(totalVol/1000).toFixed(0)}k` : totalVol },
              ].map((s,i) => (
                <div key={i} style={{ ...card, textAlign:"center", marginBottom:0 }}>
                  <div style={{ fontSize:"22px", fontWeight:"700", color:A }}>{s.val}</div>
                  <div style={{ ...subLbl, marginTop:"2px" }}>{s.label}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Settings */}
        <div style={{ ...subLbl, paddingLeft:"4px", marginTop:"20px", marginBottom:"8px" }}>Settings</div>
        <div style={card}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"4px 0" }}>
            <span style={{ fontSize:"16px" }}>Units</span>
            <div style={{ display:"flex", gap:"4px" }}>
              {[
                { id:"imperial", label:"lbs / mi / in" },
                { id:"metric",   label:"kg / km / cm" },
              ].map(u => (
                <button key={u.id} onClick={() => { setSelectedUnits(u.id); setProfile(p => ({ ...p, units: u.id })); }} style={{
                  background: selectedUnits===u.id ? A : S2,
                  color: selectedUnits===u.id ? "#000" : SB,
                  border: `1px solid ${selectedUnits===u.id ? A : MT}`,
                  borderRadius:"6px", padding:"6px 12px", fontSize:"13px", cursor:"pointer",
                  fontWeight: selectedUnits===u.id ? "700" : "400",
                }}>
                  {u.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div style={card}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"4px 0" }}>
            <span style={{ fontSize:"16px" }}>Sign Out</span>
            <button onClick={async () => { await supabase.auth.signOut(); onSignOut(); }} style={{ background:"none", border:"none", cursor:"pointer", fontSize:"16px", color:RED, fontWeight:"600", padding:0 }}>Sign Out</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// LOGIN SCREEN — with first-time onboarding walkthrough
// ════════════════════════════════════════════════════════════════════════
function LoginScreen({ authError, onClearError }) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  // When GymApp signals an auth error from the deep link handler, stop the spinner
  useEffect(() => {
    if (authError) setLoading(false);
  }, [authError]);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      if (Capacitor.isNativePlatform()) {
        // On native: get the OAuth URL without redirecting the WebView,
        // then open it in an external browser. The WebView stays on index.html
        // so appUrlOpen fires into the already-running React app.
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: "com.theryn.app://login-callback",
            skipBrowserRedirect: true,
          },
        });
        if (error) throw error;
        if (data?.url) await Browser.open({ url: data.url });
        // loading stays true until appUrlOpen fires and auth completes
        // (or appStateChange resets it after 2s if it fails)
      } else {
        // On web: normal redirect flow
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: window.location.origin },
        });
        if (error) throw error;
      }
    } catch (err) {
      setError("Sign-in failed. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div style={{
      background: BG, height:"100vh",
      fontFamily: "-apple-system,'Helvetica Neue',Helvetica,sans-serif",
      color: TX, display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
      padding:"48px 32px", boxSizing:"border-box",
    }}>
      <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"16px" }}>
        <div style={{ width:"88px", height:"88px", borderRadius:"50%", background:"#080808", border:`1px solid ${A}22`, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", boxShadow:`0 0 32px ${A}22` }}>
          <img src="/theryn-logo.svg" width="88" height="88" alt="Theryn Logo" style={{ objectFit: "contain" }} />
        </div>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:"38px", fontWeight:"800", letterSpacing:"-0.05em", color:A, lineHeight:1 }}>Theryn</div>
          <div style={{ fontSize:"16px", color:SB, marginTop:"8px", lineHeight:"1.6" }}>Your personal gym & body tracking log.</div>
        </div>
      </div>

      <div style={{ width:"100%", display:"flex", flexDirection:"column", gap:"10px" }}>
        {(error || authError) && (
          <div
            onClick={() => { setError(null); onClearError?.(); }}
            style={{ background:"rgba(255,92,92,0.1)", border:`1px solid ${RED}`, borderRadius:"8px", padding:"10px 14px", fontSize:"14px", color:RED, wordBreak:"break-all", cursor:"pointer" }}>
            {error || authError}
            <div style={{ fontSize:"13px", color:SB, marginTop:"4px" }}>Tap to dismiss</div>
          </div>
        )}
        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          style={{
            background: loading ? MT : A, border:"none", borderRadius:"12px", color:"#000",
            fontWeight:"700", fontSize:"17px", padding:"16px 20px", cursor: loading ? "default" : "pointer",
            display:"flex", alignItems:"center", justifyContent:"center", gap:"10px", width:"100%",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? (
            <>
              <div style={{ width:"16px", height:"16px", borderRadius:"50%", border:"2px solid #000", borderTopColor:"transparent", animation:"spin 0.7s linear infinite" }}/>
              Connecting…
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#000" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#333" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#555" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#222" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            </>
          )}
        </button>
        <div style={{ textAlign:"center", fontSize:"14px", color:MT }}>
          A quick tour of the app will start after sign-in.
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// ONBOARDING TOUR — full-screen slides shown once after first login
// ════════════════════════════════════════════════════════════════════════
function TourOverlay({ onDone }) {
  const [step, setStep] = useState(0);
  const [leaving, setLeaving] = useState(false);

  const SLIDES = [
    {
      icon: (
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={A} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6.5 6.5h11M6.5 17.5h11M4 12h16M4 12a2 2 0 01-2-2V8a2 2 0 012-2h1M20 12a2 2 0 002-2V8a2 2 0 00-2-2h-1M4 12a2 2 0 00-2 2v2a2 2 0 002 2h1M20 12a2 2 0 012 2v2a2 2 0 01-2 2h-1"/>
        </svg>
      ),
      tag: "Welcome to Theryn",
      title: "Your Personal\nGym Tracker",
      body: "Log workouts, track your body, and see your progress — all in one clean app built for lifters.",
    },
    {
      icon: (
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={A} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="3"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="14" y2="12"/><circle cx="17" cy="17" r="3" fill={`${A}30`} stroke={A}/><line x1="17" y1="15.5" x2="17" y2="17"/><line x1="17" y1="17" x2="18" y2="17"/>
        </svg>
      ),
      tag: "Log Tab",
      title: "Log Every\nWorkout",
      body: "Hit Start Workout to kick off your session timer. Log sets with weight and reps as you go — it saves automatically.",
    },
    {
      icon: (
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={A} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="14" x2="10" y2="14"/><line x1="8" y1="18" x2="12" y2="18"/>
        </svg>
      ),
      tag: "Routine Tab",
      title: "Build Your\nWeekly Plan",
      body: "Set the exercises for each day. Your routine loads automatically when you open the Log tab — no setup every morning.",
    },
    {
      icon: (
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={A} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="5" r="2"/><line x1="12" y1="7" x2="12" y2="14"/><polyline points="8 11 12 14 16 11"/><line x1="9.5" y1="19" x2="12" y2="14"/><line x1="14.5" y1="19" x2="12" y2="14"/>
        </svg>
      ),
      tag: "Body Tab",
      title: "Track Your\nBody Changes",
      body: "Log your weight and measurements like chest, waist, and arms. Watch your body composition shift week over week.",
    },
    {
      icon: (
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={A} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
        </svg>
      ),
      tag: "Progress Tab",
      title: "See Your\nStreak & Gains",
      body: "View your workout streak calendar, weekly volume, and your best lifts — all from your real logged data.",
    },
    {
      icon: (
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={A} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
        </svg>
      ),
      tag: "Coach Connection",
      title: "Team Up &\nCrush Goals",
      body: "Link up with your real-life coach. They can build your routine and track your weigh-ins directly while you focus on the heavy lifting.",
    },
    {
      icon: (
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={A} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      ),
      tag: "You're Ready",
      title: "Hit PRs &\nTrack Them All",
      body: "Your personal records are detected automatically from every workout you log. New max? It shows up instantly.",
    },
  ];

  const isLast = step === SLIDES.length - 1;
  const s = SLIDES[step];

  const finish = () => {
    setLeaving(true);
    // Mark tour as completed in localStorage so it doesn't show again
    try {
      // Get the user id from supabase session if available
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user?.id) {
          localStorage.setItem(`theryn_tour_done_${session.user.id}`, "1");
        }
      });
    } catch(e) {}
    setTimeout(onDone, 350);
  };

  const next = () => {
    if (isLast) { finish(); return; }
    setStep(p => p + 1);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 400,
      background: BG,
      display: "flex", flexDirection: "column",
      fontFamily: "-apple-system,'Helvetica Neue',Helvetica,sans-serif",
      opacity: leaving ? 0 : 1,
      transition: "opacity 0.35s ease",
    }}>
      {/* Skip button — top right */}
      {!isLast && (
        <div style={{ padding: "52px 24px 0", display: "flex", justifyContent: "flex-end" }}>
          <button onClick={finish} style={{
            background: "none", border: "none", color: SB,
            fontSize: "15px", fontWeight: "500", cursor: "pointer",
            padding: "8px 4px",
          }}>
            Skip
          </button>
        </div>
      )}

      {/* Content area — centered */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "40px 36px",
        gap: "20px",
      }}>
        {/* Icon circle */}
        <div style={{
          width: "96px", height: "96px", borderRadius: "28px",
          background: `${A}12`,
          border: `1.5px solid ${A}30`,
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: "8px",
        }}>
          {s.icon}
        </div>

        {/* Tag */}
        <div style={{
          fontSize: "11px", color: A, fontWeight: "700",
          letterSpacing: "0.1em", textTransform: "uppercase",
        }}>
          {s.tag}
        </div>

        {/* Title — multiline */}
        <div style={{
          fontSize: "34px", fontWeight: "800",
          letterSpacing: "-0.04em", lineHeight: 1.1,
          color: TX, textAlign: "center",
          whiteSpace: "pre-line",
        }}>
          {s.title}
        </div>

        {/* Body text */}
        <div style={{
          fontSize: "15px", color: SB, lineHeight: "1.7",
          textAlign: "center", maxWidth: "280px",
        }}>
          {s.body}
        </div>
      </div>

      {/* Bottom controls */}
      <div style={{ padding: "0 24px 52px" }}>
        {/* Step dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: "6px", marginBottom: "24px" }}>
          {SLIDES.map((_, i) => (
            <div key={i} onClick={() => setStep(i)} style={{
              height: "4px",
              width: i === step ? "24px" : "6px",
              borderRadius: "2px",
              background: i === step ? A : MT,
              cursor: "pointer",
              transition: "all 0.25s ease",
            }}/>
          ))}
        </div>

        {/* CTA button */}
        <button onClick={next} style={{
          ...btnPrim,
          width: "100%",
          padding: "16px",
          fontSize: "16px",
          borderRadius: "14px",
          letterSpacing: "0.02em",
        }}>
          {isLast ? "Let's Go 💪" : "Next"}
        </button>
      </div>
    </div>
  );
}

