import React from "react";
import { winWords, winsHeadline, winNumbers } from "../lib/workoutWins.js";
import Medal from "./Medal.jsx";
import "./wins.css";

// What they did better than last time, straight after a workout: on the
// client link's receipt and the athlete app's "Workout complete". Each win
// is a medal carrying the new number, the same medal the weekly report
// hands out. The wins themselves come from lib/workoutWins.js.

/** "was 42.5 kg" / "was 10" / "was 0:45" / "was 20 in all" */
function wasLine(win, x) {
  if (win.kind === "heavier") return `was ${x.from} ${x.what}`;
  if (win.kind === "more") return `was ${x.from} in all`;
  return `was ${x.from}`;
}

function WinMedal({ win, unit, delay = 0 }) {
  const x = winNumbers(win, unit);
  const tag = winWords(win, unit).tag;
  return (
    <li className="lk-medal" style={{ "--d": `${0.1 + delay * 0.08}s` }}
      aria-label={`${win.name}: ${tag}. ${x.from} last time, ${x.to} ${x.what} now${x.note ? " " + x.note : ""}.`}>
      <Medal tone="lime" value={x.to} unit={x.what} label="" />
      <b aria-hidden="true">{win.name}</b>
      <span aria-hidden="true">{wasLine(win, x)}</span>
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
      <ul className={`lk-medals n${shown.length}`}>
        {shown.map((w, i) => <WinMedal key={w.name} win={w} unit={unit} delay={i} />)}
      </ul>
      {wins.length > shown.length && <small>And {wins.length - shown.length} more.</small>}
    </section>
  );
}
