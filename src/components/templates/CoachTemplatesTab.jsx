import React from "react";
import { A, BG, S1, S2, BD, TX, SB, MT, RED, TYPE_COLORS } from "./tokens.js";
import {
  listTemplates,
  createTemplate,
  getTemplateWithTree,
  updateTemplateName,
  softDeleteTemplate,
  duplicateTemplate,
} from "../../hooks/useTemplates.ts";
import TemplateEditor from "./TemplateEditor.jsx";

/**
 * Top-level Templates tab for the coach.
 * Props:
 *   authUser   — current coach user
 *   myAthletes — CoachLink[] (accepted)
 */
export default function CoachTemplatesTab({ authUser, myAthletes }) {
  const [templates, setTemplates]     = React.useState([]);
  const [loading, setLoading]         = React.useState(true);
  const [creating, setCreating]       = React.useState(false);
  const [newName, setNewName]         = React.useState("");
  const [showCreate, setShowCreate]   = React.useState(false);
  const [editingTemplate, setEditingTemplate] = React.useState(null); // { template, days }
  const [toast, setToast]             = React.useState(null);
  const [menuOpen, setMenuOpen]       = React.useState(null); // template id with open overflow menu

  const coachId = authUser?.id;

  const showToast = (msg, color = A) => {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 2600);
  };

  // ── Load templates ────────────────────────────────────────────────────────
  const loadTemplates = React.useCallback(async () => {
    if (!coachId) return;
    setLoading(true);
    try {
      const data = await listTemplates(coachId);
      setTemplates(data);
    } catch (e) {
      console.error("loadTemplates:", e.message);
    } finally {
      setLoading(false);
    }
  }, [coachId]);

  React.useEffect(() => { loadTemplates(); }, [loadTemplates]);

  // ── Create new template ───────────────────────────────────────────────────
  async function handleCreate() {
    const name = newName.trim();
    if (!name || !coachId) return;
    setCreating(true);
    try {
      const tmpl = await createTemplate(coachId, name);
      setNewName("");
      setShowCreate(false);
      // Open editor immediately with empty days
      setEditingTemplate({ template: tmpl, days: [] });
      await loadTemplates();
    } catch (e) {
      showToast(e.message || "Failed to create", RED);
    } finally {
      setCreating(false);
    }
  }

  // ── Open template for editing ─────────────────────────────────────────────
  async function openEditor(tmpl) {
    try {
      const { template, days } = await getTemplateWithTree(tmpl.id);
      setEditingTemplate({ template, days });
    } catch (e) {
      showToast("Failed to load template", RED);
    }
  }

  // ── Delete template ───────────────────────────────────────────────────────
  async function handleDelete(templateId) {
    if (!window.confirm("Delete this template? Assigned athletes will keep their current routine but won't receive future updates.")) return;
    try {
      await softDeleteTemplate(templateId);
      setTemplates(prev => prev.filter(t => t.id !== templateId));
      setMenuOpen(null);
      showToast("Template deleted");
    } catch (e) {
      showToast(e.message || "Delete failed", RED);
    }
  }

  // ── Duplicate template ────────────────────────────────────────────────────
  async function handleDuplicate(tmpl) {
    try {
      const copy = await duplicateTemplate(tmpl.id, `${tmpl.name} (copy)`, coachId);
      showToast("Template duplicated");
      setMenuOpen(null);
      await loadTemplates();
      const { template, days } = await getTemplateWithTree(copy.id);
      setEditingTemplate({ template, days });
    } catch (e) {
      showToast(e.message || "Duplicate failed", RED);
    }
  }

  // ── If editing, show full-screen editor ──────────────────────────────────
  if (editingTemplate) {
    return (
      <TemplateEditor
        template={editingTemplate.template}
        initialDays={editingTemplate.days}
        myAthletes={myAthletes}
        onBack={async () => { setEditingTemplate(null); await loadTemplates(); }}
        onSaved={async (newVersion, days) => {
          setEditingTemplate(prev => prev ? {
            ...prev,
            template: { ...prev.template, version: newVersion },
            days,
          } : null);
          await loadTemplates();
        }}
        onNameChange={async (name) => {
          try {
            await updateTemplateName(editingTemplate.template.id, name);
            setEditingTemplate(prev => prev ? { ...prev, template: { ...prev.template, name } } : null);
            await loadTemplates();
          } catch {}
        }}
      />
    );
  }

  // ── Library view ─────────────────────────────────────────────────────────
  return (
    <div style={{ padding:"20px 16px 100px" }}>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
        <div>
          <div style={{ fontSize:20, fontWeight:800, color:TX, letterSpacing:"-0.02em" }}>Templates</div>
          <div style={{ fontSize:12, color:SB, marginTop:2 }}>Your routine library</div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{ padding:"10px 16px", background:A, border:"none", borderRadius:12, color:BG, fontSize:13, fontWeight:800, cursor:"pointer" }}
        >
          + New Template
        </button>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div style={{ position:"fixed", inset:0, zIndex:250, background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"flex-end", justifyContent:"center" }}
          onClick={() => setShowCreate(false)}>
          <div style={{
            width:"100%", maxWidth:480, background:S1,
            borderRadius:"20px 20px 0 0", padding:"28px 20px 40px",
            animation:"drawerUp 0.22s cubic-bezier(0.2,0.8,0.2,1)",
          }} onClick={e => e.stopPropagation()}>
            <div style={{ width:36, height:4, borderRadius:2, background:MT, margin:"0 auto 20px" }}/>
            <div style={{ fontSize:17, fontWeight:800, color:TX, marginBottom:16 }}>New Template</div>
            <div style={{ fontSize:11, color:SB, letterSpacing:"0.06em", fontWeight:700, textTransform:"uppercase", marginBottom:6 }}>
              Give it a name
            </div>
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreate()}
              placeholder="e.g. PPL 6-Day, Beginner Full Body…"
              style={{
                width:"100%", background:S2, border:`1px solid ${BD}`, borderRadius:10,
                padding:"13px 14px", color:TX, fontSize:15, outline:"none",
                boxSizing:"border-box", marginBottom:14, fontFamily:"inherit",
              }}
            />
            <button
              disabled={!newName.trim() || creating}
              onClick={handleCreate}
              style={{
                width:"100%", padding:14,
                background: newName.trim() ? A : MT,
                color: newName.trim() ? BG : SB,
                border:"none", borderRadius:12, fontSize:15, fontWeight:800,
                cursor: newName.trim() && !creating ? "pointer" : "not-allowed",
              }}
            >
              {creating ? "Creating…" : "Create & Edit →"}
            </button>
          </div>
        </div>
      )}

      {/* Template list */}
      {loading ? (
        <div style={{ textAlign:"center", padding:"60px 0", color:SB }}>
          <div style={{ width:28, height:28, borderRadius:"50%", border:`3px solid ${MT}`, borderTopColor:A, animation:"spin 0.8s linear infinite", margin:"0 auto 12px" }}/>
          Loading templates…
        </div>
      ) : templates.length === 0 ? (
        <EmptyState onNew={() => setShowCreate(true)} />
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {templates.map(tmpl => (
            <TemplateCard
              key={tmpl.id}
              tmpl={tmpl}
              menuOpen={menuOpen === tmpl.id}
              onOpen={() => openEditor(tmpl)}
              onMenuToggle={() => setMenuOpen(prev => prev === tmpl.id ? null : tmpl.id)}
              onDuplicate={() => handleDuplicate(tmpl)}
              onDelete={() => handleDelete(tmpl.id)}
            />
          ))}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position:"fixed", left:"50%", bottom:90, transform:"translateX(-50%)",
          background:toast.color, color:BG, padding:"10px 18px",
          borderRadius:10, fontSize:13, fontWeight:700,
          zIndex:400, boxShadow:"0 8px 24px rgba(0,0,0,0.4)",
          animation:"fadeIn 0.2s ease", whiteSpace:"nowrap",
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ── Template card ────────────────────────────────────────────────────────────
function TemplateCard({ tmpl, menuOpen, onOpen, onMenuToggle, onDuplicate, onDelete }) {
  return (
    <div style={{
      background:S2, borderRadius:16, border:`1px solid ${BD}`,
      padding:"16px", position:"relative",
    }}>
      <div style={{ display:"flex", alignItems:"flex-start", gap:12 }}>
        {/* Tap area */}
        <button onClick={onOpen} style={{ flex:1, background:"none", border:"none", padding:0, cursor:"pointer", textAlign:"left", color:"inherit" }}>
          <div style={{ fontSize:15, fontWeight:800, color:TX, marginBottom:4 }}>{tmpl.name}</div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            <span style={{ fontSize:11, color:SB }}>v{tmpl.version}</span>
            <span style={{ fontSize:11, color:SB }}>·</span>
            <span style={{ fontSize:11, color: tmpl.assignment_count > 0 ? A : SB }}>
              {tmpl.assignment_count > 0 ? `${tmpl.assignment_count} athlete${tmpl.assignment_count !== 1 ? "s" : ""}` : "Not assigned"}
            </span>
          </div>
        </button>

        {/* Overflow menu */}
        <div style={{ position:"relative" }}>
          <button
            onClick={e => { e.stopPropagation(); onMenuToggle(); }}
            style={{ background:"none", border:"none", color:SB, fontSize:18, cursor:"pointer", padding:"2px 6px", lineHeight:1 }}
          >
            ⋯
          </button>
          {menuOpen && (
            <div style={{
              position:"absolute", right:0, top:"100%", zIndex:50,
              background:S1, border:`1px solid ${BD}`, borderRadius:12,
              overflow:"hidden", minWidth:140,
              boxShadow:"0 8px 24px rgba(0,0,0,0.5)",
            }}>
              <button onClick={() => { onOpen(); onMenuToggle(); }}
                style={{ width:"100%", padding:"12px 16px", background:"none", border:"none", color:TX, fontSize:13, textAlign:"left", cursor:"pointer" }}>
                ✎ Edit
              </button>
              <button onClick={onDuplicate}
                style={{ width:"100%", padding:"12px 16px", background:"none", border:"none", borderTop:`1px solid ${BD}`, color:TX, fontSize:13, textAlign:"left", cursor:"pointer" }}>
                ⧉ Duplicate
              </button>
              <button onClick={onDelete}
                style={{ width:"100%", padding:"12px 16px", background:"none", border:"none", borderTop:`1px solid ${BD}`, color:RED, fontSize:13, textAlign:"left", cursor:"pointer" }}>
                🗑 Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ onNew }) {
  return (
    <div style={{ textAlign:"center", padding:"60px 20px" }}>
      <div style={{ fontSize:48, marginBottom:16 }}>📋</div>
      <div style={{ fontSize:17, fontWeight:800, color:TX, marginBottom:6 }}>No templates yet</div>
      <div style={{ fontSize:13, color:SB, marginBottom:24, lineHeight:1.5 }}>
        Create a routine once, assign to any athlete,<br/>update everyone with one tap.
      </div>
      <button
        onClick={onNew}
        style={{ padding:"13px 28px", background:A, border:"none", borderRadius:12, color:BG, fontSize:15, fontWeight:800, cursor:"pointer" }}
      >
        + Create your first template
      </button>
    </div>
  );
}
