import React from "react";
import { DndContext, PointerSensor, TouchSensor, KeyboardSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, Icon, Confirm, useViewport, useToast } from "../ui/primitives.jsx";
import { DAYS, DAY_LONG, normalizeExercise } from "../lib/format.js";
import { lastLiftedWeight } from "../lib/exportPlan.ts";
import { WORKOUT_TYPES, TYPE_COLORS, TYPE_DEFAULTS } from "../../components/templates/tokens.js";
import { useCoachData } from "../data/CoachDataContext.jsx";
import { useBackHandler } from "../../lib/backStack.ts";

let keyCounter = 0;
const mkKey = () => `ex_${Date.now()}_${keyCounter++}`;

function toEditable(templates) {
  const out = {};
  for (const d of DAYS) {
    const day = templates?.[d] || { type: "Rest", exercises: [] };
    out[d] = {
      type: day.type || "Rest",
      exercises: (day.exercises || []).map((ex) => {
        const o = normalizeExercise(ex);
        return { _key: mkKey(), name: o.name, sets: o.sets ?? "", reps: o.reps ?? "", coachNote: o.coachNote ?? "" };
      }),
    };
  }
  return out;
}

function toTemplates(days) {
  const out = {};
  for (const d of DAYS) {
    const day = days[d];
    const exercises = day.exercises
      .filter((e) => e.name && e.name.trim())
      .map((e) => {
        const o = { name: e.name.trim() };
        const s = Number(e.sets);
        if (Number.isInteger(s) && s > 0) o.sets = s;
        if (e.reps && String(e.reps).trim()) o.reps = String(e.reps).trim();
        if (e.coachNote && e.coachNote.trim()) o.coachNote = e.coachNote.trim();
        return Object.keys(o).length === 1 ? o.name : o;
      });
    out[d] = { type: day.type === "Rest" ? "Rest" : day.type, exercises: day.type === "Rest" ? [] : exercises };
  }
  return out;
}

/**
 * Edit one client's week. Laptop: seven columns. Tablet: two columns.
 * Phone: one day at a time with a day strip. Drag to reorder inside a day.
 */
