import React from "react";
import { Button, Icon, Sheet, Pill, useToast } from "../ui/primitives.jsx";
import { useCoachData } from "../data/CoachDataContext.jsx";
import BodyMap from "../../components/BodyMap.jsx";
import { GROUP_LABEL } from "../../lib/exerciseLibrary.js";
import { buildWeeklyReport, defaultReportWeek, weekLabel, addDays, reportSnapshot, reportMessage, applySuggestion, volumeLine, sectionsFrom } from "../lib/weeklyReport.js";
import { clientNow } from "../lib/clientClock.js";
import { linkUrl, whatsappUrl } from "../lib/clientLinks.js";
import { ReportView, VolumeBars } from "../../link/LinkReport.jsx";
import { winWords } from "../../lib/workoutWins.js";
import { saveReportImage } from "../lib/reportImage.js";

// The client's week, for the coach — and, only if the coach chooses, for the
// client. Nothing on this tab reaches the client until "Share" is tapped: the
// draft is worked out here from their data each time and never saved.
// Design: Weekly Report canvas (theryn-weekly-report-design).

const GAP_FILL = { on: "#C8FF00", half: "#F5B84A", missed: "#FF6B3D" };
const GAP_WORD = { on: "Done as planned", half: "Half done", missed: "Missed" };
const LEVEL_FILL = { 3: "#C8FF00", 2: "#93BC00", 1: "#49590F" };
const REGION_COLOR = { "on plan": "#C8FF00", "mostly done": "#F5B84A", "mostly missed": "#FF6B3D" };
const SECTION_LABELS = [
  ["workouts", "Workouts done"],
  ["wins", "Better than last week"],
  ["volume", "Weight lifted, week by week"],
  ["muscles", "What they trained most"],
  ["gap", "Where they fell short of the plan"],
  ["note", "Your note and next week's focus"],
  ["body", "Body weight and waist"],
];
const bigNum = (n) => Math.round(n).toLocaleString("en-US");
const shortDate = (iso) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

function Dot({ color }) {
  return <span className="rp-dot" style={{ background: color }} aria-hidden="true" />;
}

function statusOf(r) {
  if (!r) return { text: "Draft", color: "#F5B84A" };
  if (r.seen_at) return { text: "Shared · Seen", color: "#C8FF00" };
  return { text: "Shared · Not seen yet", color: "#B0B0B0" };
}

