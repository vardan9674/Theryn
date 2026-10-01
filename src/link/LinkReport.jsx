import React from "react";
import BodyMap from "../components/BodyMap.jsx";
import { GROUP_LABEL } from "../lib/exerciseLibrary.js";
import { muscleWords } from "../lib/muscleHeat.js";
import { weekLabel, volumeLine } from "../coach/lib/weeklyReport.js";
import { Icon } from "../coach/ui/primitives.jsx";
import { winWords } from "../lib/workoutWins.js";

// A report the coach shared, as the client sees it on their link.
//
// It draws only the frozen snapshot the coach chose to send (reportSnapshot):
// nothing here is worked out afresh, so what the client reads is exactly what
// the coach saw in "Preview" — the coach's preview renders this same component.
// One idea per card, the coach's own words first, verdict words throughout.

const DAY_LONG = { Mon: "Mon", Tue: "Tue", Wed: "Wed", Thu: "Thu", Fri: "Fri", Sat: "Sat", Sun: "Sun" };
// How a region reads in a sentence about the client.
const REGION_PHRASE = { "Upper body": "Everything above the waist", Legs: "Your legs", Core: "Your core" };
const phrase = (label) => REGION_PHRASE[label] || `Your ${String(label || "").toLowerCase()}`;
const num = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));

// The report uses Theryn's display faces. The link page is otherwise system
// fonts, so they load only when a report is actually opened.
const FONTS_HREF = "https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@800;900&family=JetBrains+Mono:wght@500;700&display=swap";
export function useReportFonts() {
  React.useEffect(() => {
    if (typeof document === "undefined" || document.querySelector('link[href*="Big+Shoulders+Display"]')) return;
    const l = document.createElement("link");
    l.rel = "stylesheet"; l.href = FONTS_HREF;
    document.head.appendChild(l);
  }, []);
}

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

