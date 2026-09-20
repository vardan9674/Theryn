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
    // Say what to do, so the button never reads as "there is nothing here".
    if (noChanges) return assignedAthleteIds.length > 0 ? "Tick a client to add" : "Tick the clients to add";
    const parts = [];
    if (toAssign > 0) parts.push(`Add ${toAssign} client${toAssign !== 1 ? "s" : ""}`);
    if (toRemove > 0) parts.push(`Take off ${toRemove}`);
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
          padding:"24px 20px calc(16px + env(safe-area-inset-bottom, 0px))",
          animation:"drawerUpCentered 0.25s cubic-bezier(0.2,0.8,0.2,1)",
          // dvh, not vh: on iPhone Safari vh ignores the toolbar, which pushed
          // the button off the bottom of the screen.
          maxHeight:"85dvh", display:"flex", flexDirection:"column",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle + header */}
        <div style={{ width:36, height:4, borderRadius:2, background:MT, margin:"0 auto 20px" }}/>
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:18, fontWeight:800, color:TX, letterSpacing:"-0.01em" }}>
            Add clients to this plan
          </div>
          <div style={{ fontSize:12, color:SB, marginTop:3 }}>
            "{templateName}" · tick to add, untick to take off
          </div>
        </div>

        {/* Select-all bar */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <div style={{ fontSize:12, color:SB }}>
            {selected.size} of {selectableAthletes.length} on this plan
            {lockedCount > 0 && ` · ${lockedCount} on another plan`}
          </div>
          <button
            onClick={allSelected ? clearAll : selectAll}
            disabled={selectableAthletes.length === 0}
            style={{ background:"none", border:`1px solid ${BD}`, borderRadius:8, padding:"5px 12px", color:A, fontSize:12, fontWeight:700, cursor: selectableAthletes.length === 0 ? "not-allowed" : "pointer", opacity: selectableAthletes.length === 0 ? 0.5 : 1 }}
          >
            {allSelected ? "Untick all" : "Tick all"}
          </button>
        </div>

        {/* Athlete list */}
        <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column", gap:8 }}>
          {athletes.length === 0 ? (
            <div style={{ textAlign:"center", color:SB, padding:"32px 0", fontSize:14 }}>
              No clients yet. Add one from the Clients page.
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
                  title={locked ? `Already on "${lockInfo.template_name}". Take them off that plan first.` : undefined}
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
                      {link.athlete_name || "Client"}
                      {link.manual && <span style={{ fontSize:11, fontWeight:600, color:SB, marginLeft:8 }}>· Not on app, gets it through their link</span>}
                    </div>
                    {locked ? (
                      <div style={{ fontSize:11, color:SB, marginTop:1, fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                        On "{lockInfo.template_name}"
                      </div>
                    ) : wasAssigned ? (
                      <div style={{ fontSize:11, color: isSelected ? A : "#ff6666", marginTop:1, fontWeight:600 }}>
                        {isSelected ? "On this plan" : "Will be taken off"}
                      </div>
                    ) : isSelected ? (
                      <div style={{ fontSize:11, color:"#aadd00", marginTop:1, fontWeight:600 }}>
                        Will be added
                      </div>
                    ) : null}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Confirm button: stays in view, whatever the list does */}
        <div style={{ marginTop:16, flexShrink:0 }}>
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
