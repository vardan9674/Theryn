import React from "react";
import { Avatar, Button, Icon, Tabs, Tone, Empty, Pill } from "../ui/primitives.jsx";
import { DAYS, DAY_LONG, exerciseName, setsReps, normalizeExercise, shortDate, plural } from "../lib/format.js";
import { routineStreak } from "../lib/clientFacts.js";
import { TYPE_COLORS } from "../../components/templates/tokens.js";
import { computeBMI, bmiCategory, computeStats } from "../../lib/coachInsights.js";
import { fmtMoney } from "../../hooks/usePayments.ts";
import { AthleteAttendanceCalendar, AthleteVolumeChart, AthletePRTimeline } from "../../components/coach/AthleteDepth.jsx";

const TABS = [
  { id: "plan", label: "Plan" },
  { id: "progress", label: "Progress" },
  { id: "body", label: "Body" },
  { id: "payments", label: "Payments" },
];

/**
 * Everything about one client. Rendered in the laptop side panel, the tablet
 * drawer, and as a full page on phone. `row` comes from ClientsPage.
 */
export default function ClientDetail({ row, actions, defaultCurrency, fees, payments, onClose, tab: controlledTab, onTab }) {
  const { link, data, loading, todo, payment } = row;
  const athleteId = link.athlete_id;

  // The tab is owned by the shell (so it survives the plan editor opening and
  // closing). Until the coach picks one, land on the tab the "what to do"
  // line points at — once that line is known.
  const suggested = todo?.tab && TABS.some((t) => t.id === todo.tab) ? todo.tab : "plan";
  const tab = controlledTab || (todo ? suggested : "plan");
  const setTab = (t) => onTab?.(t);

  const statusLine = todo?.severity
    ? <Tone tone={todo.severity === "urgent" ? "bad" : todo.severity === "warn" ? "attention" : "ok"} bold>{todo.text}</Tone>
    : todo ? <span className="cx-muted">{todo.text}</span> : null;

  return (
    <div className="cx-detail">
      <div className="cx-detail-head">
        <Avatar name={row.name} size="lg" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="name">{row.name}</div>
          <div className="status">{loading ? <span className="cx-muted">Loading…</span> : statusLine}</div>
        </div>
        {onClose && <Button icon={<Icon.Close />} size="sm" aria-label="Close" onClick={onClose} />}
      </div>

      <div className="cx-actions-2">
        <Button icon={<Icon.Messages size={16} />} onClick={() => actions.message(athleteId)}>Message</Button>
        <Button icon={<Icon.Payments size={16} />} onClick={() => actions.recordPayment(athleteId)}>Record payment</Button>
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      {loading || !data ? (
        <div className="cx-col"><span className="cx-skel" style={{ height: 18, width: "60%" }} /><span className="cx-skel" style={{ height: 120 }} /><span className="cx-skel" style={{ height: 60 }} /></div>
      ) : tab === "plan" ? (
        <PlanTab data={data} row={row} actions={actions} />
      ) : tab === "progress" ? (
        <ProgressTab data={data} />
      ) : tab === "body" ? (
        <BodyTab data={data} />
      ) : (
        <PaymentsTab row={row} fees={fees} payments={payments} defaultCurrency={defaultCurrency} actions={actions} payment={payment} />
      )}
    </div>
  );
}

