import React from "react";
import "../coach/coach.css";
import "./link.css";
import BodyFigure from "./BodyFigure.jsx";
import { Icon } from "../coach/ui/primitives.jsx";
import { TYPE_COLORS } from "../components/templates/tokens.js";
import { convertPlan, convertWeight } from "../coach/lib/units.js";
import { MEASUREMENT_FIELDS, ALL_FIELD_IDS, DAY_ORDER, DAY_LONG, todayFromPlan, validateMeasurements, measurementsPayload, workoutPayload, planUnits, dayKeyOf, requiredFields, doneSets } from "../coach/lib/clientLinks.js";
import { fetchLink as realFetch, submitLink as realSubmit } from "./linkApi.js";

const APP_URL = "https://theryn.fit";
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const isoToday = () => isoOf(new Date());
const dateOf = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d, 12); };
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
    units: () => { const u = read().units; return u === "metric" || u === "imperial" ? u : null; },
    setUnits: (u) => write({ ...read(), units: u }),
    // What they did last time, per exercise, so the page can show it. Kept on this phone.
    last: (name) => read().last?.[String(name || "").toLowerCase()] || null,
    saveLast: (entries) => { const s = read(); const last = { ...(s.last || {}) }; for (const [k, v] of Object.entries(entries)) last[k] = v; const keep = Object.entries(last).sort(([, a], [, b]) => (a.date < b.date ? 1 : -1)).slice(0, 80); write({ ...s, last: Object.fromEntries(keep) }); },
    markSent: (date, info) => { const s = read(); const drafts = { ...s.drafts }; delete drafts[date]; write({ ...s, drafts, sent: keepRecent({ ...s.sent, [date]: info }) }); },
  };
}