export default function PlanEditor({ client, initialTemplates, history, unit = "lb", onCancel, onSaved }) {
  const data = useCoachData();
  const toast = useToast();
  const vp = useViewport();
  const [days, setDays] = React.useState(() => toEditable(initialTemplates));
  const [dirty, setDirty] = React.useState(false);
  const [activeDay, setActiveDay] = React.useState(() => DAYS.find((d) => initialTemplates?.[d]?.type && initialTemplates[d].type !== "Rest") || "Mon");
  const [saving, setSaving] = React.useState(false);
  const [confirmLeave, setConfirmLeave] = React.useState(false);
  const [focusKey, setFocusKey] = React.useState(null);

  const firstName = (client.athlete_name || "client").split(" ")[0];

  const requestClose = React.useCallback(() => { if (dirty) setConfirmLeave(true); else onCancel(); }, [dirty, onCancel]);
  useBackHandler(true, requestClose);
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") requestClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose]);
  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const update = (fn) => { setDays((prev) => fn(JSON.parse(JSON.stringify(prev)))); setDirty(true); };

  const setType = (d, type) => update((next) => {
    next[d].type = type;
    if (type === "Rest") next[d].exercises = [];
    else if (next[d].exercises.length === 0) next[d].exercises = (TYPE_DEFAULTS[type] || []).map((name) => ({ _key: mkKey(), name, sets: "", reps: "", coachNote: "" }));
    return next;
  });
  const addExercise = (d) => {
    const key = mkKey();
    update((next) => { if (next[d].type === "Rest") next[d].type = "Custom"; next[d].exercises.push({ _key: key, name: "", sets: "", reps: "", coachNote: "" }); return next; });
    setFocusKey(key);
  };
  const setField = (d, key, field, value) => update((next) => { const ex = next[d].exercises.find((e) => e._key === key); if (ex) ex[field] = value; return next; });
  const removeExercise = (d, key) => update((next) => { next[d].exercises = next[d].exercises.filter((e) => e._key !== key); return next; });
  const reorder = (d, from, to) => update((next) => { next[d].exercises = arrayMove(next[d].exercises, from, to); return next; });

  async function save() {
    const templates = toTemplates(days);
    const empty = DAYS.some((d) => days[d].type !== "Rest" && days[d].exercises.some((e) => !e.name.trim()));
    if (empty) { toast("Every exercise needs a name. Remove the blank ones or type a name.", "error"); return; }
    setSaving(true);
    try {
      const res = await data.saveClientRoutine(client.athlete_id, templates);
      setDirty(false);
      if (res?.routineId === "offline_saved") toast(`Saved on this device. It will reach ${firstName} when you're back online.`);
      else toast(`Saved and sent to ${firstName}.`);
      onSaved(templates);
    } catch (e) {
      toast(`Could not save: ${e.message || e}`, "error");
    } finally {
      setSaving(false);
    }
  }

  const visibleDays = vp === "phone" ? [activeDay] : DAYS;

  return (
    <div className="cx-editor">
      <div className="cx-editor-bar">
        <Button size="sm" icon={<Icon.Back />} onClick={requestClose} aria-label="Cancel editing">{vp === "phone" ? null : "Back"}</Button>
        <div className="title">{firstName}'s plan{dirty && <span className="cx-muted" style={{ fontWeight: 400 }}> · unsaved</span>}</div>
        {vp !== "phone" && <Button size="sm" onClick={() => onSaved(null, { export: true, templates: toTemplates(days) })} icon={<Icon.Sheet />}>Export to Excel</Button>}
        <Button variant="primary" size={vp === "phone" ? "sm" : undefined} onClick={save} disabled={saving || !dirty}>{saving ? "Saving…" : vp === "phone" ? "Save" : `Save and send to ${firstName}`}</Button>
      </div>

      {vp !== "phone" && (
        <div className="cx-small cx-muted" style={{ padding: "12px 24px 0" }}>Changes here only affect {firstName}. Drag the handle to reorder. Pick "Rest" to clear a day.</div>
      )}

      {vp === "phone" && (
        <div className="cx-daystrip" role="tablist" aria-label="Day">
          {DAYS.map((d) => (
            <button key={d} type="button" role="tab" aria-selected={activeDay === d} className={`cx-daypill ${days[d].type !== "Rest" ? "has" : ""}`} onClick={() => setActiveDay(d)}>{d}</button>
          ))}
        </div>
      )}

      <div className="cx-daycols">
        {visibleDays.map((d) => (
          <DayColumn key={d} dayKey={d} day={days[d]} history={history} unit={unit} focusKey={focusKey}
            onType={(t) => setType(d, t)} onAdd={() => addExercise(d)} onField={(k, f, v) => setField(d, k, f, v)} onRemove={(k) => removeExercise(d, k)} onReorder={(from, to) => reorder(d, from, to)} />
        ))}
      </div>

      <Confirm open={confirmLeave} title="Leave without saving?" body={`Your changes to ${firstName}'s plan will be lost.`} confirmLabel="Leave" danger onConfirm={onCancel} onClose={() => setConfirmLeave(false)} />
    </div>
  );
}

function DayColumn({ dayKey, day, history, unit, focusKey, onType, onAdd, onField, onRemove, onReorder }) {
  const isRest = day.type === "Rest";
  const color = TYPE_COLORS[day.type] || "var(--cx-tx2)";
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = day.exercises.map((e) => e._key);
  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    onReorder(ids.indexOf(active.id), ids.indexOf(over.id));
  };
  return (
    <section className={`cx-daycol ${isRest ? "rest" : ""}`} aria-label={DAY_LONG[dayKey]}>
      <div className="hd">
        <b>{DAY_LONG[dayKey]}</b>
        <label className="cx-typebtn" style={{ background: `${color}22`, color, position: "relative" }}>
          {day.type.toUpperCase()} <Icon.Down />
          <select value={day.type} onChange={(e) => onType(e.target.value)} aria-label={`Workout type for ${DAY_LONG[dayKey]}`} style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", cursor: "pointer" }}>
            {WORKOUT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>
      {isRest ? (
        <button type="button" className="cx-addex" style={{ flex: 1, minHeight: 80 }} onClick={onAdd}>Rest day. Tap to add a workout.</button>
      ) : (
        <>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              {day.exercises.map((ex) => (
                <ExerciseCard key={ex._key} ex={ex} unit={unit} autoFocus={focusKey === ex._key} last={lastLiftedWeight(history, ex.name)}
                  onField={(f, v) => onField(ex._key, f, v)} onRemove={() => onRemove(ex._key)} />
              ))}
            </SortableContext>
          </DndContext>
          <button type="button" className="cx-addex" onClick={onAdd}>+ Add exercise</button>
        </>
      )}
    </section>
  );
}