// ── Plan ──────────────────────────────────────────────────────────────────
function PlanTab({ data, row, actions }) {
  const routine = data.routine;
  const athleteId = row.link.athlete_id;
  const trainingDays = routine ? DAYS.filter((d) => routine[d]?.type && routine[d].type !== "Rest") : [];
  const types = [...new Set(trainingDays.map((d) => routine[d].type))];
  const [open, setOpen] = React.useState(null);
  React.useEffect(() => { setOpen(trainingDays[0] || null); }, [athleteId]);

  if (!routine || trainingDays.length === 0) {
    return (
      <Empty title="No plan yet" action={<Button variant="primary" icon={<Icon.Edit />} onClick={() => actions.editPlan(athleteId)}>Build a plan</Button>}>
        Give {row.name.split(" ")[0]} a week of workouts, or assign one of your saved plans from the Plans page.
      </Empty>
    );
  }

  return (
    <>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{types.join(" / ")}</div>
        <div className="cx-small cx-muted">{plural(trainingDays.length, "day")} a week</div>
      </div>
      <div className="cx-col">
        {trainingDays.map((d) => {
          const day = routine[d];
          const isOpen = open === d;
          const color = TYPE_COLORS[day.type] || "var(--cx-tx2)";
          return (
            <div key={d} className="cx-daycard">
              <button type="button" className="hd" style={{ background: "none", border: "none", padding: 0, width: "100%", minHeight: 32 }} onClick={() => setOpen(isOpen ? null : d)} aria-expanded={isOpen}>
                <b>{DAY_LONG[d]}</b>
                <span className="cx-row"><Pill color={color}>{day.type}</Pill><span className="cx-small cx-muted">{plural(day.exercises.length, "exercise")}</span><Icon.Down /></span>
              </button>
              {isOpen && day.exercises.map((ex, i) => {
                const o = normalizeExercise(ex);
                return (
                  <div key={i}>
                    <div className="cx-exrow"><span>{exerciseName(ex)}</span><span>{setsReps(ex)}</span></div>
                    {o.coachNote && <div className="cx-note">Note: {o.coachNote}</div>}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="cx-sticky-actions">
        <Button variant="primary" icon={<Icon.Edit />} onClick={() => actions.editPlan(athleteId)}>Edit plan</Button>
        <Button icon={<Icon.Sheet />} onClick={() => actions.exportPlan(athleteId)}>Export to Excel</Button>
      </div>
    </>
  );
}

// ── Progress ──────────────────────────────────────────────────────────────
function ProgressTab({ data }) {
  const { history, routine } = data;
  const stats = React.useMemo(() => computeStats(data), [data]);
  const streak = routineStreak(history, routine);
  if (!history || history.length === 0) return <Empty title="No workouts logged yet">Progress charts appear after the first workout.</Empty>;
  return (
    <>
      <div className="cx-stats" style={{ marginBottom: 0 }}>
        <div className="cx-card cx-stat"><span className="k">Streak</span><span className="v">{streak}d</span></div>
        <div className="cx-card cx-stat"><span className="k">Last 28 days</span><span className="v">{stats.adherencePct == null ? "—" : `${stats.adherencePct}%`}</span></div>
        <div className="cx-card cx-stat"><span className="k">Avg session</span><span className="v">{stats.sessionAvgMin == null ? "—" : `${stats.sessionAvgMin}m`}</span></div>
      </div>
      <div className="cx-small cx-muted">"Last 28 days" is the share of planned workouts that were done.</div>
      <AthleteAttendanceCalendar history={history} />
      <AthleteVolumeChart history={history} />
      <AthletePRTimeline history={history} />
    </>
  );
}

// ── Body ──────────────────────────────────────────────────────────────────
function BodyTab({ data }) {
  const { weights, measurements, profile } = data;
  const unit = profile?.unit_system === "metric" ? "kg" : "lb";
  const mUnit = profile?.unit_system === "metric" ? "cm" : "in";
  const current = weights?.[0];
  const prior = weights?.find((w) => w.date < (current?.date || "") && daysDiff(w.date, current.date) >= 14);
  const delta = current && prior ? Number((current.weight - prior.weight).toFixed(1)) : null;
  const bmi = current ? computeBMI(current.weight, profile?.height_cm, profile?.unit_system) : null;
  const cat = bmiCategory(bmi);
  const m = measurements?.[0];
  const sites = m ? [["Chest", m.chest], ["Waist", m.waist], ["Hips", m.hips], ["Left arm", m.lArm], ["Right arm", m.rArm], ["Left thigh", m.lThigh], ["Right thigh", m.rThigh]].filter(([, v]) => v != null) : [];

  if (!current && !m) return <Empty title="No body data yet">Weight and measurements show up once the client logs them in their app.</Empty>;
  return (
    <>
      <div className="cx-stats" style={{ marginBottom: 0 }}>
        <div className="cx-card cx-stat"><span className="k">Weight</span><span className="v">{current ? `${current.weight} ${unit}` : "—"}</span></div>
        <div className="cx-card cx-stat"><span className="k">Change (2 wk)</span><span className="v" style={{ color: delta == null ? undefined : delta < 0 ? "var(--cx-a)" : "var(--cx-tx)" }}>{delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta}`}</span></div>
        <div className="cx-card cx-stat"><span className="k">BMI</span><span className="v" style={{ color: cat?.color }}>{bmi ?? "—"}</span></div>
      </div>
      {cat ? <div className="cx-small cx-muted">BMI {bmi} is in the "{cat.label}" range.</div>
        : current ? <div className="cx-small cx-muted">BMI needs the client's height, which they set in their app.</div> : null}
      {weights && weights.length > 0 && (
        <div className="cx-card">
          <div className="cx-card-pad" style={{ borderBottom: "1px solid var(--cx-bd)", fontSize: 13, fontWeight: 600 }}>Recent weigh-ins</div>
          {weights.slice(0, 8).map((w) => (
            <div key={w.id} className="cx-exrow cx-card-pad" style={{ paddingTop: 10, paddingBottom: 10, borderBottom: "1px solid var(--cx-bd)" }}><span>{shortDate(w.date)}</span><span>{w.weight} {unit}</span></div>
          ))}
        </div>
      )}
      {m && (
        <div className="cx-card">
          <div className="cx-card-pad" style={{ borderBottom: "1px solid var(--cx-bd)", fontSize: 13, fontWeight: 600 }}>Measurements · {shortDate(m.date)}</div>
          {sites.map(([label, v]) => (
            <div key={label} className="cx-exrow cx-card-pad" style={{ paddingTop: 10, paddingBottom: 10, borderBottom: "1px solid var(--cx-bd)" }}><span>{label}</span><span>{v} {mUnit}</span></div>
          ))}
        </div>
      )}
    </>
  );
}
function daysDiff(a, b) { return Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000); }

// ── Payments ──────────────────────────────────────────────────────────────
function PaymentsTab({ row, fees, payments, defaultCurrency, actions, payment }) {
  const athleteId = row.link.athlete_id;
  const fee = fees.find((f) => f.athlete_id === athleteId) || null;
  const list = payments.filter((p) => p.athlete_id === athleteId);
  const currency = fee?.currency || defaultCurrency;
  return (
    <>
      <div className="cx-card cx-card-pad cx-col">
        <div className="cx-row" style={{ justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{fee ? `${fmtMoney(fee.amount, currency)} ${fee.cadence}` : "No fee set"}</div>
            <div className="cx-small"><Tone tone={payment.tone}>{payment.label}</Tone></div>
          </div>
          <Button size="sm" onClick={() => actions.editFee(athleteId)}>{fee ? "Change fee" : "Set fee"}</Button>
        </div>
        <Button variant="primary" block icon={<Icon.Plus />} onClick={() => actions.recordPayment(athleteId)}>Record a payment</Button>
      </div>
      {list.length === 0 ? (
        <div className="cx-small cx-muted">No payments recorded yet.</div>
      ) : (
        <div className="cx-card">
          <div className="cx-card-pad" style={{ borderBottom: "1px solid var(--cx-bd)", fontSize: 13, fontWeight: 600 }}>History</div>
          {list.slice(0, 12).map((p) => (
            <div key={p.id} className="cx-exrow cx-card-pad" style={{ paddingTop: 10, paddingBottom: 10, borderBottom: "1px solid var(--cx-bd)", alignItems: "center" }}>
              <span>{shortDate(p.received_date)}{p.notes ? <span className="cx-muted"> · {p.notes}</span> : null}</span>
              <span className="cx-row"><b style={{ color: "var(--cx-tx)" }}>{fmtMoney(p.amount, p.currency)}</b><Button size="sm" icon={<Icon.Trash />} aria-label="Delete payment" onClick={() => actions.deletePayment(p)} /></span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