export default function ReportsTab({ data, row, actions }) {
  const api = useCoachData();
  const toast = useToast();
  const clientId = row.link.athlete_id;
  const first = (row.name || "").split(" ")[0] || "your client";
  // Their week, on their clock: a client in another timezone gets the week
  // that ended for them.
  const now = React.useMemo(() => clientNow(data), [data]);
  const latest = defaultReportWeek(now);
  const [start, setStart] = React.useState(latest);
  const report = React.useMemo(() => buildWeeklyReport(data, { start, firstName: first, now }), [data, start, first, now]);
  const [shared, setShared] = React.useState(null);
  const [reviewing, setReviewing] = React.useState(false);
  const [stopping, setStopping] = React.useState(false);
  const reportsOn = typeof api.listReports === "function";

  const loadShared = React.useCallback(() => {
    if (!reportsOn) { setShared([]); return; }
    api.listReports(clientId).then(setShared).catch(() => setShared([]));
  }, [api, clientId, reportsOn]);
  React.useEffect(() => { loadShared(); }, [loadShared]);

  const thisOne = (shared || []).find((r) => r.period_start === start && !r.stopped_at) || null;
  const earlier = (shared || []).filter((r) => r.period_start !== start);
  const status = statusOf(thisOne);

  async function stop(r) {
    setStopping(true);
    try { await api.stopReport(r.id); toast(`${first} can no longer see that report.`); loadShared(); }
    catch (e) { toast(e.message || "Could not stop sharing it", "error"); }
    finally { setStopping(false); }
  }
  function sendCheckIn() {
    window.open(whatsappUrl(report.draftNote), "_blank", "noopener");
  }

  return (
    <div className="cx-col rp">
      <div className="rp-weeknav">
        <Button size="sm" icon={<Icon.Back size={16} />} aria-label="The week before" onClick={() => setStart(addDays(start, -7))} />
        <b>{start === latest ? `Last week · ${report.period.label}` : report.period.label}</b>
        <Button size="sm" icon={<Icon.Chevron size={16} />} aria-label="The week after" disabled={start >= latest} onClick={() => setStart(addDays(start, 7))} />
      </div>

      <section className="cx-card rp-card" aria-label={`Weekly report, ${report.period.label}`}>
        <div className="rp-row">
          <span className="rp-eyebrow">Weekly report · {report.period.label}</span>
          <Pill color={status.color}>{status.text}</Pill>
        </div>
        <h3 className="rp-headline">{report.headline}</h3>
        {report.quiet ? (
          <div className="rp-quiet">
            {report.doneList.length > 0
              ? <ul>{report.doneList.map((x) => <li key={x.name}>{x.name} · {x.sets} set{x.sets === 1 ? "" : "s"}</li>)}</ul>
              : <p className="cx-muted">No workouts sent this week.</p>}
            <p className="cx-small cx-muted">Too little to say what they trained most, so the report doesn't try. A short check-in usually lands better than a report after a quiet week.</p>
          </div>
        ) : (
          <div className="rp-mini">
            <div className="rp-figs" aria-hidden="true">
              <BodyMap view="front" levels={report.muscles.levels} width={58} stroke="#101010" />
              <BodyMap view="back" levels={report.muscles.levels} width={58} stroke="#101010" />
            </div>
            <dl className="rp-stats">
              <div><dt>Workouts</dt><dd>{report.workouts.planned ? `${report.workouts.done} of ${report.workouts.planned}` : report.workouts.done}</dd></div>
              <div><dt>Sets</dt><dd>{report.sets.planned ? `${report.sets.done} of ${report.sets.planned}` : report.sets.done}</dd></div>
              {report.wins.length > 0
                ? <div><dt>Better than last week</dt><dd className="good">{report.wins.length === 1 ? report.wins[0].name : `${report.wins.length} exercises`}</dd></div>
                : report.bests[0]
                ? <div><dt>New best</dt><dd className="good">{report.bests[0].name}</dd></div>
                : report.feel.hard > 0 ? <div><dt>Felt hard</dt><dd className="warn">{report.feel.hard} session{report.feel.hard === 1 ? "" : "s"}</dd></div> : null}
            </dl>
          </div>
        )}
        <p className="rp-private"><Icon.Lock size={14} />{thisOne ? `${first} can see this on their link.` : `Only you can see this. ${first} sees it only after you share it.`}</p>
        <div className="cx-actions-2">
          {report.quiet && !thisOne
            ? <><Button variant="primary" icon={<Icon.Messages size={16} />} onClick={sendCheckIn}>Send a check-in</Button><Button onClick={() => setReviewing(true)}>Review anyway</Button></>
            : <><Button variant="primary" onClick={() => setReviewing(true)}>{thisOne ? "Review" : "Review & share"}</Button>
               {thisOne && <Button disabled={stopping} onClick={() => stop(thisOne)}>{stopping ? "Stopping…" : "Stop sharing"}</Button>}</>}
        </div>
      </section>

      {earlier.length > 0 && (
        <section aria-label="Earlier reports" className="rp-earlier">
          <span className="rp-eyebrow">Earlier reports</span>
          {earlier.map((r) => (
            <div key={r.id} className="rp-earlier-row">
              <button type="button" className="rp-earlier-open" onClick={() => setStart(r.period_start)}>
                <b>{weekLabel(r.period_start)}</b>
                <span>{r.stopped_at ? "Stopped sharing" : `Shared ${shortDate(r.shared_at)}`}</span>
              </button>
              {r.stopped_at ? <Pill color="#8A8A8A">Stopped</Pill> : r.seen_at ? <Pill color="#C8FF00">Seen</Pill> : <Pill color="#B0B0B0">Not seen yet</Pill>}
            </div>
          ))}
        </section>
      )}
      {!reportsOn && <p className="cx-small cx-muted">Sharing reports needs the latest database update.</p>}

      {reviewing && (
        <ReportReview open={reviewing} onClose={() => setReviewing(false)} report={report} data={data} row={row} first={first}
          shared={thisOne} onShared={loadShared} onStop={() => thisOne && stop(thisOne)} actions={actions} />
      )}
    </div>
  );
}