/** Days the client can log: today, then the last six days that had a workout planned. */
function loggableDays(plan, now = new Date()) {
  const out = [{ iso: isoOf(now), label: "Today" }];
  for (let i = 1; i <= 6; i++) {
    const d = new Date(now); d.setDate(now.getDate() - i); d.setHours(12, 0, 0, 0);
    const day = plan?.[dayKeyOf(d)];
    if (!day?.type || day.type === "Rest" || !(day.exercises || []).length) continue;
    out.push({ iso: isoOf(d), label: i === 1 ? "Yesterday" : `${dayKeyOf(d)} ${d.getDate()}`, type: day.type });
  }
  return out;
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
 * No account, no history. Two tabs: today's workout and measurements.
 */
export default function LinkPage({ token, api }) {
  const fetchLink = api?.fetchLink || realFetch;
  const submitLink = api?.submitLink || realSubmit;
  const [state, setState] = React.useState({ loading: true, data: null, error: null });
  const [tab, setTab] = React.useState(() => (new URLSearchParams(window.location.search).get("tab") === "measurements" ? "measurements" : "workout"));
  const [sent, setSent] = React.useState(null); // { kind, summary }
  const store = React.useMemo(() => linkStore(token), [token]);
  const [logDate, setLogDate] = React.useState(isoToday); // which day's workout is being logged
  // The client's own kg/lb, remembered on this phone. Until they pick, the plan's units.
  const [units, setUnitsState] = React.useState(() => linkStore(token).units());
  const setUnits = React.useCallback((u) => { setUnitsState(u); store.setUnits(u); }, [store]);

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

  if (state.loading) return <div className="lk-page"><div className="lk-center"><div className="cx-spinner" /></div></div>;
  if (state.error || !state.data?.ok) return <Unavailable reason={state.error} />;
  // The coach's editor stamps the plan with the units the coach typed in; the
  // client sees every target converted to their own.
  const coachUnits = planUnits(state.data.plan) || state.data.unit_system || "imperial";
  const clientUnits = units || coachUnits;
  const d = { ...state.data, plan: convertPlan(state.data.plan, clientUnits, { assumeFrom: coachUnits }), unit_system: clientUnits, onUnits: setUnits };
  const today = todayFromPlan(d.plan);
  const logging = logDate === isoToday() ? today : todayFromPlan(d.plan, dateOf(logDate));

  if (sent) return <Receipt sent={sent} coach={d.coach_name} today={today} onBack={() => { setSent(null); setTab("workout"); setLogDate(isoToday()); window.scrollTo(0, 0); }} />;

  return (
    <div className="lk-page cx-app">
      <div className="lk-tabs" role="tablist">
        <button type="button" role="tab" className="lk-tab" aria-selected={tab === "workout"} onClick={() => setTab("workout")}>Today's workout</button>
        <button type="button" role="tab" className="lk-tab" aria-selected={tab === "measurements"} onClick={() => setTab("measurements")}>Measurements</button>
      </div>
      {tab === "workout"
        ? <WorkoutTab key={`${logDate}:${clientUnits}`} d={d} today={logging} date={logDate} days={loggableDays(d.plan)} onPickDate={setLogDate} store={store} onSubmit={(payload) => submitLink(token, "workout", payload)} onSent={(summary) => setSent({ kind: "workout", summary })} onMeasure={() => setTab("measurements")} />
        : <MeasurementsTab d={d} onSubmit={(payload) => submitLink(token, "measurements", payload)} onSent={(summary) => setSent({ kind: "measurements", summary })} />}
    </div>
  );
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

/** "Mon 14" from an ISO date. */
function shortDay(iso) { const x = dateOf(iso); return `${dayKeyOf(x)} ${x.getDate()}`; }
/** "8×40, 7×40, 6×37.5 kg": what they did last time, in today's units. */
function lastLine(last, units) {
  const sets = (last.sets || []).map((x) => {
    const w = x.w !== "" && x.w != null ? convertWeight(x.w, last.units || units, units) : null;
    return `${x.r || "?"}${w != null ? `×${w}` : ""}`;
  });
  const any = (last.sets || []).some((x) => x.w !== "" && x.w != null);
  return `${sets.join(", ")}${any ? ` ${units === "metric" ? "kg" : "lb"}` : " reps"}`;
}

function Byline({ coach, units, onUnits }) {
  return (
    <div className="lk-byline">
      <span className="cx-avatar cx-avatar-sm" aria-hidden="true">{(coach || "C")[0]}</span><span style={{ flex: 1 }}>From your coach, <b>{coach}</b></span>
      {onUnits && (
        <span className="lk-units" role="group" aria-label="Units">
          <button type="button" aria-pressed={units === "metric"} onClick={() => onUnits("metric")}>kg</button>
          <button type="button" aria-pressed={units !== "metric"} onClick={() => onUnits("imperial")}>lb</button>
        </span>
      )}
    </div>
  );
}

// ── Today's workout ────────────────────────────────────────────────────────
function WorkoutTab({ d, today, date = isoToday(), days = [], onPickDate, store = null, onSubmit, onSent, onMeasure, controlledTicks }) {
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
  // exerciseIndex → setIndex → { r, w }: reps and weight the client typed (blank = as planned)
  const [log, setLog] = React.useState(() => draft?.log || {});
  const [skipped, setSkipped] = React.useState(() => draft?.skipped || {});
  const [note, setNote] = React.useState(() => draft?.note || "");
  const [picking, setPicking] = React.useState(false);
  const isToday = date === isoToday();
  const upcoming = date > isoToday(); // a day later this week: show the plan, nothing to tick yet
  const realToday = dayKeyOf(new Date());
  // This week's dates, Monday first, so each day in the strip can be opened.
  const weekDates = React.useMemo(() => { const now = new Date(); const js = now.getDay(); const mon = new Date(now); mon.setDate(now.getDate() - (js === 0 ? 6 : js - 1)); return DAY_ORDER.map((_, i) => { const x = new Date(mon); x.setDate(mon.getDate() + i); return isoOf(x); }); }, []);
  const sentBefore = store?.sent(date) || null;
  // Save every tick as it happens.
  React.useEffect(() => {
    if (!store || controlledTicks || upcoming) return;
    store.saveDraft(date, { day: today.key, type: today.type, units: d.unit_system, ticks, log, skipped, note });
  }, [store, date, today.key, today.type, d.unit_system, ticks, log, skipped, note, controlledTicks, upcoming]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const first = d.first_name;
  const color = TYPE_COLORS[today.type] || "var(--cx-tx2)";
  const total = today.exercises.length;
  const doneCount = today.exercises.filter((e, i) => (e.sets ? (ticks[i] || 0) >= e.sets : (ticks[i] || 0) > 0)).length;
  const currentIdx = today.exercises.findIndex((e, i) => !skipped[i] && !(e.sets ? (ticks[i] || 0) >= e.sets : (ticks[i] || 0) > 0));
  const anything = Object.values(ticks).some((n) => n > 0);
  const unit = d.unit_system === "metric" ? "kg" : "lb";

  // Tap the numbered box: complete the whole exercise; tap again to undo.
  const toggleExercise = (i) => {
    const e = today.exercises[i];
    const full = e.sets || 1;
    setTicks((t) => ({ ...t, [i]: (t[i] || 0) >= full ? 0 : full }));
    setSkipped((s) => ({ ...s, [i]: false }));
  };
  const setSets = (i, n) => { setTicks((t) => ({ ...t, [i]: n })); setSkipped((s) => ({ ...s, [i]: false })); };
  // Typing reps or weight for a set means it was done: tick it (and the ones before it).
  const setSetValue = (i, si, field, raw) => {
    const v = field === "r" ? raw.replace(/[^0-9]/g, "").slice(0, 3) : raw.replace(/[^0-9.]/g, "").slice(0, 6);
    setLog((l) => ({ ...l, [i]: { ...(l[i] || {}), [si]: { ...(l[i]?.[si] || {}), [field]: v } } }));
    if (v !== "") { setTicks((t) => ({ ...t, [i]: Math.max(t[i] || 0, si + 1) })); setSkipped((s) => ({ ...s, [i]: false })); }
  };

  async function send() {
    setBusy(true); setError(null);
    try {
      const payload = workoutPayload(today, ticks, log, note, date, d.unit_system);
      const res = await onSubmit(payload);
      if (!res?.ok) throw new Error(res?.reason === "too_many" ? "You've sent 3 workouts in the last 24 hours already. Your coach has them." : "Could not send. Try again in a moment.");
      store?.markSent(date, { at: Date.now(), day: today.key, type: today.type });
      store?.saveLast(Object.fromEntries(payload.exercises.filter((x) => x.sets_done > 0).map((x) => [String(x.name).toLowerCase(), { date, units: d.unit_system, sets: doneSets(x) }])));
      const setsPlanned = payload.exercises.reduce((a, e) => a + (e.sets_planned || 0), 0);
      const setsDone = payload.exercises.reduce((a, e) => a + e.sets_done, 0);
      onSent(setsPlanned > 0
        ? { day: DAY_LONG[today.key], type: today.type, done: setsDone, planned: setsPlanned, what: "sets" }
        : { day: DAY_LONG[today.key], type: today.type, done: payload.exercises.filter((e) => e.sets_done > 0).length, planned: payload.exercises.length, what: "exercises" });
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <main className="lk-main">
        <Byline coach={d.coach_name} units={d.unit_system} onUnits={d.onUnits} />
        <div className="lk-intro">
          <div className="lk-eyebrow">{isToday ? longDate() : upcoming ? `Coming up · ${longDate(dateOf(date))}` : `Logging ${longDate(dateOf(date))}`}</div>
          {today.isRest
            ? <h1 className="lk-h1">Rest day.</h1>
            : <h1 className="lk-h1">Your <span style={{ color }}>{today.type.toLowerCase()}</span> day.</h1>}
          <p className="lk-lede">{today.isRest
            ? (!isToday ? `Hi ${first}. Nothing is planned for ${DAY_LONG[today.key]}.` : today.next ? `Hi ${first}. Nothing planned today. Next up is ${DAY_LONG[today.next.key]}, ${today.next.type}.` : `Hi ${first}. No workouts are planned yet. Your coach will add them.`)
            : isToday ? `Hi ${first}. Follow your coach's plan and tick off each exercise.`
            : upcoming ? `Hi ${first}. Here's ${DAY_LONG[today.key]}'s plan. You can tick it off on the day.`
            : `Hi ${first}. Tick off what you did on ${DAY_LONG[today.key]} and send it to your coach.`}</p>
        </div>

        {days.length > 1 && picking ? (
          <div className="lk-daypick" role="group" aria-label="Which day are you logging?">
            {days.map((x) => (
              <button key={x.iso} type="button" className="lk-daychip" aria-pressed={x.iso === date} onClick={() => { onPickDate?.(x.iso); setPicking(false); }}>
                {x.label}{x.type ? <small>{x.type}</small> : null}
              </button>
            ))}
          </div>
        ) : null}

        {d.plan && (
          <section aria-label="This week">
            <div className="lk-row" style={{ marginBottom: 10 }}><span className="lk-eyebrow">This week</span><span className="lk-small">{weekRange()}</span></div>
            <div className="lk-week" role="group" aria-label="Pick a day">
              {DAY_ORDER.map((k, i) => {
                const day = d.plan[k]; const t = day?.type && day.type !== "Rest" && (day.exercises || []).length ? day.type : "Rest";
                const c = t === "Rest" ? undefined : TYPE_COLORS[t];
                const iso = weekDates[i];
                return (
                  <button key={k} type="button" className={`lk-day ${t === "Rest" ? "rest" : ""} ${k === realToday ? "today" : ""} ${iso === date ? "selected" : ""}`} style={c ? { "--day": c } : undefined}
                    aria-pressed={iso === date} aria-label={`${DAY_LONG[k]}, ${t}${k === realToday ? ", today" : ""}`} onClick={() => { onPickDate?.(iso); setPicking(false); }}>
                    <span>{k}</span><i /><b>{t}</b>{k === realToday && <small>Today</small>}
                  </button>
                );
              })}
            </div>
            <div className="lk-row" style={{ marginTop: 8 }}>
              <span className="lk-small">Tap a day to see its workout.</span>
              {days.length > 1 && !picking && <button type="button" className="lk-linkbtn" style={{ minHeight: 32, fontSize: 13 }} onClick={() => setPicking(true)}>Earlier days</button>}
            </div>
          </section>
        )}

        {!today.isRest && (
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
              <div className="lk-row" style={{ marginBottom: 8 }}><span style={{ fontSize: 16, fontWeight: 700 }}>{doneCount} of {total} complete</span><span className="lk-small">Tap the box to tick it off</span></div>
              <div className="lk-progress"><i style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }} /></div>
            </div>}

            {today.exercises.map((e, i) => {
              const full = e.sets || 1;
              const n = ticks[i] || 0;
              const done = n >= full;
              const isCurrent = i === currentIdx;
              const last = store?.last(e.name);
              return (
                <div key={i} className={`lk-card lk-ex ${done ? "done" : ""}`} style={isCurrent ? { borderColor: "var(--cx-bd2)" } : undefined}>
                  <div className="lk-ex-head">
                    <button type="button" className={`lk-tick ${done ? "on" : n > 0 ? "partial" : isCurrent ? "current" : ""}`} aria-pressed={done} aria-label={upcoming ? e.name : `${done ? "Undo" : "Mark done"}: ${e.name}`} disabled={upcoming} onClick={() => toggleExercise(i)}>
                      {done ? <Icon.Check size={22} /> : n > 0 ? `${n}/${full}` : String(i + 1).padStart(2, "0")}
                    </button>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                      <div className="lk-ex-name">{e.name}</div>
                      <div className="lk-ex-meta">
                        {e.sets != null && <><b>{e.sets}</b> sets &nbsp; </>}
                        {e.reps && <><b>{e.reps}</b> reps &nbsp; </>}
                        {e.weight != null && <><b>{e.weight}</b> {unit} target</>}
                      </div>
                      {e.note && <div className="lk-ex-note">{e.note}</div>}
                      {last && <div className="lk-last">Last time ({shortDay(last.date)}): {lastLine(last, d.unit_system)}</div>}
                      {skipped[i] && !done && <div className="lk-small">Skipped</div>}
                    </div>
                  </div>
                  {/* Every set, with the coach's reps and weight in grey. Type over them only if you did something different. */}
                  <div className={`lk-setrows ${upcoming ? "readonly" : ""}`} role="group" aria-label={`Sets for ${e.name}`}>
                    <div className="lk-setrow head"><span>Set</span><span>Reps</span><span>{unit}</span><span>{upcoming ? "" : "Done"}</span></div>
                    {Array.from({ length: full }, (_, si) => (
                      <div key={si} className={`lk-setrow ${si < n ? "on" : ""}`}>
                        <span className="lk-setno">{si + 1}</span>
                        <input className="lk-setin" inputMode="numeric" placeholder={e.reps || "—"} value={log[i]?.[si]?.r || ""} disabled={upcoming} onChange={(ev) => setSetValue(i, si, "r", ev.target.value)} aria-label={`Set ${si + 1} reps${e.reps ? `, plan ${e.reps}` : ""}`} />
                        <input className="lk-setin" inputMode="decimal" placeholder={e.weight != null ? String(e.weight) : "—"} value={log[i]?.[si]?.w || ""} disabled={upcoming} onChange={(ev) => setSetValue(i, si, "w", ev.target.value)} aria-label={`Set ${si + 1} weight in ${unit}${e.weight != null ? `, plan ${e.weight}` : ""}`} />
                        {upcoming ? <span /> : <button type="button" className={`lk-set ${si < n ? "on" : ""}`} aria-pressed={si < n} aria-label={`Set ${si + 1} done`} onClick={() => setSets(i, si + 1 === n ? si : si + 1)}>{si < n ? <Icon.Check size={14} /> : null}</button>}
                      </div>
                    ))}
                  </div>
                  {!upcoming && <div className="lk-ex-actions">
                    <span className="lk-small">{n > 0 && n < full ? `${n} of ${full} sets done` : ""}</span>
                    {done
                      ? <button type="button" className="lk-linkbtn danger" onClick={() => toggleExercise(i)}>Undo</button>
                      : skipped[i]
                      ? <button type="button" className="lk-linkbtn danger" onClick={() => setSkipped((s) => ({ ...s, [i]: false }))}>Undo skip</button>
                      : <button type="button" className="lk-linkbtn danger" onClick={() => { setSkipped((s) => ({ ...s, [i]: true })); setTicks((t) => ({ ...t, [i]: 0 })); }}>Skip</button>}
                  </div>}
                </div>
              );
            })}

            {!upcoming && <>
            <div>
              <div className="lk-row" style={{ marginBottom: 10 }}><span style={{ fontSize: 20, fontWeight: 700 }}>How did it feel?</span><span className="lk-small">Optional</span></div>
              <textarea className="lk-textarea" value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} placeholder="Anything you'd like your coach to know…" aria-label="How did it feel?" />
            </div>
            <div className="lk-small">Grey numbers are your coach's plan. Tick each set you did, and type over the numbers only if you did something different.</div>
            </>}
            {sentBefore && <div className="lk-sentnote" role="status"><Icon.Check size={16} /><span>You sent {isToday ? "today's" : `${DAY_LONG[sentBefore.day] || "this"}'s`} workout to Coach {d.coach_name} at {clock(sentBefore.at)}. Sending again gives your coach a second entry.</span></div>}
            {error && <div className="lk-error" role="alert">{error}</div>}
          </>
        )}

        {today.isRest && (
          <div className="lk-card">
            <span style={{ fontSize: 16, fontWeight: 700 }}>Want to send measurements instead?</span>
            <button type="button" className="lk-send secondary" onClick={onMeasure}>Go to Measurements</button>
          </div>
        )}
      </main>
      {!today.isRest && upcoming && (
        <div className="lk-footer"><div className="lk-footer-inner">
          <button type="button" className="lk-send secondary" onClick={() => onPickDate?.(isoToday())}>Back to today</button>
        </div></div>
      )}
      {!today.isRest && !upcoming && (
        <div className="lk-footer"><div className="lk-footer-inner">
          <button type="button" className="lk-send" onClick={send} disabled={busy || !anything}><Icon.Check size={20} />{busy ? "Sending…" : sentBefore ? "Send again" : isToday ? "Finish workout" : `Send ${DAY_LONG[today.key]}'s workout`}</button>
          {!anything && <div className="lk-small" style={{ textAlign: "center", marginTop: 8 }}>Tick at least one exercise to send.</div>}
        </div></div>
      )}
    </>
  );
}

