import React from "react";
import { Button, Icon, Empty, Spinner, Sheet, Confirm, useToast, useViewport, Avatar } from "../ui/primitives.jsx";
import { shortDate, plural } from "../lib/format.js";
import { useCoachData } from "../data/CoachDataContext.jsx";
import TemplateEditor from "../../components/templates/TemplateEditor.jsx";
import AssignAthletesSheet from "../../components/templates/AssignAthletesSheet.jsx";
import PushUpdateModal from "../../components/templates/PushUpdateModal.jsx";

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Template days → the weekly plan shape used by the client plan and the export. */
export function templateDaysToPlan(days) {
  const out = {};
  for (const d of DAY_ORDER) out[d] = { type: "Rest", exercises: [] };
  for (const d of days || []) {
    const key = DAY_ORDER[d.day_index] || d.label;
    if (!key) continue;
    out[key] = {
      type: d.workout_type || "Rest",
      exercises: (d.exercises || []).map((e) => ({ name: e.exercise_name, sets: e.target_sets, reps: e.target_reps, coachNote: e.notes || undefined })),
    };
  }
  return out;
}

/**
 * The coach's saved plans. Each row: Edit · Export to Excel · Send update ·
 * Give to a client. Editing opens the existing template editor full-screen.
 */
export default function PlansPage({ clients, onExport, onClientsChanged }) {
  const data = useCoachData();
  const toast = useToast();
  const vp = useViewport();
  const [templates, setTemplates] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState(null); // { template, days }
  const [naming, setNaming] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [giving, setGiving] = React.useState(null); // { template, assignedIds, locked }
  const [pushing, setPushing] = React.useState(null); // { template, assignments }
  const [deleting, setDeleting] = React.useState(null);
  const [menuFor, setMenuFor] = React.useState(null);

  const reload = React.useCallback(async () => {
    try { setTemplates(await data.listTemplates()); }
    catch (e) { toast(`Could not load plans: ${e.message}`, "error"); }
    finally { setLoading(false); }
  }, [data, toast]);
  React.useEffect(() => { reload(); }, [reload]);

  async function create() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const t = await data.createTemplate(name);
      setNaming(false); setNewName("");
      setEditing({ template: t, days: [] });
      await reload();
    } catch (e) { toast(e.message || "Could not create plan", "error"); }
    finally { setBusy(false); }
  }

  async function openEditor(t) {
    try { setEditing(await data.getTemplateWithTree(t.id)); }
    catch (e) { toast("Could not open this plan", "error"); }
  }

  async function exportTemplate(t) {
    try {
      const { days } = await data.getTemplateWithTree(t.id);
      onExport({ name: t.name, templates: templateDaysToPlan(days), history: null, subject: "plan" });
    } catch (e) { toast("Could not load this plan", "error"); }
  }

  async function openGive(t) {
    try {
      const [assignments, locked] = await Promise.all([
        data.getTemplateAssignments(t.id),
        data.getActiveAssignmentsForAthletes(clients.map((c) => c.athlete_id)),
      ]);
      const assignedIds = assignments.filter((a) => !a.unassigned_at).map((a) => a.athlete_id);
      const lockedByTemplate = {};
      for (const [aid, info] of Object.entries(locked || {})) if (info.template_id !== t.id) lockedByTemplate[aid] = info;
      setGiving({ template: t, assignedIds, lockedByTemplate });
    } catch (e) { toast("Could not load assignments", "error"); }
  }

  async function confirmGive(selectedIds) {
    const { template, assignedIds } = giving;
    const toAssign = selectedIds.filter((id) => !assignedIds.includes(id));
    const toRemove = assignedIds.filter((id) => !selectedIds.includes(id));
    setBusy(true);
    try {
      if (toAssign.length) {
        const res = await data.assignTemplate(template.id, toAssign);
        if (res.failed?.length) toast(`${res.failed.length} could not be assigned`, "error");
      }
      if (toRemove.length) await data.unassignTemplate(template.id, toRemove);
      onClientsChanged?.([...toAssign, ...toRemove]);
      toast(toAssign.length && toRemove.length ? "Assignments updated" : toAssign.length ? `Plan sent to ${plural(toAssign.length, "client")}` : "Removed from plan");
      setGiving(null);
      await reload();
    } catch (e) { toast(e.message || "Could not update", "error"); }
    finally { setBusy(false); }
  }

  async function openPush(t) {
    try {
      const assignments = (await data.getTemplateAssignments(t.id)).filter((a) => !a.unassigned_at);
      if (assignments.length === 0) { toast("Nobody has this plan yet. Use \"Give to a client\" first."); return; }
      setPushing({ template: t, assignments });
    } catch (e) { toast("Could not load assignments", "error"); }
  }

  async function confirmPush({ athleteIds, force, skipMidWeek }) {
    setBusy(true);
    try {
      const res = await data.pushTemplateUpdate(pushing.template.id, athleteIds, force, skipMidWeek);
      const n = res.succeeded?.length || 0;
      const skipped = (res.skipped_overridden?.length || 0) + (res.skipped_mid_week?.length || 0) + (res.active_session_conflicts?.length || 0);
      onClientsChanged?.(res.succeeded || []);
      toast(skipped ? `Sent to ${n}. ${skipped} skipped (edited by you or mid-workout).` : `Update sent to ${plural(n, "client")}`);
      setPushing(null);
    } catch (e) { toast(e.message || "Could not send update", "error"); }
    finally { setBusy(false); }
  }

  async function duplicate(t) {
    setMenuFor(null);
    try { await data.duplicateTemplate(t.id, `${t.name} (copy)`); toast("Plan duplicated"); await reload(); }
    catch (e) { toast(e.message || "Could not duplicate", "error"); }
  }

  async function confirmDelete() {
    setBusy(true);
    try { await data.softDeleteTemplate(deleting.id); toast("Plan deleted"); setDeleting(null); await reload(); }
    catch (e) { toast(e.message || "Could not delete", "error"); }
    finally { setBusy(false); }
  }

  if (editing) {
    return (
      <TemplateEditor
        template={editing.template}
        initialDays={editing.days}
        myAthletes={clients}
        authUserId={data.coachId}
        onAthletesCacheInvalidate={(ids) => onClientsChanged?.(ids)}
        onBack={async () => { setEditing(null); await reload(); }}
        onSaved={async (newVersion, days) => { setEditing((p) => (p ? { ...p, template: { ...p.template, version: newVersion }, days } : null)); await reload(); }}
        onNameChange={async (name) => { try { await data.updateTemplateName(editing.template.id, name); setEditing((p) => (p ? { ...p, template: { ...p.template, name } } : null)); await reload(); } catch {} }}
      />
    );
  }

  const assignedNames = (t) => clients.filter((c) => t._assigned?.includes(c.athlete_id));

  return (
    <div className="cx-page">
      <div className="cx-page-head">
        <div>
          <h1 className="cx-h1">Your plans</h1>
          <div className="cx-sub">Write a week of workouts once, then give it to any client. Editing a plan does not change clients who already have it until you press Send update.</div>
        </div>
        <Button variant="primary" icon={<Icon.Plus />} onClick={() => setNaming(true)}>New plan</Button>
      </div>

      {loading ? <Spinner label="Loading plans…" /> : templates.length === 0 ? (
        <Empty title="No plans yet" action={<Button variant="primary" icon={<Icon.Plus />} onClick={() => setNaming(true)}>Create your first plan</Button>}>
          A plan is a week of workouts you can give to any client and update for everyone at once.
        </Empty>
      ) : vp !== "laptop" ? (
        <div className="cx-cardgrid cx-cardgrid-1">
          {templates.map((t) => (
            <div key={t.id} className="cx-card cx-plan-card">
              <div className="cx-row" style={{ justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{t.name}</div>
                  <div className="cx-small cx-muted">v{t.version} · {t.assignment_count > 0 ? `${plural(t.assignment_count, "client")} · ` : "Nobody yet · "}changed {shortDate(t.updated_at?.slice(0, 10))}</div>
                </div>
                <RowMenu open={menuFor === t.id} onToggle={() => setMenuFor(menuFor === t.id ? null : t.id)} onDuplicate={() => duplicate(t)} onDelete={() => { setMenuFor(null); setDeleting(t); }} />
              </div>
              <div className="acts">
                <Button size="sm" icon={<Icon.Edit />} onClick={() => openEditor(t)}>Edit</Button>
                <Button size="sm" icon={<Icon.Sheet />} onClick={() => exportTemplate(t)}>Excel</Button>
                <Button size="sm" onClick={() => openPush(t)} disabled={!t.assignment_count}>Send update</Button>
                <Button size="sm" variant="soft" onClick={() => openGive(t)}>Give to a client</Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="cx-card cx-scroll-x">
          <div className="cx-planhead" aria-hidden="true"><div>Plan</div><div>Version</div><div>Who has it</div><div>Last changed</div><div /></div>
          {templates.map((t) => (
            <div key={t.id} className="cx-planrow">
              <div style={{ fontSize: 15, fontWeight: 600 }}>{t.name}</div>
              <div className="cx-small cx-muted">v{t.version}</div>
              <div className="cx-small">{t.assignment_count > 0 ? plural(t.assignment_count, "client") : <span className="cx-muted">Nobody yet</span>}</div>
              <div className="cx-small cx-muted">{shortDate(t.updated_at?.slice(0, 10))}</div>
              <div className="acts">
                <Button size="sm" icon={<Icon.Edit />} onClick={() => openEditor(t)}>Edit</Button>
                <Button size="sm" icon={<Icon.Sheet />} onClick={() => exportTemplate(t)}>Export to Excel</Button>
                <Button size="sm" onClick={() => openPush(t)} disabled={!t.assignment_count} style={t.assignment_count ? { borderColor: "var(--cx-a)", color: "var(--cx-a)" } : undefined}>Send update</Button>
                <Button size="sm" variant="soft" onClick={() => openGive(t)}>Give to a client</Button>
                <RowMenu open={menuFor === t.id} onToggle={() => setMenuFor(menuFor === t.id ? null : t.id)} onDuplicate={() => duplicate(t)} onDelete={() => { setMenuFor(null); setDeleting(t); }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet open={naming} onClose={() => setNaming(false)} title="New plan" subtitle="Give it a name you'll recognise, like PPL Intermediate or Beginner Full Body.">
        <div className="cx-form">
          <input className="cx-input" autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder="Plan name" aria-label="Plan name" />
          <div className="cx-actions-2"><Button onClick={() => setNaming(false)}>Cancel</Button><Button variant="primary" onClick={create} disabled={!newName.trim() || busy}>{busy ? "Creating…" : "Create and edit"}</Button></div>
        </div>
      </Sheet>

      {giving && (
        <AssignAthletesSheet athletes={clients} assignedAthleteIds={giving.assignedIds} lockedByTemplate={giving.lockedByTemplate} templateName={giving.template.name} loading={busy} onConfirm={confirmGive} onClose={() => setGiving(null)} />
      )}
      {pushing && (
        <PushUpdateModal templateName={pushing.template.name} assignments={pushing.assignments.filter((a) => !a.is_overridden)} allAssignments={pushing.assignments} loading={busy} onConfirm={confirmPush} onSkip={() => setPushing(null)}
          heading="Send update" subtitle={`Send the latest version of "${pushing.template.name}" (v${pushing.template.version}) to the clients who have it.`} skipLabel="Not now" skipHint="" />
      )}
      <Confirm open={Boolean(deleting)} title={`Delete "${deleting?.name}"?`} body="Clients who have it keep their current plan but won't get future updates." confirmLabel="Delete" danger busy={busy} onConfirm={confirmDelete} onClose={() => setDeleting(null)} />
    </div>
  );
}

function RowMenu({ open, onToggle, onDuplicate, onDelete }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) onToggle(); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onToggle]);
  return (
    <div style={{ position: "relative" }} ref={ref}>
      <Button size="sm" aria-label="More actions" aria-expanded={open} onClick={onToggle} icon={<span style={{ fontWeight: 700, letterSpacing: 1 }}>···</span>} />
      {open && (
        <div className="cx-card" style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 30, minWidth: 160, overflow: "hidden", boxShadow: "0 12px 32px rgba(0,0,0,0.5)" }}>
          <button type="button" className="cx-ac-item" onClick={onDuplicate}><span className="cx-row"><Icon.Copy /> Duplicate</span></button>
          <button type="button" className="cx-ac-item" onClick={onDelete} style={{ color: "var(--cx-red)" }}><span className="cx-row"><Icon.Trash /> Delete</span></button>
        </div>
      )}
    </div>
  );
}
