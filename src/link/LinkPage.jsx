import React from "react";
import "../coach/coach.css";
import "./link.css";
import BodyFigure from "./BodyFigure.jsx";
import TherynLoader from "../components/TherynLoader.jsx";
import { Icon } from "../coach/ui/primitives.jsx";
import { letterColor } from "../coach/lib/initialColor.js";
import { TYPE_COLORS } from "../components/templates/tokens.js";
import { convertPlan, convertWeight } from "../coach/lib/units.js";
import { MEASUREMENT_FIELDS, MEASUREMENT_GROUPS, askedFields, ALL_FIELD_IDS, DAY_ORDER, DAY_LONG, todayFromPlan, validateMeasurements, measurementsPayload, workoutPayload, planUnits, dayKeyOf, requiredFields, doneSets } from "../coach/lib/clientLinks.js";
import { fetchLink as realFetch, submitLink as realSubmit, fetchMe as realMe, connectLink as realConnect, signInWithGoogle as realSignIn, signOutLink as realSignOut } from "./linkApi.js";
import { isNetworkError, sendWithRetry, sendKey } from "./sendRetry.js";
import { streakStats, streakWith, streakLabel } from "../coach/lib/streak.js";
import { supersetInfo, parseDuration, formatDuration, durationInput, maskDuration, tidyDuration, clock as timerClock, SET_KINDS, groupName, restLabel, defaultMode, defaultSecs } from "../coach/lib/exerciseKinds.js";
import { planSets, setsLine } from "../coach/lib/planSets.js";

/** "Set 1", "Set 2"… for working sets; "Warm-up", "Drop", "AMRAP" for the rest. */
function setNames(e) {
  const full = e.sets || 1;
  let n = 0;
  return Array.from({ length: full }, (_, i) => {
    const k = e.setList?.[i]?.kind;
    if (k === "warmup") return "Warm-up";
    if (k === "drop") return "Drop";
    n += 1;
    return k === "amrap" ? "AMRAP" : `Set ${n}`;
  });
}

const APP_URL = "https://theryn.fit";
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const isoToday = () => isoOf(new Date());
const dateOf = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d, 12); };
/** The date of "Mon".."Sun" in the week we're in now. */
const weekIsoOf = (key, now = new Date()) => {
  const mon = new Date(now); const js = mon.getDay();
  mon.setDate(mon.getDate() - (js === 0 ? 6 : js - 1));
  mon.setDate(mon.getDate() + Math.max(0, DAY_ORDER.indexOf(key)));
  return isoOf(mon);
};
const clock = (ms) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/**
 * What this phone remembers for this link: the workout being ticked off (a
 * reload, or WhatsApp's browser dropping the page mid-session, must not lose
 * it) and which days were already sent. Keyed by a slice of the token so two
 * links on one phone stay apart. Never leaves the device.
 */
function linkStore(token) {
  const key = `theryn_link_${String(token || "").slice(0, 16)}`;
  const read = () => { try { return JSON.parse(localStorage.getItem(key) || "{}") || {}; } catch { return {}; } };
  const write = (next) => { try { localStorage.setItem(key, JSON.stringify(next)); } catch {} };
  const keepRecent = (o) => Object.fromEntries(Object.entries(o || {}).sort(([a], [b]) => (a < b ? 1 : -1)).slice(0, 10));
  return {
    draft: (date) => read().drafts?.[date] || null,
    saveDraft: (date, draft) => { const s = read(); write({ ...s, drafts: keepRecent({ ...s.drafts, [date]: draft }) }); },
    sent: (date) => read().sent?.[date] || null,
    // Days a workout was sent from this phone: the streak's fallback when the server doesn't return them.
    doneDates: () => { const x = read(); return [...(x.done || []), ...Object.keys(x.sent || {})]; },
    addDone: (date) => { const x = read(); const done = [...new Set([...(x.done || []), date])].sort().slice(-200); write({ ...x, done }); },
    units: () => { const u = read().units; return u === "metric" || u === "imperial" ? u : null; },
    setUnits: (u) => write({ ...read(), units: u }),
    // What they did last time, per exercise, so the page can show it. Kept on this phone.
    last: (name) => read().last?.[String(name || "").toLowerCase()] || null,
    saveLast: (entries) => { const s = read(); const last = { ...(s.last || {}) }; for (const [k, v] of Object.entries(entries)) last[k] = v; const keep = Object.entries(last).sort(([, a], [, b]) => (a.date < b.date ? 1 : -1)).slice(0, 80); write({ ...s, last: Object.fromEntries(keep) }); },
    markSent: (date, info) => { const s = read(); const drafts = { ...s.drafts }; delete drafts[date]; write({ ...s, drafts, sent: keepRecent({ ...s.sent, [date]: info }) }); },
    // Exercises the client added themselves for a day, on top of the coach's plan.
    extras: (date) => read().extras?.[date] || [],
    saveExtras: (date, list) => { const s = read(); write({ ...s, extras: keepRecent({ ...s.extras, [date]: list }) }); },
    // The key for the send in progress for that day. It outlives a reload, so
    // finishing again after a dropped connection is the same workout, not a
    // second one. Cleared once the coach has it.
    key: (date) => read().keys?.[date] || null,
    setKey: (date, k) => { const s = read(); const keys = { ...(s.keys || {}) }; if (k) keys[date] = k; else delete keys[date]; write({ ...s, keys: keepRecent(keys) }); },
    // The coach's code, kept only across the hop to Google and back.
    pendingCode: () => read().code || null,
    setPendingCode: (code) => { const s = read(); if (code) write({ ...s, code }); else { const { code: _drop, ...rest } = s; write(rest); } },
  };
}

const longDate = (d = new Date()) => d.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" });
const weekRange = (d = new Date()) => {
  const mon = new Date(d); const js = mon.getDay(); mon.setDate(mon.getDate() - (js === 0 ? 6 : js - 1));
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const sameMonth = mon.getMonth() === sun.getMonth();
  const monthOf = (x) => x.toLocaleDateString("en-US", { month: "long" });
  return sameMonth ? `${mon.getDate()}–${sun.getDate()} ${monthOf(sun)}` : `${mon.getDate()} ${monthOf(mon)} – ${sun.getDate()} ${monthOf(sun)}`;
};

/**
 * The page a client opens from WhatsApp: /f/<token>.
 * No account, no history. Two tabs: today's workout and measurements. The
 * week strip only shows the plan's shape; other days' workouts are in the app.
 */