// ── Measurements ───────────────────────────────────────────────────────────
function MeasurementsTab({ d, onSubmit, onSent, controlledValues }) {
  // Every measurement is on the page. The ones the coach ticked are required;
  // the rest are optional. An empty list means everything is optional.
  const requested = requiredFields(d.requested);
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
  const fields = MEASUREMENT_FIELDS;
  const guide = MEASUREMENT_FIELDS.find((f) => f.id === selected) || fields[0];
  const added = fields.filter((f) => values[f.id] != null && String(values[f.id]).trim() !== "").length;

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
      const res = await onSubmit(measurementsPayload(values, unit, date));
      if (!res?.ok) throw new Error(res?.reason === "too_many" ? "You've sent measurements a few times today already. Your coach has them." : res?.reason === "out_of_range" ? "One of the numbers looks off. Please check it." : "Could not send. Try again in a moment.");
      onSent({ count: added + (values.weight ? 1 : 0), date });
    } catch (e) { setError({ error: e.message }); }
    finally { setBusy(false); }
  }

  return (
    <>
      <main className="lk-main">
        <Byline coach={d.coach_name} units={d.unit_system} onUnits={d.onUnits} />
        <div className="lk-intro">
          <div className="lk-eyebrow">Body check-in</div>
          <h1 className="lk-h1">Body measurements.</h1>
          <p className="lk-lede">Hi {first}. {requested.length ? "Add the measurements your coach asked for, and any others you like." : "Add whichever measurements you have."} No app or account needed.</p>
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
          <BodyFigure requested={ALL_FIELD_IDS} selected={selected} onSelect={show} />
          <div className="lk-small" style={{ textAlign: "center" }}>Tap a label to see how to measure.</div>
          {guide && (
            <div className="lk-guide">
              <span className="lk-guide-n">{String(fields.findIndex((f) => f.id === guide.id) + 1).padStart(2, "0")}</span>
              <div><h3>{guide.label}</h3><p>{guide.hint}</p><span className="lk-small">Use a soft measuring tape.</span></div>
            </div>
          )}
        </div>

        <div>
          <div className="lk-row" style={{ marginBottom: 12 }}><span style={{ fontSize: 20, fontWeight: 700 }}>Your measurements</span><span className="lk-small">{requested.length ? `${requested.filter((id) => values[id] != null && String(values[id]).trim() !== "").length} / ${requested.length} required added` : `${added} added`}</span></div>
          <div className="lk-fields">
            {fields.map((f) => (
              <div key={f.id} className={`lk-numfield ${selected === f.id ? "on" : ""} ${error?.field === f.id ? "bad" : ""}`} onClick={() => pick(f.id)}>
                <span className="lab">{f.label} {requested.includes(f.id) ? <em>*</em> : <small>Optional</small>}</span>
                <span className="val"><input ref={(el) => { inputs.current[f.id] = el; }} inputMode="decimal" placeholder="—" value={values[f.id] || ""} onChange={(e) => setVal(f.id, e.target.value)} onFocus={() => setSelected(f.id)} aria-label={`${f.label} in ${lenUnit}`} /><span className="unit">{lenUnit}</span></span>
              </div>
            ))}
            <div className={`lk-numfield ${selected === "weight" ? "on" : ""} ${error?.field === "weight" ? "bad" : ""}`} onClick={() => pick("weight")}>
              <span className="lab">Body weight <small>Optional</small></span>
              <span className="val"><input ref={(el) => { inputs.current.weight = el; }} inputMode="decimal" placeholder="—" value={values.weight || ""} onChange={(e) => setVal("weight", e.target.value)} onFocus={() => setSelected("weight")} aria-label={`Body weight in ${wUnit}`} /><span className="unit">{wUnit}</span></span>
            </div>
          </div>
        </div>
        <div className="lk-small">{requested.length ? "* Asked for by your coach. " : ""}Measure without pulling the tape tight.</div>
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
function Receipt({ sent, coach, today, onBack }) {
  const s = sent.summary;
  return (
    <div className="lk-page cx-app">
      <div className="lk-center">
        <div className="lk-mark"><Icon.Check size={34} /></div>
        <h1>Sent to Coach {coach}.</h1>
        <p>{sent.kind === "measurements"
          ? `Your ${s.count} measurement${s.count === 1 ? "" : "s"} from ${new Date(s.date + "T12:00:00").toLocaleDateString("en-US", { day: "numeric", month: "long" })} are with your coach now.`
          : `${s.day}'s ${s.type} workout, ${s.done} of ${s.planned} ${s.what} done. Your coach can see it now.`}</p>
        <div className="lk-card lk-keep"><Icon.Link size={20} /><span style={{ fontSize: 15, color: "var(--cx-tx2)", lineHeight: 1.45 }}>Keep this link. Open it on training days to tick off your workout, and come back when your coach asks for measurements.</span></div>
        <div style={{ flex: 1 }} />
        <button type="button" className="lk-send secondary" onClick={onBack}>{sent.kind === "measurements" && !today.isRest ? "Go to today's workout" : "Back"}</button>
        <div className="lk-nudge"><span>Want your whole plan on your phone?</span> <a href={APP_URL}>Get the app</a></div>
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
