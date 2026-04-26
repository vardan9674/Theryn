import React from "react";
import { A, BG, S1, S2, BD, TX, SB, MT, RED, DAYS, DAY_INDEX, WORKOUT_TYPES, TYPE_COLORS, TYPE_DEFAULTS } from "./tokens.js";
import { saveTemplateTree, getTemplateAssignments, pushTemplateUpdate, getActiveAssignmentsForAthletes } from "../../hooks/useTemplates.ts";
import AssignAthletesSheet from "./AssignAthletesSheet.jsx";
import { unassignTemplate } from "../../hooks/useTemplates.ts";
import PushUpdateModal from "./PushUpdateModal.jsx";
import { assignTemplate } from "../../hooks/useTemplates.ts";
import ExerciseAutocomplete from "./ExerciseAutocomplete.jsx";

/**
 * Full-screen template editor.
 * Props:
 *   template       — RoutineTemplate
 *   initialDays    — TemplateDay[]
 *   myAthletes     — CoachLink[] (accepted athletes for assign flow)
 *   onSaved        — (newVersion: number, days: TemplateDay[]) => void
 *   onBack         — () => void
 *   onNameChange   — (name: string) => void
 */
export default function TemplateEditor({ template, initialDays, myAthletes, onSaved, onBack, onNameChange, onAthletesCacheInvalidate }) {
  const INDEX_TO_DAY = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

  // ── Build working days state ─────────────────────────────────────────────
  const buildInitialDays = () => {
    if (initialDays && initialDays.length > 0) return initialDays;
    // Default: PPL skeleton
    return [
      { day_index:0, workout_type:"Push", label:"Mon", exercises:[
        { exercise_name:"Bench Press", target_sets:3, target_reps:"8-12", sort_order:0 },
        { exercise_name:"Incline DB Press", target_sets:3, target_reps:"10-12", sort_order:1 },
        { exercise_name:"Lateral Raise", target_sets:3, target_reps:"12-15", sort_order:2 },
      ]},
      { day_index:1, workout_type:"Pull", label:"Tue", exercises:[
        { exercise_name:"Deadlift", target_sets:3, target_reps:"5", sort_order:0 },
        { exercise_name:"Barbell Row", target_sets:3, target_reps:"8-10", sort_order:1 },
        { exercise_name:"Lat Pulldown", target_sets:3, target_reps:"10-12", sort_order:2 },
      ]},
      { day_index:6, workout_type:"Rest", label:"Sun", exercises:[] },
    ];
  };

  const [days, setDays] = React.useState(buildInitialDays);
  const [isDirty, setIsDirty] = React.useState(false);
  const [activeDay, setActiveDay] = React.useState(0);
  const [saving, setSaving] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const [showAssign, setShowAssign] = React.useState(false);
  const [showPushModal, setShowPushModal] = React.useState(false);
  const [assignments, setAssignments] = React.useState([]);
  const [assignLoading, setAssignLoading] = React.useState(false);
  const [lockedByTemplate, setLockedByTemplate] = React.useState({});
  const [pushLoading, setPushLoading] = React.useState(false);
  const [pendingSaveVersion, setPendingSaveVersion] = React.useState(null);
  const [editingName, setEditingName] = React.useState(false);
  const [nameValue, setNameValue] = React.useState(template?.name || "");

  // ── Load assignments ─────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!template?.id) return;
    getTemplateAssignments(template.id).then(setAssignments).catch(() => {});
  }, [template?.id]);

  // ── Load cross-template lock map when the assign sheet opens ─────────────
  // Enforces the "1 athlete = 1 template" rule client-side, since the DB
  // unique index is per-(template_id, athlete_id), not per-athlete.
  React.useEffect(() => {
    if (!showAssign) return;
    const ids = (myAthletes || []).map(a => a.athlete_id);
    if (ids.length === 0) { setLockedByTemplate({}); return; }
    getActiveAssignmentsForAthletes(ids)
      .then(map => {
        const filtered = {};
        for (const [athleteId, info] of Object.entries(map)) {
          if (info.template_id !== template?.id) filtered[athleteId] = info;
        }
        setLockedByTemplate(filtered);
      })
      .catch(() => setLockedByTemplate({}));
  }, [showAssign, myAthletes, template?.id]);

  const showToast = (msg, color = A) => {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 2800);
  };

  // ── Get/set current day ──────────────────────────────────────────────────
  const currentDay = days.find(d => d.day_index === activeDay);

  const updateDay = (day_index, patch) => {
    setDays(prev => prev.map(d => d.day_index === day_index ? { ...d, ...patch } : d));
    setIsDirty(true);
  };

  const addDay = () => {
    const usedIndices = new Set(days.map(d => d.day_index));
    const next = [0,1,2,3,4,5,6].find(i => !usedIndices.has(i));
    if (next === undefined) return;
    const label = INDEX_TO_DAY[next];
    setDays(prev => [...prev, { day_index:next, workout_type:"Custom", label, exercises:[] }]);
    setActiveDay(next);
    setIsDirty(true);
  };

  const removeDay = (day_index) => {
    setDays(prev => prev.filter(d => d.day_index !== day_index));
    setActiveDay(days.find(d => d.day_index !== day_index)?.day_index ?? 0);
    setIsDirty(true);
  };

  // ── Exercise mutations ───────────────────────────────────────────────────
  const addExercise = (day_index) => {
    const d = days.find(d => d.day_index === day_index);
    if (!d) return;
    const newEx = {
      exercise_name: "",
      target_sets: 3,
      target_reps: "8-12",
      sort_order: d.exercises.length,
      notes: "",
    };
    updateDay(day_index, { exercises: [...d.exercises, newEx] });
  };

  const updateExercise = (day_index, idx, patch) => {
    const d = days.find(d => d.day_index === day_index);
    if (!d) return;
    const updated = d.exercises.map((e, i) => i === idx ? { ...e, ...patch } : e);
    updateDay(day_index, { exercises: updated });
  };

  const removeExercise = (day_index, idx) => {
    const d = days.find(d => d.day_index === day_index);
    if (!d) return;
    updateDay(day_index, { exercises: d.exercises.filter((_, i) => i !== idx) });
  };

  const applyTypeDefaults = (day_index, type) => {
    const defaults = (TYPE_DEFAULTS[type] || []).map((name, i) => ({
      exercise_name: name, target_sets:3, target_reps:"8-12", sort_order:i, notes:"",
    }));
    updateDay(day_index, { workout_type:type, exercises:defaults });
  };

  // ── Save ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!template?.id) return;
    setSaving(true);
    try {
      const newVersion = await saveTemplateTree(template.id, days);
      setIsDirty(false);
      setPendingSaveVersion(newVersion);

      // Reload assignments count
      const freshAssignments = await getTemplateAssignments(template.id);
      setAssignments(freshAssignments);

      if (freshAssignments.length > 0) {
        setShowPushModal(true);
      } else {
        showToast(`Saved — v${newVersion}`);
        onSaved?.(newVersion, days);
      }
    } catch (e) {
      showToast(e.message || "Save failed", RED);
    } finally {
      setSaving(false);
    }
  }

  // ── Push after save ──────────────────────────────────────────────────────
  async function handlePushConfirm({ athleteIds, force, skipMidWeek }) {
    if (!template?.id || !pendingSaveVersion) return;
    setPushLoading(true);
    try {
      const result = await pushTemplateUpdate(template.id, athleteIds, { force, skipMidWeek });
      setShowPushModal(false);
      // Bust the coach's cached view for every successfully updated athlete
      if (result.succeeded?.length) onAthletesCacheInvalidate?.(result.succeeded);
      const total      = result.succeeded?.length || 0;
      const midWeek    = result.skipped_mid_week?.length || 0;
      const overridden = result.skipped_overridden?.length || 0;
      const conflicts  = result.active_session_conflicts?.length || 0;

      const parts = [];
      if (total > 0)      parts.push(`Updated ${total}`);
      if (midWeek > 0)    parts.push(`${midWeek} skipped (mid-week)`);
      if (overridden > 0) parts.push(`${overridden} skipped (customized)`);
      if (conflicts > 0)  parts.push(`${conflicts} mid-session`);
      if (parts.length === 0) parts.push("No athletes updated");
      showToast(parts.join(" · "));
      onSaved?.(pendingSaveVersion, days);
    } catch (e) {
      showToast(e.message || "Push failed", RED);
    } finally {
      setPushLoading(false);
    }
  }

  // ── Assign / unassign ────────────────────────────────────────────────────
  async function handleAssignConfirm(selectedIds) {
    if (!template?.id) return;
    setAssignLoading(true);
    try {
      // Only save (and bump version) if there are unsaved changes
      if (isDirty) {
        await saveTemplateTree(template.id, days);
        setIsDirty(false);
      }

      const currentlyAssigned = new Set(assignments.map(a => a.athlete_id));
      const newSelected       = new Set(selectedIds);

      // Athletes to assign: newly checked
      const toAssign   = selectedIds.filter(id => !currentlyAssigned.has(id));
      // Athletes to remove: previously assigned but now unchecked
      const toUnassign = [...currentlyAssigned].filter(id => !newSelected.has(id));

      let assignedCount = 0, removedCount = 0, failedReasons = [];

      if (toAssign.length > 0) {
        const result = await assignTemplate(template.id, toAssign);
        console.log("[assign_template result]", JSON.stringify(result, null, 2));
        assignedCount = result.succeeded?.length || 0;
        if (result.succeeded?.length) onAthletesCacheInvalidate?.(result.succeeded);
        failedReasons = (result.failed || []).map(f => f.reason);
      }

      if (toUnassign.length > 0) {
        await unassignTemplate(template.id, toUnassign);
        removedCount = toUnassign.length;
        onAthletesCacheInvalidate?.(toUnassign);
      }

      setShowAssign(false);

      const parts = [];
      if (assignedCount > 0) parts.push(`Assigned ${assignedCount}`);
      if (removedCount > 0)  parts.push(`Removed ${removedCount}`);
      if (failedReasons.length > 0) parts.push(`${failedReasons.length} failed: ${failedReasons[0]}`);
      showToast(parts.length > 0 ? parts.join(" · ") : "No changes made", parts.length > 0 ? A : RED);

      const fresh = await getTemplateAssignments(template.id);
      setAssignments(fresh);
    } catch (e) {
      showToast(e.message || "Assign failed", RED);
    } finally {
      setAssignLoading(false);
    }
  }

  const sortedDays = [...days].sort((a,b) => a.day_index - b.day_index);

  return (
    <div style={{ position:"fixed", inset:0, zIndex:200, background:BG, display:"flex", flexDirection:"column", overflowY:"auto" }}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{
        padding:"20px 16px 16px",
        borderBottom:`1px solid ${BD}`,
        display:"flex", alignItems:"center", gap:12,
        position:"sticky", top:0, background:BG, zIndex:10,
      }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:SB, fontSize:22, cursor:"pointer", padding:0, lineHeight:1, flexShrink:0 }}>←</button>

        {/* Editable template name */}
        <div style={{ flex:1, minWidth:0 }}>
          {editingName ? (
            <input
              autoFocus
              value={nameValue}
              onChange={e => setNameValue(e.target.value)}
              onBlur={() => { setEditingName(false); if (nameValue.trim()) onNameChange?.(nameValue.trim()); }}
              onKeyDown={e => { if (e.key === "Enter") { setEditingName(false); if (nameValue.trim()) onNameChange?.(nameValue.trim()); } }}
              style={{ width:"100%", background:S2, border:`1px solid ${A}55`, borderRadius:8, padding:"6px 10px", color:TX, fontSize:16, fontWeight:800, outline:"none", boxSizing:"border-box" }}
            />
          ) : (
            <button
              onClick={() => { setNameValue(template?.name || ""); setEditingName(true); }}
              style={{ background:"none", border:"none", padding:0, cursor:"pointer", display:"flex", alignItems:"center", gap:6, maxWidth:"100%" }}
            >
              <div style={{ fontSize:17, fontWeight:800, color:TX, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                {template?.name || "Untitled Template"}
              </div>
              <span style={{ fontSize:12, color:A }}>✎</span>
            </button>
          )}
          <div style={{ fontSize:11, color:SB, marginTop:1 }}>
            v{template?.version || 1} · Assigned to {assignments.length} athlete{assignments.length !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display:"flex", gap:8, flexShrink:0 }}>
          <button
            onClick={() => setShowAssign(true)}
            style={{ padding:"8px 14px", background:S2, border:`1px solid ${BD}`, borderRadius:10, color:A, fontSize:13, fontWeight:700, cursor:"pointer" }}
          >
            {assignments.length > 0 ? `Athletes (${assignments.length})` : "Assign"}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ padding:"8px 16px", background:saving ? MT : A, border:"none", borderRadius:10, color:saving ? SB : BG, fontSize:13, fontWeight:800, cursor:saving ? "wait":"pointer" }}
          >
            {saving ? "…" : "Save"}
          </button>
        </div>
      </div>

      {/* ── Day tabs ─────────────────────────────────────────────────────── */}
      <div style={{ padding:"12px 16px 0", borderBottom:`1px solid ${BD}` }}>
        <div style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:12 }}>
          {sortedDays.map(d => {
            const isActive = d.day_index === activeDay;
            const color = TYPE_COLORS[d.workout_type] || A;
            return (
              <button key={d.day_index} onClick={() => setActiveDay(d.day_index)} style={{
                padding:"7px 14px", borderRadius:20, border:"none", cursor:"pointer", flexShrink:0,
                fontSize:12, fontWeight:700,
                background: isActive ? color : S2,
                color: isActive ? BG : (d.workout_type === "Rest" ? SB : TX),
              }}>
                {INDEX_TO_DAY[d.day_index]}
              </button>
            );
          })}
          {days.length < 7 && (
            <button onClick={addDay} style={{
              padding:"7px 14px", borderRadius:20, border:`1px dashed ${BD}`, cursor:"pointer",
              flexShrink:0, fontSize:12, fontWeight:700, background:"none", color:SB,
            }}>
              + Day
            </button>
          )}
        </div>
      </div>

      {/* ── Day editor ───────────────────────────────────────────────────── */}
      {currentDay ? (
        <div style={{ padding:"16px 16px 100px", flex:1 }}>
          {/* Workout type picker */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:10, color:SB, letterSpacing:"0.08em", fontWeight:700, textTransform:"uppercase", marginBottom:8 }}>
              Workout Type
            </div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {WORKOUT_TYPES.map(t => (
                <button key={t} onClick={() => applyTypeDefaults(currentDay.day_index, t)} style={{
                  padding:"6px 12px", borderRadius:16, border:"none", cursor:"pointer",
                  fontSize:12, fontWeight:600,
                  background: currentDay.workout_type === t ? (TYPE_COLORS[t] || A) : S2,
                  color: currentDay.workout_type === t ? BG : SB,
                }}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Remove day button */}
          {days.length > 1 && (
            <button
              onClick={() => removeDay(currentDay.day_index)}
              style={{ marginBottom:16, background:"none", border:`1px solid ${RED}33`, borderRadius:8, padding:"5px 12px", color:RED, fontSize:12, cursor:"pointer" }}
            >
              Remove {INDEX_TO_DAY[currentDay.day_index]}
            </button>
          )}

          {/* Exercises */}
          {currentDay.workout_type !== "Rest" && (
            <>
              <div style={{ fontSize:10, color:SB, letterSpacing:"0.08em", fontWeight:700, textTransform:"uppercase", marginBottom:10 }}>
                Exercises
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {currentDay.exercises.map((ex, idx) => (
                  <ExerciseRow
                    key={idx}
                    ex={ex}
                    idx={idx}
                    userId={template?.owner_coach_id}
                    onChange={patch => updateExercise(currentDay.day_index, idx, patch)}
                    onRemove={() => removeExercise(currentDay.day_index, idx)}
                  />
                ))}
              </div>
              <button
                onClick={() => addExercise(currentDay.day_index)}
                style={{
                  marginTop:12, width:"100%", padding:"13px",
                  background:"none", border:`1px dashed ${A}55`,
                  borderRadius:12, color:A, fontSize:14, fontWeight:700,
                  cursor:"pointer",
                }}
              >
                + Add Exercise
              </button>
            </>
          )}

          {currentDay.workout_type === "Rest" && (
            <div style={{ textAlign:"center", color:SB, padding:"40px 0", fontSize:14 }}>
              Rest day 😴 — no exercises needed
            </div>
          )}
        </div>
      ) : (
        <div style={{ textAlign:"center", color:SB, padding:"60px 0", fontSize:14 }}>
          No day selected. Add a day above.
        </div>
      )}

      {/* ── Toast ────────────────────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position:"fixed", left:"50%", bottom:90, transform:"translateX(-50%)",
          background:toast.color || A, color:BG,
          padding:"10px 18px", borderRadius:10, fontSize:13, fontWeight:700,
          zIndex:400, boxShadow:"0 8px 24px rgba(0,0,0,0.4)",
          animation:"fadeIn 0.2s ease",
          whiteSpace:"nowrap",
        }}>
          {toast.msg}
        </div>
      )}

      {/* ── Assign sheet ─────────────────────────────────────────────────── */}
      {showAssign && (
        <AssignAthletesSheet
          athletes={myAthletes || []}
          assignedAthleteIds={assignments.map(a => a.athlete_id)}
          lockedByTemplate={lockedByTemplate}
          templateName={template?.name || ""}
          onConfirm={handleAssignConfirm}
          onClose={() => setShowAssign(false)}
          loading={assignLoading}
        />
      )}

      {/* ── Push modal ───────────────────────────────────────────────────── */}
      {showPushModal && (
        <PushUpdateModal
          templateName={template?.name || ""}
          allAssignments={assignments}
          assignments={assignments.filter(a => !a.is_overridden)}
          onConfirm={handlePushConfirm}
          onSkip={() => { setShowPushModal(false); onSaved?.(pendingSaveVersion, days); }}
          loading={pushLoading}
        />
      )}
    </div>
  );
}