export default function LinkPage({ token, api }) {
  const fetchLink = api?.fetchLink || realFetch;
  const submitLink = api?.submitLink || realSubmit;
  const fetchMe = api?.fetchMe || realMe;
  const connectLink = api?.connectLink || realConnect;
  const signIn = api?.signInWithGoogle || realSignIn;
  const signOut = api?.signOutLink || realSignOut;
  const [state, setState] = React.useState({ loading: true, data: null, error: null });
  const [tab, setTab] = React.useState(() => (new URLSearchParams(window.location.search).get("tab") === "measurements" ? "measurements" : "workout"));
  const [sent, setSent] = React.useState(null); // { kind, summary }
  const store = React.useMemo(() => linkStore(token), [token]);
  // The client's own kg/lb, remembered on this phone. Until they pick, the plan's units.
  const [units, setUnitsState] = React.useState(() => linkStore(token).units());
  const setUnits = React.useCallback((u) => { setUnitsState(u); store.setUnits(u); }, [store]);
  // Connecting is optional. Until they do, everything below behaves as before.
  const [me, setMe] = React.useState(null);
  const [connect, setConnect] = React.useState({ open: false, error: null, busy: false });
  const [dayIso, setDayIso] = React.useState(null);        // a day they picked; null = today
  const [extrasByDate, setExtrasByDate] = React.useState({}); // date → exercises they added

  // Who is holding this link, and — coming back from Google with the coach's
  // code — the last step of connecting.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let m = await fetchMe(token);
        const code = store.pendingCode();
        if (m?.ok && m.signed_in && !m.you && code) {
          const res = await connectLink(token, code);
          store.setPendingCode(null);
          if (res?.ok) m = await fetchMe(token);
          else if (!cancelled) setConnect({ open: true, busy: false, error: connectError(res) });
        }
        if (!cancelled && m?.ok) setMe(m);
      } catch { /* the page works whether or not this lands */ }
    })();
    return () => { cancelled = true; };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    let cancelled = false;
    fetchLink(token).then((d) => { if (!cancelled) setState({ loading: false, data: d, error: d?.ok ? null : d?.reason || "invalid" }); })
      // A thrown error is the server or the network, never the link itself.
      .catch((e) => { if (!cancelled) setState({ loading: false, data: null, error: /fetch|network|offline/i.test(e.message || "") ? "network" : "server" }); });
    return () => { cancelled = true; };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    document.title = "Your coach sent you a form · Theryn";
    document.body.dataset.app = "link";
    return () => { delete document.body.dataset.app; };
  }, []);

  // Continues the tumble the Suspense fallback started — no second replay.
  if (state.loading) return <div className="lk-page"><TherynLoader /></div>;
  if (state.error || !state.data?.ok) return <Unavailable reason={state.error} />;
  // The coach's editor stamps the plan with the units the coach typed in; the
  // client sees every target converted to their own.
  const coachUnits = planUnits(state.data.plan) || state.data.unit_system || "imperial";
  const clientUnits = units || coachUnits;
  const d = { ...state.data, plan: convertPlan(state.data.plan, clientUnits, { assumeFrom: coachUnits }), unit_system: clientUnits, onUnits: setUnits };
  d.doneDates = [...(Array.isArray(state.data.done_dates) ? state.data.done_dates : []), ...store.doneDates()];
  // Connected clients can open any day of the week; everyone else gets today.
  const joined = Boolean(me?.you);
  const date = (joined && dayIso) || isoToday();
  const planDay = todayFromPlan(d.plan, dateOf(date));
  const extras = extrasByDate[date] ?? store.extras(date);
  const setExtras = (list) => { setExtrasByDate((m) => ({ ...m, [date]: list })); store.saveExtras(date, list); };
  // What they added sits after the coach's exercises, and turns a rest day into
  // a day with something on it.
  const today = extras.length
    ? { ...planDay, isRest: false, type: planDay.isRest ? "Extra" : planDay.type, exercises: [...planDay.exercises, ...extras.map((x) => ({ ...x, addedByClient: true }))] }
    : planDay;

  if (sent) return <Receipt sent={sent} coach={d.coach_name} today={today} plan={d.plan} doneDates={d.doneDates} joined={joined} onBack={() => { setSent(null); setTab("workout"); setDayIso(null); window.scrollTo(0, 0); }} />;

  async function startConnect(code) {
    setConnect((c) => ({ ...c, busy: true, error: null }));
    try {
      store.setPendingCode(code);
      await signIn(token);
      // The real flow leaves for Google here. The preview comes straight back.
      const m = await fetchMe(token);
      if (m?.signed_in) {
        const res = await connectLink(token, code);
        store.setPendingCode(null);
        if (res?.ok) { setMe(await fetchMe(token)); setConnect({ open: false, busy: false, error: null }); return; }
        setConnect({ open: true, busy: false, error: connectError(res) });
      }
    } catch (e) {
      store.setPendingCode(null);
      setConnect({ open: true, busy: false, error: e.message || "Could not connect. Try again." });
    }
  }

  return (
    <div className="lk-page cx-app">
      <div className="lk-tabs" role="tablist">
        <button type="button" role="tab" className="lk-tab" aria-selected={tab === "workout"} onClick={() => setTab("workout")}>{joined ? "Workouts" : "Today's workout"}</button>
        <button type="button" role="tab" className="lk-tab" aria-selected={tab === "measurements"} onClick={() => setTab("measurements")}>Measurements</button>
      </div>
      {tab === "workout"
        ? <WorkoutTab key={`${clientUnits}-${date}`} d={d} today={today} date={date} store={store}
            joined={joined} me={me}
            /* Only once the server has answered: an older backend simply has no Connect. */
            onConnect={me ? () => setConnect({ open: true, busy: false, error: null }) : null}
            onSignOut={async () => { await signOut(); setMe(await fetchMe(token)); setDayIso(null); }}
            onPickDay={joined ? (iso) => { setDayIso(iso === isoToday() ? null : iso); window.scrollTo(0, 0); } : null}
            extras={extras} onExtras={joined ? setExtras : null}
            onSubmit={(payload) => submitLink(token, "workout", payload)}
            onSent={(summary) => setSent({ kind: "workout", summary })} onMeasure={() => setTab("measurements")} />
        : <MeasurementsTab d={d} store={store} onSubmit={(payload) => submitLink(token, "measurements", payload)} onSent={(summary) => setSent({ kind: "measurements", summary })} />}
      {connect.open && <ConnectSheet first={d.first_name} coach={d.coach_name} busy={connect.busy} error={connect.error} locked={me?.locked}
        onClose={() => setConnect({ open: false, busy: false, error: null })} onConnect={startConnect} />}
    </div>
  );
}

/** Why a connect attempt was turned down, in the client's words. */
function connectError(res) {
  const r = res?.reason;
  if (r === "code") return `That code doesn't match. Check it with your coach${res?.left ? ` — ${res.left} ${res.left === 1 ? "try" : "tries"} left` : ""}.`;
  if (r === "taken") return "This link is already connected to another account. Ask your coach for a new link.";
  if (r === "locked") return "Too many wrong codes. Ask your coach for a new code.";
  if (r === "revoked") return "This link isn't active any more. Ask your coach for a new one.";
  if (r === "signin") return "Sign in with Google didn't finish. Try again.";
  return "Could not connect. Try again in a moment.";
}

// Marketing renders the real link UI using local sample data only.
// screen: "workout" | "sent" | "measure" | "measured"; ticks 0–3 exercises
// fully ticked; filled 0–3 measurement fields entered.
export function WorkoutLinkPreview({ screen = "workout", ticks = 0, filled = 0 }) {
  const exercises = [
    { name: "Bench Press", sets: 3, reps: "8", weight: 135, coachNote: "Keep each rep controlled." },
    { name: "Overhead Press", sets: 3, reps: "10", weight: 65 },
    { name: "Cable Fly", sets: 3, reps: "12", weight: 25 },
  ];
  // A realistic push/pull/legs week, rotated so today is always the push day
  // the demo ticks through (never a rest day, whatever day the visitor lands).
  const week = [
    { type: "Push", exercises },
    { type: "Pull", exercises: [{ name: "Deadlift", sets: 3, reps: "5", weight: 225 }, { name: "Pull-Up", sets: 3, reps: "8" }, { name: "Barbell Row", sets: 3, reps: "10", weight: 115 }] },
    { type: "Legs", exercises: [{ name: "Back Squat", sets: 4, reps: "6", weight: 185 }, { name: "Romanian Deadlift", sets: 3, reps: "10", weight: 135 }, { name: "Walking Lunge", sets: 3, reps: "12" }] },
    { type: "Rest", exercises: [] },
    { type: "Push", exercises },
    { type: "Pull", exercises: [{ name: "Deadlift", sets: 3, reps: "5", weight: 225 }, { name: "Pull-Up", sets: 3, reps: "8" }, { name: "Barbell Row", sets: 3, reps: "10", weight: 115 }] },
    { type: "Rest", exercises: [] },
  ];
  const todayIdx = DAY_ORDER.indexOf(new Date().toLocaleDateString("en-US", { weekday: "short" }));
  const plan = Object.fromEntries(DAY_ORDER.map((day, i) => [day, week[(i - todayIdx + 7) % 7]]));
  const d = { first_name: "Maya", coach_name: "Vardan", unit_system: "imperial", plan, requested: ["waist", "hips", "chest"] };
  const today = todayFromPlan(plan);
  const noop = () => {};
  const tickState = React.useMemo(() => Object.fromEntries(Array.from({ length: ticks }, (_, i) => [i, 3])), [ticks]);
  const valueState = React.useMemo(() => Object.fromEntries([["weight", "138"], ["waist", "29"], ["hips", "37"]].slice(0, filled)), [filled]);
  if (screen === "sent") return <Receipt coach={d.coach_name} today={today} onBack={noop} sent={{ kind: "workout", summary: { day: DAY_LONG[today.key], type: today.type, done: 9, planned: 9, what: "sets" } }} />;
  if (screen === "measured") return <Receipt coach={d.coach_name} today={today} onBack={noop} sent={{ kind: "measurements", summary: { count: 3, date: isoToday() } }} />;
  const measuring = screen === "measure";
  return <div className="lk-page cx-app">
    <div className="lk-tabs"><span className="lk-tab" aria-selected={!measuring}>Today's workout</span><span className="lk-tab" aria-selected={measuring}>Measurements</span></div>
    {measuring
      ? <MeasurementsTab d={d} controlledValues={valueState} onSubmit={async () => ({ ok: true })} onSent={noop} />
      : <WorkoutTab d={d} today={today} controlledTicks={tickState} onSubmit={async () => ({ ok: true })} onSent={noop} onMeasure={noop} />}
  </div>;
}

const FEELS = [{ id: "easy", label: "Easy" }, { id: "medium", label: "Medium" }, { id: "hard", label: "Hard" }];
/** "3 sets × 8-10 reps · 40 kg", or "3 sets · 12/10/8 reps · 60–70 kg" when the sets differ. */
// "3 sets · 1 warm-up · drop set": each piece stays on one line when the row wraps.
const keepBits = (s) => String(s || "").split(" · ").flatMap((b, i) => [i ? " · " : null, <span key={i} className="lk-nb">{b}</span>]).filter(Boolean);

