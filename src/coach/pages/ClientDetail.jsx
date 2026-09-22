import React from "react";
import { Avatar, Button, Icon, Tabs, Tone, Empty, Pill, useToast } from "../ui/primitives.jsx";
import { useCoachData } from "../data/CoachDataContext.jsx";
import { DAYS, DAY_LONG, exerciseName, setsReps, normalizeExercise, shortDate, plural, dayKey, isoDate } from "../lib/format.js";
import { streakStats, streakLabel, consistencyStats } from "../lib/streak.js";
import { weekProgress } from "../lib/clientFacts.js";
import { TYPE_COLORS } from "../../components/templates/tokens.js";
import { computeBMI, bmiCategory } from "../../lib/coachInsights.js";
import { fmtMoney } from "../../hooks/usePayments.ts";
import { AthleteAttendanceCalendar, AthleteVolumeChart, AthletePRTimeline } from "../../components/coach/AthleteDepth.jsx";
import { attachSubmissions, workoutDetail, workoutSummary, lastSetsFor, setsLine } from "../lib/workouts.js";
import { planTemplate } from "../lib/manualTemplates.js";
import { MEASUREMENT_FIELDS } from "../lib/clientLinks.js";
import LogWorkoutSheet from "./LogWorkoutSheet.jsx";
import EditWorkoutSheet from "./EditWorkoutSheet.jsx";
import { supersetInfo } from "../lib/exerciseKinds.js";

const TABS = [
  { id: "plan", label: "Plan" },
  { id: "progress", label: "Workouts" },
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
  const manual = Boolean(link.manual);
  const tabs = TABS;
  const suggested = todo?.tab && tabs.some((t) => t.id === todo.tab) ? todo.tab : "plan";
  const tab = controlledTab && tabs.some((t) => t.id === controlledTab) ? controlledTab : (todo ? suggested : "plan");
  const setTab = (t) => onTab?.(t);

  const statusLine = manual
    ? <span className="cx-muted">Not on the app yet</span>
    : todo?.severity
    ? <Tone tone={todo.severity === "urgent" ? "bad" : todo.severity === "warn" ? "attention" : "ok"} bold>{todo.text}</Tone>
    : todo ? <span className="cx-muted">{todo.text}</span> : null;

  return (
    <div className="cx-detail">
      <div className="cx-detail-head">
        <Avatar name={row.name} size="lg" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="name">{row.name}</div>
          <div className="status">{loading ? <span className="cx-muted">Loading…</span> : statusLine}</div>
          {!loading && row.streak?.current >= 2 && !/streak/i.test(todo?.text || "") && <span className={`cx-streak chip ${row.streak.atRisk ? "risk" : ""}`}><Icon.Flame size={12} />{streakLabel(row.streak.current)}{row.streak.atRisk ? " · at risk today" : row.streak.best > row.streak.current ? ` · best ${row.streak.best}` : ""}</span>}
        </div>
        {onClose && <Button icon={<Icon.Close />} size="sm" aria-label="Close" onClick={onClose} />}
      </div>

      <div className="cx-actions-2">
        <Button variant="primary" icon={<Icon.Link size={16} />} onClick={() => actions.shareLink(athleteId)} data-tour="share-link">Share link</Button>
        {manual
          ? <Button icon={<Icon.Payments size={16} />} onClick={() => actions.recordPayment(athleteId)}>Record payment</Button>
          : <Button icon={<Icon.Messages size={16} />} onClick={() => actions.message(athleteId)}>Message</Button>}
      </div>
      {manual && <ClientUnits clientId={athleteId} units={data?.profile?.unit_system} firstName={row.name.split(" ")[0]} onChanged={() => actions?.reloadClient?.(athleteId)} />}
      {manual && <ClientEmail clientId={athleteId} initial={link.email} firstName={row.name.split(" ")[0]} />}

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {loading || !data ? (
        <div className="cx-col"><span className="cx-skel" style={{ height: 18, width: "60%" }} /><span className="cx-skel" style={{ height: 120 }} /><span className="cx-skel" style={{ height: 60 }} /></div>
      ) : tab === "plan" ? (
        <PlanTab data={data} row={row} actions={actions} />
      ) : tab === "progress" ? (
        <ProgressTab data={data} row={row} actions={actions} />
      ) : tab === "body" ? (
        <BodyTab data={data} />
      ) : (
        <PaymentsTab row={row} fees={fees} payments={payments} defaultCurrency={defaultCurrency} actions={actions} payment={payment} />
      )}
    </div>
  );
}

