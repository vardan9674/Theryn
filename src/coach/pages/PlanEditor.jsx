import React from "react";
import { DndContext, PointerSensor, TouchSensor, KeyboardSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, Icon, Confirm, Sheet, useViewport, useToast } from "../ui/primitives.jsx";
import { DAYS, DAY_LONG, normalizeExercise } from "../lib/format.js";
import { lastLiftedWeight } from "../lib/exportPlan.ts";
import { lastSetsFor, setsLine as historyLine } from "../lib/workouts.js";
import { planTemplate, stampTemplate } from "../lib/manualTemplates.js";
import { planSets, packSets, setsAreSame, setsLine } from "../lib/planSets.js";
import { WORKOUT_TYPES, TYPE_COLORS, TYPE_DEFAULTS } from "../../components/templates/tokens.js";
import { useCoachData } from "../data/CoachDataContext.jsx";
import { useBackHandler } from "../../lib/backStack.ts";

let keyCounter = 0;
const mkKey = (p = "k") => `${p}_${Date.now().toString(36)}_${keyCounter++}`;
const DEFAULT_REPS = "8-12";

// ── Plan JSON ⇄ editor state ───────────────────────────────────────────────
// Editor state per exercise: { _key, name, coachNote, same, rows: [{ _k, reps, weight }] }.
// `same`: typing in set 1 fills every set. It turns itself off when a later set is changed.

function toEditable(templates) {
  const out = {};
  for (const d of DAYS) {
    const day = templates?.[d] || { type: "Rest", exercises: [] };
    out[d] = {
      type: day.type || "Rest",
      exercises: (day.exercises || []).map((ex) => {
        const o = normalizeExercise(ex);
        const rows = planSets(o).map((s) => ({ _k: mkKey("s"), reps: s.reps, weight: s.weight == null ? "" : String(s.weight) }));
        return { _key: mkKey("ex"), name: o.name, coachNote: o.coachNote ?? "", rows, same: setsAreSame(rows) };
      }),
    };
  }
  return out;
}

// `units` is stamped on every day so the client's link page labels target
// weights the way the coach typed them (name-only clients have no profile).
export function toTemplates(days, units) {
  const out = {};
  for (const d of DAYS) {
    const day = days[d];
    const exercises = day.type === "Rest" ? [] : day.exercises
      .filter((e) => e.name && e.name.trim())
      .map((e) => {
        const o = { name: e.name.trim(), ...packSets(e.rows) };
        if (e.coachNote && e.coachNote.trim()) o.coachNote = e.coachNote.trim();
        return o;
      });
    out[d] = { type: day.type === "Rest" ? "Rest" : day.type, exercises };
    if (units) out[d].units = units;
  }
  return out;
}

const newExercise = (name, lastW) => {
  const rows = Array.from({ length: 3 }, () => ({ _k: mkKey("s"), reps: DEFAULT_REPS, weight: lastW != null ? String(lastW) : "" }));
  return { _key: mkKey("ex"), name, coachNote: "", rows, same: true, _new: true };
};
const cleanReps = (v) => v.replace(/[^0-9\-–/ ]/g, "").replace(/\s+/g, "").slice(0, 7);
const cleanWeight = (v) => v.replace(/[^0-9.]/g, "").slice(0, 6);
const dayCount = (day) => ({ ex: day.exercises.length, sets: day.exercises.reduce((a, e) => a + e.rows.length, 0) });

/**
 * Edit one client's week. Phone: a day strip, one day at a time, one
 * exercise open at a time. Tablet and laptop: the week on the left, the day
 * in the middle; laptop adds a live preview of what the client sees.
 *
 * A saved plan (no client) uses the same editor: pass `title`, `status`,
 * `onTitleChange` and `onSave(templates)` (returns the toast to show), and
 * no `client` or `history`.
 */
