import React from "react";
import { Sheet, useToast } from "../ui/primitives.jsx";
import { shortDate, DAY_LONG } from "../lib/format.js";
import { todayFromPlan, dayKeyOf, movePayload } from "../lib/clientLinks.js";

const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * The coach puts a workout on the day it really happened: logged on the wrong
 * day, or sent late. Only the day changes; what was done stays as it is. The
 * last two weeks on the client's clock, each with what the plan had that day.
 */
export default function MoveWorkoutSheet({ open, workout, firstName, routine, now, onClose, onSave }) {
  const toast = useToast();
  const [to, setTo] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (open) setTo(null); }, [open]);
  const days = React.useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now || new Date()); d.setDate(d.getDate() - i); d.setHours(12, 0, 0, 0);
    const t = routine ? todayFromPlan(routine, d) : null;
    return { iso: isoOf(d), label: i === 0 ? "Today" : i === 1 ? "Yesterday" : `${dayKeyOf(d)} ${d.getDate()}`, type: t ? (t.isRest ? "Rest" : t.type) : "" };
  }), [routine, now, open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!workout?.payload) return null;

  async function save() {
    if (!to) return;
    setBusy(true);
    try {
      await onSave(movePayload(workout.payload, to));
      const [y, m, d] = to.split("-").map(Number);
      toast(`Moved to ${DAY_LONG[dayKeyOf(new Date(y, m - 1, d, 12))]}, ${shortDate(to)}.`);
      onClose();
    } catch (e) { toast(e.message || "Could not move it", "error"); }
    finally { setBusy(false); }
  }

  return (
    <Sheet open={open} onClose={onClose} title={`Move ${firstName}'s workout`} subtitle={`It's on ${shortDate(workout.date)} now. Pick the day it really happened.`}>
      <div className="lw">
        <div className="lw-days lw-days-wrap" role="group" aria-label="Move to which day">
          {days.map((x) => (
            <button key={x.iso} type="button" className={`lw-day ${x.type === "Rest" ? "rest" : ""}`} aria-pressed={x.iso === to} disabled={x.iso === workout.date} onClick={() => setTo(x.iso)}>
              <b>{x.label}</b><small>{x.iso === workout.date ? "now" : x.type}</small>
            </button>
          ))}
        </div>
        <button type="button" className="lw-save" onClick={save} disabled={busy || !to}>{busy ? "Moving…" : to ? `Move to ${shortDate(to)}` : "Pick a day"}</button>
      </div>
    </Sheet>
  );
}
