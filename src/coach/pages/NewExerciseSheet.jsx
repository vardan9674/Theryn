import React from "react";
import { Sheet, Button, Icon } from "../ui/primitives.jsx";
import { useCoachData } from "../data/CoachDataContext.jsx";
import { checkNewExercise } from "../lib/exerciseMatch.js";

const EQUIPMENT = [
  ["barbell", "Barbell"], ["dumbbell", "Dumbbell"], ["kettlebell", "Kettlebell"], ["cable", "Cable"],
  ["machine", "Machine"], ["smith_machine", "Smith"], ["bands", "Band"], ["body only", "Bodyweight"], ["e-z curl bar", "EZ bar"],
];
const MUSCLES = ["chest", "back", "shoulders", "biceps", "triceps", "forearms", "core", "glutes", "quads", "hamstrings", "calves", "neck"];

/**
 * The coach adds their own exercise. Before it is created, Theryn checks whether the
 * same exercise already exists under another name and asks rather than making a copy.
 * onCreated(name) adds it to the plan.
 */
export default function NewExerciseSheet({ open, initialName = "", onCreated, onClose }) {
  const data = useCoachData();
  const [name, setName] = React.useState(initialName);
  const [equipment, setEquipment] = React.useState("");
  const [muscle, setMuscle] = React.useState("");
  const [existing, setExisting] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => { if (open) { setName(initialName); setEquipment(""); setMuscle(""); setError(""); } }, [open, initialName]);
  React.useEffect(() => {
    if (!open || name.trim().length < 2) { setExisting([]); return; }
    let alive = true;
    const t = setTimeout(() => {
      data.searchExercises(name.trim()).then((r) => { if (alive) setExisting(r); }).catch(() => { if (alive) setExisting([]); });
    }, 180);
    return () => { alive = false; clearTimeout(t); };
  }, [name, open, data]);

  const check = React.useMemo(() => checkNewExercise(name, equipment, existing), [name, equipment, existing]);
  const ready = name.trim().length >= 2 && equipment && muscle && check.verdict !== "exists";

  const create = async () => {
    if (!ready || busy) return;
    setBusy(true); setError("");
    try {
      if (data.createExercise) await data.createExercise({ name: name.trim(), equipment, muscle_group: muscle });
      onCreated(name.trim());
      onClose();
    } catch (e) {
      // Saving to the shared library failed; the plan can still use the name.
      setError(e?.message || "Couldn't save it to your library. It's still added to this plan.");
      onCreated(name.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="New exercise" subtitle="Yours to use in any plan. Other coaches can find it too.">
      <label className="cx-label" htmlFor="nx-name">Name</label>
      <input id="nx-name" className="pe-search" value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} placeholder="e.g. Tempo pause squat" autoFocus />

      {check.verdict === "exists" && (
        <div className="cx-card" style={{ marginTop: 10 }}>
          <b>That already exists.</b>
          {check.matches.map((m) => (
            <div key={m.id || m.name} className="pe-result">
              <span><b>{m.name}</b><small>{[m.muscle_group, m.is_custom ? "yours" : "Theryn library"].filter(Boolean).join(" · ")}</small></span>
              <Button size="sm" onClick={() => { onCreated(m.name); onClose(); }}>Use this</Button>
            </div>
          ))}
        </div>
      )}
      {check.verdict === "similar" && (
        <div className="cx-card" style={{ marginTop: 10 }}>
          <b>Is yours one of these?</b>
          {check.matches.map((m) => (
            <div key={m.id || m.name} className="pe-result">
              <span><b>{m.name}</b><small>{[m.muscle_group, m.is_custom ? "yours" : "Theryn library"].filter(Boolean).join(" · ")}</small></span>
              <Button size="sm" onClick={() => { onCreated(m.name); onClose(); }}>Use this</Button>
            </div>
          ))}
          <span className="pe-hint">If not, carry on below.</span>
        </div>
      )}

      <label className="cx-label" style={{ marginTop: 12 }}>Equipment</label>
      <div className="pe-chips">
        {EQUIPMENT.map(([id, label]) => (
          <button key={id} type="button" className={`pe-chip ${equipment === id ? "on" : ""}`} aria-pressed={equipment === id} onClick={() => setEquipment(id)}>{label}</button>
        ))}
      </div>
      <label className="cx-label" style={{ marginTop: 12 }}>Main muscle</label>
      <div className="pe-chips">
        {MUSCLES.map((m) => (
          <button key={m} type="button" className={`pe-chip ${muscle === m ? "on" : ""}`} aria-pressed={muscle === m} onClick={() => setMuscle(m)}>{m}</button>
        ))}
      </div>
      {error && <span className="pe-hint" role="alert">{error}</span>}
      <div className="pe-addfoot">
        <span className="pe-hint">{check.verdict === "exists" ? "Pick the one above instead." : !equipment || !muscle ? "Pick equipment and a muscle." : ""}</span>
        <Button variant="primary" disabled={!ready || busy} onClick={create}><Icon.Plus size={14} />{busy ? "Saving…" : "Create exercise"}</Button>
      </div>
    </Sheet>
  );
}
