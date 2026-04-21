import React, { useState, useEffect, useRef } from "react";
import { BarChart, Bar, XAxis, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { supabase } from "./lib/supabase";
import { processOfflineQueue } from "./lib/offlineQueue";
import { Capacitor } from "@capacitor/core";
import { Haptics } from "@capacitor/haptics";
import { App as CapApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Share } from "@capacitor/share";
import { saveCompletedWorkout, loadWorkoutHistory } from "./hooks/useWorkouts";
import { loadBodyWeights, saveBodyWeight, deleteBodyWeight, loadMeasurements, saveMeasurement, deleteMeasurement } from "./hooks/useBody";
import { loadRoutine, saveRoutine } from "./hooks/useRoutine";
import { findProfileByCode, sendCoachRequest, loadCoachLinks, acceptCoachRequest, removeCoachLink, loadAthleteData, ensureInviteCode, loadAthleteSessionsSince } from "./hooks/useCoach";
import LandingPage from "./components/LandingPage";
import { requestNotificationPermissions, getNotificationPermissionState, scheduleDailyRoutine, scheduleReflection, scheduleStreakReminder, triggerCoachEditNotification, triggerAthleteFinishedNotification, scheduleCoachDailyDigest, markCoachSeen, getCoachLastSeen, triggerCoachCatchUp, registerNotificationTapHandlers, consumePendingDeepLink } from "./hooks/useNotifications";
import { detectSignals, summarizeForRow, computeStats, computeBMI, bmiCategory, SEVERITY_COLORS } from "./lib/coachInsights";
import {
  loadClientFees, upsertClientFee, deleteClientFee,
  loadPayments, savePayment, deletePayment,
  computeMonthlySummary, athletePaymentStatus,
  fmtMoney, SUPPORTED_CURRENCIES,
} from "./hooks/usePayments";
import { AthleteAttendanceHeatmap, AthleteVolumeChart, AthletePRTimeline, AthleteSessionDrawer } from "./components/coach/AthleteDepth";
import { motion, useAnimation, useMotionValue, useTransform } from "framer-motion";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, TouchSensor } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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

