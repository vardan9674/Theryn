import React from "react";
import BodyMap from "../components/BodyMap.jsx";
import { GROUP_LABEL } from "../lib/exerciseLibrary.js";
import { muscleWords } from "../lib/muscleHeat.js";
import { weekLabel, volumeLine, compactNumber } from "../coach/lib/weeklyReport.js";
import { Icon } from "../coach/ui/primitives.jsx";
import { winNumbers } from "../lib/workoutWins.js";
import Medal, { useDisplayFonts } from "../components/Medal.jsx";
import "./report.css";

// A report the coach shared, as the client sees it on their link.
//
// It draws only the frozen snapshot the coach chose to send (reportSnapshot):
// nothing here is worked out afresh, so what the client reads is exactly what
// the coach saw in "Preview" — the coach's preview renders this same component.
// The coach's own words first, verdict words throughout, detail behind a tap.

// How a region reads in a sentence about the client.
const REGION_PHRASE = { "Upper body": "Everything above the waist", Legs: "Your legs", Core: "Your core" };
const phrase = (label) => REGION_PHRASE[label] || `Your ${String(label || "").toLowerCase()}`;
const num = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortWeek = (iso) => { const [, m, d] = String(iso).split("-").map(Number); return `${d} ${MON[(m || 1) - 1]}`; };
const bigNum = (n) => Math.round(n).toLocaleString("en-US");

/**
 * Weight lifted, week by week: one bar a week, this week bright. The coach's
 * review draws the same bars, so what they see is what the client gets.
 * weeks: [{ s: Monday, t: total }], oldest first.
 */
export function VolumeBars({ weeks, unit }) {
  const max = Math.max(1, ...weeks.map((w) => w.t));
  const lastI = weeks.length - 1;
  return (
    <div className="lk-vol" role="img" aria-label={`Weight lifted each week: ${weeks.map((w) => `${shortWeek(w.s)} ${bigNum(w.t)} ${unit}`).join(", ")}`}>
      {weeks.map((w, i) => (
        <div key={w.s} className={`lk-vol-col${i === lastI ? " now" : ""}`}>
          <span className="lk-vol-bar"><i style={{ height: `${w.t > 0 ? Math.max(4, Math.round((w.t / max) * 100)) : 0}%` }} /></span>
          <span className="lk-vol-x">{i === lastI ? "This wk" : shortWeek(w.s)}</span>
        </div>
      ))}
    </div>
  );
}

/** The card on the link that opens a shared report. */
export function ReportEntry({ report, onOpen }) {
  const s = report?.snapshot || {};
  const label = s.period?.start ? weekLabel(s.period.start) : "";
  return (
    <button type="button" className="lk-card lk-rep-entry" onClick={onOpen}>
      <span className="lk-rep-eyebrow">{report.seen ? "Your week" : "New · your week"}{label ? ` · ${label}` : ""}</span>
      <b className="lk-rep-entry-h">{s.headline || "Your weekly report"}</b>
      <span className="lk-rep-entry-by">From {s.coach ? `Coach ${s.coach}` : "your coach"}<Icon.Chevron size={16} /></span>
    </button>
  );
}

const DAYS7 = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TICK = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5 10 17 19 7" /></svg>;
const CHEVRON = <svg className="rw-chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>;