/** The report itself. `onBack` returns to the link; in the coach's preview it closes the preview. */
export function ReportView({ snapshot, onBack, backLabel = "Back to today's workout", inSheet = false }) {
  useReportFonts();
  const s = snapshot || {};
  const label = s.period?.start ? weekLabel(s.period.start) : "";
  const w = s.workouts || {};
  const m = s.muscles;
  const worked = (m?.worked || []).filter((g) => GROUP_LABEL[g]);
  return (
    <div className={`lk-page cx-app lk-rep${inSheet ? " in-sheet" : ""}`}>
      <div className="lk-rep-top">
        <span className="lk-rep-mark" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 48 48"><path d="M12 12 36 36M36 12 12 36" stroke="currentColor" strokeWidth="9" strokeLinecap="round" /></svg></span>
        <span className="lk-rep-from">From {s.coach ? `Coach ${s.coach}` : "your coach"}</span>
      </div>
      <div className="lk-rep-head">
        <span className="lk-rep-eyebrow accent">Your week{label ? ` · ${label}` : ""}</span>
        <h1 className="lk-rep-title">{s.headline || "Your week."}</h1>
      </div>

      {s.note && (
        <section className="lk-card lk-rep-note" aria-label="Note from your coach">
          <p>{s.note}</p>
          <span className="lk-rep-by">{s.coach ? `Coach ${s.coach}` : "Your coach"}</span>
        </section>
      )}

      {s.workouts && <section className="lk-card lk-rep-sec" aria-label="Workouts">
        <div className="lk-rep-big"><b>{w.planned ? `${w.done || 0} of ${w.planned}` : w.done || 0}</b><span>workout{(w.planned || w.done) === 1 ? "" : "s"} done</span></div>
        {Array.isArray(w.days) && w.days.length > 0 && (
          <ul className="lk-rep-days">
            {w.days.map((d) => (
              <li key={d.k} className={d.d ? "done" : "missed"}><span className="bar" aria-hidden="true" /><span>{DAY_LONG[d.k] || d.k}</span><span className="lk-sr">{d.d ? "done" : "not done"}</span></li>
            ))}
          </ul>
        )}
      </section>}

      {s.wins?.items?.length > 0 && (
        <section className="lk-card lk-rep-sec lk-rep-wins" aria-label="Better than last week">
          <span className="lk-rep-eyebrow accent">Better than last week</span>
          <p className="lk-rep-say">{s.wins.items.length + (s.wins.more || 0) === 1 ? "You beat last week." : `You beat last week on ${s.wins.items.length + (s.wins.more || 0)} exercises.`}</p>
          <ul>
            {s.wins.items.map((x) => { const t = winWords(x, s.wins.unit); return (
              <li key={x.name}><span className="lk-wins-tag">{x.ever ? "Best ever" : t.tag}</span><b>{x.name}</b><span>{t.line}</span></li>
            ); })}
          </ul>
          {s.wins.more > 0 && <span className="lk-rep-sub">And {s.wins.more} more.</span>}
        </section>
      )}

      {s.volume?.total > 0 && Array.isArray(s.volume.weeks) && (
        <section className="lk-card lk-rep-sec" aria-label="Weight lifted">
          <span className="lk-rep-eyebrow">Weight lifted</span>
          <b className="lk-rep-num">{bigNum(s.volume.total)} {s.volume.unit}</b>
          <span className="lk-rep-sub">In total this week{volumeLine(s.volume) ? `. ${volumeLine(s.volume)}` : "."}</span>
          <VolumeBars weeks={s.volume.weeks} unit={s.volume.unit} />
        </section>
      )}

      {m && worked.length > 0 && (
        <section className="lk-card lk-rep-sec" aria-label="What you trained">
          <span className="lk-rep-eyebrow">What you trained</span>
          <div className="lk-heat-figs">
            <BodyMap view="front" levels={m.levels} width={112} stroke="#101010" label={`Front of body. Trained: ${worked.map((g) => GROUP_LABEL[g]).join(", ")}`} />
            <BodyMap view="back" levels={m.levels} width={112} stroke="#101010" label={`Back of body. Trained: ${worked.map((g) => GROUP_LABEL[g]).join(", ")}`} />
          </div>
          {m.top?.length > 0 && <p className="lk-rep-say">Mostly {muscleWords(m.top)}.</p>}
          <ul className="lk-heat-list">
            {worked.map((g) => (
              <li key={g} className={`lk-heat-m l${m.levels?.[g] || 1}`}><span className="lk-heat-dot" aria-hidden="true" />{GROUP_LABEL[g]}</li>
            ))}
          </ul>
        </section>
      )}

      {s.gap?.weak && (
        <section className="lk-card lk-rep-sec" aria-label={`${s.gap.weak.label} next`}>
          <span className="lk-rep-eyebrow">{s.gap.weak.label} next</span>
          <p className="lk-rep-say">{phrase(s.gap.weak.label)} got {s.gap.weak.done} of the {s.gap.weak.planned} sets in your plan.</p>
          <div className="lk-rep-bar" role="img" aria-label={`${s.gap.weak.done} of ${s.gap.weak.planned} sets`}><span style={{ width: `${Math.min(100, Math.round((s.gap.weak.done / Math.max(1, s.gap.weak.planned)) * 100))}%` }} /></div>
          {s.gap.strong && <p className="lk-rep-sub">{phrase(s.gap.strong.label)}: {s.gap.strong.done} of {s.gap.strong.planned} sets. That part was spot on.</p>}
        </section>
      )}

      {s.best && (
        <section className="lk-card lk-rep-sec" aria-label="New best">
          <span className="lk-rep-eyebrow accent">New best</span>
          <span className="lk-rep-sub">{s.best.name}</span>
          <b className="lk-rep-num">{num(s.best.weight)} {s.best.unit} × {s.best.reps}</b>
          {s.best.prev != null && <span className="lk-rep-sub">Up from {num(s.best.prev)} {s.best.unit} last time.</span>}
        </section>
      )}

      {s.body && (s.body.weight != null || s.body.waist != null) && (
        <section className="lk-card lk-rep-sec" aria-label="Body">
          <span className="lk-rep-eyebrow">Body</span>
          <div className="lk-rep-pair">
            {s.body.weight != null && <div><span>Weight, this week's average</span><b>{num(s.body.weight)} {s.body.unit}</b>{s.body.weightDelta != null && s.body.weightDelta !== 0 && <small>{s.body.weightDelta < 0 ? "Down" : "Up"} {num(Math.abs(s.body.weightDelta))} {s.body.unit} from last week</small>}</div>}
            {s.body.waist != null && <div><span>Waist</span><b>{num(s.body.waist)} {s.body.lengthUnit}</b>{s.body.waistDelta != null && s.body.waistDelta !== 0 && <small>{s.body.waistDelta < 0 ? "Down" : "Up"} {num(Math.abs(s.body.waistDelta))} {s.body.lengthUnit}</small>}</div>}
          </div>
        </section>
      )}

      {s.focus && (
        <section className="lk-card lk-rep-sec" aria-label="Next week">
          <span className="lk-rep-eyebrow">Next week</span>
          <b className="lk-rep-focus">{s.focus}</b>
          <span className="lk-rep-sub">Your coach's focus</span>
        </section>
      )}

      <div className="lk-rep-foot">
        <span className="lk-rep-private"><Icon.Lock size={14} />Only you and your coach can see this.</span>
        {onBack && <button type="button" className="lk-send secondary" onClick={onBack}>{backLabel}</button>}
      </div>
    </div>
  );
}
