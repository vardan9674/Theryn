import React, { useState } from "react";
import Sheet, { ui } from "./Sheet.jsx";
import useEquipment from "./useEquipment.js";
import { A, S1, S2, BD, TX, MT, RED } from "../templates/tokens.js";
import { EQUIPMENT } from "../../lib/exerciseLibrary.js";
import { EQUIPMENT_PRESETS, presetFor, saveEquipment, cleanEquipment } from "../../lib/equipmentProfile.js";

const TX2 = "#B0B0B0", MU = "#8A8A8A";
const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" };
const ICONS = {
  barbell: <><line x1="2" y1="12" x2="22" y2="12" /><rect x="4.5" y="7" width="2.5" height="10" rx="1" /><rect x="17" y="7" width="2.5" height="10" rx="1" /></>,
  dumbbell: <><line x1="7" y1="12" x2="17" y2="12" /><rect x="3" y="8.5" width="4" height="7" rx="1.5" /><rect x="17" y="8.5" width="4" height="7" rx="1.5" /></>,
  cable: <><line x1="4" y1="3" x2="4" y2="21" /><line x1="20" y1="3" x2="20" y2="21" /><circle cx="12" cy="5.5" r="2.5" /><line x1="12" y1="8" x2="12" y2="16" /><rect x="9" y="16" width="6" height="3.5" rx="1" /></>,
  machine: <><rect x="4" y="3" width="5" height="18" rx="1" /><line x1="4" y1="8" x2="9" y2="8" /><line x1="4" y1="12.5" x2="9" y2="12.5" /><path d="M12.5 8h3v6" /><rect x="12.5" y="14" width="8" height="3" rx="1" /><line x1="15" y1="17" x2="15" y2="21" /><line x1="19" y1="17" x2="19" y2="21" /></>,
  body: <><circle cx="12" cy="4.5" r="2" /><path d="M12 7v7M7 10h10M12 14l-3 7M12 14l3 7" /></>,
  ez: <><path d="M3 12h4l2-2.5 3 5 3-5 2 2.5h4" /><line x1="3" y1="8.5" x2="3" y2="15.5" /><line x1="21" y1="8.5" x2="21" y2="15.5" /></>,
  kettlebell: <><path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" /><circle cx="12" cy="15" r="5.5" /></>,
  band: <><rect x="3.5" y="7" width="17" height="10" rx="5" /><rect x="7" y="9.8" width="10" height="4.4" rx="2.2" /></>,
  other: <><circle cx="12" cy="12" r="8" /><path d="M4.6 9.3c4.8 2 10 2 14.8 0M4.6 14.7c4.8-2 10-2 14.8 0" /></>,
};

/** "Your equipment": the person picks what they can train with; the picker, swap and quick workout use it. */
export default function EquipmentScreen({ supabase, userId, onClose }) {
  const saved = useEquipment();
  const [list, setList] = useState(saved.equipment);
  const [status, setStatus] = useState({ busy: false, msg: "", error: false });
  const preset = presetFor(list);
  const toggle = (id) => { if (id === "body") return; setList(cleanEquipment(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])); setStatus({ busy: false, msg: "" }); };

  const save = async (close) => {
    setStatus({ busy: true, msg: "" });
    try {
      await saveEquipment(list, { supabase, userId });
      setStatus({ busy: false, msg: "Saved." });
      close();
    } catch (e) {
      setStatus({ busy: false, msg: e.message, error: true });
    }
  };

  return (
    <Sheet title="Your equipment" subtitle="Theryn only suggests exercises you can do with this." onClose={onClose} full
      footer={(close) => <button type="button" onClick={() => save(close)} disabled={status.busy} style={ui.primary(!status.busy)}>{status.busy ? "Saving…" : "Save"}</button>}>
      <div role="radiogroup" aria-label="Where you train" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", background: S2, border: `1px solid ${BD}`, borderRadius: "10px", overflow: "hidden" }}>
        {[...EQUIPMENT_PRESETS, { id: "custom", label: "Custom" }].map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={preset === p.id} disabled={p.id === "custom"}
            onClick={() => p.equipment && setList(cleanEquipment(p.equipment))}
            style={{ minHeight: "42px", border: "none", background: preset === p.id ? MT : "transparent", color: preset === p.id ? TX : MU, fontSize: "13px", fontWeight: 600, cursor: p.id === "custom" ? "default" : "pointer", fontFamily: "inherit" }}>{p.label}</button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "8px" }}>
        {EQUIPMENT.map((e) => {
          const on = list.includes(e.id);
          return (
            <button key={e.id} type="button" aria-pressed={on} onClick={() => toggle(e.id)}
              style={{ position: "relative", minHeight: "96px", borderRadius: "14px", background: on ? S2 : S1, border: on ? `1.5px solid ${A}` : `1px solid ${BD}`, color: on ? TX : MU,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px", fontSize: "13px", fontWeight: 600, cursor: e.id === "body" ? "default" : "pointer", fontFamily: "inherit" }}>
              {on && <span aria-hidden="true" style={{ position: "absolute", top: 8, right: 8, width: 20, height: 20, borderRadius: "50%", background: A, color: "#000", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</span>}
              <svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" {...P}>{ICONS[e.id]}</svg>
              <span>{e.label}</span>
            </button>
          );
        })}
      </div>
      <span style={{ fontSize: "13px", color: MU }}>Bodyweight is always on. Smith machines count as machines.</span>
      {status.msg && <p role={status.error ? "alert" : "status"} style={{ margin: 0, fontSize: "14px", color: status.error ? RED : TX2 }}>{status.msg}</p>}
    </Sheet>
  );
}
