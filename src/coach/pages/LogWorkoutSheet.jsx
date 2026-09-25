import React from "react";
import { Sheet, Icon, useToast } from "../ui/primitives.jsx";
import { DAY_LONG } from "../lib/format.js";
import { todayFromPlan, workoutPayload, dayKeyOf } from "../lib/clientLinks.js";
import { planSets } from "../lib/planSets.js";
import { maskDuration, tidyDuration, durationInput } from "../lib/exerciseKinds.js";
import { readDraft, saveDraft, clearDraft } from "../lib/logDraft.js";
import { TYPE_COLORS } from "../../components/templates/tokens.js";

const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const noon = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d, 12); };

/** Today and the six days before it, with what the plan had on each. */
function recentDays(routine, now = new Date()) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now); d.setDate(now.getDate() - i); d.setHours(12, 0, 0, 0);
    const t = todayFromPlan(routine, d);
    return { iso: isoOf(d), label: i === 0 ? "Today" : i === 1 ? "Yesterday" : `${dayKeyOf(d)} ${d.getDate()}`, type: t.isRest ? "Rest" : t.type, rest: t.isRest };
  });
}

/**
 * The coach ticks off a workout for a client who didn't (name-only clients).
 * One tap for "did it as planned"; or tick sets and change numbers. Saved like
 * a link submission, marked logged_by "coach", so it counts for their streak
 * and shows as "logged by you".
 */