/** The seven days: done, still to come, missed, or a rest day. */
function WeekDots({ days }) {
  const by = new Map((days || []).map((d) => [d.k, d]));
  return (
    <ol className="rw-days">
      {DAYS7.map((k) => {
        const d = by.get(k);
        const state = !d ? "rest" : d.d ? "done" : d.u ? "next" : "missed";
        const said = { done: "done", next: "still to come", missed: "missed", rest: "rest day" }[state];
        return (
          <li key={k} className={state}>
            <span className="dot" aria-hidden="true">{state === "done" ? TICK : null}</span>
            <span aria-hidden="true">{k}</span>
            <span className="lk-sr">{k}: {said}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Medals for a report shared before medals existed: its best-ever lifts. */
function medalsOf(s) {
  if (Array.isArray(s.medals)) return s.medals;
  const out = [];
  for (const x of (s.wins?.items || []).filter((w) => w.ever).slice(0, 2)) {
    const n = winNumbers(x, s.wins.unit);
    out.push({ tone: "gold", value: n.to, unit: n.what, title: x.name, sub: "Best ever" });
  }
  if (!out.length && s.best) out.push({ tone: "gold", value: num(s.best.weight), unit: s.best.unit, title: s.best.name, sub: "New best" });
  return out;
}

// A round number just above the tallest bar, for the chart's scale.
function niceMax(max) {
  if (!(max > 0)) return 1;
  const pow = 10 ** Math.floor(Math.log10(max)), n = max / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

/**
 * Weight lifted by week, with a scale: only the weeks since they started
 * (leading empty weeks are dropped), a value on every bar, this week bright.
 */
function VolumeChart({ weeks, unit }) {
  const from = Math.max(0, weeks.findIndex((w) => w.t > 0));
  const shown = weeks.slice(from);
  const top = niceMax(Math.max(...shown.map((w) => w.t)));
  const last = shown.length - 1;
  return (
    <div className={`rw-chart${shown.length > 4 ? " many" : ""}`} role="img" aria-label={`Weight lifted by week: ${shown.map((w, i) => `${i === last ? "this week" : shortWeek(w.s)} ${bigNum(w.t)} ${unit}`).join(", ")}`}>
      <div className="rw-chart-y" aria-hidden="true"><span>{compactNumber(top).toLowerCase()}</span><span>{compactNumber(top / 2).toLowerCase()}</span><span>0</span></div>
      <div className="rw-chart-plot" aria-hidden="true">
        <i className="grid top" /><i className="grid mid" />
        <div className="rw-chart-bars">
          {shown.map((w, i) => (
            <div key={w.s} className={`rw-bar${i === last ? " now" : ""}`}>
              <span>{shown.length > 4 ? compactNumber(w.t).toLowerCase() : bigNum(w.t)}</span>
              <i style={{ height: `${Math.max(w.t > 0 ? 3 : 0, Math.round((w.t / top) * 100))}%` }} />
            </div>
          ))}
        </div>
      </div>
      <span />
      <div className="rw-chart-x" aria-hidden="true">
        {shown.map((w, i) => <span key={w.s} className={i === last ? "now" : ""}>{i === last ? "This week" : shortWeek(w.s)}</span>)}
      </div>
    </div>
  );
}

/** One win: where it was (grey), where it is now (lime). */
function WinTrack({ win, unit }) {
  const x = winNumbers(win, unit);
  const pct = Math.max(6, Math.min(90, Math.round((Number(win.before) / Math.max(1, Number(win.now))) * 100)));
  return (
    <li className="rw-win">
      <div><b>{win.name}</b><span>{x.from} <em>→</em> <strong>{x.to}</strong> {x.what}</span></div>
      <div className="rw-track" aria-hidden="true" style={{ "--p": `${pct}%` }}><i className="line" /><i className="gain" /><i className="was" /><i className="now" /></div>
    </li>
  );
}

/** A line of the report that opens: the insight in a sentence, the chart behind a tap. */
function Row({ id, open, onToggle, icon, title, sub, children }) {
  return (
    <div className={`rw-row${open ? " open" : ""}`}>
      <button type="button" className="rw-row-hd" aria-expanded={open} aria-controls={`rw-${id}`} onClick={() => onToggle(id)}>
        <span className="rw-row-ic" aria-hidden="true">{icon}</span>
        <span className="rw-row-tx"><b>{title}</b>{sub && <span>{sub}</span>}</span>
        {CHEVRON}
      </button>
      {open && <div className="rw-row-body" id={`rw-${id}`}>{children}</div>}
    </div>
  );
}

/**
 * The report itself. `onBack` returns to the link; in the coach's preview it
 * closes the preview.
 *
 * Three questions, in order: how did the week go (the lime panel), what did
 * I earn (medals), what's next (the coach's focus). The detail — every win,
 * the weekly chart, the body map — sits behind one tap each, because a page
 * of charts is what made people stop reading.
 */
export function ReportView({ snapshot, onBack, backLabel = "Back to today's workout", inSheet = false }) {
  useDisplayFonts();
  const s = snapshot || {};
  const label = s.period?.start ? weekLabel(s.period.start) : "";
  const w = s.workouts;
  const m = s.muscles;
  const worked = (m?.worked || []).filter((g) => GROUP_LABEL[g]);
  const medals = medalsOf(s);
  const wins = s.wins?.items || [];
  const winCount = wins.length + (s.wins?.more || 0);
  const [open, setOpen] = React.useState({});
  const toggle = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  const first = wins[0] ? winNumbers(wins[0], s.wins.unit) : null;
  const hasVolume = s.volume?.total > 0 && Array.isArray(s.volume.weeks);
  const hasBody = s.body && (s.body.weight != null || s.body.waist != null);
  const hasRows = winCount > 0 || hasVolume || (m && worked.length > 0) || hasBody;
  return (
    <div className={`lk-page cx-app lk-rep rw${inSheet ? " in-sheet" : ""}`}>
      {/* How did the week go */}
      <header className="rw-hero">
        <div className="rw-hero-top">
          <span className="rw-from"><svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path d="M12 12 36 36M36 12 12 36" stroke="currentColor" strokeWidth="9" strokeLinecap="round" fill="none" /></svg>From {s.coach ? `Coach ${s.coach}` : "your coach"}</span>
          {label && <span className="rw-dates">{label}</span>}
        </div>
        <h1 className="rw-title">{s.headline || "Your week."}</h1>
        {s.note && <p className="rw-note">{s.note}</p>}
        {w && (
          <>
            <hr />
            <dl className="rw-stats">
              <div><dt>workout{(w.planned || w.done) === 1 ? "" : "s"}</dt><dd>{w.done || 0}{w.planned ? <small> of {w.planned}</small> : null}</dd></div>
              {w.sets > 0 && <div><dt>sets done</dt><dd>{w.sets}</dd></div>}
              {w.streak >= 2 && <div><dt>in a row</dt><dd>{w.streak}</dd></div>}
            </dl>
            <WeekDots days={w.days} />
          </>
        )}
      </header>

      {/* What did I earn */}
      {medals.length > 0 && (
        <section className="rw-card rw-medals" aria-label="Earned this week">
          <span className="lk-rep-eyebrow">Earned this week</span>
          <ul className={`n${medals.length}`}>
            {medals.map((x, i) => (
              <li key={i}>
                <Medal tone={x.tone} value={x.value} unit={x.unit} flame={x.flame} label="" />
                <b>{x.title}</b>
                <span className={x.tone}>{x.sub}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* The detail, one tap away */}
      {hasRows && (
        <section className="rw-card rw-rows" aria-label="The details">
          {winCount > 0 && (
            <Row id="wins" open={open.wins} onToggle={toggle}
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>}
              title={`${winCount} exercise${winCount === 1 ? "" : "s"} went up`}
              sub={first ? `${wins[0].name} ${first.from} → ${first.to} ${first.what}${winCount > 1 ? `, and ${winCount - 1} more` : ""}` : null}>
              <ul className="rw-wins">{wins.map((x) => <WinTrack key={x.name} win={x} unit={s.wins.unit} />)}</ul>
              <div className="rw-legend">
                <span>{s.wins.more > 0 ? `And ${s.wins.more} more.` : ""}</span>
                <span><i className="was" />last week<i className="now" />now</span>
              </div>
            </Row>
          )}
          {hasVolume && (
            <Row id="lifted" open={open.lifted} onToggle={toggle}
              icon={<span className="rw-minibars"><i /><i /><i /></span>}
              title={`${bigNum(s.volume.total)} ${s.volume.unit} lifted`}
              sub={volumeLine(s.volume).replace(/\.$/, "") || "This week's total"}>
              <VolumeChart weeks={s.volume.weeks} unit={s.volume.unit} />
              <p className="rw-foot">Every set's weight × reps, added up.</p>
            </Row>
          )}
          {m && worked.length > 0 && (
            <Row id="body" open={open.body} onToggle={toggle}
              icon={<BodyMap view="front" levels={m.levels} width={19} stroke="#1B1B1E" label="" />}
              title={m.top?.length > 0 ? `Mostly ${muscleWords(m.top)}` : "What you trained"}
              sub="See which muscles you trained">
              <div className="rw-figs">
                <figure><BodyMap view="front" levels={m.levels} width={116} stroke="#101010" label={`Front of body. Trained: ${worked.map((g) => GROUP_LABEL[g]).join(", ")}`} /><figcaption>Front</figcaption></figure>
                <figure><BodyMap view="back" levels={m.levels} width={116} stroke="#101010" label={`Back of body. Trained: ${worked.map((g) => GROUP_LABEL[g]).join(", ")}`} /><figcaption>Back</figcaption></figure>
              </div>
              <div className="rw-key" aria-hidden="true"><span><i className="l3" />Most</span><span><i className="l2" />Some</span><span><i className="l1" />A little</span><span><i />Rested</span></div>
              {Array.isArray(m.sets) && m.sets.length > 0
                ? <ul className="rw-sets">{m.sets.filter((x) => GROUP_LABEL[x.g]).map((x) => <li key={x.g}><span>{GROUP_LABEL[x.g]}</span><span><b>{x.n}</b> set{x.n === 1 ? "" : "s"}</span></li>)}</ul>
                : <ul className="lk-heat-list">{worked.map((g) => <li key={g} className={`lk-heat-m l${m.levels?.[g] || 1}`}><span className="lk-heat-dot" aria-hidden="true" />{GROUP_LABEL[g]}</li>)}</ul>}
            </Row>
          )}
          {hasBody && (
            <div className="rw-row">
              <div className="rw-row-hd static">
                <span className="rw-row-ic" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M9 9.5a3 3 0 0 1 6 0M12 9.5V11" /></svg></span>
                <span className="rw-row-tx">
                  {s.body.weight != null && <b>{num(s.body.weight)} {s.body.unit} average weight</b>}
                  {s.body.weight != null && s.body.weightDelta != null && s.body.weightDelta !== 0 && <span>{s.body.weightDelta < 0 ? "Down" : "Up"} {num(Math.abs(s.body.weightDelta))} {s.body.unit} from last week</span>}
                  {s.body.waist != null && (s.body.weight != null
                    ? <span>Waist {num(s.body.waist)} {s.body.lengthUnit}{s.body.waistDelta ? `, ${s.body.waistDelta < 0 ? "down" : "up"} ${num(Math.abs(s.body.waistDelta))}` : ""}</span>
                    : <b>Waist {num(s.body.waist)} {s.body.lengthUnit}</b>)}
                </span>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Only in a week where part of the plan fell behind */}
      {s.gap?.weak && (
        <section className="rw-card rw-gap" aria-label={`${s.gap.weak.label} next`}>
          <span className="lk-rep-eyebrow">{s.gap.weak.label} next</span>
          <p className="lk-rep-say">{phrase(s.gap.weak.label)} got {s.gap.weak.done} of the {s.gap.weak.planned} sets in your plan.</p>
          <div className="lk-rep-bar" role="img" aria-label={`${s.gap.weak.done} of ${s.gap.weak.planned} sets`}><span style={{ width: `${Math.min(100, Math.round((s.gap.weak.done / Math.max(1, s.gap.weak.planned)) * 100))}%` }} /></div>
          {s.gap.strong && <p className="lk-rep-sub">{phrase(s.gap.strong.label)}: {s.gap.strong.done} of {s.gap.strong.planned} sets. That part was spot on.</p>}
        </section>
      )}

      {/* What's next */}
      {s.focus && (
        <section className="rw-card rw-next" aria-label="Next week">
          <span className="lk-rep-eyebrow accent">Next week</span>
          <b>{s.focus}</b>
          <span>Your coach's focus</span>
        </section>
      )}

      <div className="lk-rep-foot">
        <span className="lk-rep-private"><Icon.Lock size={14} />Only you and your coach can see this.</span>
        {onBack && <button type="button" className="lk-send secondary" onClick={onBack}>{backLabel}</button>}
      </div>
    </div>
  );
}
