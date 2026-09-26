import React from "react";
import { Sheet, Button, Icon } from "../ui/primitives.jsx";
import { useCoachData } from "../data/CoachDataContext.jsx";
import { cleanAlternatives } from "../lib/clientLinks.js";

/**
 * "If they can't do it" — the coach picks up to 4 stand-ins for one exercise.
 * The athlete sees these first in the app's swap sheet, and on their check-in link.
 */
export default function AlternativesSheet({ open, exerciseName, value, firstName, onSave, onClose }) {
  const data = useCoachData();
  const [list, setList] = React.useState([]);
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState([]);
  React.useEffect(() => { if (open) { setList(cleanAlternatives(value, exerciseName)); setQ(""); setResults([]); } }, [open, exerciseName]);
  React.useEffect(() => {
    if (!open || q.trim().length < 2) { setResults([]); return; }
    let alive = true;
    const t = setTimeout(() => {
      data.searchExercises(q.trim()).then((r) => { if (alive) setResults(r.slice(0, 8)); }).catch(() => { if (alive) setResults([]); });
    }, 180);
    return () => { alive = false; clearTimeout(t); };
  }, [q, open, data]);

  const has = (n) => list.some((x) => x.toLowerCase() === n.toLowerCase());
  const add = (n) => setList(cleanAlternatives([...list, n], exerciseName));
  const drop = (n) => setList(list.filter((x) => x.toLowerCase() !== n.toLowerCase()));
  const full = list.length >= 4;
  const typed = q.trim();

  return (
    <Sheet open={open} onClose={onClose} title={`If they can't do ${exerciseName || "this"}`}
      subtitle={`${firstName || "They"} sees these first when swapping. Pick up to 4.`}>
      <div className="pe-chips" style={{ marginBottom: 12 }}>
        {list.length === 0 && <span className="pe-hint">Nothing yet. Theryn will suggest exercises for the same muscle.</span>}
        {list.map((n) => (
          <button key={n} type="button" className="pe-chip on" onClick={() => drop(n)} aria-label={`Remove ${n}`}>{n} <Icon.Close size={12} /></button>
        ))}
      </div>
      <input className="pe-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exercises" aria-label="Search exercises" disabled={full} />
      {full && <span className="pe-hint">That's 4. Remove one to add another.</span>}
      {!full && typed.length >= 2 && (
        <div className="pe-results">
          {results.map((r) => (
            <div key={r.id || r.name} className="pe-result">
              <span><b>{r.name}</b><small>{[r.muscle_group, r.is_custom ? "yours" : null].filter(Boolean).join(" · ")}</small></span>
              <button type="button" className={`pe-plus ${has(r.name) ? "on" : ""}`} aria-label={`${has(r.name) ? "Remove" : "Add"} ${r.name}`}
                onClick={() => (has(r.name) ? drop(r.name) : add(r.name))}>{has(r.name) ? <Icon.Check size={16} /> : <Icon.Plus size={16} />}</button>
            </div>
          ))}
          {!results.some((r) => r.name.toLowerCase() === typed.toLowerCase()) && (
            <div className="pe-result">
              <span><b>Add "{typed}"</b><small>As your own exercise</small></span>
              <button type="button" className={`pe-plus dashed ${has(typed) ? "on" : ""}`} aria-label={`Add ${typed}`} onClick={() => (has(typed) ? drop(typed) : add(typed))}>{has(typed) ? <Icon.Check size={16} /> : <Icon.Plus size={16} />}</button>
            </div>
          )}
        </div>
      )}
      <div className="pe-addfoot">
        <span>{list.length ? `${list.length} of 4` : ""}</span>
        <Button variant="primary" onClick={() => { onSave(list); onClose(); }}>Save</Button>
      </div>
    </Sheet>
  );
}
