import React from "react";
import "../coach/coach.css";
import "./link.css";
import BodyFigure from "./BodyFigure.jsx";
import { Icon } from "../coach/ui/primitives.jsx";
import { TYPE_COLORS } from "../components/templates/tokens.js";
import { MEASUREMENT_FIELDS, ALL_FIELD_IDS, DAY_ORDER, DAY_LONG, todayFromPlan, validateMeasurements, measurementsPayload, workoutPayload } from "../coach/lib/clientLinks.js";
import { fetchLink as realFetch, submitLink as realSubmit } from "./linkApi.js";

const APP_URL = "https://theryn.fit";
const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
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

  React.useEffect(() => {
    let cancelled = false;
    fetchLink(token).then((d) => { if (!cancelled) setState({ loading: false, data: d, error: d?.ok ? null : d?.reason || "invalid" }); })
      .catch((e) => { if (!cancelled) setState({ loading: false, data: null, error: e.message || "network" }); });
    return () => { cancelled = true; };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    document.title = "Your coach sent you a form · Theryn";
    document.body.dataset.app = "link";
    return () => { delete document.body.dataset.app; };
  }, []);

  if (state.loading) return <div className="lk-page"><div className="lk-center"><div className="cx-spinner" /></div></div>;
  if (state.error || !state.data?.ok) return <Unavailable reason={state.error} />;
  const d = state.data;
  const today = todayFromPlan(d.plan);

  if (sent) return <Receipt sent={sent} coach={d.coach_name} today={today} onBack={() => { setSent(null); setTab("workout"); window.scrollTo(0, 0); }} />;

  return (
    <div className="lk-page cx-app">
      <div className="lk-tabs" role="tablist">
        <button type="button" role="tab" className="lk-tab" aria-selected={tab === "workout"} onClick={() => setTab("workout")}>Today's workout</button>
        <button type="button" role="tab" className="lk-tab" aria-selected={tab === "measurements"} onClick={() => setTab("measurements")}>Measurements</button>
      </div>
      {tab === "workout"
        ? <WorkoutTab d={d} today={today} onSubmit={(payload) => submitLink(token, "workout", payload)} onSent={(summary) => setSent({ kind: "workout", summary })} onMeasure={() => setTab("measurements")} />
        : <MeasurementsTab d={d} onSubmit={(payload) => submitLink(token, "measurements", payload)} onSent={(summary) => setSent({ kind: "measurements", summary })} />}
    </div>
  );
}

function Byline({ coach }) {
  return <div className="lk-byline"><span className="cx-avatar cx-avatar-sm" aria-hidden="true">{(coach || "C")[0]}</span><span>From your coach, <b>{coach}</b></span></div>;
}