function planMeta(e, full, unit) {
  const rest = e.rest ? `rest ${restLabel(e.rest)}` : "";
  // With warm-up, drop or AMRAP sets, the same wording the coach sees:
  // "2 sets · 5 reps · 60–80 kg · 1 warm-up · drop set".
  const base = e.mode !== "time" && e.setList?.some((x) => x.kind) ? setsLine(planSets(e), unit) : planMetaBase(e, full, unit);
  return [base, rest].filter(Boolean).join(" · ");
}
function planMetaBase(e, full, unit) {
  const setWord = `${full} ${full === 1 ? "set" : "sets"}`;
  if (e.mode === "time") {
    const ts = (e.setList?.length ? e.setList.map((x) => x.secs ?? e.secs) : [e.secs]).filter((x) => x != null);
    const lo = ts.length ? Math.min(...ts) : null, hi = ts.length ? Math.max(...ts) : null;
    const t = lo == null ? "" : lo === hi ? ` × ${formatDuration(lo)}` : ` · ${formatDuration(lo)}–${formatDuration(hi)}`;
    return `${setWord}${t}${e.weight != null ? ` · ${e.weight} ${unit}` : ""}`;
  }
  if (e.setList?.length) {
    const r = e.setList.map((s) => s.reps || "–");
    const ws = e.setList.map((s) => s.weight).filter((w) => w != null);
    const reps = r.some((x) => x !== "–") ? ` · ${r.every((x) => x === r[0]) ? r[0] : r.join("/")} reps` : "";
    const lo = ws.length ? Math.min(...ws) : null, hi = ws.length ? Math.max(...ws) : null;
    return `${setWord}${reps}${lo != null ? ` · ${lo === hi ? lo : `${lo}–${hi}`} ${unit}` : ""}`;
  }
  return `${setWord}${e.reps ? ` × ${e.reps} reps` : ""}${e.weight != null ? ` · ${e.weight} ${unit}` : ""}`;
}
const firstNum = (reps) => (String(reps || "").match(/\d+/) || [""])[0];
/** Did the client's reps fall inside the plan's "8" or "8-12"? (No plan: anything counts.) */
function repsWithin(r, planned) {
  const m = String(planned || "").match(/(\d+)\s*[-–]\s*(\d+)/);
  if (m) return Number(r) >= Number(m[1]) && Number(r) <= Number(m[2]);
  const one = String(planned || "").match(/\d+/);
  return one ? Number(r) === Number(one[0]) : true;
}
/** "Mon 14" from an ISO date. */
function shortDay(iso) { const x = dateOf(iso); return `${dayKeyOf(x)} ${x.getDate()}`; }
/** "8×40, 7×40, 6×37.5 kg" — or "20:00, 18:30" when timed: last time, in today's units. */
function lastLine(last, units) {
  const rows = last.sets || [];
  if (rows.every((x) => x.s != null)) return rows.map((x) => timerClock(x.s)).join(", ");
  const sets = rows.map((x) => {
    const w = x.w !== "" && x.w != null ? convertWeight(x.w, last.units || units, units) : null;
    return `${x.r || "?"}${w != null ? `×${w}` : ""}`;
  });
  const any = rows.some((x) => x.w !== "" && x.w != null);
  return `${sets.join(", ")}${any ? ` ${units === "metric" ? "kg" : "lb"}` : " reps"}`;
}

/**
 * The boxes start on what they did last time for that exercise — their own
 * reps, weight and time, not the coach's targets — so a client repeating last
 * week only has to change what actually changed. Exercises they have never
 * done stay empty, showing the coach's plan as a hint.
 */
function seedFromLast(exercises, store, units) {
  const log = {};
  (exercises || []).forEach((e, i) => {
    const last = store?.last(e.name);
    if (!last?.sets?.length) return;
    const per = {};
    last.sets.forEach((s, si) => {
      const v = {};
      if (e.mode === "time") {
        if (s.s != null) v.s = durationInput(s.s);
      } else {
        if (s.r) v.r = String(s.r);
        const w = s.w !== "" && s.w != null ? convertWeight(s.w, last.units || units, units) : null;
        if (w != null) v.w = String(w);
      }
      if (Object.keys(v).length) per[si] = v;
    });
    if (Object.keys(per).length) log[i] = per;
  });
  return log;
}

function Byline({ coach, units, onUnits }) {
  return (
    <div className="lk-byline">
      {(() => { const c = letterColor((coach || "C")[0]); return <span className="cx-avatar cx-avatar-sm" aria-hidden="true" style={{ background: c.tint, color: c.text }}>{(coach || "C")[0]}</span>; })()}<span style={{ flex: 1 }}>From your coach, <b>{coach}</b></span>
      {onUnits && (
        <span className="lk-units" role="group" aria-label="Units">
          <button type="button" aria-pressed={units === "metric"} onClick={() => onUnits("metric")}>kg</button>
          <button type="button" aria-pressed={units !== "metric"} onClick={() => onUnits("imperial")}>lb</button>
        </span>
      )}
    </div>
  );
}

/**
 * A day they have already sent. The workout itself is done with — showing the
 * list again invites a second, contradictory entry — so this says what went
 * and when, and offers the only two things left worth doing: fix it, or put
 * down something else they did that day.
 */
function SentCard({ sent, coach, dayLabel, isToday, onEdit, onAgain }) {
  const sets = sent.planned > 0 ? `${sent.sets} of ${sent.planned} sets` : `${sent.exercises || 0} exercise${sent.exercises === 1 ? "" : "s"}`;
  return (
    <div className="lk-card lk-sent">
      <span className="lk-sent-tick" aria-hidden="true"><Icon.Check size={26} /></span>
      <h2 className="lk-sent-h">{isToday ? "Today's workout is done." : `${dayLabel} is done.`}</h2>
      <p className="lk-sent-p">
        <span>{sent.type && sent.type !== "Rest" ? <><b>{sent.type}</b> · </> : null}{sets}</span>
        <span className="lk-sent-when">Sent to {coach ? `Coach ${coach}` : "your coach"} at {clock(sent.at)}</span>
      </p>
      <div className="lk-sent-acts">
        <button type="button" className="lk-sendalt" onClick={onEdit}><Icon.Edit size={16} />Edit workout</button>
        <button type="button" className="lk-sendalt" onClick={onAgain}><Icon.Plus size={18} />Log another</button>
      </div>
      <small className="lk-sent-note">Editing replaces this workout. Logging another adds a second one for {isToday ? "today" : dayLabel}.</small>
    </div>
  );
}

// ── Connecting an account ──────────────────────────────────────────────────
/**
 * The link alone opens today's workout. Connecting a Google account — with the
 * code the coach sends separately — opens the rest of the week and lets them
 * add their own sessions. A forwarded link without the code gets nowhere.
 */
function ConnectSheet({ first, coach, busy, error, locked, onClose, onConnect }) {
  const [code, setCode] = React.useState("");
  const clean = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6);
  return (
    <div className="lk-overlay" role="dialog" aria-modal="true" aria-label="Connect your account" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="lk-sheet">
        <button type="button" className="lk-sheet-x" aria-label="Close" onClick={onClose}><Icon.Close size={18} /></button>
        <h2 className="lk-sheet-h">Connect your account</h2>
        <p className="lk-sheet-p">{first ? `${first}, connecting` : "Connecting"} keeps this the same page — it just opens up more of it.</p>
        <ul className="lk-perks">
          <li><Icon.Check size={16} /><span>Every day of your plan, not only today</span></li>
          <li><Icon.Check size={16} /><span>Add your own sessions — a run, a swim, anything extra</span></li>
          <li><Icon.Check size={16} /><span>Your history and streak stay with you</span></li>
        </ul>
        <label className="lk-field">
          <span>Code from {coach ? `Coach ${coach}` : "your coach"}</span>
          <input className="lk-input lk-code" value={clean} onChange={(e) => setCode(e.target.value)} placeholder="ABC123"
            autoCapitalize="characters" autoCorrect="off" spellCheck="false" inputMode="text" aria-label="Code from your coach" />
        </label>
        {error && <div className="lk-error" role="alert">{error}</div>}
        <button type="button" className="lk-send" disabled={busy || locked || clean.length < 6} onClick={() => onConnect(clean)}>
          {busy ? "Connecting…" : "Continue with Google"}
        </button>
        <small className="lk-small">Google only tells us your name and email, so your coach knows it's you. Ask your coach for the code if you don't have it.</small>
      </div>
    </div>
  );
}

/** Adding something the coach didn't plan: a run, a swim, extra abs. */
function AddExercise({ unit, dayLabel = "today", onAdd, onClose }) {
  const [name, setName] = React.useState("");
  const [timed, setTimed] = React.useState(false);
  const [sets, setSets] = React.useState("3");
  const [reps, setReps] = React.useState("10");
  const [secs, setSecs] = React.useState("20:00");
  const [weight, setWeight] = React.useState("");
  // The name sets the shape: a run is one long timed set, a plank three short
  // ones, a curl three sets of reps. All still editable.
  const onName = (v) => {
    setName(v);
    if (!v.trim() || name.trim()) return;
    const t = defaultMode(v) === "time";
    setTimed(t);
    if (!t) return;
    const s = defaultSecs(v);
    setSecs(durationInput(s));
    setSets(s >= 300 ? "1" : "3");
  };
  const n = Math.min(20, Math.max(1, Number(sets) || 1));
  const add = () => {
    const nm = name.trim().slice(0, 60);
    if (!nm) return;
    onAdd(timed
      ? { name: nm, sets: n, mode: "time", secs: parseDuration(secs) || 60 }
      : { name: nm, sets: n, reps: reps.replace(/[^0-9–\-/]/g, "").slice(0, 12) || "10", ...(Number(weight) > 0 ? { weight: Number(weight) } : {}) });
  };
  return (
    <div className="lk-card lk-addex">
      <div className="lk-row"><span className="lk-eyebrow">Add your own</span><button type="button" className="lk-linkbtn" onClick={onClose}>Cancel</button></div>
      <input className="lk-input" value={name} onChange={(e) => onName(e.target.value)} placeholder="What did you do? e.g. Treadmill run" aria-label="Exercise name" autoFocus />
      <div className="lk-segment" role="group" aria-label="Reps or time">
        <button type="button" aria-pressed={!timed} onClick={() => setTimed(false)}>Reps</button>
        <button type="button" aria-pressed={timed} onClick={() => setTimed(true)}>Time</button>
      </div>
      <div className="lk-addrow">
        <label className="lk-field"><span>Sets</span><input className="lk-input" inputMode="numeric" value={sets} onChange={(e) => setSets(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))} aria-label="Sets" /></label>
        {timed
          ? <label className="lk-field"><span>Time each</span><input className="lk-input" inputMode="numeric" value={secs} onChange={(e) => setSecs(maskDuration(e.target.value))} onBlur={(e) => { const t = tidyDuration(e.target.value); if (t) setSecs(t); }} aria-label="Time for each set" /></label>
          : <>
            <label className="lk-field"><span>Reps</span><input className="lk-input" inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value.replace(/[^0-9–\-/]/g, "").slice(0, 12))} aria-label="Reps" /></label>
            <label className="lk-field"><span>{unit}</span><input className="lk-input" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^0-9.]/g, "").slice(0, 6))} placeholder="—" aria-label={`Weight in ${unit}`} /></label>
          </>}
      </div>
      <button type="button" className="lk-send" disabled={!name.trim()} onClick={add}>Add to {dayLabel}</button>
    </div>
  );
}