// ── Units (name-only clients) ─────────────────────────────────────────────
// Each client can be in kg or lb, whatever the coach's own setting is. Weights
// already typed keep their unit and are converted on the way out.
function ClientUnits({ clientId, units, firstName, onChanged }) {
  const data = useCoachData();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const current = units === "metric" ? "metric" : "imperial";
  if (typeof data.setClientUnits !== "function") return null;
  async function pick(u) {
    if (u === current || busy) return;
    setBusy(true);
    try { await data.setClientUnits(clientId, u); toast(`${firstName}'s weights now show in ${u === "metric" ? "kg" : "lb"}.`); onChanged?.(); }
    catch (e) { toast(e.message || "Could not change units", "error"); }
    finally { setBusy(false); }
  }
  return (
    <div className="cx-row" style={{ justifyContent: "space-between", gap: 8 }}>
      <span className="cx-small cx-muted" style={{ minWidth: 0 }}>Weights for {firstName}</span>
      <span className="cx-units" role="group" aria-label={`Weight units for ${firstName}`}>
        <button type="button" aria-pressed={current === "metric"} disabled={busy} onClick={() => pick("metric")}>kg</button>
        <button type="button" aria-pressed={current === "imperial"} disabled={busy} onClick={() => pick("imperial")}>lb</button>
      </span>
    </div>
  );
}

// ── Email (name-only clients) ─────────────────────────────────────────────
// Optional. Nothing is merged on it: when this person later signs in with the
// same email, they're offered their history and choose (decision 0007).
function ClientEmail({ clientId, initial, firstName }) {
  const data = useCoachData();
  const toast = useToast();
  const [email, setEmail] = React.useState(initial || "");
  const [draft, setDraft] = React.useState(initial || "");
  const [editing, setEditing] = React.useState(false);
  const [open, setOpen] = React.useState(false); // the explanation, shown only after "Link to app"
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { setEmail(initial || ""); setDraft(initial || ""); setEditing(false); setOpen(false); }, [clientId, initial]);
  if (typeof data.updateManualEmail !== "function") return null;
  async function save() {
    setBusy(true);
    try { const saved = await data.updateManualEmail(clientId, draft); setEmail(saved || ""); setEditing(false); setOpen(false); toast(saved ? "Email saved" : "Email removed"); }
    catch (e) { toast(e.message || "Could not save", "error"); }
    finally { setBusy(false); }
  }
  // Collapsed: one line. The explanation and the email field open on "Link to app".
  if (!open && !editing) {
    return (
      <div className="cx-row" style={{ justifyContent: "space-between", gap: 8 }}>
        <span className="cx-small cx-muted" style={{ minWidth: 0 }}>{email ? <>Uses their link · <span style={{ color: "var(--cx-tx2)" }}>{email}</span></> : "Uses their link, not the app"}</span>
        <button type="button" className="cx-linkbtn cx-small" style={{ minHeight: 32, flex: "none" }} onClick={() => { setOpen(true); setEditing(true); }} aria-expanded={false}>{email ? "Change" : "Link to app"}</button>
      </div>
    );
  }
  const why = <span className="cx-small cx-muted">{firstName} sends workouts and measurements through their link. Add their email: when they sign up for the app with it, their history comes with them.</span>;
  if (editing) {
    return (
      <div className="cx-col" style={{ gap: 6 }}>
      {why}
      <div className="cx-row" style={{ gap: 6 }}>
        <input className="cx-input" type="email" inputMode="email" autoComplete="off" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`${firstName}'s email`} aria-label={`${firstName}'s email`} style={{ flex: 1, minWidth: 0 }} autoFocus />
        <Button size="sm" variant="primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        <Button size="sm" onClick={() => { setDraft(email); setEditing(false); setOpen(false); }} disabled={busy}>Cancel</Button>
      </div>
      </div>
    );
  }
  return (
    <div className="cx-row" style={{ justifyContent: "space-between", gap: 8 }}>
      <span className="cx-small" style={{ minWidth: 0 }}>
        {email ? <><span className="cx-muted">Email </span>{email}</> : <span className="cx-muted">No email yet. Add it so their history can follow them into the app later.</span>}
      </span>
      <Button size="sm" onClick={() => setEditing(true)}>{email ? "Change" : "Add email"}</Button>
    </div>
  );
}