// ── Exercise Row sub-component ───────────────────────────────────────────────
function ExerciseRow({ ex, idx, userId, onChange, onRemove }) {
  const [expanded, setExpanded] = React.useState(!ex.exercise_name);

  return (
    <div style={{ background:S2, borderRadius:14, border:`1px solid ${BD}`, overflow:"hidden" }}>
      {/* Collapsed header */}
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 14px" }}>
        <div style={{
          width:26, height:26, borderRadius:8, background:`${A}15`,
          display:"flex", alignItems:"center", justifyContent:"center",
          flexShrink:0, fontSize:11, fontWeight:800, color:A,
        }}>
          {idx + 1}
        </div>

        <ExerciseAutocomplete
          value={ex.exercise_name}
          sourceExerciseId={ex.source_exercise_id}
          sourceUserExerciseId={ex.source_user_exercise_id}
          userId={userId}
          onChange={onChange}
        />

        <button
          onClick={() => setExpanded(p => !p)}
          style={{ background:"none", border:"none", color:SB, fontSize:16, cursor:"pointer", padding:"0 4px" }}
        >
          {expanded ? "▲" : "▼"}
        </button>
        <button
          onClick={onRemove}
          style={{ background:"none", border:"none", color:RED, fontSize:16, cursor:"pointer", padding:"0 4px", lineHeight:1 }}
        >
          ×
        </button>
      </div>

      {/* Expanded: sets / reps / notes */}
      {expanded && (
        <div style={{ padding:"0 14px 14px", borderTop:`1px solid ${BD}` }}>
          <div style={{ display:"flex", gap:10, marginTop:12 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:10, color:SB, letterSpacing:"0.06em", marginBottom:4, fontWeight:700, textTransform:"uppercase" }}>Sets</div>
              <input
                type="number"
                value={ex.target_sets}
                min={1} max={20}
                onChange={e => onChange({ target_sets: parseInt(e.target.value) || 3 })}
                style={{ width:"100%", background:S1, border:`1px solid ${BD}`, borderRadius:8, padding:"8px 10px", color:TX, fontSize:14, boxSizing:"border-box", outline:"none" }}
              />
            </div>
            <div style={{ flex:2 }}>
              <div style={{ fontSize:10, color:SB, letterSpacing:"0.06em", marginBottom:4, fontWeight:700, textTransform:"uppercase" }}>Reps / Duration</div>
              <input
                value={ex.target_reps}
                onChange={e => onChange({ target_reps: e.target.value })}
                placeholder="8-12 / 30s / AMRAP"
                style={{ width:"100%", background:S1, border:`1px solid ${BD}`, borderRadius:8, padding:"8px 10px", color:TX, fontSize:14, boxSizing:"border-box", outline:"none" }}
              />
            </div>
          </div>

          <div style={{ marginTop:10 }}>
            <div style={{ fontSize:10, color:SB, letterSpacing:"0.06em", marginBottom:4, fontWeight:700, textTransform:"uppercase" }}>
              Coach Note (optional)
            </div>
            <textarea
              value={ex.notes || ""}
              onChange={e => onChange({ notes: e.target.value })}
              placeholder="e.g. Slow down on the eccentric, 2s down…"
              rows={2}
              style={{
                width:"100%", background:S1, border:`1px solid ${BD}`, borderRadius:8,
                padding:"8px 10px", color:TX, fontSize:13, resize:"vertical",
                boxSizing:"border-box", outline:"none", fontFamily:"inherit", lineHeight:1.5,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
