import React, { useMemo, useState } from "react";
import Sheet, { ui } from "./Sheet.jsx";
import useEquipment from "./useEquipment.js";
import { TX, BD, MT } from "../templates/tokens.js";
import { GROUP_LABEL, EQUIPMENT_LABEL, findInLibrary, alsoWorks } from "../../lib/exerciseLibrary.js";
import { suggestAlternatives } from "../../lib/exerciseAlternatives.js";

const TX2 = "#B0B0B0", MU = "#8A8A8A";
const REASONS = [["equipment", "Equipment busy"], ["pain", "Pain"], ["hard", "Too hard"], ["other", "Other"]];

function Row({ name, meta, extra, onSwap }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 0", borderBottom: `1px solid ${BD}` }}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "3px" }}>
        <span style={{ fontSize: "16px", fontWeight: 600, color: TX }}>{name}</span>
        {meta && <span style={{ fontSize: "13px", color: TX2 }}>{meta}</span>}
        {extra && <span style={{ fontSize: "12px", color: MU }}>{extra}</span>}
      </div>
      <button type="button" onClick={onSwap} style={{ minHeight: "44px", padding: "0 14px", borderRadius: "10px", border: `1px solid ${MT}`, background: "none", color: TX, fontSize: "14px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Swap</button>
    </div>
  );
}

/**
 * Swap one exercise in today's workout. The coach's suggestions come first, then
 * library exercises for the same main muscle that the person has equipment for.
 * onSwap(newName, reason) replaces it; onBrowse() opens the full exercise picker.
 */
export default function SwapSheet({ exercise, lib, onSwap, onBrowse, onClose }) {
  const [reason, setReason] = useState("");
  const { equipment } = useEquipment();
  const entry = findInLibrary(lib, exercise?.name);
  const coach = (exercise?.alternatives || []).filter((n) => n && n.toLowerCase() !== String(exercise?.name || "").toLowerCase());
  const library = useMemo(() => suggestAlternatives(lib, entry, { equipment, exclude: coach, reason, limit: 5 }), [lib, entry, equipment, coach.join("|"), reason]);
  const metaFor = (name) => { const e = findInLibrary(lib, name); return e ? `${GROUP_LABEL[e.group]} · ${EQUIPMENT_LABEL[e.equipment]}` : ""; };

  return (
    <Sheet title={`Swap ${exercise?.name || "exercise"}`} subtitle="Pick something that works the same muscle. Your sets carry over." onClose={onClose} full>
      {(close) => (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span style={ui.label}>Why? (optional)</span>
            <div role="radiogroup" aria-label="Why swap" style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {REASONS.map(([id, label]) => (
                <button key={id} type="button" role="radio" aria-checked={reason === id} onClick={() => setReason(reason === id ? "" : id)} style={ui.chip(reason === id)}>{label}</button>
              ))}
            </div>
            {reason === "pain" && <span style={{ fontSize: "14px", lineHeight: 1.45, color: TX2 }}>If something hurts, stop and let your coach know.</span>}
          </div>

          {coach.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={ui.label}>Your coach suggests</span>
              {coach.map((n) => <Row key={n} name={n} meta={metaFor(n) || "From your coach"} onSwap={() => { onSwap(n, reason); close(); }} />)}
            </div>
          )}

          {library.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={ui.label}>{coach.length ? "More options" : "Same muscle, your equipment"}</span>
              {library.map((e) => <Row key={e.id} name={e.name} meta={`${GROUP_LABEL[e.group]} · ${EQUIPMENT_LABEL[e.equipment]}`} extra={alsoWorks(e)} onSwap={() => { onSwap(e.name, reason); close(); }} />)}
            </div>
          )}

          {!coach.length && !library.length && (
            <p style={{ margin: 0, fontSize: "15px", lineHeight: 1.45, color: TX2 }}>
              {entry ? "Nothing else for this muscle matches your equipment." : "We don't have suggestions for this exercise yet."} You can pick any exercise instead.
            </p>
          )}
          {onBrowse && (
            <button type="button" onClick={() => { close(); onBrowse(); }} style={{ ...ui.ghost, width: "100%" }}>Choose from all exercises</button>
          )}
        </>
      )}
    </Sheet>
  );
}
