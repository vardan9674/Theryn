import React from "react";
import { Sheet, Icon } from "../ui/primitives.jsx";
import { useCoachData } from "../data/CoachDataContext.jsx";

const clean = (v) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
const same = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase();

/**
 * "They did something else." Picking here changes one day's log, never the
 * plan. The alternatives the coach already set for the exercise come first,
 * then anything from their exercise list, then whatever they typed.
 */
export default function SwapExerciseSheet({ open, exercise, firstName, onPick, onClose }) {
  const data = useCoachData();
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState([]);
  const planned = exercise?.swappedFrom || exercise?.name || "";
  const now = exercise?.name || "";
  React.useEffect(() => { if (open) { setQ(""); setResults([]); } }, [open, planned]);
  React.useEffect(() => {
    if (!open || q.trim().length < 2) { setResults([]); return; }
    let alive = true;
    const t = setTimeout(() => {
      data.searchExercises(q.trim()).then((r) => { if (alive) setResults(r.slice(0, 8)); }).catch(() => { if (alive) setResults([]); });
    }, 180);
    return () => { alive = false; clearTimeout(t); };
  }, [q, open, data]);

  const typed = clean(q);
  // What the coach set as stand-ins for this exercise, minus the one showing now.
  const suggested = (exercise?.alternatives || []).filter((n) => !same(n, now));
  const pick = (name) => { const n = clean(name); if (n) { onPick(n); onClose(); } };
  const Row = ({ name, meta }) => (
    <button type="button" className="lw-pick" onClick={() => pick(name)}>
      <span><b>{name}</b>{meta ? <small>{meta}</small> : null}</span><Icon.Chevron size={16} />
    </button>
  );

  return (
    <Sheet open={open} onClose={onClose} title={`Swap ${planned || "exercise"}`}
      subtitle={`What ${firstName || "they"} did instead. Sets and reps carry over; the plan stays as it is.`}>
      <div className="lw-swap">
        {!same(now, planned) && (
          <div className="lw-picks">
            <span className="pe-hint">Showing {now}</span>
            <Row name={planned} meta="Back to what the plan says" />
          </div>
        )}
        {suggested.length > 0 && (
          <div className="lw-picks">
            <span className="pe-hint">Your alternatives for this exercise</span>
            {suggested.map((n) => <Row key={n} name={n} meta="You set this as a stand-in" />)}
          </div>
        )}
        <input className="pe-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exercises" aria-label="Search exercises" />
        {typed.length >= 2 && (
          <div className="lw-picks">
            {results.filter((r) => !same(r.name, now)).map((r) => (
              <Row key={r.id || r.name} name={r.name} meta={[r.muscle_group, r.is_custom ? "yours" : null].filter(Boolean).join(" · ")} />
            ))}
            {!results.some((r) => same(r.name, typed)) && !same(typed, now) && (
              <Row name={typed} meta="Use this name as it is" />
            )}
          </div>
        )}
        {typed.length > 0 && typed.length < 2 && <span className="pe-hint">Keep typing to search.</span>}
      </div>
    </Sheet>
  );
}