export default function PlanEditor({ client, initialTemplates, history, unit = "lb", onCancel, onSaved, title, status, onTitleChange, onSave, scope }) {
  const data = useCoachData();
  const toast = useToast();
  const vp = useViewport();
  const [days, setDays] = React.useState(() => toEditable(initialTemplates));
  const [changes, setChanges] = React.useState(0);
  const [activeDay, setActiveDay] = React.useState(() => DAYS.find((d) => initialTemplates?.[d]?.type && initialTemplates[d].type !== "Rest") || "Mon");
  const [openKey, setOpenKey] = React.useState(null);
  const [adding, setAdding] = React.useState(false);
  const [copying, setCopying] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [confirmLeave, setConfirmLeave] = React.useState(false);
  const dirty = changes > 0;
  const firstName = client ? (client.athlete_name || "client").split(" ")[0] : "your client";
  // A client's week that came from a saved plan: say that edits here are for them alone.
  const sourcePlan = client ? planTemplate(initialTemplates) : null;
  const scopeText = scope || (sourcePlan ? `From your plan "${sourcePlan.name}". Changes here are only for ${firstName}. The plan and your other clients stay the same.` : null);

  const requestClose = React.useCallback(() => { if (dirty) setConfirmLeave(true); else onCancel(); }, [dirty, onCancel]);
  useBackHandler(!adding && !copying, requestClose);
  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const update = (fn) => { setDays((prev) => fn(JSON.parse(JSON.stringify(prev)))); setChanges((c) => c + 1); };
  const exOf = (next, d, k) => next[d].exercises.find((e) => e._key === k);
  const act = {
    setType: (d, type) => update((next) => {
      next[d].type = type;
      if (type === "Rest") next[d].exercises = [];
      else if (next[d].exercises.length === 0) next[d].exercises = (TYPE_DEFAULTS[type] || []).map((n) => ({ ...newExercise(n, lastLiftedWeight(history, n)), _new: false }));
      return next;
    }),
    copyDay: (from, targets) => update((next) => {
      for (const to of targets) {
        next[to].type = next[from].type;
        next[to].exercises = next[from].exercises.map((e) => ({ ...e, _key: mkKey("ex"), _new: false, rows: e.rows.map((r) => ({ ...r, _k: mkKey("s") })) }));
      }
      return next;
    }),
    addExercises: (d, names) => {
      const fresh = names.map((n) => newExercise(n, lastLiftedWeight(history, n)));
      update((next) => { if (next[d].type === "Rest") next[d].type = "Custom"; next[d].exercises.push(...fresh); return next; });
      if (fresh.length) setOpenKey(fresh[fresh.length - 1]._key);
    },
    rename: (d, k, v) => update((next) => { const e = exOf(next, d, k); if (e) e.name = v; return next; }),
    note: (d, k, v) => update((next) => { const e = exOf(next, d, k); if (e) e.coachNote = v; return next; }),
    setRow: (d, k, ri, field, raw) => update((next) => {
      const e = exOf(next, d, k); if (!e) return next;
      const v = field === "reps" ? cleanReps(raw) : cleanWeight(raw);
      if (e.same && ri === 0) e.rows.forEach((r) => { r[field] = v; });
      else { if (e.same && ri > 0) e.same = false; e.rows[ri][field] = v; }
      e.rows.forEach((r) => { delete r._new; });
      return next;
    }),
    addSet: (d, k) => update((next) => {
      const e = exOf(next, d, k); if (!e || e.rows.length >= 20) return next;
      e.rows.forEach((r) => { delete r._new; });
      const last = e.rows[e.rows.length - 1] || { reps: DEFAULT_REPS, weight: "" };
      e.rows.push({ _k: mkKey("s"), reps: last.reps, weight: last.weight, _new: true });
      return next;
    }),
    removeSet: (d, k, ri) => update((next) => { const e = exOf(next, d, k); if (e && e.rows.length > 1) e.rows.splice(ri, 1); return next; }),
    toggleSame: (d, k) => update((next) => {
      const e = exOf(next, d, k); if (!e) return next;
      e.same = !e.same;
      if (e.same) e.rows.forEach((r) => { r.reps = e.rows[0].reps; r.weight = e.rows[0].weight; });
      return next;
    }),
    remove: (d, k) => update((next) => { next[d].exercises = next[d].exercises.filter((e) => e._key !== k); return next; }),
    reorder: (d, from, to) => update((next) => { next[d].exercises = arrayMove(next[d].exercises, from, to); return next; }),
  };

  async function save() {
    const empty = DAYS.some((d) => days[d].type !== "Rest" && days[d].exercises.some((e) => !e.name.trim()));
    if (empty) { toast("Every exercise needs a name. Remove the blank ones or type a name.", "error"); return; }
    let templates = toTemplates(days, unit === "kg" ? "metric" : "imperial");
    if (onSave) {
      setSaving(true);
      try {
        const msg = await onSave(templates);
        setChanges(0);
        if (msg) toast(msg);
        onSaved(templates);
      } catch (e) {
        toast(`Could not save: ${e.message || e}`, "error");
      } finally {
        setSaving(false);
      }
      return;
    }
    // A name-only client's week that came from a saved plan keeps saying so, marked
    // as edited: Send update then leaves it alone unless the coach overwrites it.
    const fromPlan = planTemplate(initialTemplates);
    if (fromPlan) templates = stampTemplate(templates, { ...fromPlan, overridden: true });
    setSaving(true);
    try {
      const res = await data.saveClientRoutine(client.athlete_id, templates);
      setChanges(0);
      if (res?.routineId === "offline_saved") toast(`Saved on this device. It will reach ${firstName} when you're back online.`);
      else toast(`${client.manual ? `Saved. ${firstName} sees it next time they open their link.` : `Saved and sent to ${firstName}.`}${fromPlan ? ` Your plan "${fromPlan.name}" didn't change.` : ""}`);
      onSaved(templates);
    } catch (e) {
      toast(`Could not save: ${e.message || e}`, "error");
    } finally {
      setSaving(false);
    }
  }

  const day = days[activeDay];
  const wide = vp !== "phone";
  const saveLabel = saving ? "Saving…" : dirty ? "Save plan" : "Saved";

  const dayEditor = (
    <DayEditor dayKey={activeDay} day={day} unit={unit} history={history} firstName={firstName} openKey={openKey} setOpenKey={setOpenKey} act={act}
      onAdd={() => setAdding(true)} onCopy={() => setCopying(true)} />
  );

  return (
    <div className="pe">
      <div className="pe-bar">
        <button type="button" className="pe-iconbtn" onClick={requestClose} aria-label="Back"><Icon.Back /></button>
        <div className="pe-title">
          {onTitleChange ? <TitleEdit value={title} onChange={onTitleChange} /> : <b>{title || `${firstName}'s plan`}</b>}
          <span className={dirty ? "dirty" : ""}>{dirty ? `${changes} change${changes === 1 ? "" : "s"} not saved` : status || `Weights in ${unit}`}</span>
        </div>
        {wide && <Button size="sm" icon={<Icon.Sheet />} onClick={() => onSaved(null, { export: true, templates: toTemplates(days, unit === "kg" ? "metric" : "imperial") })}>Export to Excel</Button>}
        {wide && <button type="button" className={`pe-save ${dirty ? "dirty" : ""}`} onClick={save} disabled={saving || !dirty}>{saveLabel}</button>}
      </div>
      {scopeText && <div className="pe-scope" role="note"><Icon.Info size={14} /><span>{scopeText}</span></div>}

      {wide ? (
        <div className={`pe-grid ${vp === "laptop" ? "with-preview" : ""}`}>
          <WeekList days={days} active={activeDay} onPick={(d) => { setActiveDay(d); setOpenKey(null); }} />
          <div className="pe-center">{dayEditor}</div>
          {vp === "laptop" && <ClientPreview dayKey={activeDay} day={day} unit={unit} firstName={firstName} forClient={Boolean(client)} />}
        </div>
      ) : (
        <>
          <DayStrip days={days} active={activeDay} onPick={(d) => { setActiveDay(d); setOpenKey(null); }} />
          <div className="pe-phone">{dayEditor}</div>
          <div className="pe-foot">
            <button type="button" className={`pe-save big ${dirty ? "dirty" : ""}`} onClick={save} disabled={saving || !dirty}>{saveLabel}</button>
          </div>
        </>
      )}

      <AddSheet open={adding} dayKey={activeDay} type={day.type} existing={day.exercises.map((e) => e.name.toLowerCase())} firstName={firstName} history={history}
        onClose={() => setAdding(false)} onAdd={(names) => { act.addExercises(activeDay, names); setAdding(false); }} />
      <CopySheet open={copying} from={activeDay} days={days} onClose={() => setCopying(false)}
        onCopy={(targets) => { act.copyDay(activeDay, targets); setCopying(false); toast(`${DAY_LONG[activeDay]} copied to ${targets.map((t) => DAY_LONG[t]).join(", ")}`); }} />
      <Confirm open={confirmLeave} title="Leave without saving?" body={`Your changes to ${firstName}'s plan will be lost.`} confirmLabel="Leave" danger onConfirm={onCancel} onClose={() => setConfirmLeave(false)} />
    </div>
  );
}

/** The saved plan's name in the header; tap to rename. */
function TitleEdit({ value, onChange }) {
  const [editing, setEditing] = React.useState(false);
  const [v, setV] = React.useState(value || "");
  const done = () => { setEditing(false); const t = v.trim(); if (t && t !== value) onChange(t); else setV(value || ""); };
  if (editing) {
    return <input className="pe-titlein" autoFocus value={v} maxLength={80} onChange={(e) => setV(e.target.value)} onBlur={done}
      onKeyDown={(e) => { if (e.key === "Enter") done(); if (e.key === "Escape") { setV(value || ""); setEditing(false); } }} aria-label="Plan name" />;
  }
  return (
    <button type="button" className="pe-titlebtn" onClick={() => { setV(value || ""); setEditing(true); }} aria-label={`Rename ${value || "plan"}`}>
      <b>{value || "Untitled plan"}</b><Icon.Edit size={14} />
    </button>
  );
}

// ── The week ───────────────────────────────────────────────────────────────
function DayStrip({ days, active, onPick }) {
  return (
    <div className="pe-strip" role="tablist" aria-label="Day">
      {DAYS.map((d) => {
        const t = days[d].type; const rest = t === "Rest"; const empty = !rest && days[d].exercises.length === 0;
        return (
          <button key={d} type="button" role="tab" aria-selected={active === d} className={`pe-stripday ${rest ? "rest" : ""} ${empty ? "empty" : ""}`} style={!rest ? { "--t": TYPE_COLORS[t] || "var(--cx-tx2)" } : undefined} onClick={() => onPick(d)}>
            <b>{d}</b><span>{rest ? "Rest" : t}</span>
          </button>
        );
      })}
    </div>
  );
}

function WeekList({ days, active, onPick }) {
  return (
    <nav className="pe-week" aria-label="The week">
      <span className="pe-label">The week</span>
      {DAYS.map((d) => {
        const t = days[d].type; const rest = t === "Rest"; const c = dayCount(days[d]);
        return (
          <button key={d} type="button" aria-current={active === d ? "true" : undefined} className={`pe-weekday ${rest ? "rest" : ""}`} onClick={() => onPick(d)}>
            <b>{d}</b>
            <span>{rest ? <em>Rest</em> : <><i style={{ color: TYPE_COLORS[t] || "var(--cx-tx2)" }}>{t.toUpperCase()}</i><small>{c.ex} exercise{c.ex === 1 ? "" : "s"} · {c.sets} sets</small></>}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ── One day ────────────────────────────────────────────────────────────────
function DayEditor({ dayKey, day, unit, history, firstName, openKey, setOpenKey, act, onAdd, onCopy }) {
  const isRest = day.type === "Rest";
  const color = TYPE_COLORS[day.type] || "var(--cx-tx2)";
  const c = dayCount(day);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = day.exercises.map((e) => e._key);
  const onDragEnd = ({ active, over }) => { if (over && active.id !== over.id) act.reorder(dayKey, ids.indexOf(active.id), ids.indexOf(over.id)); };

  return (
    <section className="pe-day" aria-label={DAY_LONG[dayKey]}>
      <div className="pe-dayhead">
        <div className="pe-dayname"><b>{DAY_LONG[dayKey]}</b><span>{isRest ? "Rest day" : `${c.ex} exercise${c.ex === 1 ? "" : "s"} · ${c.sets} sets`}</span></div>
        <label className="pe-type" style={{ color, background: `${color}1F` }}>
          {day.type.toUpperCase()} <Icon.Down size={12} />
          <select value={day.type} onChange={(e) => act.setType(dayKey, e.target.value)} aria-label={`Workout type for ${DAY_LONG[dayKey]}`}>
            {WORKOUT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        {!isRest && c.ex > 0 && <button type="button" className="pe-chipbtn" onClick={onCopy}>Copy day</button>}
      </div>

      {isRest ? (
        <button type="button" className="pe-restcard" onClick={onAdd}><b>Rest day</b><span>Tap to add a workout</span></button>
      ) : (
        <>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              {day.exercises.map((ex, i) => (
                <ExerciseCard key={ex._key} ex={ex} index={i} unit={unit} firstName={firstName} history={history} open={openKey === ex._key}
                  onToggle={() => setOpenKey(openKey === ex._key ? null : ex._key)}
                  onRename={(v) => act.rename(dayKey, ex._key, v)} onNote={(v) => act.note(dayKey, ex._key, v)}
                  onRow={(ri, f, v) => act.setRow(dayKey, ex._key, ri, f, v)} onAddSet={() => act.addSet(dayKey, ex._key)} onRemoveSet={(ri) => act.removeSet(dayKey, ex._key, ri)}
                  onSame={() => act.toggleSame(dayKey, ex._key)} onRemove={() => { act.remove(dayKey, ex._key); setOpenKey(null); }} />
              ))}
            </SortableContext>
          </DndContext>
          <button type="button" className="pe-addex" onClick={onAdd}><Icon.Plus size={16} />Add exercise</button>
        </>
      )}
    </section>
  );
}

function ExerciseCard({ ex, index, unit, firstName, history, open, onToggle, onRename, onNote, onRow, onAddSet, onRemoveSet, onSame, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ex._key });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const list = ex.rows.map((r) => ({ reps: r.reps, weight: r.weight }));
  const noWeight = ex.rows.every((r) => !r.weight);
  const last = React.useMemo(() => (history && ex.name ? lastSetsFor(history, ex.name) : null), [history, ex.name]);
  const grip = <span className="pe-grip" {...attributes} {...listeners} aria-label={`Drag ${ex.name || "exercise"} to reorder`}><Icon.Grip /></span>;

  if (!open) {
    return (
      <div ref={setNodeRef} style={style} className={`pe-card closed ${isDragging ? "dragging" : ""} ${ex._new ? "new" : ""}`}>
        {grip}
        <button type="button" className="pe-cardhit" onClick={onToggle} aria-expanded={false}>
          <span className="pe-cardtext">
            <b>{ex.name || <em>Unnamed exercise</em>}</b>
            <span>{setsLine(list, unit)}{noWeight && <i> · no weight yet</i>}{ex.coachNote && " · has a note"}</span>
          </span>
          <Icon.Down size={16} />
        </button>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} className={`pe-card open ${isDragging ? "dragging" : ""}`}>
      <div className="pe-cardtop">
        {grip}
        <div className="pe-name"><ExerciseSearch value={ex.name} autoFocus={!ex.name} onChange={onRename} /></div>
        <button type="button" className="pe-iconbtn ghost" onClick={onToggle} aria-label="Close" aria-expanded={true}><span style={{ display: "inline-flex", transform: "rotate(180deg)" }}><Icon.Down size={16} /></span></button>
      </div>

      <div className="pe-sets" role="group" aria-label={`Sets for ${ex.name || "this exercise"}`}>
        <div className="pe-sethead"><span>Set</span><span>Reps</span><span>{unit}</span><span /></div>
        {ex.rows.map((r, ri) => (
          <div key={r._k} className={`pe-set ${r._new ? "new" : ""} ${ex.same && ri > 0 ? "follows" : ""}`}>
            <span className="pe-setno">{ri + 1}</span>
            <input className="pe-in" inputMode="text" value={r.reps} placeholder={DEFAULT_REPS} onChange={(e) => onRow(ri, "reps", e.target.value)} onFocus={(e) => e.target.select()} aria-label={`Set ${ri + 1} reps`} />
            <input className="pe-in" inputMode="decimal" value={r.weight} placeholder="—" onChange={(e) => onRow(ri, "weight", e.target.value)} onFocus={(e) => e.target.select()} aria-label={`Set ${ri + 1} weight in ${unit}`} />
            {ex.rows.length > 1
              ? <button type="button" className="pe-x" onClick={() => onRemoveSet(ri)} aria-label={`Remove set ${ri + 1}`}><Icon.Close size={14} /></button>
              : <span />}
          </div>
        ))}
      </div>

      <div className="pe-setactions">
        <button type="button" className="pe-addset" onClick={onAddSet} disabled={ex.rows.length >= 20}><Icon.Plus size={14} />Add set</button>
        <button type="button" className={`pe-same ${ex.same ? "on" : ""}`} aria-pressed={ex.same} onClick={onSame} title="When on, typing in set 1 fills every set">Same for all{ex.same && <Icon.Check size={12} />}</button>
      </div>

      <input className={`pe-note ${ex.coachNote ? "has" : ""}`} value={ex.coachNote} placeholder={`Note for ${firstName} (optional)`} onChange={(e) => onNote(e.target.value.slice(0, 200))} aria-label="Coach note" />

      <div className="pe-cardfoot">
        <span>{last ? `${firstName} last did: ${historyLine(last.sets)}` : history && ex.name ? `${firstName} hasn't done this yet` : ""}</span>
        <button type="button" className="pe-remove" onClick={onRemove}>Remove</button>
      </div>
    </div>
  );
}

// ── Adding exercises ───────────────────────────────────────────────────────
function AddSheet({ open, dayKey, type, existing, firstName, history, onClose, onAdd }) {
  const data = useCoachData();
  const [q, setQ] = React.useState("");
  const [picked, setPicked] = React.useState([]);
  const [results, setResults] = React.useState([]);
  const reqRef = React.useRef(0);
  React.useEffect(() => { if (open) { setQ(""); setPicked([]); setResults([]); } }, [open]);
  React.useEffect(() => {
    if (!open) return;
    const id = ++reqRef.current;
    const term = q.trim();
    if (term.length < 2) { setResults([]); return; }
    const t = setTimeout(() => {
      data.searchExercises(term).then((r) => { if (reqRef.current === id) setResults(r.slice(0, 8)); }).catch(() => setResults([]));
    }, 160);
    return () => clearTimeout(t);
  }, [q, open, data]);

  const has = (n) => picked.some((p) => p.toLowerCase() === n.toLowerCase());
  const toggle = (n) => setPicked((p) => (has(n) ? p.filter((x) => x.toLowerCase() !== n.toLowerCase()) : [...p, n]));
  // A rest or custom day has no defaults of its own (a new saved plan starts all rest), so offer the common lifts.
  const typed = TYPE_DEFAULTS[type]?.length > 0;
  const base = typed ? TYPE_DEFAULTS[type] : [...new Set([...TYPE_DEFAULTS["Full Body"], ...TYPE_DEFAULTS.Push, ...TYPE_DEFAULTS.Pull, ...TYPE_DEFAULTS.Legs])];
  const suggestions = base.filter((n) => !existing.includes(n.toLowerCase()));
  const used = (n) => (history || []).filter((h) => (h.exercises || []).some((e) => (e.name || "").toLowerCase() === n.toLowerCase())).length;
  const exact = results.some((r) => r.name.toLowerCase() === q.trim().toLowerCase());

  return (
    <Sheet open={open} onClose={onClose} title={`Add to ${DAY_LONG[dayKey]}`}>
      <div className="pe-add">
        <label className="pe-search">
          <Icon.Search size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exercises" aria-label="Search exercises" autoFocus />
        </label>
        {suggestions.length > 0 && q.trim().length < 2 && (
          <div className="pe-sugs">
            <span className="pe-label">{typed ? `Good for a ${type} day` : "Popular"}</span>
            <div className="pe-chips">{suggestions.map((n) => <button key={n} type="button" className={`pe-chip ${has(n) ? "on" : ""}`} aria-pressed={has(n)} onClick={() => toggle(n)}>{has(n) ? <Icon.Check size={12} /> : <Icon.Plus size={12} />}{n}</button>)}</div>
          </div>
        )}
        {q.trim().length >= 2 && (
          <div className="pe-results">
            {results.map((r) => {
              const n = r.name; const u = used(n);
              return (
                <div key={r.id || n} className="pe-result">
                  <span><b>{n}</b><small>{[r.muscle_group, r.is_custom ? "yours" : null, u ? `${firstName} did it ${u} time${u === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ")}</small></span>
                  <button type="button" className={`pe-plus ${has(n) ? "on" : ""}`} aria-pressed={has(n)} aria-label={`${has(n) ? "Remove" : "Add"} ${n}`} onClick={() => toggle(n)}>{has(n) ? <Icon.Check size={16} /> : <Icon.Plus size={16} />}</button>
                </div>
              );
            })}
            {!exact && (
              <div className="pe-result">
                <span><b>Add "{q.trim()}"</b><small>As your own exercise</small></span>
                <button type="button" className={`pe-plus dashed ${has(q.trim()) ? "on" : ""}`} aria-label={`Add ${q.trim()} as your own exercise`} onClick={() => toggle(q.trim())}>{has(q.trim()) ? <Icon.Check size={16} /> : <Icon.Plus size={16} />}</button>
              </div>
            )}
          </div>
        )}
        <div className="pe-addfoot">
          <span>New exercises start at 3 × {DEFAULT_REPS}{history?.length ? `, with ${firstName}'s last weight` : ""}.</span>
          <button type="button" className="pe-save dirty" disabled={picked.length === 0} onClick={() => onAdd(picked)}>{picked.length ? `Add ${picked.length}` : "Pick exercises"}</button>
        </div>
      </div>
    </Sheet>
  );
}

function CopySheet({ open, from, days, onClose, onCopy }) {
  const [to, setTo] = React.useState([]);
  React.useEffect(() => { if (open) setTo([]); }, [open]);
  const flip = (d) => setTo((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]));
  return (
    <Sheet open={open} onClose={onClose} title={`Copy ${DAY_LONG[from]} to…`} subtitle="The days you pick get the same exercises, sets and notes. What they had is replaced.">
      <div className="pe-copy">
        {DAYS.filter((d) => d !== from).map((d) => {
          const t = days[d].type; const c = dayCount(days[d]);
          return (
            <button key={d} type="button" className={`pe-copyday ${to.includes(d) ? "on" : ""}`} aria-pressed={to.includes(d)} onClick={() => flip(d)}>
              <b>{DAY_LONG[d]}</b><span>{t === "Rest" ? "Rest" : `${t} · ${c.ex} exercises`}</span>{to.includes(d) && <Icon.Check size={16} />}
            </button>
          );
        })}
        <button type="button" className="pe-save dirty" disabled={to.length === 0} onClick={() => onCopy(to)}>{to.length ? `Copy to ${to.length} day${to.length === 1 ? "" : "s"}` : "Pick days"}</button>
      </div>
    </Sheet>
  );
}

// ── What the client sees (laptop) ──────────────────────────────────────────
function ClientPreview({ dayKey, day, unit, firstName, forClient }) {
  const color = TYPE_COLORS[day.type] || "var(--cx-tx2)";
  return (
    <aside className="pe-preview" aria-label={`What ${firstName} sees`}>
      <span className="pe-label">What {firstName} sees</span>
      <div className="pe-phoneframe">
        <span className="pe-pv-eyebrow">{DAY_LONG[dayKey].toUpperCase()}</span>
        {day.type === "Rest"
          ? <b className="pe-pv-h">Rest day.</b>
          : <b className="pe-pv-h">Your <span style={{ color }}>{day.type.toLowerCase()}</span> day.</b>}
        {day.exercises.filter((e) => e.name.trim()).map((e) => (
          <div key={e._key} className="pe-pv-card">
            <b>{e.name}</b>
            {e.coachNote && <span className="pe-pv-note">{e.coachNote}</span>}
            {e.rows.map((r, i) => (
              <div key={r._k} className="pe-pv-set"><i /><small>Set {i + 1}</small><b>{r.reps || DEFAULT_REPS}</b><small>reps</small>{r.weight && <><b>{r.weight}</b><small>{unit}</small></>}</div>
            ))}
          </div>
        ))}
      </div>
      <span className="pe-pv-foot">{forClient ? `Updates as you type. ${firstName} gets it when you save.` : "Updates as you type. Clients on this plan get it when you update them."}</span>
    </aside>
  );
}

/** Autocomplete over the exercise library for renaming; typing a new name is allowed. */
function ExerciseSearch({ value, onChange, autoFocus }) {
  const data = useCoachData();
  const [open, setOpen] = React.useState(false);
  const [results, setResults] = React.useState([]);
  const [hi, setHi] = React.useState(0);
  const wrapRef = React.useRef(null);
  const inputRef = React.useRef(null);
  const reqRef = React.useRef(0);

  React.useEffect(() => { if (autoFocus) inputRef.current?.focus(); }, [autoFocus]);
  React.useEffect(() => {
    if (!open) return;
    const id = ++reqRef.current;
    if ((value || "").trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => {
      data.searchExercises(value).then((r) => { if (reqRef.current === id) { setResults(r.slice(0, 8)); setHi(0); } }).catch(() => setResults([]));
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
      <input ref={inputRef} className="pe-namein" value={value} placeholder="Exercise name" aria-label="Exercise name" aria-autocomplete="list" aria-expanded={open}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }} onKeyDown={onKey} />
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
