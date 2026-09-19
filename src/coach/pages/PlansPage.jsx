import React from "react";
import { Button, Icon, Empty, Spinner, Sheet, Confirm, useToast, useViewport, Avatar } from "../ui/primitives.jsx";
import { shortDate, plural } from "../lib/format.js";
import { useCoachData } from "../data/CoachDataContext.jsx";
import PlanEditor from "./PlanEditor.jsx";
import { templateWeightsMissing } from "../../hooks/useTemplates.ts";
import AssignAthletesSheet from "../../components/templates/AssignAthletesSheet.jsx";
import PushUpdateModal from "../../components/templates/PushUpdateModal.jsx";

// Moved to lib so the data layer can build name-only clients' weeks from a saved plan.
export { templateDaysToPlan } from "../lib/manualTemplates.js";
import { templateDaysToPlan, planToTemplateDays } from "../lib/manualTemplates.js";

/**
 * The coach's saved plans. Each row: Edit plan · Excel · Update clients ·
 * Add clients. Editing opens the same editor as a client's plan, full-screen.
 */
export default function PlansPage({ clients, onExport, onClientsChanged }) {
  const data = useCoachData();
  const toast = useToast();
  const vp = useViewport();
  const [templates, setTemplates] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState(null); // { template, days, plan, clientCount }
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
      setEditing({ template: t, days: [], plan: templateDaysToPlan([]), clientCount: 0 });
      await reload();
    } catch (e) { toast(e.message || "Could not create plan", "error"); }
    finally { setBusy(false); }
  }

  async function openEditor(t) {
    try {
      const { template, days } = await data.getTemplateWithTree(t.id);
      setEditing({ template, days, plan: templateDaysToPlan(days, data.unitSystem), clientCount: t.assignment_count || 0 });
    }
    catch (e) { toast("Could not open this plan", "error"); }
  }

  async function exportTemplate(t) {
    try {
      const { days } = await data.getTemplateWithTree(t.id);
      onExport({ name: t.name, templates: templateDaysToPlan(days, data.unitSystem), history: null, subject: "plan", unit: data.unitSystem === "metric" ? "kg" : "lb" });
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
        if (res.failed?.length) toast(`${res.failed.length} could not be added`, "error");
      }
      if (toRemove.length) await data.unassignTemplate(template.id, toRemove);
      onClientsChanged?.([...toAssign, ...toRemove]);
      toast(toAssign.length && toRemove.length ? "Clients updated" : toAssign.length ? `Added ${plural(toAssign.length, "client")} to the plan` : "Taken off the plan");
      setGiving(null);
      await reload();
    } catch (e) { toast(e.message || "Could not update", "error"); }
    finally { setBusy(false); }
  }

  async function openPush(t) {
    try {
      const assignments = (await data.getTemplateAssignments(t.id)).filter((a) => !a.unassigned_at);
      if (assignments.length === 0) { toast("No clients on this plan yet. Use \"Add clients\" first."); return; }
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
      toast(skipped ? `Updated ${n}. ${skipped} skipped (you edited their plan, or they're mid-workout).` : `Updated ${plural(n, "client")}`);
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

  // Save from the editor, then offer to send it to the clients on the plan.
  async function saveEditing(plan) {
    const { template } = editing;
    const days = planToTemplateDays(plan, data.unitSystem, editing.days);
    const version = await data.saveTemplateTree(template.id, days);
    const saved = { ...template, version };
    setEditing((p) => (p ? { ...p, template: saved, days } : null));
    reload();
    let assignments = [];
    try { assignments = (await data.getTemplateAssignments(template.id)).filter((a) => !a.unassigned_at); } catch { /* the list shows the count anyway */ }
    setEditing((p) => (p ? { ...p, clientCount: assignments.length } : null));
    if (assignments.length) setPushing({ template: saved, assignments });
    if (templateWeightsMissing()) return "Saved. Weights and per-set targets need the database update before they're kept.";
    return assignments.length ? null : "Plan saved";
  }

  async function renameEditing(name) {
    try {
      await data.updateTemplateName(editing.template.id, name);
      setEditing((p) => (p ? { ...p, template: { ...p.template, name } } : null));
      reload();
    } catch (e) { toast(e.message || "Could not rename", "error"); }
  }

  const pushModal = pushing && (
    <PushUpdateModal templateName={pushing.template.name} assignments={pushing.assignments.filter((a) => !a.is_overridden)} allAssignments={pushing.assignments} loading={busy} onConfirm={confirmPush} onSkip={() => setPushing(null)}
      heading="Update clients' plans" subtitle={`Give the clients on "${pushing.template.name}" its latest version (v${pushing.template.version}).`} skipLabel="Not now" skipHint="" />
  );

  if (editing) {
    const unit = data.unitSystem === "metric" ? "kg" : "lb";
    const n = editing.clientCount;
    return (
      <div className="pe-shell">
        <PlanEditor
          key={editing.template.id}
          initialTemplates={editing.plan}
          history={null}
          unit={unit}
          title={editing.template.name}
          status={`v${editing.template.version} · ${n ? plural(n, "client") : "No clients yet"} · weights in ${unit}`}
          onTitleChange={renameEditing}
          onSave={saveEditing}
          onCancel={() => { setEditing(null); reload(); }}
          onSaved={(templates, extra) => { if (extra?.export) onExport({ name: editing.template.name, templates: extra.templates, history: null, subject: "plan", unit }); }}
        />
        {pushModal}
      </div>
    );
  }

  const assignedNames = (t) => clients.filter((c) => t._assigned?.includes(c.athlete_id));

  return (
    <div className="cx-page">
      <div className="cx-page-head">
        <div>
          <h1 className="cx-h1">Your plans</h1>
          <div className="cx-sub">Write a week of workouts once, then give it to any client. Editing a plan doesn't change the clients on it until you press Update clients.</div>
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
                  <div className="cx-small cx-muted">v{t.version} · {t.assignment_count > 0 ? `${plural(t.assignment_count, "client")} · ` : "No clients yet · "}changed {shortDate(t.updated_at?.slice(0, 10))}</div>
                </div>
                <RowMenu open={menuFor === t.id} onToggle={() => setMenuFor(menuFor === t.id ? null : t.id)} onDuplicate={() => duplicate(t)} onDelete={() => { setMenuFor(null); setDeleting(t); }} />
              </div>
              <div className="acts">
                <Button size="sm" icon={<Icon.Edit />} onClick={() => openEditor(t)}>Edit plan</Button>
                <Button size="sm" icon={<Icon.Sheet />} onClick={() => exportTemplate(t)}>Excel</Button>
                <Button size="sm" onClick={() => openPush(t)} disabled={!t.assignment_count}>Update clients</Button>
                <Button size="sm" variant="soft" onClick={() => openGive(t)}>Add clients</Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="cx-card cx-scroll-x">
          <div className="cx-planhead" aria-hidden="true"><div>Plan</div><div>Version</div><div>Clients on it</div><div>Last changed</div><div /></div>
          {templates.map((t) => (
            <div key={t.id} className="cx-planrow">
              <div style={{ fontSize: 15, fontWeight: 600 }}>{t.name}</div>
              <div className="cx-small cx-muted">v{t.version}</div>
              <div className="cx-small">{t.assignment_count > 0 ? plural(t.assignment_count, "client") : <span className="cx-muted">No clients yet</span>}</div>
              <div className="cx-small cx-muted">{shortDate(t.updated_at?.slice(0, 10))}</div>
              <div className="acts">
                <Button size="sm" icon={<Icon.Edit />} onClick={() => openEditor(t)}>Edit plan</Button>
                <Button size="sm" icon={<Icon.Sheet />} onClick={() => exportTemplate(t)}>Export to Excel</Button>
                <Button size="sm" onClick={() => openPush(t)} disabled={!t.assignment_count} style={t.assignment_count ? { borderColor: "var(--cx-a)", color: "var(--cx-a)" } : undefined}>Update clients</Button>
                <Button size="sm" variant="soft" onClick={() => openGive(t)}>Add clients</Button>
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
      {pushModal}
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