// ── Today's workout ────────────────────────────────────────────────────────
function WorkoutTab({ d, today, onSubmit, onSent, onMeasure }) {
  const [ticks, setTicks] = React.useState({});      // exerciseIndex → sets done
  const [weights, setWeights] = React.useState({});  // exerciseIndex → weight used
  const [openWeight, setOpenWeight] = React.useState({});
  const [skipped, setSkipped] = React.useState({});
  const [note, setNote] = React.useState("");
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

  async function send() {
    setBusy(true); setError(null);
    try {
      const payload = workoutPayload(today, ticks, weights, note, isoToday());
      const res = await onSubmit(payload);
      if (!res?.ok) throw new Error(res?.reason === "too_many" ? "You've sent this workout a few times today already. Your coach has it." : "Could not send. Try again in a moment.");
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
        <Byline coach={d.coach_name} />
        <div className="lk-intro">
          <div className="lk-eyebrow">{longDate()}</div>
          {today.isRest
            ? <h1 className="lk-h1">Rest day.</h1>
            : <h1 className="lk-h1">Your <span style={{ color }}>{today.type.toLowerCase()}</span> day.</h1>}
          <p className="lk-lede">{today.isRest
            ? (today.next ? `Hi ${first}. Nothing planned today. Next up is ${DAY_LONG[today.next.key]}, ${today.next.type}.` : `Hi ${first}. No workouts are planned yet. Your coach will add them.`)
            : `Hi ${first}. Follow your coach's plan and tick off each exercise.`}</p>
        </div>

        {d.plan && (
          <section aria-label="This week">
            <div className="lk-row" style={{ marginBottom: 10 }}><span className="lk-eyebrow">This week</span><span className="lk-small">{weekRange()}</span></div>
            <div className="lk-week">
              {DAY_ORDER.map((k) => {
                const day = d.plan[k]; const t = day?.type && day.type !== "Rest" && (day.exercises || []).length ? day.type : "Rest";
                const c = t === "Rest" ? undefined : TYPE_COLORS[t];
                return <div key={k} className={`lk-day ${t === "Rest" ? "rest" : ""} ${k === today.key ? "today" : ""}`} style={c ? { "--day": c } : undefined}><span>{k}</span><i /><b>{t}</b>{k === today.key && <small>Today</small>}</div>;
              })}
            </div>
          </section>
        )}

        {!today.isRest && (
          <>
            <div className="lk-card" style={{ flexDirection: "row", alignItems: "center" }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="lk-eyebrow">Today's plan</span>
                <span style={{ fontSize: 17, fontWeight: 700 }}>{total} exercise{total === 1 ? "" : "s"}{(() => { const s = today.exercises.reduce((a, e) => a + (e.sets || 0), 0); return s ? ` · ${s} sets` : ""; })()}</span>
                <span className="lk-small">Rest 60–90 sec between sets</span>
              </div>
              <span className="cx-pill" style={{ color, background: `${color}1A`, height: 32, fontSize: 13 }}>{today.type}</span>
            </div>

            <div>
              <div className="lk-row" style={{ marginBottom: 8 }}><span style={{ fontSize: 16, fontWeight: 700 }}>{doneCount} of {total} complete</span><span className="lk-small">Tap the box to tick it off</span></div>
              <div className="lk-progress"><i style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }} /></div>
            </div>

            {today.exercises.map((e, i) => {
              const full = e.sets || 1;
              const n = ticks[i] || 0;
              const done = n >= full;
              const isCurrent = i === currentIdx;
              return (
                <div key={i} className={`lk-card lk-ex ${done ? "done" : ""}`} style={isCurrent ? { borderColor: "var(--cx-bd2)" } : undefined}>
                  <div className="lk-ex-head">
                    <button type="button" className={`lk-tick ${done ? "on" : n > 0 ? "partial" : isCurrent ? "current" : ""}`} aria-pressed={done} aria-label={`${done ? "Undo" : "Mark done"}: ${e.name}`} onClick={() => toggleExercise(i)}>
                      {done ? <Icon.Check size={22} /> : n > 0 ? `${n}/${full}` : String(i + 1).padStart(2, "0")}
                    </button>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                      <div className="lk-ex-name">{e.name}</div>
                      <div className="lk-ex-meta">
                        {e.sets != null && <><b>{e.sets}</b> sets &nbsp; </>}
                        {e.reps && <><b>{e.reps}</b> reps &nbsp; </>}
                        {e.weight != null && <><b>{e.weight}</b> {unit} {weights[i] ? "target" : "target"}</>}
                      </div>
                      {e.note && <div className="lk-ex-note">{e.note}</div>}
                      {skipped[i] && !done && <div className="lk-small">Skipped</div>}
                    </div>
                  </div>
                  {e.sets > 1 && !done && (
                    <div className="lk-sets" aria-label="Sets done">
                      {Array.from({ length: e.sets }, (_, s) => (
                        <button key={s} type="button" className={`lk-set ${s < n ? "on" : ""}`} aria-pressed={s < n} aria-label={`Set ${s + 1}`} onClick={() => setSets(i, s + 1 === n ? s : s + 1)}>{s < n ? <Icon.Check size={14} /> : s + 1}</button>
                      ))}
                    </div>
                  )}
                  <div className="lk-ex-actions">
                    <button type="button" className="lk-linkbtn" onClick={() => setOpenWeight((o) => ({ ...o, [i]: !o[i] }))} aria-expanded={Boolean(openWeight[i])}>
                      Used a different weight? <Icon.Down size={14} />
                    </button>
                    {done
                      ? <button type="button" className="lk-linkbtn danger" onClick={() => toggleExercise(i)}>Undo</button>
                      : <button type="button" className="lk-linkbtn danger" onClick={() => { setSkipped((s) => ({ ...s, [i]: true })); setTicks((t) => ({ ...t, [i]: 0 })); }}>Skip</button>}
                  </div>
                  {openWeight[i] && (
                    <div className="lk-row" style={{ justifyContent: "flex-start" }}>
                      <input className="lk-weight" inputMode="decimal" placeholder={e.weight != null ? String(e.weight) : "0"} value={weights[i] || ""} onChange={(ev) => setWeights((w) => ({ ...w, [i]: ev.target.value.replace(/[^0-9.]/g, "").slice(0, 6) }))} aria-label={`Weight used for ${e.name}`} />
                      <span className="lk-small">{unit} used</span>
                    </div>
                  )}
                </div>
              );
            })}

            <div>
              <div className="lk-row" style={{ marginBottom: 10 }}><span style={{ fontSize: 20, fontWeight: 700 }}>How did it feel?</span><span className="lk-small">Optional</span></div>
              <textarea className="lk-textarea" value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} placeholder="Anything you'd like your coach to know…" aria-label="How did it feel?" />
            </div>
            <div className="lk-small">Your checkmarks tell your coach what you completed. Actual weights are optional.</div>
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
      {!today.isRest && (
        <div className="lk-footer"><div className="lk-footer-inner">
          <button type="button" className="lk-send" onClick={send} disabled={busy || !anything}><Icon.Check size={20} />{busy ? "Sending…" : "Finish workout"}</button>
          {!anything && <div className="lk-small" style={{ textAlign: "center", marginTop: 8 }}>Tick at least one exercise to send.</div>}
        </div></div>
      )}
    </>
  );
}

// ── Measurements ───────────────────────────────────────────────────────────
function MeasurementsTab({ d, onSubmit, onSent }) {
  const requested = (Array.isArray(d.requested) && d.requested.length ? d.requested : ALL_FIELD_IDS).filter((id) => ALL_FIELD_IDS.includes(id));
  const [unit, setUnit] = React.useState(d.unit_system === "metric" ? "metric" : "imperial");
  const [date, setDate] = React.useState(isoToday());
  const [values, setValues] = React.useState({});
  const [selected, setSelected] = React.useState(requested[0] || "chest");
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const inputs = React.useRef({});
  const first = d.first_name;
  const lenUnit = unit === "metric" ? "cm" : "in";
  const wUnit = unit === "metric" ? "kg" : "lb";
  const fields = MEASUREMENT_FIELDS.filter((f) => requested.includes(f.id));
  const guide = MEASUREMENT_FIELDS.find((f) => f.id === selected) || fields[0];
  const added = fields.filter((f) => values[f.id] != null && String(values[f.id]).trim() !== "").length;

  const pick = (id) => { setSelected(id); inputs.current[id]?.focus(); };
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
        <Byline coach={d.coach_name} />
        <div className="lk-intro">
          <div className="lk-eyebrow">Body check-in</div>
          <h1 className="lk-h1">Body measurements.</h1>
          <p className="lk-lede">Hi {first}. Add the measurements your coach asked for. No app or account needed.</p>
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
          <BodyFigure requested={requested} selected={selected} onSelect={pick} />
          <div className="lk-small" style={{ textAlign: "center" }}>Tap a label to see how to measure.</div>
          {guide && (
            <div className="lk-guide">
              <span className="lk-guide-n">{String(fields.findIndex((f) => f.id === guide.id) + 1).padStart(2, "0")}</span>
              <div><h3>{guide.label}</h3><p>{guide.hint}</p><span className="lk-small">Use a soft measuring tape.</span></div>
            </div>
          )}
        </div>

        <div>
          <div className="lk-row" style={{ marginBottom: 12 }}><span style={{ fontSize: 20, fontWeight: 700 }}>Your measurements</span><span className="lk-small">{added} / {fields.length} added</span></div>
          <div className="lk-fields">
            {fields.map((f) => (
              <div key={f.id} className={`lk-numfield ${selected === f.id ? "on" : ""} ${error?.field === f.id ? "bad" : ""}`} onClick={() => pick(f.id)}>
                <span className="lab">{f.label} <em>*</em></span>
                <span className="val"><input ref={(el) => { inputs.current[f.id] = el; }} inputMode="decimal" placeholder="—" value={values[f.id] || ""} onChange={(e) => setVal(f.id, e.target.value)} onFocus={() => setSelected(f.id)} aria-label={`${f.label} in ${lenUnit}`} /><span className="unit">{lenUnit}</span></span>
              </div>
            ))}
            <div className={`lk-numfield ${selected === "weight" ? "on" : ""} ${error?.field === "weight" ? "bad" : ""}`} onClick={() => pick("weight")}>
              <span className="lab">Body weight <small>Optional</small></span>
              <span className="val"><input ref={(el) => { inputs.current.weight = el; }} inputMode="decimal" placeholder="—" value={values.weight || ""} onChange={(e) => setVal("weight", e.target.value)} onFocus={() => setSelected("weight")} aria-label={`Body weight in ${wUnit}`} /><span className="unit">{wUnit}</span></span>
            </div>
          </div>
        </div>
        <div className="lk-small">* Asked for by your coach. Measure without pulling the tape tight.</div>
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
        <div className="lk-nudge">Want your whole plan on your phone? <a href={APP_URL}>Get the app</a></div>
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
        <h1>{revoked ? "This link has been turned off." : "This link doesn't work."}</h1>
        <p>{revoked ? "Your coach may have sent you a new one. Check your messages." : reason === "network" ? "Couldn't reach Theryn. Check your connection and try again." : "Check the link your coach sent you, or ask them to send it again."}</p>
        <div className="lk-nudge"><a href={APP_URL}>About Theryn</a></div>
      </div>
    </div>
  );
}