// ── Plan ──────────────────────────────────────────────────────────────────
function PlanTab({ data, row, actions }) {
  const unit = data.profile?.unit_system === "metric" ? "kg" : "lb";
  const routine = data.routine;
  const athleteId = row.link.athlete_id;
  const fromPlan = planTemplate(routine);
  const trainingDays = routine ? DAYS.filter((d) => routine[d]?.type && routine[d].type !== "Rest") : [];
  const types = [...new Set(trainingDays.map((d) => routine[d].type))];
  const [open, setOpen] = React.useState(null);
  React.useEffect(() => { setOpen(trainingDays[0] || null); }, [athleteId]);

  // Workouts sent through the link, newest first, keyed by day for the "Completed via link" tag.
  const linkWorkouts = React.useMemo(() => (data.history || []).filter((h) => h.source === "link"), [data.history]);
  const latestByDay = React.useMemo(() => { const o = {}; for (const h of linkWorkouts) { const k = dayKey(new Date(h.date + "T12:00:00")); if (!o[k] || o[k].date < h.date) o[k] = h; } return o; }, [linkWorkouts]);

  if (!routine || trainingDays.length === 0) {
    return (
      <Empty title="No plan yet" action={<Button variant="primary" icon={<Icon.Edit />} onClick={() => actions.editPlan(athleteId)}>Build a plan</Button>}>
        {row.link.manual
          ? `Build ${row.name.split(" ")[0]} a week of workouts, or add them to one of your saved plans on the Plans page. They tick it off through their link.`
          : `Build ${row.name.split(" ")[0]} a week of workouts, or add them to one of your saved plans on the Plans page.`}
      </Empty>
    );
  }

  return (
    <>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{types.join(" / ")}</div>
        <div className="cx-small cx-muted">{plural(trainingDays.length, "day")} a week{fromPlan ? ` · from your plan "${fromPlan.name}"${fromPlan.overridden ? " (edited for them)" : ""}` : ""}</div>
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
                <span className="cx-row cx-dayhd-r">{latestByDay[d] && daysAgoOf(latestByDay[d].date) < 7 && <span className="cx-tag" style={{ color: "var(--cx-a)", borderColor: "rgba(200,255,0,0.35)" }}>{latestByDay[d].byCoach ? "Logged by you" : "Done via link"}</span>}<Pill color={color}>{day.type}</Pill><span className="cx-small cx-muted">{plural(day.exercises.length, "exercise")}</span><Icon.Down /></span>
              </button>
              {isOpen && latestByDay[d] && daysAgoOf(latestByDay[d].date) < 7 && (
                <div className="cx-small" style={{ color: "var(--cx-tx2)" }}>
                  {shortDate(latestByDay[d].date)}: {latestByDay[d].totalSets} of {latestByDay[d].plannedSets || latestByDay[d].totalSets} sets done
                  {latestByDay[d].exercises.some((e) => e.sets.some((x) => x.w)) && ` · weights: ${latestByDay[d].exercises.filter((e) => e.sets[0]?.w).map((e) => `${e.name} ${e.sets[0].w}`).join(", ")}`}
                  {latestByDay[d].note && <div className="cx-card-pad" style={{ marginTop: 6, background: "var(--cx-s2)", borderRadius: 8, padding: "8px 10px", color: "var(--cx-tx2)" }}>{row.name.split(" ")[0]}: "{latestByDay[d].note}"</div>}
                </div>
              )}
              {isOpen && (() => { const ssi = supersetInfo(day.exercises); return day.exercises.map((ex, i) => {
                const o = normalizeExercise(ex);
                return (
                  <div key={i}>
                    <div className="cx-exrow"><span>{ssi[i] && <span className="pe-ss" title={`Superset ${ssi[i].letter}: back to back, then rest`}>{ssi[i].letter}{ssi[i].pos}</span>}{exerciseName(ex)}</span><span>{setsReps(ex, unit)}</span></div>
                    {(() => { const last = lastSetsFor(data.history, exerciseName(ex)); return last ? <div className="cx-small cx-muted" style={{ marginTop: 2 }}>Last time ({shortDate(last.date)}): {setsLine(last.sets)}{last.sets.some((x) => x.w) ? ` ${unit}` : " reps"}</div> : null; })()}
                    {o.coachNote && <div className="cx-note">Note: {o.coachNote}</div>}
                  </div>
                );
              }); })()}
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

// ── Workouts ──────────────────────────────────────────────────────────────
function ProgressTab({ data, row, actions }) {
  const { history, routine, profile } = data;
  const coachData = useCoachData();
  const toast = useToast();
  const firstName = row.name.split(" ")[0];
  const [logging, setLogging] = React.useState(false);
  const [removing, setRemoving] = React.useState(null);
  const [editing, setEditing] = React.useState(null); // the workout being corrected
  const canEdit = row.link.manual && typeof coachData.updateSubmission === "function";
  const canLog = row.link.manual && typeof coachData.logWorkoutForClient === "function" && routine && DAYS.some((d) => routine[d]?.type && routine[d].type !== "Rest" && (routine[d].exercises || []).length);
  const logButton = canLog ? <Button variant="soft" icon={<Icon.Check size={16} />} onClick={() => setLogging(true)}>Log a workout for {firstName}</Button> : null;
  const sheet = canLog ? (
    <LogWorkoutSheet open={logging} firstName={firstName} routine={routine} history={history} unit={profile?.unit_system === "metric" ? "kg" : "lb"}
      onClose={() => setLogging(false)}
      onSave={async (payload) => { await coachData.logWorkoutForClient(row.link.athlete_id, payload); actions?.reloadClient?.(row.link.athlete_id); }} />
  ) : null;
  async function removeLogged(w) {
    setRemoving(w.id);
    try { await coachData.deleteSubmission(w.submissionId); toast("Removed"); actions?.reloadClient?.(row.link.athlete_id); }
    catch (e) { toast(e.message || "Could not remove", "error"); }
    finally { setRemoving(null); }
  }
  const unit = profile?.unit_system === "metric" ? "kg" : "lbs";
  const wUnit = profile?.unit_system === "metric" ? "kg" : "lb";
  const st = React.useMemo(() => streakStats((history || []).map((h) => h.date), routine), [history, routine]);
  // Each workout with what the client actually did: link submissions carry planned vs done sets, weights used and the note.
  const workouts = React.useMemo(() => attachSubmissions(history || [], data.submissions).map(workoutDetail), [history, data.submissions]);
  const week = React.useMemo(() => weekProgress(history || [], routine), [history, routine]);
  const cons = React.useMemo(() => consistencyStats((history || []).map((h) => h.date), routine, row.link.created_at), [history, routine, row.link.created_at]);
  const efforts = workouts.filter((w) => w.feel).slice(0, 5).map((w) => w.feel); // newest first
  const [openId, setOpenId] = React.useState(null);
  React.useEffect(() => { setOpenId(workouts[0]?.id || null); }, [row.link.athlete_id]); // eslint-disable-line react-hooks/exhaustive-deps
  const editSheet = canEdit && editing ? (
    <EditWorkoutSheet open={Boolean(editing)} workout={editing} firstName={firstName} unit={profile?.unit_system === "metric" ? "kg" : "lb"}
      onClose={() => setEditing(null)}
      onSave={async (payload) => { await coachData.updateSubmission(editing.submissionId, payload); actions?.reloadClient?.(row.link.athlete_id); }} />
  ) : null;
  if (!history || history.length === 0) return <><Empty title="No workouts yet" action={logButton}>{row.link.manual ? `Workouts they tick off through their link show up here. If ${firstName} trained but didn't tick it off, you can log it for them.` : "Workouts they log in the app or tick off through their link show up here."}</Empty>{sheet}</>;
  return (
    <>
      {sheet}
      {editSheet}
      {logButton && <div className="cx-row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}><span className="cx-small cx-muted" style={{ flex: "1 1 180px" }}>Trained but didn't tick it off? Log it for them.</span>{logButton}</div>}
      <div className="cx-stats" style={{ marginBottom: 0 }}>
        <div className="cx-card cx-stat"><span className="k">Streak</span><span className="v" style={st.current >= 2 ? { color: "var(--cx-a)" } : undefined}>{st.current}d</span><span className="s">{st.best > st.current ? `best ${st.best}` : st.current >= 2 ? "their best yet" : " "}</span></div>
        <div className="cx-card cx-stat" title="Planned workout days they trained on, since they joined. Rest days don't count."><span className="k">Consistency</span><span className="v" style={{ color: cons.pct == null ? undefined : cons.pct >= 80 ? "var(--cx-a)" : cons.pct >= 60 ? "#F5A742" : "#FF6B6B" }}>{cons.pct == null ? "—" : `${cons.pct}%`}</span><span className="s">{cons.planned ? `${cons.done} of ${plural(cons.planned, "day")} · since ${shortDate(cons.since)}` : routine ? "starts on their first workout day" : "no plan yet"}</span></div>
        <div className="cx-card cx-stat"><span className="k">This week</span><span className="v" style={week.planned > 0 && week.done >= week.planned ? { color: "var(--cx-a)" } : undefined}>{week.planned > 0 ? `${week.done}/${week.planned}` : week.done || "—"}</span><span className="s">{week.planned > 0 ? "workouts" : "no plan"}</span></div>
      </div>
      {efforts.length > 0 && (
        <div className="cx-small"><span className="cx-muted">Recent effort: </span>{efforts.map((f, k) => <React.Fragment key={k}>{k > 0 && <span className="cx-muted"> · </span>}<b className={`cx-feel ${f}`}>{f}</b></React.Fragment>)}</div>
      )}
      <div className="cx-card cx-card-pad cx-col" style={{ gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }} className="cx-muted">Last 14 days</span>
        <div className="cx-strip" role="img" aria-label={`Last 14 days: ${st.days.filter((x) => x.state === "done").length} workouts`}>
          {st.days.map((x) => <i key={x.iso} className={x.state} title={`${shortDate(x.iso)}: ${x.state === "done" ? "workout" : x.state === "rest" ? "rest day" : x.state === "missed" ? "missed" : x.state === "today" ? "today" : "before they started"}`} />)}
        </div>
        <span className="cx-small cx-muted">Green done · dashed rest · grey missed</span>
      </div>

      <div className="cx-card">
        <div className="cx-card-pad" style={{ borderBottom: "1px solid var(--cx-bd)", fontSize: 13, fontWeight: 600 }}>Recent workouts</div>
        {workouts.slice(0, 12).map((w) => {
          const isOpen = openId === w.id;
          const color = TYPE_COLORS[w.type] || "var(--cx-tx2)";
          return (
            <div key={w.id} className="cx-workout" style={{ borderBottom: "1px solid var(--cx-bd)" }}>
              <button type="button" className="cx-workout-hd cx-card-pad" onClick={() => setOpenId(isOpen ? null : w.id)} aria-expanded={isOpen}>
                <span className="cx-col" style={{ gap: 2, minWidth: 0, textAlign: "left" }}>
                  <span className="cx-row" style={{ gap: 8, flexWrap: "wrap" }}><b style={{ whiteSpace: "nowrap" }}>{shortDate(w.date)}</b><Pill color={color}>{w.type}</Pill>{w.editedByCoach && !w.byCoach ? <span className="cx-tag" style={{ color: "#8FB8FF", borderColor: "rgba(143,184,255,0.4)" }}>fixed by you</span> : null}{w.byCoach ? <span className="cx-tag" style={{ color: "#8FB8FF", borderColor: "rgba(143,184,255,0.4)" }}>logged by you</span> : w.viaLink ? <span className="cx-tag" style={{ color: "var(--cx-a)", borderColor: "rgba(200,255,0,0.35)" }}>via link</span> : <span className="cx-tag">in app</span>}</span>
                  <span className="cx-small cx-muted">{workoutSummary(w)}{w.plannedSets > 0 && w.totalSets < w.plannedSets ? ` · ${w.exercises.filter((e) => e.skipped).length ? `${w.exercises.filter((e) => e.skipped).length} skipped` : "some sets missed"}` : ""}</span>
                </span>
                <Icon.Down />
              </button>
              {isOpen && (
                <div className="cx-card-pad" style={{ paddingTop: 0 }}>
                  {w.exercises.map((e, i) => (
                    <div key={i} className="cx-exrow" style={{ alignItems: "flex-start", padding: "6px 0", opacity: e.skipped ? 0.55 : 1 }}>
                      <span>{e.name}{e.skipped && <span className="cx-small cx-muted"> · skipped</span>}</span>
                      <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {e.sets.length > 0
                          ? <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                              {e.planned > 0 && <span className="cx-small"><b style={{ color: "var(--cx-tx)" }}>{e.done}/{e.planned}</b> sets{w.viaLink && !e.timed ? <span className="cx-muted"> · {wUnit} × reps</span> : null}</span>}
                              <span className="cx-setchips">{e.sets.map((s, j) => <span key={j} className={`cx-setchip${s.changed ? " changed" : ""}${s.suspect ? " suspect" : ""}`} title={s.suspect ? "Looks like a typo. Tap Fix numbers to correct it." : s.changed ? "Different from the plan" : undefined}>{s.k === "warmup" ? "W " : s.k === "drop" ? "D " : ""}{s.t ? (s.w ? `${s.t} · ${s.w}` : s.t) : s.w ? `${s.w}×${s.r || "?"}` : s.r ? `${s.r} reps` : "✓"}</span>)}</span>
                            </span>
                          : <>
                              <b style={{ color: e.skipped ? "var(--cx-mu)" : "var(--cx-tx)" }}>{e.done}{e.planned ? `/${e.planned}` : ""}</b> sets
                              {e.reps ? <span className="cx-muted"> × {e.reps}</span> : null}
                              {e.weight != null ? <span className={e.weightChanged ? "" : "cx-muted"}> · {e.weight} {wUnit}{e.weightChanged ? " (changed)" : ""}</span> : null}
                            </>}
                      </span>
                    </div>
                  ))}
                  {w.feel && <div className="cx-small" style={{ marginTop: 6 }}><span className="cx-muted">Felt </span><b className={`cx-feel ${w.feel}`}>{w.feel}</b></div>}
                  {w.note && <div className="cx-card-pad" style={{ marginTop: 6, background: "var(--cx-s2)", borderRadius: 8, padding: "8px 10px", color: "var(--cx-tx2)", fontSize: 13 }}>{w.byCoach ? "Your note" : row.name.split(" ")[0]}: "{w.note}"</div>}
                  {w.submissionId && (canEdit || w.byCoach) && (
                    <div className="cx-row" style={{ justifyContent: "space-between", marginTop: 8, gap: 8, flexWrap: "wrap" }}>
                      <span className="cx-small cx-muted" style={{ flex: "1 1 160px" }}>{w.exercises.some((e) => e.sets.some((s) => s.suspect)) ? <span style={{ color: "#F5A742" }}>A number looks off. Fix it if it's a typo.</span> : w.byCoach ? `You logged this for ${firstName}.` : w.editedByCoach ? "You fixed numbers in this workout." : `Sent by ${firstName}.`}</span>
                      <span className="cx-row" style={{ gap: 8 }}>
                        {canEdit && <Button size="sm" onClick={() => setEditing(w)}>Fix numbers</Button>}
                        {w.byCoach && <Button size="sm" onClick={() => removeLogged(w)} disabled={removing === w.id}>{removing === w.id ? "Removing…" : "Remove"}</Button>}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <AthleteAttendanceCalendar history={history} />
      <AthleteVolumeChart history={history} unit={unit} />
      <AthletePRTimeline history={history} unit={unit} />
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
  // Latest entry that has tape measurements (a link check-in can be weight only).
  const valueOf = (x, f) => x[f.key] ?? (f.key === "lCalf" ? x.calves : undefined); // the app calls the left calf "calves"
  const m = measurements?.find((x) => MEASUREMENT_FIELDS.some((f) => valueOf(x, f) != null));
  const sites = m ? MEASUREMENT_FIELDS.map((f) => [f.label, valueOf(m, f), f.unit === "%" ? "%" : null]).filter(([, v]) => v != null) : [];

  if (!current && !m) return <Empty title="No body data yet">Weight and measurements show up once the client logs them in their app or sends them through their link.</Empty>;
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
            <div key={w.id} className="cx-exrow cx-card-pad" style={{ paddingTop: 10, paddingBottom: 10, borderBottom: "1px solid var(--cx-bd)" }}><span>{shortDate(w.date)}{w.source === "link" && <span className="cx-tag" style={{ marginLeft: 8 }}>via link</span>}</span><span>{w.weight} {unit}</span></div>
          ))}
        </div>
      )}
      {m && (
        <div className="cx-card">
          <div className="cx-card-pad cx-row" style={{ borderBottom: "1px solid var(--cx-bd)", fontSize: 13, fontWeight: 600, justifyContent: "space-between" }}><span>Measurements · {shortDate(m.date)}</span>{m.source === "link" && <span className="cx-tag">via link</span>}</div>
          {sites.map(([label, v, u]) => (
            <div key={label} className="cx-exrow cx-card-pad" style={{ paddingTop: 10, paddingBottom: 10, borderBottom: "1px solid var(--cx-bd)" }}><span>{label}</span><span>{v}{u ? u : ` ${mUnit}`}</span></div>
          ))}
        </div>
      )}
    </>
  );
}
function daysDiff(a, b) { return Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000); }
// Local today: toISOString() is UTC, which is still yesterday in India until 5:30 am.
function daysAgoOf(iso) { return daysDiff(iso, isoDate(new Date())); }

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