// ── The full review ─────────────────────────────────────────────────────────
function ReportReview({ open, onClose, report, data, row, first, shared, onShared, onStop, actions }) {
  const api = useCoachData();
  const toast = useToast();
  const clientId = row.link.athlete_id;
  const prev = shared?.snapshot;
  // Starting from what was shared keeps a coach's own edits when they reopen it.
  const [sections, setSections] = React.useState(() => sectionsFrom(prev));
  const [note, setNote] = React.useState(prev?.note ?? report.draftNote);
  const [focus, setFocus] = React.useState(prev?.focus ?? report.draftFocus);
  const [mode, setMode] = React.useState("review"); // review | preview | share
  const [applied, setApplied] = React.useState({});
  // "Coach Vardan" or "Vardan Chennupati" both become "Vardan": the report adds "Coach" itself.
  const coachName = String(api.coachName || "").replace(/^\s*coach\s+/i, "").trim().split(/\s+/)[0] || "";
  const snapshot = React.useMemo(() => reportSnapshot(report, { sections, note, focus, coachName, firstName: first }), [report, sections, note, focus, coachName, first]);
  const has = {
    workouts: true,
    wins: report.wins.length > 0,
    volume: report.volume.total > 0,
    muscles: !report.quiet && report.muscles.worked.length > 0,
    gap: Boolean(report.weakest && report.weakest.verdict !== "on plan"),
    note: true,
    body: report.body.weight != null || report.body.waist != null,
  };
  const toggle = (k) => setSections((s) => ({ ...s, [k]: !s[k] }));

  async function apply(s, i) {
    try {
      await api.saveClientRoutine(clientId, applySuggestion(data.routine, s));
      setApplied((a) => ({ ...a, [i]: true }));
      toast(`${first}'s plan is updated.`);
      actions?.reloadClient?.(clientId);
    } catch (e) { toast(e.message || "Could not change the plan", "error"); }
  }

  const title = mode === "preview" ? `What ${first} will see` : mode === "share" ? `Share ${first}'s week` : `${first}'s week`;
  const subtitle = mode === "review" ? `${report.period.label} · ${shared ? "Shared" : "Draft, only you can see it"}` : null;

  return (
    <Sheet open={open} onClose={onClose} title={title} subtitle={subtitle} wide>
      {mode === "preview" ? (
        <ReportView snapshot={snapshot} inSheet onBack={() => setMode("review")} backLabel="Back to the review" />
      ) : mode === "share" ? (
        <ShareStep row={row} first={first} start={report.period.start} snapshot={snapshot} onBack={() => setMode("review")} onShared={onShared} onDone={onClose}
          onMakeLink={actions?.shareLink ? () => { onClose(); actions.shareLink(clientId); } : null} />
      ) : (
        <div className="cx-col rp-review">
          <section className="rp-block">
            <span className="rp-eyebrow">The week in one line</span>
            <h2 className="rp-big">{report.headline}</h2>
            <div className="rp-tiles">
              <div><b>{report.workouts.planned ? `${report.workouts.done} of ${report.workouts.planned}` : report.workouts.done}</b><span>workouts</span></div>
              <div><b>{report.sets.planned ? `${report.sets.done} of ${report.sets.planned}` : report.sets.done}</b><span>sets</span></div>
              <div><b className={report.feel.hard ? "warn" : ""}>{report.feel.hard}</b><span>felt hard</span></div>
            </div>
          </section>

          <section className="rp-block">
            <span className="rp-eyebrow">Better than last week</span>
            {report.wins.length === 0
              ? <p className="cx-muted">{report.workouts.done === 0 ? "No workouts this week to compare." : "Nothing beat last time this week. Same weights and reps count as holding steady."}</p>
              : <ul className="rp-wins">
                  {report.wins.map((w) => { const t = winWords(w, report.body.weightUnit); return (
                    <li key={w.name}><span className="lk-wins-tag">{w.ever ? "Best ever" : t.tag}</span><b>{w.name}</b><span>{t.line}</span></li>
                  ); })}
                </ul>}
            {report.wins.length > 5 && <p className="cx-small cx-muted">{first} sees the top 5 and "{report.wins.length - 5} more".</p>}
          </section>

          <section className="rp-block">
            <span className="rp-eyebrow">Weight lifted</span>
            {report.volume.total > 0 ? (
              <>
                <div className="rp-row"><b className="rp-vol-num">{bigNum(report.volume.total)} {report.body.weightUnit}</b><span className="cx-small" style={{ color: report.volume.trend === "up" ? "var(--cx-a)" : report.volume.trend === "down" ? "#F5B84A" : undefined }}>{volumeLine(report.volume) || "No lifting the week before to compare."}</span></div>
                <VolumeBars weeks={report.volume.weeks.map((w) => ({ s: w.start, t: w.total }))} unit={report.body.weightUnit} />
                <p className="cx-small cx-muted">Weight × reps for every set they ticked, all workouts added up. Bodyweight sets add nothing.</p>
              </>
            ) : <p className="cx-muted">No weighted sets this week, so there's nothing to add up.</p>}
          </section>

          <section className="rp-block">
            <span className="rp-eyebrow">What they trained most</span>
            {report.quiet ? (
              <p className="cx-muted">{report.workouts.done === 0 ? "No workouts were sent this week, so there's nothing to draw." : "One workout is too little to say what they trained most, so this report doesn't try."}</p>
            ) : report.muscles.worked.length === 0 ? (
              <p className="cx-muted">None of this week's exercises are in the exercise list yet, so there's nothing to draw.</p>
            ) : (
              <>
                <div className="rp-figs big">
                  <BodyMap view="front" levels={report.muscles.levels} width={120} stroke="#101010" label="Front of body, muscles shaded by work" />
                  <BodyMap view="back" levels={report.muscles.levels} width={120} stroke="#101010" label="Back of body, muscles shaded by work" />
                </div>
                {report.muscles.sentence && <p className="rp-say">{report.muscles.sentence}</p>}
                <ul className="rp-chips">
                  {report.muscles.worked.map((g) => <li key={g} className={report.muscles.levels[g] === 3 ? "strong" : ""}><Dot color={LEVEL_FILL[report.muscles.levels[g]]} />{GROUP_LABEL[g] || g}</li>)}
                </ul>
                <p className="cx-small cx-muted">Counted from sets they ticked, not sets planned. Darkest green: muscles that only helped.{report.muscles.unknown.length ? ` ${report.muscles.unknown.length} exercise${report.muscles.unknown.length === 1 ? " isn't" : "s aren't"} in the exercise list yet, so not shown.` : ""}</p>
              </>
            )}
          </section>

          {Object.keys(report.gaps).length > 0 && (
            <section className="rp-block">
              <span className="rp-eyebrow">Plan vs done</span>
              <div className="rp-figs big">
                <BodyMap view="front" fills={Object.fromEntries(Object.entries(report.gaps).map(([g, x]) => [g, GAP_FILL[x.status]]))} width={120} stroke="#101010" label="Front of body, plan versus done" />
                <BodyMap view="back" fills={Object.fromEntries(Object.entries(report.gaps).map(([g, x]) => [g, GAP_FILL[x.status]]))} width={120} stroke="#101010" label="Back of body, plan versus done" />
              </div>
              <ul className="rp-legend">
                {["on", "half", "missed"].map((k) => <li key={k}><Dot color={GAP_FILL[k]} />{GAP_WORD[k]}</li>)}
                <li><Dot color="#3D3D3D" />Not in the plan</li>
              </ul>
              <div className="rp-bars">
                {Object.values(report.regions).filter((r) => r.planned >= 4).map((r) => (
                  <div key={r.label} className="rp-bar-row">
                    <div className="rp-row"><b>{r.label}</b><span style={{ color: REGION_COLOR[r.verdict] }}>{r.done} of {r.planned} sets</span></div>
                    <div className="rp-bar"><span style={{ width: `${Math.min(100, Math.round((r.done / r.planned) * 100))}%`, background: REGION_COLOR[r.verdict] }} /></div>
                  </div>
                ))}
                {Object.entries(report.gaps).filter(([, x]) => x.status !== "on").sort((a, b) => a[1].done / a[1].planned - b[1].done / b[1].planned).slice(0, 4).map(([g, x]) => (
                  <div key={g} className="rp-row small"><span>{GROUP_LABEL[g] || g}</span><span style={{ color: GAP_FILL[x.status] }}>{x.done} of {x.planned} sets</span></div>
                ))}
              </div>
            </section>
          )}

          <section className="rp-block">
            <div className="rp-row"><span className="rp-eyebrow">Body</span><span className="cx-small cx-muted">Not shared unless you turn it on</span></div>
            <div className="rp-tiles two">
              <div><span>Weight, 7-day average</span><b>{report.body.weight != null ? `${report.body.weight} ${report.body.weightUnit}` : "—"}</b>
                <small>{report.body.weight == null ? "No weigh-ins this week" : report.body.weightDelta != null ? `${report.body.weightDelta < 0 ? "Down" : report.body.weightDelta > 0 ? "Up" : "Same as"} ${report.body.weightDelta ? Math.abs(report.body.weightDelta) + " " + report.body.weightUnit : "last week"} · ${report.body.weighIns} weigh-in${report.body.weighIns === 1 ? "" : "s"}` : `${report.body.weighIns} weigh-in${report.body.weighIns === 1 ? "" : "s"}`}</small></div>
              <div><span>Waist</span><b>{report.body.waist != null ? `${report.body.waist} ${report.body.lengthUnit}` : "—"}</b>
                <small>{report.body.waist == null ? "Not sent this week" : report.body.waistDelta ? `${report.body.waistDelta < 0 ? "Down" : "Up"} ${Math.abs(report.body.waistDelta)} ${report.body.lengthUnit}` : "No change"}</small></div>
            </div>
            {report.body.bmi != null
              ? <p className="cx-small cx-muted">BMI {report.body.bmi}, in the "{report.body.bmiCategory}" range.</p>
              : report.body.heightCm
                ? <p className="cx-small cx-muted">BMI shows once {first} has weighed in.</p>
              : row.link.manual
                ? <HeightField clientId={clientId} first={first} units={data?.profile?.unit_system} onSaved={() => actions?.reloadClient?.(clientId)} />
                : <p className="cx-small cx-muted">BMI needs {first}'s height, which they set in their app.</p>}
          </section>

          <section className="rp-block">
            <div className="rp-row"><span className="rp-eyebrow">What Theryn noticed</span><span className="cx-small cx-muted">Only you see these</span></div>
            {report.patterns.length === 0
              ? <p className="cx-muted">Nothing stood out this week.</p>
              : report.patterns.map((p) => (
                <div key={p.kind} className={`rp-pattern ${p.tone}`}>
                  <b>{p.title}</b>
                  <p><span>Seen:</span> {p.seen}</p>
                  {p.ask && <p><span>Worth asking:</span> {p.ask}</p>}
                </div>
              ))}
          </section>

          {report.suggestions.length > 0 && (
            <section className="rp-block">
              <span className="rp-eyebrow">Suggested for next week</span>
              {report.suggestions.map((s, i) => (
                <div key={s.kind} className="rp-suggest">
                  <div><b>{s.title}</b><span>{s.why}</span></div>
                  <Button size="sm" disabled={applied[i]} onClick={() => apply(s, i)}>{applied[i] ? "Done" : s.kind === "swap" ? "Swap" : "Move"}</Button>
                </div>
              ))}
              <p className="cx-small cx-muted">Nothing in {first}'s plan changes until you tap.</p>
            </section>
          )}

          <section className="rp-block">
            <span className="rp-eyebrow">What {first} will see</span>
            {SECTION_LABELS.map(([k, label]) => (
              <label key={k} className={`rp-check ${has[k] ? "" : "off"}`}>
                <input type="checkbox" checked={Boolean(sections[k]) && has[k]} disabled={!has[k]} onChange={() => toggle(k)} />
                <span>{label}{!has[k] && <small>Nothing to show this week</small>}{k === "body" && has[k] && <small>Off by default. Turn it on if {first} asked to see it.</small>}</span>
              </label>
            ))}
            <p className="cx-small cx-muted">Untick anything you'd rather not send. What Theryn noticed and the suggestions stay with you. They never go to {first}.</p>
          </section>

          {sections.note && (
            <section className="rp-block">
              <label htmlFor="rp-note" className="rp-label">Your note to {first}</label>
              <textarea id="rp-note" className="cx-input rp-note" rows={4} maxLength={600} value={note} onChange={(e) => setNote(e.target.value)} />
              <span className="cx-small cx-muted">Theryn drafted this from their week. Change anything — it goes out in your name.</span>
              <label htmlFor="rp-focus" className="rp-label">Next week's focus</label>
              <input id="rp-focus" className="cx-input" maxLength={80} value={focus} onChange={(e) => setFocus(e.target.value)} />
            </section>
          )}

          <div className="rp-foot">
            {shared && <Button onClick={onStop}>Stop sharing</Button>}
            <Button onClick={() => setMode("preview")}>Preview as {first}</Button>
            <Button variant="primary" onClick={() => setMode("share")}>{shared ? "Share again" : `Share with ${first}`}</Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

// ── Sharing ─────────────────────────────────────────────────────────────────
function ShareStep({ row, first, start, snapshot, onBack, onShared, onDone, onMakeLink }) {
  const api = useCoachData();
  const toast = useToast();
  const clientId = row.link.athlete_id;
  const [link, setLink] = React.useState({ loading: true, link: null, token: null });
  const [busy, setBusy] = React.useState(false);
  // Once shared: the message that goes with it, and how the coach meant to send it.
  const [done, setDone] = React.useState(null); // { text, how }

  React.useEffect(() => {
    let alive = true;
    api.getClientLink(clientId).then((r) => { if (alive) setLink({ loading: false, link: r?.link || null, token: r?.token || null }); })
      .catch(() => { if (alive) setLink({ loading: false, link: null, token: null }); });
    return () => { alive = false; };
  }, [api, clientId]);

  const message = (id) => (link.token ? reportMessage(first, `${linkUrl(link.token)}?r=${id}`) : `Hi ${first}, your week is ready. Open your Theryn link to see it.`);

  // Save first, then send. WhatsApp opens from its own button on the next
  // screen, a plain link the coach taps: opening it from here after waiting
  // for the save left iPhone Safari on a blank tab, with the save paused
  // behind it, and the client never got the message.
  async function share(how) {
    setBusy(true);
    try {
      const res = await api.shareReport(clientId, start, snapshot);
      const text = message(res.id);
      if (how === "copy") await copy(text);
      setDone({ text, how });
      onShared?.();
    } catch (e) {
      toast(e.message || "Could not share it", "error");
    } finally { setBusy(false); }
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast(`Message copied. Paste it to ${first}.`); }
    catch { toast(`Couldn't copy it. ${first} can still open it on their link.`); }
  }

  async function saveImage() {
    try {
      const r = await saveReportImage(snapshot, { filename: `${first.toLowerCase()}-week-${start}.png`, isNative: api.isNative });
      if (r === "downloaded") toast("Image saved.");
    } catch (e) { if (e?.name !== "AbortError") toast(e.message || "Could not make the image", "error"); }
  }

  if (done) {
    return (
      <div className="cx-col rp-done">
        <span className="rp-done-tick" aria-hidden="true"><Icon.Check size={26} /></span>
        <h3>Shared with {first}.</h3>
        <p className="cx-muted">It's on their Theryn link now. {done.how === "whatsapp" ? `Send ${first} the message so they know it's there.` : `You'll see here when they open it.`}</p>
        {done.how === "whatsapp" && (
          <>
            <a className="cx-btn cx-btn-primary cx-btn-block" href={whatsappUrl(done.text)} target="_blank" rel="noopener noreferrer"><Icon.Messages size={18} />Send on WhatsApp</a>
            <p className="cx-small cx-muted rp-center">Opens WhatsApp with the message ready. Pick {first}'s chat.</p>
          </>
        )}
        <Button block icon={<Icon.Copy size={16} />} onClick={() => copy(done.text)}>Copy message</Button>
        <Button block onClick={onDone}>Done</Button>
      </div>
    );
  }

  return (
    <div className="cx-col rp-share">
      <div className="rp-recipient">
        <span className="rp-avatar" aria-hidden="true">{first.charAt(0).toUpperCase()}</span>
        <div><b>{row.name}</b><span>{link.link ? "It opens on their own Theryn link" : link.loading ? "Checking their link…" : "No link yet"}</span></div>
        <Icon.Lock size={16} />
      </div>

      {!link.loading && !link.link ? (
        <>
          <p className="cx-muted">{first} doesn't have a Theryn link yet, so there's nowhere for the report to open. Make their link first, then come back and share.</p>
          {onMakeLink && <Button variant="primary" block onClick={onMakeLink}>Make {first}'s link</Button>}
        </>
      ) : (
        <>
          <Button variant="primary" block disabled={busy || link.loading} icon={<Icon.Messages size={18} />} onClick={() => share("whatsapp")}>{busy ? "Sharing…" : "Share and send on WhatsApp"}</Button>
          <p className="cx-small cx-muted rp-center">Shares it, then gives you the WhatsApp button with the message ready.</p>
          <div className="cx-actions-2">
            <Button disabled={busy || link.loading} icon={<Icon.Copy size={16} />} onClick={() => share("copy")}>Share and copy message</Button>
            <Button icon={<Icon.Download size={16} />} onClick={saveImage}>Save as image</Button>
          </div>
          <div className="rp-message"><span className="rp-eyebrow">The message</span><p>{message("…").replace("?r=…", "")}</p></div>
          <ul className="rp-promises">
            <li><Icon.Check size={16} />It opens {first}'s report only. It's tied to their link.</li>
            <li><Icon.Check size={16} />The chat preview shows no numbers and no body weight.</li>
            <li><Icon.Check size={16} />You can stop sharing it any time.</li>
          </ul>
        </>
      )}
      <Button onClick={onBack}>Back to the review</Button>
    </div>
  );
}

// ── Height, for clients without the app ─────────────────────────────────────
export function HeightField({ clientId, first, units, onSaved }) {
  const api = useCoachData();
  const toast = useToast();
  const imperial = units !== "metric";
  const [cm, setCm] = React.useState("");
  const [ft, setFt] = React.useState("");
  const [inch, setInch] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  if (typeof api.setClientHeight !== "function") return null;
  const value = imperial ? (Number(ft) * 12 + Number(inch || 0)) * 2.54 : Number(cm);
  const valid = value >= 50 && value <= 260;
  async function save(e) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    try { await api.setClientHeight(clientId, Math.round(value * 10) / 10); toast(`Saved. BMI will show for ${first}.`); onSaved?.(); }
    catch (err) { toast(err.message || "Could not save it", "error"); }
    finally { setBusy(false); }
  }
  return (
    <form className="rp-height" onSubmit={save}>
      <span className="cx-small cx-muted">BMI needs {first}'s height.</span>
      <div className="rp-height-row">
        {imperial ? (
          <>
            <label className="rp-unit"><span className="lk-sr">Feet</span><input className="cx-input" inputMode="numeric" value={ft} onChange={(e) => setFt(e.target.value.replace(/\D/g, "").slice(0, 1))} placeholder="5" aria-label="Feet" /><span>ft</span></label>
            <label className="rp-unit"><span className="lk-sr">Inches</span><input className="cx-input" inputMode="numeric" value={inch} onChange={(e) => setInch(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="6" aria-label="Inches" /><span>in</span></label>
          </>
        ) : (
          <label className="rp-unit"><span className="lk-sr">Centimetres</span><input className="cx-input" inputMode="decimal" value={cm} onChange={(e) => setCm(e.target.value.replace(/[^\d.]/g, "").slice(0, 5))} placeholder="168" aria-label="Height in centimetres" /><span>cm</span></label>
        )}
        <Button type="submit" size="sm" disabled={!valid || busy}>{busy ? "Saving…" : "Save height"}</Button>
      </div>
    </form>
  );
}