// ── Today's workout ────────────────────────────────────────────────────────
function WorkoutTab({ d, today, date = isoToday(), store = null, onSubmit, onSent, onMeasure, controlledTicks,
  joined = false, me = null, onConnect = null, onSignOut = null, onPickDay = null, extras = [], onExtras = null }) {
  const [adding, setAdding] = React.useState(false);
  const planCount = today.exercises.length - extras.length; // the coach's, before theirs
  // A day they have already sent opens as a receipt, not as the workout again.
  // "edit" reopens what they sent; "again" starts a separate second entry.
  const [mode, setMode] = React.useState(null);
  // A draft only applies to the same day's plan (the coach may have changed it since).
  const draft = React.useMemo(() => {
    const x = store?.draft(date);
    if (!x || x.day !== today.key || x.type !== today.type) return null;
    // Weights typed before a kg/lb switch are converted, not reread in the new unit.
    if (!x.units || x.units === d.unit_system) return x;
    const conv = (v) => (v === "" || v == null ? v : String(convertWeight(v, x.units, d.unit_system) ?? ""));
    return { ...x, log: Object.fromEntries(Object.entries(x.log || {}).map(([i, sets]) => [i, Object.fromEntries(Object.entries(sets || {}).map(([k, v]) => [k, { ...v, w: conv(v?.w) }]))])) };
  }, [store, date, today.key, today.type, d.unit_system]);
  const [ticks, setTicks] = React.useState(() => draft?.ticks || {});      // exerciseIndex → sets done
  // The marketing demo steps ticks in from outside so only the newly ticked
  // box animates; real athletes never pass this.
  React.useEffect(() => { if (controlledTicks) setTicks(controlledTicks); }, [controlledTicks]);
  // exerciseIndex → setIndex → { r, w }: the numbers in the boxes. A half-done
  // draft wins; otherwise they start on last time's, so the client edits what
  // changed instead of typing everything again.
  const [log, setLog] = React.useState(() => draft?.log || seedFromLast(today.exercises, store, d.unit_system));
  const [skipped, setSkipped] = React.useState(() => draft?.skipped || {});
  const [note, setNote] = React.useState(() => draft?.note || "");
  const [feel, setFeel] = React.useState(() => draft?.feel || null); // "easy" | "medium" | "hard"
  // A finished exercise folds to one line; tapping it opens it again until it changes.
  const [reopened, setReopened] = React.useState({});
  const isToday = date === isoToday();
  const upcoming = date > isoToday(); // a day later this week: show the plan, nothing to tick yet
  const realToday = dayKeyOf(new Date());
  const sentBefore = store?.sent(date) || null;
  const st = React.useMemo(() => streakStats(d.doneDates || [], d.plan), [d.doneDates, d.plan]);
  // Save every tick as it happens.
  React.useEffect(() => {
    if (!store || controlledTicks || upcoming) return;
    store.saveDraft(date, { day: today.key, type: today.type, units: d.unit_system, ticks, log, skipped, note, feel });
  }, [store, date, today.key, today.type, d.unit_system, ticks, log, skipped, note, feel, controlledTicks, upcoming]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const first = d.first_name;
  const color = TYPE_COLORS[today.type] || "var(--cx-tx2)";
  const total = today.exercises.length;
  const doneCount = today.exercises.filter((e, i) => (e.sets ? (ticks[i] || 0) >= e.sets : (ticks[i] || 0) > 0)).length;
  const currentIdx = today.exercises.findIndex((e, i) => !skipped[i] && !(e.sets ? (ticks[i] || 0) >= e.sets : (ticks[i] || 0) > 0));
  const anything = Object.values(ticks).some((n) => n > 0);
  const setsTotal = today.exercises.reduce((a, e) => a + (e.sets || 1), 0);
  const setsDone = today.exercises.reduce((a, e, i) => a + Math.min(ticks[i] || 0, e.sets || 1), 0);
  const unit = d.unit_system === "metric" ? "kg" : "lb";

  // Tap the numbered box: complete the whole exercise; tap again to undo.
  const toggleExercise = (i) => {
    const e = today.exercises[i];
    const full = e.sets || 1;
    setTicks((t) => ({ ...t, [i]: (t[i] || 0) >= full ? 0 : full }));
    setSkipped((s) => ({ ...s, [i]: false }));
    setReopened((o) => ({ ...o, [i]: false }));
  };
  const setSets = (i, n) => { setTicks((t) => ({ ...t, [i]: n })); setSkipped((s) => ({ ...s, [i]: false })); setReopened((o) => (o[i] ? { ...o, [i]: false } : o)); };
  // One of their own exercises. If they have done it before, its boxes start
  // on last time's numbers, like everything else on the page.
  const addExtra = (ex) => {
    const i = today.exercises.length;
    onExtras?.([...extras, ex]);
    const seeded = seedFromLast([ex], store, d.unit_system)[0];
    if (seeded) setLog((l) => ({ ...l, [i]: seeded }));
    setAdding(false);
  };
  // Taking one of their own exercises back out. Their other added exercises
  // shift down, so what was ticked on those is cleared with it; the coach's
  // exercises keep everything.
  const removeExtra = (idx) => {
    onExtras?.(extras.filter((_, k) => k !== idx));
    const keepPlan = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => Number(k) < planCount));
    setTicks(keepPlan); setLog(keepPlan); setSkipped(keepPlan); setReopened(keepPlan);
  };
  // Typing only edits the number. Ticking is a separate tap, so reaching for a value never ticks a set.
  const setSetValue = (i, si, field, raw) => {
    const v = field === "r" ? raw.replace(/[^0-9]/g, "").slice(0, 3) : field === "s" ? maskDuration(raw) : raw.replace(/[^0-9.]/g, "").slice(0, 6);
    setLog((l) => ({ ...l, [i]: { ...(l[i] || {}), [si]: { ...(l[i]?.[si] || {}), [field]: v } } }));
  };

  // ── Timer for timed sets (planks, runs) ──────────────────────────────────
  // One timer at a time. It counts down to the coach's time, or up when there
  // isn't one. At zero it buzzes, beeps and ticks the set. Time is taken from
  // the clock, not by counting ticks, so it stays right if the phone sleeps.
  const [timer, setTimer] = React.useState(null); // { i, si, target, base, startedAt }
  const [, redraw] = React.useState(0);
  const audioRef = React.useRef(null);
  const wakeRef = React.useRef(null);
  const running = Boolean(timer?.startedAt);
  React.useEffect(() => { if (!running) return undefined; const id = setInterval(() => redraw((x) => x + 1), 250); return () => clearInterval(id); }, [running]);
  const elapsedOf = (t) => (t ? t.base + (t.startedAt ? (Date.now() - t.startedAt) / 1000 : 0) : 0);
  const keepAwake = async (on) => {
    try {
      if (on && !wakeRef.current && navigator.wakeLock) wakeRef.current = await navigator.wakeLock.request("screen");
      if (!on && wakeRef.current) { await wakeRef.current.release(); wakeRef.current = null; }
    } catch { /* not supported, or the page is hidden */ }
  };
  React.useEffect(() => () => { keepAwake(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const cue = () => {
    try { navigator.vibrate?.([220, 120, 220, 120, 360]); } catch { /* no vibration */ }
    const ac = audioRef.current; if (!ac) return;
    try {
      [0, 0.28, 0.56].forEach((at) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(ac.destination);
        g.gain.setValueAtTime(0.0001, ac.currentTime + at);
        g.gain.exponentialRampToValueAtTime(0.25, ac.currentTime + at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + at + 0.2);
        o.start(ac.currentTime + at); o.stop(ac.currentTime + at + 0.22);
      });
    } catch { /* no sound */ }
  };
  const startTimer = (i, si, target) => {
    // The first tap unlocks sound on iPhone; make the audio context now.
    try { if (!audioRef.current) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) audioRef.current = new AC(); } audioRef.current?.resume?.(); } catch { /* no sound */ }
    setTimer((t) => (t && t.i === i && t.si === si ? { ...t, startedAt: Date.now() } : { i, si, target: target || null, base: 0, startedAt: Date.now() }));
    keepAwake(true);
  };
  const pauseTimer = () => { setTimer((t) => (t && t.startedAt ? { ...t, base: elapsedOf(t), startedAt: null } : t)); keepAwake(false); };
  const finishTimer = (auto) => {
    const t = timer; if (!t) return;
    const secs = Math.max(1, Math.round(auto && t.target ? t.target : elapsedOf(t)));
    setSetValue(t.i, t.si, "s", timerClock(secs));
    const doneNow = Math.max(ticks[t.i] || 0, t.si + 1);
    setSets(t.i, doneNow);
    maybeRest(t.i, doneNow);
    if (auto) cue();
    setTimer(null); keepAwake(false);
  };
  // Reaching zero finishes the set on its own.
  React.useEffect(() => { if (timer?.startedAt && timer.target && elapsedOf(timer) >= timer.target) finishTimer(true); });
  const ss = React.useMemo(() => supersetInfo(today.exercises), [today.exercises]);

  // ── Rest between sets ───────────────────────────────────────────────────
  // After ticking a set of an exercise with a rest time, a countdown shows
  // above Finish. Not before a drop set (no rest), and not between the
  // exercises of a superset (rest comes after the last one).
  const [rest, setRest] = React.useState(null); // { until, total, label }
  React.useEffect(() => { if (!rest) return undefined; const id = setInterval(() => redraw((x) => x + 1), 250); return () => clearInterval(id); }, [rest]);
  const restLeft = rest ? Math.max(0, (rest.until - Date.now()) / 1000) : 0;
  React.useEffect(() => { if (rest && restLeft <= 0) { cue(); setRest(null); } });
  const maybeRest = (i, doneNow) => {
    const e = today.exercises[i]; const full = e.sets || 1;
    if (!e.rest || controlledTicks) return;
    const g = ss[i];
    if (g && g.pos < g.size) return;                                      // mid-superset: straight to the next exercise
    if (doneNow < full && e.setList?.[doneNow]?.kind === "drop") return;  // a drop set follows with no rest
    if (doneNow >= full && i >= today.exercises.length - 1) return;       // that was the last set of the day
    try { if (!audioRef.current) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) audioRef.current = new AC(); } audioRef.current?.resume?.(); } catch { /* no sound */ }
    const next = doneNow < full ? `${e.name}, ${setNames(e)[doneNow].replace(/^Set/, "set")}` : today.exercises[i + 1]?.name || "";
    setRest({ until: Date.now() + e.rest * 1000, total: e.rest, label: next });
  };
  const tickSet = (i, n) => { const before = ticks[i] || 0; setSets(i, n); if (n > before) maybeRest(i, n); else setRest(null); };

  // Already sent this day: the receipt stands until they choose one of the two
  // ways on from it.
  const showSent = Boolean(sentBefore) && !mode && !upcoming;
  const startEdit = () => {
    const saved = sentBefore?.saved;
    if (saved) {
      setTicks(saved.ticks || {});
      setLog(saved.log || {});
      setSkipped(saved.skipped || {});
      setNote(saved.note || "");
      setFeel(saved.feel || null);
      if (saved.extras?.length && onExtras) onExtras(saved.extras);
    }
    setReopened({});
    setMode("edit");
    window.scrollTo(0, 0);
  };
  // Something else they did that day: a clean sheet, sent as its own workout.
  const startAgain = () => {
    setTicks({}); setLog({}); setSkipped({}); setNote(""); setFeel(null); setReopened({});
    setMode("again");
    window.scrollTo(0, 0);
  };

  async function send() {
    setBusy(true); setError(null);
    try {
      // The same key until the coach has it, so finishing again after a dropped
      // connection — even after a reload — is this workout, not a second one.
      let key = store?.key(date);
      if (!key) { key = sendKey(); store?.setKey(date, key); }
      const built = workoutPayload(today, ticks, log, note, date, d.unit_system, feel);
      const payload = {
        ...built,
        // A second workout for a day already sent is only what they did this
        // time. Sending the whole plan again with zeros would read to the
        // coach as a session they failed.
        ...(mode === "again" ? { exercises: built.exercises.filter((e) => e.sets_done > 0) } : {}),
        client_key: key,
        // Fixing what they already sent replaces it, so the coach reads one
        // workout for the day rather than two that disagree.
        ...(mode === "edit" && sentBefore?.id ? { replaces: sentBefore.id } : {}),
      };
      const res = await sendWithRetry(onSubmit, payload);
      if (!res?.ok) throw new Error(res?.reason === "too_many" ? "You've sent several workouts in the last 24 hours already. Your coach has them." : "Could not send. Try again in a moment.");
      store?.setKey(date, null);
      const before = streakStats(d.doneDates || [], d.plan).current;
      // Enough to show them what went, and to open it again if they want to
      // change it: the submission's id, the totals, and what was in the boxes.
      store?.markSent(date, {
        at: Date.now(), day: today.key, type: today.type,
        id: res?.id || null,
        sets: payload.exercises.reduce((a, e) => a + e.sets_done, 0),
        planned: payload.exercises.reduce((a, e) => a + (e.sets_planned || 0), 0),
        exercises: payload.exercises.filter((e) => e.sets_done > 0).length,
        saved: { ticks, log, note, feel, skipped, extras },
      });
      setMode(null); // back to the receipt for this day
      store?.addDone(date);
      store?.saveLast(Object.fromEntries(payload.exercises.filter((x) => x.sets_done > 0).map((x) => [String(x.name).toLowerCase(), { date, units: d.unit_system, sets: doneSets(x) }])));
      const setsPlanned = payload.exercises.reduce((a, e) => a + (e.sets_planned || 0), 0);
      const setsDone = payload.exercises.reduce((a, e) => a + e.sets_done, 0);
      onSent({ date, streakBefore: before, ...(setsPlanned > 0
        ? { day: DAY_LONG[today.key], type: today.type, done: setsDone, planned: setsPlanned, what: "sets" }
        : { day: DAY_LONG[today.key], type: today.type, done: payload.exercises.filter((e) => e.sets_done > 0).length, planned: payload.exercises.length, what: "exercises" }) });
    } catch (e) {
      // Nothing is lost: every tick is on this phone, and tapping again sends
      // the same workout rather than a second one.
      setError(isNetworkError(e) ? "No connection just now. Your workout is safe on this phone — tap Finish again when you have signal." : e.message);
    }
    finally { setBusy(false); }
  }

  return (
    <>
      <main className="lk-main">
        <Byline coach={d.coach_name} units={d.unit_system} onUnits={d.onUnits} />
        <div className="lk-intro">
          <div className="lk-dateline">
            <span className="lk-eyebrow">{isToday ? longDate() : upcoming ? `Coming up · ${longDate(dateOf(date))}` : showSent ? longDate(dateOf(date)) : `Logging ${longDate(dateOf(date))}`}</span>
            {isToday && !controlledTicks && <StreakChip st={st} />}
          </div>
          {today.isRest
            ? <h1 className="lk-h1">Rest day.</h1>
            : <h1 className="lk-h1">Your <span style={{ color }}>{today.type.toLowerCase()}</span> day.</h1>}
          {/* A day already sent says so in its own card; no need to be told to tick it. */}
          {!showSent && <p className="lk-lede">{today.isRest
            ? (!isToday ? `Hi ${first}. Nothing is planned for ${DAY_LONG[today.key]}.` : today.next ? `Hi ${first}. Nothing planned today. Next up is ${DAY_LONG[today.next.key]}, ${today.next.type}.` : `Hi ${first}. No workouts are planned yet. Your coach will add them.`)
            : isToday ? `Hi ${first}. ${st.current >= 2 && !st.doneToday ? `Tick today and that's ${st.current + 1} workouts in a row.${st.best > st.current + 1 ? ` Your best is ${st.best}.` : ""}` : "Follow your coach's plan and tick off each exercise."}`
            : upcoming ? `Hi ${first}. Here's ${DAY_LONG[today.key]}'s plan. You can tick it off on the day.`
            : `Hi ${first}. Tick off what you did on ${DAY_LONG[today.key]} and send it to your coach.`}</p>}
        </div>

        {d.plan && (
          <section aria-label="This week">
            <div className="lk-row" style={{ marginBottom: 10 }}><span className="lk-eyebrow">This week</span><span className="lk-small">{weekRange()}</span></div>
            <div className="lk-week">
              {DAY_ORDER.map((k) => {
                const day = d.plan[k]; const t = day?.type && day.type !== "Rest" && (day.exercises || []).length ? day.type : "Rest";
                const c = t === "Rest" ? undefined : TYPE_COLORS[t];
                const cls = `lk-day ${t === "Rest" ? "rest" : ""} ${k === realToday ? "today" : ""} ${onPickDay && k === today.key ? "picked" : ""}`;
                const inner = <><span>{k}</span><i /><b>{t}</b>{k === realToday && <small>Today</small>}</>;
                // Connected clients can open any day; everyone else sees the shape of the week.
                return onPickDay
                  ? <button type="button" key={k} className={cls} style={c ? { "--day": c } : undefined} aria-pressed={k === today.key} aria-label={`${DAY_LONG[k]}, ${t}`} onClick={() => onPickDay(weekIsoOf(k))}>{inner}</button>
                  : <div key={k} className={cls} style={c ? { "--day": c } : undefined}>{inner}</div>;
              })}
            </div>
            {isToday && st.days.some((x) => x.state === "done") && (
              <div className="lk-last7" role="img" aria-label={`Last 7 days: ${st.days.slice(-7).filter((x) => x.state === "done").length} workouts`}>
                <span className="lk-small">Last 7 days</span>
                {st.days.slice(-7).map((x) => <i key={x.iso} className={x.state} />)}
              </div>
            )}
            {!controlledTicks && (joined
              ? <div className="lk-weeknote joined">
                  <span><Icon.Check size={14} /> Connected{me?.name ? ` as ${me.name}` : ""}. Tap any day to see it{onExtras ? ", or add your own session" : ""}.</span>
                  {onSignOut && <button type="button" className="lk-linkbtn" onClick={onSignOut}>Sign out</button>}
                </div>
              : onConnect
              ? <div className="lk-weeknote">
                  <span>Want the whole week, and your own sessions on top?</span>
                  <button type="button" className="lk-connect" onClick={onConnect}>Connect</button>
                </div>
              : <div className="lk-weeknote"><span>Every day's workout will be in the Theryn app.</span> <b className="soon">App coming soon</b></div>)}
          </section>
        )}

        {showSent && <SentCard sent={sentBefore} coach={d.coach_name} dayLabel={DAY_LONG[today.key]} isToday={isToday} onEdit={startEdit} onAgain={startAgain} />}

        {!today.isRest && !showSent && (
          <>
            <div className="lk-card" style={{ flexDirection: "row", alignItems: "center" }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="lk-eyebrow">{isToday ? "Today's plan" : `${DAY_LONG[today.key]}'s plan`}</span>
                <span style={{ fontSize: 17, fontWeight: 700 }}>{total} exercise{total === 1 ? "" : "s"}{(() => { const s = today.exercises.reduce((a, e) => a + (e.sets || 0), 0); return s ? ` · ${s} sets` : ""; })()}</span>
                <span className="lk-small">Rest 60–90 sec between sets</span>
              </div>
              <span className="cx-pill" style={{ color, background: `${color}1A`, height: 32, fontSize: 13 }}>{today.type}</span>
            </div>

            {!upcoming && <div>
              <div className="lk-row" style={{ marginBottom: 8 }}><span style={{ fontSize: 16, fontWeight: 700 }}>{doneCount} of {total} done</span><span className="lk-small">{setsDone} of {setsTotal} sets</span></div>
              <div className="lk-progress"><i style={{ width: `${setsTotal ? (setsDone / setsTotal) * 100 : 0}%` }} /></div>
            </div>}

            {today.exercises.map((e, i) => {
              const full = e.sets || 1;
              const n = ticks[i] || 0;
              const done = n >= full;
              const isCurrent = i === currentIdx;
              const last = store?.last(e.name);
              // The coach's numbers for set `si`: its own when the sets differ.
              const planR = (si) => e.setList?.[si]?.reps ?? e.reps;
              const planW = (si) => e.setList?.[si]?.weight ?? e.weight;
              const timed = e.mode === "time";
              const planS = (si) => e.setList?.[si]?.secs ?? e.secs ?? null;
              const rows = Array.from({ length: full }, (_, si) => {
                const x = log[i]?.[si] || {};
                const isDone = si < n;
                const rChanged = !timed && x.r !== "" && x.r != null && !repsWithin(x.r, planR(si));
                const wChanged = x.w !== "" && x.w != null && planW(si) != null && Number(x.w) !== Number(planW(si));
                const typedS = timed ? parseDuration(x.s) : null;
                const sChanged = timed && typedS != null && planS(si) != null && Math.abs(typedS - planS(si)) > 5;
                // A time saved in an older draft ("1", "45") is shown in the 00:00 form.
                return { si, isDone, r: x.r || "", w: x.w || "", s: x.s ? (String(x.s).includes(":") ? x.s : tidyDuration(x.s)) : "", changed: isDone && (rChanged || wChanged || sChanged) };
              });
              const summary = rows.filter((x) => x.isDone).map((x) => ({ text: timed
                ? (formatDuration(parseDuration(x.s) ?? planS(x.si)) || "done")
                : `${x.r || firstNum(planR(x.si)) || "?"}×${x.w || (planW(x.si) ?? "?")}`, changed: x.changed }));
              const chip = ss[i] ? <span className="lk-ss" title={`${groupName(ss[i].size)} ${ss[i].letter}`}>{ss[i].letter}{ss[i].pos}</span> : null;
              const ssHead = ss[i]?.pos === 1 ? <div className="lk-ssbar" key={`ss${i}`}><b>{groupName(ss[i].size)} {ss[i].letter}</b><span>Do {ss[i].size === 2 ? "both" : `all ${ss[i].size}`} back to back, then rest.</span></div> : null;
              const ssCls = ss[i] ? `ss ${ss[i].pos === 1 ? "ss-first" : ""} ${ss[i].pos === ss[i].size ? "ss-last" : ""}` : "";
              const folded = !upcoming && (done || skipped[i]) && !reopened[i];

              if (folded) {
                return (<React.Fragment key={i}>{ssHead}
                  <button type="button" className={`lk-fold ${ssCls} ${skipped[i] && !done ? "skipped" : ""}`} onClick={() => setReopened((o) => ({ ...o, [i]: true }))} aria-expanded={false} aria-label={`${e.name}, ${done ? "done" : "skipped"}, tap to open`}>
                    <span className={`lk-badge ${done ? "on" : ""}`}>{done ? <Icon.Check size={20} /> : String(i + 1).padStart(2, "0")}</span>
                    <span className="lk-fold-body">
                      <span className="lk-fold-name">{chip}{e.name}</span>
                      <span className="lk-fold-sum">{done
                        ? <>{full} {full === 1 ? "set" : "sets"} · {summary.map((x, k) => <React.Fragment key={k}>{k > 0 && ", "}<span className={x.changed ? "changed" : ""}>{x.text}</span></React.Fragment>)}{timed ? "" : ` ${unit}`}</>
                        : "Skipped · tap to undo"}</span>
                    </span>
                    <Icon.Down size={18} />
                  </button>
                </React.Fragment>);
              }

              return (<React.Fragment key={i}>{ssHead}
                <div className={`lk-card lk-ex ${ssCls} ${done ? "done" : ""} ${isCurrent ? "current" : ""}`}>
                  <div className="lk-ex-head">
                    {upcoming
                      ? <span className="lk-badge">{String(i + 1).padStart(2, "0")}</span>
                      : <button type="button" className={`lk-badge ${done ? "on" : isCurrent || n > 0 ? "current" : ""}`} aria-pressed={done} aria-label={`${done ? "Undo all sets" : "Mark all sets done"}: ${e.name}`} onClick={() => toggleExercise(i)}>{done ? <Icon.Check size={20} /> : String(i + 1).padStart(2, "0")}</button>}
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                      <div className="lk-ex-name">{chip}{e.name}{i >= planCount && <span className="lk-yours">Yours</span>}</div>
                      <div className="lk-ex-meta">{keepBits(planMeta(e, full, unit))}</div>
                      {last && <div className="lk-ex-meta">Last time{draft?.log ? "" : " (already in the boxes)"}: {lastLine(last, d.unit_system)}</div>}
                      {e.note && <div className="lk-ex-note">{e.note}</div>}
                    </div>
                    {done && !upcoming
                      ? <button type="button" className="lk-foldbtn" aria-label="Collapse" onClick={() => setReopened((o) => ({ ...o, [i]: false }))}><span style={{ display: "inline-flex", transform: "rotate(180deg)" }}><Icon.Down size={18} /></span></button>
                      : n > 0 ? <span className="lk-ex-count">{n}/{full}</span> : null}
                  </div>

                  {rows.map((x) => {
                    const kind = e.setList?.[x.si]?.kind || null;
                    const label = kind ? setNames(e)[x.si] : null;
                    const setNo = setNames(e)[x.si].replace(/^Set /, "");
                    const tick = <><span className="lk-srow-circle">{x.isDone && <Icon.Check size={16} />}</span><span className="lk-srow-label">{label ? <span className={`lk-kind ${kind}`} title={SET_KINDS[kind].hint}>{label}</span> : <span><span className="w">Set </span>{setNo}</span>}{x.changed && <em>edited</em>}</span></>;
                    return (
                      <div key={x.si} className={`lk-srow ${x.isDone ? "on" : ""} ${x.changed ? "changed" : ""} ${kind ? `kind-${kind}` : ""}`}>
                        {/* Only this part ticks. The number cells never do, so reaching for a value can't tick the set. */}
                        {upcoming
                          ? <span className="lk-srow-tick">{tick}</span>
                          : <button type="button" className="lk-srow-tick" aria-pressed={x.isDone} aria-label={`Set ${x.si + 1}, ${x.isDone ? "done, tap to undo" : "tap when done"}`} onClick={() => tickSet(i, x.si + 1 === n ? x.si : x.si + 1)}>{tick}</button>}
                        {timed ? (() => {
                          const active = timer && timer.i === i && timer.si === x.si;
                          const left = active ? (timer.target ? Math.max(0, timer.target - elapsedOf(timer)) : elapsedOf(timer)) : null;
                          return <>
                            {active
                              ? <span className={`lk-srow-cell lk-clock ${timer.startedAt ? "running" : ""}`} aria-live="polite" aria-label={`${timer.target ? "Time left" : "Time"} ${timerClock(left)}`}><b>{timerClock(left)}</b><span className="lk-srow-unit">{timer.target ? "left" : "so far"}</span></span>
                              : <label className="lk-srow-cell">
                                  <input className="lk-sin" inputMode="numeric" placeholder={planS(x.si) ? timerClock(planS(x.si)) : "0:00"} value={x.s} disabled={upcoming} onChange={(ev) => setSetValue(i, x.si, "s", ev.target.value)} onBlur={(ev) => { const t = tidyDuration(ev.target.value); if (t && t !== ev.target.value) setLog((l) => ({ ...l, [i]: { ...(l[i] || {}), [x.si]: { ...(l[i]?.[x.si] || {}), s: t } } })); }} onFocus={(ev) => ev.target.select()} aria-label={`Set ${x.si + 1} time${planS(x.si) ? `, plan ${formatDuration(planS(x.si))}` : ""}`} />
                                  <span className="lk-srow-unit">time</span>
                                </label>}
                            {upcoming
                              ? <span className="lk-srow-cell lk-timerbtn" aria-hidden="true"><Icon.Clock size={16} /></span>
                              : active && timer.startedAt
                              ? <span className="lk-timerbtns"><button type="button" className="lk-timerbtn" onClick={pauseTimer} aria-label="Pause timer"><Icon.Pause size={16} /></button><button type="button" className="lk-timerbtn done" onClick={() => finishTimer(false)} aria-label="Stop and save this time"><Icon.Check size={16} /></button></span>
                              : active
                              ? <span className="lk-timerbtns"><button type="button" className="lk-timerbtn go" onClick={() => startTimer(i, x.si, planS(x.si))} aria-label="Resume timer"><Icon.Play size={16} /></button><button type="button" className="lk-timerbtn done" onClick={() => finishTimer(false)} aria-label="Save this time"><Icon.Check size={16} /></button></span>
                              : <button type="button" className="lk-timerbtn go" onClick={() => startTimer(i, x.si, planS(x.si))} aria-label={`Start timer for set ${x.si + 1}`}><Icon.Play size={16} /><span>Start</span></button>}
                          </>;
                        })() : <>
                        <label className="lk-srow-cell">
                          <input className="lk-sin" inputMode="numeric" placeholder={kind === "amrap" ? "max" : planR(x.si) || "—"} value={x.r} disabled={upcoming} onChange={(ev) => setSetValue(i, x.si, "r", ev.target.value)} onFocus={(ev) => ev.target.select()} aria-label={`Set ${x.si + 1} reps${planR(x.si) ? `, plan ${planR(x.si)}` : ""}`} />
                          <span className="lk-srow-unit">reps</span>
                        </label>
                        <label className="lk-srow-cell">
                          <input className="lk-sin" inputMode="decimal" placeholder={planW(x.si) != null ? String(planW(x.si)) : "—"} value={x.w} disabled={upcoming} onChange={(ev) => setSetValue(i, x.si, "w", ev.target.value)} onFocus={(ev) => ev.target.select()} aria-label={`Set ${x.si + 1} weight in ${unit}${planW(x.si) != null ? `, plan ${planW(x.si)}` : ""}`} />
                          <span className="lk-srow-unit">{unit}</span>
                        </label>
                        </>}
                      </div>
                    );
                  })}

                  {!upcoming && <div className="lk-ex-actions" style={{ justifyContent: "flex-end" }}>
                    {i >= planCount && onExtras
                      ? <button type="button" className="lk-linkbtn danger" onClick={() => removeExtra(i - planCount)}>Remove</button>
                      : done
                      ? <button type="button" className="lk-linkbtn danger" onClick={() => toggleExercise(i)}>Undo all</button>
                      : skipped[i]
                      ? <button type="button" className="lk-linkbtn danger" onClick={() => setSkipped((s) => ({ ...s, [i]: false }))}>Undo skip</button>
                      : <button type="button" className="lk-linkbtn danger" onClick={() => { setSkipped((s) => ({ ...s, [i]: true })); setTicks((t) => ({ ...t, [i]: 0 })); setReopened((o) => ({ ...o, [i]: false })); }}>Skip exercise</button>}
                  </div>}
                </div>
              </React.Fragment>);
            })}

            {onExtras && !upcoming && (adding
              ? <AddExercise unit={unit} dayLabel={isToday ? "today" : DAY_LONG[today.key]} onAdd={addExtra} onClose={() => setAdding(false)} />
              : <button type="button" className="lk-addbtn" onClick={() => setAdding(true)}><Icon.Plus size={16} /><span>Add your own exercise</span></button>)}

            {!upcoming && <>
            <div>
              <div className="lk-row" style={{ marginBottom: 10 }}><span style={{ fontSize: 20, fontWeight: 700 }}>How did it feel?</span><span className="lk-small">Optional</span></div>
              <div className="lk-feel" role="group" aria-label="How did it feel?">
                {FEELS.map((x) => <button key={x.id} type="button" className={`lk-feel-opt ${x.id}`} aria-pressed={feel === x.id} onClick={() => setFeel(feel === x.id ? null : x.id)}>{x.label}</button>)}
              </div>
              <textarea className="lk-textarea" rows={1} value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} placeholder="Add a note for your coach" aria-label="Note for your coach" />
            </div>
            </>}
            {sentBefore && mode && <div className="lk-sentnote" role="status"><Icon.Check size={16} /><span>{mode === "edit"
              ? `Changing what you sent at ${clock(sentBefore.at)}. Sending replaces it, so your coach sees one workout.`
              : `You already sent this day at ${clock(sentBefore.at)}. This goes over as a second workout.`}</span></div>}
            {error && <div className="lk-error" role="alert">{error}</div>}
          </>
        )}

        {/* Trained anyway on a rest day? Connected clients can put it down. */}
        {today.isRest && onExtras && !upcoming && (adding
          ? <AddExercise unit={unit} dayLabel={isToday ? "today" : DAY_LONG[today.key]} onAdd={addExtra} onClose={() => setAdding(false)} />
          : <button type="button" className="lk-addbtn" onClick={() => setAdding(true)}><Icon.Plus size={16} /><span>Did something anyway? Add it</span></button>)}

        {today.isRest && (
          <div className="lk-card">
            <span style={{ fontSize: 16, fontWeight: 700 }}>Want to send measurements instead?</span>
            <button type="button" className="lk-send secondary" onClick={onMeasure}>Go to Measurements</button>
          </div>
        )}
      </main>
      {!today.isRest && !upcoming && !showSent && (
        <div className="lk-footer"><div className="lk-footer-inner">
          {rest && (
            <div className="lk-rest" role="status" aria-live="polite">
              <span className="lk-rest-ring" style={{ "--p": `${Math.round((1 - restLeft / rest.total) * 100)}%` }} aria-hidden="true" />
              <span className="lk-rest-text"><b>Rest {timerClock(restLeft)}</b>{rest.label && <small>Next: {rest.label}</small>}</span>
              <button type="button" className="lk-rest-skip" onClick={() => setRest(null)}>Skip</button>
            </div>
          )}
          <button type="button" className="lk-send" onClick={send} disabled={busy || !anything}><Icon.Check size={20} />{busy ? "Sending…"
            : mode === "edit" ? "Save the changes"
            : mode === "again" ? "Send this as well"
            : isToday ? "Finish workout" : `Send ${DAY_LONG[today.key]}'s workout`}</button>
          {!anything && <div className="lk-small" style={{ textAlign: "center", marginTop: 8 }}>Tick at least one exercise to send.</div>}
        </div></div>
      )}
    </>
  );
}

// ── Measurements ───────────────────────────────────────────────────────────
function MeasurementsTab({ d, store = null, onSubmit, onSent, controlledValues }) {
  // The coach's picks come first; any other measurement is one tap away.
  // Everything is optional: at least one number is all it takes to send.
  const requested = askedFields(d.requested);
  const [more, setMore] = React.useState(false);
  // One kg/lb choice for the whole page (the byline switch and this one are the same setting).
  const [localUnit, setLocalUnit] = React.useState(d.unit_system === "metric" ? "metric" : "imperial");
  const unit = d.onUnits ? (d.unit_system === "metric" ? "metric" : "imperial") : localUnit;
  const setUnit = d.onUnits || setLocalUnit;
  const [date, setDate] = React.useState(isoToday());
  const [values, setValues] = React.useState({});
  const [selected, setSelected] = React.useState(requested[0] || ALL_FIELD_IDS[0]);
  React.useEffect(() => { if (controlledValues) setValues(controlledValues); }, [controlledValues]);
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const inputs = React.useRef({});
  const first = d.first_name;
  const lenUnit = unit === "metric" ? "cm" : "in";
  const wUnit = unit === "metric" ? "kg" : "lb";
  const hasValue = (id) => values[id] != null && String(values[id]).trim() !== "";
  const askedList = MEASUREMENT_FIELDS.filter((f) => requested.includes(f.id));
  // Extra ones stay on screen once they have a number, even with "more" closed.
  const extraList = MEASUREMENT_FIELDS.filter((f) => !requested.includes(f.id) && (more || hasValue(f.id)));
  const fields = [...askedList, ...extraList];
  const guide = MEASUREMENT_FIELDS.find((f) => f.id === selected) || fields[0];
  const added = MEASUREMENT_FIELDS.filter((f) => hasValue(f.id)).length;
  const unitOf = (f) => (f.unit === "%" ? "%" : lenUnit);
  const fieldBox = (f) => (
    <div key={f.id} className={`lk-numfield ${selected === f.id ? "on" : ""} ${error?.field === f.id ? "bad" : ""}`} onClick={() => pick(f.id)}>
      <span className="lab">{f.label}</span>
      <span className="val"><input ref={(el) => { inputs.current[f.id] = el; }} inputMode="decimal" placeholder="—" value={values[f.id] || ""} onChange={(e) => setVal(f.id, e.target.value)} onFocus={() => setSelected(f.id)} aria-label={`${f.label} in ${unitOf(f)}`} /><span className="unit">{unitOf(f)}</span></span>
    </div>
  );

  // Tapping a label on the figure only changes the guide; it must not focus the
  // field, which would scroll the figure away and open the keyboard on a phone.
  const pick = (id) => { setSelected(id); inputs.current[id]?.focus(); };
  const show = (id) => setSelected(id);
  const setVal = (id, v) => { setValues((x) => ({ ...x, [id]: v.replace(/[^0-9.]/g, "").slice(0, 6) })); setError(null); };

  async function send() {
    const v = validateMeasurements(values, unit, requested);
    if (!v.ok) { setError(v); if (v.field) { setSelected(v.field); inputs.current[v.field]?.focus(); } return; }
    setBusy(true); setError(null);
    try {
      let key = store?.key(`m:${date}`);
      if (!key) { key = sendKey(); store?.setKey(`m:${date}`, key); }
      const res = await sendWithRetry(onSubmit, { ...measurementsPayload(values, unit, date), client_key: key });
      store?.setKey(`m:${date}`, null);
      if (!res?.ok) throw new Error(res?.reason === "too_many" ? "You've sent measurements a few times today already. Your coach has them." : res?.reason === "out_of_range" ? "One of the numbers looks off. Please check it." : "Could not send. Try again in a moment.");
      onSent({ count: added + (values.weight ? 1 : 0), date });
    } catch (e) { setError({ error: isNetworkError(e) ? "No connection just now. Your numbers are still here — tap Send again when you have signal." : e.message }); }
    finally { setBusy(false); }
  }

  return (
    <>
      <main className="lk-main">
        <Byline coach={d.coach_name} units={d.unit_system} onUnits={d.onUnits} />
        <div className="lk-intro">
          <div className="lk-eyebrow">Body check-in</div>
          <h1 className="lk-h1">Body measurements.</h1>
          <p className="lk-lede">Hi {first}. Add the measurements your coach asked for, or any you have. Everything is optional. No app or account needed.</p>
        </div>

        <div className="lk-grid2">
          <label className="lk-field">Measured on<input className="lk-input" type="date" value={date} max={isoToday()} onChange={(e) => setDate(e.target.value || isoToday())} /></label>
          <div className="lk-field">Units<div className="lk-segment" role="group" aria-label="Units">
            <button type="button" aria-pressed={unit === "metric"} onClick={() => setUnit("metric")}>cm / kg</button>
            <button type="button" aria-pressed={unit === "imperial"} onClick={() => setUnit("imperial")}>in / lb</button>
          </div></div>
        </div>

        <div className="lk-card">
          <div className="lk-row"><span className="lk-eyebrow">Where to measure</span><span className="lk-small">Measuring guide</span></div>
          <BodyFigure requested={fields.map((f) => f.id)} selected={selected} onSelect={show} />
          <div className="lk-small" style={{ textAlign: "center" }}>Tap a label to see how to measure.</div>
          {guide && (
            <div className="lk-guide">
              <span className="lk-guide-n">{String(fields.findIndex((f) => f.id === guide.id) + 1).padStart(2, "0")}</span>
              <div><h3>{guide.label}</h3><p>{guide.hint}</p><span className="lk-small">Use a soft measuring tape.</span></div>
            </div>
          )}
        </div>

        <div>
          <div className="lk-row" style={{ marginBottom: 12 }}><span style={{ fontSize: 20, fontWeight: 700 }}>Your measurements</span><span className="lk-small">{added ? `${added} added` : "All optional"}</span></div>
          <div className="lk-fields">
            {askedList.map(fieldBox)}
            <div className={`lk-numfield ${selected === "weight" ? "on" : ""} ${error?.field === "weight" ? "bad" : ""}`} onClick={() => pick("weight")}>
              <span className="lab">Body weight</span>
              <span className="val"><input ref={(el) => { inputs.current.weight = el; }} inputMode="decimal" placeholder="—" value={values.weight || ""} onChange={(e) => setVal("weight", e.target.value)} onFocus={() => setSelected("weight")} aria-label={`Body weight in ${wUnit}`} /><span className="unit">{wUnit}</span></span>
            </div>
          </div>
          {more ? (
            MEASUREMENT_GROUPS.map((g) => {
              const list = extraList.filter((f) => f.group === g);
              if (!list.length) return null;
              return <div key={g} className="lk-moregroup"><span className="lk-eyebrow">{g}</span><div className="lk-fields">{list.map(fieldBox)}</div></div>;
            })
          ) : extraList.length ? <div className="lk-fields" style={{ marginTop: 12 }}>{extraList.map(fieldBox)}</div> : null}
          {MEASUREMENT_FIELDS.length > requested.length && (
            <button type="button" className="lk-morebtn" onClick={() => setMore((x) => !x)} aria-expanded={more}>
              {more ? "Show fewer" : <><Icon.Plus size={16} />Add more measurements<small>Neck, shoulders, right arm, calves, body fat…</small></>}
            </button>
          )}
        </div>
        <div className="lk-small">Measure without pulling the tape tight.</div>
        {error && <div className="lk-error" role="alert">{error.error}</div>}
        <div className="lk-note"><Icon.Lock size={16} /><span>Shared with Coach {d.coach_name} only. Your previous measurements aren't shown on this link.</span></div>
      </main>
      <div className="lk-footer"><div className="lk-footer-inner">
        <button type="button" className="lk-send" onClick={send} disabled={busy}><Icon.Send size={20} />{busy ? "Sending…" : "Send measurements"}</button>
      </div></div>
    </>
  );
}

// ── After sending ──────────────────────────────────────────────────────────
/** Counts from `from` up to `to` once, so the new number lands instead of just appearing. */
function useCountUp(from, to) {
  const [n, setN] = React.useState(from);
  React.useEffect(() => {
    if (to <= from || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setN(to); return; }
    let cur = from;
    const t = setInterval(() => { cur += 1; setN(cur); if (cur >= to) clearInterval(t); }, Math.max(90, 500 / (to - from)));
    return () => clearInterval(t);
  }, [from, to]);
  return n;
}

function StreakChip({ st }) {
  if (!st || st.current < 2) return null;
  const newBest = st.doneToday && st.current >= 3 && st.current >= st.best;
  const cls = st.atRisk ? "risk" : st.doneToday ? "solid" : "";
  return (
    <span className={`lk-streak ${cls}`} title={`${st.current} workouts in a row${st.best > st.current ? `, best ${st.best}` : ""}`}>
      <Icon.Flame size={12} />
      {st.atRisk ? `${st.current} days · keep it going today` : newBest ? `${st.current} · new best` : streakLabel(st.current)}
    </span>
  );
}

/** The next planned training day after `from`: { label, type } or null. */
function nextTraining(plan, from = new Date()) {
  for (let i = 1; i <= 7; i++) {
    const x = new Date(from); x.setDate(from.getDate() + i);
    const day = plan?.[dayKeyOf(x)];
    if (day?.type && day.type !== "Rest" && (day.exercises || []).length) return { label: i === 1 ? "Tomorrow" : DAY_LONG[dayKeyOf(x)], type: day.type };
  }
  return null;
}

function Receipt({ sent, coach, today, plan, doneDates, onBack, joined = false }) {
  const s = sent.summary;
  const st = sent.kind === "workout" && s.date ? streakWith(doneDates, s.date, plan) : null;
  const showStreak = Boolean(st && st.current >= 2);
  const shown = useCountUp(showStreak ? Math.min(s.streakBefore ?? st.current, st.current) : 0, showStreak ? st.current : 0);
  const newBest = showStreak && st.current >= 3 && st.current >= st.best;
  const R = 76, C = 2 * Math.PI * R;
  const fill = showStreak ? Math.min(1, st.current / Math.max(st.best, st.current, 1)) : 0;
  const next = showStreak ? nextTraining(plan) : null;
  return (
    <div className="lk-page cx-app">
      <div className="lk-center">
        {showStreak ? (
          <>
            <div className="lk-ring" role="img" aria-label={`${st.current} workouts in a row`}>
              <svg width="168" height="168" viewBox="0 0 168 168"><circle cx="84" cy="84" r={R} fill="none" stroke="var(--cx-bd)" strokeWidth="8" /><circle className="lk-ring-fill" cx="84" cy="84" r={R} fill="none" stroke="var(--cx-a)" strokeWidth="8" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - fill)} style={{ "--c": C }} /></svg>
              <div className="lk-ring-in"><Icon.Flame size={28} /><b>{shown}</b><span>{st.current === 1 ? "workout" : "workouts"}<br />in a row</span></div>
            </div>
            <div className="lk-small">{newBest ? "That's your best streak yet." : `${st.best - st.current} more day${st.best - st.current === 1 ? "" : "s"} to match your best of ${st.best}.`}</div>
          </>
        ) : <div className="lk-mark"><Icon.Check size={34} /></div>}
        <h1>Sent to Coach {coach}.</h1>
        <p>{sent.kind === "measurements"
          ? `Your ${s.count} measurement${s.count === 1 ? "" : "s"} from ${new Date(s.date + "T12:00:00").toLocaleDateString("en-US", { day: "numeric", month: "long" })} ${s.count === 1 ? "is" : "are"} with your coach now.`
          : `${s.day}'s ${s.type} workout, ${s.done} of ${s.planned} ${s.what} done. Your coach can see it now.`}</p>
        {showStreak && (
          <div className="lk-tiles">
            <div><span>Streak</span><b className="a">{st.current}</b></div>
            <div><span>Best</span><b>{Math.max(st.best, st.current)}</b></div>
            <div><span>This month</span><b>{st.thisMonth}</b></div>
          </div>
        )}
        <div className="lk-card lk-keep"><Icon.Link size={20} /><span style={{ fontSize: 15, color: "var(--cx-tx2)", lineHeight: 1.45 }}>{next
          ? `Keep this link. ${next.label} is ${next.type}; tick it to make ${st.current + 1}.`
          : "Keep this link. Open it on training days to tick off your workout, and come back when your coach asks for measurements."}</span></div>
        <div style={{ flex: 1 }} />
        <button type="button" className="lk-send secondary" onClick={onBack}>{sent.kind === "measurements" && !today.isRest ? "Go to today's workout" : "Back"}</button>
        {joined
          ? <div className="lk-nudge"><span>Your plan stays open on this link — any day, any time.</span></div>
          : <div className="lk-nudge"><span>Want your whole plan on your phone?</span> <b className="soon">App coming soon</b></div>}
      </div>
    </div>
  );
}

function Unavailable({ reason }) {
  const revoked = reason === "revoked";
  return (
    <div className="lk-page cx-app">
      <div className="lk-center">
        <div className="lk-mark muted"><Icon.Lock size={30} /></div>
        <h1>{revoked ? "This link has been turned off." : reason === "server" || reason === "network" ? "Couldn't load this right now." : "This link doesn't work."}</h1>
        <p>{revoked ? "Your coach may have sent you a new one. Check your messages."
          : reason === "network" ? "Couldn't reach Theryn. Check your connection and try again."
          : reason === "server" ? "Theryn had a problem on our side. Your link is fine. Try again in a minute."
          : "Check the link your coach sent you, or ask them to send it again."}</p>
        <div className="lk-nudge"><a href={APP_URL}>About Theryn</a></div>
      </div>
    </div>
  );
}
