import React from "react";
import { A, BG, S1, S2, BD, TX, SB, MT, RED } from "./tokens.js";

/**
 * Modal shown when coach saves a template that has active assignments.
 * Asks: who gets the push, and should we skip mid-week athletes?
 *
 * Props:
 *   templateName  — string
 *   assignments   — TemplateAssignment[] (active, non-overridden)
 *   allAssignments — TemplateAssignment[] (all active including overridden)
 *   onConfirm     — ({ athleteIds: string[] | null, force: bool, skipMidWeek: bool }) => void
 *   onSkip        — () => void  (no push this time)
 *   loading       — bool
 */
export default function PushUpdateModal({
  templateName,
  assignments,
  allAssignments,
  onConfirm,
  onSkip,
  loading,
}) {
  const [pushMode, setPushMode] = React.useState("none"); // "none" | "all" | "choose"
  const [chosen, setChosen] = React.useState(new Set());
  const [skipMidWeek, setSkipMidWeek] = React.useState(true);

  const nonOverridden = (allAssignments || []).filter(a => !a.is_overridden);
  const overridden    = (allAssignments || []).filter(a => a.is_overridden);
  const totalCount    = (allAssignments || []).length;

  const toggleChosen = (id) => {
    setChosen(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  function handleConfirm() {
    if (pushMode === "none") { onSkip(); return; }
    const force = false;
    let athleteIds = null;

    if (pushMode === "all") {
      athleteIds = null; // server pushes all non-overridden
    } else if (pushMode === "choose") {
      athleteIds = Array.from(chosen);
      if (athleteIds.length === 0) { onSkip(); return; }
    }
    onConfirm({ athleteIds, force, skipMidWeek });
  }

  const modeLabel = {
    none:   "Save only (no push)",
    all:    `All assigned (${totalCount})`,
    choose: "Choose athletes…",
  };

  return (
    <div
      style={{ position:"fixed", inset:0, zIndex:310, background:"rgba(0,0,0,0.75)", display:"flex", alignItems:"flex-end", justifyContent:"center" }}
      onClick={onSkip}
    >
      <div
        style={{
          width:"100%", maxWidth:480,
          background:S1, borderRadius:"20px 20px 0 0",
          padding:"24px 20px 40px",
          animation:"drawerUp 0.22s cubic-bezier(0.2,0.8,0.2,1)",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ width:36, height:4, borderRadius:2, background:MT, margin:"0 auto 20px" }}/>

        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:18, fontWeight:800, color:TX, letterSpacing:"-0.01em" }}>
            Template saved ✓
          </div>
          <div style={{ fontSize:12, color:SB, marginTop:3 }}>
            "{templateName}" — v{/* version shown by parent */}. Push changes to assigned athletes?
          </div>
        </div>

        {/* Push mode selector */}
        <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:16 }}>
          {["none","all","choose"].map(mode => (
            <button
              key={mode}
              onClick={() => setPushMode(mode)}
              style={{
                display:"flex", alignItems:"center", gap:12,
                background: pushMode === mode ? `${A}12` : S2,
                border: `1px solid ${pushMode === mode ? A+"55" : BD}`,
                borderRadius:12, padding:"13px 16px",
                cursor:"pointer", textAlign:"left", color:"inherit",
              }}
            >
              <div style={{
                width:18, height:18, borderRadius:"50%", flexShrink:0,
                border: `2px solid ${pushMode === mode ? A : SB}`,
                display:"flex", alignItems:"center", justifyContent:"center",
              }}>
                {pushMode === mode && (
                  <div style={{ width:8, height:8, borderRadius:"50%", background:A }}/>
                )}
              </div>
              <div>
                <div style={{ fontSize:14, fontWeight:700, color: pushMode === mode ? TX : SB }}>
                  {modeLabel[mode]}
                </div>
                {mode === "none" && (
                  <div style={{ fontSize:11, color:SB, marginTop:1 }}>New assignments will get the latest version</div>
                )}
                {mode === "all" && overridden.length > 0 && (
                  <div style={{ fontSize:11, color:SB, marginTop:1 }}>
                    {overridden.length} customized athlete{overridden.length !== 1 ? "s" : ""} will be skipped
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Choose athletes sub-list */}
        {pushMode === "choose" && (
          <div style={{
            background:S2, borderRadius:12, border:`1px solid ${BD}`,
            padding:12, marginBottom:12,
            maxHeight:200, overflowY:"auto",
          }}>
            {(allAssignments || []).map(a => (
              <button
                key={a.athlete_id}
                onClick={() => toggleChosen(a.athlete_id)}
                style={{
                  display:"flex", alignItems:"center", gap:10,
                  width:"100%", background:"none", border:"none",
                  padding:"8px 4px", cursor:"pointer", color:"inherit",
                }}
              >
                <div style={{
                  width:18, height:18, borderRadius:5, flexShrink:0,
                  background: chosen.has(a.athlete_id) ? A : "none",
                  border: `2px solid ${chosen.has(a.athlete_id) ? A : SB}`,
                  display:"flex", alignItems:"center", justifyContent:"center",
                }}>
                  {chosen.has(a.athlete_id) && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 7L9 1" stroke={BG} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <div style={{ flex:1, fontSize:13, color:TX, textAlign:"left" }}>
                  {a.athlete_name || "Athlete"}
                </div>
                {a.is_overridden && (
                  <span style={{ fontSize:10, background:`${A}18`, color:A, borderRadius:4, padding:"2px 6px", fontWeight:700 }}>
                    Customized
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Skip mid-week toggle */}
        {pushMode !== "none" && (
          <button
            onClick={() => setSkipMidWeek(p => !p)}
            style={{
              display:"flex", alignItems:"center", gap:10,
              width:"100%", background:S2, border:`1px solid ${BD}`,
              borderRadius:12, padding:"12px 14px", cursor:"pointer",
              color:"inherit", marginBottom:16,
            }}
          >
            {/* Toggle pill */}
            <div style={{
              width:36, height:20, borderRadius:10, flexShrink:0,
              background: skipMidWeek ? A : MT,
              position:"relative", transition:"background 0.2s",
            }}>
              <div style={{
                position:"absolute", top:2,
                left: skipMidWeek ? 18 : 2,
                width:16, height:16, borderRadius:"50%",
                background: skipMidWeek ? BG : SB,
                transition:"left 0.2s",
              }}/>
            </div>
            <div style={{ textAlign:"left" }}>
              <div style={{ fontSize:13, fontWeight:700, color:TX }}>Skip clients who started this week</div>
              <div style={{ fontSize:11, color:SB, marginTop:1 }}>
                Logged a workout since Monday — safe default
              </div>
            </div>
          </button>
        )}

        {/* Confirm */}
        <button
          disabled={loading || (pushMode === "choose" && chosen.size === 0)}
          onClick={handleConfirm}
          style={{
            width:"100%", padding:15,
            background: pushMode === "none" ? MT : A,
            color: pushMode === "none" ? SB : BG,
            border:"none", borderRadius:12, fontSize:15, fontWeight:800,
            cursor: loading ? "wait" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading
            ? "Pushing…"
            : pushMode === "none"
            ? "Save only"
            : pushMode === "choose"
            ? `Push to ${chosen.size} athlete${chosen.size !== 1 ? "s" : ""}`
            : `Push to all (${totalCount})`}
        </button>
      </div>
    </div>
  );
}