const calculateRoutineStreak = (workoutHistory, routine) => {
  if (!workoutHistory || workoutHistory.length === 0 || !routine) return 0;
  const workedOutDays = new Set(workoutHistory.map(w => w.date));
  
  // Find the exact string date of the very first recorded workout
  let firstDateStr = workoutHistory[workoutHistory.length - 1].date;
  for (const w of workoutHistory) {
    if (w.date < firstDateStr) firstDateStr = w.date;
  }
  const firstDate = new Date(firstDateStr + "T12:00:00");
  firstDate.setHours(0,0,0,0);

  let streak = 0;
  let check = new Date();
  check.setHours(0,0,0,0);
  const todayIso = check.toISOString().split("T")[0];
  
  // Walk backwards from today until we hit the date of their very first workout
  while (check >= firstDate) {
    const iso = check.toISOString().split("T")[0];
    const jsDay = check.getDay();
    const dayStr = DAYS[jsDay === 0 ? 6 : jsDay - 1]; // "Mon", "Tue", etc.
    const isRestDayStr = routine[dayStr]?.type === "Rest";
    
    if (workedOutDays.has(iso)) {
      streak++;
    } else if (isRestDayStr) {
      streak++; // Resting on a rest day counts as following the routine
    } else {
      if (iso === todayIso) {
        // Did not work out today, but today isn't over yet so it doesn't break the streak
      } else {
        // Missed a past scheduled workout, streak breaks
        break;
      }
    }
    check.setDate(check.getDate() - 1);
  }
  return streak;
};

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
function ScreenHeader({ sup, title, profile, onProfileTap, rightContent }) {
  return (
    <div style={{ padding:"48px 16px 20px", borderBottom:`1px solid ${BD}` }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div>
          <div style={{ ...subLbl, marginBottom:"4px" }}>{sup}</div>
          <div style={{ fontSize:"28px", fontWeight:"700", letterSpacing:"-0.04em" }}>{title}</div>
          {Capacitor.getPlatform() === 'web' && (
            <div style={{ fontSize:"12px", color:A, fontWeight:"600", marginTop:"4px", letterSpacing:"0.02em", textTransform:"uppercase" }}>
              Coaching, Without the Chaos
            </div>
          )}
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

// ── SWIPE-TO-DELETE ROW ──────────────────────────────────────────────────
function SwipeRow({ children, onDelete, rowStyle, bgColor }) {
  const [swiped, setSwiped] = useState(false); // true = delete button revealed
  const controls = useAnimation();
  const x = useMotionValue(0);

  const handleDragEnd = async (e, info) => {
    const offset = info.offset.x;
    const velocity = info.velocity.x;

    // Long swipe or fast flick → instant delete
    if (offset < -160 || (offset < -80 && velocity < -600)) {
      Haptics.impact({ style: "medium" }).catch(() => {});
      await controls.start({ x: -window.innerWidth, transition: { duration: 0.18, ease: "easeIn" } });
      onDelete();
    // Partial swipe → reveal delete button 
    } else if (offset < -60) {
      Haptics.impact({ style: "light" }).catch(() => {});
      setSwiped(true);
      controls.start({ x: -80, transition: { type: "spring", stiffness: 400, damping: 30 } });
    // Tiny drag → snap back
    } else {
      setSwiped(false);
      controls.start({ x: 0, transition: { type: "spring", stiffness: 400, damping: 30 } });
    }
  };

  const handleDelete = () => {
    controls.start({ x: -window.innerWidth, transition: { duration: 0.18 } });
    setTimeout(onDelete, 180);
  };

  const bg = bgColor || BG;

  return (
    <div style={{ position: "relative", overflow: "hidden", flex: 1, ...rowStyle }}>
      {/* Delete zone — only visible width when swiped */}
      <div
        onClick={handleDelete}
        style={{
          position: "absolute", right: 0, top: 0, bottom: 0,
          width: "80px",
          display: "flex", justifyContent: "center", alignItems: "center",
          background: RED, cursor: "pointer",
        }}
      >
        <span style={{ color: "#fff", fontSize: "13px", fontWeight: "700" }}>Delete</span>
      </div>
      <motion.div
        drag="x"
        dragConstraints={{ left: -80, right: 0 }}
        dragElastic={{ left: 0.3, right: 0 }}
        style={{ x, position: "relative", zIndex: 1, background: bg, touchAction: "pan-y", width: "100%", height: "100%", display: "flex", flexDirection: "column" }}
        animate={controls}
        onDragEnd={handleDragEnd}
        onClick={swiped ? () => { setSwiped(false); controls.start({ x: 0, transition: { type: "spring", stiffness: 400, damping: 30 } }); } : undefined}
      >
        {children}
      </motion.div>
    </div>
  );
}

// ── SORTABLE EXERCISE ROW FOR DND-KIT (Routines & AthleteView) ───────────────
function SortableExerciseRow({ id, onRemove, children }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition,
    zIndex: isDragging ? 100 : "auto",
    opacity: isDragging ? 0.5 : 1,
    willChange: "transform",
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div style={{ display:"flex", alignItems:"stretch", borderBottom: `1px solid ${MT}`, position: "relative" }}>
        {/* Drag handle */}
        <div
          {...attributes}
          {...listeners}
          style={{ padding:"14px 10px", color:SB, fontSize:"20px", cursor:"grab", touchAction:"none", flexShrink:0, display:"flex", alignItems:"center", userSelect:"none" }}
        >
          ≡
        </div>
        {/* bgColor=S1 so the sliding motion.div matches the card surface, hiding the red delete zone */}
        <SwipeRow onDelete={onRemove} bgColor={S1}>
          {children}
        </SwipeRow>
      </div>
    </div>
  );
}

// ── SORTABLE LOG EXERCISE CARD (Log tab) ─────────────────────────────────────
// Render-prop pattern: children(dragHandle) so the drag handle lands inside the card header
function LogSortableItem({ id, onDelete, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const dragHandle = (
    <div
      {...attributes}
      {...listeners}
      style={{ padding:"4px 10px 4px 0", color:SB, fontSize:"20px", cursor:"grab", touchAction:"none", flexShrink:0, lineHeight:1, userSelect:"none" }}
    >
      ≡
    </div>
  );
  return (
    <div ref={setNodeRef} style={{
      transform: CSS.Transform.toString(transform),
      transition: isDragging ? undefined : transition,
      zIndex: isDragging ? 50 : "auto",
      opacity: isDragging ? 0.5 : 1,
      willChange: "transform",
    }}>
      <SwipeRow onDelete={onDelete} bgColor={S1}>
        {children(dragHandle)}
      </SwipeRow>
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
  const inputRef = useRef(null);

  useEffect(() => { requestAnimationFrame(() => { setVisible(true); setTimeout(() => inputRef.current?.focus(), 60); }); }, []);

  useEffect(() => {
    if (EXDB_CACHE) return;
    fetch("/exercises.json").then(r => r.json()).then(data => {
      EXDB_CACHE = data;
      setDb(data);
    }).catch(e => console.error("DB Load Error", e));
  }, []);

  const closeOverlay = () => {
    setVisible(false);
    setTimeout(onClose, 220);
  };

  const results = q.trim() ? db.filter(e => e.name.toLowerCase().includes(q.toLowerCase())).slice(0, 40) : [];

  const isDesktop = window.innerWidth >= 768;

  return (
    <div
      style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        background: visible ? "rgba(0,0,0,0.8)" : "rgba(0,0,0,0)",
        zIndex: 1000, display: "flex",
        alignItems: isDesktop ? "center" : "flex-end",
        justifyContent: "center",
        transition: "background 0.22s ease",
        backdropFilter: visible ? "blur(4px)" : "none",
      }}
      onClick={closeOverlay}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: S1,
          borderRadius: isDesktop ? "20px" : "24px 24px 0 0",
          width: isDesktop ? "560px" : "100%",
          maxWidth: isDesktop ? "560px" : undefined,
          height: isDesktop ? "70vh" : "85vh",
          maxHeight: "80vh",
          borderTop: !isDesktop ? `1px solid ${BD}` : undefined,
          border: isDesktop ? `1px solid #222` : undefined,
          display: "flex", flexDirection: "column",
          transform: visible ? "translateY(0) scale(1)" : isDesktop ? "scale(0.96)" : "translateY(100%)",
          opacity: visible ? 1 : 0,
          transition: "transform 0.22s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.22s ease",
          boxShadow: isDesktop ? "0 24px 80px rgba(0,0,0,0.7)" : undefined,
          overflow: "hidden",
        }}
      >
        {/* Header & Search */}
        <div style={{ padding: "16px 20px", flexShrink: 0, borderBottom: `1px solid ${BD}` }}>
          {!isDesktop && <div style={{ width:"40px", height:"5px", background:MT, borderRadius:"3px", margin:"0 auto 14px" }}/>}
          <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
            <div style={{ position: "relative", flex: 1 }}>
              <svg style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={SB} strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                ref={inputRef}
                style={{ ...inputSt, width:"100%", fontSize:"15px", padding:"12px 16px 12px 38px" }}
                placeholder="Search 800+ exercises…"
                value={q}
                onChange={e => setQ(e.target.value)}
              />
            </div>
            <button onClick={closeOverlay} style={{ background:"none", border:`1px solid ${BD}`, borderRadius:"10px", color:SB, fontSize:"13px", fontWeight:600, cursor:"pointer", padding:"10px 14px", whiteSpace:"nowrap" }}>Cancel</button>
          </div>
          {q.trim() && (
            <div style={{ fontSize:"12px", color:SB, marginTop:"8px", paddingLeft:"2px" }}>
              {results.length} result{results.length !== 1 ? "s" : ""} for "<span style={{ color:A }}>{q}</span>"
            </div>
          )}
        </div>

        {/* Results List */}
        <div style={{ flex:1, overflowY:"auto", padding:"12px 16px 24px" }}>
          {q.trim() && results.length === 0 && (
            <button onClick={() => { onSelect(q.trim()); closeOverlay(); }} style={{ width:"100%", textAlign:"left", background:S2, border:`1px solid ${A}44`, borderRadius:"14px", padding:"16px 18px", cursor:"pointer", marginBottom:"8px" }}>
              <div style={{ fontSize:"15px", fontWeight:700, color:A }}>+ Add "{q.trim()}"</div>
              <div style={{ fontSize:"12px", color:SB, marginTop:"3px" }}>Create a custom exercise</div>
            </button>
          )}

          {results.map(ex => (
            <button key={ex.id} onClick={() => { onSelect(ex.name); closeOverlay(); }} style={{ width:"100%", textAlign:"left", background:"none", border:0, borderBottom:`1px solid ${MT}`, padding:"13px 4px", cursor:"pointer", display:"flex", flexDirection:"column", gap:"3px", transition:"background 0.15s" }}
              onMouseEnter={el => el.currentTarget.style.background = S2}
              onMouseLeave={el => el.currentTarget.style.background = "none"}
            >
              <div style={{ fontSize:"15px", fontWeight:600, color:TX }}>{ex.name}</div>
              <div style={{ fontSize:"11px", color:SB, textTransform:"uppercase", letterSpacing:"0.05em" }}>
                {[ex.primaryMuscles?.[0], ex.equipment].filter(Boolean).join(" · ")}
              </div>
            </button>
          ))}

          {!q.trim() && db.length > 0 && (
            <div style={{ textAlign:"center", padding:"48px 20px", color:MT, fontSize:"14px" }}>
              Start typing to search 800+ exercises
            </div>
          )}

          {!q.trim() && db.length === 0 && (
            <div style={{ textAlign:"center", padding:"48px 20px", color:MT, fontSize:"14px" }}>
              Loading exercise database…
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
  // Skip landing on native apps, or when returning from an OAuth redirect.
  const [showLanding, setShowLanding] = useState(() => {
    if (Capacitor.isNativePlatform()) return false;
    if (typeof window === "undefined") return true;
    const { pathname, search, hash } = window.location;
    const isOAuthConsent = pathname === "/oauth/consent";
    const hasOAuthParams =
      /[?&](code|error|access_token|refresh_token)=/.test(search) ||
      /[#&](access_token|refresh_token|error)=/.test(hash);
    const hasPending = !!localStorage.getItem("theryn_pending_role_landing");
    return !(isOAuthConsent || hasOAuthParams || hasPending);
  });
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
  const [session, setSession] = useState(() => {
    try {
      const saved = localStorage.getItem('th_session');
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_TEMPLATES[getToday()].exercises.map((name,i) => ({
      id:i, name,
      sets: isCardioExercise(name)
        ? [{ id: `${i}-0`, dist:"", dur:"", done: false }]
        : Array.from({ length: 3 }, (_, si) => ({ id: `${i}-${si}`, w:"", r:"", done: false })),
    }));
  });
  const [workoutHistory, setWorkoutHistory] = useState([]);
  const [workoutActive, setWorkoutActive] = useState(() => { try { return JSON.parse(localStorage.getItem('th_workoutActive')) || false; } catch { return false; } });
  const [workoutPaused, setWorkoutPaused] = useState(() => { try { return JSON.parse(localStorage.getItem('th_workoutPaused')) || false; } catch { return false; } });
  const [workoutElapsed, setWorkoutElapsed] = useState(() => { try { return JSON.parse(localStorage.getItem('th_workoutElapsed')) || 0; } catch { return 0; } });
  const [workoutStartTime, setWorkoutStartTime] = useState(() => { try { return JSON.parse(localStorage.getItem('th_workoutStartTime')) || null; } catch { return null; } });

  useEffect(() => {
    localStorage.setItem('th_session', JSON.stringify(session));
    localStorage.setItem('th_workoutActive', JSON.stringify(workoutActive));
    localStorage.setItem('th_workoutPaused', JSON.stringify(workoutPaused));
    localStorage.setItem('th_workoutElapsed', JSON.stringify(workoutElapsed));
    localStorage.setItem('th_workoutStartTime', JSON.stringify(workoutStartTime));
  }, [session, workoutActive, workoutPaused, workoutElapsed, workoutStartTime]);
  const [profile, setProfile] = useState({ initials:"", color:PROFILE_COLORS[0], setup:false });
  const [authUser,   setAuthUser]   = useState(null);   // Supabase user object
  const [authLoading, setAuthLoading] = useState(true); // true while session is being checked
  const [authError,  setAuthError]  = useState(null);   // error message from OAuth callback
  const [showTour, setShowTour] = useState(false);
  const [hasCustomizedRoutine, setHasCustomizedRoutine] = useState(false);
  const [role, setRole] = useState(null); // "athlete" | "coach" — null means not yet chosen
  // Survives the OAuth page reload via localStorage so the role picker pre-
  // selects what the user picked on the landing page before sign-in.
  const [pendingRole, setPendingRole] = useState(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("theryn_pending_role_landing");
  });
  const pendingRoleRef = useRef(pendingRole);
  useEffect(() => { pendingRoleRef.current = pendingRole; }, [pendingRole]);
  // Onboarding status lives in profiles.onboarding_completed (Supabase = source
  // of truth). Local state: 'loading' until the DB round-trip settles, then
  // 'needed' or 'done'. We no longer use localStorage for this — it was the
  // cause of the "re-prompts name on every device" bug.
  const [onboardingStatus, setOnboardingStatus] = useState("loading");

  const [refreshing, setRefreshing] = useState(false);

  // Coach links cached at root level to prevent flicker on tab switches
  const [coachLinks, setCoachLinks] = useState([]);
  const [coachLinksLoaded, setCoachLinksLoaded] = useState(false);
  // AthleteView used only in CoachApp — removed from athlete root

  // ── Check onboarding state on every sign-in (DB, not localStorage) ─────
  useEffect(() => {
    if (!authUser?.id) {
      setOnboardingStatus("loading");
      return;
    }
    let cancelled = false;
    supabase.from("profiles")
      .select("display_name, height_cm, unit_system, default_currency, onboarding_completed")
      .eq("id", authUser.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data?.onboarding_completed) {
          setOnboardingStatus("done");
        } else {
          setOnboardingStatus("needed");
        }
        // Hydrate profile state with anything already on the row. Initials
        // are re-derived from display_name so the avatar reflects what the
        // user actually entered at setup (not whatever Google handed us).
        if (data?.display_name || data?.height_cm != null || data?.unit_system || data?.default_currency) {
          let nextInitials;
          if (data?.display_name) {
            const words = data.display_name.trim().split(" ").filter(Boolean);
            if (words.length > 0) {
              nextInitials = (
                words[0][0] + (words.length > 1 ? words[words.length - 1][0] : "")
              ).toUpperCase();
            }
          }
          setProfile(p => ({
            ...p,
            display_name: data.display_name || p.display_name,
            initials: nextInitials || p.initials,
            height_cm: data.height_cm != null ? Number(data.height_cm) : p.height_cm,
            units: data.unit_system || p.units,
            default_currency: data.default_currency || p.default_currency || "USD",
          }));
        }
      });
    return () => { cancelled = true; };
  }, [authUser?.id]);

  function handleNameSetupComplete() {
    setOnboardingStatus("done");
  }

  useEffect(() => {
    // Check existing session on mount
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        // Stale/invalid refresh token — clear it so the user gets a clean login screen
        supabase.auth.signOut().catch(() => {});
        setAuthUser(null);
        setAuthLoading(false);
        return;
      }
      setAuthUser(session?.user ?? null);
      setAuthLoading(false);
    }).catch(() => {
      setAuthUser(null);
      setAuthLoading(false);
    });

    // Listen for auth state changes (login / logout / token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED" && !session) {
        supabase.auth.signOut().catch(() => {});
        setAuthUser(null);
        setAuthLoading(false);
        return;
      }
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

        // Load stored role — if none, role stays null → RolePickerScreen will show.
        // If the user is entering from a landing CTA (pendingRole set), we want
        // the role picker to run regardless of stale stored state — skip restore.
        const storedRole = localStorage.getItem(`theryn_role_${user.id}`);
        if (storedRole && !pendingRoleRef.current) setRole(storedRole);

        // Show athlete tour on first-ever login (only for athlete role)
        if (storedRole === "athlete" && !pendingRoleRef.current) {
          const tourKey = `theryn_tour_done_${user.id}`;
          if (!localStorage.getItem(tourKey)) {
            setShowTour(true);
          }
        }
        // Coach tour is handled inside CoachApp
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
  const fetchRoutineRef = useRef(null);

  // ── Load data from Supabase when user logs in ─────────────────────────
  useEffect(() => {
    if (!authUser) return;
    const uid = authUser.id;

    // Sync the display_name securely into the global profile state
    supabase.from("profiles").select("display_name").eq("id", uid).single().then(({ data }) => {
      if (data?.display_name) {
        setProfile(p => ({ ...p, display_name: data.display_name }));
      }
    }).catch(() => {});

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

    // ── Load routine helper ─────────────────────────────────────────────
    const fetchRoutine = async (silent = false) => {
      if (!silent) setRefreshing(true);
      skipAutoSaveRef.current = true;
      try {
        const routine = await loadRoutine(uid);
        if (routine) {
          setTemplates(routine);
          setTodayType(routine[getToday()]?.type || 'Custom');
          scheduleDailyRoutine(routine);
        }
      } catch (err) {
        console.error("fetchRoutine error:", err);
      } finally {
        if (!silent) setRefreshing(false);
        setTimeout(() => { skipAutoSaveRef.current = false; }, 2000);
      }
    };
    fetchRoutineRef.current = fetchRoutine;

    // Initial load
    fetchRoutine();

    // Load coach links
    loadCoachLinks(uid).then(links => {
      setCoachLinks(links);
      setCoachLinksLoaded(true);
    }).catch(() => setCoachLinksLoaded(true));

    // Evaluate the offline queue silently upon boot
    processOfflineQueue();

    // Listen for ALL changes (INSERT, UPDATE, DELETE) to routines row
    const channel = supabase
      .channel('routine-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'routines', filter: `user_id=eq.${uid}` },
        (payload) => {
          // If we just saved locally, ignore the pulse
          if (Date.now() - isLocalSaveRef.current < 8000) return;

          console.log("External routine update detected:", payload);
          triggerCoachEditNotification();
          fetchRoutine(true); // Silent re-fetch
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

  if (showLanding) return (
    <LandingPage onEnterApp={async (intendedRole) => {
      // Landing CTA must always run sign-in → role picker, even for users with
      // an existing Supabase session. Otherwise the stored role silently routes
      // into a screen that can blank out (e.g. stale `athlete_web`).
      const wantRole = intendedRole === "athlete" || intendedRole === "coach" ? intendedRole : null;
      setPendingRole(wantRole);
      pendingRoleRef.current = wantRole;
      // Persist across the OAuth page reload; React state is wiped on redirect back.
      if (wantRole) localStorage.setItem("theryn_pending_role_landing", wantRole);
      else localStorage.removeItem("theryn_pending_role_landing");
      // Wipe every cached role key — we don't know which user signed in last.
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith("theryn_role_")) localStorage.removeItem(k);
      });
      setRole(null);
      try { await supabase.auth.signOut(); } catch { /* ignore */ }
      setAuthUser(null);
      setShowLanding(false);
    }} />
  );

  // Show a minimal loading screen while Supabase checks for an existing session
  if (authLoading) return (
    <div style={{ background:BG, height:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ width:"32px", height:"32px", borderRadius:"50%", border:`3px solid ${MT}`, borderTopColor:A, animation:"spin 0.8s linear infinite" }}/>
    </div>
  );

  if (!authUser) return (
    <LoginScreen authError={authError} onClearError={() => setAuthError(null)}/>
  );

  // While we check profiles.onboarding_completed, show the same spinner as
  // auth loading — no flash of Role picker or app chrome.
  if (onboardingStatus === "loading") return (
    <div style={{ background:BG, height:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ width:"32px", height:"32px", borderRadius:"50%", border:`3px solid ${MT}`, borderTopColor:A, animation:"spin 0.8s linear infinite" }}/>
    </div>
  );

  // ── Onboarding — collect name + height + weight ONCE (not per device) ──
  if (onboardingStatus === "needed") return (
    <FullNameSetup
      authUser={authUser}
      profile={profile}
      setProfile={setProfile}
      onComplete={handleNameSetupComplete}
    />
  );

  // ── Role picker — shown once after first sign-in ────────────────────────
  const isWeb = Capacitor.getPlatform() === "web";

  if (!role) {
    // On web, skip role picker — force coach. Athletes use the app.
    if (isWeb) {
      return (
        <RolePickerScreen
          initialSelected={pendingRole}
          onSelect={(r) => {
            setPendingRole(null);
            localStorage.removeItem("theryn_pending_role_landing");
            if (r === "athlete" && isWeb) {
              // Athletes on web → download page
              setRole("athlete_web");
              localStorage.setItem(`theryn_role_${authUser.id}`, "athlete_web");
              return;
            }
            setRole(r);
            localStorage.setItem(`theryn_role_${authUser.id}`, r);
          }}
        />
      );
    }
    return (
      <RolePickerScreen
        initialSelected={pendingRole}
        onSelect={(r) => {
          setPendingRole(null);
          setRole(r);
          localStorage.setItem(`theryn_role_${authUser.id}`, r);
          if (r === "athlete") {
            const tourKey = `theryn_tour_done_${authUser.id}`;
            if (!localStorage.getItem(tourKey)) setShowTour(true);
          }
        }}
      />
    );
  }

  // ── Web athlete → download page ──────────────────────────────────────────
  if ((role === "athlete" || role === "athlete_web") && isWeb) return (
    <WebAthleteDownloadPage
      onSwitchToCoach={() => {
        setRole("coach");
        localStorage.setItem(`theryn_role_${authUser.id}`, "coach");
      }}
      onSignOut={() => {
        supabase.auth.signOut();
        setAuthUser(null);
        setRole(null);
      }}
    />
  );

  // ── Coach experience ─────────────────────────────────────────────────────
  if (role === "coach") return (
    <CoachApp
      authUser={authUser}
      profile={profile}
      setProfile={setProfile}
      coachLinks={coachLinks}
      setCoachLinks={setCoachLinks}
      coachLinksLoaded={coachLinksLoaded}
      onSwitchRole={() => {
        setRole(null);
        if (authUser?.id) localStorage.removeItem(`theryn_role_${authUser.id}`);
      }}
      onSignOut={() => {
        supabase.auth.signOut();
        setAuthUser(null);
        setRole(null);
      }}
    />
  );

  // ── Athlete experience (native app only — everything below is unchanged) ──
  return (
    <div style={{ background:BG, minHeight:"100vh",
      fontFamily:"-apple-system,'Helvetica Neue',Helvetica,sans-serif",
      color:TX, position:"relative", paddingBottom:"110px" }}>

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
        {tab==="routine"  && <RoutineScreen templates={templates} setTemplates={setTemplates} setPrevTemplates={setPrevTemplates} showUndo={showUndo} profile={profile} onProfileTap={() => setTab("profile")} onCustomized={() => setHasCustomizedRoutine(true)} authUser={authUser} coachLinks={coachLinks} setCoachLinks={setCoachLinks} coachLinksLoaded={coachLinksLoaded} refreshing={refreshing} onRefresh={() => fetchRoutineRef.current?.()}/>}
        {tab==="body"     && <BodyScreen weightLog={weightLog} setWeightLog={setWeightLog} measureLog={measureLog} setMeasureLog={setMeasureLog} measureFields={measureFields} setMeasureFields={setMeasureFields} profile={profile} onProfileTap={() => setTab("profile")} units={profile.units||"imperial"} authUser={authUser}/>}
        {tab==="progress" && <ProgressScreen profile={profile} onProfileTap={() => setTab("profile")} workoutHistory={workoutHistory} units={profile.units||"imperial"} templates={templates}/>}
        {tab==="prs"      && <PRsScreen prs={prs} profile={profile} onProfileTap={() => setTab("profile")} units={profile.units||"imperial"} workoutHistory={workoutHistory}/>}
        {tab==="profile"  && <ProfileScreen profile={profile} setProfile={setProfile} workoutHistory={workoutHistory} onSignOut={() => { setAuthUser(null); setShowTour(false); setHasCustomizedRoutine(false); }} onSwitchRole={() => { setRole("coach"); if (authUser?.id) localStorage.setItem(`theryn_role_${authUser.id}`, "coach"); }}/>}
      </div>

      {/* AthleteView removed — coaches manage athletes from the Coach Dashboard */}

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
  const [showAddEx,          setShowAddEx]          = useState(false);
  const [newExName,          setNewExName]          = useState("");
  const [showTypePick,       setShowTypePick]       = useState(false);
  const [collapsed,          setCollapsed]          = useState({});
  const [showHistory,        setShowHistory]        = useState(false);
  const [showEndConfirm,     setShowEndConfirm]     = useState(false);
  const [showTemplatePrompt, setShowTemplatePrompt] = useState(false);
  const [pendingUndo,        setPendingUndo]        = useState(null); // { msg, action }
  const [pendingUndoTimer,   setPendingUndoTimer]   = useState(null);
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 5 } })
  );

  const handleLogDragEnd = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSession((p) => {
        const arr = [...p];
        const oldIndex = arr.findIndex((ex) => ex.id === active.id);
        const newIndex = arr.findIndex((ex) => ex.id === over.id);
        if (oldIndex !== -1 && newIndex !== -1) {
          const removed = arr.splice(oldIndex, 1)[0];
          arr.splice(newIndex, 0, removed);
        }
        return arr;
      });
      markExChange();
    }
  };

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
        
        const streak = calculateRoutineStreak(newHistory, templates);
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
      exercises.map((ex, i) => {
        const name = typeof ex === "string" ? ex : ex.name;
        const targetSets = typeof ex === "string" ? 3 : (ex.sets || 3);
        const targetReps = typeof ex === "string" ? "" : (ex.reps || "");
        const targetWeight = typeof ex === "string" ? "" : (ex.weight || "");
        const coachNote = typeof ex === "string" ? "" : (ex.coachNote || "");

        return {
          id: Date.now() + i, name, coachNote,
          sets: isCardioExercise(name)
            ? [{ id: `${Date.now()+i}-0`, dist:"", dur:"", done: false }]
            : Array.from({ length: targetSets }, (_, si) => ({ id: `${Date.now()+i}-${si}`, w: targetWeight, r: targetReps, done: false })),
        };
      })
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

  const removeExercise = (id) => {
    const removed = session.find(ex => ex.id === id);
    const removedIdx = session.findIndex(ex => ex.id === id);
    setSession(p => p.filter(ex => ex.id !== id));
    markExChange();
    // Undo toast — re-insert exercise at original position
    setPendingUndo({ msg: "Exercise removed", action: () => {
      setSession(p => { const arr = [...p]; arr.splice(removedIdx, 0, removed); return arr; });
      markExChange();
    }});
    const t = setTimeout(() => setPendingUndo(null), 5000);
    setPendingUndoTimer(t);
  };

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

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleLogDragEnd}>
              <SortableContext items={session.map(ex => ex.id)} strategy={verticalListSortingStrategy}>
                <div style={{ opacity: workoutActive ? 1 : 0.4, pointerEvents: workoutActive ? "auto" : "none", transition:"opacity 0.25s" }}>
                  {session.map((ex) => {
                    const exDone = ex.sets.length > 0 && ex.sets.every(s => s.done);
                    const isCol = collapsed[ex.id];
                    const exIsCardio = isCardioExercise(ex.name);
                    const exIsTimed = isTimedExercise(ex.name);
                    const defaultRest = customRest[ex.id] ?? getDefaultRest();
                    return (
                      <LogSortableItem key={ex.id} id={ex.id} onDelete={() => removeExercise(ex.id)}>
                        {(dragHandle) => (
                          <div style={{ ...card, marginBottom:0, borderRadius:"12px", borderColor: exDone ? A : BD, opacity: isCol ? 0.75 : 1 }}>
                            {/* Exercise header */}
                            <div style={{ display:"flex", alignItems:"center", marginBottom: isCol ? 0 : "10px" }}>
                              {dragHandle}
                              <button onClick={() => toggleCollapse(ex.id)} style={{ background:"none", border:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:"6px", padding:0, flex:1 }}>
                                <span style={{ fontSize:"19px", fontWeight:"600", color: exDone ? A : TX }}>{ex.name}</span>
                                {exIsCardio && <span style={{ fontSize:"9px", background:"#06D6A0", color:"#000", borderRadius:"4px", padding:"1px 5px", fontWeight:"700" }}>CARDIO</span>}
                                {exDone && <span style={{ fontSize:"9px", background:A, color:"#000", borderRadius:"4px", padding:"1px 5px", fontWeight:"700" }}>DONE</span>}
                                {ex.coachNote && !isCol && <span style={{ fontSize:"9px", background:`${A}20`, color:A, borderRadius:"4px", padding:"1px 5px", fontWeight:"700" }}>COACH</span>}
                                <span style={{ fontSize:"10px", color:SB, transform: isCol ? "none" : "rotate(180deg)", transition:"transform 0.2s" }}>⌄</span>
                              </button>
                            </div>

                            {/* Coach note — visible when expanded */}
                            {!isCol && ex.coachNote && (
                              <div style={{
                                display: "flex", alignItems: "flex-start", gap: "8px",
                                background: `${A}08`, border: `1px solid ${A}22`,
                                borderRadius: "10px", padding: "10px 12px", marginBottom: "12px",
                              }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={A} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, marginTop: "1px" }}>
                                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                                </svg>
                                <div>
                                  <div style={{ fontSize: "10px", fontWeight: 700, color: A, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "3px" }}>Coach Note</div>
                                  <div style={{ fontSize: "13px", color: TX, lineHeight: 1.55 }}>{ex.coachNote}</div>
                                </div>
                              </div>
                            )}

                            {!isCol && (
                              <>
                                {/* Column headers */}
                                <div style={{ display:"grid", gridTemplateColumns: exIsTimed ? "24px 1fr 1fr 44px 44px 20px" : "24px 1fr 1fr 44px 20px", gap: exIsTimed ? "4px" : "8px", alignItems:"center", padding:"0 0 8px" }}>
                                  <span style={{ fontSize:"14px", color:MT, textAlign:"center" }}>#</span>
                                  {exIsCardio ? (<>
                                    <span style={{ fontSize:"14px", color:SB, textTransform:"uppercase", letterSpacing:"0.06em", textAlign:"center" }}>Distance</span>
                                    <span style={{ fontSize:"14px", color:SB, textTransform:"uppercase", letterSpacing:"0.06em", textAlign:"center" }}>Duration</span>
                                  </>) : exIsTimed ? (<>
                                    <span style={{ fontSize:"12px", color:MT, textTransform:"uppercase", letterSpacing:"0.06em", textAlign:"center" }}>Prev</span>
                                    <span style={{ fontSize:"14px", color:SB, textTransform:"uppercase", letterSpacing:"0.06em", textAlign:"center" }}>Time</span>
                                  </>) : (<>
                                    <span style={{ fontSize:"14px", color:SB, textTransform:"uppercase", letterSpacing:"0.06em", textAlign:"center" }}>Weight</span>
                                    <span style={{ fontSize:"14px", color:SB, textTransform:"uppercase", letterSpacing:"0.06em", textAlign:"center" }}>Reps</span>
                                  </>)}
                                  <span/>{exIsTimed && <span/>}<span/>
                                </div>

                                {/* Set rows */}
                                {ex.sets.map((set, si) => (
                                  <div key={set.id} style={{ display:"grid", gridTemplateColumns: exIsTimed ? "24px 1fr 1fr 44px 44px 20px" : "24px 1fr 1fr 44px 20px", gap: exIsTimed ? "4px" : "8px", alignItems:"center", padding:"10px 0", borderBottom: si < ex.sets.length-1 ? `1px solid ${MT}` : "none" }}>
                                    <span style={{ fontSize:"16px", color: set.done ? A : MT, fontWeight:"600", textAlign:"center" }}>{si+1}</span>

                                    {exIsCardio ? (<>
                                      <input style={{ ...inputSt, width:"100%", fontSize:"19px", padding:"11px 6px", textAlign:"center", color: set.done ? A : TX, background: set.done ? "transparent" : S2, border: set.done ? `1px solid ${MT}` : `1px solid ${BD}` }} type="number" inputMode="decimal" placeholder={dUnit} value={set.dist} onChange={e => updateSet(ex.id, set.id, "dist", e.target.value)} readOnly={set.done}/>
                                      <input style={{ ...inputSt, width:"100%", fontSize:"19px", padding:"11px 6px", textAlign:"center", color: set.done ? A : TX, background: set.done ? "transparent" : S2, border: set.done ? `1px solid ${MT}` : `1px solid ${BD}` }} type="number" inputMode="numeric" placeholder="min" value={set.dur} onChange={e => updateSet(ex.id, set.id, "dur", e.target.value)} readOnly={set.done}/>
                                    </>) : exIsTimed ? (<>
                                      <div style={{ width:"100%", fontSize:"19px", padding:"11px 6px", textAlign:"center", color:MT }}>{getPrevTime(ex.name) ? fmtTimer(getPrevTime(ex.name)) : "-:--"}</div>
                                      <div style={{ width:"100%", fontSize:"19px", padding:"11px 6px", textAlign:"center", color: set.done ? A : TX, background: set.done ? "transparent" : S2, border: set.done ? `1px solid ${MT}` : `1px solid ${BD}`, borderRadius:"10px" }}>{fmtTimer(set.r ? Number(set.r) : 0)}</div>
                                    </>) : (<>
                                      <input style={{ ...inputSt, width:"100%", fontSize:"19px", padding:"11px 6px", textAlign:"center", color: set.done ? A : TX, background: set.done ? "transparent" : S2, border: set.done ? `1px solid ${MT}` : `1px solid ${BD}` }} type="number" inputMode="decimal" placeholder={wUnit} value={set.w} onChange={e => updateSet(ex.id, set.id, "w", e.target.value)} readOnly={set.done}/>
                                      <input style={{ ...inputSt, width:"100%", fontSize:"19px", padding:"11px 6px", textAlign:"center", color: set.done ? A : TX, background: set.done ? "transparent" : S2, border: set.done ? `1px solid ${MT}` : `1px solid ${BD}` }} type="number" inputMode="numeric" placeholder="reps" value={set.r} onChange={e => updateSet(ex.id, set.id, "r", e.target.value)} readOnly={set.done}/>
                                    </>)}

                                    <button onClick={() => toggleSet(ex.id, set.id)} style={{ width:"44px", height:"44px", borderRadius:"10px", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", background: set.done ? A : "none", border: set.done ? "none" : `2px solid ${SB}`, color: set.done ? "#000" : SB, fontSize:"18px", fontWeight:"700" }}>
                                      {set.done ? "✓" : ""}
                                    </button>

                                    {exIsTimed && (
                                      <button onClick={() => setActiveStopwatch({ exId: ex.id, setId: set.id, name: ex.name })} style={{ width:"44px", height:"44px", borderRadius:"10px", background:S2, border:`1px solid ${BD}`, color:A, fontSize:"20px", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>⏱</button>
                                    )}

                                    <button onClick={() => removeSet(ex.id, set.id)} style={{ background:"none", border:"none", color:MT, cursor:"pointer", fontSize:"16px", padding:0, textAlign:"center", lineHeight:1 }}>✕</button>
                                  </div>
                                ))}

                                <button onClick={() => addSetToEx(ex.id)} style={{ width:"100%", background:"none", border:"none", cursor:"pointer", color:SB, fontSize:"15px", padding:"10px 0 2px", textAlign:"center" }}>+ Add Set</button>
                              </>
                            )}
                          </div>
                        )}
                      </LogSortableItem>
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>

            {/* Add exercise — always visible, outside workout guard */}
            {showAddEx && (
              <ExercisePicker onClose={() => setShowAddEx(false)} onSelect={(name) => {
                const exStr = name.trim();
                setShowAddEx(false);
                if (!exStr) return;
                const exIsCardio = isCardioExercise(exStr);
                setSession(p => {
                  const newEx = { id: Date.now(), name: exStr, sets: exIsCardio
                    ? [{ id: `${Date.now()}-0`, dist:"", dur:"", done:false }]
                    : Array.from({ length: 3 }, (_, si) => ({ id: `${Date.now()}-${si}`, w:"", r:"", done:false })) };
                  return [...p, newEx];
                });
                markExChange();
              }}/>
            )}
            {workoutActive && (
              <button onClick={() => setShowAddEx(true)} style={{ width:"100%", background:"none", border:`1px dashed ${MT}`, borderRadius:"12px", color:SB, cursor:"pointer", padding:"16px", fontSize:"16px", marginTop:"8px", marginBottom:"8px", display:"flex", alignItems:"center", justifyContent:"center", gap:"6px" }}>
                <span style={{ fontSize:"18px", color:A }}>+</span> Add Exercise
              </button>
            )}

            {/* Undo toast for exercise deletion */}
            {pendingUndo && (
              <div style={{ position:"fixed", bottom:"88px", left:"16px", right:"16px", background:S1, border:`1px solid ${BD}`, borderRadius:"12px", padding:"14px 16px", display:"flex", justifyContent:"space-between", alignItems:"center", zIndex:300, boxShadow:"0 4px 20px rgba(0,0,0,0.4)" }}>
                <span style={{ fontSize:"14px", color:TX }}>{pendingUndo.msg}</span>
                <button onClick={() => { clearTimeout(pendingUndoTimer); pendingUndo.action(); setPendingUndo(null); }} style={{ background:A, border:"none", borderRadius:"8px", color:"#000", fontWeight:"700", fontSize:"13px", padding:"6px 14px", cursor:"pointer" }}>Undo</button>
              </div>
            )}
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
// ROUTINE EXERCISE CARD (Editable config)
// ════════════════════════════════════════════════════════════════════════
function RoutineExerciseCard({ ex, updateEx }) {
  const [expanded, setExpanded] = useState(false);
  const name = typeof ex === "string" ? ex : ex.name;
  const sets = typeof ex === "string" ? "" : ex.sets || "";
  const reps = typeof ex === "string" ? "" : ex.reps || "";
  const weight = typeof ex === "string" ? "" : ex.weight || "";

  return (
    <div style={{ padding:"8px 4px 8px 0", flex:1, touchAction: "pan-y" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <span style={{ fontSize:"16px", fontWeight:"500", color:TX }}>{name}</span>
        <button onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }} style={{ background:"none", border:"none", color:A, fontSize:"13px", fontWeight:"600", padding:"4px", cursor:"pointer" }}>
          {expanded ? "Done" : "Config"}
        </button>
      </div>
      {expanded && (
        <div style={{ display:"flex", gap:"8px", marginTop:"10px", paddingBottom: "4px" }} onClick={e => e.stopPropagation()}>
          <div style={{ flex:1 }}>
            <label style={{ display:"block", fontSize:"11px", color:SB, marginBottom:"4px" }}>Sets</label>
            <input type="number" placeholder="Optional" value={sets} onChange={e => updateEx({ name, sets: e.target.value ? Number(e.target.value) : "", reps, weight })} style={{ width:"100%", background:S2, border:`1px solid ${BD}`, color:TX, borderRadius:"6px", padding:"8px", fontSize:"14px" }} />
          </div>
          <div style={{ flex:1 }}>
            <label style={{ display:"block", fontSize:"11px", color:SB, marginBottom:"4px" }}>Reps</label>
            <input type="text" placeholder="e.g. 8-12" value={reps} onChange={e => updateEx({ name, sets, reps: e.target.value, weight })} style={{ width:"100%", background:S2, border:`1px solid ${BD}`, color:TX, borderRadius:"6px", padding:"8px", fontSize:"14px" }} />
          </div>
          <div style={{ flex:1 }}>
            <label style={{ display:"block", fontSize:"11px", color:SB, marginBottom:"4px" }}>Lbs</label>
            <input type="number" placeholder="Optional" value={weight} onChange={e => updateEx({ name, sets, reps, weight: e.target.value ? Number(e.target.value) : "" })} style={{ width:"100%", background:S2, border:`1px solid ${BD}`, color:TX, borderRadius:"6px", padding:"8px", fontSize:"14px" }} />
          </div>
        </div>
      )}
      {!expanded && (sets || reps || weight) && typeof ex !== "string" && (
        <div style={{ fontSize:"12px", color:SB, marginTop:"4px", display:"flex", gap:"10px", fontWeight: "500" }}>
          <span>
            {[
              sets ? `${sets} Sets` : null,
              weight ? `${weight} lbs` : null
            ].filter(Boolean).join(", ")}
            {reps ? (sets || weight ? ` * ${reps} reps` : `${reps} reps`) : ""}
          </span>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// COACH ATHLETE ROW DASHBOARD
// ════════════════════════════════════════════════════════════════════════
function CoachAthleteRow({ athlete, expandedAthlete, setExpandedAthlete, openAthleteView, athleteLoading, isSelected, setTab, setAthleteCache, onSignals }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    loadAthleteData(athlete.athlete_id).then(d => {
      setData(d);
      if (setAthleteCache) setAthleteCache(athlete.athlete_id, d);
    }).catch(console.error);
  }, [athlete.athlete_id, setAthleteCache]);

  // Compute signals + numeric stats from the insights module
  const { streak, signals, summary, lastType, stats } = React.useMemo(() => {
    if (!data) return { streak: 0, signals: [], summary: { badges: [], primaryLine: null }, lastType: null, stats: null };
    const { history, routine, weights, measurements } = data;
    const s = calculateRoutineStreak(history, routine);
    const sigs = detectSignals({ history, routine, weights, measurements, streak: s });
    const sum = summarizeForRow(sigs);
    const last = history && history.length > 0 ? (history[0].type || "Workout") : null;
    const st = computeStats({ history, routine, weights, measurements });
    return { streak: s, signals: sigs, summary: sum, lastType: last, stats: st };
  }, [data]);

  // Bubble signals up to parent for "Needs Attention"
  useEffect(() => {
    if (onSignals && data) onSignals(athlete.athlete_id, { athlete, signals, streak });
  }, [signals, data, athlete.athlete_id]);

  const streakText = streak > 0 ? (streak >= 7 ? `${Math.floor(streak / 7)}w streak` : `${streak}d streak`) : null;
  const statusText = lastType || (data ? "No workouts yet" : "Loading...");

  // Default line when no signals
  const todayKey = data?.routine ? getToday() : null;
  const todayType = data?.routine?.[todayKey]?.type || "Rest";
  const fallbackLine = todayType === "Rest"
    ? "Scheduled rest day today — prioritize recovery."
    : `Scheduled for ${todayType} today.`;
  const primaryLine = summary.primaryLine || fallbackLine;
  const primaryColor = summary.primarySeverity
    ? SEVERITY_COLORS[summary.primarySeverity]
    : A;

  const navigateTo = (newTab) => {
    try { Haptics.impact({ style: "light" }); } catch {}
    openAthleteView(athlete); // sets selectedAthlete
    if (setTab) setTab(newTab);
  };
  // Tapping the card body (outside a text link) routes to the most relevant
  // tab given active signals — defaults to Routines if nothing urgent.
  const primaryTab = summary.primaryTab || "routines";
  const handleCardTap = () => navigateTo(primaryTab);

  // Derived values for the redesigned card
  const fmtVol = (v) => v >= 1000 ? `${(v/1000).toFixed(v >= 10000 ? 0 : 1)}K` : String(v);
  const currentWeight = data?.weights?.[0]?.weight;
  const bwDelta = stats?.bwDelta;
  const statItems = stats ? [
    { label: "7d Volume",   value: stats.vol7 > 0 ? fmtVol(stats.vol7) : "—",                    color: TX },
    {
      label: "Body Weight",
      value: currentWeight != null ? currentWeight : "—",
      color: TX,
      suffix: currentWeight != null ? "lb" : "",
      // Fitness convention: weight loss shown lime (positive coaching outcome
      // for a cut), gain shown sienna. Coach reads direction at a glance.
      trend: bwDelta != null ? {
        value: bwDelta,
        color: bwDelta < 0 ? A : bwDelta > 0 ? SEVERITY_COLORS.urgent : SB,
        arrow: bwDelta < 0 ? "↓" : bwDelta > 0 ? "↑" : "·",
      } : null,
    },
    { label: "Avg Session", value: stats.sessionAvgMin ? `${stats.sessionAvgMin}m` : "—",        color: TX },
  ] : null;
  // Secondary signal chips (after the primary line)
  const secondaryBadges = summary.badges.slice(1);

  // Swallow taps inside the action-link row so they don't double-fire the
  // card-level handler.
  const stop = (e) => e.stopPropagation();

  return (
    <div
      className="crm-card coach-athlete-card press-scale"
      role="button"
      tabIndex={0}
      onClick={handleCardTap}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleCardTap(); } }}
      style={{
        marginBottom: "16px",
        background: S2,
        borderRadius: "16px",
        border: `1px solid ${BD}`,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
      }}>
      {/* — Identity — */}
      <div style={{ padding: "20px 22px 16px", display: "flex", alignItems: "center", gap: "14px" }}>
        <div style={{
          width: "36px", height: "36px", borderRadius: "50%",
          background: S1, border: `1px solid ${MT}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "14px", fontWeight: 700, color: A,
          flexShrink: 0, letterSpacing: "-0.02em",
        }}>
          {athlete.athlete_name.charAt(0).toUpperCase()}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: "16px", fontWeight: 600, color: TX,
            letterSpacing: "-0.01em",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {athlete.athlete_name}
          </div>
          <div style={{
            fontSize: "12px", color: SB, marginTop: "3px",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            <span>Last: {statusText}</span>
            {streakText && (
              <>
                <span style={{ color: MT, margin: "0 8px" }}>·</span>
                <span style={{ color: A, fontWeight: 500 }}>{streakText}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* — Insight line — */}
      <div style={{ padding: "14px 22px", borderTop: `1px solid ${BD}` }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
          {summary.primarySeverity && (
            <div style={{
              width: "6px", height: "6px", borderRadius: "50%",
              background: primaryColor, flexShrink: 0, marginTop: "7px",
            }}/>
          )}
          <div style={{ fontSize: "13px", color: TX, lineHeight: 1.55, flex: 1 }}>
            {data ? primaryLine : "Analyzing athlete data…"}
          </div>
        </div>
        {secondaryBadges.length > 0 && (
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "10px", marginLeft: summary.primarySeverity ? "16px" : 0 }}>
            {secondaryBadges.map((b, i) => {
              const c = SEVERITY_COLORS[b.severity];
              return (
                <span key={i} style={{
                  fontSize: "10px", fontWeight: 600, color: c,
                  letterSpacing: "0.03em",
                  padding: "3px 9px", borderRadius: "10px",
                  border: `1px solid ${c}44`,
                  background: "transparent",
                }}>
                  {b.title}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* — Stats (unboxed, number-over-label) — */}
      {statItems && (
        <div style={{
          display: "flex", padding: "16px 22px",
          borderTop: `1px solid ${BD}`, gap: "12px",
        }}>
          {statItems.map(t => (
            <div key={t.label} style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: "17px", fontWeight: 700, color: t.color,
                letterSpacing: "-0.02em",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                display: "flex", alignItems: "baseline", gap: "2px",
              }}>
                <span>{t.value}</span>
                {t.suffix ? (
                  <span style={{ fontSize: "10px", color: SB, fontWeight: 500 }}>{t.suffix}</span>
                ) : null}
                {t.trend ? (
                  <span style={{
                    fontSize: "11px", color: t.trend.color, fontWeight: 700,
                    marginLeft: "6px", letterSpacing: 0,
                  }}>
                    {t.trend.arrow}{Math.abs(t.trend.value).toFixed(1)}
                  </span>
                ) : null}
              </div>
              <div style={{
                fontSize: "10px", color: SB, marginTop: "2px",
                letterSpacing: "0.04em", fontWeight: 600,
                textTransform: "uppercase",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {t.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* — Actions (text links, no dividers) — */}
      <div style={{ display: "flex", borderTop: `1px solid ${BD}` }} onClick={stop}>
        {["routines", "progress", "body"].map(t => {
          const label = t === "routines" ? "View routine" : t === "progress" ? "View progress" : "View body";
          return (
            <button
              key={t}
              onClick={(e) => { e.stopPropagation(); navigateTo(t); }}
              className="press-scale coach-card-link"
              style={{
                flex: 1, padding: "14px 10px",
                background: "none", border: "none", cursor: "pointer",
                fontSize: "12px", color: SB, fontWeight: 500,
                letterSpacing: "0.01em", whiteSpace: "nowrap",
                transition: "color 0.15s",
              }}
            >
              {label} <span style={{ color: MT, marginLeft: "2px" }}>→</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// ROUTINE SCREEN
// ════════════════════════════════════════════════════════════════════════
function RoutineScreen({ templates, setTemplates, setPrevTemplates, showUndo, profile, onProfileTap, onCustomized, authUser, coachLinks, setCoachLinks, coachLinksLoaded, onOpenAthlete, athleteView, onRefresh, refreshing }) {
  const [expanded,      setExpanded]      = useState(null);
  const [editingType,   setEditingType]   = useState(null);
  const [pickingExDay,  setPickingExDay]  = useState(null);
  const [showCoach,     setShowCoach]     = useState(false);
  const [newEx,         setNewEx]         = useState("");
  const todayDay = getToday();

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

  const updateEx = (d, i, newExData) => {
    setPrevTemplates({ ...templates });
    setTemplates(p => {
      const exs = [...p[d].exercises];
      exs[i] = newExData;
      return { ...p, [d]: { ...p[d], exercises: exs } };
    });
    onCustomized?.();
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 5 } })
  );

  const handleDragEnd = (event, day) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setPrevTemplates({ ...templates });
      setTemplates(p => {
        const exs = [...p[day].exercises];
        const oldIndex = exs.findIndex((ex, i) => (typeof ex === "string" ? ex : ex.name)+"-"+i === active.id);
        const newIndex = exs.findIndex((ex, i) => (typeof ex === "string" ? ex : ex.name)+"-"+i === over.id);
        if (oldIndex !== -1 && newIndex !== -1) {
          const removed = exs.splice(oldIndex, 1)[0];
          exs.splice(newIndex, 0, removed);
        }
        return { ...p, [day]: { ...p[day], exercises: exs } };
      });
      onCustomized?.();
    }
  };

  return (
    <div>
      <ScreenHeader 
        sup="Weekly Schedule" 
        title="Routine" 
        profile={profile} 
        onProfileTap={onProfileTap}
        rightContent={(
          <button 
            onClick={onRefresh} 
            disabled={refreshing}
            style={{ 
              background: "none", 
              border: `1px solid ${refreshing ? MT : A+"44"}`, 
              borderRadius: "8px", 
              padding: "6px 12px", 
              display: "flex", 
              alignItems: "center", 
              gap: "6px", 
              color: refreshing ? SB : A,
              cursor: "pointer",
              transition: "all 0.2s"
            }}
          >
            <svg 
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
              style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }}
            >
              <path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
            </svg>
            <span style={{ fontSize: "13px", fontWeight: "700" }}>{refreshing ? "Syncing..." : "Sync"}</span>
          </button>
        )}
      />
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

                  {/* Exercise list with drag-to-reorder + swipe-to-delete */}
                  <div>
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, day)}>
                      <SortableContext items={t.exercises.map((ex, i) => (typeof ex === "string" ? ex : ex.name)+"-"+i)} strategy={verticalListSortingStrategy}>
                        {t.exercises.map((ex,i) => {
                          const id = (typeof ex === "string" ? ex : ex.name)+"-"+i;
                          return (
                            <SortableExerciseRow key={id} id={id} onRemove={() => removeEx(day, i)}>
                              <RoutineExerciseCard ex={ex} updateEx={(data) => updateEx(day, i, data)} />
                            </SortableExerciseRow>
                          );
                        })}
                      </SortableContext>
                    </DndContext>
                  </div>

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

        {/* Coach Connection — athlete can connect but not manage athletes from here */}
        <div style={{ background:`linear-gradient(135deg, ${S1} 0%, #0d1a00 100%)`, borderRadius:"12px", border:`1px solid ${isConnected ? A : A+"22"}`, padding:"20px 18px", marginBottom:"8px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"12px" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={A} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
            <span style={{ fontSize:"16px", fontWeight:"700", color:TX }}>Coach Access</span>
            {isConnected && (
              <span style={{ fontSize:"11px", background:A, color:"#000", borderRadius:"4px", padding:"2px 8px", fontWeight:"700", marginLeft:"auto" }}>CONNECTED</span>
            )}
          </div>

          {coachLinksLoaded && !isConnected && (
            <div style={{ fontSize:"14px", color:SB, lineHeight:"1.5", marginBottom:"16px" }}>
              Connect with a coach to share your progress and receive personalised notes.
            </div>
          )}

          {!coachLinksLoaded ? (
            <div style={{ height:"48px", background:MT, borderRadius:"10px", opacity:0.5 }}/>
          ) : (
            <button onClick={() => { setShowCoach(true); loadCoachLinks(authUser?.id).then(setCoachLinks).catch(()=>{}); }} style={{ ...(isConnected ? btnGhost : btnPrim), display:"flex", alignItems:"center", gap:"6px", transition:"background 0.2s, color 0.2s" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isConnected ? SB : "#000"} strokeWidth="2.5" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
              {isConnected ? "Manage Connection" : "Connect Coach"}
            </button>
          )}
        </div>

        {showCoach && (
          <CoachModal authUser={authUser} mode="athlete" onClose={() => { setShowCoach(false); loadCoachLinks(authUser?.id).then(setCoachLinks).catch(()=>{}); }}/>
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
  const [newEx,        setNewEx]        = useState("");
  const [activeTab,    setActiveTab]    = useState("routine"); // "routine" | "body"
  const [avDragOver,   setAvDragOver]   = useState(-1);
  const avDragInfo  = useRef(null);
  const avListRef   = useRef(null);
  const avMoveRef   = useRef(null);

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

  const updateEx = (day, i, newExData) => {
    setEditRoutine(p => {
      const exs = [...(p[day]?.exercises || [])];
      exs[i] = newExData;
      return { ...p, [day]: { ...p[day], exercises: exs } };
    });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 5 } })
  );

  const handleDragEnd = (event, day) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setEditRoutine(p => {
         const exs = [...(p[day]?.exercises || [])];
         const oldIndex = exs.findIndex((ex, i) => (typeof ex === "string" ? ex : ex.name)+"-"+i === active.id);
         const newIndex = exs.findIndex((ex, i) => (typeof ex === "string" ? ex : ex.name)+"-"+i === over.id);
         if (oldIndex !== -1 && newIndex !== -1) {
           const removed = exs.splice(oldIndex, 1)[0];
           exs.splice(newIndex, 0, removed);
         }
         return { ...p, [day]: { ...p[day], exercises: exs } };
      });
    }
  };

  return (
    <>
      <div className="athlete-view-backdrop" onClick={() => setAthleteView(null)}></div>
      <div className="athlete-view-wrapper">
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
        <button onClick={() => setActiveTab("routine")} style={{ flex:1, padding:"8px", background: activeTab === "routine" ? A : S2, color: activeTab === "routine" ? "#000" : SB, border:`1px solid ${activeTab === "routine" ? A : MT}`, borderRadius:"8px", fontSize:"13px", fontWeight:"600", cursor:"pointer" }}>Routine & Log</button>
        <button onClick={() => setActiveTab("body")} style={{ flex:1, padding:"8px", background: activeTab === "body" ? A : S2, color: activeTab === "body" ? "#000" : SB, border:`1px solid ${activeTab === "body" ? A : MT}`, borderRadius:"8px", fontSize:"13px", fontWeight:"600", cursor:"pointer" }}>Body Stats</button>
      </div>

      <div style={{ padding:"14px" }}>
        {saveMsg && (
          <div style={{ background: saveMsg.ok ? `${A}15` : `${RED}15`, border:`1px solid ${saveMsg.ok ? A : RED}`, borderRadius:"10px", padding:"12px 16px", fontSize:"14px", color: saveMsg.ok ? A : RED, marginBottom:"14px" }}>
            {saveMsg.text}
          </div>
        )}

        {activeTab === "body" ? (
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

                      {/* Exercise list with dnd-kit + swipe-to-delete */}
                      <div>
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, day)}>
                          <SortableContext items={t.exercises.map((ex, i) => (typeof ex === "string" ? ex : ex.name)+"-"+i)} strategy={verticalListSortingStrategy}>
                            {t.exercises.map((ex, i) => {
                              const id = (typeof ex === "string" ? ex : ex.name)+"-"+i;
                              return (
                                <SortableExerciseRow key={id} id={id} onRemove={() => removeEx(day, i)}>
                                  <RoutineExerciseCard ex={ex} updateEx={(data) => updateEx(day, i, data)} />
                                </SortableExerciseRow>
                              );
                            })}
                          </SortableContext>
                        </DndContext>
                      </div>

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
      {/* End of athlete-view-wrapper */}
      </div>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════
// COACH MODAL
// ════════════════════════════════════════════════════════════════════════
function CoachModal({ authUser, onClose, mode = "athlete", inline = false, onUpdate }) {
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

  const refresh = () => loadCoachLinks(authUser.id).then(lnks => { setLinks(lnks); onUpdate?.(); }).catch(() => {});

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
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleShare = async () => {
    if (!myCode) return;
    try {
      await Share.share({
        title: "Theryn Invite Code",
        text: `Join me on Theryn! My coach/athlete invite code is: ${myCode}`,
        url: "https://theryn.app",
        dialogTitle: "Share Invite Code",
      });
    } catch (e) {
      // Fallback for web if needed
      if (navigator.share) {
        navigator.share({
          title: "Theryn Invite Code",
          text: `Join me on Theryn! My coach/athlete invite code is: ${myCode}`,
        }).catch(() => {});
      }
    }
  };

  const myLinks      = links.filter(l => l.coach_id === authUser?.id);
  const coachLinks   = links.filter(l => l.athlete_id === authUser?.id);
  const pendingForMe = coachLinks.filter(l => l.status === "pending");
  const activeCoaches = coachLinks.filter(l => l.status === "accepted");
  const hasAny = myLinks.length > 0 || coachLinks.length > 0;

  return (
    <div
      onClick={inline ? undefined : closeModal}
      style={inline ? { paddingBottom: "100px" } : { position:"fixed", top:0, bottom:0, left:0, right:0, background: visible ? "rgba(0,0,0,0.75)" : "rgba(0,0,0,0)", display:"flex", alignItems:"flex-end", zIndex:300, transition:"background 0.28s ease" }}
    >
      <style>{`
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes fadeIn  { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .coach-content { animation: fadeIn 0.22s ease; }
        .code-char { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 56px; background: ${S2}; border: 2px solid ${BD}; border-radius: 12px; font-size: 26px; font-weight: 800; color: ${A}; letter-spacing: 0; margin: 0 3px; font-variant-numeric: tabular-nums; }
      `}</style>

      <div
        onClick={e => e.stopPropagation()}
        style={inline ? { width: "100%", padding:"20px 16px" } : {
          background: S1, borderRadius:"24px 24px 0 0", width:"100%",
          border:`1px solid ${BD}`, boxSizing:"border-box", padding:"32px 24px 110px", maxHeight:"88vh", overflowY:"auto",
          transform: visible ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        {/* Drag handle */}
        {!inline && <div style={{ width:"40px", height:"5px", background:MT, borderRadius:"3px", margin:"14px auto 0" }}/>}

        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding: inline ? "0 0 20px" : "18px 20px 0" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
            {view !== "home" && (
              <button onClick={() => goTo("home")} style={{ background:"none", border:"none", color:SB, cursor:"pointer", fontSize:"20px", padding:"0 6px 0 0", lineHeight:1 }}>←</button>
            )}
            <div style={{ fontSize:"20px", fontWeight:"700" }}>
              {view === "home"    && "Manage Connections"}
              {view === "mycode" && "Your Invite Code"}
              {view === "connect" && "Add Athlete"}
            </div>
          </div>
          {!inline && <button onClick={closeModal} style={{ background:"none", border:`1px solid ${MT}`, borderRadius:"10px", color:SB, cursor:"pointer", padding:"8px 16px", fontSize:"14px" }}>Close</button>}
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
              {mode === "coach" && myLinks.length > 0 && (
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
              <div style={{ display:"grid", gridTemplateColumns: mode === "athlete" ? "1fr" : "1fr 1fr", gap:"10px" }}>
                <button onClick={() => goTo("mycode")} style={{ background:S2, border:`1px solid ${BD}`, borderRadius:"16px", padding:"18px 14px", cursor:"pointer", textAlign:"left" }}>
                  <div style={{ width:"36px", height:"36px", borderRadius:"10px", background:`${A}20`, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:"12px" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={A} strokeWidth="2" strokeLinecap="round"><rect x="2" y="2" width="20" height="20" rx="4"/><path d="M7 7h.01M12 7h.01M17 7h.01M7 12h.01M12 12h.01M17 12h.01M7 17h.01M12 17h.01"/></svg>
                  </div>
                  <div style={{ fontSize:"15px", fontWeight:"700", color:TX, marginBottom:"4px" }}>My Code</div>
                  <div style={{ fontSize:"12px", color:SB, lineHeight:"1.5" }}>Share with your {mode === "athlete" ? "coach" : "athletes"}</div>
                </button>
                {mode === "coach" && (
                  <button onClick={() => goTo("connect")} style={{ background:S2, border:`1px solid ${BD}`, borderRadius:"16px", padding:"18px 14px", cursor:"pointer", textAlign:"left" }}>
                    <div style={{ width:"36px", height:"36px", borderRadius:"10px", background:`${A}20`, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:"12px" }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={A} strokeWidth="2" strokeLinecap="round"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                    </div>
                    <div style={{ fontSize:"15px", fontWeight:"700", color:TX, marginBottom:"4px" }}>Add Athlete</div>
                    <div style={{ fontSize:"12px", color:SB, lineHeight:"1.5" }}>Enter their invite code</div>
                  </button>
                )}
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
                  <button onClick={handleShare} style={{ ...btnPrim, width:"100%", padding:"16px", display:"flex", alignItems:"center", justifyContent:"center", gap:"10px", fontSize:"17px", marginBottom:"12px" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                    Share Code
                  </button>
                  <button onClick={copyCode} style={{ ...btnGhost, width:"100%", padding:"14px", display:"flex", alignItems:"center", justifyContent:"center", gap:"10px", fontSize:"16px", color: copied ? A : SB, borderColor: copied ? A+"44" : MT }}>
                    {copied ? (
                      <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={A} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> Copied to Clipboard!</>
                    ) : (
                      <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={SB} strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy Code</>
                    )}
                  </button>
                  <div style={{ textAlign:"center", fontSize:"13px", color:SB, marginTop:"16px" }}>Your code never changes</div>
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

        {/* ── BMI — shown whenever height + latest weight are both known ── */}
        {(() => {
          const bmi = computeBMI(latest, profile?.height_cm, units);
          const cat = bmiCategory(bmi);
          if (bmi == null) return null;
          const SCALE_MIN = 15, SCALE_MAX = 40;
          const markerPct = Math.max(2, Math.min(98, ((bmi - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100));
          return (
            <div style={{ ...card, background: S2, marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "14px" }}>
                <div style={{ ...subLbl, marginBottom: 0 }}>BMI</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                  <span style={{ fontSize: "34px", fontWeight: 800, color: cat.color, letterSpacing: "-0.03em", lineHeight: 1 }}>{bmi}</span>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: cat.color, letterSpacing: "0.06em", textTransform: "uppercase" }}>{cat.label}</span>
                </div>
              </div>
              <div style={{ position: "relative", paddingTop: "10px" }}>
                <div style={{ display: "flex", height: "10px", borderRadius: "6px", overflow: "hidden" }}>
                  <div style={{ flex: 3.5, background: "#60A5FA" }}/>
                  <div style={{ flex: 6.5, background: "#C8FF00" }}/>
                  <div style={{ flex: 5,   background: "#FFD166" }}/>
                  <div style={{ flex: 10,  background: "#FF5C5C" }}/>
                </div>
                <div style={{
                  position: "absolute",
                  left: `${markerPct}%`,
                  top: "4px",
                  transform: "translateX(-50%)",
                  width: "3px", height: "22px",
                  background: "#fff",
                  borderRadius: "2px",
                  boxShadow: "0 0 0 2px rgba(0,0,0,0.5)",
                  pointerEvents: "none",
                }}/>
                <div style={{ display: "flex", marginTop: "8px", fontSize: "10px", color: SB, letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: 600 }}>
                  <div style={{ flex: 3.5, textAlign: "center" }}>Under</div>
                  <div style={{ flex: 6.5, textAlign: "center" }}>Normal</div>
                  <div style={{ flex: 5,   textAlign: "center" }}>Over</div>
                  <div style={{ flex: 10,  textAlign: "center" }}>Obese</div>
                </div>
                <div style={{ display: "flex", marginTop: "2px", fontSize: "9px", color: SB, opacity: 0.6 }}>
                  <div style={{ flex: 3.5, textAlign: "center" }}>&lt;18.5</div>
                  <div style={{ flex: 6.5, textAlign: "center" }}>18.5–24</div>
                  <div style={{ flex: 5,   textAlign: "center" }}>25–29</div>
                  <div style={{ flex: 10,  textAlign: "center" }}>30+</div>
                </div>
              </div>
            </div>
          );
        })()}

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
function StreakCalendar({ workoutHistory, templates }) {
  const [view, setView] = useState("week"); // "week" | "month"
  const today = new Date();
  today.setHours(0,0,0,0);

  // Build a Set of ISO date strings that have workouts
  const workedOutDays = new Set(
    workoutHistory.map(w => w.date)
  );

  const streak = calculateRoutineStreak(workoutHistory, templates);

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
function ProgressScreen({ profile, onProfileTap, workoutHistory, units, templates }) {
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
      <StreakCalendar workoutHistory={workoutHistory} templates={templates} />

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
function ProfileScreen({ profile, setProfile, workoutHistory, onSignOut, onSwitchRole }) {
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
            <div>
              <span style={{ fontSize:"16px" }}>Switch to Coach Mode</span>
              <div style={{ fontSize:"12px", color:SB, marginTop:"2px" }}>Manage athletes' routines & progress</div>
            </div>
            <button onClick={onSwitchRole} style={{ background:"none", border:`1px solid ${A}44`, borderRadius:"8px", cursor:"pointer", fontSize:"13px", color:A, fontWeight:"600", padding:"6px 14px" }}>Switch</button>
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
            queryParams: { prompt: "select_account" }
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
          options: { 
            redirectTo: `${window.location.origin}/oauth/consent`,
            queryParams: { prompt: "select_account" }
          },
        });
        if (error) throw error;
      }
    } catch (err) {
      console.error(err);
      setError(err?.message || "Sign-in failed. Please try again.");
      setLoading(false);
    }
  };

  const [loginTheme, setLoginTheme] = React.useState(
    () => localStorage.getItem("theryn_theme") || "light"
  );
  const toggleLoginTheme = () => setLoginTheme(t => {
    const n = t === "dark" ? "light" : "dark";
    localStorage.setItem("theryn_theme", n);
    return n;
  });
  const isDark = loginTheme === "dark";
  const lc = isDark ? {
    bg: "#080808", tx: "#F0F0F0", sb: "#585858", s1: "#101010", bd: "#1E1E1E",
    wordmark: "#C8FF00", glow: "rgba(200,255,0,0.10)", btnShadow: "0 0 28px rgba(200,255,0,0.35), 0 4px 16px rgba(0,0,0,0.4)",
    toggleBg: "#1E1E1E", toggleBd: "#2E2E2E", toggleIcon: "#C8FF00",
  } : {
    bg: "#FFFFFF", tx: "#0A0A0A", sb: "#888888", s1: "#F4F4F4", bd: "#E2E2E2",
    wordmark: "#3D7200", glow: "rgba(61,114,0,0.07)", btnShadow: "0 4px 20px rgba(0,0,0,0.12)",
    toggleBg: "#F0F0F0", toggleBd: "#E0E0E0", toggleIcon: "#444444",
  };

  return (
    <div style={{
      background: lc.bg, minHeight: "100vh",
      fontFamily: "-apple-system,'Helvetica Neue',Helvetica,sans-serif",
      color: lc.tx, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "64px 32px", boxSizing: "border-box",
      position: "relative", overflow: "hidden",
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100% { opacity:0.35 } 50% { opacity:0.65 } }
      `}</style>

      {/* Theme toggle */}
      <button onClick={toggleLoginTheme} style={{
        position: "fixed", top: 16, right: 16, zIndex: 10,
        width: 38, height: 38, borderRadius: "50%",
        background: lc.toggleBg, border: `1px solid ${lc.toggleBd}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", fontSize: 16, color: lc.toggleIcon,
      }}>
        {isDark ? "☀" : "☽"}
      </button>

      {isDark && Capacitor.getPlatform() === "web" && <ParticleCanvas />}

      {/* Bottom glow */}
      <div style={{
        position: "fixed", bottom: -80, left: "50%", transform: "translateX(-50%)",
        width: 480, height: 280,
        background: `radial-gradient(ellipse, ${lc.glow} 0%, transparent 65%)`,
        filter: "blur(60px)", pointerEvents: "none", zIndex: 0,
        animation: "pulse 5s ease-in-out infinite",
      }} />

      {/* Center card */}
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        position: "relative", zIndex: 2, width: "100%", maxWidth: 340,
      }}>
        {/* Logo */}
        <div style={{
          width: 72, height: 72, borderRadius: "50%", background: lc.s1,
          border: `1px solid ${lc.bd}`, overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 24,
          boxShadow: isDark
            ? `0 0 0 6px rgba(200,255,0,0.06), 0 24px 48px rgba(0,0,0,0.6)`
            : `0 0 0 6px rgba(0,0,0,0.04), 0 8px 32px rgba(0,0,0,0.10)`,
        }}>
          <img src="/theryn-logo.svg" width="72" height="72" alt="Theryn" style={{ objectFit: "contain" }} />
        </div>

        {Capacitor.getPlatform() === "web" ? (
          <>
            <div style={{ fontSize: 11, color: lc.wordmark, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 14 }}>theryn</div>
            <h1 style={{
              fontSize: "clamp(28px, 7vw, 36px)", fontWeight: 900,
              letterSpacing: "-0.04em", lineHeight: 1.15,
              textAlign: "center", color: lc.tx, margin: "0 0 12px",
            }}>
              Coaching,<br /><span style={{ color: lc.wordmark }}>without the chaos.</span>
            </h1>
            <p style={{ fontSize: 13, color: lc.sb, textAlign: "center", lineHeight: 1.7, margin: "0 0 44px", maxWidth: 240 }}>
              Real-time insights. Zero spreadsheets.
            </p>
          </>
        ) : (
          <>
            <div style={{ fontSize: 11, color: lc.wordmark, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 14 }}>theryn</div>
            <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-0.04em", color: lc.tx, lineHeight: 1.2, textAlign: "center", margin: "0 0 10px" }}>
              Your gym.<br /><span style={{ color: lc.wordmark }}>Your data.</span>
            </h1>
            <p style={{ fontSize: 13, color: lc.sb, textAlign: "center", lineHeight: 1.7, margin: "0 0 44px", maxWidth: 240 }}>Track workouts, body, and progress — all in one place.</p>
          </>
        )}

        {/* Error */}
        {(error || authError) && (
          <div
            onClick={() => { setError(null); onClearError?.(); }}
            style={{ background: "rgba(255,92,92,0.10)", border: `1px solid ${RED}`, borderRadius: 10, padding: "10px 14px", fontSize: 13, color: RED, wordBreak: "break-all", cursor: "pointer", marginBottom: 12, width: "100%", boxSizing: "border-box" }}>
            {error || authError}
            <div style={{ fontSize: 12, color: lc.sb, marginTop: 4 }}>Tap to dismiss</div>
          </div>
        )}

        {/* CTA */}
        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          style={{
            background: loading ? lc.s1 : A, border: loading ? `1px solid ${lc.bd}` : "none",
            borderRadius: 14, color: "#000",
            fontWeight: 800, fontSize: 15, padding: "16px 20px",
            cursor: loading ? "default" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            width: "100%", opacity: loading ? 0.7 : 1,
            boxShadow: loading ? "none" : lc.btnShadow,
            letterSpacing: "-0.01em",
          }}
        >
          {loading ? (
            <>
              <div style={{ width: 15, height: 15, borderRadius: "50%", border: `2px solid ${lc.tx}`, borderTopColor: "transparent", animation: "spin 0.7s linear infinite" }} />
              <span style={{ color: lc.tx }}>Connecting…</span>
            </>
          ) : (
            <>
              <svg width="17" height="17" viewBox="0 0 24 24">
                <path fill="#000" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#333" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#555" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#222" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            </>
          )}
        </button>

        <div style={{ marginTop: 16, fontSize: 11, color: lc.sb, textAlign: "center", letterSpacing: "0.02em" }}>
          Free to start · No credit card required
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

  // Three crisp slides. Straightforward copy, short words, big reach.
  const SLIDES = [
    {
      icon: (
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke={A} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6.5 6.5h11M6.5 17.5h11M4 12h16M4 12a2 2 0 01-2-2V8a2 2 0 012-2h1M20 12a2 2 0 002-2V8a2 2 0 00-2-2h-1M4 12a2 2 0 00-2 2v2a2 2 0 002 2h1M20 12a2 2 0 012 2v2a2 2 0 01-2 2h-1"/>
        </svg>
      ),
      tag: "Train",
      title: "Every lift,\nlogged.",
      body: "Start a session. Track sets. Done.",
    },
    {
      icon: (
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke={A} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 17 9 11 13 15 21 7"/>
          <polyline points="14 7 21 7 21 14"/>
        </svg>
      ),
      tag: "Track",
      title: "See yourself\nchange.",
      body: "Weight. BMI. PRs. One clean view.",
    },
    {
      icon: (
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke={A} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      ),
      tag: "Team up",
      title: "Link your\ncoach.",
      body: "They plan. You lift. Everything syncs.",
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


function FullNameSetup({ authUser, profile, setProfile, onComplete }) {
  const [name, setName] = useState(profile?.display_name || "");
  const [units, setUnits] = useState(profile?.units || "imperial");
  const [heightFt, setHeightFt] = useState("");
  const [heightIn, setHeightIn] = useState("");
  const [heightCm, setHeightCm] = useState(profile?.height_cm ? String(Math.round(profile.height_cm)) : "");
  const [weight, setWeight] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const isMetric = units === "metric";

  // Height always stored metric. Imperial inputs are converted here.
  const parsedHeightCm = (() => {
    if (isMetric) {
      const cm = parseFloat(heightCm);
      return isNaN(cm) ? null : cm;
    }
    const ft = parseFloat(heightFt) || 0;
    const inches = parseFloat(heightIn) || 0;
    const total = ft * 12 + inches;
    return total > 0 ? Number((total * 2.54).toFixed(1)) : null;
  })();

  // Weight is stored in the user's chosen unit — matches the existing
  // body_weights convention (no server-side normalization).
  const parsedWeight = (() => {
    const w = parseFloat(weight);
    return isNaN(w) || w <= 0 ? null : w;
  })();

  const nameValid = name.trim().length >= 2;
  const heightValid = parsedHeightCm != null && parsedHeightCm >= 120 && parsedHeightCm <= 230;
  const weightValid = parsedWeight != null && (
    isMetric ? (parsedWeight >= 30 && parsedWeight <= 300)
             : (parsedWeight >= 66 && parsedWeight <= 660)
  );
  const canSubmit = nameValid && heightValid && weightValid && !saving;

  async function handleSave() {
    if (!canSubmit) return;
    setSaving(true);
    setErrorMsg(null);

    const trimmedName = name.trim();
    const words = trimmedName.split(" ").filter(Boolean);
    const initials = (
      words[0][0] + (words.length > 1 ? words[words.length - 1][0] : "")
    ).toUpperCase();

    try {
      const { error: profErr } = await supabase.from("profiles").update({
        display_name: trimmedName,
        height_cm: parsedHeightCm,
        unit_system: units,
        onboarding_completed: true,
      }).eq("id", authUser.id);
      if (profErr) throw profErr;

      const todayIso = new Date().toISOString().split("T")[0];
      const { error: weightErr } = await supabase.from("body_weights").upsert({
        user_id: authUser.id,
        weight: parsedWeight,
        logged_at: todayIso,
      }, { onConflict: "user_id,logged_at" });
      if (weightErr) throw weightErr;

      setProfile(p => ({
        ...p,
        display_name: trimmedName,
        initials,
        units,
        height_cm: parsedHeightCm,
      }));
      onComplete();
    } catch (e) {
      setErrorMsg(e.message || "Couldn't save — try again.");
      setSaving(false);
    }
  }

  const inputBase = {
    width: "100%", background: S2, border: `1px solid ${BD}`,
    borderRadius: "12px", padding: "14px 16px", color: TX, fontSize: "16px",
    boxSizing: "border-box", outline: "none",
    transition: "border-color 0.2s",
  };
  const labelStyle = {
    fontSize: "11px", fontWeight: 700, color: SB, marginBottom: "8px",
    letterSpacing: "0.08em", textTransform: "uppercase",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999, background: BG,
      display: "flex", flexDirection: "column",
      padding: "max(40px, env(safe-area-inset-top)) 24px 24px",
      overflowY: "auto",
    }}>
      <div style={{ maxWidth: "460px", width: "100%", margin: "0 auto", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", paddingTop: "24px", paddingBottom: "24px" }}>
        {/* Unit toggle — top right */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "24px" }}>
          <div style={{ display: "inline-flex", background: S2, border: `1px solid ${BD}`, borderRadius: "10px", padding: "3px" }}>
            {["imperial", "metric"].map(u => (
              <button
                key={u}
                onClick={() => setUnits(u)}
                style={{
                  background: units === u ? A : "transparent",
                  color: units === u ? BG : SB,
                  border: "none", borderRadius: "7px",
                  padding: "6px 14px", fontSize: "12px", fontWeight: 700,
                  cursor: "pointer", letterSpacing: "0.02em",
                  textTransform: "capitalize",
                }}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        {/* Logo mark */}
        <div style={{
          width: "52px", height: "52px", borderRadius: "14px",
          background: `${A}12`, border: `1px solid ${A}33`,
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: "20px",
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={A} strokeWidth="2" strokeLinecap="round">
            <path d="M6.5 6.5h11M6.5 17.5h11M4 12h16"/>
          </svg>
        </div>

        <h1 style={{ fontSize: "32px", fontWeight: 800, color: TX, marginBottom: "8px", letterSpacing: "-0.025em", lineHeight: 1.1 }}>
          Welcome to Theryn
        </h1>
        <p style={{ fontSize: "15px", color: SB, marginBottom: "36px", lineHeight: 1.55 }}>
          Quick setup. We'll use this for your profile, your trend charts, and your BMI.
        </p>

        {/* Full name */}
        <div style={{ marginBottom: "22px" }}>
          <div style={labelStyle}>Full Name</div>
          <input
            type="text"
            placeholder="e.g. John Doe"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
            style={inputBase}
          />
        </div>

        {/* Height */}
        <div style={{ marginBottom: "22px" }}>
          <div style={labelStyle}>Height</div>
          {isMetric ? (
            <div style={{ position: "relative" }}>
              <input
                type="number"
                inputMode="decimal"
                placeholder="178"
                value={heightCm}
                onChange={e => setHeightCm(e.target.value)}
                style={inputBase}
              />
              <span style={{ position: "absolute", right: "16px", top: "50%", transform: "translateY(-50%)", color: SB, fontSize: "14px", fontWeight: 600 }}>cm</span>
            </div>
          ) : (
            <div style={{ display: "flex", gap: "10px" }}>
              <div style={{ position: "relative", flex: 1 }}>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="5"
                  value={heightFt}
                  onChange={e => setHeightFt(e.target.value)}
                  style={inputBase}
                />
                <span style={{ position: "absolute", right: "16px", top: "50%", transform: "translateY(-50%)", color: SB, fontSize: "14px", fontWeight: 600 }}>ft</span>
              </div>
              <div style={{ position: "relative", flex: 1 }}>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="10"
                  value={heightIn}
                  onChange={e => setHeightIn(e.target.value)}
                  style={inputBase}
                />
                <span style={{ position: "absolute", right: "16px", top: "50%", transform: "translateY(-50%)", color: SB, fontSize: "14px", fontWeight: 600 }}>in</span>
              </div>
            </div>
          )}
        </div>

        {/* Weight */}
        <div style={{ marginBottom: "28px" }}>
          <div style={labelStyle}>Current Weight</div>
          <div style={{ position: "relative" }}>
            <input
              type="number"
              inputMode="decimal"
              placeholder={isMetric ? "82" : "180"}
              value={weight}
              onChange={e => setWeight(e.target.value)}
              style={inputBase}
            />
            <span style={{ position: "absolute", right: "16px", top: "50%", transform: "translateY(-50%)", color: SB, fontSize: "14px", fontWeight: 600 }}>
              {isMetric ? "kg" : "lb"}
            </span>
          </div>
        </div>

        {errorMsg && (
          <div style={{ background: `${SEVERITY_COLORS.urgent}15`, border: `1px solid ${SEVERITY_COLORS.urgent}44`, borderRadius: "10px", padding: "12px 14px", fontSize: "13px", color: SEVERITY_COLORS.urgent, marginBottom: "16px" }}>
            {errorMsg}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={!canSubmit}
          className="web-btn-primary"
          style={{
            width: "100%", background: A, color: BG, border: "none",
            borderRadius: "14px", padding: "16px", fontSize: "16px", fontWeight: 700,
            opacity: canSubmit ? 1 : 0.5,
            cursor: canSubmit ? "pointer" : "default",
            transition: "opacity 0.2s, transform 0.15s",
            letterSpacing: "-0.01em",
          }}
        >
          {saving ? "Saving…" : "Continue"}
        </button>

        <div style={{ fontSize: "11px", color: MT, textAlign: "center", marginTop: "14px" }}>
          You can change these later in Profile.
        </div>
      </div>
    </div>
  );
}
// ─────────────────────────────────────────────
// WEB ATHLETE DOWNLOAD PAGE
// ─────────────────────────────────────────────
function WebAthleteDownloadPage({ onSwitchToCoach, onSignOut }) {
  return (
    <div style={{
      minHeight: "100vh", background: BG, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "48px 32px",
      fontFamily: "-apple-system, 'Helvetica Neue', Helvetica, sans-serif",
    }}>
      <ParticleCanvas />

      <div style={{ position: "relative", zIndex: 2, textAlign: "center", maxWidth: "520px" }}>
        {/* Logo */}
        <div style={{
          width: "80px", height: "80px", borderRadius: "50%", background: "#0A0A0A",
          border: `2px solid ${A}33`, display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 32px", boxShadow: `0 0 40px ${A}15`,
        }}>
          <img src="/theryn-logo.svg" width="80" height="80" alt="Theryn" style={{ objectFit: "contain" }} />
        </div>

        <div style={{ fontSize: "36px", fontWeight: 800, color: TX, letterSpacing: "-0.03em", marginBottom: "12px" }}>
          Train with Theryn
        </div>
        <div style={{ fontSize: "16px", color: SB, lineHeight: 1.7, marginBottom: "48px" }}>
          The Theryn athlete experience is designed for your phone.
          Download the app to track workouts, log body stats, and stay connected with your coach.
        </div>

        {/* Download buttons */}
        <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap", marginBottom: "48px" }}>
          <a
            href="https://apps.apple.com/app/theryn"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex", alignItems: "center", gap: "12px",
              background: "#111", border: `1px solid ${BD}`, borderRadius: "14px",
              padding: "16px 28px", textDecoration: "none",
              transition: "all 0.25s cubic-bezier(0.4,0,0.2,1)",
              cursor: "pointer",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "#1a1a1a"; e.currentTarget.style.borderColor = `${A}55`; e.currentTarget.style.transform = "translateY(-2px)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "#111"; e.currentTarget.style.borderColor = BD; e.currentTarget.style.transform = "translateY(0)"; }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="#F0F0F0">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
            <div>
              <div style={{ fontSize: "11px", color: SB, letterSpacing: "0.04em" }}>Download on the</div>
              <div style={{ fontSize: "17px", fontWeight: 700, color: TX }}>App Store</div>
            </div>
          </a>

          <a
            href="https://play.google.com/store/apps/details?id=com.theryn.app"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex", alignItems: "center", gap: "12px",
              background: "#111", border: `1px solid ${BD}`, borderRadius: "14px",
              padding: "16px 28px", textDecoration: "none",
              transition: "all 0.25s cubic-bezier(0.4,0,0.2,1)",
              cursor: "pointer",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "#1a1a1a"; e.currentTarget.style.borderColor = `${A}55`; e.currentTarget.style.transform = "translateY(-2px)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "#111"; e.currentTarget.style.borderColor = BD; e.currentTarget.style.transform = "translateY(0)"; }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="#F0F0F0">
              <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 0 1-.61-.92V2.734a1 1 0 0 1 .609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-1.296l2.585 1.493a1 1 0 0 1 0 1.729l-2.394 1.382-2.548-2.548 2.357-2.056zM5.864 2.658L16.8 8.991l-2.302 2.302-8.634-8.635z"/>
            </svg>
            <div>
              <div style={{ fontSize: "11px", color: SB, letterSpacing: "0.04em" }}>Get it on</div>
              <div style={{ fontSize: "17px", fontWeight: 700, color: TX }}>Google Play</div>
            </div>
          </a>
        </div>

        {/* Action links */}
        <div style={{ display: "flex", gap: "24px", justifyContent: "center" }}>
          <button
            onClick={onSwitchToCoach}
            style={{
              background: "none", border: `1px solid ${MT}`, borderRadius: "10px",
              padding: "10px 20px", color: A, fontSize: "14px", fontWeight: 600,
              cursor: "pointer", transition: "all 0.2s ease",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = `${A}12`; e.currentTarget.style.borderColor = `${A}44`; }}
            onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.borderColor = MT; }}
          >
            I'm a Coach
          </button>
          <button
            onClick={onSignOut}
            style={{
              background: "none", border: "none", padding: "10px 20px",
              color: SB, fontSize: "14px", fontWeight: 600, cursor: "pointer",
            }}
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PARTICLE CANVAS — Premium ambient particles
// ─────────────────────────────────────────────
function ParticleCanvas() {
  const canvasRef = React.useRef(null);
  const mouseRef = React.useRef({ x: -9999, y: -9999 });

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    let w = canvas.width = window.innerWidth;
    let h = canvas.height = window.innerHeight;
    let animId;
    let frame = 0;

    // Three depth layers: far, mid, near
    const layerConfigs = [
      { count: 40, speedMult: 0.15, minR: 0.4, maxR: 1.0, alphaRange: [0.04, 0.12], connectDist: 100, connectAlpha: 0.025 },
      { count: 25, speedMult: 0.35, minR: 0.8, maxR: 1.8, alphaRange: [0.08, 0.22], connectDist: 140, connectAlpha: 0.05 },
      { count: 12, speedMult: 0.65, minR: 1.4, maxR: 2.8, alphaRange: [0.15, 0.4],  connectDist: 0,   connectAlpha: 0 },
    ];

    const layers = layerConfigs.map(cfg => ({
      cfg,
      particles: Array.from({ length: cfg.count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * cfg.speedMult,
        vy: (Math.random() - 0.5) * cfg.speedMult,
        r: cfg.minR + Math.random() * (cfg.maxR - cfg.minR),
        baseAlpha: cfg.alphaRange[0] + Math.random() * (cfg.alphaRange[1] - cfg.alphaRange[0]),
        pulseOffset: Math.random() * Math.PI * 2,
        pulseSpeed: 0.008 + Math.random() * 0.012,
      })),
    }));

    function draw() {
      frame++;
      ctx.clearRect(0, 0, w, h);

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      for (const { cfg, particles } of layers) {
        for (const p of particles) {
          const pulse = 1 + 0.25 * Math.sin(frame * p.pulseSpeed + p.pulseOffset);
          const alpha = p.baseAlpha * pulse;

          // Mouse repulsion
          const dx = p.x - mx;
          const dy = p.y - my;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const repulse = 120;
          if (dist < repulse && dist > 0) {
            const force = (repulse - dist) / repulse * 0.4;
            p.x += (dx / dist) * force;
            p.y += (dy / dist) * force;
          }

          p.x += p.vx;
          p.y += p.vy;
          if (p.x < -10) p.x = w + 10;
          if (p.x > w + 10) p.x = -10;
          if (p.y < -10) p.y = h + 10;
          if (p.y > h + 10) p.y = -10;

          const r = p.r * pulse;

          // Glow for larger particles
          if (r > 1.2) {
            const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.5);
            grad.addColorStop(0, `rgba(200,255,0,${alpha * 0.8})`);
            grad.addColorStop(1, `rgba(200,255,0,0)`);
            ctx.beginPath();
            ctx.arc(p.x, p.y, r * 3.5, 0, Math.PI * 2);
            ctx.fillStyle = grad;
            ctx.fill();
          }

          // Core dot
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(200,255,0,${alpha})`;
          ctx.fill();
        }

        // Connections within layer
        if (cfg.connectDist > 0) {
          for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
              const dx = particles[i].x - particles[j].x;
              const dy = particles[i].y - particles[j].y;
              const d = Math.sqrt(dx * dx + dy * dy);
              if (d < cfg.connectDist) {
                const a = cfg.connectAlpha * (1 - d / cfg.connectDist);
                ctx.beginPath();
                ctx.moveTo(particles[i].x, particles[i].y);
                ctx.lineTo(particles[j].x, particles[j].y);
                ctx.strokeStyle = `rgba(200,255,0,${a})`;
                ctx.lineWidth = 0.6;
                ctx.stroke();
              }
            }
          }
        }
      }

      animId = requestAnimationFrame(draw);
    }

    draw();

    const onMouse = (e) => { mouseRef.current = { x: e.clientX, y: e.clientY }; };
    const onLeave = () => { mouseRef.current = { x: -9999, y: -9999 }; };
    const handleResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    window.addEventListener("mousemove", onMouse);
    window.addEventListener("mouseleave", onLeave);
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}
    />
  );
}

// ─────────────────────────────────────────────
// SIDEBAR BRAND — Logo + title in sidebar
// ─────────────────────────────────────────────
function SidebarBrand() {
  return (
    <div className="sidebar-brand" style={{
      padding: "0 24px 32px", marginBottom: "8px",
      borderBottom: `1px solid #1a1a1a`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{
          width: "36px", height: "36px", borderRadius: "10px",
          background: "#0A0A0A", border: `1px solid ${A}22`,
          display: "flex", alignItems: "center", justifyContent: "center",
          overflow: "hidden",
        }}>
          <img src="/theryn-logo.svg" width="36" height="36" alt="T" style={{ objectFit: "contain" }} />
        </div>
        <div>
          <div style={{ fontSize: "16px", fontWeight: 800, color: TX, letterSpacing: "-0.02em" }}>Theryn</div>
          <div style={{ fontSize: "10px", color: SB, letterSpacing: "0.06em", textTransform: "uppercase" }}>Coach Dashboard</div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ROLE PICKER SCREEN
// ─────────────────────────────────────────────
function RolePickerScreen({ onSelect, initialSelected = null }) {
  const [selected, setSelected] = React.useState(initialSelected);

  const cards = [
    {
      role: "athlete",
      label: "Athlete",
      icon: (
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="5" r="2"/>
          <path d="M12 7v6l3 3"/>
          <path d="M9 10H6l-2 4h4"/>
          <path d="M15 10h3l2 4h-4"/>
          <path d="M9 19l1.5-3h3L15 19"/>
        </svg>
      ),
      desc: "Track workouts, body, and personal records.",
    },
    {
      role: "coach",
      label: "Coach",
      icon: (
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      ),
      desc: "Manage athletes, routines, and progress.",
    },
  ];

  return (
    <div style={{
      minHeight: "100vh",
      background: BG,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "32px 24px",
    }}>
      {/* Logo */}
      <div style={{ marginBottom: "40px", textAlign: "center" }}>
        <div style={{ fontSize: "32px", fontWeight: 800, color: TX, letterSpacing: "-0.5px" }}>
          THERYN
        </div>
        <div style={{ fontSize: "14px", color: SB, marginTop: "6px" }}>
          Who are you training as?
        </div>
      </div>

      {/* Cards */}
      <div className="role-picker-cards" style={{ display: "flex", flexDirection: "column", gap: "14px", width: "100%", maxWidth: "700px" }}>
        {cards.map(c => (
          <button
            key={c.role}
            onClick={() => setSelected(c.role)}
            style={{
              background: selected === c.role ? `${A}12` : S1,
              border: `2px solid ${selected === c.role ? A : BD}`,
              borderRadius: "16px",
              padding: "22px 20px",
              display: "flex",
              alignItems: "center",
              gap: "18px",
              cursor: "pointer",
              transition: "border-color 0.2s, background 0.2s",
              textAlign: "left",
            }}
          >
            <div style={{ color: selected === c.role ? A : SB, flexShrink: 0, transition: "color 0.2s" }}>
              {c.icon}
            </div>
            <div>
              <div style={{ fontSize: "18px", fontWeight: 700, color: TX, marginBottom: "4px" }}>
                {c.label}
              </div>
              <div style={{ fontSize: "13px", color: SB }}>
                {c.desc}
              </div>
            </div>
            {selected === c.role && (
              <div style={{ marginLeft: "auto", width: "22px", height: "22px", borderRadius: "50%", background: A, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke={BG} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Continue */}
      <button
        onClick={() => selected && onSelect(selected)}
        disabled={!selected}
        className="web-btn-primary"
        style={{
          marginTop: "32px",
          width: "100%",
          maxWidth: "360px",
          padding: "16px",
          background: selected ? A : MT,
          color: selected ? BG : SB,
          border: "none",
          borderRadius: "14px",
          fontSize: "16px",
          fontWeight: 700,
          cursor: selected ? "pointer" : "default",
          transition: "background 0.2s, color 0.2s",
          letterSpacing: "0.02em",
        }}
      >
        Continue
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
// COACH TOUR OVERLAY
// ─────────────────────────────────────────────
const COACH_TOUR_SLIDES = [
  {
    title: "Welcome, Coach",
    body: "You're in coach mode. Switch between your athletes and manage everything from one place.",
    icon: "🏋️",
  },
  {
    title: "Athletes Tab",
    body: "See all your athletes at a glance — today's workout, streak, and quick access to their full profile.",
    icon: "👥",
  },
  {
    title: "Routines & Progress",
    body: "Edit athlete routines, add notes to exercises, and track body metrics and progress charts.",
    icon: "📈",
  },
  {
    title: "Records",
    body: "See each athlete's personal bests across all exercises in one clean view.",
    icon: "🏆",
  },
];

function CoachTourOverlay({ onDone }) {
  const [slide, setSlide] = React.useState(0);
  const current = COACH_TOUR_SLIDES[slide];
  const isLast = slide === COACH_TOUR_SLIDES.length - 1;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: BG,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "40px 28px",
    }}>
      {/* Dots */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "48px" }}>
        {COACH_TOUR_SLIDES.map((_, i) => (
          <div key={i} style={{
            width: i === slide ? "20px" : "6px",
            height: "6px",
            borderRadius: "3px",
            background: i === slide ? A : MT,
            transition: "width 0.3s, background 0.3s",
          }}/>
        ))}
      </div>

      <div style={{ fontSize: "56px", marginBottom: "28px" }}>{current.icon}</div>
      <div style={{ fontSize: "26px", fontWeight: 800, color: TX, textAlign: "center", marginBottom: "14px" }}>
        {current.title}
      </div>
      <div style={{ fontSize: "15px", color: SB, textAlign: "center", lineHeight: 1.6, maxWidth: "300px", marginBottom: "48px" }}>
        {current.body}
      </div>

      <button
        onClick={() => isLast ? onDone() : setSlide(s => s + 1)}
        style={{
          width: "100%", maxWidth: "320px",
          background: A, color: BG,
          border: "none", borderRadius: "14px",
          padding: "16px", fontSize: "16px", fontWeight: 700,
          cursor: "pointer", letterSpacing: "0.02em",
        }}
      >
        {isLast ? "Open Coach Dashboard" : "Next"}
      </button>

      {!isLast && (
        <button onClick={onDone} style={{ marginTop: "16px", background: "none", border: "none", color: SB, fontSize: "14px", cursor: "pointer" }}>
          Skip
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// COACH TAB ICON
// ─────────────────────────────────────────────
function CoachTabIcon({ tab, active }) {
  const color = active ? A : SB;
  const s = { width: 22, height: 22 };
  if (tab === "athletes") return (
    <svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
  if (tab === "routines") return (
    <svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
      <rect x="9" y="3" width="6" height="4" rx="1"/>
      <line x1="9" y1="12" x2="15" y2="12"/>
      <line x1="9" y1="16" x2="13" y2="16"/>
    </svg>
  );
  if (tab === "body") return (
    <svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  );
  if (tab === "progress") return (
    <svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  );
  if (tab === "connections") return (
    <svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <line x1="19" y1="8" x2="19" y2="14"/>
      <line x1="22" y1="11" x2="16" y2="11"/>
    </svg>
  );
  if (tab === "payments") return (
    <svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="13" rx="2"/>
      <line x1="2" y1="10" x2="22" y2="10"/>
      <line x1="6" y1="15" x2="10" y2="15"/>
    </svg>
  );
  return null;
}

// ─────────────────────────────────────────────
// COACH APP (root shell)
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// COACH APP (root shell)
// ─────────────────────────────────────────────
function CoachApp({ authUser, profile, setProfile, coachLinks, setCoachLinks, coachLinksLoaded, onSwitchRole, onSignOut }) {
  const [tab, setTab] = React.useState("athletes");
  const [selectedAthlete, setSelectedAthlete] = React.useState(null);
  const [athleteData, setAthleteData] = React.useState(null);   // { routine, history, weights, measurements }
  const [loadingAthlete, setLoadingAthlete] = React.useState(false);
  const [showTour, setShowTour] = React.useState(false);
  const [toast, setToast] = React.useState(null); // { message, variant }

  // Expand #root to full width on desktop for the coach dashboard
  React.useEffect(() => {
    document.body.dataset.app = "coach";
    return () => { delete document.body.dataset.app; };
  }, []);

  // Register notification tap handler once (deep-link listener)
  React.useEffect(() => {
    registerNotificationTapHandlers();
  }, []);

  // ── Persist + restore selected athlete across reloads
  const SELECTED_KEY = authUser?.id ? `theryn_coach_selected_${authUser.id}` : null;

  React.useEffect(() => {
    if (!SELECTED_KEY || !coachLinksLoaded || selectedAthlete) return;
    const saved = localStorage.getItem(SELECTED_KEY);
    if (!saved) return;
    const match = coachLinks.find(
      l => l.athlete_id === saved && l.coach_id === authUser?.id && l.status === "accepted"
    );
    if (match) setSelectedAthlete(match);
  }, [coachLinksLoaded, SELECTED_KEY]);

  React.useEffect(() => {
    if (!SELECTED_KEY) return;
    if (selectedAthlete?.athlete_id) {
      localStorage.setItem(SELECTED_KEY, selectedAthlete.athlete_id);
    } else {
      localStorage.removeItem(SELECTED_KEY);
    }
  }, [selectedAthlete?.athlete_id, SELECTED_KEY]);

  React.useEffect(() => {
    if (!authUser?.id) return;
    const tourKey = `theryn_coach_tour_done_${authUser.id}`;
    if (!localStorage.getItem(tourKey)) setShowTour(true);
  }, [authUser?.id]);

  // Ref-based cache: optimistic updates (e.g. coach-note save) must NOT retrigger
  // the effect below — otherwise every save kicks off a full loadAthleteData and
  // the tab repaints from the top down after the background fetch resolves.
  const athleteDataCacheRef = React.useRef({});
  const selectedAthleteRef = React.useRef(null);
  React.useEffect(() => { selectedAthleteRef.current = selectedAthlete; }, [selectedAthlete]);

  const setAthleteCache = React.useCallback((id, data) => {
    athleteDataCacheRef.current[id] = data;
    // If the updated athlete is the one currently on screen, push into state
    // so the optimistic change is visible immediately.
    if (selectedAthleteRef.current?.athlete_id === id) {
      setAthleteData(data);
    }
  }, []);

  // Load all athlete data whenever selection changes
  React.useEffect(() => {
    if (!selectedAthlete) { setAthleteData(null); return; }
    const athleteId = selectedAthlete.athlete_id;

    // Instant loading from Row cache
    const cached = athleteDataCacheRef.current[athleteId];
    if (cached) {
      setAthleteData(cached);
      setLoadingAthlete(false);
      // Background refresh — only overwrite if still viewing this athlete.
      loadAthleteData(athleteId).then(d => {
        athleteDataCacheRef.current[athleteId] = d;
        if (selectedAthleteRef.current?.athlete_id === athleteId) setAthleteData(d);
      }).catch(()=>{});
      return;
    }

    setLoadingAthlete(true);
    setAthleteData(null);
    loadAthleteData(athleteId)
      .then(d => {
        athleteDataCacheRef.current[athleteId] = d;
        if (selectedAthleteRef.current?.athlete_id === athleteId) {
          setAthleteData(d);
          setLoadingAthlete(false);
        }
      })
      .catch(() => setLoadingAthlete(false));
  }, [selectedAthlete?.athlete_id]);

  const myAthletes = React.useMemo(() => coachLinks.filter(l => l.coach_id === authUser?.id && l.status === "accepted"), [coachLinks, authUser?.id]);

  React.useEffect(() => {
    if (!authUser?.id || myAthletes.length === 0) return;

    const channel = supabase
      .channel('coach-notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'workout_sessions' },
        (payload) => {
          const newSession = payload.new;
          const matchedLink = myAthletes.find(l => l.athlete_id === newSession.user_id);
          if (matchedLink) {
            triggerAthleteFinishedNotification(matchedLink.athlete_name, newSession.workout_type);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [authUser?.id, myAthletes]);

  // ── App resume: fire catch-up notification for athletes finished while away
  React.useEffect(() => {
    if (!authUser?.id) return;

    const runCatchUp = async () => {
      const lastSeen = getCoachLastSeen();
      markCoachSeen();
      if (!lastSeen) return;
      // Only if we were away > 15 min (avoid spamming on quick app switches)
      const awayMs = Date.now() - lastSeen.getTime();
      if (awayMs < 15 * 60 * 1000) return;
      try {
        const sessions = await loadAthleteSessionsSince(authUser.id, lastSeen.toISOString());
        if (sessions.length > 0) {
          await triggerCoachCatchUp(sessions);
        }
      } catch (e) {
        console.error('Coach catch-up failed', e);
      }
    };

    runCatchUp();

    let resumeSub;
    try {
      resumeSub = CapApp.addListener('appStateChange', (state) => {
        if (state.isActive) runCatchUp();
        else markCoachSeen();
      });
    } catch {}
    return () => { try { resumeSub?.remove?.(); } catch {} };
  }, [authUser?.id]);

  // ── Schedule coach daily digest based on current athlete signals
  const digestAthleteSignals = React.useRef({});
  const collectDigestSignals = React.useCallback((id, payload) => {
    digestAthleteSignals.current[id] = payload;
  }, []);

  React.useEffect(() => {
    if (!authUser?.id || myAthletes.length === 0) return;
    // Wait a beat for rows to compute signals, then schedule digest
    const t = setTimeout(() => {
      const all = Object.values(digestAthleteSignals.current);
      const urgent = all.filter(x => x.signals?.[0]?.severity === "urgent").length;
      const warn = all.filter(x => x.signals?.[0]?.severity === "warn").length;
      const celebrate = all.filter(x => x.signals?.some(s => s.severity === "celebrate")).length;
      const topLines = all
        .filter(x => x.signals?.[0]?.severity === "urgent" || x.signals?.[0]?.severity === "warn")
        .slice(0, 2)
        .map(x => `${x.athlete.athlete_name}: ${x.signals[0].message}`);
      scheduleCoachDailyDigest({
        urgent, warn, celebrate,
        totalAthletes: myAthletes.length,
        topLines,
      }).catch(() => {});
    }, 5000);
    return () => clearTimeout(t);
  }, [authUser?.id, myAthletes.length, coachLinksLoaded]);

  // ── Consume pending deep-link from a tapped notification
  React.useEffect(() => {
    if (!coachLinksLoaded || myAthletes.length === 0) return;
    const link = consumePendingDeepLink();
    if (!link) return;
    if (link.type === 'athlete_finished' && link.athleteName) {
      const match = myAthletes.find(l => l.athlete_name === link.athleteName);
      if (match) {
        setSelectedAthlete(match);
        setTab('progress');
      }
    } else if (link.type === 'coach_digest' || link.type === 'coach_catchup') {
      setTab('athletes');
    }
  }, [coachLinksLoaded, myAthletes]);

  function handleTourDone() {
    if (authUser?.id) localStorage.setItem(`theryn_coach_tour_done_${authUser.id}`, "1");
    setShowTour(false);
  }

  const [showProfile, setShowProfile] = React.useState(false);
  const [coachInviteCode, setCoachInviteCode] = React.useState("⋯");
  const [editingName, setEditingName] = React.useState(false);
  const [editNameValue, setEditNameValue] = React.useState("");
  const [savingName, setSavingName] = React.useState(false);

  React.useEffect(() => {
    if (!authUser?.id) return;
    ensureInviteCode(authUser.id).then(setCoachInviteCode).catch(() => {});
  }, [authUser?.id]);

  const coachDisplayName = profile?.display_name || authUser?.email?.split("@")[0] || "Coach";

  async function handleSaveCoachName() {
    if (!editNameValue.trim()) return;
    setSavingName(true);
    const words = editNameValue.trim().split(" ").filter(Boolean);
    let init = "";
    if (words.length > 0) init += words[0][0].toUpperCase();
    if (words.length > 1) init += words[words.length - 1][0].toUpperCase();
    const { error } = await supabase.from("profiles").update({
      display_name: editNameValue.trim()
    }).eq("id", authUser.id);
    setSavingName(false);
    if (!error) {
      if (setProfile) setProfile(p => ({ ...p, display_name: editNameValue.trim(), initials: init || p?.initials }));
      setEditingName(false);
    }
  }

  // Connections moved out of the main nav into the profile drawer (it's a
  // config-style flow, not a daily workflow). Payments takes the freed slot.
  const COACH_TABS = ["athletes", "routines", "body", "progress", "payments"];
  const COACH_LABELS = { athletes: "Athletes", routines: "Routines", body: "Body", progress: "Progress", payments: "Payments" };

  // Separate state for the Connections modal triggered from the profile drawer.
  const [showConnections, setShowConnections] = React.useState(false);

  const sharedTabProps = { authUser, profile, selectedAthlete, setSelectedAthlete, coachLinks, coachLinksLoaded, athleteData, loadingAthlete, setAthleteCache };

  return (
    <div className="app-shell">
      {/* Ambient particle background (web only) */}
      {Capacitor.getPlatform() === "web" && <ParticleCanvas />}
      
      {showTour && <CoachTourOverlay onDone={handleTourDone}/>}

      {/* Global Coach Avatar — web only (mobile uses Athletes tab profile sheet) */}
      {Capacitor.getPlatform() === "web" && (
        <div style={{ position: "absolute", top: 20, right: 16, zIndex: 110 }}>
          <button onClick={() => setShowProfile(true)} style={{
            width: "38px", height: "38px", borderRadius: "50%",
            background: profile?.setup ? profile.color : A, border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "15px", fontWeight: 800, color: BG,
          }}>
            {profile?.setup ? profile.initials : (profile?.initials || displayName[0]?.toUpperCase() || "C")}
          </button>
        </div>
      )}

      {/* Sidebar / Bottom Tab bar */}
      <div className="nav-bar-container">
        <SidebarBrand />
        {COACH_TABS.map(t => (
          <button 
            key={t} 
            onClick={() => setTab(t)} 
            className={`nav-item ${tab === t ? 'nav-item-active' : ''}`}
          >
            <CoachTabIcon tab={t} active={tab === t}/>
            <span style={{ fontSize: "9px", fontWeight: 600, color: tab === t ? A : SB, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              {COACH_LABELS[t]}
            </span>
          </button>
        ))}
      </div>

      <div className="content-scroll">
        <div style={{ display: tab === "athletes" ? "block" : "none" }}>
          <CoachAthletesTab
            {...sharedTabProps}
            profile={profile}
            setProfile={setProfile}
            onSwitchRole={onSwitchRole}
            onSignOut={onSignOut}
            setTab={setTab}
            showProfile={showProfile}
            setShowProfile={setShowProfile}
            onDigestSignals={collectDigestSignals}
          />
        </div>
        {tab === "routines"  && <CoachRoutinesTab  {...sharedTabProps}/>}
        {tab === "body"      && <CoachBodyTab       {...sharedTabProps}/>}
        {tab === "progress"  && <CoachProgressTab  {...sharedTabProps}/>}
        {tab === "payments"  && <CoachPaymentsTab  {...sharedTabProps}/>}
      </div>

      {/* Connections modal — triggered from the profile drawer (was a tab) */}
      {showConnections && (
        <div style={{ position: "fixed", inset: 0, zIndex: 260, background: BG, overflowY: "auto" }}>
          <div style={{ padding: "20px 16px", borderBottom: `1px solid ${BD}`, display: "flex", alignItems: "center", gap: "12px", position: "sticky", top: 0, background: BG, zIndex: 5 }}>
            <button onClick={() => setShowConnections(false)} style={{ background: "none", border: "none", color: SB, fontSize: "22px", cursor: "pointer", padding: 0, lineHeight: 1 }}>←</button>
            <div style={{ fontSize: "17px", fontWeight: 700, color: TX }}>Connections</div>
          </div>
          <CoachModal authUser={authUser} mode="coach" inline={true} onUpdate={() => loadCoachLinks(authUser.id).then(setCoachLinks)} />
        </div>
      )}

      {/* Floating profile avatar — visible on every tab (native only; web has its own top-right).
          `max()` ensures a minimum 44px offset on Android (where env() may be 0)
          and respects the iOS notch when present. */}
      {Capacitor.getPlatform() !== "web" && (
        <button
          onClick={() => setShowProfile(true)}
          aria-label="Open profile"
          style={{
            position: "fixed",
            top: "max(calc(env(safe-area-inset-top, 0px) + 14px), 44px)",
            right: "16px",
            width: "40px", height: "40px", borderRadius: "50%",
            background: profile?.setup ? profile.color : A,
            border: `2px solid ${BG}`,
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "15px", fontWeight: 800, color: BG,
            zIndex: 150,
            boxShadow: `0 4px 14px rgba(0,0,0,0.5), 0 0 0 1px ${A}33`,
          }}
        >
          {profile?.setup ? profile.initials : (profile?.initials || coachDisplayName[0]?.toUpperCase() || "C")}
        </button>
      )}

      {/* Profile bottom sheet — available from every tab */}
      {showProfile && (
        <div style={{ position: "fixed", inset: 0, zIndex: 250, background: "rgba(0,0,0,0.6)" }} onClick={() => setShowProfile(false)}>
          <div
            style={{
              position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)",
              width: "100%", maxWidth: 430,
              background: S1, borderRadius: "20px 20px 0 0",
              padding: "28px 20px 40px",
              animation: "drawerUp 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: MT }}/>
              <button onClick={() => setShowProfile(false)} style={{ background: "none", border: "none", color: SB, fontSize: "14px", fontWeight: 700, cursor: "pointer" }}>Dismiss</button>
            </div>

            {/* ── Identity — avatar + name (editable) + email ── */}
            <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "22px" }}>
              <div style={{
                width: "52px", height: "52px", borderRadius: "50%",
                background: profile?.color || A, border: `1px solid ${MT}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "19px", fontWeight: 800, color: BG, flexShrink: 0,
                letterSpacing: "-0.02em",
              }}>
                {profile?.initials || coachDisplayName[0]?.toUpperCase() || "C"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {editingName ? (
                  <div style={{ display: "flex", gap: "6px" }}>
                    <input
                      type="text"
                      value={editNameValue}
                      onChange={e => setEditNameValue(e.target.value)}
                      autoFocus
                      style={{ flex: 1, minWidth: 0, background: S2, border: `1px solid ${BD}`, borderRadius: "8px", padding: "8px 10px", color: TX, fontSize: "15px", boxSizing: "border-box" }}
                    />
                    <button onClick={handleSaveCoachName} disabled={savingName || !editNameValue.trim()}
                      style={{ background: A, border: "none", borderRadius: "8px", padding: "0 12px", color: BG, fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
                      {savingName ? "…" : "Save"}
                    </button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ fontSize: "17px", fontWeight: 700, color: TX, letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {coachDisplayName}
                      </div>
                      <button onClick={() => { setEditNameValue(coachDisplayName); setEditingName(true); }}
                        style={{ background: "none", border: "none", color: A, fontSize: "12px", fontWeight: 600, cursor: "pointer", padding: 0 }}>
                        Edit
                      </button>
                    </div>
                    <div style={{ fontSize: "12px", color: SB, marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {authUser?.email}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ── Quick stats: athletes + pending payments (links to Payments) ── */}
            <div style={{ display: "flex", gap: "8px", marginBottom: "18px" }}>
              <div style={{ flex: 1, background: S2, borderRadius: "12px", padding: "12px", border: `1px solid ${BD}` }}>
                <div style={{ fontSize: "9px", color: SB, letterSpacing: "0.06em", fontWeight: 700, textTransform: "uppercase" }}>Athletes</div>
                <div style={{ fontSize: "20px", fontWeight: 800, color: TX, marginTop: "3px", letterSpacing: "-0.02em" }}>
                  {coachLinks.filter(l => l.coach_id === authUser?.id && l.status === "accepted").length}
                </div>
              </div>
              <button
                onClick={() => { setShowProfile(false); setTab("payments"); }}
                style={{ flex: 1, background: S2, border: `1px solid ${BD}`, borderRadius: "12px", padding: "12px", textAlign: "left", cursor: "pointer", color: "inherit" }}
              >
                <div style={{ fontSize: "9px", color: SB, letterSpacing: "0.06em", fontWeight: 700, textTransform: "uppercase" }}>Payments</div>
                <div style={{ fontSize: "15px", fontWeight: 700, color: A, marginTop: "3px", letterSpacing: "-0.01em" }}>
                  Open <span style={{ color: MT }}>→</span>
                </div>
              </button>
            </div>

            {/* ── Invite code card ── */}
            <div style={{ background: S2, borderRadius: "12px", padding: "12px 16px", marginBottom: "18px", border: `1px solid ${BD}` }}>
              <div style={{ fontSize: "10px", color: SB, letterSpacing: "0.06em", marginBottom: "4px", fontWeight: 700, textTransform: "uppercase" }}>Invite Code</div>
              <div style={{ fontSize: "22px", fontWeight: 800, color: A, letterSpacing: "0.1em" }}>{coachInviteCode}</div>
            </div>

            {/* ── Settings ── */}
            <div style={{ fontSize: "10px", color: SB, letterSpacing: "0.08em", marginBottom: "8px", fontWeight: 700, textTransform: "uppercase", paddingLeft: "4px" }}>Settings</div>
            <div style={{ background: S2, borderRadius: "14px", overflow: "hidden", marginBottom: "12px", border: `1px solid ${BD}` }}>
              <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", borderBottom: `1px solid ${BD}` }}>
                <div style={{ fontSize: "14px", color: TX }}>Default currency</div>
                <select
                  value={profile?.default_currency || "USD"}
                  onChange={async (e) => {
                    const next = e.target.value;
                    if (setProfile) setProfile(p => ({ ...p, default_currency: next }));
                    if (authUser?.id) {
                      await supabase.from("profiles").update({ default_currency: next }).eq("id", authUser.id);
                    }
                  }}
                  style={{ background: S1, color: TX, border: `1px solid ${BD}`, borderRadius: "8px", padding: "6px 10px", fontSize: "13px", fontWeight: 600, cursor: "pointer", outline: "none" }}
                >
                  {SUPPORTED_CURRENCIES.map(c => (
                    <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>
                  ))}
                </select>
              </div>
              <button onClick={() => { setShowProfile(false); setShowConnections(true); }}
                style={{ width: "100%", padding: "14px 16px", background: "none", border: "none", color: TX, fontSize: "14px", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>Connections</span>
                <span style={{ color: MT }}>→</span>
              </button>
            </div>

            {/* ── Account ── */}
            <div style={{ background: S2, borderRadius: "14px", overflow: "hidden", marginBottom: "8px", border: `1px solid ${BD}` }}>
              <button onClick={() => { setShowProfile(false); onSwitchRole(); }}
                style={{ width: "100%", padding: "14px 16px", background: "none", border: "none", borderBottom: `1px solid ${BD}`, color: TX, fontSize: "14px", textAlign: "left", cursor: "pointer" }}>
                Switch to Athlete
              </button>
              <button onClick={() => { setShowProfile(false); onSignOut(); }}
                style={{ width: "100%", padding: "14px 16px", background: "none", border: "none", color: SEVERITY_COLORS.urgent, fontSize: "14px", textAlign: "left", cursor: "pointer", fontWeight: 600 }}>
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// COACH: ATHLETES TAB
// ─────────────────────────────────────────────
function CoachAthletesTab({ authUser, profile, setProfile, coachLinks, coachLinksLoaded, selectedAthlete, setSelectedAthlete, onSwitchRole, onSignOut, setTab, showProfile, setShowProfile, setAthleteCache, onDigestSignals }) {
  const [expandedAthlete, setExpandedAthlete] = React.useState(null);
  const [athleteLoading, setAthleteLoading] = React.useState(false);
  const [inviteCode, setInviteCode] = React.useState("⋯");
  const [permState, setPermState] = React.useState("granted");
  const [athleteSignals, setAthleteSignals] = React.useState({}); // { athleteId: { athlete, signals, streak } }

  // ── Dismissed Needs-Attention entries (persist 24h per coach)
  const DISMISS_KEY = authUser?.id ? `theryn_coach_dismiss_${authUser.id}` : null;
  const [dismissed, setDismissed] = React.useState({}); // { athleteId: { kind, at } }
  const DISMISS_TTL_MS = 24 * 60 * 60 * 1000;

  React.useEffect(() => {
    if (!DISMISS_KEY) return;
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      // Prune expired entries on load
      const now = Date.now();
      const cleaned = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (v && now - v.at < DISMISS_TTL_MS) cleaned[k] = v;
      }
      setDismissed(cleaned);
    } catch {}
  }, [DISMISS_KEY]);

  const dismissSignal = React.useCallback((athleteId, kind) => {
    setDismissed(prev => {
      const next = { ...prev, [athleteId]: { kind, at: Date.now() } };
      if (DISMISS_KEY) {
        try { localStorage.setItem(DISMISS_KEY, JSON.stringify(next)); } catch {}
      }
      return next;
    });
  }, [DISMISS_KEY]);

  const handleAthleteSignals = React.useCallback((id, payload) => {
    setAthleteSignals(p => {
      const prev = p[id];
      // Avoid unnecessary re-renders when signals haven't meaningfully changed
      if (prev && JSON.stringify(prev.signals) === JSON.stringify(payload.signals)) return p;
      return { ...p, [id]: payload };
    });
    // Forward to parent for daily digest composition
    if (onDigestSignals) onDigestSignals(id, payload);
  }, [onDigestSignals]);

  // Poll current permission state on mount
  React.useEffect(() => {
    getNotificationPermissionState().then(setPermState).catch(() => {});
  }, []);

  const [editingName, setEditingName] = React.useState(false);
  const [editNameValue, setEditNameValue] = React.useState("");
  const [savingName, setSavingName] = React.useState(false);

  const displayName = profile?.display_name || authUser?.email?.split("@")[0] || "Coach";
  const myAthletes = coachLinks.filter(l => l.coach_id === authUser?.id && l.status === "accepted");

  // Load real invite code
  React.useEffect(() => {
    if (!authUser?.id) return;
    ensureInviteCode(authUser.id).then(setInviteCode).catch(() => {});
  }, [authUser?.id]);

  function openAthleteView(link) {
    setSelectedAthlete(link);
    setExpandedAthlete(null);
  }

  async function handleSaveName() {
    if (!editNameValue.trim()) return;
    setSavingName(true);
    
    const words = editNameValue.trim().split(" ").filter(w => w.length > 0);
    let init = "";
    if (words.length > 0) init += words[0][0].toUpperCase();
    if (words.length > 1) init += words[words.length - 1][0].toUpperCase();

    const { error } = await supabase.from("profiles").update({ 
      display_name: editNameValue.trim()
    }).eq("id", authUser.id);
    
    setSavingName(false);
    if (!error) {
      if (setProfile) setProfile(p => ({ ...p, display_name: editNameValue.trim(), initials: init || p.initials }));
      setEditingName(false);
    }
  }

  return (
    <div style={{ padding: "20px 16px 0" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <div>
          <div style={{ fontSize: "20px", fontWeight: 800, color: TX }}>My Athletes</div>
          <div style={{ fontSize: "12px", color: SB, marginTop: "2px" }}>
            {coachLinksLoaded ? `${myAthletes.length} athlete${myAthletes.length !== 1 ? "s" : ""}` : "Loading…"}
          </div>
        </div>
      </div>

      {/* Notification permission banner */}
      {permState === "denied" && Capacitor.isNativePlatform() && (
        <div style={{ background: `${SEVERITY_COLORS.warn}12`, border: `1px solid ${SEVERITY_COLORS.warn}44`, borderRadius: "12px", padding: "12px 14px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ fontSize: "20px" }}>🔔</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: TX }}>Notifications are off</div>
            <div style={{ fontSize: "12px", color: SB, marginTop: "2px" }}>Turn them on to get coach briefings and athlete updates.</div>
          </div>
          <button
            onClick={async () => {
              const s = await requestNotificationPermissions();
              setPermState(s);
            }}
            style={{ background: SEVERITY_COLORS.warn, border: "none", borderRadius: "8px", padding: "8px 12px", color: BG, fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
          >
            Enable
          </button>
        </div>
      )}

      {/* Selected athlete banner */}
      {selectedAthlete && (
        <div style={{ background: `${A}10`, border: `1px solid ${A}44`, borderRadius: "12px", padding: "10px 14px", marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "10px", color: A, fontWeight: 700, letterSpacing: "0.06em", marginBottom: "2px" }}>VIEWING</div>
            <div style={{ fontSize: "14px", color: TX, fontWeight: 700 }}>
              {selectedAthlete.athlete_name || selectedAthlete.athlete_id?.slice(0, 8)}
            </div>
          </div>
          <button onClick={() => setSelectedAthlete(null)} style={{ background: MT, border: "none", borderRadius: "8px", padding: "6px 12px", color: TX, fontSize: "12px", cursor: "pointer" }}>
            Clear
          </button>
        </div>
      )}

      {/* Athlete list */}
      {!coachLinksLoaded ? (
        <div style={{ textAlign: "center", color: SB, padding: "48px 0", fontSize: "14px" }}>Loading athletes…</div>
      ) : myAthletes.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 16px" }}>
          <div style={{ fontSize: "40px", marginBottom: "16px" }}>👥</div>
          <div style={{ fontSize: "16px", fontWeight: 700, color: TX, marginBottom: "8px" }}>No athletes yet</div>
          <div style={{ fontSize: "13px", color: SB, marginBottom: "24px" }}>Share your invite code with athletes to connect.</div>
          <div style={{ background: S2, border: `1px solid ${BD}`, borderRadius: "12px", padding: "14px 20px", display: "inline-block" }}>
            <div style={{ fontSize: "11px", color: SB, marginBottom: "4px", letterSpacing: "0.06em" }}>YOUR INVITE CODE</div>
            <div style={{ fontSize: "24px", fontWeight: 800, color: A, letterSpacing: "0.12em" }}>{inviteCode}</div>
          </div>
        </div>
      ) : (
        <>
          {/* Needs Attention — surfaces top urgent/warn signals across athletes */}
          {(() => {
            const priority = { urgent: 4, warn: 3, celebrate: 2, info: 1 };
            const now = Date.now();
            const attention = Object.values(athleteSignals)
              .filter(x => x.signals && x.signals.length > 0 && (x.signals[0].severity === "urgent" || x.signals[0].severity === "warn"))
              // Skip any athlete whose top signal kind was dismissed within TTL
              .filter(x => {
                const d = dismissed[x.athlete.athlete_id];
                if (!d) return true;
                if (now - d.at > DISMISS_TTL_MS) return true;
                return d.kind !== x.signals[0].kind;
              })
              .sort((a, b) => (priority[b.signals[0].severity] || 0) - (priority[a.signals[0].severity] || 0))
              .slice(0, 3);
            if (attention.length === 0) return null;
            return (
              <div style={{ marginBottom: "20px", background: S2, borderRadius: "16px", border: `1px solid ${MT}`, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", borderBottom: `1px solid ${MT}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontSize: "11px", fontWeight: 800, color: SEVERITY_COLORS.warn, letterSpacing: "0.08em" }}>NEEDS ATTENTION</div>
                  <div style={{ fontSize: "11px", color: SB }}>{attention.length} of {myAthletes.length}</div>
                </div>
                {attention.map(({ athlete, signals }, i) => {
                  const sig = signals[0];
                  const c = SEVERITY_COLORS[sig.severity];
                  return (
                    <div
                      key={athlete.id}
                      style={{
                        display: "flex", alignItems: "stretch",
                        borderBottom: i < attention.length - 1 ? `1px solid ${MT}` : "none",
                      }}
                    >
                      <button
                        className="row-btn"
                        onClick={() => {
                          dismissSignal(athlete.athlete_id, sig.kind);
                          openAthleteView(athlete);
                          if (setTab && sig.suggestedTab) setTab(sig.suggestedTab);
                        }}
                        style={{
                          flex: 1, width: "100%", padding: "12px 8px 12px 16px",
                          display: "flex", alignItems: "center", gap: "12px",
                          background: "none", border: "none", cursor: "pointer", textAlign: "left",
                          fontFamily: "inherit",
                        }}
                      >
                        <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: A, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <span style={{ fontSize: "13px", fontWeight: 800, color: BG }}>
                            {athlete.athlete_name?.[0]?.toUpperCase() || "?"}
                          </span>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "13px", fontWeight: 700, color: TX, marginBottom: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {athlete.athlete_name}
                          </div>
                          <div style={{ fontSize: "12px", color: SB, lineHeight: 1.4 }}>{sig.message}</div>
                        </div>
                        <div style={{
                          fontSize: "9px", fontWeight: 800, letterSpacing: "0.06em",
                          background: `${c}18`, color: c, padding: "3px 7px", borderRadius: "5px",
                          border: `1px solid ${c}33`, textTransform: "uppercase", flexShrink: 0,
                        }}>
                          {sig.severity}
                        </div>
                      </button>
                      <button
                        aria-label="Dismiss"
                        onClick={() => dismissSignal(athlete.athlete_id, sig.kind)}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "center",
                          width: "44px", flexShrink: 0,
                          background: "none", border: "none", cursor: "pointer",
                          color: SB,
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"/>
                          <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          <div className="crm-grid">
            {myAthletes.map(link => (
              <CoachAthleteRow
                key={link.id}
                athlete={link}
                expandedAthlete={expandedAthlete}
                setExpandedAthlete={setExpandedAthlete}
                openAthleteView={openAthleteView}
                athleteLoading={athleteLoading}
                isSelected={selectedAthlete?.id === link.id}
                setTab={setTab}
                setAthleteCache={setAthleteCache}
                onSignals={handleAthleteSignals}
              />
            ))}
          </div>
        </>
      )}

    </div>
  );
}

// ─────────────────────────────────────────────
// COACH: ROUTINES TAB
// ─────────────────────────────────────────────
const DAY_ORDER = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

function CoachRoutinesTab({ authUser, selectedAthlete, setSelectedAthlete, coachLinks, coachLinksLoaded, athleteData, loadingAthlete, setAthleteCache }) {
  const [activeDay, setActiveDay] = React.useState(() => getToday());
  const [editingNote, setEditingNote] = React.useState(null); // { day, exIndex }
  const [noteText, setNoteText] = React.useState("");         // controlled textarea value
  const [savingNote, setSavingNote] = React.useState(false);
  const [coachAthleteView, setCoachAthleteView] = React.useState(null);
  const [noteToast, setNoteToast] = React.useState(null);

  const athleteName = selectedAthlete?.athlete_name || "Athlete";
  const routine = athleteData?.routine || null;

  const workoutDays = DAY_ORDER.filter(d => routine?.[d] && routine[d].type !== "Rest" && routine[d].exercises?.length > 0);
  const allDays = DAY_ORDER.filter(d => routine?.[d]);

  // Default to today if it's a workout day, else first workout day
  React.useEffect(() => {
    if (!routine) return;
    const today = getToday();
    if (workoutDays.includes(today)) {
      setActiveDay(today);
    } else if (workoutDays.length > 0 && !workoutDays.includes(activeDay)) {
      setActiveDay(workoutDays[0]);
    }
  }, [selectedAthlete?.athlete_id, athleteData?.routine]);

  // Auto-dismiss toast
  React.useEffect(() => {
    if (!noteToast) return;
    const t = setTimeout(() => setNoteToast(null), 2400);
    return () => clearTimeout(t);
  }, [noteToast]);

  // When opening a note editor, seed noteText with existing note
  React.useEffect(() => {
    if (editingNote) {
      const ex = routine?.[editingNote.day]?.exercises?.[editingNote.exIndex];
      setNoteText(getNoteFromEx(ex));
    }
  }, [editingNote?.day, editingNote?.exIndex]);

  // Read note from routine object (stored directly in Supabase payload)
  const getNoteFromEx = (ex) => (typeof ex === "object" && ex !== null) ? (ex.coachNote || "") : "";

  // Save note into Supabase by mutating the routine exercises array
  async function saveNote(day, exIndex, val) {
    if (!selectedAthlete?.athlete_id || !routine) return;
    setSavingNote(true);
    try {
      const updated = JSON.parse(JSON.stringify(routine));
      const exercises = updated[day]?.exercises || [];
      const ex = exercises[exIndex];
      const name = typeof ex === "string" ? ex : ex.name;
      exercises[exIndex] = { ...(typeof ex === "object" && ex ? ex : {}), name, coachNote: val.trim() };
      updated[day] = { ...updated[day], exercises };
      await saveRoutine(selectedAthlete.athlete_id, updated);
      // Optimistically update only the routine field — don't disturb selectedAthlete.
      // setAthleteCache is (id, data) => ...; passing a reducer here silently no-ops.
      const athleteId = selectedAthlete.athlete_id;
      setAthleteCache?.(athleteId, { ...(athleteData || {}), routine: updated });
      setEditingNote(null);
      setNoteText("");
      setNoteToast({ type: "success", message: val.trim() ? "Note synced to athlete" : "Note removed" });
      try { Haptics.impact({ style: "light" }); } catch {}
    } catch (e) {
      console.error("Failed to save coach note:", e);
      setNoteToast({ type: "error", message: "Couldn't sync — try again" });
    } finally {
      setSavingNote(false);
    }
  }

  if (!selectedAthlete) return (
    <CoachAthletePickerList coachLinks={coachLinks} coachLinksLoaded={coachLinksLoaded} onSelect={setSelectedAthlete}
      label="Select an athlete to view their routine" authUserId={authUser?.id}/>
  );

  return (
    <div style={{ padding: "20px 16px 0" }}>
      <div style={{ marginBottom: "20px" }}>
        <div style={{ fontSize: "20px", fontWeight: 800, color: TX }}>Routines</div>
        <div style={{ fontSize: "12px", color: A, marginTop: "2px" }}>{athleteName}</div>
      </div>

      {/* Note save toast */}
      {noteToast && (
        <div style={{
          position: "fixed", left: "50%", bottom: "84px", transform: "translateX(-50%)",
          background: noteToast.type === "success" ? A : SEVERITY_COLORS.urgent,
          color: BG, padding: "10px 16px", borderRadius: "10px",
          fontSize: "13px", fontWeight: 700, zIndex: 300,
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          animation: "fadeIn 0.2s ease",
        }}>
          {noteToast.message}
        </div>
      )}

      {loadingAthlete ? (
        <div style={{ textAlign: "center", color: SB, padding: "48px 0" }}>
          <div style={{ width: "28px", height: "28px", borderRadius: "50%", border: `3px solid ${MT}`, borderTopColor: A, animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }}/>
          Loading routine…
        </div>
      ) : !routine || allDays.length === 0 ? (
        <div style={{ textAlign: "center", color: SB, padding: "48px 0", fontSize: "14px" }}>No routine found for {athleteName}.</div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            {/* Day tabs */}
            <div style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "4px" }}>
              {allDays.map(d => {
                const isRest = routine[d]?.type === "Rest";
                return (
                  <button key={d} onClick={() => setActiveDay(d)} style={{
                    padding: "7px 14px", borderRadius: "20px", border: "none", cursor: "pointer",
                    flexShrink: 0, fontSize: "12px", fontWeight: 600,
                    background: activeDay === d ? A : S2,
                    color: activeDay === d ? BG : isRest ? SB : TX,
                  }}>
                    {d}
                  </button>
                );
              })}
            </div>
            
            <button
              onClick={() => setCoachAthleteView({ name: athleteName, routine, history: athleteData?.history, weights: athleteData?.weights, measurements: athleteData?.measurements })}
              style={{ padding: "6px 12px", background: S2, color: TX, border: `1px solid ${BD}`, borderRadius: "14px", fontSize: "12px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ fontSize: "14px", color: A }}>✎</span> Edit
            </button>
          </div>

          {coachAthleteView && (
            <AthleteView
              athleteView={coachAthleteView}
              setAthleteView={setCoachAthleteView}
              athleteId={selectedAthlete?.athlete_id}
              todayDay={getToday()}
              onRoutineUpdated={(newRoutine) => {
                // Not strictly needed to update locally if realtime channel fires, 
                // but we can update coachAthleteView to keep builder in sync
                setCoachAthleteView(p => p ? { ...p, routine: newRoutine } : null);
              }}
            />
          )}

          {/* Day type badge */}
          {routine[activeDay] && (
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
              <div style={{ background: `${TYPE_COLORS[routine[activeDay].type] || A}15`, borderRadius: "8px", padding: "5px 12px", fontSize: "13px", fontWeight: 700, color: TYPE_COLORS[routine[activeDay].type] || A }}>
                {routine[activeDay].type}
              </div>
              <div style={{ fontSize: "12px", color: SB }}>{routine[activeDay].exercises?.length || 0} exercises</div>
            </div>
          )}

          {/* Exercise list */}
          {routine[activeDay]?.type === "Rest" ? (
            <div style={{ textAlign: "center", color: SB, padding: "32px 0", fontSize: "14px" }}>Rest day 😴</div>
          ) : !routine[activeDay]?.exercises?.length ? (
            <div style={{ textAlign: "center", color: SB, padding: "32px 0", fontSize: "14px" }}>No exercises on this day.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {routine[activeDay].exercises.map((exItem, i) => {
                const exName = typeof exItem === "object" && exItem !== null ? exItem.name : exItem;
                const existingNote = getNoteFromEx(exItem);
                const isEditingThis = editingNote?.day === activeDay && editingNote?.exIndex === i;
                return (
                  <div key={i} style={{ background: S2, borderRadius: "14px", padding: "14px 16px", border: `1px solid ${existingNote ? A+"22" : BD}` }}>
                    {/* Exercise name + index */}
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                      <div style={{ width: "26px", height: "26px", borderRadius: "8px", background: `${A}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <span style={{ fontSize: "11px", fontWeight: 800, color: A }}>{i + 1}</span>
                      </div>
                      <div style={{ fontSize: "15px", fontWeight: 700, color: TX, flex: 1 }}>{exName}</div>
                      {existingNote && <span style={{ fontSize: "10px", background: `${A}15`, color: A, borderRadius: "4px", padding: "2px 6px", fontWeight: 700, letterSpacing: "0.04em" }}>NOTE</span>}
                    </div>

                    {/* Coach note edit area */}
                    {isEditingThis ? (
                      <div>
                        <textarea
                          value={noteText}
                          onChange={e => setNoteText(e.target.value)}
                          autoFocus
                          placeholder="e.g. Breathe out when you lift, breathe in on the way down. Take 2 min rest."
                          rows={3}
                          style={{ width: "100%", background: S1, border: `1px solid ${A}55`, borderRadius: "10px", padding: "10px 12px", color: TX, fontSize: "13px", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit", lineHeight: 1.5 }}
                        />
                        <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                          <button
                            disabled={savingNote}
                            onClick={() => saveNote(activeDay, i, noteText)}
                            style={{ flex: 1, padding: "10px", background: A, color: BG, border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: savingNote ? "wait" : "pointer", opacity: savingNote ? 0.7 : 1 }}>
                            {savingNote ? "Saving…" : "Save & Sync to Athlete"}
                          </button>
                          <button onClick={() => { setEditingNote(null); setNoteText(""); }} style={{ padding: "10px 14px", background: MT, color: TX, border: "none", borderRadius: "8px", fontSize: "13px", cursor: "pointer" }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setEditingNote({ day: activeDay, exIndex: i })}
                        style={{ width: "100%", textAlign: "left", background: existingNote ? `${A}08` : S1, border: `1px dashed ${existingNote ? A+"44" : BD}`, borderRadius: "10px", padding: "10px 12px", color: existingNote ? TX : SB, fontSize: "13px", cursor: "pointer", lineHeight: 1.5 }}>
                        {existingNote || "＋ Add coaching note for athlete…"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// COACH: BODY TAB
// ─────────────────────────────────────────────
function CoachBodyTab({ authUser, selectedAthlete, setSelectedAthlete, coachLinks, coachLinksLoaded, athleteData, loadingAthlete }) {
  const athleteName = selectedAthlete?.athlete_name || "Athlete";
  const weights = athleteData?.weights || [];       // BodyWeightEntry[]: { id, date, weight }
  const measurements = athleteData?.measurements || []; // MeasurementEntry[]: { id, date, chest?, waist?, ... }
  const athleteProfile = athleteData?.profile;       // { height_cm, unit_system }

  const latest = weights[0];
  const prev = weights[1];
  const delta = latest && prev ? (latest.weight - prev.weight).toFixed(1) : null;
  const bmi = latest && athleteProfile?.height_cm
    ? computeBMI(latest.weight, athleteProfile.height_cm, athleteProfile.unit_system)
    : null;
  const bmiCat = bmiCategory(bmi);
  const weightUnit = athleteProfile?.unit_system === "metric" ? "kg" : "lbs";

  if (!selectedAthlete) return (
    <CoachAthletePickerList coachLinks={coachLinks} coachLinksLoaded={coachLinksLoaded} onSelect={setSelectedAthlete}
      label="Select an athlete to view body data" authUserId={authUser?.id}/>
  );

  return (
    <div style={{ padding: "20px 16px 0" }}>
      <div style={{ marginBottom: "20px" }}>
        <div style={{ fontSize: "20px", fontWeight: 800, color: TX }}>Body</div>
        <div style={{ fontSize: "12px", color: A, marginTop: "2px" }}>{athleteName}</div>
      </div>

      {loadingAthlete ? (
        <div style={{ textAlign: "center", color: SB, padding: "48px 0" }}>
          <div style={{ width: "28px", height: "28px", borderRadius: "50%", border: `3px solid ${MT}`, borderTopColor: A, animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }}/>
          Loading…
        </div>
      ) : (
        <>
          {/* Weight + BMI row */}
          <div style={{ display: "flex", gap: "12px", marginBottom: "14px", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 220px", background: S2, borderRadius: "16px", padding: "18px", border: `1px solid ${BD}` }}>
              <div style={{ fontSize: "11px", color: SB, letterSpacing: "0.07em", marginBottom: "10px" }}>BODY WEIGHT</div>
              {latest ? (
                <div style={{ display: "flex", alignItems: "flex-end", gap: "12px" }}>
                  <div style={{ fontSize: "38px", fontWeight: 800, color: TX, lineHeight: 1 }}>
                    {latest.weight}
                    <span style={{ fontSize: "15px", color: SB, fontWeight: 400, marginLeft: "4px" }}>{weightUnit}</span>
                  </div>
                  {delta !== null && (
                    <div style={{ fontSize: "14px", fontWeight: 700, color: Number(delta) > 0 ? SEVERITY_COLORS.urgent : A, marginBottom: "4px" }}>
                      {Number(delta) > 0 ? "↑" : "↓"}{Math.abs(Number(delta))}
                    </div>
                  )}
                  <div style={{ marginLeft: "auto", fontSize: "12px", color: SB }}>
                    {new Date(latest.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                </div>
              ) : (
                <div style={{ color: SB, fontSize: "14px" }}>No weight logged yet</div>
              )}
            </div>

            {/* BMI card — only shows when we have both height and weight */}
            <div style={{ flex: "1 1 160px", background: S2, borderRadius: "16px", padding: "18px", border: `1px solid ${BD}` }}>
              <div style={{ fontSize: "11px", color: SB, letterSpacing: "0.07em", marginBottom: "10px" }}>BMI</div>
              {bmi != null ? (
                <div style={{ display: "flex", alignItems: "flex-end", gap: "10px" }}>
                  <div style={{ fontSize: "38px", fontWeight: 800, color: bmiCat.color, lineHeight: 1, letterSpacing: "-0.02em" }}>
                    {bmi}
                  </div>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: bmiCat.color, marginBottom: "6px", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                    {bmiCat.label}
                  </div>
                </div>
              ) : (
                <div style={{ color: SB, fontSize: "13px", lineHeight: 1.5 }}>
                  {athleteProfile?.height_cm ? "No weight logged yet" : "Awaiting height from athlete"}
                </div>
              )}
            </div>
          </div>

          {/* Weight history mini chart */}
          {weights.length > 1 && (
            <div style={{ background: S2, borderRadius: "16px", padding: "16px", border: `1px solid ${BD}`, marginBottom: "14px" }}>
              <div style={{ fontSize: "11px", color: SB, letterSpacing: "0.07em", marginBottom: "12px" }}>WEIGHT HISTORY</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {weights.slice(0, 8).map((bw, i) => (
                  <div key={bw.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: "13px", color: SB }}>
                      {new Date(bw.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      {i > 0 && (() => {
                        const diff = (bw.weight - weights[i - 1].weight).toFixed(1);
                        return <div style={{ fontSize: "11px", color: Number(diff) > 0 ? RED : A }}>{Number(diff) > 0 ? "+" : ""}{diff}</div>;
                      })()}
                      <div style={{ fontSize: "15px", fontWeight: 700, color: i === 0 ? A : TX }}>{bw.weight} lbs</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Latest measurements */}
          {measurements.length > 0 && (() => {
            const m = measurements[0];
            const fields = [
              ["chest", "Chest"],["waist", "Waist"],["hips", "Hips"],
              ["lArm", "L Arm"],["rArm", "R Arm"],["lThigh", "L Thigh"],["rThigh", "R Thigh"],["calves", "Calves"],
            ];
            const filled = fields.filter(([k]) => m[k] != null);
            if (!filled.length) return null;
            return (
              <div style={{ background: S2, borderRadius: "16px", padding: "16px", border: `1px solid ${BD}` }}>
                <div style={{ fontSize: "11px", color: SB, letterSpacing: "0.07em", marginBottom: "12px" }}>
                  MEASUREMENTS · {new Date(m.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  {filled.map(([k, label]) => (
                    <div key={k} style={{ background: S1, borderRadius: "10px", padding: "10px 12px" }}>
                      <div style={{ fontSize: "10px", color: SB, marginBottom: "3px", letterSpacing: "0.04em" }}>{label.toUpperCase()}</div>
                      <div style={{ fontSize: "17px", fontWeight: 700, color: TX }}>
                        {m[k]}<span style={{ fontSize: "11px", color: SB, marginLeft: "2px" }}>in</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {weights.length === 0 && measurements.length === 0 && (
            <div style={{ textAlign: "center", color: SB, padding: "32px 0", fontSize: "14px" }}>No body data logged yet.</div>
          )}
        </>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// COACH: PAYMENTS TAB
// ═════════════════════════════════════════════════════════════════════════
// Manual payment tracker — NOT a processor. Coach logs what athletes have
// paid them; per-athlete fees drive the "expected" / "outstanding" math. No
// money moves. Fees + payments are pulled from Supabase on mount; optimistic
// updates on save/delete for instant-feeling UI.
function CoachPaymentsTab({ authUser, profile, coachLinks, coachLinksLoaded }) {
  const [fees, setFees] = React.useState([]);
  const [payments, setPayments] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState("all"); // all | overdue | due | paid
  const [addingPayment, setAddingPayment] = React.useState(false);
  const [editingFeeFor, setEditingFeeFor] = React.useState(null); // athlete link row
  const [historyFor, setHistoryFor] = React.useState(null); // athlete link row
  const [toast, setToast] = React.useState(null);

  const defaultCurrency = profile?.default_currency || "USD";

  // Initial load — fees and payments fetched in parallel on mount / coach switch.
  React.useEffect(() => {
    if (!authUser?.id) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([loadClientFees(authUser.id), loadPayments(authUser.id)])
      .then(([f, p]) => {
        if (cancelled) return;
        setFees(f);
        setPayments(p);
        setLoading(false);
      })
      .catch(e => {
        if (cancelled) return;
        setLoading(false);
        setToast({ type: "error", message: `Load failed: ${e.message}` });
      });
    return () => { cancelled = true; };
  }, [authUser?.id]);

  // Auto-dismiss toasts
  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const myAthletes = React.useMemo(
    () => coachLinks.filter(l => l.coach_id === authUser?.id && l.status === "accepted"),
    [coachLinks, authUser?.id]
  );

  const summary = React.useMemo(
    () => computeMonthlySummary(fees, payments),
    [fees, payments]
  );

  // Per-athlete rows — compute fee + payments + status once per render.
  const rows = React.useMemo(() => {
    return myAthletes.map(link => {
      const fee = fees.find(f => f.athlete_id === link.athlete_id) || null;
      const athletePayments = payments.filter(p => p.athlete_id === link.athlete_id);
      const status = athletePaymentStatus(fee, athletePayments);
      return { link, fee, payments: athletePayments, status };
    });
  }, [myAthletes, fees, payments]);

  const visibleRows = filter === "all" ? rows : rows.filter(r => r.status.status === filter);
  const overdueCount = rows.filter(r => r.status.status === "overdue").length;

  // Handlers — optimistic updates so UI feels instant even on slow network.
  async function handleSavePayment({ athleteId, amount, currency, receivedDate, notes }) {
    try {
      const saved = await savePayment(authUser.id, athleteId, {
        amount, currency, received_date: receivedDate, notes: notes || null,
      });
      setPayments(p => [saved, ...p]);
      setToast({ type: "success", message: "Payment logged" });
      try { Haptics.impact({ style: "light" }); } catch {}
    } catch (e) {
      setToast({ type: "error", message: `Save failed: ${e.message}` });
    }
  }

  async function handleSaveFee({ athleteId, amount, currency, cadence, startDate, active, notes }) {
    try {
      const saved = await upsertClientFee(authUser.id, athleteId, {
        amount, currency, cadence, start_date: startDate, active, notes,
      });
      setFees(f => {
        const others = f.filter(x => !(x.coach_id === saved.coach_id && x.athlete_id === saved.athlete_id));
        return [...others, saved];
      });
      setToast({ type: "success", message: "Fee updated" });
    } catch (e) {
      setToast({ type: "error", message: `Save failed: ${e.message}` });
    }
  }

  async function handleDeleteFee(feeId) {
    try {
      await deleteClientFee(feeId);
      setFees(f => f.filter(x => x.id !== feeId));
      setToast({ type: "success", message: "Fee removed" });
    } catch (e) {
      setToast({ type: "error", message: `Delete failed: ${e.message}` });
    }
  }

  async function handleDeletePayment(id) {
    try {
      await deletePayment(id);
      setPayments(p => p.filter(x => x.id !== id));
      setToast({ type: "success", message: "Payment removed" });
    } catch (e) {
      setToast({ type: "error", message: `Delete failed: ${e.message}` });
    }
  }

  if (!coachLinksLoaded || loading) {
    return (
      <div style={{ padding: "20px 16px", textAlign: "center", color: SB, paddingTop: "48px" }}>
        <div style={{ width: "28px", height: "28px", borderRadius: "50%", border: `3px solid ${MT}`, borderTopColor: A, animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }}/>
        Loading payments…
      </div>
    );
  }

  if (myAthletes.length === 0) {
    return (
      <div style={{ padding: "40px 24px", textAlign: "center", color: SB }}>
        <div style={{ fontSize: "20px", fontWeight: 800, color: TX, marginBottom: "8px" }}>Payments</div>
        <div style={{ fontSize: "14px", lineHeight: 1.55 }}>
          Connect athletes to start tracking payments. Use Connections in your profile menu.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 16px 100px" }}>
      <div style={{ marginBottom: "18px" }}>
        <div style={{ fontSize: "20px", fontWeight: 800, color: TX }}>Payments</div>
        <div style={{ fontSize: "12px", color: SB, marginTop: "2px" }}>Track what athletes have paid you this month.</div>
      </div>

      {/* Monthly summary — three tiles. Received, Expected, Outstanding. */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "18px" }}>
        {[
          { label: "Received", value: summary.receivedThisMonth, color: A },
          { label: "Expected", value: summary.expectedThisMonth, color: TX },
          { label: "Outstanding", value: summary.outstanding, color: summary.outstanding > 0.01 ? SEVERITY_COLORS.urgent : SB },
        ].map(t => (
          <div key={t.label} style={{
            flex: 1, background: S2, border: `1px solid ${BD}`, borderRadius: "14px",
            padding: "14px 12px", minWidth: 0,
          }}>
            <div style={{ fontSize: "9px", color: SB, letterSpacing: "0.06em", fontWeight: 700, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {t.label}
            </div>
            <div style={{ fontSize: "17px", fontWeight: 800, color: t.color, marginTop: "4px", letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {fmtMoney(t.value, defaultCurrency)}
            </div>
          </div>
        ))}
      </div>

      {/* Overdue banner — only when there's something to act on. */}
      {overdueCount > 0 && filter !== "overdue" && (
        <div style={{ background: `${SEVERITY_COLORS.urgent}12`, border: `1px solid ${SEVERITY_COLORS.urgent}44`, borderRadius: "12px", padding: "12px 14px", marginBottom: "14px", display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ fontSize: "13px", color: TX, flex: 1, lineHeight: 1.45 }}>
            <strong style={{ color: SEVERITY_COLORS.urgent }}>{overdueCount}</strong> {overdueCount === 1 ? "athlete is" : "athletes are"} overdue this cycle.
          </div>
          <button onClick={() => setFilter("overdue")}
            style={{ fontSize: "11px", color: SEVERITY_COLORS.urgent, background: "transparent", border: `1px solid ${SEVERITY_COLORS.urgent}`, borderRadius: "8px", padding: "5px 12px", fontWeight: 700, cursor: "pointer" }}>
            View
          </button>
        </div>
      )}

      {/* Filter pills */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "14px", overflowX: "auto" }}>
        {[
          { key: "all", label: "All" },
          { key: "overdue", label: "Overdue" },
          { key: "due", label: "Due" },
          { key: "paid", label: "Paid" },
        ].map(p => (
          <button key={p.key} onClick={() => setFilter(p.key)} style={{
            flexShrink: 0, background: filter === p.key ? A : S2, color: filter === p.key ? BG : SB,
            border: "none", borderRadius: "18px", padding: "6px 14px", fontSize: "12px", fontWeight: 600, cursor: "pointer",
          }}>{p.label}</button>
        ))}
      </div>

      {/* Rows */}
      {visibleRows.length === 0 ? (
        <div style={{ textAlign: "center", color: SB, padding: "36px 0", fontSize: "14px" }}>
          No athletes match this filter.
        </div>
      ) : visibleRows.map(r => (
        <AthletePaymentRow
          key={r.link.id}
          row={r}
          defaultCurrency={defaultCurrency}
          onSetFee={() => setEditingFeeFor(r.link)}
          onViewHistory={() => setHistoryFor(r.link)}
          onQuickLog={() => { setAddingPayment({ link: r.link, fee: r.fee }); }}
        />
      ))}

      {/* Floating Add button */}
      <button
        onClick={() => setAddingPayment({ link: null, fee: null })}
        aria-label="Log payment"
        style={{
          position: "fixed", bottom: Capacitor.getPlatform() === "web" ? "28px" : "88px", right: "20px",
          width: "56px", height: "56px", borderRadius: "50%",
          background: A, color: BG, border: "none",
          fontSize: "30px", fontWeight: 300, cursor: "pointer",
          boxShadow: `0 10px 28px ${A}55`,
          zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
        }}
      >+</button>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", left: "50%", bottom: "100px", transform: "translateX(-50%)",
          background: toast.type === "success" ? A : SEVERITY_COLORS.urgent,
          color: BG, padding: "10px 16px", borderRadius: "10px",
          fontSize: "13px", fontWeight: 700, zIndex: 300,
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}>{toast.message}</div>
      )}

      {/* Modals */}
      {addingPayment && (
        <AddPaymentSheet
          myAthletes={myAthletes}
          preselected={addingPayment.link}
          preselectedFee={addingPayment.fee}
          defaultCurrency={defaultCurrency}
          existingFees={fees}
          onClose={() => setAddingPayment(false)}
          onSave={async (data) => {
            await handleSavePayment(data);
            setAddingPayment(false);
          }}
        />
      )}
      {editingFeeFor && (
        <FeeEditorSheet
          link={editingFeeFor}
          existingFee={fees.find(f => f.athlete_id === editingFeeFor.athlete_id) || null}
          defaultCurrency={defaultCurrency}
          onClose={() => setEditingFeeFor(null)}
          onSave={async (data) => { await handleSaveFee(data); setEditingFeeFor(null); }}
          onDelete={async (feeId) => { await handleDeleteFee(feeId); setEditingFeeFor(null); }}
        />
      )}
      {historyFor && (
        <PaymentHistorySheet
          link={historyFor}
          payments={payments.filter(p => p.athlete_id === historyFor.athlete_id)}
          onClose={() => setHistoryFor(null)}
          onDelete={handleDeletePayment}
        />
      )}
    </div>
  );
}

// ── Row: one athlete, one card. Shows fee, status, last payment, actions.
function AthletePaymentRow({ row, defaultCurrency, onSetFee, onViewHistory, onQuickLog }) {
  const { link, fee, status } = row;
  const currency = fee?.currency || defaultCurrency;
  const statusColor =
    status.status === "paid"    ? A :
    status.status === "overdue" ? SEVERITY_COLORS.urgent :
    status.status === "due"     ? SEVERITY_COLORS.warn :
    SB;

  const cadenceLabel = fee ? ({ weekly: "/wk", monthly: "/mo", quarterly: "/qtr", yearly: "/yr" }[fee.cadence] || "") : "";

  return (
    <div
      onClick={onViewHistory}
      className="press-scale"
      style={{
        background: S2, border: `1px solid ${BD}`, borderRadius: "14px",
        padding: "14px 16px", marginBottom: "10px", cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{
          width: "34px", height: "34px", borderRadius: "50%",
          background: S1, border: `1px solid ${MT}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "13px", fontWeight: 700, color: A, flexShrink: 0,
        }}>
          {link.athlete_name?.[0]?.toUpperCase() || "?"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "15px", fontWeight: 600, color: TX, letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {link.athlete_name}
          </div>
          <div style={{ fontSize: "12px", color: SB, marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {fee
              ? <>{fmtMoney(fee.amount, currency)}{cadenceLabel}{status.lastPayment ? ` · Last: ${fmtMoney(status.lastPayment.amount, status.lastPayment.currency)} ${new Date(status.lastPayment.received_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : " · No payment yet"}</>
              : "No fee set"}
          </div>
        </div>
        <span style={{
          fontSize: "10px", fontWeight: 700, letterSpacing: "0.04em",
          color: statusColor, border: `1px solid ${statusColor}55`,
          padding: "3px 9px", borderRadius: "10px",
          textTransform: "uppercase", flexShrink: 0,
        }}>
          {status.label}
        </span>
      </div>

      {/* Action links — click-swallowed from the row tap */}
      <div style={{ display: "flex", gap: "8px", marginTop: "10px", paddingLeft: "46px" }} onClick={e => e.stopPropagation()}>
        <button onClick={onQuickLog} className="press-scale"
          style={{ fontSize: "11px", color: A, background: `${A}12`, border: `1px solid ${A}44`, borderRadius: "8px", padding: "5px 10px", fontWeight: 700, cursor: "pointer" }}>
          + Log payment
        </button>
        <button onClick={onSetFee} className="press-scale"
          style={{ fontSize: "11px", color: SB, background: "transparent", border: `1px solid ${MT}`, borderRadius: "8px", padding: "5px 10px", fontWeight: 600, cursor: "pointer" }}>
          {fee ? "Edit fee" : "Set fee"}
        </button>
      </div>
    </div>
  );
}

// ── Shared drawer wrapper — bottom sheet on all platforms.
function BottomSheet({ children, onClose, title }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 310, background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)",
          width: "100%", maxWidth: 480,
          background: S1, borderRadius: "20px 20px 0 0",
          padding: "22px 20px 32px",
          animation: "drawerUp 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)",
          maxHeight: "85vh", overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div style={{ fontSize: "15px", fontWeight: 700, color: TX }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: SB, fontSize: "14px", fontWeight: 700, cursor: "pointer" }}>Dismiss</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Add-payment sheet: pick athlete, amount, date, currency, notes.
function AddPaymentSheet({ myAthletes, preselected, preselectedFee, defaultCurrency, existingFees, onClose, onSave }) {
  const [athleteId, setAthleteId] = React.useState(preselected?.athlete_id || "");
  const [amount, setAmount] = React.useState(preselectedFee ? String(preselectedFee.amount) : "");
  const [currency, setCurrency] = React.useState(preselectedFee?.currency || defaultCurrency);
  const [receivedDate, setReceivedDate] = React.useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  // When athlete changes, auto-fill amount/currency from their fee if set.
  React.useEffect(() => {
    if (!athleteId) return;
    const fee = existingFees.find(f => f.athlete_id === athleteId);
    if (fee) {
      if (!amount) setAmount(String(fee.amount));
      setCurrency(fee.currency || defaultCurrency);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId]);

  const amt = parseFloat(amount);
  const canSubmit = athleteId && !isNaN(amt) && amt >= 0 && !saving;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await onSave({ athleteId, amount: amt, currency, receivedDate, notes });
    } finally {
      setSaving(false);
    }
  }

  const inputBase = {
    width: "100%", background: S2, border: `1px solid ${BD}`,
    borderRadius: "10px", padding: "11px 13px", color: TX, fontSize: "15px",
    boxSizing: "border-box", outline: "none",
  };
  const labelStyle = { fontSize: "10px", fontWeight: 700, color: SB, marginBottom: "6px", letterSpacing: "0.06em", textTransform: "uppercase" };

  return (
    <BottomSheet title="Log payment" onClose={onClose}>
      <div style={{ marginBottom: "12px" }}>
        <div style={labelStyle}>Athlete</div>
        <select value={athleteId} onChange={e => setAthleteId(e.target.value)} style={inputBase}>
          <option value="">Select an athlete…</option>
          {myAthletes.map(a => <option key={a.id} value={a.athlete_id}>{a.athlete_name}</option>)}
        </select>
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
        <div style={{ flex: 2 }}>
          <div style={labelStyle}>Amount</div>
          <input type="number" step="0.01" inputMode="decimal" placeholder="0.00"
            value={amount} onChange={e => setAmount(e.target.value)} style={inputBase}/>
        </div>
        <div style={{ flex: 1 }}>
          <div style={labelStyle}>Currency</div>
          <select value={currency} onChange={e => setCurrency(e.target.value)} style={inputBase}>
            {SUPPORTED_CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: "12px" }}>
        <div style={labelStyle}>Received</div>
        <input type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)} style={inputBase}/>
      </div>

      <div style={{ marginBottom: "16px" }}>
        <div style={labelStyle}>Notes (optional)</div>
        <input type="text" placeholder="e.g. April monthly, bank transfer" value={notes} onChange={e => setNotes(e.target.value)} style={inputBase}/>
      </div>

      <button onClick={handleSubmit} disabled={!canSubmit}
        style={{ width: "100%", background: A, color: BG, border: "none", borderRadius: "12px", padding: "14px", fontSize: "15px", fontWeight: 700, opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? "pointer" : "default" }}>
        {saving ? "Saving…" : "Save payment"}
      </button>
    </BottomSheet>
  );
}

// ── Fee editor: amount + currency + cadence + start date + active.
function FeeEditorSheet({ link, existingFee, defaultCurrency, onClose, onSave, onDelete }) {
  const [amount, setAmount] = React.useState(existingFee ? String(existingFee.amount) : "");
  const [currency, setCurrency] = React.useState(existingFee?.currency || defaultCurrency);
  const [cadence, setCadence] = React.useState(existingFee?.cadence || "monthly");
  const [startDate, setStartDate] = React.useState(existingFee?.start_date || new Date().toISOString().split("T")[0]);
  const [active, setActive] = React.useState(existingFee ? existingFee.active : true);
  const [saving, setSaving] = React.useState(false);

  const amt = parseFloat(amount);
  const canSubmit = !isNaN(amt) && amt >= 0 && !saving;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await onSave({ athleteId: link.athlete_id, amount: amt, currency, cadence, startDate, active, notes: null });
    } finally { setSaving(false); }
  }

  const inputBase = {
    width: "100%", background: S2, border: `1px solid ${BD}`,
    borderRadius: "10px", padding: "11px 13px", color: TX, fontSize: "15px",
    boxSizing: "border-box", outline: "none",
  };
  const labelStyle = { fontSize: "10px", fontWeight: 700, color: SB, marginBottom: "6px", letterSpacing: "0.06em", textTransform: "uppercase" };

  return (
    <BottomSheet title={existingFee ? `Fee · ${link.athlete_name}` : `Set fee · ${link.athlete_name}`} onClose={onClose}>
      <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
        <div style={{ flex: 2 }}>
          <div style={labelStyle}>Amount</div>
          <input type="number" step="0.01" inputMode="decimal" placeholder="0.00"
            value={amount} onChange={e => setAmount(e.target.value)} style={inputBase}/>
        </div>
        <div style={{ flex: 1 }}>
          <div style={labelStyle}>Currency</div>
          <select value={currency} onChange={e => setCurrency(e.target.value)} style={inputBase}>
            {SUPPORTED_CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: "12px" }}>
        <div style={labelStyle}>Cadence</div>
        <div style={{ display: "flex", gap: "6px" }}>
          {["weekly", "monthly", "quarterly", "yearly"].map(c => (
            <button key={c} onClick={() => setCadence(c)}
              style={{ flex: 1, background: cadence === c ? A : S2, color: cadence === c ? BG : SB, border: `1px solid ${cadence === c ? A : BD}`, borderRadius: "8px", padding: "8px 4px", fontSize: "11px", fontWeight: 700, cursor: "pointer", textTransform: "capitalize" }}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: "12px" }}>
        <div style={labelStyle}>Starts</div>
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputBase}/>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px", padding: "10px", background: S2, borderRadius: "10px", border: `1px solid ${BD}`, cursor: "pointer" }}>
        <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)}
          style={{ width: "18px", height: "18px", accentColor: A }}/>
        <div style={{ fontSize: "13px", color: TX }}>Active — include in "Expected" and overdue checks</div>
      </label>

      <button onClick={handleSubmit} disabled={!canSubmit}
        style={{ width: "100%", background: A, color: BG, border: "none", borderRadius: "12px", padding: "14px", fontSize: "15px", fontWeight: 700, opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? "pointer" : "default", marginBottom: existingFee ? "8px" : 0 }}>
        {saving ? "Saving…" : existingFee ? "Update fee" : "Set fee"}
      </button>

      {existingFee && (
        <button onClick={() => onDelete(existingFee.id)}
          style={{ width: "100%", background: "none", color: SEVERITY_COLORS.urgent, border: `1px solid ${SEVERITY_COLORS.urgent}55`, borderRadius: "12px", padding: "12px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
          Remove fee
        </button>
      )}
    </BottomSheet>
  );
}

// ── History: all payments for one athlete, newest first; row-tap = delete.
function PaymentHistorySheet({ link, payments, onClose, onDelete }) {
  return (
    <BottomSheet title={`${link.athlete_name} · Payments`} onClose={onClose}>
      {payments.length === 0 ? (
        <div style={{ textAlign: "center", color: SB, padding: "24px 0", fontSize: "14px" }}>No payments logged yet.</div>
      ) : payments.map(p => (
        <div key={p.id} style={{
          display: "flex", alignItems: "center", gap: "12px",
          padding: "12px", background: S2, borderRadius: "10px",
          border: `1px solid ${BD}`, marginBottom: "8px",
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "15px", fontWeight: 700, color: TX, letterSpacing: "-0.01em" }}>
              {fmtMoney(p.amount, p.currency)}
            </div>
            <div style={{ fontSize: "12px", color: SB, marginTop: "2px" }}>
              {new Date(p.received_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              {p.notes ? ` · ${p.notes}` : ""}
            </div>
          </div>
          <button onClick={() => { if (confirm("Remove this payment?")) onDelete(p.id); }}
            style={{ background: "transparent", border: `1px solid ${MT}`, borderRadius: "8px", color: SB, fontSize: "11px", padding: "5px 10px", cursor: "pointer" }}>
            Remove
          </button>
        </div>
      ))}
    </BottomSheet>
  );
}

// ─────────────────────────────────────────────
// COACH: PROGRESS TAB
// ─────────────────────────────────────────────
function CoachProgressTab({ authUser, selectedAthlete, setSelectedAthlete, coachLinks, coachLinksLoaded, athleteData, loadingAthlete }) {
  const athleteName = selectedAthlete?.athlete_name || "Athlete";
  const history = athleteData?.history || []; // WorkoutHistoryEntry[]
  const [drawerSession, setDrawerSession] = React.useState(null);

  // Streak: count consecutive days with at least one workout
  const streak = React.useMemo(() => {
    if (!history.length) return 0;
    const datesSet = new Set(history.map(h => h.date));
    let count = 0;
    const today = new Date();
    for (let i = 0; i < 60; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      if (datesSet.has(key)) { count++; }
      else if (i > 0) break;
    }
    return count;
  }, [history]);

  if (!selectedAthlete) return (
    <CoachAthletePickerList coachLinks={coachLinks} coachLinksLoaded={coachLinksLoaded} onSelect={setSelectedAthlete}
      label="Select an athlete to view progress" authUserId={authUser?.id}/>
  );

  return (
    <div style={{ padding: "20px 16px 0" }}>
      <div style={{ marginBottom: "20px" }}>
        <div style={{ fontSize: "20px", fontWeight: 800, color: TX }}>Progress</div>
        <div style={{ fontSize: "12px", color: A, marginTop: "2px" }}>{athleteName}</div>
      </div>

      {loadingAthlete ? (
        <div style={{ textAlign: "center", color: SB, padding: "48px 0" }}>
          <div style={{ width: "28px", height: "28px", borderRadius: "50%", border: `3px solid ${MT}`, borderTopColor: A, animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }}/>
          Loading…
        </div>
      ) : (
        <>
          {/* Edge-lit KPI strip */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "14px",
          }}>
            {[
              { label: "Streak", value: `${streak}d`, accent: A },
              { label: "Sessions", value: history.length, accent: A },
              { label: "Total Sets", value: history.reduce((a, h) => a + (h.totalSets || 0), 0), accent: A },
            ].map(s => (
              <div key={s.label} style={{
                background: `linear-gradient(180deg, ${S2} 0%, ${S1} 100%)`,
                borderRadius: "14px",
                padding: "14px 10px",
                border: `1px solid ${BD}`,
                textAlign: "center",
                position: "relative",
                overflow: "hidden",
              }}>
                <div style={{
                  position: "absolute", top: 0, left: "12%", right: "12%",
                  height: "1px",
                  background: `linear-gradient(90deg, transparent, ${s.accent}, transparent)`,
                  opacity: 0.55,
                }}/>
                <div style={{ fontSize: "22px", fontWeight: 800, color: TX, lineHeight: 1.1, letterSpacing: "-0.01em" }}>{s.value}</div>
                <div style={{ fontSize: "9px", color: SB, marginTop: "4px", letterSpacing: "0.08em", fontWeight: 600 }}>{s.label.toUpperCase()}</div>
              </div>
            ))}
          </div>

          {/* Dashboard depth: heatmap, volume trend, PR timeline */}
          <AthleteAttendanceHeatmap
            history={history}
            onCellTap={(iso) => {
              const match = history.find(h => h.date === iso);
              if (match) setDrawerSession(match);
            }}
          />
          <AthleteVolumeChart history={history}/>
          <AthletePRTimeline history={history}/>

          {/* Recent workouts — tappable */}
          <div style={{ background: S2, borderRadius: "16px", padding: "16px", border: `1px solid ${BD}` }}>
            <div style={{ fontSize: "11px", color: SB, letterSpacing: "0.07em", marginBottom: "12px" }}>RECENT WORKOUTS</div>
            {history.length === 0 ? (
              <div style={{ color: SB, fontSize: "14px" }}>No workouts logged yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {history.slice(0, 10).map((h, i) => {
                  const mins = Math.round((h.duration || 0) / 60);
                  return (
                    <button
                      key={h.id}
                      className="row-btn press-scale"
                      onClick={() => setDrawerSession(h)}
                      style={{
                        display: "flex", alignItems: "center", gap: "12px",
                        padding: "12px 0",
                        background: "none", border: "none", cursor: "pointer",
                        borderBottom: i < Math.min(history.length, 10) - 1 ? `1px solid ${BD}` : "none",
                        textAlign: "left", width: "100%",
                        fontFamily: "inherit", color: "inherit",
                      }}
                    >
                      <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: A, flexShrink: 0 }}/>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "13px", color: TX, fontWeight: 600 }}>{h.type || "Workout"}</div>
                        <div style={{ fontSize: "11px", color: SB, marginTop: "2px" }}>
                          {new Date(h.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                          {" · "}{h.totalSets || 0} sets
                          {mins > 0 && ` · ${mins}m`}
                        </div>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={SB} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      <AthleteSessionDrawer session={drawerSession} onClose={() => setDrawerSession(null)}/>
    </div>
  );
}

// ─────────────────────────────────────────────
// COACH: RECORDS TAB
// ─────────────────────────────────────────────
function CoachRecordsTab({ authUser, selectedAthlete, setSelectedAthlete, coachLinks, coachLinksLoaded, athleteData, loadingAthlete }) {
  const athleteName = selectedAthlete?.athlete_name || "Athlete";
  const history = athleteData?.history || [];

  // Compute personal records from workout history (max weight per exercise)
  const records = React.useMemo(() => {
    const bests = {}; // { exerciseName: { weight, reps, date } }
    history.forEach(session => {
      session.exercises?.forEach(ex => {
        ex.sets?.forEach(set => {
          const w = parseFloat(set.w) || 0;
          const r = parseInt(set.r, 10) || 0;
          if (!w) return;
          if (!bests[ex.name] || w > bests[ex.name].weight || (w === bests[ex.name].weight && r > bests[ex.name].reps)) {
            bests[ex.name] = { weight: w, reps: r, date: session.date, type: session.type };
          }
        });
      });
    });
    return Object.entries(bests)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.weight - a.weight);
  }, [history]);

  // Group by workout type
  const grouped = React.useMemo(() => {
    const g = {};
    records.forEach(r => {
      const key = r.type || "Other";
      if (!g[key]) g[key] = [];
      g[key].push(r);
    });
    return g;
  }, [records]);

  if (!selectedAthlete) return (
    <CoachAthletePickerList coachLinks={coachLinks} coachLinksLoaded={coachLinksLoaded} onSelect={setSelectedAthlete}
      label="Select an athlete to view records" authUserId={authUser?.id}/>
  );

  return (
    <div style={{ padding: "20px 16px 0" }}>
      <div style={{ marginBottom: "20px" }}>
        <div style={{ fontSize: "20px", fontWeight: 800, color: TX }}>Records</div>
        <div style={{ fontSize: "12px", color: A, marginTop: "2px" }}>{athleteName}</div>
      </div>

      {loadingAthlete ? (
        <div style={{ textAlign: "center", color: SB, padding: "48px 0" }}>
          <div style={{ width: "28px", height: "28px", borderRadius: "50%", border: `3px solid ${MT}`, borderTopColor: A, animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }}/>
          Loading…
        </div>
      ) : records.length === 0 ? (
        <div style={{ textAlign: "center", color: SB, padding: "48px 0", fontSize: "14px" }}>
          {history.length === 0 ? "No workouts logged yet." : "No weighted sets found."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {Object.entries(grouped).map(([type, recs]) => (
            <div key={type}>
              <div style={{ fontSize: "11px", color: SB, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "8px" }}>{type}</div>
              <div style={{ background: S2, borderRadius: "16px", border: `1px solid ${BD}`, overflow: "hidden" }}>
                {recs.map((r, i) => (
                  <div key={r.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 16px", borderBottom: i < recs.length - 1 ? `1px solid ${BD}` : "none" }}>
                    <div style={{ flex: 1, marginRight: "12px" }}>
                      <div style={{ fontSize: "14px", fontWeight: 600, color: TX }}>{r.name}</div>
                      <div style={{ fontSize: "11px", color: SB, marginTop: "2px" }}>
                        {r.reps > 0 ? `${r.reps} reps · ` : ""}
                        {new Date(r.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "20px", fontWeight: 800, color: A, lineHeight: 1 }}>{r.weight}</div>
                      <div style={{ fontSize: "10px", color: SB }}>lbs</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// SHARED: ATHLETE PICKER LIST
// ─────────────────────────────────────────────
function CoachAthletePickerList({ coachLinks, coachLinksLoaded, onSelect, label, authUserId }) {
  const [query, setQuery] = React.useState("");
  const filtered = (authUserId
    ? coachLinks.filter(l => l.coach_id === authUserId && l.status === "accepted")
    : coachLinks
  );

  const q = query.trim().toLowerCase();
  const shown = q
    ? filtered.filter(l => (l.athlete_name || "").toLowerCase().includes(q))
    : filtered;

  const showSearch = filtered.length >= 5;

  return (
    <div style={{ padding: "20px 16px 0" }}>
      <div style={{ textAlign: "center", color: SB, fontSize: "13px", marginBottom: "20px" }}>{label}</div>
      {showSearch && (
        <div style={{ marginBottom: "14px" }}>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search athletes…"
            style={{
              width: "100%", boxSizing: "border-box",
              background: S2, border: `1px solid ${BD}`, borderRadius: "12px",
              padding: "12px 14px", color: TX, fontSize: "14px", outline: "none",
            }}
          />
        </div>
      )}
      {!coachLinksLoaded ? (
        <div style={{ textAlign: "center", color: SB, padding: "24px 0", fontSize: "14px" }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", color: SB, padding: "24px 0", fontSize: "14px" }}>No athletes connected yet.</div>
      ) : shown.length === 0 ? (
        <div style={{ textAlign: "center", color: SB, padding: "24px 0", fontSize: "14px" }}>No matches.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {shown.map(link => {
            const name = link.athlete_name || link.athlete_id?.slice(0, 8);
            return (
              <button key={link.id} className="row-btn press-scale" onClick={() => onSelect(link)} style={{
                background: S2, border: `1px solid ${BD}`, borderRadius: "14px",
                padding: "14px 16px", display: "flex", alignItems: "center", gap: "14px",
                cursor: "pointer", width: "100%", textAlign: "left",
                fontFamily: "inherit", color: "inherit",
              }}>
                <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: A, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: "16px", fontWeight: 800, color: BG }}>{name?.[0]?.toUpperCase() || "?"}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "15px", fontWeight: 700, color: TX }}>{name}</div>
                  {link.athlete_code && <div style={{ fontSize: "12px", color: SB, marginTop: "2px" }}>Code: {link.athlete_code}</div>}
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={SB} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
