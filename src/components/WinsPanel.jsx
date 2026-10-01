import React from "react";
import { winWords, winsHeadline, winNumbers } from "../lib/workoutWins.js";
import "./wins.css";

// What they did better than last time, straight after a workout: on the
// client link's receipt and the athlete app's "Workout complete". The wins
// themselves come from lib/workoutWins.js; this only draws them.

const ICON = {
  heavier: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>,
  reps: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>,
  longer: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M9 2h6" /></svg>,
  more: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18l6-6 4 4 6-8" /></svg>,
};

/** One exercise's win: last time → this time. */
function WinRow({ win, unit, delay = 0 }) {
  const x = winNumbers(win, unit);
  const tag = winWords(win, unit).tag;
  return (
    <li className={`lk-win ${win.kind}`} style={{ "--d": `${0.1 + delay * 0.08}s` }}
      aria-label={`${win.name}: ${tag}. ${x.from} last time, ${x.to} ${x.what} now${x.note ? " " + x.note : ""}.`}>
      <span className="lk-win-ic" aria-hidden="true">{ICON[win.kind]}</span>
      <span className="lk-win-txt" aria-hidden="true">
        <b>{win.name}</b>
        <span>{tag}{x.note ? ` · ${x.note}` : ""}</span>
      </span>
      <span className="lk-win-num" aria-hidden="true">
        <span className="was">{x.from}</span>
        <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        <b>{x.to}</b><small>{x.what}</small>
      </span>
    </li>
  );
}

/** Nothing at all when there's nothing: never "0 wins". */
export default function WinsPanel({ wins, unit, max = 4 }) {
  if (!wins?.length) return null;
  const shown = wins.slice(0, max);
  return (
    <section className="lk-wins" aria-label="Better than last time">
      <span className="lk-wins-h">Better than last time</span>
      <p className="lk-wins-p">{winsHeadline(wins.length)}</p>
      <ul className="lk-wins-list">
        {shown.map((w, i) => <WinRow key={w.name} win={w} unit={unit} delay={i} />)}
      </ul>
      {wins.length > shown.length && <small>And {wins.length - shown.length} more.</small>}
    </section>
  );
}
