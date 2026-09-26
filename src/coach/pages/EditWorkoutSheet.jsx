import React from "react";
import { Sheet, useToast } from "../ui/primitives.jsx";
import { shortDate } from "../lib/format.js";
import { editableSets, applyEdits, weightLooksOff, editNumbersProblem } from "../lib/editWorkout.js";
import { cleanDecimal } from "../lib/clientLinks.js";
import { maskDuration, tidyDuration, durationInput, parseDuration } from "../lib/exerciseKinds.js";

const toStr = (v) => (v == null ? "" : String(v));

/**
 * The coach corrects the numbers in a workout a client sent: 75 kg that
 * should be 7.5, the wrong reps, a plank time. Weights that look like a typo
 * are outlined so they're easy to find. Saves the whole workout at once.
 */
export default function EditWorkoutSheet({ open, workout, firstName, unit, onClose, onSave }) {
  const toast = useToast();
  const payload = workout?.payload || null;
  const [rows, setRows] = React.useState({}); // exercise index → [{ n, reps, weight, secs }] as strings
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open || !payload) return;
    const next = {};
    (payload.exercises || []).forEach((ex, ei) => {
      const list = editableSets(ex);
      if (list.length) next[ei] = list.map((s) => ({ n: s.n, reps: toStr(s.reps), weight: toStr(s.weight), secs: s.secs ? durationInput(s.secs) : "" }));
    });
    setRows(next);
  }, [open, payload]);

  if (!payload) return null;
  const setVal = (ei, i, f, raw) => {
    const v = f === "reps" ? raw.replace(/[^0-9]/g, "").slice(0, 3) : f === "secs" ? maskDuration(raw) : cleanDecimal(raw);
    setRows((r) => ({ ...r, [ei]: r[ei].map((x, k) => (k === i ? { ...x, [f]: v } : x)) }));
  };

  async function save() {
    // A weight that can't be read would be saved as blank, erasing it. Say so instead. #133
    const bad = editNumbersProblem(payload.exercises, rows, unit);
    if (bad) { toast(bad, "error"); return; }
    // Only exercises whose numbers changed are rewritten.
    const edits = {};
    for (const [ei, list] of Object.entries(rows)) {
      const before = editableSets(payload.exercises[ei]);
      const after = list.map((x) => ({ n: x.n, reps: x.reps === "" ? null : Number(x.reps), weight: x.weight === "" ? null : Number(x.weight), secs: parseDuration(x.secs) }));
      const changed = after.some((a, k) => a.reps !== before[k]?.reps || a.weight !== before[k]?.weight || a.secs !== before[k]?.secs);
      if (changed) edits[ei] = after;
    }
    if (!Object.keys(edits).length) { onClose(); return; }
    setBusy(true);
    try {
      await onSave(applyEdits(payload, edits));
      toast(`Updated ${firstName}'s workout.`);
      onClose();
    } catch (e) {
      toast(e.message || "Could not save", "error");
    } finally {
      setBusy(false);
    }
  }

  const planW = (ex, i) => ex.plan_sets?.[i]?.w ?? ex.weight_target ?? null;
  return (
    <Sheet open={open} onClose={onClose} title={`Fix ${firstName}'s workout`} subtitle={`${shortDate(workout.date)} · ${payload.type || "Workout"}. Change any number that's wrong; ${firstName}'s other entries stay as they sent them.`}>
      <div className="ew">
        {(payload.exercises || []).map((ex, ei) => {
          const list = rows[ei];
          if (!list || !list.length) return null;
          const timed = ex.mode === "time";
          return (
            <div key={ei} className="ew-ex">
              <b className="ew-name">{ex.name}</b>
              {list.map((x, i) => {
                const off = !timed && weightLooksOff(x.weight, planW(ex, i));
                return (
                  <div key={x.n} className={`ew-set ${off ? "off" : ""}`}>
                    <span className="ew-no">{x.n}</span>
                    {timed
                      ? <label><input inputMode="numeric" value={x.secs} placeholder="00:00" onChange={(e) => setVal(ei, i, "secs", e.target.value)} onBlur={(e) => { const t = tidyDuration(e.target.value); if (t && t !== e.target.value) setVal(ei, i, "secs", t); }} aria-label={`${ex.name} set ${x.n} time`} /><span>time</span></label>
                      : <label><input inputMode="numeric" value={x.reps} placeholder="—" onChange={(e) => setVal(ei, i, "reps", e.target.value)} aria-label={`${ex.name} set ${x.n} reps`} /><span>reps</span></label>}
                    <label><input inputMode="decimal" value={x.weight} placeholder="—" onChange={(e) => setVal(ei, i, "weight", e.target.value)} aria-label={`${ex.name} set ${x.n} weight in ${unit}`} /><span>{unit}</span></label>
                    {off && <em className="ew-flag" title={`Planned ${planW(ex, i)} ${unit}`}>check?</em>}
                  </div>
                );
              })}
            </div>
          );
        })}
        <button type="button" className="lw-save" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
      </div>
    </Sheet>
  );
}
