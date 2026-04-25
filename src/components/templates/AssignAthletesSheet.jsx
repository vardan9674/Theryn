import React from "react";
import { A, BG, S1, S2, BD, TX, SB, MT, RED } from "./tokens.js";

/**
 * Bottom-sheet checklist for managing template assignments.
 * Athletes already assigned start pre-checked. Unchecking one removes them.
 * Athletes assigned to a *different* template are shown locked — the rule is
 * one template per athlete, enforced client-side since the DB unique index is
 * per-(template_id, athlete_id) not per-athlete.
 * Props:
 *   athletes            — CoachLink[] (accepted links)
 *   assignedAthleteIds  — string[]  (currently assigned athlete IDs)
 *   lockedByTemplate    — Record<athleteId, { template_id, template_name }>
 *   templateName        — string
 *   onConfirm           — (selectedIds: string[]) => void
 *   onClose             — () => void
 *   loading             — bool
 */
export default function AssignAthletesSheet({ athletes, assignedAthleteIds = [], lockedByTemplate = {}, templateName, onConfirm, onClose, loading }) {
  const assignedSet = React.useMemo(() => new Set(assignedAthleteIds), [assignedAthleteIds]);
  const [selected, setSelected] = React.useState(() => new Set(assignedAthleteIds));

  const isLocked = (id) => Boolean(lockedByTemplate[id]);

  const toggle = (id) => {
    if (isLocked(id)) return;
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectableAthletes = React.useMemo(
    () => athletes.filter(a => !isLocked(a.athlete_id)),
    [athletes, lockedByTemplate]
  );

  const selectAll = () => setSelected(new Set(selectableAthletes.map(a => a.athlete_id)));
  const clearAll  = () => setSelected(new Set());
  const allSelected = selectableAthletes.length > 0 && selected.size === selectableAthletes.length;
  const lockedCount = athletes.length - selectableAthletes.length;

  // Compute delta for the confirm button label
  const toAssign   = athletes.filter(a => selected.has(a.athlete_id) && !assignedSet.has(a.athlete_id)).length;
  const toRemove   = athletes.filter(a => !selected.has(a.athlete_id) && assignedSet.has(a.athlete_id)).length;
  const noChanges  = toAssign === 0 && toRemove === 0;

  const confirmLabel = () => {
    if (loading) return "Saving…";
    if (noChanges) return "No changes";
    const parts = [];
    if (toAssign > 0) parts.push(`Add ${toAssign}`);
    if (toRemove > 0) parts.push(`Remove ${toRemove}`);
    return parts.join(" · ");
  };

  return (
    <div
      style={{ position:"fixed", inset:0, zIndex:300, background:"rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        style={{
          position:"absolute", bottom:0, left:"50%", transform:"translateX(-50%)",
          width:"100%", maxWidth:480,
          background:S1, borderRadius:"20px 20px 0 0",
          padding:"24px 20px 40px",
          animation:"drawerUp 0.25s cubic-bezier(0.2,0.8,0.2,1)",
          maxHeight:"85vh", display:"flex", flexDirection:"column",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle + header */}
        <div style={{ width:36, height:4, borderRadius:2, background:MT, margin:"0 auto 20px" }}/>
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:18, fontWeight:800, color:TX, letterSpacing:"-0.01em" }}>
            Manage Athletes
          </div>
          <div style={{ fontSize:12, color:SB, marginTop:3 }}>
            "{templateName}" · check to assign, uncheck to remove
          </div>
        </div>

        {/* Select-all bar */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <div style={{ fontSize:12, color:SB }}>
            {selected.size} of {selectableAthletes.length} assigned
            {lockedCount > 0 && ` · ${lockedCount} locked`}
          </div>
          <button
            onClick={allSelected ? clearAll : selectAll}
            disabled={selectableAthletes.length === 0}
            style={{ background:"none", border:`1px solid ${BD}`, borderRadius:8, padding:"5px 12px", color:A, fontSize:12, fontWeight:700, cursor: selectableAthletes.length === 0 ? "not-allowed" : "pointer", opacity: selectableAthletes.length === 0 ? 0.5 : 1 }}
          >
            {allSelected ? "Remove all" : "Select all"}
          </button>
        </div>

        {/* Athlete list */}
        <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column", gap:8 }}>
          {athletes.length === 0 ? (
            <div style={{ textAlign:"center", color:SB, padding:"32px 0", fontSize:14 }}>
              No accepted athletes yet.
            </div>
          ) : (
            athletes.map(link => {
              const locked       = isLocked(link.athlete_id);
              const lockInfo     = lockedByTemplate[link.athlete_id];
              const isSelected   = !locked && selected.has(link.athlete_id);
              const wasAssigned  = assignedSet.has(link.athlete_id);
              // Visual state: green=assigned+checked, yellow=will be removed, default=will be added
              const borderColor  = locked ? BD : isSelected ? (wasAssigned ? A + "55" : "#aadd0055") : (wasAssigned ? "#ff666655" : BD);
              const bgColor      = locked ? S2 : isSelected ? (wasAssigned ? `${A}12` : "#aadd0010") : (wasAssigned ? "#ff666608" : S2);

              return (
                <button
                  key={link.athlete_id}
                  onClick={() => toggle(link.athlete_id)}
                  disabled={locked}
                  title={locked ? `Already assigned to "${lockInfo.template_name}". Remove from that template first.` : undefined}
                  style={{
                    display:"flex", alignItems:"center", gap:12,
                    background: bgColor,
                    border: `1px solid ${borderColor}`,
                    borderRadius:14, padding:"13px 16px",
                    cursor: locked ? "not-allowed" : "pointer",
                    textAlign:"left", color:"inherit",
                    opacity: locked ? 0.55 : 1,
                    transition:"background 0.15s, border-color 0.15s",
                  }}
                >
                  {/* Checkbox / lock */}
                  <div style={{
                    width:20, height:20, borderRadius:6, flexShrink:0,
                    background: locked ? "none" : (isSelected ? A : "none"),
                    border: `2px solid ${locked ? MT : (isSelected ? A : SB)}`,
                    display:"flex", alignItems:"center", justifyContent:"center",
                  }}>
                    {locked ? (
                      <svg width="10" height="12" viewBox="0 0 10 12" fill="none">
                        <rect x="1" y="5" width="8" height="6" rx="1" stroke={SB} strokeWidth="1.5"/>
                        <path d="M3 5V3.5a2 2 0 014 0V5" stroke={SB} strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    ) : isSelected && (
                      <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                        <path d="M1 4.5L4 7.5L10 1" stroke={BG} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>

                  {/* Avatar */}
                  <div style={{
                    width:36, height:36, borderRadius:"50%", flexShrink:0,
                    background:`${A}22`, border:`1px solid ${A}33`,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:14, fontWeight:800, color:A,
                  }}>
                    {(link.athlete_name || "A")[0].toUpperCase()}
                  </div>

                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:TX, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                      {link.athlete_name || "Athlete"}
                    </div>
                    {locked ? (
                      <div style={{ fontSize:11, color:SB, marginTop:1, fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                        Assigned to "{lockInfo.template_name}"
                      </div>
                    ) : wasAssigned ? (
                      <div style={{ fontSize:11, color: isSelected ? A : "#ff6666", marginTop:1, fontWeight:600 }}>
                        {isSelected ? "Currently assigned" : "Will be removed"}
                      </div>
                    ) : isSelected ? (
                      <div style={{ fontSize:11, color:"#aadd00", marginTop:1, fontWeight:600 }}>
                        Will be assigned
                      </div>
                    ) : null}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Confirm button */}
        <div style={{ marginTop:20 }}>
          <button
            disabled={noChanges || loading}
            onClick={() => onConfirm(Array.from(selected))}
            style={{
              width:"100%", padding:"15px",
              background: noChanges ? MT : A,
              color: noChanges ? SB : BG,
              border:"none", borderRadius:12, fontSize:15, fontWeight:800,
              cursor: noChanges || loading ? "not-allowed" : "pointer",
              transition:"background 0.15s",
            }}
          >
            {confirmLabel()}
          </button>
        </div>
      </div>
    </div>
  );
}
