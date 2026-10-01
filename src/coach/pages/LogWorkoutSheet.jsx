import React from "react";
import { Sheet, Icon, useToast } from "../ui/primitives.jsx";
import { DAY_LONG } from "../lib/format.js";
import { todayFromPlan, workoutPayload, dayKeyOf, cleanDecimal, workoutNumbersProblem } from "../lib/clientLinks.js";
import { planSets } from "../lib/planSets.js";
import { maskDuration, tidyDuration, durationInput } from "../lib/exerciseKinds.js";
import { readDraft, saveDraft, clearDraft } from "../lib/logDraft.js";
import { shapeExercises, plannedSets, anyChanges, MAX_SETS } from "../lib/logChanges.js";
import SwapExerciseSheet from "./SwapExerciseSheet.jsx";
import { editStateFromPayload } from "../../link/sentWorkout.js";
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

/** Everything ticked: whatever the plan asks, minus the skips. What "Done as planned" sends. */
function defaultTicks(planExercises, changes) {
  return Object.fromEntries(shapeExercises(planExercises, changes).map((e, i) => [i, changes?.skipped?.[i] ? 0 : plannedSets(e)]));
}

/**
 * A workout already sent, back in the sheet's terms so it can be redone:
 * ticks, typed numbers, skips, swaps (by name) and changed set counts.
 */
function stateFromWorkout(payload, planExercises, units) {
  const s = editStateFromPayload(payload, planExercises, units);
  const swaps = Object.fromEntries(Object.entries(s.swaps).map(([i, x]) => [i, x.name]));
  const sets = {};
  for (const e of payload?.exercises || []) {
    const k = String(e?.swapped_from || e?.name || "").trim().toLowerCase();
    const i = planExercises.findIndex((p) => String(p?.name || "").trim().toLowerCase() === k);
    const n = Number(e?.sets_planned) || 0;
    if (i >= 0 && n > 0 && n !== plannedSets(planExercises[i])) sets[i] = n;
  }
  // A workout doesn't say "skipped", only 0 sets done: that opens unticked,
  // since it may be the part the client does later.
  return { ticks: s.ticks, log: s.log, skipped: {}, swaps, sets, note: s.note };
}

/**
 * The coach ticks off a workout for a client who didn't (name-only clients).
 * One tap for "did it as planned"; or tick sets and change numbers. The session
 * rarely matches the plan exactly, so an exercise can also be skipped, swapped
 * for something else, or done for more or fewer sets — for that day only, never
 * touching the plan. Saved like a link submission, marked logged_by "coach", so
 * it counts for their streak and shows as "logged by you".
 *
 * Nothing starts ticked. A coach often logs only the part they ran (the
 * weights) and the client sends the rest (the abs) through their link, so an
 * exercise the coach doesn't touch is saved as not done, never as done.
 *
 * With `replacing` (a workout from the list), the sheet redoes that workout:
 * same day, opened as it was sent, and saving replaces it.
 */