export default function LogWorkoutSheet({ open, clientId, firstName, routine, history, unit, onClose, onSave, now }) {
  const toast = useToast();
  // "Today" is the client's today (#95): a coach in India logging a US client's evening workout.
  const days = React.useMemo(() => recentDays(routine, now || new Date()), [routine, open]); // eslint-disable-line react-hooks/exhaustive-deps
  const doneDates = React.useMemo(() => new Set((history || []).map((h) => h.date)), [history]);
  // Start on the latest planned day that has nothing logged yet (usually today).
  const pickDefault = () => (days.find((x) => !x.rest && !doneDates.has(x.iso)) || days.find((x) => !x.rest) || days[0]).iso;
  const [date, setDate] = React.useState(pickDefault);
  const [ticks, setTicks] = React.useState({}); // exercise index → sets done
  const [log, setLog] = React.useState({});     // exercise index → set index → { r, w }
  const [openEx, setOpenEx] = React.useState(null);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const plan = React.useMemo(() => todayFromPlan(routine, noon(date)), [routine, date]);
  const allDone = () => Object.fromEntries(plan.exercises.map((e, i) => [i, e.sets || 1]));
  // Reopening the sheet, or coming back to a day: whatever they had typed for
  // that day is still there. Only a day they never touched opens as planned.
  React.useEffect(() => { if (open) setDate(pickDefault()); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (!open) return;
    const draft = readDraft(clientId, date);
    setTicks(draft?.ticks || allDone());
    setLog(draft?.log || {});
    setNote(draft?.note || "");
    setOpenEx(null);
  }, [open, date, plan.exercises.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // Every tick and every number, kept until it is sent.
  React.useEffect(() => {
    if (!open || plan.isRest) return;
    saveDraft(clientId, date, { ticks, log, note }, allDone());
  }, [open, clientId, date, ticks, log, note]); // eslint-disable-line react-hooks/exhaustive-deps

  const setsTotal = plan.exercises.reduce((a, e) => a + (e.sets || 1), 0);
  const setsDone = plan.exercises.reduce((a, e, i) => a + Math.min(ticks[i] || 0, e.sets || 1), 0);
  const already = doneDates.has(date);
  const dayInfo = days.find((x) => x.iso === date);

  const toggleExercise = (i) => { const full = plan.exercises[i].sets || 1; setTicks((t) => ({ ...t, [i]: (t[i] || 0) >= full ? 0 : full })); };
  // Tapping set k marks sets 1..k done; tapping the last done set again unticks it.
  const tapSet = (i, k) => setTicks((t) => ({ ...t, [i]: (t[i] || 0) === k + 1 ? k : k + 1 }));
  const setVal = (i, si, f, raw) => {
    const v = f === "r" ? raw.replace(/[^0-9]/g, "").slice(0, 3) : f === "s" ? maskDuration(raw) : raw.replace(/[^0-9.]/g, "").slice(0, 6);
    setLog((l) => ({ ...l, [i]: { ...(l[i] || {}), [si]: { ...(l[i]?.[si] || {}), [f]: v } } }));
  };

  async function save(asPlanned) {
    if (plan.isRest) return;
    const t = asPlanned ? allDone() : ticks;
    if (!Object.values(t).some((n) => n > 0)) { toast("Tick at least one set, or use Done as planned.", "error"); return; }
    setBusy(true);
    try {
      const payload = { ...workoutPayload(plan, t, asPlanned ? {} : log, asPlanned ? "" : note, date, unit === "kg" ? "metric" : "imperial"), logged_by: "coach" };
      await onSave(payload);
      clearDraft(clientId, date); // the coach has sent it; nothing left to keep
      toast(`Saved ${dayInfo?.label === "Today" ? "today's" : `${DAY_LONG[plan.key]}'s`} workout for ${firstName}. It counts for their streak.`);
      onClose();
    } catch (e) {
      toast(e.message || "Could not save", "error");
    } finally {
      setBusy(false);
    }
  }

  const color = TYPE_COLORS[plan.type] || "var(--cx-tx2)";
  return (
    <Sheet open={open} onClose={onClose} title={`Log a workout for ${firstName}`} subtitle="For when they trained but didn't tick it off themselves.">
      <div className="lw">
        <div className="lw-days" role="group" aria-label="Which day">
          {days.map((x) => (
            <button key={x.iso} type="button" className={`lw-day ${x.rest ? "rest" : ""}`} aria-pressed={x.iso === date} onClick={() => setDate(x.iso)}>
              <b>{x.label}</b><small>{x.rest ? "Rest" : x.type}</small>{doneDates.has(x.iso) && <i aria-label="already logged"><Icon.Check size={10} /></i>}
            </button>
          ))}
        </div>

        {plan.isRest ? (
          <div className="lw-empty">Nothing was planned for {DAY_LONG[plan.key]}. Pick a workout day above.</div>
        ) : (
          <>
            {already && <div className="lw-warn">{firstName} already has a workout on this day. Saving adds another one.</div>}
            <button type="button" className="lw-quick" onClick={() => save(true)} disabled={busy}>
              <Icon.Check size={18} /><span><b>Done as planned</b><small>All {setsTotal} sets of {DAY_LONG[plan.key]}'s <span style={{ color }}>{plan.type.toLowerCase()}</span> workout</small></span>
            </button>
            <div className="lw-or"><span>or tick what they did</span></div>

            <div className="lw-list">
              {plan.exercises.map((e, i) => {
                const full = e.sets || 1; const n = Math.min(ticks[i] || 0, full);
                const rows = planSets(e, full);
                const isOpen = openEx === i;
                return (
                  <div key={i} className={`lw-ex ${n === full ? "done" : n > 0 ? "part" : ""}`}>
                    <div className="lw-exhd">
                      <button type="button" className="lw-tick" aria-pressed={n === full} aria-label={`${n === full ? "Untick" : "Tick"} all sets of ${e.name}`} onClick={() => toggleExercise(i)}>{n === full ? <Icon.Check size={16} /> : n > 0 ? n : ""}</button>
                      <button type="button" className="lw-exname" onClick={() => setOpenEx(isOpen ? null : i)} aria-expanded={isOpen}>
                        <b>{e.name}</b><small>{n} of {full} sets · {isOpen ? "hide sets" : "change sets"}</small>
                      </button>
                    </div>
                    {isOpen && (
                      <div className="lw-sets">
                        {rows.map((s, si) => (
                          <div key={si} className="lw-set">
                            <button type="button" className={`lw-setno ${si < n ? "on" : ""}`} aria-pressed={si < n} aria-label={`Set ${si + 1} ${si < n ? "done" : "not done"}`} onClick={() => tapSet(i, si)}>{si < n ? <Icon.Check size={12} /> : s.kind === "warmup" ? "W" : s.kind === "drop" ? "D" : s.kind === "amrap" ? "A" : si + 1}</button>
                            {e.mode === "time"
                              ? <label><input inputMode="numeric" value={log[i]?.[si]?.s ?? ""} placeholder={durationInput(s.secs ?? e.secs) || "00:00"} onChange={(ev) => setVal(i, si, "s", ev.target.value)} onBlur={(ev) => { const t = tidyDuration(ev.target.value); if (t && t !== ev.target.value) setVal(i, si, "s", t); }} aria-label={`Set ${si + 1} time`} /><span>time</span></label>
                              : <label><input inputMode="numeric" value={log[i]?.[si]?.r ?? ""} placeholder={String(s.reps || e.reps || "–").split(/[-–]/)[0]} onChange={(ev) => setVal(i, si, "r", ev.target.value)} aria-label={`Set ${si + 1} reps`} /><span>reps</span></label>}
                            <label><input inputMode="decimal" value={log[i]?.[si]?.w ?? ""} placeholder={s.weight != null ? String(s.weight) : "–"} onChange={(ev) => setVal(i, si, "w", ev.target.value)} aria-label={`Set ${si + 1} weight in ${unit}`} /><span>{unit}</span></label>
                          </div>
                        ))}
                        <small className="lw-hint">Blank means as planned.</small>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <input className="cx-input lw-note" value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} placeholder="Note (optional)" aria-label="Note" />
            <button type="button" className="lw-save" onClick={() => save(false)} disabled={busy || setsDone === 0}>{busy ? "Saving…" : `Save ${setsDone} of ${setsTotal} sets`}</button>
          </>
        )}
      </div>
    </Sheet>
  );
}
