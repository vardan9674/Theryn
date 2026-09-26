import React, { useMemo, useState } from "react";
import Sheet, { ui } from "./Sheet.jsx";
import BodyMap from "../BodyMap.jsx";
import useEquipment from "./useEquipment.js";
import { TX, BD } from "../templates/tokens.js";
import { GROUP_LABEL, EQUIPMENT_LABEL } from "../../lib/exerciseLibrary.js";
import { buildQuickWorkout, FOCUS_PRESETS, DURATIONS } from "../../lib/quickWorkout.js";

const TX2 = "#B0B0B0", MU = "#8A8A8A";

/**
 * Quick workout: pick a focus (or tap muscles), a time, and get a workout built from the
 * library with the person's equipment. onStart([{ name, sets, reps }]) loads it into the Log.
 */
export default function QuickWorkoutSheet({ lib, history, onStart, onClose, onChangeEquipment }) {
  const { equipment } = useEquipment();
  const [groups, setGroups] = useState(FOCUS_PRESETS.find((p) => p.id === "full").groups);
  const [minutes, setMinutes] = useState(30);
  const [shuffle, setShuffle] = useState(0);
  const plan = useMemo(() => buildQuickWorkout(lib, { groups, minutes, equipment, history, shuffle }), [lib, groups, minutes, equipment, history, shuffle]);
  const presetId = FOCUS_PRESETS.find((p) => p.groups.length === groups.length && p.groups.every((g) => groups.includes(g)))?.id;
  const toggle = (g) => setGroups(groups.includes(g) ? groups.filter((x) => x !== g) : [...groups, g]);

  return (
    <Sheet title="Quick workout" subtitle="Built from exercises you can do with your equipment." onClose={onClose} full
      footer={(close) => (
        <>
          <button type="button" onClick={() => setShuffle(shuffle + 1)} disabled={!plan.length} style={ui.ghost}>Shuffle</button>
          <button type="button" disabled={!plan.length} onClick={() => { onStart(plan.map(({ name, sets, reps }) => ({ name, sets, reps }))); close(); }} style={ui.primary(plan.length > 0)}>Start workout</button>
        </>
      )}>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <span style={ui.label}>Focus</span>
        <div role="radiogroup" aria-label="Focus" style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {FOCUS_PRESETS.map((p) => <button key={p.id} type="button" role="radio" aria-checked={presetId === p.id} onClick={() => { setGroups(p.groups); setShuffle(0); }} style={ui.chip(presetId === p.id)}>{p.label}</button>)}
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: "20px" }}>
          <BodyMap view="front" main={groups} width={88} onToggle={toggle} />
          <BodyMap view="back" main={groups} width={88} onToggle={toggle} />
        </div>
        <span style={{ fontSize: "13px", color: MU, textAlign: "center" }}>{groups.length ? `Tap muscles to change: ${groups.map((g) => GROUP_LABEL[g]).join(", ")}` : "Tap muscles to choose a focus."}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <span style={ui.label}>Time</span>
        <div role="radiogroup" aria-label="Minutes" style={{ display: "flex", gap: "6px" }}>
          {DURATIONS.map((m) => <button key={m} type="button" role="radio" aria-checked={minutes === m} onClick={() => setMinutes(m)} style={ui.chip(minutes === m)}>{m} min</button>)}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
        <span style={{ fontSize: "14px", color: TX2 }}>Equipment: {equipment.map((e) => EQUIPMENT_LABEL[e]).join(", ")}</span>
        {onChangeEquipment && <button type="button" onClick={onChangeEquipment} style={{ minHeight: "40px", background: "none", border: "none", color: TX2, fontSize: "14px", textDecoration: "underline", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>Change</button>}
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={ui.label}>{plan.length ? `Your workout · ${plan.length} exercises` : "Your workout"}</span>
        {plan.map((x) => (
          <div key={x.name} style={{ display: "flex", alignItems: "center", gap: "10px", minHeight: "56px", borderBottom: `1px solid ${BD}` }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontSize: "16px", fontWeight: 600, color: TX }}>{x.name}</span>
              <span style={{ fontSize: "13px", color: TX2 }}>{GROUP_LABEL[x.group]} · {EQUIPMENT_LABEL[x.equipment]}</span>
            </div>
            <span style={{ fontSize: "14px", fontWeight: 600, color: TX, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{x.sets} × {x.reps}</span>
          </div>
        ))}
        {!plan.length && <p style={{ margin: "8px 0 0", fontSize: "15px", color: TX2 }}>{groups.length ? "Nothing matches your equipment for these muscles. Try other muscles or add equipment." : "Pick a focus to build a workout."}</p>}
      </div>
    </Sheet>
  );
}