export default function LogWorkoutSheet({ open, clientId, firstName, routine, history, unit, onClose, onSave, now, replacing = null }) {
  const toast = useToast();
  // "Today" is the client's today (#95): a coach in India logging a US client's evening workout.
  const days = React.useMemo(() => recentDays(routine, now || new Date()), [routine, open]); // eslint-disable-line react-hooks/exhaustive-deps
  const doneDates = React.useMemo(() => new Set((history || []).map((h) => h.date)), [history]);
  // Start on the latest planned day that has nothing logged yet (usually today).
  const pickDefault = () => (days.find((x) => !x.rest && !doneDates.has(x.iso)) || days.find((x) => !x.rest) || days[0]).iso;
  const [date, setDate] = React.useState(pickDefault);
  const [ticks, setTicks] = React.useState({}); // exercise index → sets done
  const [log, setLog] = React.useState({});     // exercise index → set index → { r, w }
  const [skipped, setSkipped] = React.useState({}); // index → they didn't do it
  const [swaps, setSwaps] = React.useState({});     // index → what they did instead
  const [sets, setSets] = React.useState({});       // index → sets they actually did
  const [openEx, setOpenEx] = React.useState(null);
  const [swapAt, setSwapAt] = React.useState(null);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const plan = React.useMemo(() => todayFromPlan(routine, noon(date)), [routine, date]);
  // The day as the coach is logging it. The plan itself is never written to.
  const exercises = React.useMemo(() => shapeExercises(plan.exercises, { swaps, sets }), [plan.exercises, swaps, sets]);
  const changed = anyChanges(plan.exercises, { skipped, swaps, sets });
  // Reopening the sheet, or coming back to a day: whatever they had typed for
  // that day is still there. Only a day they never touched opens as planned.
  React.useEffect(() => { if (open) setDate(replacing?.date || pickDefault()); }, [open, replacing?.date]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (!open) return;
    const draft = replacing
      ? (replacing.date === date ? stateFromWorkout(replacing.payload, plan.exercises, unit === "kg" ? "metric" : "imperial") : null)
      : readDraft(clientId, date);
    setSkipped(draft?.skipped || {}); setSwaps(draft?.swaps || {}); setSets(draft?.sets || {});
    setTicks(draft?.ticks || {});
    setLog(draft?.log || {});
    setNote(draft?.note || "");
    setOpenEx(null);
  }, [open, date, plan.exercises.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // Every tick, every number and every change, kept until it is sent.
  React.useEffect(() => {
    if (!open || plan.isRest || replacing) return;
    saveDraft(clientId, date, { ticks, log, note, skipped, swaps, sets });
  }, [open, clientId, date, ticks, log, note, skipped, swaps, sets]); // eslint-disable-line react-hooks/exhaustive-deps

  const setsTotal = exercises.reduce((a, e, i) => a + (skipped[i] ? 0 : plannedSets(e)), 0);
  const setsDone = exercises.reduce((a, e, i) => a + (skipped[i] ? 0 : Math.min(ticks[i] || 0, plannedSets(e))), 0);
  const already = doneDates.has(date);
  const dayInfo = days.find((x) => x.iso === date);

  const toggleExercise = (i) => { const full = plannedSets(exercises[i]); setTicks((t) => ({ ...t, [i]: (t[i] || 0) >= full ? 0 : full })); };
  // Tapping set k marks sets 1..k done; tapping the last done set again unticks it.
  const tapSet = (i, k) => setTicks((t) => ({ ...t, [i]: (t[i] || 0) === k + 1 ? k : k + 1 }));
  const setVal = (i, si, f, raw) => {
    const v = f === "r" ? raw.replace(/[^0-9]/g, "").slice(0, 3) : f === "s" ? maskDuration(raw) : cleanDecimal(raw);
    setLog((l) => ({ ...l, [i]: { ...(l[i] || {}), [si]: { ...(l[i]?.[si] || {}), [f]: v } } }));
  };
  const skip = (i) => { setSkipped((s) => ({ ...s, [i]: true })); setTicks((t) => ({ ...t, [i]: 0 })); setOpenEx(null); };
  const unskip = (i) => { setSkipped((s) => ({ ...s, [i]: false })); setTicks((t) => ({ ...t, [i]: plannedSets(exercises[i]) })); };
  const swap = (i, name) => {
    setSwaps((s) => ({ ...s, [i]: name }));
    setSkipped((s) => (s[i] ? { ...s, [i]: false } : s)); // they did do something
    // Reps and times carry over; a weight typed for the old exercise doesn't.
    setLog((l) => (l[i] ? { ...l, [i]: Object.fromEntries(Object.entries(l[i]).map(([k, v]) => [k, { ...v, w: "" }])) } : l));
  };
  const changeSets = (i, n) => {
    const full = plannedSets(exercises[i]);
    const want = Math.min(MAX_SETS, Math.max(1, n));
    setSets((s) => ({ ...s, [i]: want }));
    // All of them were ticked, so the added set is ticked too; otherwise keep
    // what they ticked, never more than the sets there now.
    setTicks((t) => ({ ...t, [i]: (t[i] || 0) >= full ? want : Math.min(t[i] || 0, want) }));
  };

  async function save(asPlanned) {
    if (plan.isRest) return;
    const t = asPlanned ? defaultTicks(plan.exercises, { skipped, swaps, sets }) : ticks;
    if (!Object.values(t).some((n) => n > 0)) { toast("Tick at least one set, or use Done as planned.", "error"); return; }
    // A number that can't be read would be sent as blank, which means "as planned". #133
    const units = unit === "kg" ? "metric" : "imperial";
    const bad = asPlanned ? null : workoutNumbersProblem(exercises, log, units);
    if (bad) { toast(bad, "error"); return; }
    setBusy(true);
    try {
      // An older plan holds bare exercise names with no set count. The sheet
      // showed a count and the coach ticked it off, so that is what was asked
      // for — without this the workout reads "10 of 0 sets" afterwards.
      const sent = exercises.map((e) => ({ ...e, sets: plannedSets(e) }));
      const payload = { ...workoutPayload({ ...plan, exercises: sent }, t, asPlanned ? {} : log, asPlanned ? "" : note, date, units), logged_by: "coach" };
      await onSave(payload);
      if (!replacing) clearDraft(clientId, date); // the coach has sent it; nothing left to keep
      if (replacing) toast(`Replaced ${DAY_LONG[plan.key]}'s workout for ${firstName}.`);
      else toast(`Saved ${dayInfo?.label === "Today" ? "today's" : `${DAY_LONG[plan.key]}'s`} workout for ${firstName}. It counts for their streak.`);
      onClose();
    } catch (e) {
      toast(e.message || "Could not save", "error");
    } finally {
      setBusy(false);
    }
  }

  const color = TYPE_COLORS[plan.type] || "var(--cx-tx2)";
  return (
    <Sheet open={open} onClose={onClose}
      title={replacing ? `Redo ${firstName}'s ${DAY_LONG[plan.key]} workout` : `Log a workout for ${firstName}`}
      subtitle={replacing ? "Tick what they actually did. Saving replaces the workout that's there now." : "Tick only what they did with you. They can send the rest through their link."}>
      <div className="lw">
        {!replacing && <div className="lw-days" role="group" aria-label="Which day">
          {days.map((x) => (
            <button key={x.iso} type="button" className={`lw-day ${x.rest ? "rest" : ""}`} aria-pressed={x.iso === date} onClick={() => setDate(x.iso)}>
              <b>{x.label}</b><small>{x.rest ? "Rest" : x.type}</small>{doneDates.has(x.iso) && <i aria-label="already logged"><Icon.Check size={10} /></i>}
            </button>
          ))}
        </div>}

        {plan.isRest ? (
          <div className="lw-empty">Nothing was planned for {DAY_LONG[plan.key]}. Pick a workout day above.</div>
        ) : (
          <>
            {already && !replacing && <div className="lw-warn">{firstName} already has a workout on this day. Tick only what isn't in it. Both show as one day.</div>}
            {!changed && (
              <>
                <button type="button" className="lw-quick" onClick={() => save(true)} disabled={busy}>
                  <Icon.Check size={18} /><span><b>Done as planned</b><small>All {setsTotal} sets of {DAY_LONG[plan.key]}'s <span style={{ color }}>{plan.type.toLowerCase()}</span> workout</small></span>
                </button>
                <div className="lw-or"><span>or tick what they did</span></div>
              </>
            )}

            <div className="lw-list">
              {exercises.map((e, i) => {
                const full = plannedSets(e); const n = Math.min(ticks[i] || 0, full);
                const off = Boolean(skipped[i]);
                const rows = planSets(e, full);
                const isOpen = openEx === i;
                const asked = plannedSets(plan.exercises[i]);
                return (
                  <div key={i} className={`lw-ex ${off ? "skipped" : n === full ? "done" : n > 0 ? "part" : ""}`}>
                    <div className="lw-exhd">
                      {off
                        ? <button type="button" className="lw-tick" aria-label={`${e.name} was skipped. Undo`} onClick={() => unskip(i)}><Icon.Close size={14} /></button>
                        : <button type="button" className="lw-tick" aria-pressed={n === full} aria-label={`${n === full ? "Untick" : "Tick"} all sets of ${e.name}`} onClick={() => toggleExercise(i)}>{n === full ? <Icon.Check size={16} /> : n > 0 ? n : ""}</button>}
                      <button type="button" className="lw-exname" onClick={() => setOpenEx(isOpen ? null : i)} aria-expanded={isOpen}>
                        <b>{e.name}</b>
                        <small>
                          {off ? "Skipped" : `${n} of ${full} sets`}
                          {e.swappedFrom ? ` · instead of ${e.swappedFrom}` : full !== asked ? ` · ${asked} planned` : ""}
                          {` · ${isOpen ? "hide" : "change"}`}
                        </small>
                      </button>
                    </div>
                    {isOpen && (
                      <div className="lw-sets">
                        {!off && rows.map((s, si) => (
                          <div key={si} className="lw-set">
                            <button type="button" className={`lw-setno ${si < n ? "on" : ""}`} aria-pressed={si < n} aria-label={`Set ${si + 1} ${si < n ? "done" : "not done"}`} onClick={() => tapSet(i, si)}>{si < n ? <Icon.Check size={12} /> : s.kind === "warmup" ? "W" : s.kind === "drop" ? "D" : s.kind === "amrap" ? "A" : si + 1}</button>
                            {e.mode === "time"
                              ? <label><input inputMode="numeric" value={log[i]?.[si]?.s ?? ""} placeholder={durationInput(s.secs ?? e.secs) || "00:00"} onChange={(ev) => setVal(i, si, "s", ev.target.value)} onBlur={(ev) => { const t = tidyDuration(ev.target.value); if (t && t !== ev.target.value) setVal(i, si, "s", t); }} aria-label={`Set ${si + 1} time`} /><span>time</span></label>
                              : <label><input inputMode="numeric" value={log[i]?.[si]?.r ?? ""} placeholder={String(s.reps || e.reps || "–").split(/[-–]/)[0]} onChange={(ev) => setVal(i, si, "r", ev.target.value)} aria-label={`Set ${si + 1} reps`} /><span>reps</span></label>}
                            <label><input inputMode="decimal" value={log[i]?.[si]?.w ?? ""} placeholder={s.weight != null ? String(s.weight) : "–"} onChange={(ev) => setVal(i, si, "w", ev.target.value)} aria-label={`Set ${si + 1} weight in ${unit}`} /><span>{unit}</span></label>
                          </div>
                        ))}
                        {!off && <small className="lw-hint">Blank means as planned.</small>}
                        <div className="lw-exacts">
                          <button type="button" className="lw-act" onClick={() => setSwapAt(i)}><Icon.Copy size={13} />{e.swappedFrom ? "Swap again" : "They did something else"}</button>
                          {!off && full < MAX_SETS && <button type="button" className="lw-act" onClick={() => changeSets(i, full + 1)}><Icon.Plus size={13} />Add a set</button>}
                          {!off && full > 1 && <button type="button" className="lw-act" onClick={() => changeSets(i, full - 1)}>One set fewer</button>}
                          {off
                            ? <button type="button" className="lw-act on" onClick={() => unskip(i)}>They did it after all</button>
                            : <button type="button" className="lw-act danger" onClick={() => skip(i)}>They skipped this</button>}
                        </div>
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
      <SwapExerciseSheet open={swapAt != null} exercise={swapAt != null ? exercises[swapAt] : null} firstName={firstName}
        onPick={(name) => swap(swapAt, name)} onClose={() => setSwapAt(null)} />
    </Sheet>
  );
}