function ExerciseCard({ ex, unit, last, autoFocus, onField, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ex._key });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} className={`cx-excard ${isDragging ? "dragging" : ""}`}>
      <div className="hd">
        <span className="cx-grip" {...attributes} {...listeners} aria-label="Drag to reorder"><Icon.Grip /></span>
        <div className="nm" style={{ flex: 1 }}>
          <ExerciseSearch value={ex.name} autoFocus={autoFocus} onChange={(v) => onField("name", v)} />
        </div>
        <Button size="sm" icon={<Icon.Trash />} aria-label={`Remove ${ex.name || "exercise"}`} onClick={onRemove} />
      </div>
      <div className="cx-numgrid">
        <div><label>Sets</label><input className="cx-num" inputMode="numeric" value={ex.sets} placeholder="3" onChange={(e) => onField("sets", e.target.value.replace(/[^0-9]/g, "").slice(0, 2))} aria-label="Sets" /></div>
        <div><label>Reps</label><input className="cx-num" value={ex.reps} placeholder="8-12" onChange={(e) => onField("reps", e.target.value.slice(0, 12))} aria-label="Reps" /></div>
        <div><label>Last ({unit})</label><div className="cx-num ro" title="Heaviest weight in their most recent session with this exercise">{last ?? "—"}</div></div>
      </div>
      <input className={`cx-noteinput ${ex.coachNote ? "has" : ""}`} value={ex.coachNote} placeholder="Add a note for them" onChange={(e) => onField("coachNote", e.target.value.slice(0, 200))} aria-label="Coach note" />
    </div>
  );
}

/** Autocomplete over the exercise library; typing a new name is allowed. */
function ExerciseSearch({ value, onChange, autoFocus }) {
  const data = useCoachData();
  const [open, setOpen] = React.useState(false);
  const [results, setResults] = React.useState([]);
  const [hi, setHi] = React.useState(0);
  const wrapRef = React.useRef(null);
  const inputRef = React.useRef(null);
  const reqRef = React.useRef(0);

  React.useEffect(() => { if (autoFocus) { inputRef.current?.focus(); setOpen(true); } }, [autoFocus]);
  React.useEffect(() => {
    if (!open) return;
    const id = ++reqRef.current;
    const t = setTimeout(() => {
      data.searchExercises(value).then((r) => { if (reqRef.current === id) { setResults(r.slice(0, 10)); setHi(0); } }).catch(() => setResults([]));
    }, 180);
    return () => clearTimeout(t);
  }, [value, open, data]);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pick = (name) => { onChange(name); setOpen(false); };
  const onKey = (e) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); pick(results[hi].name); }
    else if (e.key === "Escape") { setOpen(false); }
  };
  return (
    <div className="cx-ac" ref={wrapRef}>
      <input ref={inputRef} value={value} placeholder="Exercise name" aria-label="Exercise name" aria-autocomplete="list" aria-expanded={open}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
        style={{ width: "100%", background: "none", border: "none", outline: "none", fontSize: "inherit", fontWeight: 600, color: "var(--cx-tx)", padding: "6px 0", minHeight: 32 }} />
      {open && results.length > 0 && (
        <div className="cx-ac-list" role="listbox">
          {results.map((r, i) => (
            <button key={r.id || r.name} type="button" role="option" aria-selected={i === hi} className="cx-ac-item" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(r.name)}>
              <span>{r.name}</span><small>{r.is_custom ? "Yours" : r.muscle_group || ""}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
